"""文档上传与管理接口。"""

import asyncio
import json
import logging
import shutil
import tempfile
import urllib.parse
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse

from src.api.auth import (
    create_download_token,
    decode_token,
    get_current_user,
    require_teacher_or_admin,
    verify_download_token,
)
from src.api.schemas import (
    ChunkPreview,
    ChunkPreviewResult,
    CleanResult,
    ConfirmCleanRequest,
    ConfirmIndexResult,
    DocDetail,
    DocInfo,
    DocUpdate,
    MessageResponse,
    ReviewDetail,
)
from src.core.indexing import (
    delete_document,
    embed_and_store_nodes,
    index_document,
    parse_and_clean,
    reindex_document,
    split_content,
)
from src.core.rag.retriever import invalidate_corpus_cache
from src.parsers import SUPPORTED_EXTS
from src.parsers.converter import CONVERTIBLE_EXTS, convert_to_pdf
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/document", tags=["document"])

_ds = DocumentStore()
_vs = VectorStore()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# 原始文件持久化目录：data/uploads/{kb_name}/{doc_id}_{filename}
_UPLOADS_DIR = Path(__file__).parents[3] / "data" / "uploads"


@router.get("/{kb_name}", response_model=list[DocInfo])
def list_documents(kb_name: str, _: dict = Depends(require_teacher_or_admin)):
    """列出知识库下的所有文档。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    docs = _ds.list_documents(kb_name)
    return [DocInfo(**d) for d in docs]


@router.get("/{kb_name}/{doc_id}", response_model=DocDetail)
def get_document_detail(
    kb_name: str, doc_id: int, _: dict = Depends(require_teacher_or_admin)
):
    """获取文档详情（含摘要和清洗后的内容）。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="文档不存在")
    return DocDetail(**doc)


@router.put("/{kb_name}/{doc_id}", response_model=DocDetail)
def update_document(
    kb_name: str,
    doc_id: int,
    body: DocUpdate,
    _: dict = Depends(require_teacher_or_admin),
):
    """更新文档摘要或清洗后的内容。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="文档不存在")

    _ds.update_document(doc_id, summary=body.summary, content=body.content)
    updated_doc = _ds.get_document(doc_id)
    return DocDetail(**updated_doc)


@router.post("/{kb_name}/{doc_id}/reindex", response_model=DocInfo)
async def reindex_document_endpoint(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
):
    """基于当前数据库中的 content 重新对文档进行切分和向量化。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    try:
        await asyncio.to_thread(
            reindex_document,
            kb_name=kb_name,
            doc_id=doc_id,
            vector_store=_vs,
            doc_store=_ds,
        )
        doc = _ds.get_document(doc_id)
        invalidate_corpus_cache(kb_name)
        return DocInfo(**doc)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("[%s] 重新索引失败: %s", kb_name, e)
        raise HTTPException(status_code=500, detail=f"重新索引失败: {e}")


