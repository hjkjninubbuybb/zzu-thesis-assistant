"""FAQService 主类：装配 CRUD / Excel / Search 三个 Mixin。

共享辅助方法（``_require_kb``、``_upsert_vector``）放在本文件，
被各 Mixin 直接通过 ``self`` 调用。
"""

from src.exceptions import KnowledgeBaseNotFoundError
from src.services._faq_helpers import upsert_faq_vector
from src.services.base import BaseService
from src.services.faq_service._crud import CrudMixin
from src.services.faq_service._excel import ExcelMixin
from src.services.faq_service._search import SearchMixin
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.vector_store import VectorStore


class FAQService(CrudMixin, ExcelMixin, SearchMixin, BaseService):
    """FAQ 增删查改、向量同步、Excel 导入导出及语义搜索服务。"""

    def __init__(
        self,
        faq_store: FAQStore,
        kb_store: KBStore,
        vector_store: VectorStore,
    ) -> None:
        super().__init__()
        self._faq_store = faq_store
        self._kb_store = kb_store
        self._vector_store = vector_store

    # ── 共享辅助方法 ─────────────────────────────────────────

    def _require_kb(self, kb_name: str) -> None:
        """校验知识库存在，不存在则抛出 KnowledgeBaseNotFoundError。

        Args:
            kb_name: 知识库名称。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")

    def _upsert_vector(
        self,
        faq_id: int,
        question: str,
        answer: str,
        kb_name: str,
        vector_id: str,
    ) -> None:
        """同步将 FAQ embed 并 upsert 到 Qdrant。

        Args:
            faq_id: FAQ 数据库 ID。
            question: 问题文本。
            answer: 答案文本。
            kb_name: 目标知识库名称。
            vector_id: Qdrant 点 ID（UUID 字符串）。
        """
        upsert_faq_vector(kb_name, question, answer, faq_id, vector_id, self._vector_store)
