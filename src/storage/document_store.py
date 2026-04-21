"""MySQL 文档元数据存储（知识库/文档/FAQ/对话/消息/反馈/系统设置）。"""

import json
import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class DocumentStore:
    """文档和知识库元数据 MySQL CRUD 操作。"""

    # ── 知识库操作 ────────────────────────────────────────

    def create_kb(self, name: str, description: str = "") -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    "INSERT INTO knowledge_bases (name, description, created_at) VALUES (%s, %s, %s)",
                    (name, description, now),
                )
                conn.commit()
                cur.execute("SELECT * FROM knowledge_bases WHERE name = %s", (name,))
                return cur.fetchone()

    def list_kbs(self) -> list[dict]:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT kb.*, COUNT(d.id) as doc_count
                    FROM knowledge_bases kb
                    LEFT JOIN documents d ON kb.name = d.kb_name
                    GROUP BY kb.id
                    ORDER BY kb.created_at DESC
                    """
                )
                return cur.fetchall()

    def get_kb(self, name: str) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM knowledge_bases WHERE name = %s", (name,))
                return cur.fetchone()

    def delete_kb(self, name: str) -> None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM documents WHERE kb_name = %s", (name,))
                cur.execute("DELETE FROM knowledge_bases WHERE name = %s", (name,))
                conn.commit()

    # ── 文档操作 ──────────────────────────────────────────

    def add_document(
        self,
        kb_name: str,
        file_name: str,
        file_size: int = 0,
        chunk_count: int = 0,
        chunk_size: int = 256,
        doc_type: str = "plain_text",
    ) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO documents
                       (kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, status, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, 'completed', %s)""",
                    (kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, now),
                )
                conn.commit()
                cur.execute("SELECT * FROM documents WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def list_documents(self, kb_name: str) -> list[dict]:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM documents WHERE kb_name = %s ORDER BY created_at DESC",
                    (kb_name,),
                )
                return cur.fetchall()

    def delete_document(self, doc_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
                row = cur.fetchone()
                if row:
                    cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
                    conn.commit()
                return row

    def get_document(self, doc_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
                return cur.fetchone()

    # ── FAQ 操作 ──────────────────────────────────────────────

    def add_faq(
        self,
        kb_name: str,
        question: str,
        answer: str,
        category: str = "",
        sort_order: int = 0,
        vector_id: str | None = None,
    ) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO faqs
                       (kb_name, question, answer, category, sort_order, enabled, vector_id, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, 1, %s, %s, %s)""",
                    (kb_name, question, answer, category, sort_order, vector_id, now, now),
                )
                conn.commit()
                cur.execute("SELECT * FROM faqs WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def list_faqs(self, kb_name: str, enabled_only: bool = False) -> list[dict]:
        sql = "SELECT * FROM faqs WHERE kb_name = %s"
        params: list = [kb_name]
        if enabled_only:
            sql += " AND enabled = 1"
        sql += " ORDER BY sort_order ASC, id ASC"
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()

    def get_faq(self, faq_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
                return cur.fetchone()

    def update_faq(self, faq_id: int, **kwargs) -> dict | None:
        allowed = {"question", "answer", "category", "sort_order", "enabled", "vector_id"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_faq(faq_id)
        updates["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [faq_id]
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"UPDATE faqs SET {set_clause} WHERE id = %s", values)  # noqa: S608
                conn.commit()
                cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
                return cur.fetchone()

    def delete_faq(self, faq_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
                row = cur.fetchone()
                if row:
                    cur.execute("DELETE FROM faqs WHERE id = %s", (faq_id,))
                    conn.commit()
                return row

    # ── 系统设置 ──────────────────────────────────────────────

    def get_setting(self, key: str) -> str | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM system_settings WHERE `key` = %s", (key,))
                row = cur.fetchone()
                return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO system_settings (`key`, value) VALUES (%s, %s) "
                    "ON DUPLICATE KEY UPDATE value = VALUES(value)",
                    (key, value),
                )
                conn.commit()

    def delete_setting(self, key: str) -> None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM system_settings WHERE `key` = %s", (key,))
                conn.commit()

    # ── 对话 ──────────────────────────────────────────────────

    def create_conversation(self, kb_name: str, title: str = "新对话", user_id: int | None = None) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO conversations (kb_name, user_id, title, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (kb_name, user_id, title, now, now),
                )
                conn.commit()
                cur.execute("SELECT * FROM conversations WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def list_conversations(self, kb_name: str | None = None, user_id: int | None = None) -> list[dict]:
        sql = "SELECT * FROM conversations WHERE 1=1"
        params: list = []
        if kb_name:
            sql += " AND kb_name = %s"
            params.append(kb_name)
        if user_id is not None:
            sql += " AND user_id = %s"
            params.append(user_id)
        sql += " ORDER BY updated_at DESC, id DESC"
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()

    def get_conversation(self, conv_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
                return cur.fetchone()

    def update_conversation_title(self, conv_id: int, title: str) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    "UPDATE conversations SET title = %s, updated_at = %s WHERE id = %s",
                    (title, now, conv_id),
                )
                conn.commit()
                cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
                return cur.fetchone()

    def delete_conversation(self, conv_id: int) -> None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # MySQL FK ON DELETE CASCADE 会自动删除 messages 和 feedback
                cur.execute("DELETE FROM conversations WHERE id = %s", (conv_id,))
                conn.commit()

    # ── 消息 ──────────────────────────────────────────────────

    def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        sources_json: str | None = None,
        files_json: str | None = None,
    ) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO conversation_messages
                       (conversation_id, role, content, sources, files, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (conversation_id, role, content, sources_json, files_json, now),
                )
                cur.execute(
                    "UPDATE conversations SET updated_at = %s WHERE id = %s",
                    (now, conversation_id),
                )
                conn.commit()
                cur.execute(
                    "SELECT * FROM conversation_messages WHERE id = %s", (cur.lastrowid,)
                )
                return self._parse_message_row(cur.fetchone())

    def list_messages(self, conversation_id: int) -> list[dict]:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM conversation_messages WHERE conversation_id = %s "
                    "ORDER BY id ASC",
                    (conversation_id,),
                )
                return [self._parse_message_row(r) for r in cur.fetchall()]

    @staticmethod
    def _parse_message_row(row: dict) -> dict:
        """将 sources/files 字段从 JSON 字符串反序列化为 list。

        pymysql DictCursor 返回 dict；MySQL JSON 列可能返回 str 或已解析的对象。
        """
        msg = dict(row)
        for field in ("sources", "files"):
            raw = msg.get(field)
            if raw is None:
                continue
            if isinstance(raw, (list, dict)):
                continue  # MySQL JSON 列已自动解析
            try:
                msg[field] = json.loads(raw)
            except (ValueError, TypeError):
                logger.warning("[message] 无法解析 %s 字段（msg_id=%s）", field, msg.get("id"))
                msg[field] = None
        return msg

    # ── 反馈 ──────────────────────────────────────────────────

    def get_message_feedback(self, message_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM message_feedback WHERE message_id = %s", (message_id,)
                )
                return cur.fetchone()

    def set_message_feedback(self, message_id: int, rating: str) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO message_feedback (message_id, rating, created_at)
                       VALUES (%s, %s, %s)
                       ON DUPLICATE KEY UPDATE rating = VALUES(rating), created_at = VALUES(created_at)""",
                    (message_id, rating, now),
                )
                conn.commit()
                cur.execute(
                    "SELECT * FROM message_feedback WHERE message_id = %s", (message_id,)
                )
                return cur.fetchone()
