"""DOCX 文件解析器（文本 + 表格）。

依赖：python-docx（需在 pyproject.toml 中添加 `python-docx` 依赖）
"""

from pathlib import Path

from src.parsers.base import Chunk, ChunkType, ParsedDocument


class DocxParser:
    """处理 .docx 文件，按段落顺序提取文本和表格。

    按文档流顺序输出 TEXT 和 TABLE 类型的 Chunk，保留位置关系。

    - 段落 → ChunkType.TEXT
    - 表格 → ChunkType.TABLE（内容为 Markdown 格式）

    未来扩展：支持嵌入图片提取（需配合 PdfImageExtractor 类似逻辑）。
    """

    def parse(self, file_path: Path) -> ParsedDocument:
        """按文档顺序提取段落和表格。

        Args:
            file_path: .docx 文件路径。

        Returns:
            ParsedDocument，chunks 按原文顺序排列。

        Raises:
            ImportError: python-docx 未安装时。
        """
        try:
            import docx
        except ImportError as e:
            raise ImportError(
                "解析 .docx 文件需要 python-docx，请运行: pip install python-docx"
            ) from e

        document = docx.Document(str(file_path))
        doc = ParsedDocument(file_name=file_path.name, file_path=file_path)

        # python-docx 通过 document.element.body 遍历可保留段落与表格的原始顺序
        from docx.oxml.ns import qn

        for child in document.element.body:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

            if tag == "p":
                # 段落
                text = "".join(run.text for run in child.iter(qn("w:t")))
                text = text.strip()
                if text:
                    doc.chunks.append(
                        Chunk(
                            content=text,
                            chunk_type=ChunkType.TEXT,
                            metadata={"source": "docx_parser"},
                        )
                    )

            elif tag == "tbl":
                # 表格：转换为 Markdown 格式
                markdown = _table_element_to_markdown(child)
                if markdown:
                    doc.chunks.append(
                        Chunk(
                            content=markdown,
                            chunk_type=ChunkType.TABLE,
                            metadata={"source": "docx_parser"},
                        )
                    )

        return doc


def _table_element_to_markdown(tbl_element) -> str:
    """将 docx 表格 XML 元素转换为 Markdown 格式字符串。"""
    from docx.oxml.ns import qn

    rows: list[list[str]] = []
    for tr in tbl_element.iter(qn("w:tr")):
        cells: list[str] = []
        for tc in tr.iter(qn("w:tc")):
            cell_text = "".join(t.text for t in tc.iter(qn("w:t")))
            cells.append(cell_text.strip())
        if cells:
            rows.append(cells)

    if not rows:
        return ""

    # 列数对齐
    max_cols = max(len(r) for r in rows)
    for row in rows:
        while len(row) < max_cols:
            row.append("")

    header = "| " + " | ".join(rows[0]) + " |"
    separator = "| " + " | ".join(["---"] * max_cols) + " |"
    body = "\n".join("| " + " | ".join(row) + " |" for row in rows[1:])

    return "\n".join(filter(None, [header, separator, body]))
