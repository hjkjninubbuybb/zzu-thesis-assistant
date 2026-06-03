"""索引阶段 3：向量化 + 入库（含失败回滚）。"""

import logging

from src.core.indexing._helpers import _generate_document_summary
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore
from src.core.rag.embedding import get_embed_model

logger = logging.getLogger(__name__)


def embed_and_store_nodes(
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_size: int,
    doc_type: str,
    nodes: list,
    vector_store: BaseVectorStore,
    doc_store: BaseDocumentStore,
    *,
    full_text: str = "",
    splitter_type: str = "recursive",
    chunk_overlap_ratio: float = 0.2,
    doc_id: int | None = None,
) -> dict:
    """对已有的 TextNode 列表执行向量化并入库。

    当 doc_id 不为 None 时，更新已有文档记录而非创建新记录。

    Args:
        kb_name: 知识库名称。
        file_name: 文件名。
        file_size: 文件大小（字节）。
        chunk_size: 分块大小。
        doc_type: 文档类型。
        nodes: TextNode 列表。
        vector_store: 向量库实例。
        doc_store: 文档库实例。
        full_text: 完整清洗文本（用于摘要生成）。
        splitter_type: 分块策略。
        chunk_overlap_ratio: 重叠比例。
        doc_id: 已有文档 ID（审核流程用）。

    Returns:
        ``{"doc_id": int, "file_name": str, "chunk_count": int}``
    """
    vs = vector_store
    ds = doc_store

    summary = _generate_document_summary(file_name, full_text)

    # ── 分支 1：空 nodes，仅记录元数据 ─────────────────────────
    if not nodes:
        if doc_id:
            ds.update_document(
                doc_id,
                chunk_count=0,
                status="active",
                summary=summary,
                chunks_preview=None,
            )
            return {"doc_id": doc_id, "file_name": file_name, "chunk_count": 0}
        doc_record = ds.add_document(
            kb_name=kb_name,
            file_name=file_name,
            file_size=file_size,
            chunk_count=0,
            chunk_size=chunk_size,
            doc_type=doc_type,
            splitter_type=splitter_type,
            status="active",
            summary=summary,
            content=full_text,
        )
        return {"doc_id": doc_record["id"], "file_name": file_name, "chunk_count": 0}

    # ── 分支 2：有 nodes，向量化 + 入库 ────────────────────────
    embed_model = get_embed_model(text_type="document")
    texts = [n.get_content() for n in nodes]
    vectors = embed_model.get_text_embedding_batch(texts)

    if doc_id:
        ds.update_document(
            doc_id,
            chunk_count=len(nodes),
            status="active",
            summary=summary,
            chunks_preview=None,
        )
        doc_record = ds.get_document(doc_id)
    else:
        doc_record = ds.add_document(
            kb_name=kb_name,
            file_name=file_name,
            file_size=file_size,
            chunk_count=len(nodes),
            chunk_size=chunk_size,
            doc_type=doc_type,
            splitter_type=splitter_type,
            status="active",
            summary=summary,
            content=full_text,
            chunk_overlap_ratio=chunk_overlap_ratio,
        )

    actual_doc_id = doc_id or doc_record["id"]
    vs.create_collection(kb_name)
    payloads = []
    ids = []
    for node in nodes:
        payload = {
            "text": node.get_content(),
            "file_name": file_name,
            "kb_name": kb_name,
            "node_id": node.node_id,
            "doc_id": actual_doc_id,
        }
        payload.update({k: v for k, v in node.metadata.items() if k not in payload})
        payloads.append(payload)
        ids.append(node.node_id)

    try:
        vs.add_vectors(kb_name, vectors, payloads, ids)
    except Exception:
        # 宽泛 catch 是 intentional：任何写入失败都需要回滚 MySQL 记录后再上抛。
        logger.exception("[embed_and_store_nodes] Qdrant 写入失败，回滚 MySQL")
        if not doc_id:
            ds.delete_document(actual_doc_id)
        raise

    return {"doc_id": actual_doc_id, "file_name": file_name, "chunk_count": len(nodes)}
