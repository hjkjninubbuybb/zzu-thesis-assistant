"""文本切分器，基于 LlamaIndex，适配中文 Markdown。

支持 5 种切分策略：
- ``recursive``：RecursiveCharacterTextSplitter（默认，实验最优）
- ``token``：按 token 数量固定分割
- ``sentence``：按句子边界分割（中文优化）
- ``semantic``：基于 embedding 语义相似度自适应分割
- ``manual_step``：操作手册步骤级分割（结构解析 + LLM 语义抽取）
"""

import re
from abc import ABC, abstractmethod

from langchain_text_splitters import RecursiveCharacterTextSplitter
from llama_index.core.node_parser import SentenceSplitter, TokenTextSplitter
from llama_index.core.schema import BaseNode, Document, TextNode

# 中文 Markdown 分隔符层级
CHINESE_MARKDOWN_SEPARATORS = [
    "\n#{1,6} ",
    "\n\n",
    "\n",
    "。",
    "！",
    "？",
    "；",
    "，",
    " ",
    "",
]

CHINESE_CHUNKING_REGEX = "[^,.;。？！，；]+[,.;。？！，；]?"


def _chinese_sentence_tokenize(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？；\!\?\;])", text)
    return [p for p in parts if p.strip()]


class BaseSplitter(ABC):
    @abstractmethod
    def split(self, documents: list[Document]) -> list[BaseNode]: ...


class RecursiveSplitter(BaseSplitter):
    """RecursiveCharacterTextSplitter，最佳策略 (chunk=256, overlap=20%)。"""

    def __init__(self, chunk_size: int = 256, chunk_overlap_ratio: float = 0.2, **_kw):
        chunk_overlap = int(chunk_size * chunk_overlap_ratio)
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=CHINESE_MARKDOWN_SEPARATORS,
            is_separator_regex=True,
            keep_separator=True,
        )

    def split(self, documents: list[Document]) -> list[BaseNode]:
        nodes: list[BaseNode] = []
        for doc in documents:
            chunks = self._splitter.split_text(doc.text)
            for chunk in chunks:
                node = TextNode(text=chunk, metadata=doc.metadata.copy())
                nodes.append(node)
        return nodes


class TokenSplitter(BaseSplitter):
    """按 token 数量固定分割。"""

    def __init__(self, chunk_size: int = 256, chunk_overlap_ratio: float = 0.2, **_kw):
        chunk_overlap = int(chunk_size * chunk_overlap_ratio)
        self._splitter = TokenTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

    def split(self, documents: list[Document]) -> list[BaseNode]:
        return self._splitter.get_nodes_from_documents(documents)


class SentenceSplitterWrapper(BaseSplitter):
    """SentenceSplitter，针对中文文档优化。"""

    def __init__(self, chunk_size: int = 256, chunk_overlap_ratio: float = 0.2, **_kw):
        chunk_overlap = int(chunk_size * chunk_overlap_ratio)
        self._splitter = SentenceSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            paragraph_separator="\n\n",
            chunking_tokenizer_fn=_chinese_sentence_tokenize,
            secondary_chunking_regex=CHINESE_CHUNKING_REGEX,
        )

    def split(self, documents: list[Document]) -> list[BaseNode]:
        return self._splitter.get_nodes_from_documents(documents)


class SemanticSplitter(BaseSplitter):
    """基于 embedding 语义相似度自适应分割。

    不依赖固定 chunk_size，而是通过句间相似度变化检测自然断点。
    """

    def __init__(
        self,
        chunk_size: int = 256,
        chunk_overlap_ratio: float = 0.2,
        *,
        buffer_size: int = 2,
        breakpoint_percentile_threshold: int = 90,
        **_kw,
    ):
        self._buffer_size = buffer_size
        self._breakpoint_percentile_threshold = breakpoint_percentile_threshold

    def split(self, documents: list[Document]) -> list[BaseNode]:
        from llama_index.core.node_parser import SemanticSplitterNodeParser

        from src.core.rag.embedding import get_embed_model

        splitter = SemanticSplitterNodeParser(
            embed_model=get_embed_model("document"),
            buffer_size=self._buffer_size,
            breakpoint_percentile_threshold=self._breakpoint_percentile_threshold,
            sentence_splitter=_chinese_sentence_tokenize,
        )
        return splitter.get_nodes_from_documents(documents)


def _get_manual_step_splitter():
    """延迟导入 ManualStepSplitter，避免循环引用。"""
    from src.core.preprocessing.splitter_manual import ManualStepSplitter

    return ManualStepSplitter


SPLITTER_TYPES: dict[str, type[BaseSplitter]] = {
    "recursive": RecursiveSplitter,
    "token": TokenSplitter,
    "sentence": SentenceSplitterWrapper,
    "semantic": SemanticSplitter,
}


def create_splitter(
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    **kwargs,
) -> BaseSplitter:
    """创建切分器实例。

    Args:
        splitter_type: 切分器类型名称。
        chunk_size: 块大小。
        chunk_overlap_ratio: 重叠比例。
        **kwargs: 切分器特有参数（如 ``use_llm``、``buffer_size``）。
    """
    if splitter_type == "manual_step":
        cls = _get_manual_step_splitter()
    else:
        cls = SPLITTER_TYPES.get(splitter_type, RecursiveSplitter)
    return cls(chunk_size=chunk_size, chunk_overlap_ratio=chunk_overlap_ratio, **kwargs)
