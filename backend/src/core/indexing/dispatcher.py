"""文档入库分发入口，按 doc_type 路由到对应流水线。"""

import logging
from pathlib import Path

from src.core.indexing.form import _index_form_document
from src.core.indexing.manual import _index_manual_document
from src.core.indexing.policy import _index_policy_document
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore

logger = logging.getLogger(__name__)


def index_document(
    kb_name: str,
    file_path: Path,
    vector_store: BaseVectorStore,
    doc_store: BaseDocumentStore,
    *,
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    enable_cleaning: bool = True,
    doc_type: str = "policy",
    original_filename: str | None = None,
) -> dict:
    """文档入库分发入口，按 doc_type 路由到对应流水线。

    Args:
        doc_type: ``"policy"``（纯文本）/ ``"manual"``（图文混排）/ ``"form"``（填报模板）。

    Returns:
        包含 doc_id / file_name / chunk_count 的字典。
    """
    vs = vector_store
    ds = doc_store

    file_path = Path(file_path)
    file_name = original_filename or file_path.name
    file_size = file_path.stat().st_size

    logger.info("[%s] 开始处理文档: %s (doc_type=%s)", kb_name, file_name, doc_type)

    if doc_type == "manual":
        return _index_manual_document(
            kb_name,
            file_path,
            file_name,
            file_size,
            splitter_type,
            chunk_size,
            chunk_overlap_ratio,
            enable_cleaning,
            vs,
            ds,
        )
    if doc_type == "form":
        return _index_form_document(
            kb_name,
            file_path,
            file_name,
            file_size,
            splitter_type,
            chunk_size,
            chunk_overlap_ratio,
            enable_cleaning,
            vs,
            ds,
        )
    # policy（默认）
    return _index_policy_document(
        kb_name,
        file_path,
        file_name,
        file_size,
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        enable_cleaning,
        vs,
        ds,
    )
