"""知识库 CRUD 接口。"""

import logging

from fastapi import APIRouter, HTTPException

from src.api.schemas import KBCreate, KBInfo, MessageResponse
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore, VectorStoreError

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])
logger = logging.getLogger(__name__)

_vs = VectorStore()
_ds = DocumentStore()


@router.get("", response_model=list[KBInfo])
def list_kbs():
    """列出所有知识库。"""
    kbs = _ds.list_kbs()
    return [
        KBInfo(
            id=kb["id"],
            name=kb["name"],
            description=kb["description"],
            doc_count=kb["doc_count"],
            created_at=kb["created_at"],
        )
        for kb in kbs
    ]


@router.post("", response_model=KBInfo)
def create_kb(body: KBCreate):
    """创建知识库。"""
    existing = _ds.get_kb(body.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"知识库 '{body.name}' 已存在")
    _vs.create_collection(body.name)
    kb = _ds.create_kb(body.name, body.description)
    return KBInfo(
        id=kb["id"],
        name=kb["name"],
        description=kb["description"],
        doc_count=0,
        created_at=kb["created_at"],
    )


@router.delete("/{kb_name}", response_model=MessageResponse)
def delete_kb(kb_name: str):
    """删除知识库及其所有文档。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    try:
        _vs.delete_collection(kb_name)
    except VectorStoreError as e:
        # 向量删除失败时记录警告，仍然删除元数据（避免孤儿元数据）
        logger.warning("[delete_kb] Qdrant 删除失败，继续删除元数据: %s", e)
    _ds.delete_kb(kb_name)
    return MessageResponse(message=f"知识库 '{kb_name}' 已删除")
