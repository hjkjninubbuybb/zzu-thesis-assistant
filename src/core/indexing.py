"""文档索引流程：解析 → 清洗 → 切分 → Embedding → 存入 Qdrant。"""

import logging
import os
from pathlib import Path

import pymupdf4llm
from llama_index.core.schema import Document
from llama_index.embeddings.dashscope import (
    DashScopeEmbedding,
    DashScopeTextEmbeddingModels,
)

from src.config import get_config, get_dashscope_api_key
from src.core.splitter import create_splitter
from src.core.cleaning import clean_text
from src.storage.vector_store import VectorStore
from src.storage.document_store import DocumentStore

logger = logging.getLogger(__name__)

# 支持的文件类型
SUPPORTED_EXTS = {".txt", ".md", ".pdf"}


def _extract_text(file_path: Path) -> str:
    """从文件提取纯文本/Markdown 内容。"""
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        # pymupdf4llm 将 PDF 转为 Markdown
        return pymupdf4llm.to_markdown(str(file_path))
    elif ext in (".txt", ".md"):
        return file_path.read_text(encoding="utf-8")
    else:
        raise ValueError(f"不支持的文件类型: {ext}")


def _get_embedding_model() -> DashScopeEmbedding:
    cfg = get_config()
    model_name = cfg["embedding"].get("model", "text-embedding-v3")
    model_map = {
        "text-embedding-v3": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3,
        "text-embedding-v2": DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V2,
    }
    embed_batch_size = cfg["embedding"].get("embed_batch_size", 10)
    logger.info(f"DashScopeEmbedding init: model={model_name}, embed_batch_size={embed_batch_size}")
    return DashScopeEmbedding(
        model_name=model_map.get(model_name, DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3),
        text_type="document",
        api_key=get_dashscope_api_key(),
        embed_batch_size=embed_batch_size,
    )


def index_document(
    kb_name: str,
    file_path: Path,
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    enable_cleaning: bool = True,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
) -> dict:
    """
    完整的文档入库流程。

    Returns:
        包含 chunk_count 等信息的字典
    """
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    file_path = Path(file_path)
    file_name = file_path.name
    file_size = file_path.stat().st_size

    logger.info(f"[{kb_name}] 开始处理文档: {file_name}")

    # 1. 提取文本
    logger.info(f"[{kb_name}] 提取文本...")
    raw_text = _extract_text(file_path)

    # 2. 清洗（可选，耗时较长）
    if enable_cleaning:
        logger.info(f"[{kb_name}] LLM 清洗中...")
        text = clean_text(raw_text)
    else:
        text = raw_text

    # 3. 切分
    logger.info(f"[{kb_name}] 切分文档 (splitter={splitter_type}, chunk_size={chunk_size})...")
    doc = Document(text=text, metadata={"file_name": file_name, "kb_name": kb_name})
    splitter = create_splitter(splitter_type, chunk_size, chunk_overlap_ratio)
    nodes = splitter.split([doc])
    logger.info(f"[{kb_name}] 切分为 {len(nodes)} 个 chunks")

    # 4. Embedding
    logger.info(f"[{kb_name}] 生成 Embedding...")
    embed_model = _get_embedding_model()
    texts = [n.get_content() for n in nodes]
    vectors = embed_model.get_text_embedding_batch(texts)

    # 5. 存入 Qdrant
    logger.info(f"[{kb_name}] 写入 Qdrant collection '{kb_name}'...")
    vs.create_collection(kb_name)
    payloads = [
        {
            "text": n.get_content(),
            "file_name": file_name,
            "kb_name": kb_name,
            "node_id": n.node_id,
        }
        for n in nodes
    ]
    ids = [n.node_id for n in nodes]
    vs.add_vectors(kb_name, vectors, payloads, ids)

    # 6. 记录元数据
    doc_record = ds.add_document(
        kb_name=kb_name,
        file_name=file_name,
        file_size=file_size,
        chunk_count=len(nodes),
        chunk_size=chunk_size,
    )

    logger.info(f"[{kb_name}] 文档 '{file_name}' 入库完成，共 {len(nodes)} 个 chunks")
    return {
        "doc_id": doc_record["id"],
        "file_name": file_name,
        "chunk_count": len(nodes),
    }


def delete_document(
    kb_name: str,
    doc_id: int,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
) -> None:
    """删除文档：从 Qdrant 删除向量 + 从 SQLite 删除记录。"""
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    doc = ds.get_document(doc_id)
    if not doc:
        raise ValueError(f"文档 {doc_id} 不存在")

    # 从 Qdrant 删除该文件的所有向量
    vs.delete_by_metadata(kb_name, "file_name", doc["file_name"])

    # 从 SQLite 删除记录
    ds.delete_document(doc_id)
    logger.info(f"[{kb_name}] 文档 '{doc['file_name']}' 已删除")
