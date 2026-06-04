"""文档查询 Mixin：列表 / 详情 / 更新 / 审核详情 / 文件路径 / 文件名。"""

import json
import logging
from pathlib import Path

from src.exceptions import DocumentNotFoundError, KnowledgeBaseNotFoundError
from src.services.document_service._constants import UPLOADS_DIR
from src.services.document_service._exceptions import InvalidDocumentStateError
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore


class QueryMixin:
    """文档读取方法集合。"""

    _ds: BaseDocStore
    _kb: BaseKBStore
    logger: logging.Logger

    def list_documents(
        self, kb_name: str, page: int = 1, page_size: int = 20, doc_type: str | None = None
    ) -> tuple[list[dict], int]:
        """列出知识库下的所有文档（分页）。

        Args:
            kb_name: 知识库名称。
            page: 页码（从 1 开始）。
            page_size: 每页条数。

        Returns:
            (文档 dict 列表, 总条数) 元组。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        if not self._kb.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        return self._ds.list_documents(kb_name, page=page, page_size=page_size, doc_type=doc_type)

    def get_document(self, doc_id: int, kb_name: str) -> dict:
        """获取文档详情。

        Args:
            doc_id: 文档 ID。
            kb_name: 知识库名称。

        Returns:
            文档 dict。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")
        return doc

    def update_document(self, doc_id: int, kb_name: str, **kwargs: object) -> dict:
        """更新文档字段（摘要、内容等）。

        Args:
            doc_id: 文档 ID。
            kb_name: 知识库名称。
            **kwargs: 要更新的字段（summary、content 等）。

        Returns:
            更新后的文档 dict。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")
        self._ds.update_document(doc_id, **kwargs)
        return self._ds.get_document(doc_id)  # type: ignore[return-value]

    def get_review_detail(self, kb_name: str, doc_id: int) -> dict:
        """获取审核中文档的详情（清洗文本 + 分块预览）。

        Args:
            kb_name: 知识库名称。
            doc_id: 文档 ID。

        Returns:
            包含 doc_id、file_name、status、cleaned_content、chunks 等字段的 dict。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
            InvalidDocumentStateError: 文档不在审核状态。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")
        if doc["status"] not in ("pending_review", "pending_chunk_review"):
            raise InvalidDocumentStateError(f"文档不在审核状态: {doc['status']}")

        chunks = None
        if doc["status"] == "pending_chunk_review" and doc.get("chunks_preview"):
            chunks_data = json.loads(doc["chunks_preview"])
            chunks = [{"index": c["index"], "content": c["content"]} for c in chunks_data]

        return {
            "doc_id": doc_id,
            "file_name": doc["file_name"],
            "status": doc["status"],
            "cleaned_content": doc.get("content"),
            "chunks": chunks,
            "doc_type": doc.get("doc_type", "policy"),
            "splitter_type": doc.get("splitter_type", "recursive"),
            "chunk_size": doc.get("chunk_size", 256),
            "chunk_overlap_ratio": doc.get("chunk_overlap_ratio", 0.2),
        }

    def get_file_path(self, doc_id: int, kb_name: str) -> Path:
        """获取文档原始文件的路径（供下载使用）。

        Args:
            doc_id: 文档 ID。
            kb_name: 知识库名称。

        Returns:
            文件 Path 对象。

        Raises:
            DocumentNotFoundError: 文档不存在、不属于指定知识库或原始文件未找到。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")

        matches = list((UPLOADS_DIR / kb_name).glob(f"{doc_id}_*"))
        if not matches:
            raise DocumentNotFoundError("原始文件未找到（可能在文件持久化功能上线前上传，请重新上传）")
        return matches[0]

    def get_document_name(self, doc_id: int, kb_name: str) -> str:
        """获取文档的文件名。

        Args:
            doc_id: 文档 ID。
            kb_name: 知识库名称。

        Returns:
            文件名字符串。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")
        return doc["file_name"]
