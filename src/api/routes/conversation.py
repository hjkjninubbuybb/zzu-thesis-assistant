"""对话历史管理接口。"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from langchain_community.chat_models import ChatTongyi

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
from src.config import get_config, get_dashscope_api_key
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
    """更新对话标题（用户手动重命名）。"""
    conv = _ds.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改此对话")
    row = _ds.update_conversation_title(conv_id, body.title.strip())
    return row


# ── 标题总结 ─────────────────────────────────────────────

_TITLE_SYSTEM_PROMPT = """你是一个对话标题生成助手。你的任务是根据用户的第一轮提问和助手的回答，生成一个简短、精准、有辨识度的中文标题。

要求：
1. 标题 6-14 个汉字，概括核心话题，不要出现"关于"、"如何"、"问题"等冗余词
2. 必须是陈述性名词短语，不能是完整句子，不能带标点符号
3. 如果用户问题涉及具体文档/表格/流程/截止时间/学院/专业等关键信息，优先保留这些关键词
4. 如果首轮只是寒暄（如"你好"、"在吗"），返回"闲聊"两个字
5. 直接输出标题本身，不要加任何解释、引号、前后缀"""


@router.post("/{conv_id}/summarize-title", response_model=ConversationInfo)
def summarize_title(conv_id: int, current_user: dict = Depends(get_current_user)):
    """基于首轮对话自动生成语义化标题（fast LLM）。"""
    conv = _ds.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user["role"] == "student" and conv.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改此对话")

    messages = _ds.list_messages(conv_id)
    if not messages:
        raise HTTPException(status_code=400, detail="对话尚无消息，无法总结标题")

    # 取首轮 user + assistant
    first_user = next((m for m in messages if m["role"] == "user"), None)
    first_assistant = next((m for m in messages if m["role"] == "assistant"), None)
    if not first_user:
        raise HTTPException(status_code=400, detail="对话缺少用户提问")

    user_text = (first_user["content"] or "").strip()[:500]
    assistant_text = ((first_assistant["content"] if first_assistant else "") or "").strip()[:500]

    fast_model = get_config()["llm"].get("fast_model", "qwen-turbo")
    api_key = get_dashscope_api_key()
    if not api_key:
        logger.warning("[summarize_title] DASHSCOPE_API_KEY 未配置，跳过 LLM 调用")
        return _ds.update_conversation_title(conv_id, user_text[:20] or "新对话")

    try:
        llm = ChatTongyi(model=fast_model, api_key=api_key, streaming=False)
        prompt = (
            f"{_TITLE_SYSTEM_PROMPT}\n\n"
            f"【用户提问】\n{user_text}\n\n"
            f"【助手回答】\n{assistant_text or '（尚无回答）'}\n\n"
            f"请直接输出标题："
        )
        resp = llm.invoke(prompt)
        title = (getattr(resp, "content", "") or "").strip()
        # 清理：去引号、句号、换行
        title = title.strip('"\'""''。 \n\t')
        if not title:
            title = user_text[:20] or "新对话"
        # 兜底：超过 20 字截断
        if len(title) > 20:
            title = title[:20]
    except Exception as e:
        logger.warning("[summarize_title] LLM 调用失败: %s", e)
        title = user_text[:20] or "新对话"

    logger.info("[summarize_title] conv_id=%d title=%s", conv_id, title)
    row = _ds.update_conversation_title(conv_id, title)
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
