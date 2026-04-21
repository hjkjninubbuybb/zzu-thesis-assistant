"""文档索引流程：解析 → 清洗 → 切分 → Embedding → 存入 Qdrant。

支持三种文档类型：
- ``policy``：政策文件，纯文本流程（默认）
- ``manual``：操作手册，图文混排流程，仅对 PDF 生效
  额外步骤：提取图片 → 清洗（含占位符校验）→ VLM 批量描述注入
- ``form``：填报模板，逐 chunk 处理，表格 → LLM 提取自然语言，文本 → 正常切分
"""

import logging
import re
from pathlib import Path

from llama_index.core.schema import Document

from src.core.splitter import create_splitter
from src.core.cleaning import clean_text
from src.parsers import get_parser
from src.parsers.pdf.text_extractor import PdfTextExtractor
from src.core.image_describer import inject_image_descriptions
from src.storage.vector_store import VectorStore
from src.storage.document_store import DocumentStore
from src.core.embedding import get_embed_model
from src.config import get_config

logger = logging.getLogger(__name__)

# 图片临时目录（相对项目根）
_IMAGE_CACHE_DIR = Path(__file__).parents[2] / "data" / "images"


def index_document(
    kb_name: str,
    file_path: Path,
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    enable_cleaning: bool = True,
    doc_type: str = "policy",
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
    original_filename: str | None = None,
) -> dict:
    """文档入库分发入口，按 doc_type 路由到对应流水线。

    Args:
        doc_type: ``"policy"``（纯文本）/ ``"manual"``（图文混排）/ ``"form"``（填报模板）。

    Returns:
        包含 doc_id / file_name / chunk_count 的字典。
    """
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    file_path = Path(file_path)
    file_name = original_filename or file_path.name
    file_size = file_path.stat().st_size

    logger.info("[%s] 开始处理文档: %s (doc_type=%s)", kb_name, file_name, doc_type)

    if doc_type == "manual":
        return _index_manual_document(
            kb_name, file_path, file_name, file_size, splitter_type,
            chunk_size, chunk_overlap_ratio, enable_cleaning, vs, ds,
        )
    if doc_type == "form":
        return _index_form_document(
            kb_name, file_path, file_name, file_size,
            chunk_size, chunk_overlap_ratio, enable_cleaning, vs, ds,
        )
    # policy（默认）
    return _index_policy_document(
        kb_name, file_path, file_name, file_size, splitter_type,
        chunk_size, chunk_overlap_ratio, enable_cleaning, vs, ds,
    )


# ── 纯文本流水线（policy） ──────────────────────────────────────


