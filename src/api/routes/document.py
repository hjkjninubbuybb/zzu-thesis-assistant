"""文档上传与管理接口。"""

import asyncio
import logging
import shutil
import tempfile
import urllib.parse
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from src.api.auth import (
    require_teacher_or_admin,
    get_current_user,
    create_download_token,
    verify_download_token,
    decode_token,
)
from src.api.schemas import DocInfo, DocDetail, DocUpdate, MessageResponse
from src.core.indexing import index_document, delete_document, reindex_document
from src.core.retrieval import invalidate_corpus_cache
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
def get_document_detail(kb_name: str, doc_id: int, _: dict = Depends(require_teacher_or_admin)):
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
        result = await asyncio.to_thread(
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
        decode_token(authorization[len("Bearer "):], token_type="access")
    else:
        raise HTTPException(status_code=401, detail="需要认证：请提供 ?token= 或 Authorization header")

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
def remove_document(kb_name: str, doc_id: int, _: dict = Depends(require_teacher_or_admin)):
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
