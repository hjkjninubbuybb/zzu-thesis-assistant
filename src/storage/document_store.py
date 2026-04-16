"""SQLite 文档元数据存储。"""

import json
import sqlite3
import logging
from contextlib import closing
from datetime import datetime
from pathlib import Path

from src.config import ROOT_DIR

logger = logging.getLogger(__name__)

DB_PATH = ROOT_DIR / "data" / "metadata.db"


class DocumentStore:
    """SQLite 文档和知识库元数据管理。"""

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """初始化数据库表。"""
        with closing(self._get_conn()) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS knowledge_bases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kb_name TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_size INTEGER DEFAULT 0,
                    chunk_count INTEGER DEFAULT 0,
                    chunk_size INTEGER DEFAULT 256,
                    doc_type TEXT DEFAULT 'plain_text',
                    status TEXT DEFAULT 'processing',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS faqs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kb_name TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    category TEXT DEFAULT '',
                    sort_order INTEGER DEFAULT 0,
                    enabled INTEGER DEFAULT 1,
                    vector_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kb_name TEXT NOT NULL,
                    user_id INTEGER,
                    title TEXT DEFAULT '新对话',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS conversation_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id INTEGER NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sources TEXT,
                    files TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS message_feedback (
                    message_id INTEGER PRIMARY KEY,
                    rating TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
                );
            """)
            conn.commit()
            # 兼容旧数据库：添加 doc_type 列（若不存在，忽略错误）
            try:
                conn.execute("ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'plain_text'")
                conn.commit()
            except sqlite3.OperationalError:
                pass  # 列已存在
            # 兼容旧数据库：conversations 添加 user_id 列
            try:
                conn.execute("ALTER TABLE conversations ADD COLUMN user_id INTEGER")
                conn.commit()
            except sqlite3.OperationalError:
                pass  # 列已存在
            # 索引需要在 ALTER TABLE 后创建（确保 user_id 列已存在）
            conn.executescript("""
                CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
                CREATE INDEX IF NOT EXISTS idx_conv_kb ON conversations(kb_name);
                CREATE INDEX IF NOT EXISTS idx_msg_conv ON conversation_messages(conversation_id);
            """)
            conn.commit()

    # ── 知识库操作 ────────────────────────────────────────

    def create_kb(self, name: str, description: str = "") -> dict:
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            conn.execute(
                "INSERT INTO knowledge_bases (name, description, created_at) VALUES (?, ?, ?)",
                (name, description, now),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM knowledge_bases WHERE name = ?", (name,)
            ).fetchone()
        return dict(row)

    def list_kbs(self) -> list[dict]:
        with closing(self._get_conn()) as conn:
            rows = conn.execute(
                """
                SELECT kb.*, COUNT(d.id) as doc_count
                FROM knowledge_bases kb
                LEFT JOIN documents d ON kb.name = d.kb_name
                GROUP BY kb.name
                ORDER BY kb.created_at DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def get_kb(self, name: str) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute(
                "SELECT * FROM knowledge_bases WHERE name = ?", (name,)
            ).fetchone()
        return dict(row) if row else None

    def delete_kb(self, name: str) -> None:
        with closing(self._get_conn()) as conn:
            conn.execute("DELETE FROM documents WHERE kb_name = ?", (name,))
            conn.execute("DELETE FROM knowledge_bases WHERE name = ?", (name,))
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
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            cursor = conn.execute(
                """INSERT INTO documents
                   (kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)""",
                (kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, now),
            )
            conn.commit()
            # 用 lastrowid 取刚插入的记录，避免并发时返回错误行
            row = conn.execute(
                "SELECT * FROM documents WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return dict(row)

    def list_documents(self, kb_name: str) -> list[dict]:
        with closing(self._get_conn()) as conn:
            rows = conn.execute(
                "SELECT * FROM documents WHERE kb_name = ? ORDER BY created_at DESC",
                (kb_name,),
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_document(self, doc_id: int) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE id = ?", (doc_id,)
            ).fetchone()
            if row:
                conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
                conn.commit()
        return dict(row) if row else None

    def get_document(self, doc_id: int) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE id = ?", (doc_id,)
            ).fetchone()
        return dict(row) if row else None

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
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            cursor = conn.execute(
                """INSERT INTO faqs
                   (kb_name, question, answer, category, sort_order, enabled, vector_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)""",
                (kb_name, question, answer, category, sort_order, vector_id, now, now),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM faqs WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def list_faqs(self, kb_name: str, enabled_only: bool = False) -> list[dict]:
        sql = "SELECT * FROM faqs WHERE kb_name = ?"
        params: list = [kb_name]
        if enabled_only:
            sql += " AND enabled = 1"
        sql += " ORDER BY sort_order ASC, id ASC"
        with closing(self._get_conn()) as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_faq(self, faq_id: int) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute("SELECT * FROM faqs WHERE id = ?", (faq_id,)).fetchone()
        return dict(row) if row else None

    def update_faq(self, faq_id: int, **kwargs) -> dict | None:
        allowed = {"question", "answer", "category", "sort_order", "enabled", "vector_id"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_faq(faq_id)
        updates["updated_at"] = datetime.now().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [faq_id]
        with closing(self._get_conn()) as conn:
            conn.execute(f"UPDATE faqs SET {set_clause} WHERE id = ?", values)  # noqa: S608
            conn.commit()
            row = conn.execute("SELECT * FROM faqs WHERE id = ?", (faq_id,)).fetchone()
        return dict(row) if row else None

    def delete_faq(self, faq_id: int) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute("SELECT * FROM faqs WHERE id = ?", (faq_id,)).fetchone()
            if row:
                conn.execute("DELETE FROM faqs WHERE id = ?", (faq_id,))
                conn.commit()
        return dict(row) if row else None

    # ── 系统设置 ──────────────────────────────────────────────

    def get_setting(self, key: str) -> str | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute(
                "SELECT value FROM system_settings WHERE key = ?", (key,)
            ).fetchone()
        return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        with closing(self._get_conn()) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)",
                (key, value),
            )
            conn.commit()

    def delete_setting(self, key: str) -> None:
        with closing(self._get_conn()) as conn:
            conn.execute("DELETE FROM system_settings WHERE key = ?", (key,))
            conn.commit()

    # ── 对话 ──────────────────────────────────────────────────

    def create_conversation(self, kb_name: str, title: str = "新对话", user_id: int | None = None) -> dict:
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            cursor = conn.execute(
                """INSERT INTO conversations (kb_name, user_id, title, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (kb_name, user_id, title, now, now),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return dict(row)

    def list_conversations(self, kb_name: str | None = None, user_id: int | None = None) -> list[dict]:
        sql = "SELECT * FROM conversations WHERE 1=1"
        params: list = []
        if kb_name:
            sql += " AND kb_name = ?"
            params.append(kb_name)
        if user_id is not None:
            sql += " AND user_id = ?"
            params.append(user_id)
        sql += " ORDER BY updated_at DESC, id DESC"
        with closing(self._get_conn()) as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_conversation(self, conv_id: int) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?", (conv_id,)
            ).fetchone()
        return dict(row) if row else None

    def update_conversation_title(self, conv_id: int, title: str) -> dict | None:
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, conv_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?", (conv_id,)
            ).fetchone()
        return dict(row) if row else None

    def delete_conversation(self, conv_id: int) -> None:
        with closing(self._get_conn()) as conn:
            # 手动级联：SQLite 默认不启用 FK 约束
            conn.execute(
                "DELETE FROM message_feedback WHERE message_id IN "
                "(SELECT id FROM conversation_messages WHERE conversation_id = ?)",
                (conv_id,),
            )
            conn.execute("DELETE FROM conversation_messages WHERE conversation_id = ?", (conv_id,))
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
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
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            cursor = conn.execute(
                """INSERT INTO conversation_messages
                   (conversation_id, role, content, sources, files, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (conversation_id, role, content, sources_json, files_json, now),
            )
            # 更新对话的 updated_at 以便排序
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM conversation_messages WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return self._parse_message_row(row)

    def list_messages(self, conversation_id: int) -> list[dict]:
        with closing(self._get_conn()) as conn:
            rows = conn.execute(
                "SELECT * FROM conversation_messages WHERE conversation_id = ? "
                "ORDER BY id ASC",
                (conversation_id,),
            ).fetchall()
        return [self._parse_message_row(r) for r in rows]

    @staticmethod
    def _parse_message_row(row) -> dict:
        """将 sqlite Row 转为 dict，并把 sources/files 字段从 JSON 字符串反序列化为 list。"""
        msg = dict(row)
        for field in ("sources", "files"):
            raw = msg.get(field)
            if raw is None:
                continue
            try:
                msg[field] = json.loads(raw)
            except (ValueError, TypeError):
                logger.warning("[message] 无法解析 %s 字段（msg_id=%s）", field, msg.get("id"))
                msg[field] = None
        return msg

    # ── 反馈 ──────────────────────────────────────────────────

    def get_message_feedback(self, message_id: int) -> dict | None:
        with closing(self._get_conn()) as conn:
            row = conn.execute(
                "SELECT * FROM message_feedback WHERE message_id = ?", (message_id,)
            ).fetchone()
        return dict(row) if row else None

    def set_message_feedback(self, message_id: int, rating: str) -> dict:
        with closing(self._get_conn()) as conn:
            now = datetime.now().isoformat()
            # 先删后插，避免依赖 UNIQUE 约束（旧 schema 可能没有）
            conn.execute("DELETE FROM message_feedback WHERE message_id = ?", (message_id,))
            conn.execute(
                """INSERT INTO message_feedback (message_id, rating, created_at)
                   VALUES (?, ?, ?)""",
                (message_id, rating, now),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM message_feedback WHERE message_id = ?", (message_id,)
            ).fetchone()
        return dict(row)
