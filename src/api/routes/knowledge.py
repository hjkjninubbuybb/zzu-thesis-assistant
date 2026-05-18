"""知识库 CRUD 接口 + 学生/管理端知识库分配。"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.schemas import (
    ActiveKBResponse,
    KBCreate,
    KBInfo,
    MessageResponse,
    SetActiveKBRequest,
)
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore, VectorStoreError

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])
logger = logging.getLogger(__name__)

_vs = VectorStore()
_ds = DocumentStore()

_STUDENT_KB_KEY = "active_kb"
_ADMIN_KB_KEY = "admin_kb"


# ── 工具函数 ────────────────────────────────────────────────

def _build_active_response(kb_name: str) -> ActiveKBResponse:
    kb = _ds.get_kb(kb_name)
    if not kb:
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    kbs = _ds.list_kbs()
    doc_count = next((k["doc_count"] for k in kbs if k["name"] == kb_name), 0)
    return ActiveKBResponse(
        kb_name=kb_name,
        description=kb.get("description", ""),
        doc_count=doc_count,
    )


def _get_active_response_or_none(key: str) -> ActiveKBResponse | None:
    kb_name = _ds.get_setting(key)
    if not kb_name:
        return None
    kb = _ds.get_kb(kb_name)
    if not kb:
        _ds.delete_setting(key)
        return None
    kbs = _ds.list_kbs()
    doc_count = next((k["doc_count"] for k in kbs if k["name"] == kb_name), 0)
    return ActiveKBResponse(
        kb_name=kb_name,
        description=kb.get("description", ""),
        doc_count=doc_count,
    )


# ── 学生知识库（所有已登录用户可读，管理员/教师可写）──────────

@router.get("/active", response_model=ActiveKBResponse | None)
def get_student_kb(_: dict = Depends(get_current_user)) -> ActiveKBResponse | None:
    """获取为学生分配的知识库（所有已登录用户可访问）。"""
    return _get_active_response_or_none(_STUDENT_KB_KEY)


@router.put("/active", response_model=ActiveKBResponse)
def set_student_kb(
    body: SetActiveKBRequest,
    _: dict = Depends(require_teacher_or_admin),
) -> ActiveKBResponse:
    """设置学生使用的知识库（仅管理员/教师）。"""
    result = _build_active_response(body.kb_name)
    _ds.set_setting(_STUDENT_KB_KEY, body.kb_name)
    logger.info("[knowledge] 学生知识库已设置为: %s", body.kb_name)
    return result


@router.delete("/active", response_model=MessageResponse)
def clear_student_kb(_: dict = Depends(require_teacher_or_admin)) -> MessageResponse:
    """取消学生知识库分配（仅管理员/教师）。"""
    _ds.delete_setting(_STUDENT_KB_KEY)
    logger.info("[knowledge] 学生知识库分配已清除")
    return MessageResponse(message="已取消学生知识库分配")


# ── 管理端知识库（管理员/教师可读写）──────────────────────────

@router.get("/admin-active", response_model=ActiveKBResponse | None)
def get_admin_kb(_: dict = Depends(require_teacher_or_admin)) -> ActiveKBResponse | None:
    """获取管理端（教师/管理员）使用的知识库。"""
    return _get_active_response_or_none(_ADMIN_KB_KEY)


@router.put("/admin-active", response_model=ActiveKBResponse)
def set_admin_kb(
    body: SetActiveKBRequest,
    _: dict = Depends(require_teacher_or_admin),
) -> ActiveKBResponse:
    """设置管理端使用的知识库（仅管理员/教师）。"""
    result = _build_active_response(body.kb_name)
    _ds.set_setting(_ADMIN_KB_KEY, body.kb_name)
    logger.info("[knowledge] 管理端知识库已设置为: %s", body.kb_name)
    return result


@router.delete("/admin-active", response_model=MessageResponse)
def clear_admin_kb(_: dict = Depends(require_teacher_or_admin)) -> MessageResponse:
    """取消管理端知识库分配（仅管理员/教师）。"""
    _ds.delete_setting(_ADMIN_KB_KEY)
    logger.info("[knowledge] 管理端知识库分配已清除")
    return MessageResponse(message="已取消管理端知识库分配")


# ── 知识库 CRUD（仅管理员/教师）────────────────────────────────

@router.get("", response_model=list[KBInfo])
def list_kbs(_: dict = Depends(require_teacher_or_admin)) -> list[KBInfo]:
    """列出所有知识库，标记学生/管理端当前选用的 KB（仅管理员/教师）。"""
    kbs = _ds.list_kbs()
    student_kb = _ds.get_setting(_STUDENT_KB_KEY)
    admin_kb = _ds.get_setting(_ADMIN_KB_KEY)
    return [
        KBInfo(
            id=kb["id"],
            name=kb["name"],
            description=kb["description"],
            doc_count=kb["doc_count"],
            is_active=(kb["name"] == student_kb),
            is_admin_active=(kb["name"] == admin_kb),
            created_at=kb["created_at"],
        )
        for kb in kbs
    ]


@router.post("", response_model=KBInfo)
def create_kb(body: KBCreate, _: dict = Depends(require_teacher_or_admin)) -> KBInfo:
    """创建知识库（仅管理员/教师）。"""
    if _ds.get_kb(body.name):
        raise HTTPException(status_code=409, detail=f"知识库 '{body.name}' 已存在")
    _vs.create_collection(body.name)
    kb = _ds.create_kb(body.name, body.description)
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
def delete_kb(kb_name: str, _: dict = Depends(require_teacher_or_admin)) -> MessageResponse:
    """删除知识库及其所有文档（仅管理员/教师）。删除时自动清除相关分配。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    try:
        _vs.delete_collection(kb_name)
    except VectorStoreError as e:
        logger.warning("[delete_kb] Qdrant 删除失败，继续删除元数据: %s", e)
    _ds.delete_kb(kb_name)
    for key, label in [(_STUDENT_KB_KEY, "学生"), (_ADMIN_KB_KEY, "管理端")]:
        if _ds.get_setting(key) == kb_name:
            _ds.delete_setting(key)
            logger.info("[knowledge] 已自动清除%s知识库分配（原知识库 '%s' 已删除）", label, kb_name)
    return MessageResponse(message=f"知识库 '{kb_name}' 已删除")
