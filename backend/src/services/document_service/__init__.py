"""文档业务编排：上传 / 清洗审核 / 分块预览 / 向量化 / 重索引 / 删除。

外部统一通过 ``from src.services.document_service import DocumentService`` 等引用。
内部按职责拆分到 _query / _upload_review / _upload_simple / _lifecycle 四个 Mixin。
"""

from src.services.document_service._exceptions import (
    EmptyContentError,
    FileTooLargeError,
    InvalidDocumentStateError,
    UnsupportedFileTypeError,
)
from src.services.document_service.service import DocumentService

__all__ = [
    "DocumentService",
    "EmptyContentError",
    "FileTooLargeError",
    "InvalidDocumentStateError",
    "UnsupportedFileTypeError",
]
