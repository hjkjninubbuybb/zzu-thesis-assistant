"""对话历史管理接口。"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.auth import get_current_user
from src.api.schemas import (
    ConversationCreate,
    ConversationInfo,
    ConversationMessageOut,
    ConversationTitleUpdate,
    FeedbackRequest,
    MessageResponse,
    SaveMessageRequest,
)
from src.storage.document_store import DocumentStore

router = APIRouter(prefix="/api/conversation", tags=["conversation"])
logger = logging.getLogger(__name__)

_ds = DocumentStore()


# ── 对话 CRUD ─────────────────────────────────────────────

@router.post("", response_model=ConversationInfo)
def create_conversation(body: ConversationCreate, current_user: dict = Depends(get_current_user)):
    """创建新对话。"""
    if not _ds.get_kb(body.kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{body.kb_name}' 不存在")
    row = _ds.create_conversation(body.kb_name, body.title, user_id=current_user["id"])
    return row


@router.get("", response_model=list[ConversationInfo])
def list_conversations(
    kb_name: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """列出对话。学生只看自己的，管理员/教师看所有。"""
    user_id = None if current_user["role"] in ("admin", "teacher") else current_user["id"]
    return _ds.list_conversations(kb_name=kb_name, user_id=user_id)


@router.get("/{conv_id}")
def get_conversation(conv_id: int, current_user: dict = Depends(get_current_user)):
    """获取单个对话及其消息列表。"""
    conv = _ds.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    # 学生只能查看自己的对话
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权访问此对话")
    messages = _ds.list_messages(conv_id)
    for msg in messages:
        fb = _ds.get_message_feedback(msg["id"])
        msg["feedback"] = fb["rating"] if fb else None
    return {"conversation": conv, "messages": messages}


@router.put("/{conv_id}/title", response_model=ConversationInfo)
def update_title(conv_id: int, body: ConversationTitleUpdate, current_user: dict = Depends(get_current_user)):
    """更新对话标题。"""
    conv = _ds.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改此对话")
    row = _ds.update_conversation_title(conv_id, body.title)
    return row


@router.delete("/{conv_id}", response_model=MessageResponse)
def delete_conversation(conv_id: int, current_user: dict = Depends(get_current_user)):
    """删除对话及其所有消息。"""
    conv = _ds.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权删除此对话")
    _ds.delete_conversation(conv_id)
    return {"message": "对话已删除"}


# ── 消息 ──────────────────────────────────────────────────

@router.post("/{conv_id}/messages", response_model=ConversationMessageOut)
def add_message(conv_id: int, body: SaveMessageRequest, current_user: dict = Depends(get_current_user)):
    """保存一条消息到对话。"""
    conv = _ds.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权访问此对话")
    sources_json = json.dumps(body.sources, ensure_ascii=False) if body.sources else None
    files_json = json.dumps(body.files, ensure_ascii=False) if body.files else None
    row = _ds.add_message(conv_id, body.role, body.content, sources_json, files_json)
    row["sources"] = body.sources
    row["files"] = body.files
    row["feedback"] = None
    return row


# ── 反馈 ──────────────────────────────────────────────────

@router.post("/messages/{message_id}/feedback")
def submit_feedback(message_id: int, body: FeedbackRequest, current_user: dict = Depends(get_current_user)):
    """对一条消息提交反馈（👍/👎）。"""
    row = _ds.set_message_feedback(message_id, body.rating)
    return {"message_id": message_id, "rating": row["rating"]}
