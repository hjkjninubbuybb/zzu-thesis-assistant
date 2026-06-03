"""认证相关请求/响应模型。"""

from pydantic import BaseModel, Field

from src.api.schemas.user import UserInfo


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
