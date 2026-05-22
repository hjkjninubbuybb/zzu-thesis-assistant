"""文档索引流程：解析 → 清洗 → 切分 → Embedding → 存入 Qdrant。

支持三种文档类型：
- ``policy``：政策文件，纯文本流程（默认）
- ``manual``：操作手册，图文混排流程，仅对 PDF 生效
  额外步骤：提取图片 → 清洗（含占位符校验）→ VLM 批量描述注入
- ``form``：填报模板/格式规范，Evaluator-Optimizer 工作流按主题提取 → 直接向量化
"""

import logging
import re
from pathlib import Path

from llama_index.core.schema import Document, TextNode

from src.config import get_config
from src.core.cleaning import clean_text
from src.core.form_extraction import extract_form_sections
from src.core.image_describer import inject_image_descriptions
from src.core.llm_factory import get_llm
from src.core.rag.embedding import get_embed_model
from src.core.splitter import create_splitter
from src.parsers import get_parser
from src.parsers.pdf.text_extractor import PdfTextExtractor
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

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
    text = _clean_or_fallback(
        raw_text, kb_name, doc_type="policy", enable=enable_cleaning
    )

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
    text = _clean_or_fallback(
        raw_text, kb_name, doc_type="manual", enable=enable_cleaning
    )

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
    effective_type = splitter_type if splitter_type else splitter_cfg["type"]
    effective_chunk_size = chunk_size if chunk_size else splitter_cfg["chunk_size"]
    effective_overlap = (
        chunk_overlap_ratio
        if chunk_overlap_ratio is not None
        else splitter_cfg["chunk_overlap_ratio"]
    )

    # 收集 splitter 特有参数
    extra: dict = {}
    if effective_type == "manual_step":
        extra["use_llm"] = splitter_cfg.get("use_llm", True)
    elif effective_type == "semantic":
        sem_cfg = get_config().get("splitter", {}).get("semantic", {})
        extra["buffer_size"] = sem_cfg.get("buffer_size", 2)
        extra["breakpoint_percentile_threshold"] = sem_cfg.get(
            "breakpoint_percentile_threshold", 90
        )

    logger.info(
        "[%s] 切分文档 (splitter=%s, chunk_size=%d)...",
        kb_name,
        effective_type,
        effective_chunk_size,
    )
    doc = Document(text=text, metadata={"file_name": file_name, "kb_name": kb_name})
    splitter = create_splitter(
        effective_type, effective_chunk_size, effective_overlap, **extra
    )
    nodes = splitter.split([doc])

    # ManualStepSplitter 产出 0 nodes 时回退到 recursive
    if effective_type == "manual_step" and len(nodes) == 0:
        logger.warning(
            "[%s] ManualStepSplitter 产出 0 nodes，回退到 recursive", kb_name
        )
        splitter = create_splitter("recursive", effective_chunk_size, effective_overlap)
        nodes = splitter.split([doc])

    logger.info("[%s] 切分为 %d 个 chunks", kb_name, len(nodes))
    return nodes


# ── 公开阶段函数（供审核流程独立调用） ────────────────────────────


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
    elif doc_type == "form":
        raw_text = parser.parse(file_path).all_text()
    else:
        raw_text = parser.parse(file_path).all_text()

    text = _clean_or_fallback(
        raw_text, kb_name, doc_type=doc_type, enable=enable_cleaning
    )

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


# ── 填报模板流水线（form） ──────────────────────────────────────


def _index_form_document(
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
    """填报模板/格式规范入库流程：Evaluator-Optimizer 按主题提取 → 直接向量化。

    1. 解析出全部文本
    2. 调用 extract_form_sections() 按主题提取信息（强模型提取 + 快速模型评估，最多重试 3 次）
    3. 提取成功：每个 section → TextNode（带 section_topic 元数据），直接向量化
    4. 提取失败（空列表）：fallback 到 recursive 切分
    """
    logger.info("[%s] form 类型：Evaluator-Optimizer 主题提取...", kb_name)

    # 1. 解析
    parser = get_parser(file_path.suffix.lower())
    parsed = parser.parse(file_path)
    raw_text = parsed.all_text()

    # 2. LLM 按主题提取
    extraction = extract_form_sections(raw_text, file_name)
    sections = extraction["sections"]
    extraction_status = extraction["status"]

    if sections:
        # 有实质内容：每个 section 直接作为一个 TextNode
        logger.info(
            "[%s] 提取到 %d 个 sections，构建 TextNode...", kb_name, len(sections)
        )
        nodes = [
            TextNode(
                text=s["content"],
                metadata={
                    "file_name": file_name,
                    "kb_name": kb_name,
                    "section_topic": s["topic"],
                },
            )
            for s in sections
        ]
        full_text = "\n\n".join(s["content"] for s in sections)
    elif extraction_status == "PASS":
        # 主动判断无实质内容（空白表单等）：不存 chunk，不 fallback
        logger.info("[%s] form 文档无实质内容，跳过向量化", kb_name)
        nodes = []
        full_text = raw_text
    else:
        # 提取失败（LLM 异常或重试耗尽）：fallback 到 recursive 切分
        logger.warning("[%s] form 提取失败，fallback 到 recursive 切分", kb_name)
        nodes = _split_text(
            raw_text,
            file_name,
            kb_name,
            splitter_type,
            chunk_size,
            chunk_overlap_ratio,
            doc_type="form",
        )
        full_text = raw_text

    return _embed_and_store(
        kb_name,
        file_name,
        file_size,
        chunk_size,
        "form",
        nodes,
        vs,
        ds,
        full_text=full_text,
        splitter_type=splitter_type,
        chunk_overlap_ratio=chunk_overlap_ratio,
    )


def _embed_and_store(
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_size: int,
    doc_type: str,
    nodes: list,
    vs: VectorStore,
    ds: DocumentStore,
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
        logger.info(
            "[%s] 无可索引内容（0 nodes），仅写入元数据: %s", kb_name, file_name
        )
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

    logger.info(
        "[%s] 文档 '%s' 入库完成，共 %d 个 chunks", kb_name, file_name, len(nodes)
    )
    return {
        "doc_id": doc_id,
        "file_name": file_name,
        "chunk_count": len(nodes),
    }


def _parse_multimodal_pdf_with_kb(kb_name: str, file_path: Path, file_name: str) -> str:
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
    """基于数据库中现有的 content 重新索引文档（切分 + Embedding + Qdrant）。"""
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

    logger.info(
        "[%s] 文档 '%s' 重新索引完成，共 %d 个 chunks", kb_name, file_name, len(nodes)
    )
    return {
        "doc_id": doc_id,
        "file_name": file_name,
        "chunk_count": len(nodes),
    }
