"""FAQ 业务逻辑服务层。

职责：封装 FAQ 的 CRUD、向量同步、Excel 导入导出和语义搜索全部业务逻辑。
本模块不包含任何 FastAPI / HTTP 相关导入。
"""

import io
import logging
import uuid
import zipfile
from datetime import date

import pymysql
from dashscope.common.error import DashScopeException
from openpyxl import Workbook, load_workbook

from src.core.faq_match import rewrite_query as _rewrite_query
from src.core.faq_service import (
    batch_embed_and_upsert,
    build_faq_workbook,
    upsert_faq_vector,
)
from src.exceptions import FAQNotFoundError, KnowledgeBaseNotFoundError
from src.services.base import BaseService
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.vector_store import VectorStore, VectorStoreError

logger = logging.getLogger(__name__)


class FAQService(BaseService):
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

    # ── 列表 ────────────────────────────────────────────────

    def list_faqs(self, kb_name: str, status: str | None, role: str) -> list[dict]:
        """列出知识库下的 FAQ 条目。

        Args:
            kb_name: 知识库名称。
            status: 审核状态过滤（draft/pending/approved/rejected）；None 不过滤。
            role: 调用方角色。student 角色强制只看 approved 条目。

        Returns:
            FAQ dict 列表。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        effective_status = "approved" if role == "student" else status
        return self._faq_store.list_faqs(kb_name, status=effective_status)

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

    # ── Excel 导入 ────────────────────────────────────────────

    def import_from_xlsx(self, kb_name: str, file_bytes: bytes, author_id: int) -> dict:
        """从 Excel 字节流批量导入 FAQ（含自动向量化）。

        Args:
            kb_name: 目标知识库名称。
            file_bytes: .xlsx 文件的原始字节内容。
            author_id: 导入操作人用户 ID。

        Returns:
            包含 total/success/skipped/failed/errors 的统计 dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            ValueError: Excel 文件无法解析。
        """
        self._require_kb(kb_name)

        try:
            wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
            ws = wb.active
        except (ValueError, OSError, zipfile.BadZipFile) as e:
            raise ValueError(f"Excel 文件解析失败：{e}") from e

        from src.core.faq_service import parse_faq_sheet  # avoid circular import at module level

        valid_rows, raw_errors = parse_faq_sheet(ws)
        parse_errors = [{"row": e["row"], "question": e["question"], "reason": e["reason"]} for e in raw_errors]
        total = len(valid_rows) + len(parse_errors)

        if total == 0:
            return {
                "total": 0,
                "success": 0,
                "skipped": 0,
                "failed": 0,
                "errors": [{"row": 0, "question": "", "reason": "文件中无有效数据行"}],
            }

        all_errors: list[dict] = list(parse_errors)
        skipped_count = len(parse_errors)

        # 重复检测
        existing_questions = {f["question"] for f in self._faq_store.list_faqs(kb_name)}
        filtered: list[dict] = []
        for r in valid_rows:
            if r["question"] in existing_questions:
                all_errors.append({"row": 0, "question": r["question"][:50], "reason": "与现有 FAQ 问题重复，已跳过"})
                skipped_count += 1
            else:
                filtered.append(r)
        valid_rows = filtered

        # MySQL 批量插入
        faq_rows: list[dict] = []
        failed_count = 0
        for r in valid_rows:
            try:
                row = self._faq_store.add_faq(
                    kb_name=kb_name,
                    question=r["question"],
                    answer=r["answer"],
                    category=r["category"],
                    sort_order=r["sort_order"],
                    author_id=author_id,
                )
                faq_rows.append(
                    {
                        "question": r["question"],
                        "answer": r["answer"],
                        "faq_id": row["id"],
                        "vector_id": str(uuid.uuid4()),
                    }
                )
            except pymysql.Error as e:
                self.logger.warning("[FAQService] import MySQL 插入失败: %s", e)
                all_errors.append({"row": 0, "question": r["question"][:50], "reason": f"数据库写入失败：{e}"})
                failed_count += 1

        # 批量 embed + upsert
        success_count = 0
        if faq_rows:
            embed_results = batch_embed_and_upsert(kb_name, faq_rows, self._vector_store)
            for r in faq_rows:
                result = embed_results.get(r["faq_id"])
                if isinstance(result, Exception):
                    all_errors.append(
                        {"row": 0, "question": r["question"][:50], "reason": "向量化失败，FAQ 已保存但未加入检索"}
                    )
                    failed_count += 1
                else:
                    try:
                        self._faq_store.update_faq(r["faq_id"], vector_id=r["vector_id"])
                    except pymysql.Error as e:
                        self.logger.warning("[FAQService] 更新 vector_id 失败: %s", e)
                    success_count += 1

        self.logger.info(
            "[FAQService] import kb=%s total=%d success=%d skipped=%d failed=%d",
            kb_name,
            total,
            success_count,
            skipped_count,
            failed_count,
        )
        return {
            "total": total,
            "success": success_count,
            "skipped": skipped_count,
            "failed": failed_count,
            "errors": all_errors[:20],
        }

    # ── Excel 导出 ────────────────────────────────────────────

    def export_to_xlsx(self, kb_name: str) -> tuple[bytes, str]:
        """导出知识库所有 FAQ 为 Excel 文件字节。

        Args:
            kb_name: 知识库名称。

        Returns:
            (文件字节, 文件名) 元组。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        faqs = self._faq_store.list_faqs(kb_name)
        wb: Workbook = build_faq_workbook(faqs=faqs)
        filename = f"{kb_name}_FAQ_{date.today().strftime('%Y%m%d')}.xlsx"
        return _make_xlsx_bytes(wb), filename

    def get_template(self, kb_name: str) -> tuple[bytes, str]:
        """下载 FAQ Excel 导入模板（含表头和示例行）字节。

        Args:
            kb_name: 知识库名称（用于存在性校验）。

        Returns:
            (文件字节, 文件名) 元组。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        wb: Workbook = build_faq_workbook(faqs=None)
        return _make_xlsx_bytes(wb), "FAQ_导入模板.xlsx"

    # ── 语义搜索 ─────────────────────────────────────────────

    def search(self, kb_name: str, query: str, top_k: int = 10) -> dict:
        """LLM 改写查询 + 语义向量检索 FAQ（仅返回已启用的条目）。

        Args:
            kb_name: 知识库名称。
            query: 原始搜索词。
            top_k: 最多返回结果数。

        Returns:
            包含 rewritten_query 和 items 的 dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            RuntimeError: 向量化或向量检索失败。
        """
        self._require_kb(kb_name)

        rewritten = _rewrite_query(query)

        from src.core.rag.embedding import get_embed_model  # late import to avoid heavy startup cost

        try:
            embed_model = get_embed_model(text_type="query")
            vector: list[float] = embed_model.get_text_embedding(rewritten)
        except (ValueError, RuntimeError, DashScopeException) as e:
            self.logger.warning("[FAQService] search embed 失败: %s", e)
            raise RuntimeError("查询向量化失败，请稍后重试") from e

        try:
            hits = self._vector_store.search(
                kb_name,
                vector,
                top_k,
                None,
                {"source_type": "faq"},
            )
        except VectorStoreError as e:
            self.logger.warning("[FAQService] search Qdrant 失败: %s", e)
            raise RuntimeError("向量检索失败，请稍后重试") from e

        items: list[dict] = []
        seen: set[int] = set()
        for hit in hits:
            faq_id = hit.get("faq_id")
            if not isinstance(faq_id, int) or faq_id in seen:
                continue
            row = self._faq_store.get_faq(faq_id)
            if row and row["kb_name"] == kb_name and row.get("enabled") and row.get("status") == "approved":
                items.append(row)
                seen.add(faq_id)

        return {"rewritten_query": rewritten, "items": items}

    # ── 私有辅助 ─────────────────────────────────────────────

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


# ── 模块级工具函数 ────────────────────────────────────────────


def _make_xlsx_bytes(wb: Workbook) -> bytes:
    """将 openpyxl Workbook 序列化为字节。

    Args:
        wb: openpyxl Workbook 实例。

    Returns:
        .xlsx 文件内容字节。
    """
    stream = io.BytesIO()
    wb.save(stream)
    return stream.getvalue()
