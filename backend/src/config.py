"""配置加载：从 config.yaml 读取全局配置。"""

import logging
import os
import re
from functools import lru_cache
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

# 项目根目录
ROOT_DIR = Path(__file__).resolve().parent.parent


def _resolve_env_vars(value: str) -> str:
    """解析 ${VAR:-default} 格式的环境变量。"""
    if not isinstance(value, str) or "${" not in value:
        return value
    pattern = r"\$\{(\w+)(?::-(.*?))?\}"

    def replacer(m):
        var_name, default = m.group(1), m.group(2) or ""
        return os.environ.get(var_name, default)

    return re.sub(pattern, replacer, value)


def _resolve_dict(d: dict) -> dict:
    """递归解析字典中的环境变量。"""
    result = {}
    for k, v in d.items():
        if isinstance(v, dict):
            result[k] = _resolve_dict(v)
        elif isinstance(v, str):
            result[k] = _resolve_env_vars(v)
        else:
            result[k] = v
    return result


@lru_cache
def get_config() -> dict:
    """加载并返回全局配置。"""
    config_path = ROOT_DIR / "configs" / "config.yaml"
    with open(config_path, encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return _resolve_dict(raw)


def _credential_pair(
    group: str,
    yaml_section: str,
    yaml_url_field: str,
    env_url: str,
    env_key: str,
) -> tuple[str | None, str]:
    """读取某模型组的 (api_base_url, api_key)。

    查找顺序：system_settings DB → 环境变量 → config.yaml。
    """
    url: str | None = None
    key: str | None = None
    try:
        from src.storage.settings_store import SettingsStore

        store = SettingsStore()
        url = store.get_setting(f"{group}_api_base_url")
        key = store.get_setting(f"{group}_api_key")
    except (ImportError, OSError, RuntimeError) as e:
        logger.debug("[config] settings_store 不可用 (%s): %s", group, e)

    if not url:
        cfg = get_config()
        url = cfg.get(yaml_section, {}).get(yaml_url_field) or os.environ.get(env_url)
    if not key:
        key = os.environ.get(env_key, "")
    return url, key


def get_llm_credentials() -> tuple[str | None, str]:
    """推理型 LLM（qwen-plus 等）。"""
    return _credential_pair("llm", "llm", "api_base_url", "LLM_API_BASE_URL", "LLM_API_KEY")


def get_fast_llm_credentials() -> tuple[str | None, str]:
    """快速 LLM（qwen-turbo 等）。"""
    return _credential_pair("fast_llm", "llm", "fast_api_base_url", "FAST_LLM_API_BASE_URL", "FAST_LLM_API_KEY")


def get_embedding_credentials() -> tuple[str | None, str]:
    """向量模型。"""
    return _credential_pair("embedding", "embedding", "api_base_url", "EMBEDDING_API_BASE_URL", "EMBEDDING_API_KEY")


def get_reranker_credentials() -> tuple[str | None, str]:
    """重排序模型。"""
    return _credential_pair("reranker", "reranker", "api_base_url", "RERANKER_API_BASE_URL", "RERANKER_API_KEY")
