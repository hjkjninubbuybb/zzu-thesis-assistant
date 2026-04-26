"""配置加载：从 config.yaml 读取全局配置。"""

import logging
import os
import re
from pathlib import Path
from functools import lru_cache

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


@lru_cache()
def get_config() -> dict:
    """加载并返回全局配置。"""
    config_path = ROOT_DIR / "configs" / "config.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return _resolve_dict(raw)


def get_dashscope_api_key() -> str:
    """获取 DashScope API Key（数据库 system_settings 表，回退环境变量）。"""
    try:
        from src.storage.document_store import DocumentStore
        ds = DocumentStore()
        key = ds.get_setting("dashscope_api_key")
        if key:
            return key
    except Exception:
        logger.debug("[config] 无法从数据库读取 API Key，回退环境变量")
    return os.environ.get("DASHSCOPE_API_KEY", "")
