"""解析器基础数据结构与抽象接口。"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Protocol, runtime_checkable


class ChunkType(str, Enum):
    """内容块类型，决定下游 splitter 和 cleaning 的策略。"""

    TEXT = "text"    # 普通正文 / Markdown 文本块
    TABLE = "table"  # 表格（markdown 格式）
    IMAGE = "image"  # 图片描述（由 vision model 生成）


@dataclass
class Chunk:
    """单个内容块，是解析器输出的最小单元。

    Attributes:
        content:    块的文本内容。图片块存放 vision 描述，表格块存 markdown 格式表格。
        chunk_type: 内容类型，影响下游 splitter / cleaning 策略。
        metadata:   来源信息，如页码、原始图片路径、表格序号等。
    """

    content: str
    chunk_type: ChunkType = ChunkType.TEXT
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedDocument:
    """解析器的完整输出，承载一个文件解析后的所有内容块。

    Attributes:
        file_name: 原始文件名。
        file_path: 原始文件路径。
        chunks:    按原文顺序排列的内容块列表。
    """

    file_name: str
    file_path: Path
    chunks: list[Chunk] = field(default_factory=list)

    def all_text(self) -> str:
        """将所有非 IMAGE 块的 content 拼接为单一字符串。

        IMAGE 块不参与文本清洗和切分，通过此方法排除。
        拼接结果与重构前的 _extract_text() 行为一致。
        """
        return "\n\n".join(
            c.content for c in self.chunks if c.chunk_type != ChunkType.IMAGE
        )


@runtime_checkable
class BaseParser(Protocol):
    """解析器协议，所有解析器须满足此接口。

    使用 Protocol 而非 ABC，使第三方解析器无需继承，
    只要实现 parse 方法即可被 registry 接受。
    """

    def parse(self, file_path: Path) -> ParsedDocument:
        """解析文件，返回结构化的 ParsedDocument。

        Args:
            file_path: 要解析的文件路径（调用方确保文件已存在）。

        Returns:
            ParsedDocument，包含一个或多个 Chunk。

        Raises:
            ValueError: 文件格式不符合预期时。
            RuntimeError: 解析过程发生不可恢复错误时。
        """
        ...
