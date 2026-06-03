"""DashScope Embedding 封装，实现 BaseEmbedder 接口。"""

from llama_index.embeddings.dashscope import (
    DashScopeEmbedding,
    DashScopeTextEmbeddingModels,
)

from src.config import get_api_key, get_config
from src.core.interfaces import BaseEmbedder

_MODEL_MAP = {
    "text-embedding-v3": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3,
    "text-embedding-v2": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V2,
}


class DashScopeEmbedder(BaseEmbedder):
    """DashScope Embedding 实现。"""

    def __init__(self, text_type: str = "document"):
        cfg = get_config()
        model_name = cfg["embedding"].get("model", "text-embedding-v3")
        embed_batch_size = cfg["embedding"].get("embed_batch_size", 10)
        self._model = DashScopeEmbedding(
            model_name=_MODEL_MAP.get(model_name, DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3),
            text_type=text_type,
            api_key=get_api_key(),
            embed_batch_size=embed_batch_size,
        )

    def embed_query(self, text: str) -> list[float]:
        return self._model.get_query_embedding(text)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._model.get_text_embedding(t) for t in texts]


def get_embed_model(text_type: str = "document") -> DashScopeEmbedding:
    """兼容旧接口的工厂函数，返回原始 LlamaIndex 对象。"""
    cfg = get_config()
    model_name = cfg["embedding"].get("model", "text-embedding-v3")
    embed_batch_size = cfg["embedding"].get("embed_batch_size", 10)
    return DashScopeEmbedding(
        model_name=_MODEL_MAP.get(model_name, DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3),
        text_type=text_type,
        api_key=get_api_key(),
        embed_batch_size=embed_batch_size,
    )
