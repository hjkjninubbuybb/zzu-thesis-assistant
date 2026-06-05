"""导师答疑（QA Requests）路由。"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.deps import get_ticket_service
from src.api.schemas import PaginatedTickets, QARequestCreate, QARequestInfo, QARequestReply
from src.exceptions import DocumentNotFoundError, PermissionDeniedError
from src.services.ticket_service import TicketService

router = APIRouter(prefix="/api/tickets", tags=["tickets"])
logger = logging.getLogger(__name__)


@router.post("", response_model=QARequestInfo, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: QARequestCreate,
    current_user: dict = Depends(get_current_user),
    svc: TicketService = Depends(get_ticket_service),
):
    """学生发起答疑请求。"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="只有学生可以发起答疑请求")
    try:
        return await asyncio.to_thread(
            svc.create,
            current_user["id"],
            body.conversation_id,
            body.message_id,
            body.question,
        )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("", response_model=PaginatedTickets)
async def list_tickets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    student_id: int | None = Query(default=None, description="按学生过滤；teacher 仅可过滤自己的学生"),
    current_user: dict = Depends(get_current_user),
    svc: TicketService = Depends(get_ticket_service),
):
    """获取答疑请求列表。学生看自己的，教师看分配给自己的（可按 student_id 过滤）。"""
    try:
        items, total = await asyncio.to_thread(
            svc.list_tickets,
            current_user["role"], current_user["id"],
            page, page_size, student_id,
        )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{ticket_id}", response_model=QARequestInfo)
async def get_ticket(
    ticket_id: int,
    current_user: dict = Depends(get_current_user),
    svc: TicketService = Depends(get_ticket_service),
):
    """获取答疑详情。"""
    try:
        return await asyncio.to_thread(svc.get, ticket_id, current_user["role"], current_user["id"])
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e


@router.post("/{ticket_id}/reply", response_model=QARequestInfo)
async def reply_ticket(
    ticket_id: int,
    body: QARequestReply,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: TicketService = Depends(get_ticket_service),
):
    """导师回复答疑请求。"""
    try:
        return await asyncio.to_thread(svc.reply, ticket_id, body.answer, current_user["id"], current_user["role"])
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e


@router.post("/{ticket_id}/close", response_model=QARequestInfo)
async def close_ticket(
    ticket_id: int,
    current_user: dict = Depends(get_current_user),
    svc: TicketService = Depends(get_ticket_service),
):
    """关闭答疑请求。"""
    try:
        return await asyncio.to_thread(svc.close, ticket_id, current_user["role"], current_user["id"])
    except DocumentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
