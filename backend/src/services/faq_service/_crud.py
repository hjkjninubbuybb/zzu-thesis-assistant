"""FAQ CRUD Mixin：列表 / 创建 / 更新 / 删除（含向量库联动）。

混入到 ``FAQService`` 后通过 ``self`` 访问 ``_faq_store`` / ``_kb_store`` /
``_vector_store`` / ``logger`` 以及 ``_require_kb`` / ``_upsert_vector``。
"""

import logging
import uuid

from src.exceptions import FAQNotFoundError
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.vector_store import VectorStore, VectorStoreError


class CrudMixin:
    """FAQ CRUD 方法集合，由 FAQService 通过 Mixin 装配。"""

    # 由 FAQService 提供的属性（前向声明，便于类型检查）
    _faq_store: FAQStore
    _kb_store: KBStore
    _vector_store: VectorStore
    logger: logging.Logger

    def _require_kb(self, kb_name: str) -> None: ...  # 由 FAQService 实现
    def _upsert_vector(
        self, faq_id: int, question: str, answer: str, kb_name: str, vector_id: str
    ) -> None: ...  # 由 FAQService 实现

    # ── 列表 ────────────────────────────────────────────────

    def list_faqs(
        self, kb_name: str, status: str | None, role: str, page: int = 1, page_size: int = 20
    ) -> tuple[list[dict], int]:
        """列出知识库下的 FAQ 条目（分页）。

        Args:
            kb_name: 知识库名称。
            status: 审核状态过滤（draft/pending/approved/rejected）；None 不过滤。
            role: 调用方角色。student 角色强制只看 approved 条目。
            page: 页码（从 1 开始）。
            page_size: 每页条数。

        Returns:
            (FAQ dict 列表, 总条数) 元组。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        effective_status = "approved" if role == "student" else status
        return self._faq_store.list_faqs(kb_name, status=effective_status, page=page, page_size=page_size)

    # ── 创建 ────────────────────────────────────────────────

    def create(
        self,
        kb_name: str,
        question: str,
        answer: str,
        category: str,
        sort_order: int,
        author_id: int,
        role: str,
    ) -> dict:
        """创建 FAQ 条目，管理员直接通过，教师提交为待审核。

        Args:
            kb_name: 所属知识库名称。
            question: 问题文本。
            answer: 答案文本。
            category: 分类标签。
            sort_order: 排序权重。
            author_id: 创建人用户 ID。
            role: 创建人角色（admin 直接 approved，其余为 pending）。

        Returns:
            新创建的 FAQ dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        status = "approved" if role == "admin" else "pending"

        row = self._faq_store.add_faq(
            kb_name=kb_name,
            question=question,
            answer=answer,
            category=category,
            sort_order=sort_order,
            author_id=author_id,
            status=status,
        )
        faq_id = row["id"]

        if status == "approved":
            vector_id = str(uuid.uuid4())
            try:
                self._upsert_vector(faq_id, question, answer, kb_name, vector_id)
                row = self._faq_store.update_faq(faq_id, vector_id=vector_id)
            except (VectorStoreError, RuntimeError) as e:
                self.logger.warning("[FAQService] embed/index 失败，FAQ 已保存但未向量化: %s", e)

        return row

    # ── 更新 ────────────────────────────────────────────────

    def update(self, kb_name: str, faq_id: int, author_id: int, role: str, **kwargs) -> dict:
        """更新 FAQ，联动向量库（审核状态流转 / Q&A 变更 / enabled 切换）。

        Args:
            kb_name: 所属知识库名称（用于校验归属）。
            faq_id: FAQ ID。
            author_id: 操作人用户 ID（教师只能改自己的条目）。
            role: 操作人角色。
            **kwargs: 待更新字段（question/answer/category/sort_order/status/enabled）。

        Returns:
            更新后的 FAQ dict。

        Raises:
            FAQNotFoundError: FAQ 不存在或不属于该知识库。
            PermissionError: 教师试图修改他人 FAQ。
        """
        existing = self._faq_store.get_faq(faq_id)
        if not existing or existing["kb_name"] != kb_name:
            raise FAQNotFoundError(f"FAQ {faq_id} 不存在")

        if role == "teacher" and existing["author_id"] != author_id:
            raise PermissionError("无权修改他人的 FAQ 申请")

        updates = {k: v for k, v in kwargs.items() if v is not None}

        becoming_approved = updates.get("status") == "approved" and existing.get("status") != "approved"
        becoming_unapproved = (
            updates.get("status") in ("pending", "rejected", "draft") and existing.get("status") == "approved"
        )

        current_status = updates.get("status") or existing["status"]

        # Q/A 变更或刚审核通过 → 重新 embed
        if current_status == "approved" and ("question" in updates or "answer" in updates or becoming_approved):
            new_q = updates.get("question", existing["question"])
            new_a = updates.get("answer", existing["answer"])
            vector_id = existing.get("vector_id") or str(uuid.uuid4())
            try:
                self._upsert_vector(faq_id, new_q, new_a, kb_name, vector_id)
                updates["vector_id"] = vector_id
            except (VectorStoreError, RuntimeError) as e:
                self.logger.warning("[FAQService] re-embed 失败: %s", e)

        # 状态变为非 approved → 删除向量
        if becoming_unapproved:
            vid = existing.get("vector_id")
            if vid:
                try:
                    self._vector_store.delete_by_ids(kb_name, [vid])
                    updates["vector_id"] = None
                except VectorStoreError as e:
                    self.logger.warning("[FAQService] 移除审核状态时删除向量失败: %s", e)

        # enabled 切换联动 Qdrant（仅限已通过的 FAQ）
        if "enabled" in updates and current_status == "approved":
            becoming_disabled = not updates["enabled"] and bool(existing.get("enabled"))
            becoming_enabled = updates["enabled"] and not bool(existing.get("enabled"))

            if becoming_disabled:
                vid = updates.get("vector_id") or existing.get("vector_id")
                if vid:
                    try:
                        self._vector_store.delete_by_ids(kb_name, [vid])
                        self.logger.info("[FAQService] FAQ %d 已禁用，向量已从 Qdrant 删除", faq_id)
                    except VectorStoreError as e:
                        self.logger.warning("[FAQService] 禁用时删除向量失败: %s", e)

            elif becoming_enabled:
                q = updates.get("question", existing["question"])
                a = updates.get("answer", existing["answer"])
                vid = updates.get("vector_id") or existing.get("vector_id") or str(uuid.uuid4())
                try:
                    self._upsert_vector(faq_id, q, a, kb_name, vid)
                    updates["vector_id"] = vid
                    self.logger.info("[FAQService] FAQ %d 已启用，向量已重新写入 Qdrant", faq_id)
                except (VectorStoreError, RuntimeError) as e:
                    self.logger.warning("[FAQService] 启用时 re-embed 失败: %s", e)

        row = self._faq_store.update_faq(faq_id, **updates)
        if row is None:
            raise FAQNotFoundError(f"FAQ {faq_id} 不存在")
        return row

    # ── 删除 ────────────────────────────────────────────────

    def delete(self, kb_name: str, faq_id: int) -> dict:
        """删除 FAQ，并从 Qdrant 移除对应向量。

        Args:
            kb_name: 所属知识库名称（用于校验归属）。
            faq_id: FAQ ID。

        Returns:
            包含 message 的操作结果 dict。

        Raises:
            FAQNotFoundError: FAQ 不存在或不属于该知识库。
        """
        existing = self._faq_store.get_faq(faq_id)
        if not existing or existing["kb_name"] != kb_name:
            raise FAQNotFoundError(f"FAQ {faq_id} 不存在")

        vector_id = existing.get("vector_id")
        if vector_id:
            try:
                self._vector_store.delete_by_ids(kb_name, [vector_id])
            except VectorStoreError as e:
                self.logger.warning("[FAQService] 从 Qdrant 删除向量失败: %s", e)

        self._faq_store.delete_faq(faq_id)
        self.logger.info("[FAQService] FAQ %d 已删除", faq_id)
        return {"message": f"FAQ {faq_id} 已删除"}
