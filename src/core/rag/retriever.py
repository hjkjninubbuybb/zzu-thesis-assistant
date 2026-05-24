"""检索器实现：向量检索 / BM25 / 混合 RRF 融合。

所有检索器实现 BaseRetriever 接口。
"""

import logging

import bm25s
import jieba
from bm25s.tokenization import Tokenizer as BM25Tokenizer

from src.config import get_config
from src.core.interfaces import BaseRetriever
from src.core.rag.embedding import get_embed_model
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)

# ── 语料缓存（BM25 需要全量语料建索引）─────────────────────────────

_corpus_cache: dict[str, list[dict]] = {}


def invalidate_corpus_cache(kb_name: str) -> None:
    """文档上传/删除后调用，清除对应知识库的 BM25 语料缓存。"""
    removed = _corpus_cache.pop(kb_name, None)
    if removed is not None:
        logger.info(
            "[corpus_cache] 已清除知识库 '%s' 的缓存（%d 节点）", kb_name, len(removed)
        )
    else:
        logger.debug("[corpus_cache] 知识库 '%s' 无缓存可清除", kb_name)


def fetch_corpus(kb_name: str, vector_store: VectorStore | None = None) -> list[dict]:
    """从 Qdrant 获取全量语料（用于 BM25 索引），按知识库名称缓存。"""
    if kb_name in _corpus_cache:
        logger.debug(
            "[corpus_cache] 命中: kb='%s', %d 节点",
            kb_name,
            len(_corpus_cache[kb_name]),
        )
        return _corpus_cache[kb_name]

    logger.info("[corpus_cache] 未命中，从 Qdrant 拉取: kb='%s'", kb_name)
    vs = vector_store or VectorStore()
    cfg = get_config()
    dim = cfg["embedding"]["dimension"]
    zero_vec = [0.0] * dim
    results = vs.search(kb_name, zero_vec, top_k=10000)
    corpus = [
        {
            "node_id": r.get("node_id", r["id"]),
            "text": r["text"],
            "file_name": r.get("file_name", ""),
        }
        for r in results
    ]
    _corpus_cache[kb_name] = corpus
    logger.info("[corpus_cache] 已缓存: kb='%s', %d 节点", kb_name, len(corpus))
    return corpus


# ── 向量检索器 ───────────────────────────────────────────────────


class VectorRetriever(BaseRetriever):
    """基于 Qdrant 的向量检索。"""

    def __init__(
        self, kb_name: str, top_k: int = 10, vector_store: VectorStore | None = None
    ):
        self.kb_name = kb_name
        self.top_k = top_k
        self._vs = vector_store or VectorStore()
        self._embed_model = get_embed_model(text_type="query")

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


# ── BM25 检索器 ──────────────────────────────────────────────────


class BM25Retriever(BaseRetriever):
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
        query_tokens = self._tokenizer.tokenize(
            [query], update_vocab=False, return_as="ids"
        )
        k = min(self.top_k, len(self.nodes))
        results, scores = self._bm25.retrieve(query_tokens, k=k)

        if not len(results) or not len(results[0]):
            return []

        out = []
        for idx, score in zip(results[0], scores[0]):
            idx = int(idx)
            if idx < 0 or idx >= len(self.nodes):
                continue
            node = self.nodes[idx]
            out.append(
                {
                    "node_id": node["node_id"],
                    "text": node["text"],
                    "score": float(score),
                    "source_file": node.get("file_name", ""),
                }
            )
        return out


# ── 混合检索器（RRF 融合）────────────────────────────────────────


class HybridRetriever(BaseRetriever):
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
        self._vector = VectorRetriever(
            kb_name, top_k=k_vector, vector_store=vector_store
        )
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
