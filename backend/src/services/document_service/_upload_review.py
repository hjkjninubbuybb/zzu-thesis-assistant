"""文档三步式上传 Mixin：upload_and_clean → confirm_clean → confirm_index。

每一步对应人工审核中的一个环节，与 ``_upload_simple`` 提供的"一键直入库"
形成对照。
"""

import json
import logging
import shutil
from pathlib import Path

from src.core.indexing import (
    embed_and_store_nodes,
    parse_and_clean,
    split_content,
)
from src.core.rag.retriever import invalidate_corpus_cache
from src.exceptions import DocumentNotFoundError
from src.parsers import SUPPORTED_EXTS
from src.parsers.converter import CONVERTIBLE_EXTS, convert_to_pdf
from src.services.document_service._constants import MAX_UPLOAD_BYTES, UPLOADS_DIR
from src.services.document_service._exceptions import (
    EmptyContentError,
    FileTooLargeError,
    InvalidDocumentStateError,
    UnsupportedFileTypeError,
)
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore


class UploadReviewMixin:
    """三步式（人工审核）上传方法集合。"""

    _ds: BaseDocStore
    _kb: BaseKBStore
    _vs: VectorStore
    logger: logging.Logger

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

        tmp = UPLOADS_DIR / kb_name / f"tmp_{file_name}"
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
            dest = UPLOADS_DIR / kb_name / f"{doc_record['id']}_{original_name}"
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
