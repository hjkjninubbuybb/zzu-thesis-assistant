"""文档一步式上传 Mixin：upload_document（无人工审核环节）。"""

import logging
import shutil
from pathlib import Path

from src.core.indexing import index_document
from src.core.rag.retriever import invalidate_corpus_cache
from src.exceptions import IndexingError, KnowledgeBaseNotFoundError
from src.parsers import SUPPORTED_EXTS
from src.parsers.converter import CONVERTIBLE_EXTS, convert_to_pdf
from src.services.document_service._constants import MAX_UPLOAD_BYTES, UPLOADS_DIR
from src.services.document_service._exceptions import (
    FileTooLargeError,
    UnsupportedFileTypeError,
)
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore


class UploadSimpleMixin:
    """一步式上传（解析→清洗→切分→向量化一次性完成）方法集合。"""

    _ds: BaseDocStore
    _kb: BaseKBStore
    _vs: VectorStore
    logger: logging.Logger

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
            upload_dir = UPLOADS_DIR / kb_name
            upload_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, upload_dir / f"{doc_id}_{safe_filename}")
            self.logger.info("[%s] 文件已持久化: %s", kb_name, f"{doc_id}_{safe_filename}")

            doc = self._ds.get_document(result["doc_id"])
            invalidate_corpus_cache(kb_name)
            return doc  # type: ignore[return-value]
        finally:
            if pdf_tmp:
                pdf_tmp.unlink(missing_ok=True)
