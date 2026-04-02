"""混合检索：向量检索 + BM25，RRF 融合。"""

import logging
import os

import jieba
import bm25s
from bm25s.tokenization import Tokenizer as BM25Tokenizer
from llama_index.embeddings.dashscope import (
    DashScopeEmbedding,
    DashScopeTextEmbeddingModels,
)

from src.config import get_config, get_dashscope_api_key
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)


def _get_embed_model() -> DashScopeEmbedding:
    cfg = get_config()
    model_name = cfg["embedding"].get("model", "text-embedding-v3")
    model_map = {
        "text-embedding-v3": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3,
        "text-embedding-v2": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V2,
    }
    return DashScopeEmbedding(
        model_name=model_map.get(model_name, DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3),
        text_type="query",
        api_key=get_dashscope_api_key(),
    )


class VectorRetriever:
    """基于 Qdrant 的向量检索。"""

    def __init__(self, kb_name: str, top_k: int = 10, vector_store: VectorStore | None = None):
        self.kb_name = kb_name
        self.top_k = top_k
        self._vs = vector_store or VectorStore()
        self._embed_model = _get_embed_model()

    def retrieve(self, query: str) -> list[dict]:
        query_vector = self._embed_model.get_query_embedding(query)
        results = self._vs.search(self.kb_name, query_vector, top_k=self.top_k)
        return [
            {
                "node_id": r.get("node_id", r["id"]),
                "text": r["text"],
                "score": r["score"],
                "source_file": r.get("file_name", ""),
            }
            for r in results
        ]


class BM25Retriever:
    """基于 bm25s + jieba 的中文 BM25 检索。"""

    def __init__(self, nodes: list[dict], top_k: int = 10):
        self.nodes = nodes
        self.top_k = top_k

        self._tokenizer = BM25Tokenizer(
            splitter=lambda text: list(jieba.lcut(text)),
            stopwords="chinese",
            stemmer=None,
            lower=True,
        )
        corpus = [n["text"] for n in nodes]
        corpus_tokens = self._tokenizer.tokenize(corpus, return_as="ids")
        self._bm25 = bm25s.BM25()
        self._bm25.index(corpus_tokens)

    def retrieve(self, query: str) -> list[dict]:
        if not self.nodes:
            return []
        query_tokens = self._tokenizer.tokenize([query], update_vocab=False, return_as="ids")
        k = min(self.top_k, len(self.nodes))
        results, scores = self._bm25.retrieve(query_tokens, k=k)

        out = []
        for idx, score in zip(results[0], scores[0]):
            idx = int(idx)
            if idx < 0 or idx >= len(self.nodes):
                continue
            node = self.nodes[idx]
            out.append({
                "node_id": node["node_id"],
                "text": node["text"],
                "score": float(score),
                "source_file": node.get("file_name", ""),
            })
        return out


class HybridRetriever:
    """RRF 融合向量检索 + BM25 检索结果。"""

    def __init__(
        self,
        kb_name: str,
        corpus_nodes: list[dict],
        k_vector: int = 10,
        k_bm25: int = 10,
        k_total: int = 15,
        rrf_k: int = 60,
        vector_store: VectorStore | None = None,
    ):
        self._vector = VectorRetriever(kb_name, top_k=k_vector, vector_store=vector_store)
        self._bm25 = BM25Retriever(corpus_nodes, top_k=k_bm25)
        self.k_total = k_total
        self.rrf_k = rrf_k

    def retrieve(self, query: str) -> list[dict]:
        vec_results = self._vector.retrieve(query)
        bm25_results = self._bm25.retrieve(query)
        return self._rrf_fusion(vec_results, bm25_results)[: self.k_total]

    def _rrf_fusion(
        self, vec_results: list[dict], bm25_results: list[dict]
    ) -> list[dict]:
        scores: dict[str, tuple[float, dict]] = {}

        for rank, r in enumerate(vec_results):
            nid = r["node_id"]
            scores[nid] = (1 / (self.rrf_k + rank + 1), r)

        for rank, r in enumerate(bm25_results):
            nid = r["node_id"]
            rrf_score = 1 / (self.rrf_k + rank + 1)
            if nid in scores:
                old_score, old_r = scores[nid]
                scores[nid] = (old_score + rrf_score, old_r)
            else:
                scores[nid] = (rrf_score, r)

        sorted_items = sorted(scores.values(), key=lambda x: x[0], reverse=True)
        return [
            {"score": s, **{k: v for k, v in r.items() if k != "score"}}
            for s, r in sorted_items
        ]


def fetch_corpus(kb_name: str, vector_store: VectorStore | None = None) -> list[dict]:
    """从 Qdrant 获取 collection 的全量语料（用于 BM25 索引）。"""
    vs = vector_store or VectorStore()
    # 用零向量 + 大 top_k 获取所有向量（适合小规模知识库）
    cfg = get_config()
    dim = cfg["embedding"]["dimension"]
    zero_vec = [0.0] * dim
    results = vs.search(kb_name, zero_vec, top_k=10000)
    return [
        {
            "node_id": r.get("node_id", r["id"]),
            "text": r["text"],
            "file_name": r.get("file_name", ""),
        }
        for r in results
    ]
