"""检索侧抽象接口。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class RetrievedNode:
    """检索到的单个文档片段。"""

    text: str
    score: float = 0.0
    node_id: str = ""
    source_file: str = ""
    metadata: dict = field(default_factory=dict)


class BaseEmbedder(ABC):
    """向量嵌入模型接口。"""

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        """将查询文本编码为向量。"""

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """批量编码文档文本。"""


class BaseRetriever(ABC):
    """检索器接口（向量 / BM25 / 混合）。"""

    @abstractmethod
    def retrieve(self, query: str) -> list[dict]:
        """根据查询返回候选片段列表。

        Returns:
            [{"node_id", "text", "score", "source_file", ...}, ...]
        """


class BaseReranker(ABC):
    """重排序器接口。"""

    @abstractmethod
    def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
        """对候选片段重新打分排序。

        Args:
            query: 用户查询
            nodes: 检索返回的候选片段

        Returns:
            重排后的片段列表（保留 top_n）
        """


class BaseQueryEnhancer(ABC):
    """查询增强器接口（规则扩写 / LLM 改写）。"""

    @abstractmethod
    def enhance(self, query: str) -> str:
        """增强查询词以提升召回率。"""


class BaseRetrievalChain(ABC):
    """检索链接口：串联 QueryEnhancer → Retriever → Reranker 为一个整体。"""

    @abstractmethod
    def retrieve(self, query: str) -> list[dict]:
        """执行完整检索链：增强查询 → 混合检索 → 重排序 → 候选保护。

        Returns:
            排序后的候选片段列表
        """
