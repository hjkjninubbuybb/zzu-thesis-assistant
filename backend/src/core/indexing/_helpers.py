"""共享工具函数：摘要生成、清洗、切分配置、文本切分、Embedding 入库。"""

import logging

from llama_index.core.schema import Document

from src.config import get_config
from src.core.cleaning import clean_text
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore
from src.core.preprocessing.splitter import create_splitter
from src.core.rag.embedding import get_embed_model
from src.core.shared.llm_factory import get_llm

logger = logging.getLogger(__name__)


def _generate_document_summary(file_name: str, full_text: str) -> str:
    """生成文档的全局摘要（用于 Agent 先验知识）。"""
    try:
        llm = get_llm(streaming=False)
        prompt = (
            "请为以下文档生成一段简短的全局摘要（150字以内）。\n"
            "摘要应包含：文档的主题、核心内容、以及它能解决哪类问题。\n\n"
            f"文件名：{file_name}\n"
            f"正文预览（前3000字）：\n{full_text[:3000]}"
        )
        resp = llm.invoke(prompt)
        summary = resp.content if hasattr(resp, "content") else str(resp)
        return summary.strip()
    except Exception as e:
        logger.warning("[summary] 生成摘要失败 (%s): %s", file_name, e)
        return ""


def _clean_or_fallback(raw_text: str, kb_name: str, *, doc_type: str, enable: bool) -> str:
    """清洗文本，失败时回退原始文本。"""
    if not enable:
        return raw_text
    logger.info("[%s] LLM 清洗中 (doc_type=%s)...", kb_name, doc_type)

    # doc_type → clean_text 参数映射
    if doc_type == "form":
        content_type, clean_doc_type = "form", "plain_text"
    elif doc_type == "manual":
        content_type, clean_doc_type = "text", "multimodal"
    else:
        content_type, clean_doc_type = "text", "plain_text"

    try:
        return clean_text(raw_text, content_type=content_type, doc_type=clean_doc_type)
    except Exception as e:
        logger.warning("[%s] 清洗失败，使用原始文本: %s", kb_name, e)
        return raw_text


def _get_splitter_config(doc_type: str) -> dict:
    """读取 per-doc-type 切分配置，合并共享默认值。"""
    cfg = get_config().get("splitter", {})
    shared = {
        "type": "recursive",
        "chunk_size": cfg.get("chunk_size", 256),
        "chunk_overlap_ratio": cfg.get("chunk_overlap_ratio", 0.2),
    }
    doc_cfg = cfg.get(doc_type, {})
    return {**shared, **doc_cfg}


def _split_text(
    text: str,
    file_name: str,
    kb_name: str,
    splitter_type: str,
    chunk_size: int,
    chunk_overlap_ratio: float,
    doc_type: str = "policy",
) -> list:
    """切分文本为 nodes。

    优先级：API 显式传入 splitter_type > config per-doc-type 默认 > 全局默认 recursive。
    """
    splitter_cfg = _get_splitter_config(doc_type)
    effective_type = splitter_type if splitter_type else splitter_cfg["type"]
    effective_chunk_size = chunk_size if chunk_size else splitter_cfg["chunk_size"]
    effective_overlap = chunk_overlap_ratio if chunk_overlap_ratio is not None else splitter_cfg["chunk_overlap_ratio"]

    # 收集 splitter 特有参数
    extra: dict = {}
    if effective_type == "manual_step":
        extra["use_llm"] = splitter_cfg.get("use_llm", True)
    elif effective_type == "semantic":
        sem_cfg = get_config().get("splitter", {}).get("semantic", {})
        extra["buffer_size"] = sem_cfg.get("buffer_size", 2)
        extra["breakpoint_percentile_threshold"] = sem_cfg.get("breakpoint_percentile_threshold", 90)

    logger.info(
        "[%s] 切分文档 (splitter=%s, chunk_size=%d)...",
        kb_name,
        effective_type,
        effective_chunk_size,
    )
    doc = Document(text=text, metadata={"file_name": file_name, "kb_name": kb_name})
    splitter = create_splitter(effective_type, effective_chunk_size, effective_overlap, **extra)
    nodes = splitter.split([doc])

    # ManualStepSplitter 产出 0 nodes 时回退到 recursive
    if effective_type == "manual_step" and len(nodes) == 0:
        logger.warning("[%s] ManualStepSplitter 产出 0 nodes，回退到 recursive", kb_name)
        splitter = create_splitter("recursive", effective_chunk_size, effective_overlap)
        nodes = splitter.split([doc])

    logger.info("[%s] 切分为 %d 个 chunks", kb_name, len(nodes))
    return nodes


def _embed_and_store(
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_size: int,
    doc_type: str,
    nodes: list,
    vs: BaseVectorStore,
    ds: BaseDocumentStore,
    full_text: str = "",
    splitter_type: str = "recursive",
    chunk_overlap_ratio: float = 0.2,
) -> dict:
    """Embedding → MySQL → Qdrant，带回滚保护。"""
    # 0. 生成全局摘要（用于 Agent 先验知识）
    summary = ""
    if full_text:
        logger.info("[%s] 正在生成文档全局摘要...", kb_name)
        summary = _generate_document_summary(file_name, full_text)

    # nodes 为空（如 form 流水线判断无实质内容）：仅记录元数据，跳过 Embedding 和 Qdrant
    if not nodes:
        logger.info("[%s] 无可索引内容（0 nodes），仅写入元数据: %s", kb_name, file_name)
        doc_record = ds.add_document(
            kb_name=kb_name,
            file_name=file_name,
            file_size=file_size,
            chunk_count=0,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            doc_type=doc_type,
            splitter_type=splitter_type,
            summary=summary,
            content=full_text,
            status="completed",
        )
        return {"doc_id": doc_record["id"], "file_name": file_name, "chunk_count": 0}

    # 1. Embedding
    logger.info("[%s] 生成 Embedding (%d nodes)...", kb_name, len(nodes))
    embed_model = get_embed_model(text_type="document")
    texts = [n.get_content() for n in nodes]
    try:
        vectors = embed_model.get_text_embedding_batch(texts)
    except Exception as e:
        logger.error("[%s] Embedding 失败 (%d chunks): %s", kb_name, len(texts), e)
        raise RuntimeError(f"向量化失败（{len(texts)} 个 chunk）：{e}") from e

    # 2. 记录元数据（先占位，获取 doc_id）
    try:
        doc_record = ds.add_document(
            kb_name=kb_name,
            file_name=file_name,
            file_size=file_size,
            chunk_count=len(nodes),
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            doc_type=doc_type,
            splitter_type=splitter_type,
            summary=summary,
            content=full_text,
            status="completed",
        )
        doc_id = doc_record["id"]
    except Exception as e:
        logger.error("[%s] MySQL 写入失败: %s", kb_name, e)
        raise

    # 3. 存入 Qdrant (包含 doc_id 以支持精准删除)
    logger.info("[%s] 写入 Qdrant collection '%s'...", kb_name, kb_name)
    vs.create_collection(kb_name)
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
    try:
        vs.add_vectors(kb_name, vectors, payloads, ids)
    except Exception as e:
        logger.error("[%s] Qdrant 写入失败，回滚 MySQL 记录: %s", kb_name, e)
        ds.delete_document(doc_id)
        raise

    logger.info("[%s] 文档 '%s' 入库完成，共 %d 个 chunks", kb_name, file_name, len(nodes))
    return {
        "doc_id": doc_id,
        "file_name": file_name,
        "chunk_count": len(nodes),
    }
