"""FAQ 防线接口。"""

from __future__ import annotations

from abc import ABC, abstractmethod


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
