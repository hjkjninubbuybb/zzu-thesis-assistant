"""导师答疑（QA Requests）路由。"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.schemas import MessageResponse, QARequestCreate, QARequestInfo, QARequestReply
from src.storage.document_store import DocumentStore
from src.storage.user_store import UserStore

router = APIRouter(prefix="/api/tickets", tags=["tickets"])
logger = logging.getLogger(__name__)

_ds = DocumentStore()
_us = UserStore()

@router.post("", response_model=QARequestInfo, status_code=status.HTTP_201_CREATED)
def create_ticket(body: QARequestCreate, current_user: dict = Depends(get_current_user)):
    """学生发起答疑请求。"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="只有学生可以发起答疑请求")
    
    mentor = _us.get_student_mentor(current_user["id"])
    if not mentor:
        raise HTTPException(status_code=400, detail="您尚未分配指导教师，无法发起答疑请求")
    
    ticket = _ds.create_qa_request(
        student_id=current_user["id"],
        mentor_id=mentor["id"],
        conversation_id=body.conversation_id,
        message_id=body.message_id,
        question=body.question
    )
    return ticket

@router.get("", response_model=list[QARequestInfo])
def list_tickets(current_user: dict = Depends(get_current_user)):
    """获取答疑请求列表。学生看自己的，教师看分配给自己的。"""
    if current_user["role"] == "student":
        return _ds.list_qa_requests(student_id=current_user["id"])
    elif current_user["role"] == "teacher":
        return _ds.list_qa_requests(mentor_id=current_user["id"])
    elif current_user["role"] == "admin":
        return _ds.list_qa_requests()
    return []

@router.get("/{ticket_id}", response_model=QARequestInfo)
def get_ticket(ticket_id: int, current_user: dict = Depends(get_current_user)):
    """获取答疑详情。"""
    ticket = _ds.get_qa_request(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="请求不存在")
    
    # 权限检查
    if current_user["role"] == "student" and ticket["student_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权查看此请求")
    if current_user["role"] == "teacher" and ticket["mentor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权查看此请求")
        
    return ticket

@router.post("/{ticket_id}/reply", response_model=QARequestInfo)
def reply_ticket(ticket_id: int, body: QARequestReply, current_user: dict = Depends(require_teacher_or_admin)):
    """导师回复答疑请求。"""
    ticket = _ds.get_qa_request(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="请求不存在")
    
    if current_user["role"] == "teacher" and ticket["mentor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="只能回复分配给自己的请求")
    
    updated = _ds.update_qa_request(ticket_id, answer=body.answer, status="replied")
    return updated

@router.post("/{ticket_id}/close", response_model=QARequestInfo)
def close_ticket(ticket_id: int, current_user: dict = Depends(get_current_user)):
    """关闭答疑请求。"""
    ticket = _ds.get_qa_request(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="请求不存在")
        
    # 学生或导师都可以关闭
    if current_user["role"] == "student" and ticket["student_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权操作")
    if current_user["role"] == "teacher" and ticket["mentor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权操作")

    updated = _ds.update_qa_request(ticket_id, answer=ticket["answer"], status="closed")
    return updated
