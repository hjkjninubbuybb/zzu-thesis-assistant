"""文档生命周期 Mixin：重索引 + 删除。"""

import logging

from src.core.indexing import delete_document, reindex_document
from src.core.rag.retriever import invalidate_corpus_cache
from src.exceptions import DocumentNotFoundError, KnowledgeBaseNotFoundError
from src.services.document_service._constants import UPLOADS_DIR
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore


class LifecycleMixin:
    """文档生命周期方法集合（重索引 / 删除）。"""

    _ds: BaseDocStore
    _kb: BaseKBStore
    _vs: VectorStore
    logger: logging.Logger

    def reindex(self, kb_name: str, doc_id: int) -> dict:
        """基于当前数据库中的 content 重新对文档进行切分和向量化。

        Args:
            kb_name: 知识库名称。
            doc_id: 文档 ID。

        Returns:
            更新后的文档 dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            ValueError: 文档不存在或没有可索引内容。
        """
        if not self._kb.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")

        reindex_document(
            kb_name=kb_name,
            doc_id=doc_id,
            vector_store=self._vs,
            doc_store=self._ds,
        )
        doc = self._ds.get_document(doc_id)
        invalidate_corpus_cache(kb_name)
        return doc  # type: ignore[return-value]

    def delete(self, kb_name: str, doc_id: int) -> dict:
        """删除文档（向量库 + 数据库 + 上传文件）。

        Args:
            kb_name: 知识库名称。
            doc_id: 文档 ID。

        Returns:
            包含 message 和 file_name 的 dict。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")

        delete_document(kb_name, doc_id, vector_store=self._vs, doc_store=self._ds)
        invalidate_corpus_cache(kb_name)

        # 清理持久化文件
        upload_dir = UPLOADS_DIR / kb_name
        if upload_dir.exists():
            for f in upload_dir.glob(f"{doc_id}_*"):
                f.unlink(missing_ok=True)

        return {"message": f"文档 '{doc['file_name']}' 已删除", "file_name": doc["file_name"]}
