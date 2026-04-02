"""SQLite 文档元数据存储。"""

import sqlite3
import logging
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
        conn = self._get_conn()
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
                status TEXT DEFAULT 'processing',
                created_at TEXT NOT NULL,
                FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
            );
        """)
        conn.commit()
        conn.close()

    # ── 知识库操作 ────────────────────────────────────────

    def create_kb(self, name: str, description: str = "") -> dict:
        conn = self._get_conn()
        now = datetime.now().isoformat()
        conn.execute(
            "INSERT INTO knowledge_bases (name, description, created_at) VALUES (?, ?, ?)",
            (name, description, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM knowledge_bases WHERE name = ?", (name,)
        ).fetchone()
        conn.close()
        return dict(row)

    def list_kbs(self) -> list[dict]:
        conn = self._get_conn()
        rows = conn.execute(
            """
            SELECT kb.*, COUNT(d.id) as doc_count
            FROM knowledge_bases kb
            LEFT JOIN documents d ON kb.name = d.kb_name
            GROUP BY kb.name
            ORDER BY kb.created_at DESC
            """
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_kb(self, name: str) -> dict | None:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM knowledge_bases WHERE name = ?", (name,)
        ).fetchone()
        conn.close()
        return dict(row) if row else None

    def delete_kb(self, name: str) -> None:
        conn = self._get_conn()
        conn.execute("DELETE FROM documents WHERE kb_name = ?", (name,))
        conn.execute("DELETE FROM knowledge_bases WHERE name = ?", (name,))
        conn.commit()
        conn.close()

    # ── 文档操作 ──────────────────────────────────────────

    def add_document(
        self,
        kb_name: str,
        file_name: str,
        file_size: int = 0,
        chunk_count: int = 0,
        chunk_size: int = 256,
    ) -> dict:
        conn = self._get_conn()
        now = datetime.now().isoformat()
        conn.execute(
            """INSERT INTO documents
               (kb_name, file_name, file_size, chunk_count, chunk_size, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'completed', ?)""",
            (kb_name, file_name, file_size, chunk_count, chunk_size, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM documents WHERE kb_name = ? AND file_name = ? ORDER BY id DESC LIMIT 1",
            (kb_name, file_name),
        ).fetchone()
        conn.close()
        return dict(row)

    def list_documents(self, kb_name: str) -> list[dict]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM documents WHERE kb_name = ? ORDER BY created_at DESC",
            (kb_name,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def delete_document(self, doc_id: int) -> dict | None:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if row:
            conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            conn.commit()
        conn.close()
        return dict(row) if row else None

    def get_document(self, doc_id: int) -> dict | None:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
