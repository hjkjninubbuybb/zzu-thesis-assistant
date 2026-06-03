"""图片相关工具函数：多模态 PDF 解析、图片缓存目录管理。"""

import logging
import re
from pathlib import Path

from src.parsers.pdf.text_extractor import PdfTextExtractor

logger = logging.getLogger(__name__)

# 图片临时目录（相对项目根）
_IMAGE_CACHE_DIR = Path(__file__).parents[3] / "data" / "images"


def _parse_multimodal_pdf_with_kb(kb_name: str, file_path: Path, file_name: str) -> str:
    """解析多模态 PDF，图片写入按知识库+文件名组织的缓存目录。

    将临时文件复制为以原始文件名命名的副本再传给 pymupdf4llm，
    避免图片文件名包含随机临时文件名前缀导致后续找不到图片。
    """
    import shutil
    import tempfile

    image_dir = _get_image_dir(kb_name, file_name)

    # pymupdf4llm 用输入 PDF 的文件名生成图片名；临时文件名是随机的，
    # 需先复制为原始文件名，确保图片名可预期。
    safe_stem = re.sub(r"[^\w\-.]", "_", Path(file_name).stem)[:64]
    with tempfile.TemporaryDirectory() as tmp_dir:
        named_pdf = Path(tmp_dir) / f"{safe_stem}.pdf"
        shutil.copy2(file_path, named_pdf)
        extractor = PdfTextExtractor()
        chunks = extractor.extract_multimodal(named_pdf, image_dir)

    return "\n\n".join(c.content for c in chunks)


def _get_image_dir(kb_name: str, file_name: str) -> Path:
    """按 kb_name / MD5(file_name) 组织图片缓存目录。

    使用 MD5 hash 而非原始文件名，避免中文/特殊字符路径在 Windows 上导致 MuPDF 无法写入图片。
    """
    import hashlib

    dir_name = hashlib.md5(file_name.encode()).hexdigest()[:16]
    return _IMAGE_CACHE_DIR / kb_name / dir_name
