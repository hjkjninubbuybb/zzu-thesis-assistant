"""PDF 图文提取辅助工具（VLM 描述注入触发器）。

本模块不再独立负责图片提取——图片由 PdfTextExtractor.extract_multimodal()
在解析阶段写出，本模块仅作为占位接口保留，确保 PdfParser 接口向后兼容。

实际 VLM 描述注入由 src.core.image_describer.inject_image_descriptions 完成，
在 indexing.py 的多模态分支中调用。
"""

from pathlib import Path

from src.parsers.base import Chunk


class PdfImageExtractor:
    """VLM 图片描述注入触发器（接口占位）。

    图文索引流程已由 indexing.py 的多模态分支统一处理：
    1. PdfTextExtractor.extract_multimodal() 提取文本 + 写出图片文件
    2. clean_text(..., doc_type="multimodal") 清洗（含占位符校验）
    3. inject_image_descriptions() 批量 VLM 描述注入

    本类的 extract() 返回空列表，不影响现有纯文本流程。
    """

    def extract(self, file_path: Path) -> list[Chunk]:
        """返回空列表（图文流程由 indexing.py 多模态分支处理）。"""
        return []
