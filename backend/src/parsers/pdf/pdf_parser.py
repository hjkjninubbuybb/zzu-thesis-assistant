"""PDF 解析器：组合文本、表格、图片三个 extractor。"""

from pathlib import Path

from src.parsers.base import ParsedDocument
from src.parsers.pdf.image_extractor import PdfImageExtractor
from src.parsers.pdf.table_extractor import PdfTableExtractor
from src.parsers.pdf.text_extractor import PdfTextExtractor


class PdfParser:
    """PDF 文件解析器，协调多个 extractor 协同工作。

    架构：PdfParser 不直接操作 PDF，而是委托给：
    - PdfTextExtractor：提取文本内容（当前激活）
    - PdfTableExtractor：提取表格（默认关闭，启用后追加 TABLE Chunk）
    - PdfImageExtractor：提取图片并生成描述（默认关闭，启用后追加 IMAGE Chunk）

    新增内容类型时，只需实现对应 extractor 并在此处注入，
    PdfParser 本身无需修改。

    Args:
        enable_table_extraction: 是否启用表格提取（默认关闭）。
        enable_image_extraction: 是否启用图片提取与 vision 描述（默认关闭）。
    """

    def __init__(
        self,
        enable_table_extraction: bool = False,
        enable_image_extraction: bool = False,
    ):
        self._text_extractor = PdfTextExtractor()
        self._table_extractor = PdfTableExtractor() if enable_table_extraction else None
        self._image_extractor = PdfImageExtractor() if enable_image_extraction else None

    def parse(self, file_path: Path) -> ParsedDocument:
        """解析 PDF 文件，按提取顺序输出各类型内容块。

        当前仅 text_extractor 激活，行为与原 _extract_text() 完全一致。

        Args:
            file_path: .pdf 文件路径。

        Returns:
            ParsedDocument，chunks 按 text → table → image 顺序排列。
        """
        doc = ParsedDocument(file_name=file_path.name, file_path=file_path)

        doc.chunks.extend(self._text_extractor.extract(file_path))

        if self._table_extractor is not None:
            doc.chunks.extend(self._table_extractor.extract(file_path))

        if self._image_extractor is not None:
            doc.chunks.extend(self._image_extractor.extract(file_path))

        return doc
