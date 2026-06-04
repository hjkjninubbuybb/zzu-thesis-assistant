"""DocumentService 主类：装配 4 个 Mixin。"""

from src.services.base import BaseService
from src.services.document_service._lifecycle import LifecycleMixin
from src.services.document_service._query import QueryMixin
from src.services.document_service._upload_review import UploadReviewMixin
from src.services.document_service._upload_simple import UploadSimpleMixin
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore


class DocumentService(
    QueryMixin,
    UploadReviewMixin,
    UploadSimpleMixin,
    LifecycleMixin,
    BaseService,
):
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
