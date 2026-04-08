"""PDF 表格提取（占位模块，暂未实现）。"""

from pathlib import Path

from src.parsers.base import Chunk


class PdfTableExtractor:
    """从 PDF 中提取表格，输出为 TABLE 类型 Chunk。

    当前为占位实现：extract() 直接返回空列表，不影响现有流程。

    未来实现方向：
    - 方案 A：pdfplumber.extract_tables() 转 markdown
    - 方案 B：camelot-py（lattice/stream 模式，适合线框表格）
    - 方案 C：调用 vision model 对页面截图做结构化识别

    每个表格对应一个 TABLE Chunk，metadata 中记录页码和表格序号。
    """

    def extract(self, file_path: Path) -> list[Chunk]:
        """提取文件中的所有表格。（占位实现，返回空列表）

        Args:
            file_path: .pdf 文件路径。

        Returns:
            TABLE 类型 Chunk 列表，当前返回 []。
        """
        return []
