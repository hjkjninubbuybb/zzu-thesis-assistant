"""全局业务异常层级。

位置：四层之外，src/ 根目录。
所有层（api/services/core/storage）均可 import，不计入层级违规。
"""


class AppException(Exception):
    """所有业务异常的基类。"""

    code: str = "APP_ERROR"
    http_status: int = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)


# ── 存储相关（storage/ 层使用）──────────────────────────────


class StorageError(AppException):
    """数据库/存储操作失败。"""

    code = "STORAGE_ERROR"
    http_status = 500


# ── 文档相关（core/ 和 services/ 层使用）───────────────────


class DocumentNotFoundError(AppException):
    """文档不存在。"""

    code = "DOCUMENT_NOT_FOUND"
    http_status = 404


class IndexingError(AppException):
    """文档索引失败。"""

    code = "INDEXING_FAILED"
    http_status = 500


# ── FAQ 相关 ────────────────────────────────────────────────


class FAQNotFoundError(AppException):
    """FAQ 条目不存在。"""

    code = "FAQ_NOT_FOUND"
    http_status = 404


# ── 知识库相关 ──────────────────────────────────────────────


class KnowledgeBaseNotFoundError(AppException):
    """知识库不存在。"""

    code = "KB_NOT_FOUND"
    http_status = 404


# ── RAG 相关 ────────────────────────────────────────────────


class RAGError(AppException):
    """RAG pipeline 执行失败。"""

    code = "RAG_ERROR"
    http_status = 500


# ── 用户相关 ────────────────────────────────────────────────


class UserNotFoundError(AppException):
    """用户不存在。"""

    code = "USER_NOT_FOUND"
    http_status = 404


class PermissionDeniedError(AppException):
    """权限不足。"""

    code = "PERMISSION_DENIED"
    http_status = 403
