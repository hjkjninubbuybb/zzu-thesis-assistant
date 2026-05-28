"""文档管理业务逻辑服务层。

职责：封装文档上传、清洗审核、分块预览、向量化入库、重索引、删除等全部业务逻辑。
本模块不包含任何 FastAPI / HTTP 相关导入。
"""

import json
import shutil
from pathlib import Path

from src.core.indexing import (
    delete_document,
    embed_and_store_nodes,
    index_document,
    parse_and_clean,
    reindex_document,
    split_content,
)
from src.core.rag.retriever import invalidate_corpus_cache
from src.exceptions import DocumentNotFoundError, IndexingError, KnowledgeBaseNotFoundError
from src.parsers import SUPPORTED_EXTS
from src.parsers.converter import CONVERTIBLE_EXTS, convert_to_pdf
from src.services.base import BaseService
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# 原始文件持久化目录：data/uploads/{kb_name}/{doc_id}_{filename}
_UPLOADS_DIR = Path(__file__).parents[2] / "data" / "uploads"


class UnsupportedFileTypeError(Exception):
    """不支持的文件类型。"""


class FileTooLargeError(Exception):
    """文件大小超过限制。"""


class InvalidDocumentStateError(Exception):
    """文档状态不正确，无法执行请求的操作。"""


class EmptyContentError(Exception):
    """内容为空。"""


