"""Pydantic 请求/响应模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ── 知识库 ────────────────────────────────────────────────


class KBCreate(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-\u4e00-\u9fff]+$"
    )
    description: str = Field(default="", max_length=256)
    splitter_type: str = Field(
        default="recursive",
        pattern=r"^(recursive|token|sentence|semantic|table_aware)$",
    )
    chunk_size: int = Field(default=256, ge=64, le=1024)
    chunk_overlap_ratio: float = Field(default=0.1, ge=0.0, le=0.5)


class KBSplitterUpdate(BaseModel):
    splitter_type: str = Field(
        ..., pattern=r"^(recursive|token|sentence|semantic|table_aware)$"
    )
    chunk_size: int = Field(default=256, ge=64, le=1024)
    chunk_overlap_ratio: float = Field(default=0.1, ge=0.0, le=0.5)


class KBInfo(BaseModel):
    id: int
    name: str
    description: str
    doc_count: int
    is_active: bool = False  # 是否为学生当前使用的知识库
    is_admin_active: bool = False  # 是否为管理端当前使用的知识库
    splitter_type: str = "recursive"
    chunk_size: int = 256
    chunk_overlap_ratio: float = 0.1
    created_at: datetime


# ── 文档 ─────────────────────────────────────────────────


class DocInfo(BaseModel):
    id: int
    kb_name: str
    file_name: str
    file_size: int
    chunk_count: int
    chunk_size: int
    doc_type: str = "plain_text"
    status: str
    created_at: datetime


class DocDetail(DocInfo):
    summary: str | None = None
    content: str | None = None


class DocUpdate(BaseModel):
    summary: str | None = None
    content: str | None = None


class IndexRequest(BaseModel):
    splitter_type: str = Field(
        default="recursive", pattern=r"^(recursive|token|sentence)$"
    )
    chunk_size: int = Field(default=256, ge=64, le=1024)
    chunk_overlap_ratio: float = Field(default=0.2, ge=0.0, le=0.5)
    enable_cleaning: bool = Field(default=False)


# ── 文档审核流程 ───────────────────────────────────────────


class CleanResult(BaseModel):
    """upload-and-clean 接口的响应。"""

    doc_id: int
    file_name: str
    cleaned_content: str
    doc_type: str
    splitter_type: str
    chunk_size: int
    chunk_overlap_ratio: float


class ConfirmCleanRequest(BaseModel):
    """confirm-clean 接口的请求体。"""

    content: str = Field(..., min_length=1, description="管理员编辑后的清洗文本")


class ChunkPreview(BaseModel):
    """单个 chunk 预览。"""

    index: int
    content: str


class ChunkPreviewResult(BaseModel):
    """confirm-clean 接口的响应。"""

    doc_id: int
    chunks: list[ChunkPreview]
    chunk_count: int


class ConfirmIndexResult(BaseModel):
    """confirm-index 接口的响应。"""

    doc_id: int
    status: str
    chunk_count: int


class ReviewDetail(BaseModel):
    """审核中文档的详情。"""

    doc_id: int
    file_name: str
    status: str
    cleaned_content: str | None = None
    chunks: list[ChunkPreview] | None = None
    doc_type: str
    splitter_type: str
    chunk_size: int
    chunk_overlap_ratio: float


# ── 对话 ─────────────────────────────────────────────────


class HistoryMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    kb_name: str = Field(default="")  # 学生角色由后端覆盖，此字段可为空
    query: str = Field(..., min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=20)


class SetActiveKBRequest(BaseModel):
    kb_name: str = Field(..., min_length=1, max_length=64)


class ActiveKBResponse(BaseModel):
    kb_name: str
    description: str
    doc_count: int


# ── FAQ ───────────────────────────────────────────────────


class FAQCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=2000)
    category: str = Field(default="", max_length=64)
    sort_order: int = Field(default=0, ge=0)


class FAQUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=500)
    answer: str | None = Field(default=None, min_length=1, max_length=2000)
    category: str | None = Field(default=None, max_length=64)
    sort_order: int | None = Field(default=None, ge=0)
    enabled: bool | None = None
    status: Literal["draft", "pending", "approved", "rejected"] | None = None


class FAQItem(BaseModel):
    id: int
    kb_name: str
    question: str
    answer: str
    category: str
    sort_order: int
    enabled: bool
    status: str = "approved"
    author_id: int | None = None
    created_at: datetime
    updated_at: datetime


class FAQSearchResponse(BaseModel):
    rewritten_query: str
    items: list[FAQItem]


# ── FAQ 导入/导出 ──────────────────────────────────────────


class FAQImportError(BaseModel):
    row: int
    question: str
    reason: str


class FAQImportResult(BaseModel):
    total: int
    success: int
    skipped: int
    failed: int
    errors: list[FAQImportError]


# ── 导师答疑请求 (QA Requests) ────────────────────────────────


class QARequestCreate(BaseModel):
    conversation_id: int
    message_id: int
    question: str


class QARequestReply(BaseModel):
    answer: str


class QARequestInfo(BaseModel):
    id: int
    student_id: int
    mentor_id: int
    conversation_id: int
    message_id: int
    question: str
    answer: str | None = None
    status: str
    created_at: datetime
    replied_at: datetime | None = None


# ── 对话历史 ─────────────────────────────────────────────


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


# ── 通用 ─────────────────────────────────────────────────


class MessageResponse(BaseModel):
    message: str


# ── 用户认证 ─────────────────────────────────────────────


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=6, max_length=64)
    display_name: str = Field(default="", max_length=64)
    role: Literal["admin", "teacher", "student"] = "student"


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    profile: dict | None = None


class PaginatedUsers(BaseModel):
    items: list[UserInfo]
    total: int
    page: int
    page_size: int


class MentorRelationRequest(BaseModel):
    mentor_id: int
    student_ids: list[int]


class StudentProfileCreate(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=20)
    grade: str = Field(default="", max_length=10)
    major: str = Field(default="", max_length=64)
    class_name: str = Field(default="", max_length=32)


class TeacherProfileCreate(BaseModel):
    employee_id: str = Field(..., min_length=1, max_length=20)
    department: str = Field(default="", max_length=64)
    title: str = Field(default="", max_length=32)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserInfo


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=64)


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=64)


class UpdateProfileRequest(BaseModel):
    student_profile: StudentProfileCreate | None = None
    teacher_profile: TeacherProfileCreate | None = None
