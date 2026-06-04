"""LLM 工厂 —— 统一创建 OpenAI 兼容模型实例。"""

from langchain_openai import ChatOpenAI

from src.config import get_config, get_fast_llm_credentials, get_llm_credentials


def get_llm(fast: bool = False, streaming: bool = True) -> ChatOpenAI:
    """获取通用的 OpenAI 兼容模型实例。

    Args:
        fast: True 使用快速模型组的凭据（qwen-turbo 等）；False 使用推理型组（qwen-plus 等）。
        streaming: 是否启用流式输出。
    """
    cfg = get_config()
    if fast:
        url, key = get_fast_llm_credentials()
        model_name = cfg.get("llm", {}).get("fast_model", "qwen-turbo")
    else:
        url, key = get_llm_credentials()
        model_name = cfg.get("llm", {}).get("model", "qwen-plus")

    return ChatOpenAI(
        model=model_name,
        openai_api_key=key,
        openai_api_base=url,
        streaming=streaming,
    )
