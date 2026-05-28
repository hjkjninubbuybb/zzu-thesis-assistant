"""知识库业务逻辑服务层。

职责：封装知识库 CRUD、学生/管理端 KB 分配等全部业务逻辑。
本模块不包含任何 FastAPI / HTTP 相关导入。
"""

from src.exceptions import KnowledgeBaseNotFoundError
from src.services.base import BaseService
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.settings_store import BaseSettingsStore
from src.storage.vector_store import VectorStore, VectorStoreError

_STUDENT_KB_KEY = "active_kb"
_ADMIN_KB_KEY = "admin_kb"


class KnowledgeBaseAlreadyExistsError(Exception):
    """知识库名称已存在。"""


class KnowledgeService(BaseService):
    """知识库增删查改及 KB 分配服务。"""

    def __init__(
        self,
        kb_store: BaseKBStore,
        settings_store: BaseSettingsStore,
        vector_store: VectorStore,
    ) -> None:
        super().__init__()
        self._kb_store = kb_store
        self._settings_store = settings_store
        self._vector_store = vector_store

    # ── 知识库 CRUD ────────────────────────────────────────

    def list_kbs(self) -> list[dict]:
        """列出所有知识库，附带学生/管理端激活标记。

        Returns:
            知识库 dict 列表，每项额外包含 ``is_active`` 和 ``is_admin_active`` 字段。
        """
        kbs = self._kb_store.list_kbs()
        student_kb = self._settings_store.get_setting(_STUDENT_KB_KEY)
        admin_kb = self._settings_store.get_setting(_ADMIN_KB_KEY)
        return [
            {
                **kb,
                "is_active": (kb["name"] == student_kb),
                "is_admin_active": (kb["name"] == admin_kb),
            }
            for kb in kbs
        ]

    def create_kb(self, name: str, description: str = "") -> dict:
        """创建知识库，同时创建 Qdrant collection。

        Args:
            name: 知识库唯一名称。
            description: 可选描述文本。

        Returns:
            新建的知识库行 dict（含 id、name、description、created_at）。

        Raises:
            KnowledgeBaseAlreadyExistsError: 同名知识库已存在。
        """
        if self._kb_store.get_kb(name):
            raise KnowledgeBaseAlreadyExistsError(f"知识库 '{name}' 已存在")
        self._vector_store.create_collection(name)
        kb = self._kb_store.create_kb(name, description)
        self.logger.info("[KnowledgeService] 知识库已创建: %s", name)
        return kb

    def delete_kb(self, kb_name: str) -> None:
        """删除知识库及 Qdrant collection，并自动清除相关激活设置。

        Args:
            kb_name: 要删除的知识库名称。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        try:
            self._vector_store.delete_collection(kb_name)
        except VectorStoreError as e:
            self.logger.warning("[KnowledgeService] Qdrant 删除失败，继续删除元数据: %s", e)
        self._kb_store.delete_kb(kb_name)
        for key, label in [(_STUDENT_KB_KEY, "学生"), (_ADMIN_KB_KEY, "管理端")]:
            if self._settings_store.get_setting(key) == kb_name:
                self._settings_store.delete_setting(key)
                self.logger.info(
                    "[KnowledgeService] 已自动清除%s知识库分配（原知识库 '%s' 已删除）",
                    label,
                    kb_name,
                )

    # ── KB 分配（学生 / 管理端）────────────────────────────────

    def get_active_kb(self, key: str = _STUDENT_KB_KEY) -> dict | None:
        """获取当前激活知识库的详细信息。

        若设置的 KB 已不存在则自动删除该设置并返回 None。

        Args:
            key: 设置项键名，默认为学生端 ``"active_kb"``，
                 管理端传 ``"admin_kb"``。

        Returns:
            包含 ``kb_name``、``description``、``doc_count`` 的 dict，
            或 None（未设置 / KB 已被删除）。
        """
        kb_name = self._settings_store.get_setting(key)
        if not kb_name:
            return None
        kb = self._kb_store.get_kb(kb_name)
        if not kb:
            self._settings_store.delete_setting(key)
            return None
        kbs = self._kb_store.list_kbs()
        doc_count = next((k["doc_count"] for k in kbs if k["name"] == kb_name), 0)
        return {
            "kb_name": kb_name,
            "description": kb.get("description", ""),
            "doc_count": doc_count,
        }

    def set_active_kb(self, kb_name: str, key: str = _STUDENT_KB_KEY) -> dict:
        """将指定知识库设为激活 KB。

        Args:
            kb_name: 要激活的知识库名称（必须已存在）。
            key: 设置项键名，默认学生端；管理端传 ``"admin_kb"``。

        Returns:
            同 :meth:`get_active_kb` 返回结构。

        Raises:
            KnowledgeBaseNotFoundError: 指定知识库不存在。
        """
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        self._settings_store.set_setting(key, kb_name)
        self.logger.info("[KnowledgeService] KB 分配已更新: %s -> %s", key, kb_name)
        result = self.get_active_kb(key)
        assert result is not None  # KB 刚验证存在，不会为 None
        return result

    def clear_active_kb(self, key: str = _STUDENT_KB_KEY) -> None:
        """清除激活知识库设置。

        Args:
            key: 设置项键名，默认学生端；管理端传 ``"admin_kb"``。
        """
        self._settings_store.delete_setting(key)
        self.logger.info("[KnowledgeService] KB 分配已清除: %s", key)
