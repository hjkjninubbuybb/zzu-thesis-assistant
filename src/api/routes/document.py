"""文档上传与管理接口。"""

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from src.api.schemas import DocInfo, MessageResponse
from src.core.indexing import index_document, delete_document, SUPPORTED_EXTS
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

router = APIRouter(prefix="/api/document", tags=["document"])

_ds = DocumentStore()
_vs = VectorStore()


@router.get("/{kb_name}", response_model=list[DocInfo])
def list_documents(kb_name: str):
    """列出知识库下的所有文档。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    docs = _ds.list_documents(kb_name)
    return [DocInfo(**d) for d in docs]


@router.post("/{kb_name}/upload", response_model=DocInfo)
async def upload_document(
    kb_name: str,
    file: UploadFile = File(...),
    splitter_type: str = Form(default="recursive"),
    chunk_size: int = Form(default=256),
    chunk_overlap_ratio: float = Form(default=0.2),
    enable_cleaning: bool = Form(default=False),
):
    """上传文档并入库。"""
    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 '{ext}'，支持: {', '.join(SUPPORTED_EXTS)}",
        )

    # 保存到临时文件
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        result = index_document(
            kb_name=kb_name,
            file_path=tmp_path,
            splitter_type=splitter_type,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            enable_cleaning=enable_cleaning,
            vector_store=_vs,
            doc_store=_ds,
        )
        # 读取完整记录返回
        doc = _ds.get_document(result["doc_id"])
        return DocInfo(**doc)
    finally:
        tmp_path.unlink(missing_ok=True)


@router.delete("/{kb_name}/{doc_id}", response_model=MessageResponse)
def remove_document(kb_name: str, doc_id: int):
    """删除文档。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="文档不存在")
    delete_document(kb_name, doc_id, vector_store=_vs, doc_store=_ds)
    return MessageResponse(message=f"文档 '{doc['file_name']}' 已删除")
