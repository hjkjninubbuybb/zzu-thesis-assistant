"""PDF 文本提取，封装 pymupdf4llm 逻辑。"""

from pathlib import Path

import pymupdf4llm

from src.parsers.base import Chunk, ChunkType


class PdfTextExtractor:
    """将整份 PDF 转为 Markdown 文本，包装为单一 TEXT Chunk。

    这是对原 indexing._extract_text() 中 PDF 分支的直接迁移，行为不变。
    未来若需要按页切分，可在此处扩展，外部调用方无需感知。
    """

    def extract(self, file_path: Path) -> list[Chunk]:
        """调用 pymupdf4llm 将整份 PDF 转为 Markdown，包装为单一 TEXT Chunk。

        Args:
            file_path: .pdf 文件路径。

        Returns:
            包含一个 TEXT 类型 Chunk 的列表。
        """
        result = pymupdf4llm.to_markdown(str(file_path))
        # to_markdown 默认返回 str；page_chunks=True 时返回 list，此处不使用
        markdown_text = result if isinstance(result, str) else "\n\n".join(
            p.get("text", "") for p in result
        )
        return [
            Chunk(
                content=markdown_text,
                chunk_type=ChunkType.TEXT,
                metadata={"source": "text_extractor"},
            )
        ]
