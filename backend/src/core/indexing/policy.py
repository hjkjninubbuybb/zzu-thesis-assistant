"""纯文本流水线（policy）：解析 → 清洗 → 切分。"""

import logging
from pathlib import Path

from src.core.indexing._helpers import _clean_or_fallback, _embed_and_store, _split_text
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore
from src.parsers import get_parser

logger = logging.getLogger(__name__)


def _index_policy_document(
    kb_name: str,
    file_path: Path,
    file_name: str,
    file_size: int,
    splitter_type: str,
    chunk_size: int,
    chunk_overlap_ratio: float,
    enable_cleaning: bool,
    vs: BaseVectorStore,
    ds: BaseDocumentStore,
) -> dict:
    """纯文本文档：解析 → 清洗 → 切分。"""
    # 1. 解析
    logger.info("[%s] 解析文档...", kb_name)
    parser = get_parser(file_path.suffix.lower())
    raw_text = parser.parse(file_path).all_text()

    # 2. 清洗
    text = _clean_or_fallback(raw_text, kb_name, doc_type="policy", enable=enable_cleaning)

    # 3. 切分
    nodes = _split_text(
        text,
        file_name,
        kb_name,
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        doc_type="policy",
    )
    return _embed_and_store(
        kb_name,
        file_name,
        file_size,
        chunk_size,
        "policy",
        nodes,
        vs,
        ds,
        full_text=text,
        splitter_type=splitter_type,
        chunk_overlap_ratio=chunk_overlap_ratio,
    )
