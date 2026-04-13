"""SQLite 文档元数据存储。"""

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
            """)
            conn.commit()
            # 兼容旧数据库：添加 doc_type 列（若不存在，忽略错误）
            try:
                conn.execute("ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'plain_text'")
                conn.commit()
            except sqlite3.OperationalError:
                pass  # 列已存在

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
