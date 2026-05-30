"""FAQ 存储（faqs 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class FAQStore:
    """FAQ MySQL CRUD。"""

    def add_faq(
        self,
        kb_name: str,
        question: str,
        answer: str,
        category: str = "",
        sort_order: int = 0,
        vector_id: str | None = None,
        author_id: int | None = None,
        status: str = "approved",
    ) -> dict:
        """新增 FAQ 条目。

        Args:
            kb_name: 所属知识库名称。
            question: 问题文本。
            answer: 答案文本。
            category: 分类标签。
            sort_order: 排序权重（越小越靠前）。
            vector_id: Qdrant 向量点 ID。
            author_id: 创建人用户 ID。
            status: 审核状态（approved/pending）。

        Returns:
            新插入的 FAQ 行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO faqs
                   (kb_name, question, answer, category, sort_order, enabled, vector_id, author_id, status, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, 1, %s, %s, %s, %s, %s)""",
                (
                    kb_name,
                    question,
                    answer,
                    category,
                    sort_order,
                    vector_id,
                    author_id,
                    status,
                    now,
                    now,
                ),
            )
            conn.commit()
            cur.execute("SELECT * FROM faqs WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def list_faqs(self, kb_name: str, enabled_only: bool = False, status: str | None = None) -> list[dict]:
        """列出知识库下的 FAQ 列表。

        Args:
            kb_name: 知识库名称。
            enabled_only: 仅返回已启用（enabled=1）的条目。
            status: 过滤指定审核状态。

        Returns:
            FAQ 列表，按 sort_order ASC, id ASC 排序。
        """
        sql = "SELECT * FROM faqs WHERE kb_name = %s"
        params: list = [kb_name]
        if enabled_only:
            sql += " AND enabled = 1"
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY sort_order ASC, id ASC"
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def get_faq(self, faq_id: int) -> dict | None:
        """按 ID 查询 FAQ。

        Args:
            faq_id: FAQ ID。

        Returns:
            FAQ 行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            return cur.fetchone()

    def update_faq(self, faq_id: int, **kwargs) -> dict | None:
        """更新 FAQ 字段（仅白名单字段）。

        Args:
            faq_id: FAQ ID。
            **kwargs: 待更新的字段与值。

        Returns:
            更新后的 FAQ 行 dict，ID 不存在时返回 None。
        """
        allowed = {
            "question",
            "answer",
            "category",
            "sort_order",
            "enabled",
            "vector_id",
            "status",
            "author_id",
        }
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_faq(faq_id)
        updates["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [faq_id]
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE faqs SET {set_clause} WHERE id = %s", values)
            conn.commit()
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            return cur.fetchone()

    def delete_faq(self, faq_id: int) -> dict | None:
        """删除 FAQ，返回删除前的行数据。

        Args:
            faq_id: FAQ ID。

        Returns:
            被删除的 FAQ 行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            row = cur.fetchone()
            if row:
                cur.execute("DELETE FROM faqs WHERE id = %s", (faq_id,))
                conn.commit()
            return row

    def search_by_text(self, kb_name: str, query: str, limit: int = 20) -> list[dict]:
        """Question 或 answer 包含 query 的 FAQ 列表。

        Args:
            kb_name: 知识库名称。
            query: 搜索关键词（做 LIKE 匹配）。
            limit: 最大返回条数。

        Returns:
            匹配的 FAQ 行列表，不过滤 status/enabled，按 sort_order ASC, id DESC 排序。
        """
        like = f"%{query}%"
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT * FROM faqs
                   WHERE kb_name = %s
                     AND (question LIKE %s OR answer LIKE %s)
                   ORDER BY sort_order ASC, id DESC
                   LIMIT %s""",
                (kb_name, like, like, limit),
            )
            return cur.fetchall()
