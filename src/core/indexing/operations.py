"""公开阶段函数：parse_and_clean / split_content / embed_and_store_nodes / delete_document / reindex_document。"""

import logging
from pathlib import Path

from llama_index.core.schema import TextNode

from src.config import get_config
from src.core.form_extraction import extract_form_sections
from src.core.image_describer import inject_image_descriptions
from src.core.indexing._helpers import _clean_or_fallback, _generate_document_summary, _split_text
from src.core.indexing._image_helpers import _get_image_dir, _parse_multimodal_pdf_with_kb
from src.core.rag.embedding import get_embed_model
from src.parsers import get_parser
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

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


def split_content(
    text: str,
    file_name: str,
    kb_name: str,
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    doc_type: str = "policy",
) -> list:
    """对清洗后的文本执行分块，返回 TextNode 列表。

    Args:
        text: 清洗后的文本。
        file_name: 文件名。
        kb_name: 知识库名称。
        splitter_type: 分块策略。
        chunk_size: 分块大小。
        chunk_overlap_ratio: 分块重叠比例。
        doc_type: 文档类型。

    Returns:
        TextNode 列表。
    """
    if doc_type == "form":
        sections_result = extract_form_sections(text, file_name)
        sections = sections_result.get("sections", [])
        extraction_status = sections_result.get("status", "")
        if sections and extraction_status != "PASS":
            nodes = [
                TextNode(
                    text=s["content"],
                    metadata={
                        "file_name": file_name,
                        "kb_name": kb_name,
                        "doc_type": doc_type,
                        "section_topic": s.get("topic", ""),
                    },
                )
                for s in sections
            ]
            if nodes:
                return nodes
        # fallback to regular splitting
    return _split_text(
        text,
        file_name,
        kb_name,
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        doc_type,
    )


def embed_and_store_nodes(
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_size: int,
    doc_type: str,
    nodes: list,
    full_text: str = "",
    splitter_type: str = "recursive",
    chunk_overlap_ratio: float = 0.2,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
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
        full_text: 完整清洗文本（用于摘要生成）。
        splitter_type: 分块策略。
        chunk_overlap_ratio: 重叠比例。
        vector_store: 向量库实例。
        doc_store: 文档库实例。
        doc_id: 已有文档 ID（审核流程用）。

    Returns:
        {"doc_id": int, "file_name": str, "chunk_count": int}
    """
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    summary = _generate_document_summary(file_name, full_text)

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
        logger.exception("[embed_and_store_nodes] Qdrant 写入失败，回滚 MySQL")
        if not doc_id:
            ds.delete_document(actual_doc_id)
        raise

    return {"doc_id": actual_doc_id, "file_name": file_name, "chunk_count": len(nodes)}


def delete_document(
    kb_name: str,
    doc_id: int,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
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
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    doc = ds.get_document(doc_id)
    if not doc:
        raise ValueError(f"文档 {doc_id} 不存在")

    # 使用 doc_id 进行精准删除
    vs.delete_by_metadata(kb_name, "doc_id", doc_id)
    ds.delete_document(doc_id)
    logger.info("[%s] 文档 '%s' (ID: %d) 已删除", kb_name, doc["file_name"], doc_id)


def reindex_document(
    kb_name: str,
    doc_id: int,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
) -> dict:
    """基于数据库中现有的 content 重新索引文档（切分 + Embedding + Qdrant）。

    Args:
        kb_name: 知识库名称。
        doc_id: 文档 ID。
        vector_store: 向量库实例。
        doc_store: 文档库实例。

    Returns:
        {"doc_id": int, "file_name": str, "chunk_count": int}

    Raises:
        ValueError: 文档不存在、知识库不匹配或无可索引内容时抛出。
    """
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

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

    # 1. 删除 Qdrant 中的旧向量 (使用 doc_id)
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
