"""LLM 工厂 —— 统一创建 OpenAI 兼容模型实例。

统一创建 LLM 实例，避免各模块重复构造。
"""

from langchain_openai import ChatOpenAI

from src.config import get_api_base_url, get_api_key, get_config


def get_llm(fast: bool = False, streaming: bool = True) -> ChatOpenAI:
    """获取通用的 OpenAI 兼容模型实例。

    Args:
        fast: True 使用快速模型（qwen-turbo），False 使用强能力模型（qwen-plus）
        streaming: 是否启用流式输出
    """
    cfg = get_config()
    key = get_api_key()
    url = get_api_base_url()

    if fast:
        model_name = cfg.get("llm", {}).get("fast_model", "qwen-turbo")
    else:
        model_name = cfg.get("llm", {}).get("model", "qwen-plus")

    return ChatOpenAI(
        model=model_name,
        openai_api_key=key,
        openai_api_base=url,
        streaming=streaming,
    )
