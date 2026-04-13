"""DashScope Embedding 工厂函数（统一入口，避免重复定义）。"""

from llama_index.embeddings.dashscope import (
    DashScopeEmbedding,
    DashScopeTextEmbeddingModels,
)

from src.config import get_config, get_dashscope_api_key

_MODEL_MAP = {
    "text-embedding-v3": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3,
    "text-embedding-v2": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V2,
}


def get_embed_model(text_type: str = "document") -> DashScopeEmbedding:
    """创建 DashScope Embedding 模型实例。

    Args:
        text_type: "document"（入库时使用）或 "query"（检索时使用）
    """
    cfg = get_config()
    model_name = cfg["embedding"].get("model", "text-embedding-v3")
    embed_batch_size = cfg["embedding"].get("embed_batch_size", 10)
    return DashScopeEmbedding(
        model_name=_MODEL_MAP.get(model_name, DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3),
        text_type=text_type,
        api_key=get_dashscope_api_key(),
        embed_batch_size=embed_batch_size,
    )
