"""生成侧抽象接口。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Generator
from dataclasses import dataclass, field
from typing import Literal


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
        """流式执行，产出事件流。"""