class DocumentService(BaseService):
    """文档上传、审核、索引及删除服务。"""

    def __init__(
        self,
        doc_store: BaseDocStore,
        kb_store: BaseKBStore,
        vector_store: VectorStore,
    ) -> None:
        super().__init__()
        self._ds = doc_store
        self._kb = kb_store
        self._vs = vector_store

    # ── 查询 ───────────────────────────────────────────────────

    def list_documents(self, kb_name: str) -> list[dict]:
        """列出知识库下的所有文档。

        Args:
            kb_name: 知识库名称。

        Returns:
            文档 dict 列表。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        if not self._kb.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        return self._ds.list_documents(kb_name)

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

        matches = list((_UPLOADS_DIR / kb_name).glob(f"{doc_id}_*"))
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

    # ── 上传流程（三步式）──────────────────────────────────────

    def upload_and_clean(
        self,
        kb_name: str,
        file_bytes: bytes,
        file_name: str,
        splitter_type: str = "recursive",
        chunk_size: int = 256,
        chunk_overlap_ratio: float = 0.2,
        doc_type: str = "policy",
    ) -> dict:
        """上传文件 → 解析 → 清洗 → 返回清洗文本供审核。

        Args:
            kb_name: 知识库名称。
            file_bytes: 文件二进制内容。
            file_name: 原始文件名。
            splitter_type: 分块策略。
            chunk_size: 分块大小。
            chunk_overlap_ratio: 分块重叠比例。
            doc_type: 文档类型。

        Returns:
            包含 doc_id、file_name、cleaned_content 等字段的 dict。

        Raises:
            UnsupportedFileTypeError: 不支持的文件类型。
            FileTooLargeError: 文件大小超过限制。
        """
        ext = Path(file_name).suffix.lower()
        if ext not in SUPPORTED_EXTS and ext not in CONVERTIBLE_EXTS:
            raise UnsupportedFileTypeError(f"不支持的文件类型: {ext}")

        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise FileTooLargeError("文件大小超过 10 MB 限制")

        tmp = _UPLOADS_DIR / kb_name / f"tmp_{file_name}"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        try:
            tmp.write_bytes(file_bytes)

            file_path = tmp
            original_name = file_name
            if ext in CONVERTIBLE_EXTS:
                file_path = convert_to_pdf(tmp)
                original_name = Path(original_name).with_suffix(".pdf").name

            cleaned_text = parse_and_clean(
                kb_name=kb_name,
                file_path=file_path,
                original_filename=original_name,
                doc_type=doc_type,
                enable_cleaning=True,
            )

            file_size = len(file_bytes)
            doc_record = self._ds.add_document(
                kb_name=kb_name,
                file_name=original_name,
                file_size=file_size,
                chunk_count=0,
                chunk_size=chunk_size,
                chunk_overlap_ratio=chunk_overlap_ratio,
                doc_type=doc_type,
                splitter_type=splitter_type,
                status="pending_review",
                content=cleaned_text,
            )

            # Persist original file
            dest = _UPLOADS_DIR / kb_name / f"{doc_record['id']}_{original_name}"
            dest.parent.mkdir(parents=True, exist_ok=True)
            if file_path != tmp:
                shutil.copy2(file_path, dest)
            else:
                tmp.rename(dest)

            return {
                "doc_id": doc_record["id"],
                "file_name": original_name,
                "cleaned_content": cleaned_text,
                "doc_type": doc_type,
                "splitter_type": splitter_type,
                "chunk_size": chunk_size,
                "chunk_overlap_ratio": chunk_overlap_ratio,
            }
        finally:
            if tmp.exists():
                tmp.unlink(missing_ok=True)

    def confirm_clean(self, kb_name: str, doc_id: int, content: str) -> dict:
        """确认清洗文本 → 执行分块 → 返回分块预览。

        Args:
            kb_name: 知识库名称。
            doc_id: 文档 ID。
            content: 审核后的清洗文本。

        Returns:
            包含 doc_id、chunks、chunk_count 的 dict。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
            InvalidDocumentStateError: 文档状态不正确。
            EmptyContentError: 清洗内容为空。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")
        if doc["status"] != "pending_review":
            raise InvalidDocumentStateError(f"文档状态不正确: {doc['status']}，需要 pending_review")
        if not content or not content.strip():
            raise EmptyContentError("清洗内容不能为空")

        self._ds.update_document(doc_id, content=content)

        nodes = split_content(
            text=content,
            file_name=doc["file_name"],
            kb_name=kb_name,
            splitter_type=doc.get("splitter_type", "recursive"),
            chunk_size=doc.get("chunk_size", 256),
            chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
            doc_type=doc.get("doc_type", "policy"),
        )

        if not nodes:
            raise EmptyContentError("分块结果为空，请检查文本内容是否过短")

        chunks_data = []
        for i, node in enumerate(nodes):
            chunks_data.append(
                {
                    "index": i,
                    "content": node.get_content(),
                    "metadata": {k: v for k, v in node.metadata.items()},
                    "node_id": node.node_id,
                }
            )
        self._ds.update_document(
            doc_id,
            chunks_preview=json.dumps(chunks_data, ensure_ascii=False),
            status="pending_chunk_review",
        )

        chunks = [{"index": c["index"], "content": c["content"]} for c in chunks_data]
        return {"doc_id": doc_id, "chunks": chunks, "chunk_count": len(chunks)}

    def confirm_index(self, kb_name: str, doc_id: int) -> dict:
        """确认分块结果 → 向量化入库。

        Args:
            kb_name: 知识库名称。
            doc_id: 文档 ID。

        Returns:
            包含 doc_id、status、chunk_count 的 dict。

        Raises:
            DocumentNotFoundError: 文档不存在或不属于指定知识库。
            InvalidDocumentStateError: 文档状态不正确或分块预览数据丢失。
        """
        doc = self._ds.get_document(doc_id)
        if not doc or doc["kb_name"] != kb_name:
            raise DocumentNotFoundError("文档不存在")
        if doc["status"] != "pending_chunk_review":
            raise InvalidDocumentStateError(f"文档状态不正确: {doc['status']}，需要 pending_chunk_review")

        chunks_json = doc.get("chunks_preview")
        if not chunks_json:
            raise InvalidDocumentStateError("分块预览数据丢失")

        chunks_data = json.loads(chunks_json)

        from llama_index.core.schema import TextNode

        nodes = [
            TextNode(
                text=c["content"],
                metadata=c.get("metadata", {}),
                id_=c.get("node_id", ""),
            )
            for c in chunks_data
        ]

        result = embed_and_store_nodes(
            kb_name=kb_name,
            file_name=doc["file_name"],
            file_size=doc.get("file_size", 0),
            chunk_size=doc.get("chunk_size", 256),
            doc_type=doc.get("doc_type", "policy"),
            nodes=nodes,
            full_text=doc.get("content", ""),
            splitter_type=doc.get("splitter_type", "recursive"),
            chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
            vector_store=self._vs,
            doc_store=self._ds,
            doc_id=doc_id,
        )

        invalidate_corpus_cache(kb_name)
        return {
            "doc_id": doc_id,
            "status": "active",
            "chunk_count": result["chunk_count"],
        }

    # ── 一步式上传（旧接口）─────────────────────────────────────

    def upload_document(
        self,
        kb_name: str,
        file_path: Path,
        safe_filename: str,
        splitter_type: str = "recursive",
        chunk_size: int = 256,
        chunk_overlap_ratio: float = 0.2,
        enable_cleaning: bool = False,
        doc_type: str = "policy",
    ) -> dict:
        """一步式上传：解析 → 清洗 → 切分 → 向量化入库。

        Args:
            kb_name: 知识库名称。
            file_path: 临时文件路径（已写入磁盘）。
            safe_filename: 安全的原始文件名。
            splitter_type: 分块策略。
            chunk_size: 分块大小。
            chunk_overlap_ratio: 分块重叠比例。
            enable_cleaning: 是否启用 LLM 清洗。
            doc_type: 文档类型。

        Returns:
            文档 dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            UnsupportedFileTypeError: 不支持的文件类型。
            FileTooLargeError: 文件大小超过限制。
            IndexingError: 索引过程失败。
        """
        if not self._kb.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")

        ext = Path(safe_filename).suffix.lower()
        if ext not in (SUPPORTED_EXTS | CONVERTIBLE_EXTS):
            raise UnsupportedFileTypeError(f"不支持的文件类型 '{ext}'，支持: {', '.join(SUPPORTED_EXTS)}")

        if file_path.stat().st_size > MAX_UPLOAD_BYTES:
            raise FileTooLargeError(f"文件过大，最大支持 {MAX_UPLOAD_BYTES // 1024 // 1024} MB")

        # Word 文档先转 PDF
        index_path: Path = file_path
        pdf_tmp: Path | None = None
        if ext in CONVERTIBLE_EXTS:
            try:
                converted: Path = convert_to_pdf(file_path)
                pdf_tmp = converted
                index_path = converted
                self.logger.info("[%s] 已转换为 PDF: %s", kb_name, safe_filename)
            except (OSError, RuntimeError) as e:
                raise IndexingError(f"文件转换失败：{e}") from e

        try:
            result = index_document(
                kb_name=kb_name,
                file_path=index_path,
                splitter_type=splitter_type,
                chunk_size=chunk_size,
                chunk_overlap_ratio=chunk_overlap_ratio,
                enable_cleaning=enable_cleaning,
                doc_type=doc_type,
                vector_store=self._vs,
                doc_store=self._ds,
                original_filename=safe_filename,
            )

            # 持久化原始文件
            doc_id = result["doc_id"]
            upload_dir = _UPLOADS_DIR / kb_name
            upload_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, upload_dir / f"{doc_id}_{safe_filename}")
            self.logger.info("[%s] 文件已持久化: %s", kb_name, f"{doc_id}_{safe_filename}")

            doc = self._ds.get_document(result["doc_id"])
            invalidate_corpus_cache(kb_name)
            return doc  # type: ignore[return-value]
        finally:
            if pdf_tmp:
                pdf_tmp.unlink(missing_ok=True)

    # ── 重索引 ─────────────────────────────────────────────────

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

    # ── 删除 ───────────────────────────────────────────────────

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
        upload_dir = _UPLOADS_DIR / kb_name
        if upload_dir.exists():
            for f in upload_dir.glob(f"{doc_id}_*"):
                f.unlink(missing_ok=True)

        return {"message": f"文档 '{doc['file_name']}' 已删除", "file_name": doc["file_name"]}
