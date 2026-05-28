"""图文混排流水线（manual）：多模态解析 → 清洗 → VLM 描述注入 → 切分。"""

import logging
from pathlib import Path

from src.config import get_config
from src.core.image_describer import inject_image_descriptions
from src.core.indexing._helpers import _clean_or_fallback, _embed_and_store, _split_text
from src.core.indexing._image_helpers import _get_image_dir, _parse_multimodal_pdf_with_kb
from src.parsers import get_parser
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)


def _index_manual_document(
    kb_name: str,
    file_path: Path,
    file_name: str,
    file_size: int,
    splitter_type: str,
    chunk_size: int,
    chunk_overlap_ratio: float,
    enable_cleaning: bool,
    vs: VectorStore,
    ds: DocumentStore,
) -> dict:
    """图文混排文档：多模态解析 → 清洗（含占位符校验）→ VLM 描述注入 → 切分。

    仅 PDF 走多模态路径；非 PDF 自动降级为纯文本流程。
    """
    is_pdf = file_path.suffix.lower() == ".pdf"
    raw_text = ""

    # 1. 解析
    if is_pdf:
        try:
            raw_text = _parse_multimodal_pdf_with_kb(kb_name, file_path, file_name)
        except Exception as e:
            logger.warning("[%s] 多模态 PDF 解析失败，回退为纯文本模式: %s", kb_name, e)
            is_pdf = False  # 降级，跳过后续 VLM 步骤

    if not is_pdf:
        logger.info("[%s] 解析文档（纯文本模式）...", kb_name)
        parser = get_parser(file_path.suffix.lower())
        raw_text = parser.parse(file_path).all_text()

    # 2. 清洗
    text = _clean_or_fallback(raw_text, kb_name, doc_type="manual", enable=enable_cleaning)

    # 3. VLM 描述注入（仅 PDF 多模态成功时）
    if is_pdf:
        image_dir = _get_image_dir(kb_name, file_name)
        logger.info("[%s] VLM 图片描述注入...", kb_name)
        try:
            cfg = get_config()
            vlm_model = cfg.get("vlm", {}).get("model", "qwen-vl-plus")
            text = inject_image_descriptions(text, image_dir, vlm_model)
        except Exception as e:
            logger.warning("[%s] VLM 描述注入失败，保留占位符原文: %s", kb_name, e)

    # 4. 切分
    nodes = _split_text(
        text,
        file_name,
        kb_name,
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        doc_type="manual",
    )
    return _embed_and_store(
        kb_name,
        file_name,
        file_size,
        chunk_size,
        "manual",
        nodes,
        vs,
        ds,
        full_text=text,
        splitter_type=splitter_type,
        chunk_overlap_ratio=chunk_overlap_ratio,
    )
