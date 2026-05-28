"""知识库 CRUD 接口 + 学生/管理端知识库分配。"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.deps import get_knowledge_service
from src.api.schemas import (
    ActiveKBResponse,
    KBCreate,
    KBInfo,
    MessageResponse,
    SetActiveKBRequest,
)
from src.exceptions import KnowledgeBaseNotFoundError
from src.services.knowledge_service import KnowledgeBaseAlreadyExistsError, KnowledgeService

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])
logger = logging.getLogger(__name__)

_STUDENT_KB_KEY = "active_kb"
_ADMIN_KB_KEY = "admin_kb"


# ── 学生知识库（所有已登录用户可读，管理员/教师可写）──────────


@router.get("/active", response_model=ActiveKBResponse | None)
def get_student_kb(
    _: dict = Depends(get_current_user),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> ActiveKBResponse | None:
    """获取为学生分配的知识库（所有已登录用户可访问）。"""
    result = svc.get_active_kb(_STUDENT_KB_KEY)
    if result is None:
        return None
    return ActiveKBResponse(**result)


@router.put("/active", response_model=ActiveKBResponse)
def set_student_kb(
    body: SetActiveKBRequest,
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> ActiveKBResponse:
    """设置学生使用的知识库（仅管理员/教师）。"""
    try:
        result = svc.set_active_kb(body.kb_name, _STUDENT_KB_KEY)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return ActiveKBResponse(**result)


@router.delete("/active", response_model=MessageResponse)
def clear_student_kb(
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> MessageResponse:
    """取消学生知识库分配（仅管理员/教师）。"""
    svc.clear_active_kb(_STUDENT_KB_KEY)
    return MessageResponse(message="已取消学生知识库分配")


# ── 管理端知识库（管理员/教师可读写）──────────────────────────


@router.get("/admin-active", response_model=ActiveKBResponse | None)
def get_admin_kb(
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> ActiveKBResponse | None:
    """获取管理端（教师/管理员）使用的知识库。"""
    result = svc.get_active_kb(_ADMIN_KB_KEY)
    if result is None:
        return None
    return ActiveKBResponse(**result)


@router.put("/admin-active", response_model=ActiveKBResponse)
def set_admin_kb(
    body: SetActiveKBRequest,
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> ActiveKBResponse:
    """设置管理端使用的知识库（仅管理员/教师）。"""
    try:
        result = svc.set_active_kb(body.kb_name, _ADMIN_KB_KEY)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return ActiveKBResponse(**result)


@router.delete("/admin-active", response_model=MessageResponse)
def clear_admin_kb(
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> MessageResponse:
    """取消管理端知识库分配（仅管理员/教师）。"""
    svc.clear_active_kb(_ADMIN_KB_KEY)
    return MessageResponse(message="已取消管理端知识库分配")


# ── 知识库 CRUD（仅管理员/教师）────────────────────────────────


@router.get("", response_model=list[KBInfo])
def list_kbs(
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> list[KBInfo]:
    """列出所有知识库，标记学生/管理端当前选用的 KB（仅管理员/教师）。"""
    kbs = svc.list_kbs()
    return [
        KBInfo(
            id=kb["id"],
            name=kb["name"],
            description=kb["description"],
            doc_count=kb["doc_count"],
            is_active=kb["is_active"],
            is_admin_active=kb["is_admin_active"],
            created_at=kb["created_at"],
        )
        for kb in kbs
    ]


@router.post("", response_model=KBInfo)
def create_kb(
    body: KBCreate,
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> KBInfo:
    """创建知识库（仅管理员/教师）。"""
    try:
        kb = svc.create_kb(body.name, body.description)
    except KnowledgeBaseAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return KBInfo(
        id=kb["id"],
        name=kb["name"],
        description=kb["description"],
        doc_count=0,
        is_active=False,
        is_admin_active=False,
        created_at=kb["created_at"],
    )


@router.delete("/{kb_name}", response_model=MessageResponse)
def delete_kb(
    kb_name: str,
    _: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> MessageResponse:
    """删除知识库及其所有文档（仅管理员/教师）。删除时自动清除相关分配。"""
    try:
        svc.delete_kb(kb_name)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return MessageResponse(message=f"知识库 '{kb_name}' 已删除")
