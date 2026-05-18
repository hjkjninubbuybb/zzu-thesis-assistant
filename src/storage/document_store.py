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
        chunk_overlap_ratio: float = 0.1,
        doc_type: str = "plain_text",
        splitter_type: str = "recursive",
        status: str = "completed",
        summary: str | None = None,
        content: str | None = None,
    ) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO documents
                       (kb_name, file_name, file_size, chunk_count, chunk_size, chunk_overlap_ratio, 
                        doc_type, splitter_type, status, summary, content, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (kb_name, file_name, file_size, chunk_count, chunk_size, chunk_overlap_ratio,
                     doc_type, splitter_type, status, summary, content, now),
                )
                conn.commit()
                cur.execute("SELECT * FROM documents WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def update_document(self, doc_id: int, **kwargs) -> bool:
        allowed = {
            "summary", "content", "chunk_count", "status", 
            "chunk_size", "chunk_overlap_ratio", "splitter_type"
        }
        updates = []
        params = []
        for k, v in kwargs.items():
            if k in allowed:
                updates.append(f"{k} = %s")
                params.append(v)
        
        if not updates:
            return False
            
        params.append(doc_id)
        sql = f"UPDATE documents SET {', '.join(updates)} WHERE id = %s"
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                conn.commit()
                return cur.rowcount > 0

    def update_document_summary(self, doc_id: int, summary: str) -> bool:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE documents SET summary = %s WHERE id = %s",
                    (summary, doc_id),
                )
                conn.commit()
                return cur.rowcount > 0

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
        author_id: int | None = None,
        status: str = "approved",
    ) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO faqs
                       (kb_name, question, answer, category, sort_order, enabled, vector_id, author_id, status, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, 1, %s, %s, %s, %s, %s)""",
                    (kb_name, question, answer, category, sort_order, vector_id, author_id, status, now, now),
                )
                conn.commit()
                cur.execute("SELECT * FROM faqs WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def list_faqs(self, kb_name: str, enabled_only: bool = False, status: str | None = None) -> list[dict]:
        sql = "SELECT * FROM faqs WHERE kb_name = %s"
        params: list = [kb_name]
        if enabled_only:
            sql += " AND enabled = 1"
        if status:
            sql += " AND status = %s"
            params.append(status)
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
        allowed = {"question", "answer", "category", "sort_order", "enabled", "vector_id", "status", "author_id"}
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

    def list_conversations(
        self,
        kb_name: str | None = None,
        user_id: int | None = None,
        limit: int = 30,
        cursor_id: int | None = None,
        cursor_updated_at: str | None = None,
    ) -> dict:
        sql = "SELECT * FROM conversations WHERE 1=1"
        params: list = []
        if kb_name:
            sql += " AND kb_name = %s"
            params.append(kb_name)
        if user_id is not None:
            sql += " AND user_id = %s"
            params.append(user_id)
        if cursor_id is not None and cursor_updated_at is not None:
            sql += " AND (updated_at < %s OR (updated_at = %s AND id < %s))"
            params.extend([cursor_updated_at, cursor_updated_at, cursor_id])
        sql += " ORDER BY updated_at DESC, id DESC LIMIT %s"
        params.append(limit + 1)

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        has_more = len(rows) > limit
        items = rows[:limit]
        next_cursor: dict | None = None
        if has_more and items:
            last = items[-1]
            updated_at = last["updated_at"]
            if isinstance(updated_at, datetime):
                updated_at = updated_at.strftime("%Y-%m-%d %H:%M:%S")
            next_cursor = {"id": last["id"], "updated_at": str(updated_at)}
        return {"items": items, "has_more": has_more, "next_cursor": next_cursor}

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
                msg_id = cur.lastrowid  # 在 UPDATE 之前保存，避免被覆盖
                cur.execute(
                    "UPDATE conversations SET updated_at = %s WHERE id = %s",
                    (now, conversation_id),
                )
                conn.commit()
                cur.execute(
                    "SELECT * FROM conversation_messages WHERE id = %s", (msg_id,)
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
        if row is None:
            return {}
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

    # ── 导师答疑请求 (QA Requests) ────────────────────────────────

    def create_qa_request(
        self,
        student_id: int,
        mentor_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO qa_requests (student_id, mentor_id, conversation_id, message_id, question)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (student_id, mentor_id, conversation_id, message_id, question),
                )
                conn.commit()
                cur.execute("SELECT * FROM qa_requests WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def update_qa_request(self, request_id: int, answer: str, status: str = "replied") -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    "UPDATE qa_requests SET answer = %s, status = %s, replied_at = %s WHERE id = %s",
                    (answer, status, now, request_id),
                )
                conn.commit()
                cur.execute("SELECT * FROM qa_requests WHERE id = %s", (request_id,))
                return cur.fetchone()

    def list_qa_requests(
        self,
        mentor_id: int | None = None,
        student_id: int | None = None,
        status: str | None = None,
    ) -> list[dict]:
        sql = "SELECT * FROM qa_requests WHERE 1=1"
        params: list = []
        if mentor_id:
            sql += " AND mentor_id = %s"
            params.append(mentor_id)
        if student_id:
            sql += " AND student_id = %s"
            params.append(student_id)
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()

    def get_qa_request(self, request_id: int) -> dict | None:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM qa_requests WHERE id = %s", (request_id,))
                return cur.fetchone()
