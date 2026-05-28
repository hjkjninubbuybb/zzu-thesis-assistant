"""系统配置读写 + API Key 管理 + 连通性验证。"""

import logging
from typing import Any

import httpx
import yaml

from src.config import ROOT_DIR, get_api_base_url, get_api_key, get_config
from src.exceptions import StorageError
from src.services.base import BaseService
from src.storage.interfaces.settings_store import BaseSettingsStore

logger = logging.getLogger(__name__)

CONFIG_PATH = ROOT_DIR / "configs" / "config.yaml"

_ALLOWED_EMBED_MODELS = {"text-embedding-v2", "text-embedding-v3"}
_ALLOWED_LLM_MODELS = {
    "qwen-turbo",
    "qwen-plus",
    "qwen-max",
    "qwen-long",
    "deepseek-chat",
    "deepseek-reasoner",
}
_ALLOWED_RERANKER_MODELS = {"gte-rerank", "gte-rerank-hybrid"}


class ConfigService(BaseService):
    """系统配置：读写 config.yaml、管理 API Key、验证连通性。"""

    def __init__(self, settings_store: BaseSettingsStore) -> None:
        super().__init__()
        self._settings_store = settings_store

    def get_api_key_info(self) -> dict:
        """返回已配置 API 信息（脱敏显示）。

        Returns:
            包含 has_key、masked_key、api_base_url 字段的 dict。
        """
        key = get_api_key()
        url = get_api_base_url()
        if not key:
            return {"has_key": False, "masked_key": "", "api_base_url": url}
        masked = key[:3] + "****" + key[-4:] if len(key) > 7 else "****"
        return {"has_key": True, "masked_key": masked, "api_base_url": url}

    def update_api_key(self, api_key: str, api_base_url: str | None = None) -> dict:
        """更新 API Key 和 Base URL。

        Args:
            api_key: 新的 API Key。
            api_base_url: 新的 API Base URL（可选）。

        Returns:
            包含 message 和 has_key 字段的 dict。
        """
        self._settings_store.set_setting("api_key", api_key)
        if api_base_url:
            self._settings_store.set_setting("api_base_url", api_base_url)
        logger.info("LLM API 信息已更新")
        return {"message": "API 信息已更新", "has_key": True}

    async def test_api_connection(self) -> dict:
        """测试当前 API 配置是否有效（拉取模型列表）。

        Returns:
            包含 ok、message 字段的 dict；连接成功时额外包含 models 列表。
        """
        key = get_api_key()
        url = get_api_base_url()
        if not key or not url:
            return {"ok": False, "message": "未配置 API Key 或 Base URL"}
        try:
            models = await self._fetch_remote_models(url, key)
            return {"ok": True, "message": f"连接成功，发现 {len(models)} 个模型", "models": models}
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError) as e:
            logger.warning("[ConfigService.test_api_connection] 失败: %s", e)
            return {"ok": False, "message": f"连接失败: {e}"}

    async def list_available_models(self) -> list[str]:
        """动态拉取平台支持的模型列表，失败时返回默认列表。

        Returns:
            模型 ID 列表（已排序）。
        """
        key = get_api_key()
        url = get_api_base_url()
        if not key or not url:
            return sorted(_ALLOWED_LLM_MODELS)
        try:
            return await self._fetch_remote_models(url, key)
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError):
            return sorted(_ALLOWED_LLM_MODELS)

    def read_config(self) -> dict:
        """返回当前运行配置（已解析环境变量）。

        Returns:
            完整配置 dict。
        """
        return get_config()

    def update_config(self, updates: dict[str, Any]) -> dict:
        """将 updates 字段 merge 进 config.yaml 并清除缓存。

        Args:
            updates: 扁平化的更新字段 dict（由路由层从 Pydantic model 转换）。
                     支持的 key 见路由层的 ConfigUpdate 模型。

        Returns:
            更新后的配置 dict。

        Raises:
            ValueError: embedding_model 不在允许列表中。
            StorageError: 读取或写入 config.yaml 失败。
        """
        if "embedding_model" in updates and updates["embedding_model"] not in _ALLOWED_EMBED_MODELS:
            raise ValueError(
                f"不支持的 Embedding 模型 '{updates['embedding_model']}'，可选: {sorted(_ALLOWED_EMBED_MODELS)}"
            )

        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                raw: dict = yaml.safe_load(f) or {}
        except (OSError, yaml.YAMLError) as e:
            raise StorageError(f"读取配置文件失败: {e}") from e

        # LLM
        if updates.get("llm_base_url") is not None:
            raw.setdefault("llm", {})["api_base_url"] = updates["llm_base_url"]
        if updates.get("llm_model") is not None:
            raw.setdefault("llm", {})["model"] = updates["llm_model"]
        if updates.get("llm_fast_model") is not None:
            raw.setdefault("llm", {})["fast_model"] = updates["llm_fast_model"]
        if updates.get("embedding_model") is not None:
            raw.setdefault("embedding", {})["model"] = updates["embedding_model"]

        # Splitter
        if updates.get("splitter") is not None:
            sp = updates["splitter"]  # already a dict from Pydantic model
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

        # Retrieval
        for key_map, yaml_key in [
            ("vector_top_k", "vector_top_k"),
            ("bm25_top_k", "bm25_top_k"),
            ("hybrid_top_k", "hybrid_top_k"),
            ("rrf_k", "rrf_k"),
            ("query_enhance", "query_enhance"),
            ("protect_raw_top_n", "protect_raw_top_n"),
        ]:
            if updates.get(key_map) is not None:
                raw.setdefault("retrieval", {})[yaml_key] = updates[key_map]

        # Reranker
        if updates.get("reranker_model") is not None:
            raw.setdefault("reranker", {})["model"] = updates["reranker_model"]
        if updates.get("reranker_top_n") is not None:
            raw.setdefault("reranker", {})["top_n"] = updates["reranker_top_n"]

        # RAG
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

    @staticmethod
    async def _fetch_remote_models(url: str, key: str) -> list[str]:
        """从 OpenAI 兼容端点拉取模型列表。

        Args:
            url: API Base URL。
            key: API Key。

        Returns:
            模型 ID 列表（已排序）。

        Raises:
            httpx.HTTPStatusError: 请求返回非 2xx 状态码。
            httpx.TimeoutException: 请求超时。
        """
        endpoint = url.rstrip("/")
        if not endpoint.endswith("/models"):
            endpoint = f"{endpoint}/models"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(endpoint, headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
            return sorted([m["id"] for m in data.get("data", [])])
