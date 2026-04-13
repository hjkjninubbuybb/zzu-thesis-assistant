"""DashScope Reranker 封装。"""

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from llama_index.core.schema import NodeWithScore, TextNode, QueryBundle
from llama_index.postprocessor.dashscope_rerank import DashScopeRerank

logger = logging.getLogger(__name__)

RERANK_BATCH_SIZE = 5  # 每个并行批次的 chunk 数量


class Reranker:
    """DashScope gte-rerank 重排序，批次并行提速。"""

    def __init__(self, model: str = "gte-rerank", top_n: int = 5):
        self._top_n = top_n
        self._model = model
        self._api_key = os.environ.get("DASHSCOPE_API_KEY")

    def _make_reranker(self, top_n: int) -> DashScopeRerank:
        return DashScopeRerank(top_n=top_n, model=self._model, api_key=self._api_key)

    def _rerank_batch(self, query: str, batch: list[dict]) -> list[dict]:
        """对单个批次调用 reranker API，返回带分数的结果。"""
        nws_list = [
            NodeWithScore(
                node=TextNode(
                    text=n["text"],
                    id_=n["node_id"],
                    metadata={"file_name": n.get("source_file", "")},
                ),
                score=n.get("score", 0.0),
            )
            for n in batch
        ]
        reranker = self._make_reranker(top_n=len(batch))  # 批次内全部返回，最后再全局截断
        reranked = reranker.postprocess_nodes(
            nws_list, query_bundle=QueryBundle(query_str=query)
        )
        return [
            {
                "node_id": r.node.node_id,
                "text": r.node.get_content(),
                "score": r.score,
                "source_file": r.node.metadata.get("file_name", ""),
            }
            for r in reranked
        ]

    def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
        if not nodes:
            return []
        if not query.strip():
            return nodes

        # 拆分批次
        batches = [
            nodes[i: i + RERANK_BATCH_SIZE]
            for i in range(0, len(nodes), RERANK_BATCH_SIZE)
        ]

        try:
            all_results: list[dict] = []
            if len(batches) == 1:
                # 只有一批，直接调用，不用线程池开销
                all_results = self._rerank_batch(query, batches[0])
            else:
                # 多批并行
                with ThreadPoolExecutor(max_workers=len(batches)) as executor:
                    futures = {
                        executor.submit(self._rerank_batch, query, batch): batch
                        for batch in batches
                    }
                    for future in as_completed(futures):
                        try:
                            all_results.extend(future.result())
                        except Exception as e:
                            logger.warning("[reranker] 批次 rerank 失败，跳过: %s", e)

            if not all_results:
                logger.warning("[reranker] 所有批次均失败，返回原始顺序")
                return nodes[: self._top_n]

            # 全局按分数降序，取 top_n
            all_results.sort(key=lambda x: x["score"], reverse=True)
            return all_results[: self._top_n]

        except Exception as e:
            logger.warning("[reranker] Rerank 失败，返回原始顺序: %s", e)
            return nodes[: self._top_n]
