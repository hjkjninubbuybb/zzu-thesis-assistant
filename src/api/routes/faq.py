"""FAQ CRUD 路由。"""

import asyncio
import logging
import urllib.parse

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi import Query as QueryParam
from fastapi.responses import Response

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.deps import get_faq_service
from src.api.schemas import (
    FAQCreate,
    FAQImportResult,
    FAQItem,
    FAQSearchResponse,
    FAQUpdate,
    MessageResponse,
)
from src.exceptions import FAQNotFoundError, KnowledgeBaseNotFoundError
from src.services.faq_service import FAQService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faq", tags=["faq"])


@router.get("/{kb_name}", response_model=list[FAQItem])
async def list_faqs(
    kb_name: str,
    status: str | None = QueryParam(None, pattern=r"^(draft|pending|approved|rejected)$"),
    current_user: dict = Depends(get_current_user),
    svc: FAQService = Depends(get_faq_service),
) -> list[dict]:
    try:
        return await asyncio.to_thread(svc.list_faqs, kb_name, status, current_user["role"])
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{kb_name}", response_model=FAQItem)
async def create_faq(
    kb_name: str,
    body: FAQCreate,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    try:
        return await asyncio.to_thread(
            svc.create,
            kb_name,
            body.question,
            body.answer,
            body.category,
            body.sort_order,
            current_user["id"],
            current_user["role"],
        )
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{kb_name}/{faq_id}", response_model=FAQItem)
async def update_faq(
    kb_name: str,
    faq_id: int,
    body: FAQUpdate,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    updates = body.model_dump(exclude_none=True)
    try:
        return await asyncio.to_thread(
            svc.update,
            kb_name,
            faq_id,
            current_user["id"],
            current_user["role"],
            **updates,
        )
    except FAQNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e


@router.get("/{kb_name}/search", response_model=FAQSearchResponse)
async def search_faqs(
    kb_name: str,
    q: str = QueryParam(..., min_length=1, description="搜索词，LLM 改写后语义向量检索"),
    current_user: dict = Depends(get_current_user),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    """LLM 改写查询 + 语义向量检索 FAQ（仅返回已启用的条目）。"""
    try:
        return await asyncio.to_thread(svc.search, kb_name, q)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/{kb_name}/{faq_id}", response_model=MessageResponse)
async def delete_faq(
    kb_name: str,
    faq_id: int,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    try:
        return await asyncio.to_thread(svc.delete, kb_name, faq_id)
    except FAQNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


# ── Excel 导入/导出端点 ────────────────────────────────────


_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_response(content: bytes, filename: str) -> Response:
    encoded = urllib.parse.quote(filename)
    return Response(
        content=content,
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.get("/{kb_name}/template")
async def download_faq_template(
    kb_name: str,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> Response:
    """下载 FAQ Excel 导入模板（含表头和示例行）。"""
    try:
        content, filename = await asyncio.to_thread(svc.get_template, kb_name)
        return _xlsx_response(content, filename)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/{kb_name}/export")
async def export_faqs_excel(
    kb_name: str,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> Response:
    """导出知识库所有 FAQ 为 Excel 文件。"""
    try:
        content, filename = await asyncio.to_thread(svc.export_to_xlsx, kb_name)
        return _xlsx_response(content, filename)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{kb_name}/import", response_model=FAQImportResult)
async def import_faqs_excel(
    kb_name: str,
    file: UploadFile = File(...),
    skip_duplicates: bool = Form(default=True),
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    """从 Excel 文件批量导入 FAQ（含自动向量化）。"""
    filename = file.filename or ""
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 格式的 Excel 文件")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件过大，请控制在 5MB 以内")

    try:
        return await asyncio.to_thread(svc.import_from_xlsx, kb_name, content, current_user["id"])
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
