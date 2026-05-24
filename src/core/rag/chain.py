"""检索链：将 QueryEnhancer → Retriever → Reranker 组装为一个整体。

实现 BaseRetrievalChain 接口，Agent 编排层只需注入一个 chain 即可。
"""

import logging

from src.core.interfaces import (
    BaseQueryEnhancer,
    BaseReranker,
    BaseRetrievalChain,
    BaseRetriever,
)
from src.core.rag.query_enhancer import protect_raw_candidates

logger = logging.getLogger(__name__)


class RetrievalChain(BaseRetrievalChain):
    """串联检索全流程：查询增强 → 混合检索 → 重排序 → 候选保护。"""

    def __init__(
        self,
        retriever: BaseRetriever,
        reranker: BaseReranker,
        query_enhancer: BaseQueryEnhancer,
        protect_n: int = 2,
        final_n: int = 5,
    ):
        self._retriever = retriever
        self._reranker = reranker
        self._query_enhancer = query_enhancer
        self._protect_n = protect_n
        self._final_n = final_n

    def retrieve(self, query: str) -> list[dict]:
        # 1. 查询增强
        enhanced = self._query_enhancer.enhance(query)
        logger.info("[chain] 查询增强: '%s' → '%s'", query[:50], enhanced[:80])

        # 2. 混合检索
        raw_nodes = self._retriever.retrieve(enhanced)
        logger.info("[chain] 检索到 %d 个候选片段", len(raw_nodes))

        if not raw_nodes:
            return []

        # 3. 重排序
        reranked = self._reranker.rerank(query, raw_nodes)
        logger.info("[chain] 重排后保留 %d 个片段", len(reranked))

        # 4. 候选保护（防止 reranker 丢失重要片段）
        final = protect_raw_candidates(
            raw_nodes,
            reranked,
            protect_n=self._protect_n,
            final_n=self._final_n,
        )
        return final
