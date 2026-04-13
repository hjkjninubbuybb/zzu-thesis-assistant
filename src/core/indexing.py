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

from llama_index.core.schema import Document, TextNode

from src.core.splitter import create_splitter
from src.core.cleaning import clean_text
from src.parsers import get_parser
from src.parsers.base import ChunkType
from src.parsers.pdf.text_extractor import PdfTextExtractor
from src.core.image_describer import inject_image_descriptions
from src.storage.vector_store import VectorStore
from src.storage.document_store import DocumentStore
from src.core.embedding import get_embed_model
from src.config import get_config

logger = logging.getLogger(__name__)

# 图片临时目录（相对项目根）
_IMAGE_CACHE_DIR = Path(__file__).parents[2] / "data" / "images"

# Markdown 表格行：以 | 开头，且包含至少一个 |
_TABLE_LINE_RE = re.compile(r"^\s*\|.+\|")


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
    """完整的文档入库流程。

    向量写入 Qdrant 后若 SQLite 记录写入失败，自动回滚已写入的向量，
    保证两者始终一致。

    Args:
        doc_type: ``"policy"``（默认）/ ``"manual"`` / ``"form"``。
                  manual 仅对 PDF 有效，会额外执行 VLM 图片描述注入。
                  form 对表格逐块提取为自然语言。

    Returns:
        包含 doc_id / file_name / chunk_count 的字典。
    """
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    file_path = Path(file_path)
    file_name = original_filename or file_path.name
    file_size = file_path.stat().st_size

    logger.info("[%s] 开始处理文档: %s (doc_type=%s)", kb_name, file_name, doc_type)

    # form 类型走独立分支
    if doc_type == "form":
        return _index_form_document(
            kb_name=kb_name,
            file_path=file_path,
            file_name=file_name,
            file_size=file_size,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            enable_cleaning=enable_cleaning,
            vs=vs,
            ds=ds,
        )

    # 1. 解析文档（多模态 PDF 走独立分支）
    if doc_type == "manual" and file_path.suffix.lower() == ".pdf":
        raw_text = _parse_multimodal_pdf_with_kb(kb_name, file_path, file_name)
    else:
        logger.info("[%s] 解析文档...", kb_name)
        parser = get_parser(file_path.suffix.lower())
        parsed_doc = parser.parse(file_path)
        raw_text = parsed_doc.all_text()

    # 2. 清洗（可选）——失败时回退原始文本，不影响入库
    if enable_cleaning:
        logger.info("[%s] LLM 清洗中 (doc_type=%s)...", kb_name, doc_type)
        try:
            text = clean_text(raw_text, doc_type=doc_type)
        except Exception as e:
            logger.warning("[%s] 清洗失败，使用原始文本: %s", kb_name, e)
            text = raw_text
    else:
        text = raw_text

    # 3. 图文模式：VLM 描述注入（将 ![IMG_xxx](path) 替换为文字描述）
    if doc_type == "manual" and file_path.suffix.lower() == ".pdf":
        image_dir = _get_image_dir(kb_name, file_name)
        logger.info("[%s] VLM 图片描述注入...", kb_name)
        try:
            cfg = get_config()
            vlm_model = cfg.get("vlm", {}).get("model", "qwen-vl-plus")
            text = inject_image_descriptions(text, image_dir, vlm_model)
        except Exception as e:
            logger.warning("[%s] VLM 描述注入失败，保留占位符原文: %s", kb_name, e)

    # 4. 切分
    logger.info("[%s] 切分文档 (splitter=%s, chunk_size=%d)...", kb_name, splitter_type, chunk_size)
    doc = Document(text=text, metadata={"file_name": file_name, "kb_name": kb_name})
    splitter = create_splitter(splitter_type, chunk_size, chunk_overlap_ratio)
    nodes = splitter.split([doc])
    logger.info("[%s] 切分为 %d 个 chunks", kb_name, len(nodes))

    return _embed_and_store(kb_name, file_name, file_size, chunk_size, doc_type, nodes, vs, ds)


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
    """form 类型专属入库流程。

    - TABLE chunk → LLM 提取为自然语言（form_table），每张表一个 node
    - TEXT chunk → 正常切分
    - PDF 文件：先用正则从 Markdown 中识别表格块，再分别处理
    """
    logger.info("[%s] form 类型：逐 chunk 处理（表格提取 + 文本切分）...", kb_name)

    parser = get_parser(file_path.suffix.lower())
    parsed = parser.parse(file_path)
    splitter = create_splitter("recursive", chunk_size, chunk_overlap_ratio)
    nodes: list = []

    # DOCX：DocxParser 已输出 TABLE/TEXT 分离的 chunks
    # PDF/TXT：all_text() 返回一整块，需要正则识别 Markdown 表格
    has_typed_chunks = any(c.chunk_type == ChunkType.TABLE for c in parsed.chunks)

    if has_typed_chunks:
        # DOCX 路径：直接使用 chunk_type 信息
        for chunk in parsed.chunks:
            if chunk.chunk_type == ChunkType.TABLE:
                content = chunk.content
                if enable_cleaning:
                    logger.info("[%s] 表格 LLM 提取中...", kb_name)
                    try:
                        content = clean_text(content, content_type="form_table")
                    except Exception as e:
                        logger.warning("[%s] 表格提取失败，保留原文: %s", kb_name, e)
                if content.strip():
                    nodes.append(TextNode(
                        text=content,
                        metadata={"file_name": file_name, "kb_name": kb_name, "source": "table"},
                    ))
            else:
                text = chunk.content
                if enable_cleaning:
                    try:
                        text = clean_text(text, content_type="text")
                    except Exception as e:
                        logger.warning("[%s] 文本清洗失败，保留原文: %s", kb_name, e)
                if text.strip():
                    doc = Document(text=text, metadata={"file_name": file_name, "kb_name": kb_name})
                    nodes.extend(splitter.split([doc]))
    else:
        # PDF/TXT 路径：正则识别 Markdown 表格块
        raw_text = parsed.all_text()
        for segment, is_table in _split_markdown_tables(raw_text):
            if not segment.strip():
                continue
            if is_table:
                content = segment
                if enable_cleaning:
                    logger.info("[%s] 表格 LLM 提取中...", kb_name)
                    try:
                        content = clean_text(segment, content_type="form_table")
                    except Exception as e:
                        logger.warning("[%s] 表格提取失败，保留原文: %s", kb_name, e)
                if content.strip():
                    nodes.append(TextNode(
                        text=content,
                        metadata={"file_name": file_name, "kb_name": kb_name, "source": "table"},
                    ))
            else:
                text = segment
                if enable_cleaning:
                    try:
                        text = clean_text(segment, content_type="text")
                    except Exception as e:
                        logger.warning("[%s] 文本清洗失败，保留原文: %s", kb_name, e)
                if text.strip():
                    doc = Document(text=text, metadata={"file_name": file_name, "kb_name": kb_name})
                    nodes.extend(splitter.split([doc]))

    logger.info("[%s] form 处理完成，共 %d 个 nodes", kb_name, len(nodes))
    return _embed_and_store(kb_name, file_name, file_size, chunk_size, "form", nodes, vs, ds)


