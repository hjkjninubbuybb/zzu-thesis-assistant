"""核心抽象接口 —— RAG 流与 Agent 流的所有节点契约。

RAG 流（检索侧）:
    QueryEnhancer → Retriever → Reranker

Agent 流（推理侧）:
    Router → DocumentGrader → QueryRewriter → Generator → SafetyGuard

数据流经 dataclass 在节点间传递，节点只依赖接口，不依赖具体实现。
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Generator
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════════
#  数据类 —— 节点间传递的结构化数据
# ════════════════════════════════════════════════════════════════════════════


@dataclass
class RetrievedNode:
    """检索到的单个文档片段。"""

    text: str
    score: float = 0.0
    node_id: str = ""
    source_file: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class RouteResult:
    """Router 节点的输出。"""

    decision: Literal["hard_rag", "direct", "download"]
    tasks: list[str] = field(default_factory=list)
    file_hint: str = ""


@dataclass
class GradeResult:
    """DocumentGrader 节点的输出。"""

    is_relevant: bool
    reason: str = ""


@dataclass
class GenerationResult:
    """完整 RAG 流程的最终输出。"""

    text: str
    nodes: list[dict] = field(default_factory=list)
    file_events: list[dict] = field(default_factory=list)
    safety_guards: list[str] = field(default_factory=list)
    attempts: int = 1


# ════════════════════════════════════════════════════════════════════════════
#  RAG 流接口 —— 检索侧
# ════════════════════════════════════════════════════════════════════════════


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
    """检索链接口：串联 QueryEnhancer → Retriever → Reranker 为一个整体。

    Agent 编排层只需注入一个 RetrievalChain，不用关心内部检索细节。
    """

    @abstractmethod
    def retrieve(self, query: str) -> list[dict]:
        """执行完整检索链：增强查询 → 混合检索 → 重排序 → 候选保护。

        Returns:
            排序后的候选片段列表
        """


# ════════════════════════════════════════════════════════════════════════════
#  Agent 流接口 —— 推理侧
# ════════════════════════════════════════════════════════════════════════════


class BaseRouter(ABC):
    """意图路由器：判断查询走哪条处理路径。"""

    @abstractmethod
    def route(self, query: str, kb_name: str, doc_summaries: list[dict]) -> RouteResult:
        """分析查询意图并拆解子任务。

        Args:
            query: 用户查询
            kb_name: 当前知识库名
            doc_summaries: 知识库文档摘要列表 [{"file_name", "summary"}, ...]

        Returns:
            RouteResult(decision, tasks, file_hint)
        """


class BaseDocumentGrader(ABC):
    """文档评估器 (CRAG)：判断检索片段是否足以回答问题。"""

    @abstractmethod
    def grade(self, query: str, nodes: list[dict]) -> GradeResult:
        """评估检索片段与查询的相关性。

        Args:
            query: 用户查询
            nodes: 候选片段列表

        Returns:
            GradeResult(is_relevant, reason)
        """


class BaseQueryRewriter(ABC):
    """查询重写器 (CRAG)：检索失败时改写查询词。"""

    @abstractmethod
    def rewrite(self, query: str, original_query: str = "") -> str:
        """重写查询词以扩大召回范围。

        Args:
            query: 当前查询词（可能已经被改写过）
            original_query: 用户原始查询（可选，供上下文参考）

        Returns:
            改写后的查询词
        """


class BaseGenerator(ABC):
    """答案生成器：基于上下文生成最终回答。"""

    @abstractmethod
    def generate(
        self,
        query: str,
        context_nodes: list[dict],
        kb_name: str,
        history: list | None = None,
        route_decision: str = "direct",
        is_relevant: bool = True,
    ) -> str:
        """同步生成完整回答。"""

    @abstractmethod
    def stream(
        self,
        query: str,
        context_nodes: list[dict],
        kb_name: str,
        history: list | None = None,
        route_decision: str = "direct",
        is_relevant: bool = True,
    ) -> Generator[str, None, None]:
        """流式生成回答，逐 token 产出。"""


class BaseSafetyGuard(ABC):
    """安全护栏：在生成后拦截高频错误答案。"""

    @abstractmethod
    def check(self, query: str, generation: str) -> tuple[str, list[str]]:
        """检查并可能替换生成结果。

        Args:
            query: 用户查询
            generation: LLM 生成的原始回答

        Returns:
            (最终回答, 触发的规则名列表)
        """


class BaseDocumentLinker(ABC):
    """文件下载链接器：匹配用户想要的文件并生成下载卡片。"""

    @abstractmethod
    def link(self, file_hint: str, kb_name: str) -> list[dict]:
        """根据文件关键词匹配文件并返回下载信息。

        Args:
            file_hint: 文件名关键词
            kb_name: 知识库名

        Returns:
            [{"file_name", "url", "size_kb"}, ...]
        """


class BaseFAQMatcher(ABC):
    """FAQ 防线：语义匹配 FAQ → 快速生成 → 不足则 fallback。"""

    @abstractmethod
    def match(self, query: str, kb_name: str) -> list[dict] | None:
        """语义搜索 FAQ 库，返回命中条目或 None。

        Returns:
            命中: [{"question", "answer", "score", "faq_id"}, ...]
            未命中: None
        """

    @abstractmethod
    def generate_answer(self, query: str, faq_results: list[dict]) -> str | None:
        """基于 FAQ 生成回答，返回 None 表示需降级到 RAG。"""


# ════════════════════════════════════════════════════════════════════════════
#  编排层接口 —— 将 RAG 流 + Agent 流组装为完整管道
# ════════════════════════════════════════════════════════════════════════════


class BaseRAGPipeline(ABC):
    """完整 RAG Agent 管道接口。"""

    @abstractmethod
    def run(
        self,
        query: str,
        kb_name: str,
        history: list | None = None,
    ) -> GenerationResult:
        """同步执行完整 RAG 流程。"""

    @abstractmethod
    def stream(
        self,
        query: str,
        kb_name: str,
        history: list | None = None,
    ) -> Generator[dict, None, None]:
        """流式执行，产出事件流。

        Yields:
            {"type": "agent_action", "tool": ..., "input": ...}
            {"type": "token", "content": ...}
            {"type": "file", "file_name": ..., "url": ..., "size_kb": ...}
            {"type": "sources", "nodes": [...]}
            {"type": "suggestions", "items": [...]}
            {"type": "error", "message": ...}
        """
