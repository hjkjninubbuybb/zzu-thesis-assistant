"""Office 文档 → PDF 转换器。使用 LibreOffice 无头模式。"""

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# 可被转换为 PDF 的扩展名（需要 LibreOffice）
# .docx 走自带的 DocxParser，无需转换
CONVERTIBLE_EXTS: frozenset[str] = frozenset({
    ".doc",
})

# LibreOffice 可执行文件候选路径（Windows）
_LO_CANDIDATES = [
    "soffice",                          # PATH 中已配置
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]


def _find_libreoffice() -> str:
    """找到可用的 LibreOffice 可执行文件路径，找不到抛 RuntimeError。"""
    for candidate in _LO_CANDIDATES:
        if shutil.which(candidate) or Path(candidate).exists():
            return candidate
    raise RuntimeError(
        "未找到 LibreOffice，请安装后重试（https://www.libreoffice.org/download/）"
    )


def convert_to_pdf(src: Path) -> Path:
    """将 Word 文档转换为 PDF，返回临时 PDF 文件路径（调用方负责清理）。

    Args:
        src: 源文件路径（.doc 或 .docx）

    Returns:
        转换后的 PDF 临时文件路径

    Raises:
        RuntimeError: LibreOffice 未安装或转换失败
    """
    lo = _find_libreoffice()
    out_dir = Path(tempfile.mkdtemp())
    try:
        result = subprocess.run(
            [lo, "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(src)],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice 转换失败: {result.stderr.strip()}")

        pdf_files = list(out_dir.glob("*.pdf"))
        if not pdf_files:
            raise RuntimeError("LibreOffice 未生成 PDF 文件")

        # 移动到系统临时目录，由调用方负责清理
        fd, tmp_pdf_str = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)
        tmp_pdf = Path(tmp_pdf_str)
        shutil.move(str(pdf_files[0]), tmp_pdf)
        return tmp_pdf

    finally:
        shutil.rmtree(out_dir, ignore_errors=True)