@router.post("/{kb_name}/upload-and-clean", response_model=CleanResult)
async def upload_and_clean(
    kb_name: str,
    file: UploadFile = File(...),
    splitter_type: str = Form(default="recursive"),
    chunk_size: int = Form(default=256, ge=64, le=1024),
    chunk_overlap_ratio: float = Form(default=0.2, ge=0.0, le=0.5),
    doc_type: str = Form(default="policy"),
    _: dict = Depends(require_teacher_or_admin),
):
    """上传文件 → 解析 → 清洗 → 返回清洗文本供审核。"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTS and ext not in CONVERTIBLE_EXTS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")

    tmp = _UPLOADS_DIR / kb_name / f"tmp_{file.filename}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    try:
        content_bytes = await file.read()
        if len(content_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "文件大小超过 10 MB 限制")
        tmp.write_bytes(content_bytes)

        file_path = tmp
        original_name = file.filename or tmp.name
        if ext in CONVERTIBLE_EXTS:
            file_path = convert_to_pdf(tmp)
            original_name = Path(original_name).with_suffix(".pdf").name

        cleaned_text = await asyncio.to_thread(
            parse_and_clean,
            kb_name=kb_name,
            file_path=file_path,
            original_filename=original_name,
            doc_type=doc_type,
            enable_cleaning=True,
        )

        file_size = len(content_bytes)
        doc_record = _ds.add_document(
            kb_name=kb_name,
            file_name=original_name,
            file_size=file_size,
            chunk_count=0,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            doc_type=doc_type,
            splitter_type=splitter_type,
            status="pending_review",
            content=cleaned_text,
        )

        # Persist original file
        dest = _UPLOADS_DIR / kb_name / f"{doc_record['id']}_{original_name}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if file_path != tmp:
            shutil.copy2(file_path, dest)
        else:
            tmp.rename(dest)

        return CleanResult(
            doc_id=doc_record["id"],
            file_name=original_name,
            cleaned_content=cleaned_text,
            doc_type=doc_type,
            splitter_type=splitter_type,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
        )
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


@router.post("/{kb_name}/{doc_id}/confirm-clean", response_model=ChunkPreviewResult)
async def confirm_clean(
    kb_name: str,
    doc_id: int,
    body: ConfirmCleanRequest,
    _: dict = Depends(require_teacher_or_admin),
):
    """确认清洗文本 → 执行分块 → 返回分块预览。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(404, "文档不存在")
    if doc["status"] != "pending_review":
        raise HTTPException(
            400, f"文档状态不正确: {doc['status']}，需要 pending_review"
        )

    _ds.update_document(doc_id, content=body.content)

    nodes = await asyncio.to_thread(
        split_content,
        text=body.content,
        file_name=doc["file_name"],
        kb_name=kb_name,
        splitter_type=doc.get("splitter_type", "recursive"),
        chunk_size=doc.get("chunk_size", 256),
        chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
        doc_type=doc.get("doc_type", "policy"),
    )

    chunks_data = []
    for i, node in enumerate(nodes):
        chunks_data.append(
            {
                "index": i,
                "content": node.get_content(),
                "metadata": {k: v for k, v in node.metadata.items()},
                "node_id": node.node_id,
            }
        )
    _ds.update_document(
        doc_id,
        chunks_preview=json.dumps(chunks_data, ensure_ascii=False),
        status="pending_chunk_review",
    )

    chunks = [ChunkPreview(index=c["index"], content=c["content"]) for c in chunks_data]
    return ChunkPreviewResult(doc_id=doc_id, chunks=chunks, chunk_count=len(chunks))


@router.post("/{kb_name}/{doc_id}/confirm-index", response_model=ConfirmIndexResult)
async def confirm_index(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
):
    """确认分块结果 → 向量化入库。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(404, "文档不存在")
    if doc["status"] != "pending_chunk_review":
        raise HTTPException(
            400, f"文档状态不正确: {doc['status']}，需要 pending_chunk_review"
        )

    chunks_json = doc.get("chunks_preview")
    if not chunks_json:
        raise HTTPException(400, "分块预览数据丢失")

    chunks_data = json.loads(chunks_json)

    from llama_index.core.schema import TextNode

    nodes = []
    for c in chunks_data:
        node = TextNode(
            text=c["content"],
            metadata=c.get("metadata", {}),
            id_=c.get("node_id", ""),
        )
        nodes.append(node)

    result = await asyncio.to_thread(
        embed_and_store_nodes,
        kb_name=kb_name,
        file_name=doc["file_name"],
        file_size=doc.get("file_size", 0),
        chunk_size=doc.get("chunk_size", 256),
        doc_type=doc.get("doc_type", "policy"),
        nodes=nodes,
        full_text=doc.get("content", ""),
        splitter_type=doc.get("splitter_type", "recursive"),
        chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
        vector_store=_vs,
        doc_store=_ds,
        doc_id=doc_id,
    )

    return ConfirmIndexResult(
        doc_id=doc_id,
        status="active",
        chunk_count=result["chunk_count"],
    )


@router.get("/{kb_name}/{doc_id}/review", response_model=ReviewDetail)
async def get_review_detail(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
):
    """获取审核中文档的详情（清洗文本 + 分块预览）。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(404, "文档不存在")
    if doc["status"] not in ("pending_review", "pending_chunk_review"):
        raise HTTPException(400, f"文档不在审核状态: {doc['status']}")

    chunks = None
    if doc["status"] == "pending_chunk_review" and doc.get("chunks_preview"):
        chunks_data = json.loads(doc["chunks_preview"])
        chunks = [
            ChunkPreview(index=c["index"], content=c["content"]) for c in chunks_data
        ]

    return ReviewDetail(
        doc_id=doc_id,
        file_name=doc["file_name"],
        status=doc["status"],
        cleaned_content=doc.get("content"),
        chunks=chunks,
        doc_type=doc.get("doc_type", "policy"),
        splitter_type=doc.get("splitter_type", "recursive"),
        chunk_size=doc.get("chunk_size", 256),
        chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
    )


