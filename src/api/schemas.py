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
    query: str = Field(..., min_length=1)
    max_reformulations: int = Field(default=2, ge=0, le=5)


# ── 通用 ─────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
