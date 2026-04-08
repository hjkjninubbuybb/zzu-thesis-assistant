"""PDF 图片提取与 vision 描述（占位模块，暂未实现）。"""

from pathlib import Path

from src.parsers.base import Chunk


class PdfImageExtractor:
    """从 PDF 中提取图片，调用 vision model 生成文字描述，输出为 IMAGE Chunk。

    当前为占位实现：extract() 直接返回空列表，不影响现有流程。

    未来实现方向：
    - 使用 pymupdf（fitz）逐页提取嵌入图片
    - 调用 qwen-vl-max 等 vision model 生成图片描述
    - 描述文本存入 Chunk.content，原始图片路径存入 Chunk.metadata["image_path"]

    注意：IMAGE Chunk 不参与 LLM 清洗（由 clean_text 的 content_type 判断跳过），
    直接参与向量化和检索。
    """

    def extract(self, file_path: Path) -> list[Chunk]:
        """提取文件中的所有图片并生成描述。（占位实现，返回空列表）

        Args:
            file_path: .pdf 文件路径。

        Returns:
            IMAGE 类型 Chunk 列表，当前返回 []。
        """
        return []
