"""系统配置读写 + 4 组 API 凭据管理 + 连通性验证。"""

import asyncio
import logging
from typing import Any

import httpx
import yaml

from src.config import (
    ROOT_DIR,
    get_config,
    get_embedding_credentials,
    get_fast_llm_credentials,
    get_llm_credentials,
    get_reranker_credentials,
)
from src.exceptions import StorageError
from src.services.base import BaseService
from src.storage.interfaces.settings_store import BaseSettingsStore

logger = logging.getLogger(__name__)

CONFIG_PATH = ROOT_DIR / "configs" / "config.yaml"

GROUPS = ("llm", "fast_llm", "embedding", "reranker")


def _load_credentials(group: str) -> tuple[str | None, str]:
    """按组名分派到对应的 getter（每次解析模块属性，便于测试 patch）。"""
    if group == "llm":
        return get_llm_credentials()
    if group == "fast_llm":
        return get_fast_llm_credentials()
    if group == "embedding":
        return get_embedding_credentials()
    if group == "reranker":
        return get_reranker_credentials()
    raise ValueError(f"未知模型组: {group}")


# group -> (yaml_section, model_field_name)
_GROUP_YAML_MODEL = {
    "llm": ("llm", "model"),
    "fast_llm": ("llm", "fast_model"),
    "embedding": ("embedding", "model"),
    "reranker": ("reranker", "model"),
}

# group -> (yaml_section, url_field_name)
_GROUP_YAML_URL = {
    "llm": ("llm", "api_base_url"),
    "fast_llm": ("llm", "fast_api_base_url"),
    "embedding": ("embedding", "api_base_url"),
    "reranker": ("reranker", "api_base_url"),
}


def _mask(key: str) -> str:
    if not key:
        return ""
    if len(key) > 7:
        return key[:3] + "****" + key[-4:]
    return "****"


class ConfigService(BaseService):
    """系统配置：读写 config.yaml、管理 4 组 API 凭据、验证连通性。"""

    def __init__(self, settings_store: BaseSettingsStore) -> None:
        super().__init__()
        self._settings_store = settings_store

    # ── credentials info ─────────────────────────────────────

    def get_api_info(self) -> dict:
        """返回 4 组凭据的脱敏信息（GET /config/api-info）。"""
        cfg = get_config()
        out: dict[str, Any] = {}
        for group in GROUPS:
            url, key = _load_credentials(group)
            yaml_section, model_field = _GROUP_YAML_MODEL[group]
            model = cfg.get(yaml_section, {}).get(model_field)
            out[group] = {
                "has_key": bool(key),
                "masked_key": _mask(key),
                "api_base_url": url,
                "model": model,
            }
        return out

    # ── test connection ──────────────────────────────────────

    async def test_all_connections(self) -> dict:
        """并发测试 4 组连接；返回每组的 {ok, message, models}。"""
        results = await asyncio.gather(
            *(self._test_group(g) for g in GROUPS),
            return_exceptions=False,
        )
        return dict(zip(GROUPS, results, strict=True))

    async def _test_group(self, group: str) -> dict:
        url, key = _load_credentials(group)
        if not url or not key:
            return {"ok": False, "message": "未配置 URL 或 Key", "models": []}
        try:
            models = await self._fetch_remote_models(url, key)
            return {"ok": True, "message": f"连接成功，发现 {len(models)} 个模型", "models": models}
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError) as e:
            logger.warning("[ConfigService.test_group:%s] 失败: %s", group, e)
            return {"ok": False, "message": f"连接失败: {e}", "models": []}

    # ── config read/write ────────────────────────────────────

    def read_config(self) -> dict:
        return get_config()

    def update_config(self, updates: dict[str, Any]) -> dict:
        """落库 4 组凭据 + 其他参数。

        Args:
            updates: 字典，支持以下键：
                - llm / fast_llm / embedding / reranker:
                    {api_base_url?, api_key?, model?}
                    其中 api_key == "" 表示保留原值。
                - splitter, vector_top_k, ..., agent_retry_count（其他参数）。

        Returns:
            清缓存后重新加载的 config dict。
        """
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                raw: dict = yaml.safe_load(f) or {}
        except (OSError, yaml.YAMLError) as e:
            raise StorageError(f"读取配置文件失败: {e}") from e

        # ── per-group credentials ────────────────────────────
        for group in GROUPS:
            grp = updates.get(group)
            if not grp:
                continue
            yaml_section_url, url_field = _GROUP_YAML_URL[group]
            yaml_section_model, model_field = _GROUP_YAML_MODEL[group]

            if grp.get("api_base_url") is not None:
                raw.setdefault(yaml_section_url, {})[url_field] = grp["api_base_url"]
                self._settings_store.set_setting(f"{group}_api_base_url", grp["api_base_url"])

            if grp.get("api_key"):  # 空字符串视为不修改
                self._settings_store.set_setting(f"{group}_api_key", grp["api_key"])

            if grp.get("model") is not None:
                raw.setdefault(yaml_section_model, {})[model_field] = grp["model"]

        # ── splitter ─────────────────────────────────────────
        if updates.get("splitter") is not None:
            sp = updates["splitter"]
            sp_raw = raw.setdefault("splitter", {})
            if sp.get("strategy") is not None:
                sp_raw["strategy"] = sp["strategy"]
            for field in ("chunk_size", "chunk_overlap_ratio", "buffer_size", "breakpoint_percentile_threshold"):
                if sp.get(field) is not None:
                    sp_raw[field] = sp[field]
            for doc_type in ("policy", "manual", "form"):
                dt_cfg = sp.get(doc_type)
                if dt_cfg is None:
                    continue
                node = sp_raw.setdefault(doc_type, {})
                if dt_cfg.get("splitter_type") is not None:
                    node["type"] = dt_cfg["splitter_type"]
                for field in ("chunk_size", "chunk_overlap_ratio", "enable_cleaning"):
                    if dt_cfg.get(field) is not None:
                        node[field] = dt_cfg[field]

        # ── retrieval ────────────────────────────────────────
        for key_map in (
            "vector_top_k",
            "bm25_top_k",
            "hybrid_top_k",
            "rrf_k",
            "query_enhance",
            "protect_raw_top_n",
        ):
            if updates.get(key_map) is not None:
                raw.setdefault("retrieval", {})[key_map] = updates[key_map]

        # ── reranker top_n ───────────────────────────────────
        if updates.get("reranker_top_n") is not None:
            raw.setdefault("reranker", {})["top_n"] = updates["reranker_top_n"]

        # ── rag ──────────────────────────────────────────────
        for key_map in ("max_reformulations", "agent_recursion_limit", "agent_retry_count"):
            if updates.get(key_map) is not None:
                raw.setdefault("rag", {})[key_map] = updates[key_map]

        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                yaml.dump(raw, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
        except OSError as e:
            raise StorageError("写入配置失败，请检查文件权限") from e

        get_config.cache_clear()
        logger.info("config.yaml 已更新并清除缓存")
        return get_config()

    # ── helpers ──────────────────────────────────────────────

    @staticmethod
    async def _fetch_remote_models(url: str, key: str) -> list[str]:
        endpoint = url.rstrip("/")
        if not endpoint.endswith("/models"):
            endpoint = f"{endpoint}/models"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(endpoint, headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
            return sorted([m["id"] for m in data.get("data", [])])
