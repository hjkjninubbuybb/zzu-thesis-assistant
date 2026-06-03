"""索引阶段 1：解析 + 清洗。"""

import logging
from pathlib import Path

from src.config import get_config
from src.core.indexing._helpers import _clean_or_fallback
from src.core.indexing._image_helpers import _get_image_dir, _parse_multimodal_pdf_with_kb
from src.core.preprocessing.image_describer import inject_image_descriptions
from src.parsers import get_parser

logger = logging.getLogger(__name__)


def parse_and_clean(
    kb_name: str,
    file_path: Path,
    original_filename: str,
    doc_type: str = "policy",
    enable_cleaning: bool = True,
) -> str:
    """解析文件并清洗文本，返回清洗后的文本内容。

    Args:
        kb_name: 知识库名称。
        file_path: 文件路径。
        original_filename: 原始文件名。
        doc_type: 文档类型（policy/manual/form）。
        enable_cleaning: 是否启用 LLM 清洗。

    Returns:
        清洗后的文本。
    """
    ext = file_path.suffix.lower()
    parser = get_parser(ext)

    if doc_type == "manual" and ext == ".pdf":
        raw_text = _parse_multimodal_pdf_with_kb(kb_name, file_path, original_filename)
        if not raw_text.strip():
            raw_text = parser.parse(file_path).all_text()
    else:
        raw_text = parser.parse(file_path).all_text()

    text = _clean_or_fallback(raw_text, kb_name, doc_type=doc_type, enable=enable_cleaning)

    if doc_type == "manual":
        cfg = get_config()
        image_dir = _get_image_dir(kb_name, original_filename)
        vlm_model = cfg.get("models", {}).get("vlm", "qwen-vl-plus")
        if image_dir.exists():
            text = inject_image_descriptions(text, image_dir, vlm_model)

    return text
