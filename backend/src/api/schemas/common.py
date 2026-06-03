"""通用响应模型。"""

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str
