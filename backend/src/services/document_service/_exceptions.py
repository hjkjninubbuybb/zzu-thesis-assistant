"""文档服务的本地业务异常。

注意：这些异常**不**继承 ``AppException``，由路由层捕获后转 HTTP 响应。
原因是它们多与上传校验相关，路由层需要不同的状态码逻辑。
"""


class UnsupportedFileTypeError(Exception):
    """不支持的文件类型。"""


class FileTooLargeError(Exception):
    """文件大小超过限制。"""


class InvalidDocumentStateError(Exception):
    """文档状态不正确，无法执行请求的操作。"""


class EmptyContentError(Exception):
    """内容为空。"""
