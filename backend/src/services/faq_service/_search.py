"""FAQ 语义搜索 Mixin：向量相似度 + 关键词并集。"""

import logging

from dashscope.common.error import DashScopeException

from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.vector_store import VectorStore, VectorStoreError


class SearchMixin:
    """FAQ 语义搜索方法集合。"""

    _faq_store: FAQStore
    _kb_store: KBStore
    _vector_store: VectorStore
    logger: logging.Logger

    def _require_kb(self, kb_name: str) -> None: ...  # 由 FAQService 实现

    def search(self, kb_name: str, query: str, top_k: int = 10, score_threshold: float = 0.4) -> dict:
        """混合搜索：向量相似度 + MySQL 关键词并集，结果去重后合并。

        向量命中（score >= score_threshold）排前，纯关键词命中排后。
        不过滤 status / enabled，管理端可见全部状态。

        Args:
            kb_name: 知识库名称。
            query: 搜索词，直接 embed，不经 LLM 改写。
            top_k: 向量搜索最多返回候选数。
            score_threshold: 向量相关性门槛（默认 0.4）。

        Returns:
            {"items": [...向量结果(score 有值), ...纯文本结果(score=None)]}

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            RuntimeError: 向量化或向量检索失败。
        """
        self._require_kb(kb_name)

        from src.core.rag.embedding import get_embed_model  # late import to avoid heavy startup cost

        try:
            embed_model = get_embed_model(text_type="query")
            vector: list[float] = embed_model.get_text_embedding(query)
        except (ValueError, RuntimeError, DashScopeException) as e:
            self.logger.warning("[FAQService] search embed 失败: %s", e)
            raise RuntimeError("查询向量化失败，请稍后重试") from e

        try:
            hits = self._vector_store.search(kb_name, vector, top_k, score_threshold, {"source_type": "faq"})
        except VectorStoreError as e:
            self.logger.warning("[FAQService] search Qdrant 失败: %s", e)
            raise RuntimeError("向量检索失败，请稍后重试") from e

        # 向量结果：回查 MySQL 获取完整行，不过滤 status/enabled
        vector_items: list[dict] = []
        vector_ids: set[int] = set()
        for hit in hits:
            faq_id = hit.get("faq_id")
            if not isinstance(faq_id, int) or faq_id in vector_ids:
                continue
            row = self._faq_store.get_faq(faq_id)
            if row and row["kb_name"] == kb_name:
                vector_items.append({**row, "score": hit["score"]})
                vector_ids.add(faq_id)

        # 文本结果：去掉已在向量结果中的，score=None
        text_rows = self._faq_store.search_by_text(kb_name, query)
        text_items = [{**row, "score": None} for row in text_rows if row["id"] not in vector_ids]

        return {"items": vector_items + text_items}
