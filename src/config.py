"""配置加载：从 .env 和 config.yaml 读取全局配置。"""

import os
from pathlib import Path
from functools import lru_cache

import yaml
from dotenv import load_dotenv

# 项目根目录
ROOT_DIR = Path(__file__).resolve().parent.parent

# 加载 .env
load_dotenv(ROOT_DIR / ".env")


def _resolve_env_vars(value: str) -> str:
    """解析 ${VAR:-default} 格式的环境变量。"""
    if not isinstance(value, str) or "${" not in value:
        return value
    import re
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
    return os.environ.get("DASHSCOPE_API_KEY", "")
