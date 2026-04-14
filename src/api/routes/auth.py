"""认证路由：登录、刷新 token、查询/修改当前用户。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from src.api.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from src.api.schemas import (
    ChangePasswordRequest,
    LoginResponse,
    MessageResponse,
    RefreshTokenRequest,
    UserInfo,
)
from src.storage.user_store import UserStore

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

_us = UserStore()


def _to_user_info(user: dict, profile: dict | None = None) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "is_active": bool(user["is_active"]),
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
        "profile": profile,
    }


def _get_profile(user: dict) -> dict | None:
    role = user["role"]
    uid = user["id"]
    if role == "student":
        return _us.get_student_profile(uid)
    if role in ("teacher", "admin"):
        return _us.get_teacher_profile(uid)
    return None


@router.post("/login", response_model=LoginResponse)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """用户名/密码登录，返回 access_token 和 refresh_token。"""
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已禁用，请联系管理员")

    # 记录登录日志
    try:
        ip = request.client.host if request.client else ""
        ua = request.headers.get("user-agent", "")
        _us.add_login_log(user["id"], ip, ua)
    except Exception as e:
        logger.warning("[auth] 记录登录日志失败: %s", e)

    profile = _get_profile(user)
    return {
        "access_token": create_access_token(user["id"], user["role"]),
        "refresh_token": create_refresh_token(user["id"]),
        "token_type": "bearer",
        "user": _to_user_info(user, profile),
    }


@router.post("/refresh", response_model=LoginResponse)
def refresh(body: RefreshTokenRequest):
    """用 refresh_token 换取新的 access_token 和 refresh_token。"""
    payload = decode_token(body.refresh_token, "refresh")
    user_id = payload.get("sub")
    user = _us.get_user_by_id(int(user_id))
    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效或已禁用的用户")
    profile = _get_profile(user)
    return {
        "access_token": create_access_token(user["id"], user["role"]),
        "refresh_token": create_refresh_token(user["id"]),
        "token_type": "bearer",
        "user": _to_user_info(user, profile),
    }


@router.get("/me", response_model=UserInfo)
def get_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息。"""
    profile = _get_profile(current_user)
    return _to_user_info(current_user, profile)


@router.put("/me/password", response_model=MessageResponse)
def change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """当前用户修改自己的密码。"""
    if not verify_password(body.old_password, current_user["hashed_pwd"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码错误")
    _us.update_user(current_user["id"], hashed_pwd=hash_password(body.new_password))
    return {"message": "密码修改成功"}
