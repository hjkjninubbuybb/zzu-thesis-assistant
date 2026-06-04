"""纯文本 / Markdown 文件解析器。"""

from pathlib import Path

from src.parsers.base import Chunk, ChunkType, ParsedDocument


class TxtParser:
    """处理 .txt 和 .md 文件。

    读取全文为单一 TEXT Chunk，行为与原 _extract_text() 中 txt/md 分支一致。

    未来扩展方向：可按 Markdown heading 切分为多个块，
    携带各自的标题路径元数据，支持更细粒度的结构化检索。
    """

    def parse(self, file_path: Path) -> ParsedDocument:
        """读取文件内容，包装为单一 TEXT Chunk。

        Args:
            file_path: .txt 或 .md 文件路径。

        Returns:
            ParsedDocument，包含一个 TEXT 类型 Chunk。
        """
        content = file_path.read_text(encoding="utf-8")
        return ParsedDocument(
            file_name=file_path.name,
            file_path=file_path,
            chunks=[
                Chunk(
                    content=content,
                    chunk_type=ChunkType.TEXT,
                    metadata={"source": "txt_parser"},
                )
            ],
        )
