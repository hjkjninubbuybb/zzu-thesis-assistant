"""DashScope Reranker 封装。"""

import os

from llama_index.core.schema import NodeWithScore, TextNode, QueryBundle
from llama_index.postprocessor.dashscope_rerank import DashScopeRerank


class Reranker:
    """DashScope gte-rerank 重排序。"""

    def __init__(self, model: str = "gte-rerank", top_n: int = 5):
        self._reranker = DashScopeRerank(
            top_n=top_n,
            model=model,
            api_key=os.environ.get("DASHSCOPE_API_KEY"),
        )

    def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
        if not nodes:
            return []

        nws_list = [
            NodeWithScore(
                node=TextNode(
                    text=n["text"],
                    id_=n["node_id"],
                    metadata={"file_name": n.get("source_file", "")},
                ),
                score=n.get("score", 0.0),
            )
            for n in nodes
        ]

        reranked = self._reranker.postprocess_nodes(
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