def _index_policy_document(
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
    """纯文本文档：解析 → 清洗 → 切分。"""
    # 1. 解析
    logger.info("[%s] 解析文档...", kb_name)
    parser = get_parser(file_path.suffix.lower())
    raw_text = parser.parse(file_path).all_text()

    # 2. 清洗
    text = _clean_or_fallback(raw_text, kb_name, doc_type="policy", enable=enable_cleaning)

    # 3. 切分
    nodes = _split_text(text, file_name, kb_name, splitter_type, chunk_size, chunk_overlap_ratio, doc_type="policy")
    return _embed_and_store(kb_name, file_name, file_size, chunk_size, "policy", nodes, vs, ds)


# ── 图文混排流水线（manual） ─────────────────────────────────────


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
    nodes = _split_text(text, file_name, kb_name, splitter_type, chunk_size, chunk_overlap_ratio, doc_type="manual")
    return _embed_and_store(kb_name, file_name, file_size, chunk_size, "manual", nodes, vs, ds)


# ── 共享工具函数 ──────────────────────────────────────────────


def _clean_or_fallback(
    raw_text: str, kb_name: str, *, doc_type: str, enable: bool
) -> str:
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
    effective_type = splitter_type or splitter_cfg["type"]
    effective_chunk_size = chunk_size or splitter_cfg["chunk_size"]
    effective_overlap = chunk_overlap_ratio or splitter_cfg["chunk_overlap_ratio"]

    # 收集 splitter 特有参数
    extra: dict = {}
    if effective_type == "manual_step":
        extra["use_llm"] = splitter_cfg.get("use_llm", True)
    elif effective_type == "semantic":
        sem_cfg = get_config().get("splitter", {}).get("semantic", {})
        extra["buffer_size"] = sem_cfg.get("buffer_size", 2)
        extra["breakpoint_percentile_threshold"] = sem_cfg.get("breakpoint_percentile_threshold", 90)

    logger.info("[%s] 切分文档 (splitter=%s, chunk_size=%d)...", kb_name, effective_type, effective_chunk_size)
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


# ── 填报模板流水线（form） ──────────────────────────────────────


def _index_form_document(
    kb_name: str,
    file_path: Path,
    file_name: str,
    file_size: int,
    chunk_size: int,
    chunk_overlap_ratio: float,
    enable_cleaning: bool,
    vs: VectorStore,
    ds: DocumentStore,
) -> dict:
    """填报模板入库流程：提取全部文字 → LLM 去除无用信息 → 切分。

    模板类文档的核心价值是其中的文字说明（字段名称、填写要求、注意事项等），
    表格结构本身不需要保留。流程简化为：
    1. 解析出所有文本（表格内容也一并提取为纯文字）
    2. LLM 清洗：去掉空白填写区域、格式噪声、重复表头等无用信息
    3. 切分入库
    """
    logger.info("[%s] form 类型：提取文字 → LLM 清洗 → 切分...", kb_name)

    # 1. 解析��—提取全部文字内容
    parser = get_parser(file_path.suffix.lower())
    parsed = parser.parse(file_path)
    raw_text = parsed.all_text()

    # 2. LLM 清洗——去除模板中的无用信息
    text = _clean_or_fallback(raw_text, kb_name, doc_type="form", enable=enable_cleaning)

    # 3. 切分
    nodes = _split_text(text, file_name, kb_name, "", chunk_size, chunk_overlap_ratio, doc_type="form")
    return _embed_and_store(kb_name, file_name, file_size, chunk_size, "form", nodes, vs, ds)



def _embed_and_store(
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_size: int,
    doc_type: str,
    nodes: list,
    vs: VectorStore,
    ds: DocumentStore,
) -> dict:
    """Embedding → Qdrant → MySQL，带回滚保护。"""
    # Embedding
    logger.info("[%s] 生成 Embedding (%d nodes)...", kb_name, len(nodes))
    embed_model = get_embed_model(text_type="document")
    texts = [n.get_content() for n in nodes]
    try:
        vectors = embed_model.get_text_embedding_batch(texts)
    except Exception as e:
        logger.error("[%s] Embedding 失败 (%d chunks): %s", kb_name, len(texts), e)
        raise RuntimeError(f"向量化失败（{len(texts)} 个 chunk）：{e}") from e

    # 存入 Qdrant
    logger.info("[%s] 写入 Qdrant collection '%s'...", kb_name, kb_name)
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

    # 记录元数据（失败时回滚）
    try:
        doc_record = ds.add_document(
            kb_name=kb_name,
            file_name=file_name,
            file_size=file_size,
            chunk_count=len(nodes),
            chunk_size=chunk_size,
            doc_type=doc_type,
        )
    except Exception as e:
        logger.error("[%s] MySQL 写入失败，回滚 Qdrant 向量: %s", kb_name, e)
        try:
            vs.delete_by_metadata(kb_name, "file_name", file_name)
        except Exception as rollback_err:
            logger.error(
                "[%s] 向量回滚失败，存在孤儿向量，需手动清理: %s", kb_name, rollback_err
            )
        raise

    logger.info("[%s] 文档 '%s' 入库完成，共 %d 个 chunks", kb_name, file_name, len(nodes))
    return {
        "doc_id": doc_record["id"],
        "file_name": file_name,
        "chunk_count": len(nodes),
    }


def _parse_multimodal_pdf_with_kb(
    kb_name: str, file_path: Path, file_name: str
) -> str:
    """解析多模态 PDF，图片写入按知识库+文件名组织的缓存目录。

    将临时文件复制为以原始文件名命名的副本再传给 pymupdf4llm，
    避免图片文件名包含随机临时文件名前缀导致后续找不到图片。
    """
    import shutil
    import tempfile

    image_dir = _get_image_dir(kb_name, file_name)

    # pymupdf4llm 用输入 PDF 的文件名生成图片名；临时文件名是随机的，
    # 需先复制为原始文件名，确保图片名可预期。
    safe_stem = re.sub(r"[^\w\-.]", "_", Path(file_name).stem)[:64]
    with tempfile.TemporaryDirectory() as tmp_dir:
        named_pdf = Path(tmp_dir) / f"{safe_stem}.pdf"
        shutil.copy2(file_path, named_pdf)
        extractor = PdfTextExtractor()
        chunks = extractor.extract_multimodal(named_pdf, image_dir)

    return "\n\n".join(c.content for c in chunks)


def _get_image_dir(kb_name: str, file_name: str) -> Path:
    """按 kb_name / MD5(file_name) 组织图片缓存目录。

    使用 MD5 hash 而非原始文件名，避免中文/特殊字符路径在 Windows 上导致 MuPDF 无法写入图片。
    """
    import hashlib
    dir_name = hashlib.md5(file_name.encode()).hexdigest()[:16]
    return _IMAGE_CACHE_DIR / kb_name / dir_name


def delete_document(
    kb_name: str,
    doc_id: int,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
) -> None:
    """删除文档：从 Qdrant 删除向量 + 从 MySQL 删除记录。"""
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    doc = ds.get_document(doc_id)
    if not doc:
        raise ValueError(f"文档 {doc_id} 不存在")

    vs.delete_by_metadata(kb_name, "file_name", doc["file_name"])
    ds.delete_document(doc_id)
    logger.info("[%s] 文档 '%s' 已删除", kb_name, doc["file_name"])
