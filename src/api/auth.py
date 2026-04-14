"""JWT 认证模块：密码哈希、token 生成/校验、FastAPI 依赖。"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from src.config import get_config
from src.storage.user_store import UserStore

logger = logging.getLogger(__name__)

# ── 工具 ─────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_us = UserStore()


def _auth_cfg() -> dict:
    return get_config()["auth"]


# ── 密码 ─────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ── Token ────────────────────────────────────────────────────

def _make_token(data: dict, expire_delta: timedelta) -> str:
    cfg = _auth_cfg()
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expire_delta
    return jwt.encode(payload, cfg["secret_key"], algorithm=cfg["algorithm"])


def create_access_token(user_id: int, role: str) -> str:
    cfg = _auth_cfg()
    return _make_token(
        {"sub": str(user_id), "role": role, "type": "access"},
        timedelta(minutes=int(cfg["access_token_expire_minutes"])),
    )


def create_refresh_token(user_id: int) -> str:
    cfg = _auth_cfg()
    return _make_token(
        {"sub": str(user_id), "type": "refresh"},
        timedelta(days=int(cfg["refresh_token_expire_days"])),
    )


def decode_token(token: str, token_type: str = "access") -> dict:
    cfg = _auth_cfg()
    try:
        payload = jwt.decode(token, cfg["secret_key"], algorithms=[cfg["algorithm"]])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"无效 token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    if payload.get("type") != token_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token 类型错误")
    return payload


# ── 用户认证 ─────────────────────────────────────────────────

def authenticate_user(username: str, password: str) -> dict | None:
    """验证登录凭据，支持用户名 / 学号 / 工号，成功返回用户 dict，失败返回 None。"""
    user = (
        _us.get_user_by_username(username)
        or _us.get_user_by_student_id(username)
        or _us.get_user_by_employee_id(username)
    )
    if not user:
        return None
    if not verify_password(password, user["hashed_pwd"]):
        return None
    return user


# ── FastAPI Depends ───────────────────────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """解码 JWT，从数据库取用户，校验激活状态。"""
    payload = decode_token(token, "access")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效 token")
    user = _us.get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已禁用")
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """仅管理员可访问。"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


def require_teacher_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """教师或管理员可访问。"""
    if current_user["role"] not in ("admin", "teacher"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师或管理员权限")
    return current_user


# ── 启动时初始化 ──────────────────────────────────────────────

def ensure_default_admin() -> None:
    """若数据库中没有任何用户，自动创建默认管理员账号。"""
    try:
        count = _us.count_users()
        if count > 0:
            return
        cfg = _auth_cfg()
        username = cfg["default_admin_username"]
        password = cfg["default_admin_password"]
        _us.create_user(
            username=username,
            hashed_pwd=hash_password(password),
            display_name="系统管理员",
            role="admin",
        )
        logger.warning(
            "[auth] 默认管理员已创建 username=%s password=%s  — 请尽快修改密码！",
            username,
            password,
        )
    except Exception as e:
        logger.error("[auth] 创建默认管理员失败: %s", e)
