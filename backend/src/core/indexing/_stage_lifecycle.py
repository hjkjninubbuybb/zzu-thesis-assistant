"""索引阶段 4：文档生命周期（删除 / 重索引）。"""

import logging

from src.core.indexing._helpers import _split_text
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore
from src.core.rag.embedding import get_embed_model

logger = logging.getLogger(__name__)


def delete_document(
    kb_name: str,
    doc_id: int,
    vector_store: BaseVectorStore,
    doc_store: BaseDocumentStore,
) -> None:
    """删除文档：从 Qdrant 删除向量 + 从 MySQL 删除记录。

    Args:
        kb_name: 知识库名称。
        doc_id: 文档 ID。
        vector_store: 向量库实例。
        doc_store: 文档库实例。

    Raises:
        ValueError: 文档不存在时抛出。
    """
    vs = vector_store
    ds = doc_store

    doc = ds.get_document(doc_id)
    if not doc:
        raise ValueError(f"文档 {doc_id} 不存在")

    vs.delete_by_metadata(kb_name, "doc_id", doc_id)
    ds.delete_document(doc_id)
    logger.info("[%s] 文档 '%s' (ID: %d) 已删除", kb_name, doc["file_name"], doc_id)


def reindex_document(
    kb_name: str,
    doc_id: int,
    vector_store: BaseVectorStore,
    doc_store: BaseDocumentStore,
) -> dict:
    """基于数据库中现有的 content 重新索引文档（切分 + Embedding + Qdrant）。

    Args:
        kb_name: 知识库名称。
        doc_id: 文档 ID。
        vector_store: 向量库实例。
        doc_store: 文档库实例。

    Returns:
        ``{"doc_id": int, "file_name": str, "chunk_count": int}``

    Raises:
        ValueError: 文档不存在、知识库不匹配或无可索引内容时抛出。
    """
    vs = vector_store
    ds = doc_store

    doc = ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise ValueError(f"文档 {doc_id} 不存在或知识库不匹配")

    content = doc.get("content")
    if not content:
        raise ValueError(f"文档 {doc_id} 没有可索引的内容")

    file_name = doc["file_name"]
    doc_type = doc["doc_type"]
    chunk_size = doc["chunk_size"]
    chunk_overlap_ratio = doc.get("chunk_overlap_ratio", 0.1)
    splitter_type = doc.get("splitter_type", "recursive")

    logger.info("[%s] 重新索引文档: %s (doc_id=%d)", kb_name, file_name, doc_id)

    # 1. 删除 Qdrant 中的旧向量（按 doc_id）
    vs.delete_by_metadata(kb_name, "doc_id", doc_id)

    # 2. 切分
    nodes = _split_text(
        content,
        file_name,
        kb_name,
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        doc_type=doc_type,
    )

    # 3. Embedding
    logger.info("[%s] 生成 Embedding (%d nodes)...", kb_name, len(nodes))
    embed_model = get_embed_model(text_type="document")
    texts = [n.get_content() for n in nodes]
    vectors = embed_model.get_text_embedding_batch(texts)

    # 4. 写入 Qdrant
    _COMMON_META_KEYS = {"file_name", "kb_name"}
    payloads = []
    for n in nodes:
        payload = {
            "text": n.get_content(),
            "file_name": file_name,
            "kb_name": kb_name,
            "node_id": n.node_id,
            "doc_id": doc_id,
        }
        for k, v in n.metadata.items():
            if k not in _COMMON_META_KEYS:
                payload[k] = v
        payloads.append(payload)
    ids = [n.node_id for n in nodes]
    vs.add_vectors(kb_name, vectors, payloads, ids)

    # 5. 更新 MySQL 中的 chunk_count
    ds.update_document(doc_id, chunk_count=len(nodes))

    logger.info("[%s] 文档 '%s' 重新索引完成，共 %d 个 chunks", kb_name, file_name, len(nodes))
    return {
        "doc_id": doc_id,
        "file_name": file_name,
        "chunk_count": len(nodes),
    }
