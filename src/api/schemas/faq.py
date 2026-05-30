"""FAQ 相关请求/响应模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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


class FAQSearchItem(FAQItem):
    score: float | None = None


class FAQSearchResponse(BaseModel):
    items: list[FAQSearchItem]


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