@router.post("/{kb_name}/upload", response_model=DocInfo)
async def upload_document(
    kb_name: str,
    file: UploadFile = File(...),
    splitter_type: str = Form(default="recursive"),
    chunk_size: int = Form(default=256, ge=64, le=1024),
    chunk_overlap_ratio: float = Form(default=0.2, ge=0.0, le=0.5),
    enable_cleaning: bool = Form(default=False),
    doc_type: str = Form(default="policy"),
    _: dict = Depends(require_teacher_or_admin),
):
    """上传文档并入库（最大 10 MB）。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    # 路径遍历防护：只取文件名，丢弃目录部分
    safe_filename = Path(file.filename or "upload").name
    ext = Path(safe_filename).suffix.lower()
    if ext not in (SUPPORTED_EXTS | CONVERTIBLE_EXTS):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 '{ext}'，支持: {', '.join(SUPPORTED_EXTS)}",
        )

    # 保存到临时文件
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    pdf_tmp: Path | None = None
    try:
        # 文件大小校验（写入后检查实际大小）
        if tmp_path.stat().st_size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"文件过大，最大支持 {MAX_UPLOAD_BYTES // 1024 // 1024} MB",
            )

        # Word 文档先转 PDF，再走统一的 PDF 解析流程
        index_path: Path = tmp_path
        if ext in CONVERTIBLE_EXTS:
            try:
                converted: Path = await asyncio.to_thread(convert_to_pdf, tmp_path)
                pdf_tmp = converted
                index_path = converted
                logger.info("[%s] 已转换为 PDF: %s", kb_name, safe_filename)
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"文件转换失败：{e}")

        # index_document 含 LLM 调用和 Qdrant 写入，需用 to_thread 避免阻塞事件循环
        result = await asyncio.to_thread(
            index_document,
            kb_name=kb_name,
            file_path=index_path,
            splitter_type=splitter_type,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            enable_cleaning=enable_cleaning,
            doc_type=doc_type,
            vector_store=_vs,
            doc_store=_ds,
            original_filename=safe_filename,
        )

        # 持久化原始文件（供后续下载，保存原始 Word 文件而非转换后的 PDF）
        doc_id = result["doc_id"]
        upload_dir = _UPLOADS_DIR / kb_name
        upload_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp_path, upload_dir / f"{doc_id}_{safe_filename}")
        logger.info("[%s] 文件已持久化: %s", kb_name, f"{doc_id}_{safe_filename}")

        doc = _ds.get_document(result["doc_id"])
        invalidate_corpus_cache(kb_name)
        return DocInfo(**doc)
    finally:
        tmp_path.unlink(missing_ok=True)
        if pdf_tmp:
            pdf_tmp.unlink(missing_ok=True)


@router.post("/{kb_name}/download-token/{doc_id}")
def get_download_token(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(get_current_user),
):
    """为指定文档签发一个 2 分钟有效的下载令牌。

    前端凭此令牌拼接到下载 URL 的 ?token= 参数，浏览器可直接跳转下载，
    无需在请求头中携带 Authorization。
    """
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="文档不存在")
    token = create_download_token(doc_id, kb_name)
    return {"token": token, "expires_in": 120}


@router.get("/{kb_name}/download/{doc_id}")
def download_document(
    kb_name: str,
    doc_id: int,
    token: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
):
    """下载已上传的原始文件。

    支持两种认证方式（二选一）：
    - ?token=xxx  : 由 /download-token/{doc_id} 签发的短期下载令牌（推荐，供浏览器直接跳转）
    - Authorization: Bearer xxx : 普通登录 token（兼容旧调用方式）
    """
    if token:
        verify_download_token(token, doc_id, kb_name)
    elif authorization and authorization.startswith("Bearer "):
        decode_token(authorization[len("Bearer ") :], token_type="access")
    else:
        raise HTTPException(
            status_code=401, detail="需要认证：请提供 ?token= 或 Authorization header"
        )

    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="文档不存在")

    matches = list((_UPLOADS_DIR / kb_name).glob(f"{doc_id}_*"))
    if not matches:
        raise HTTPException(
            status_code=404,
            detail="原始文件未找到（可能在文件持久化功能上线前上传，请重新上传）",
        )

    encoded_name = urllib.parse.quote(doc["file_name"], safe="")
    return FileResponse(
        path=str(matches[0]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.delete("/{kb_name}/{doc_id}", response_model=MessageResponse)
def remove_document(
    kb_name: str, doc_id: int, _: dict = Depends(require_teacher_or_admin)
):
    """删除文档。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="文档不存在")
    delete_document(kb_name, doc_id, vector_store=_vs, doc_store=_ds)
    invalidate_corpus_cache(kb_name)

    # 清理持久化文件
    for f in (_UPLOADS_DIR / kb_name).glob(f"{doc_id}_*"):
        f.unlink(missing_ok=True)

    return MessageResponse(message=f"文档 '{doc['file_name']}' 已删除")
