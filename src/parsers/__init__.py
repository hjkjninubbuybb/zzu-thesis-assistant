"""parsers 包公共入口。

职责：
1. 在模块加载时完成所有内置解析器的注册（副作用式注册）。
2. 重导出供外部使用的符号，屏蔽内部模块路径。

使用方式：
    from src.parsers import get_parser, SUPPORTED_EXTS

    parser = get_parser(".pdf")
    doc = parser.parse(file_path)
"""

from src.parsers.registry import get_parser, register_parser, get_supported_extensions
from src.parsers.base import ParsedDocument, Chunk, ChunkType

# ── 注册内置解析器（模块加载时执行）──────────────────────────────────
from src.parsers.txt_parser import TxtParser
from src.parsers.docx_parser import DocxParser
from src.parsers.pdf import PdfParser

register_parser(".txt", TxtParser())
register_parser(".md", TxtParser())
register_parser(".pdf", PdfParser())
register_parser(".docx", DocxParser())

# 供外部直接使用的扩展名集合（frozenset，只读）
SUPPORTED_EXTS: frozenset[str] = get_supported_extensions()

__all__ = [
    "get_parser",
    "register_parser",
    "get_supported_extensions",
    "SUPPORTED_EXTS",
    "ParsedDocument",
    "Chunk",
    "ChunkType",
]