def _split_markdown_tables(text: str) -> list[tuple[str, bool]]:
    """将 Markdown 文本按表格边界拆分为 (内容, is_table) 列表。

    连续的 | 开头行视为一个表格块，其余为文本块。
    """
    segments: list[tuple[str, bool]] = []
    lines = text.splitlines(keepends=True)
    current: list[str] = []
    in_table = False

    for line in lines:
        is_table_line = bool(_TABLE_LINE_RE.match(line))
        if is_table_line != in_table:
            if current:
                segments.append(("".join(current), in_table))
            current = [line]
            in_table = is_table_line
        else:
            current.append(line)

    if current:
        segments.append(("".join(current), in_table))

    return segments


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
    """Embedding → Qdrant → SQLite，带回滚保护。"""
    # Embedding
    logger.info("[%s] 生成 Embedding (%d nodes)...", kb_name, len(nodes))
    embed_model = get_embed_model(text_type="document")
    texts = [n.get_content() for n in nodes]
    vectors = embed_model.get_text_embedding_batch(texts)

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
        logger.error("[%s] SQLite 写入失败，回滚 Qdrant 向量: %s", kb_name, e)
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
    """解析多模态 PDF，图片写入按知识库+文件名组织的缓存目录。"""
    image_dir = _get_image_dir(kb_name, file_name)
    extractor = PdfTextExtractor()
    chunks = extractor.extract_multimodal(file_path, image_dir)
    return "\n\n".join(c.content for c in chunks)


def _get_image_dir(kb_name: str, file_name: str) -> Path:
    """按 kb_name / file_stem 组织图片缓存目录。"""
    stem = Path(file_name).stem
    return _IMAGE_CACHE_DIR / kb_name / stem


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

    vs.delete_by_metadata(kb_name, "file_name", doc["file_name"])
    ds.delete_document(doc_id)
    logger.info("[%s] 文档 '%s' 已删除", kb_name, doc["file_name"])
