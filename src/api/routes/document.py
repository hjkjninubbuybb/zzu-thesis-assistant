"""文档上传与管理接口。"""

import asyncio
import logging
import urllib.parse
from dataclasses import dataclass
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
from src.api.deps import get_document_service
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
from src.exceptions import DocumentNotFoundError, KnowledgeBaseNotFoundError
from src.services.document_service import (
    DocumentService,
    EmptyContentError,
    FileTooLargeError,
    InvalidDocumentStateError,
    UnsupportedFileTypeError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/document", tags=["document"])


@router.get("/{kb_name}", response_model=list[DocInfo])
def list_documents(
    kb_name: str,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """列出知识库下的所有文档。"""
    try:
        docs = svc.list_documents(kb_name)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return [DocInfo(**d) for d in docs]


@router.get("/{kb_name}/{doc_id}", response_model=DocDetail)
def get_document_detail(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """获取文档详情（含摘要和清洗后的内容）。"""
    try:
        doc = svc.get_document(doc_id, kb_name)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return DocDetail(**doc)


@router.put("/{kb_name}/{doc_id}", response_model=DocDetail)
def update_document(
    kb_name: str,
    doc_id: int,
    body: DocUpdate,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """更新文档摘要或清洗后的内容。"""
    try:
        updated_doc = svc.update_document(doc_id, kb_name, summary=body.summary, content=body.content)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return DocDetail(**updated_doc)


@router.post("/{kb_name}/{doc_id}/reindex", response_model=DocInfo)
async def reindex_document_endpoint(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """基于当前数据库中的 content 重新对文档进行切分和向量化。"""
    try:
        doc = await asyncio.to_thread(svc.reindex, kb_name, doc_id)
        return DocInfo(**doc)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("[%s] 重新索引失败: %s", kb_name, e)
        raise HTTPException(status_code=500, detail=f"重新索引失败: {e}") from e


async def _run_upload_and_clean(
    svc: DocumentService,
    kb_name: str,
    content_bytes: bytes,
    filename: str,
    splitter_type: str,
    chunk_size: int,
    chunk_overlap_ratio: float,
    doc_type: str,
) -> dict:
    """在线程中执行 upload_and_clean，统一转换服务层异常。"""
    try:
        return await asyncio.to_thread(
            svc.upload_and_clean,
            kb_name,
            content_bytes,
            filename,
            splitter_type,
            chunk_size,
            chunk_overlap_ratio,
            doc_type,
        )
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e)) from e
    except Exception as e:
        logger.error("[%s] upload_and_clean 失败: %s", kb_name, e)
        raise HTTPException(status_code=500, detail=f"上传失败: {e}") from e


@router.post("/{kb_name}/upload-and-clean", response_model=CleanResult)
async def upload_and_clean(
    kb_name: str,
    file: UploadFile = File(...),
    splitter_type: str = Form(default="recursive"),
    chunk_size: int = Form(default=256, ge=64, le=1024),
    chunk_overlap_ratio: float = Form(default=0.2, ge=0.0, le=0.5),
    doc_type: str = Form(default="policy"),
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """上传文件 → 解析 → 清洗 → 返回清洗文本供审核。"""
    content_bytes = await file.read()
    result = await _run_upload_and_clean(
        svc,
        kb_name,
        content_bytes,
        file.filename or "upload",
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        doc_type,
    )
    return CleanResult(**result)


@router.post("/{kb_name}/{doc_id}/confirm-clean", response_model=ChunkPreviewResult)
async def confirm_clean(
    kb_name: str,
    doc_id: int,
    body: ConfirmCleanRequest,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """确认清洗文本 → 执行分块 → 返回分块预览。"""
    try:
        result = await asyncio.to_thread(svc.confirm_clean, kb_name, doc_id, body.content)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except InvalidDocumentStateError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except EmptyContentError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    chunks = [ChunkPreview(index=c["index"], content=c["content"]) for c in result["chunks"]]
    return ChunkPreviewResult(doc_id=doc_id, chunks=chunks, chunk_count=result["chunk_count"])


@router.post("/{kb_name}/{doc_id}/confirm-index", response_model=ConfirmIndexResult)
async def confirm_index(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """确认分块结果 → 向量化入库。"""
    try:
        result = await asyncio.to_thread(svc.confirm_index, kb_name, doc_id)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except InvalidDocumentStateError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ConfirmIndexResult(**result)


@router.get("/{kb_name}/{doc_id}/review", response_model=ReviewDetail)
async def get_review_detail(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """获取审核中文档的详情（清洗文本 + 分块预览）。"""
    try:
        detail = svc.get_review_detail(kb_name, doc_id)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except InvalidDocumentStateError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    chunks = None
    if detail.get("chunks"):
        chunks = [ChunkPreview(**c) for c in detail["chunks"]]
    return ReviewDetail(
        doc_id=detail["doc_id"],
        file_name=detail["file_name"],
        status=detail["status"],
        cleaned_content=detail.get("cleaned_content"),
        chunks=chunks,
        doc_type=detail.get("doc_type", "policy"),
        splitter_type=detail.get("splitter_type", "recursive"),
        chunk_size=detail.get("chunk_size", 256),
        chunk_overlap_ratio=detail.get("chunk_overlap_ratio", 0.2),
    )


@dataclass
class _UploadParams:
    kb_name: str
    splitter_type: str
    chunk_size: int
    chunk_overlap_ratio: float
    enable_cleaning: bool
    doc_type: str


async def _run_upload_document(svc: DocumentService, tmp_path: Path, filename: str, p: _UploadParams) -> dict:
    """在线程中执行 upload_document，统一转换服务层异常。"""
    try:
        return await asyncio.to_thread(
            svc.upload_document,
            p.kb_name,
            tmp_path,
            filename,
            p.splitter_type,
            p.chunk_size,
            p.chunk_overlap_ratio,
            p.enable_cleaning,
            p.doc_type,
        )
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e)) from e
    except Exception as e:
        logger.error("[%s] 上传失败: %s", p.kb_name, e)
        raise HTTPException(status_code=500, detail=f"上传失败: {e}") from e


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
    svc: DocumentService = Depends(get_document_service),
):
    """上传文档并入库（最大 10 MB）。"""
    import shutil
    import tempfile

    params = _UploadParams(kb_name, splitter_type, chunk_size, chunk_overlap_ratio, enable_cleaning, doc_type)
    safe_filename = Path(file.filename or "upload").name
    ext = Path(safe_filename).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)
    try:
        return DocInfo(**await _run_upload_document(svc, tmp_path, safe_filename, params))
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/{kb_name}/download-token/{doc_id}")
def get_download_token(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(get_current_user),
    svc: DocumentService = Depends(get_document_service),
):
    """为指定文档签发一个 2 分钟有效的下载令牌。

    前端凭此令牌拼接到下载 URL 的 ?token= 参数，浏览器可直接跳转下载，
    无需在请求头中携带 Authorization。
    """
    try:
        svc.get_document(doc_id, kb_name)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    token = create_download_token(doc_id, kb_name)
    return {"token": token, "expires_in": 120}


def _verify_download_auth(token: str | None, authorization: str | None, doc_id: int, kb_name: str) -> None:
    """验证下载请求的认证凭据（短期 token 或 Bearer token）。"""
    if token:
        verify_download_token(token, doc_id, kb_name)
    elif authorization and authorization.startswith("Bearer "):
        decode_token(authorization[len("Bearer ") :], token_type="access")
    else:
        raise HTTPException(status_code=401, detail="需要认证：请提供 ?token= 或 Authorization header")


@router.get("/{kb_name}/download/{doc_id}")
def download_document(
    kb_name: str,
    doc_id: int,
    token: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    svc: DocumentService = Depends(get_document_service),
):
    """下载已上传的原始文件。

    支持两种认证方式（二选一）：
    - ?token=xxx  : 由 /download-token/{doc_id} 签发的短期下载令牌（推荐，供浏览器直接跳转）
    - Authorization: Bearer xxx : 普通登录 token（兼容旧调用方式）
    """
    _verify_download_auth(token, authorization, doc_id, kb_name)
    try:
        file_path = svc.get_file_path(doc_id, kb_name)
        doc_name = svc.get_document_name(doc_id, kb_name)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    encoded_name = urllib.parse.quote(doc_name, safe="")
    return FileResponse(
        path=str(file_path),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.delete("/{kb_name}/{doc_id}", response_model=MessageResponse)
def remove_document(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
    svc: DocumentService = Depends(get_document_service),
):
    """删除文档。"""
    try:
        result = svc.delete(kb_name, doc_id)
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return MessageResponse(message=result["message"])
