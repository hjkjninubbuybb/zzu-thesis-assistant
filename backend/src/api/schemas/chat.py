"""对话/聊天相关请求/响应模型。"""

from datetime import datetime

from pydantic import BaseModel, Field


class HistoryMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    kb_name: str = Field(default="")  # 学生角色由后端覆盖，此字段可为空
    query: str = Field(..., min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=20)


class ConversationCreate(BaseModel):
    kb_name: str
    title: str = Field(default="新对话", max_length=100)


class ConversationInfo(BaseModel):
    id: int
    kb_name: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationCursor(BaseModel):
    id: int
    updated_at: str


class PaginatedConversations(BaseModel):
    items: list[ConversationInfo]
    has_more: bool
    next_cursor: ConversationCursor | None = None


class ConversationTitleUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


class SaveMessageRequest(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., max_length=10000)
    sources: list[dict] | None = None
    files: list[dict] | None = None


class ConversationMessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    sources: list[dict] | None = None
    files: list[dict] | None = None
    feedback: str | None = None
    created_at: datetime


class FeedbackRequest(BaseModel):
    rating: str = Field(..., pattern=r"^(up|down)$")
