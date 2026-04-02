"""文本切分器，基于 LlamaIndex，适配中文 Markdown。"""

import re
from abc import ABC, abstractmethod

from langchain_text_splitters import RecursiveCharacterTextSplitter
from llama_index.core.node_parser import TokenTextSplitter, SentenceSplitter
from llama_index.core.schema import BaseNode, Document, TextNode

# 中文 Markdown 分隔符层级
CHINESE_MARKDOWN_SEPARATORS = [
    "\n#{1,6} ",
    "\n\n",
    "\n",
    "。", "！", "？", "；", "，", " ", "",
]

CHINESE_CHUNKING_REGEX = "[^,.;。？！，；]+[,.;。？！，；]?"


def _chinese_sentence_tokenize(text: str) -> list[str]:
    parts = re.split(r'(?<=[。！？；\!\?\;])', text)
    return [p for p in parts if p.strip()]


class BaseSplitter(ABC):
    @abstractmethod
    def split(self, documents: list[Document]) -> list[BaseNode]:
        ...


class RecursiveSplitter(BaseSplitter):
    """RecursiveCharacterTextSplitter，最佳策略 (chunk=256, overlap=20%)。"""

    def __init__(self, chunk_size: int = 256, chunk_overlap_ratio: float = 0.2):
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

    def __init__(self, chunk_size: int = 256, chunk_overlap_ratio: float = 0.2):
        chunk_overlap = int(chunk_size * chunk_overlap_ratio)
        self._splitter = TokenTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

    def split(self, documents: list[Document]) -> list[BaseNode]:
        return self._splitter.get_nodes_from_documents(documents)


class SentenceSplitterWrapper(BaseSplitter):
    """SentenceSplitter，针对中文文档优化。"""

    def __init__(self, chunk_size: int = 256, chunk_overlap_ratio: float = 0.2):
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


SPLITTER_TYPES = {
    "recursive": RecursiveSplitter,
    "token": TokenSplitter,
    "sentence": SentenceSplitterWrapper,
}


def create_splitter(
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
) -> BaseSplitter:
    cls = SPLITTER_TYPES.get(splitter_type, RecursiveSplitter)
    return cls(chunk_size=chunk_size, chunk_overlap_ratio=chunk_overlap_ratio)
