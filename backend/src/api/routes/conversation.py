"""对话历史管理接口。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.auth import get_current_user
from src.api.deps import get_conversation_service
from src.api.schemas import (
    ConversationCreate,
    ConversationInfo,
    ConversationMessageOut,
    ConversationTitleUpdate,
    FeedbackRequest,
    MessageResponse,
    PaginatedConversations,
    SaveMessageRequest,
)
from src.services.conversation_service import (
    ConversationNotFoundError,
    ConversationService,
    KnowledgeBaseNotFoundError,
)

router = APIRouter(prefix="/api/conversation", tags=["conversation"])
logger = logging.getLogger(__name__)


def _check_student_access(current_user: dict, conv: dict) -> None:
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权访问此对话")


# ── 对话 CRUD ─────────────────────────────────────────────


@router.post("", response_model=ConversationInfo)
def create_conversation(
    body: ConversationCreate,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """创建新对话。"""
    try:
        return svc.create_conversation(body.kb_name, body.title, current_user["id"])
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("", response_model=PaginatedConversations)
def list_conversations(
    kb_name: str | None = Query(default=None),
    cursor_id: int | None = Query(default=None),
    cursor_updated_at: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """列出对话（游标分页）。学生只看自己的，管理员/教师看所有。"""
    user_id = None if current_user["role"] in ("admin", "teacher") else current_user["id"]
    return svc.list_conversations(
        kb_name=kb_name,
        user_id=user_id,
        limit=limit,
        cursor_id=cursor_id,
        cursor_updated_at=cursor_updated_at,
    )


@router.get("/{conv_id}")
def get_conversation(
    conv_id: int,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """获取单个对话及其消息列表。"""
    try:
        conv = svc.get_conversation(conv_id)
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    _check_student_access(current_user, conv)
    return {"conversation": conv, "messages": svc.list_messages(conv_id)}


@router.put("/{conv_id}/title", response_model=ConversationInfo)
def update_title(
    conv_id: int,
    body: ConversationTitleUpdate,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """更新对话标题（用户手动重命名）。"""
    try:
        conv = svc.get_conversation(conv_id)
        _check_student_access(current_user, conv)
        return svc.update_title(conv_id, body.title.strip())
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{conv_id}/summarize-title", response_model=ConversationInfo)
def summarize_title(
    conv_id: int,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """基于首轮对话自动生成语义化标题（快速 LLM）。"""
    try:
        conv = svc.get_conversation(conv_id)
        _check_student_access(current_user, conv)
        return svc.generate_title(conv_id)
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{conv_id}", response_model=MessageResponse)
def delete_conversation(
    conv_id: int,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """删除对话及其所有消息。"""
    try:
        conv = svc.get_conversation(conv_id)
        _check_student_access(current_user, conv)
        svc.delete_conversation(conv_id)
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"message": "对话已删除"}


# ── 消息 ──────────────────────────────────────────────────


@router.post("/{conv_id}/messages", response_model=ConversationMessageOut)
def add_message(
    conv_id: int,
    body: SaveMessageRequest,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """保存一条消息到对话。"""
    try:
        conv = svc.get_conversation(conv_id)
    except ConversationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    _check_student_access(current_user, conv)
    return svc.add_message(conv_id, body.role, body.content, body.sources, body.files)


# ── 反馈 ──────────────────────────────────────────────────


@router.post("/messages/{message_id}/feedback")
def submit_feedback(
    message_id: int,
    body: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
    svc: ConversationService = Depends(get_conversation_service),
):
    """对一条消息提交反馈（👍/👎）。"""
    row = svc.set_feedback(message_id, body.rating)
    return {"message_id": message_id, "rating": row["rating"]}
