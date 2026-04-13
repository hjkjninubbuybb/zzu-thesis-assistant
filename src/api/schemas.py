"""Pydantic 请求/响应模型。"""

from pydantic import BaseModel, Field


# ── 知识库 ────────────────────────────────────────────────

class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-\u4e00-\u9fff]+$")
    description: str = Field(default="", max_length=256)


class KBInfo(BaseModel):
    id: int
    name: str
    description: str
    doc_count: int
    created_at: str


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
    created_at: str


class IndexRequest(BaseModel):
    splitter_type: str = Field(default="recursive", pattern=r"^(recursive|token|sentence)$")
    chunk_size: int = Field(default=256, ge=64, le=1024)
    chunk_overlap_ratio: float = Field(default=0.2, ge=0.0, le=0.5)
    enable_cleaning: bool = Field(default=False)


# ── 对话 ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    kb_name: str
    query: str = Field(..., min_length=1, max_length=2000)


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


class FAQItem(BaseModel):
    id: int
    kb_name: str
    question: str
    answer: str
    category: str
    sort_order: int
    enabled: bool
    created_at: str
    updated_at: str


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


# ── 通用 ─────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
