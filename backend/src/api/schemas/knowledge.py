"""知识库相关请求/响应模型。"""

from datetime import datetime

from pydantic import BaseModel, Field


class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-\u4e00-\u9fff]+$")
    description: str = Field(default="", max_length=256)
    splitter_type: str = Field(
        default="recursive",
        pattern=r"^(recursive|token|sentence|semantic|table_aware)$",
    )
    chunk_size: int = Field(default=256, ge=64, le=1024)
    chunk_overlap_ratio: float = Field(default=0.1, ge=0.0, le=0.5)


class KBSplitterUpdate(BaseModel):
    splitter_type: str = Field(..., pattern=r"^(recursive|token|sentence|semantic|table_aware)$")
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


class SetActiveKBRequest(BaseModel):
    kb_name: str = Field(..., min_length=1, max_length=64)


class ActiveKBResponse(BaseModel):
    kb_name: str
    description: str
    doc_count: int
