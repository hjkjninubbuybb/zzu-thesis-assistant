"""工单（导师答疑请求）相关请求/响应模型。"""

from datetime import datetime

from pydantic import BaseModel


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
