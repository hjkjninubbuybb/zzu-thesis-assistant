"""文档相关请求/响应模型。"""

from datetime import datetime

from pydantic import BaseModel, Field


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
    splitter_type: str = Field(default="recursive", pattern=r"^(recursive|token|sentence)$")
    chunk_size: int = Field(default=256, ge=64, le=1024)
    chunk_overlap_ratio: float = Field(default=0.2, ge=0.0, le=0.5)
    enable_cleaning: bool = Field(default=False)


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
