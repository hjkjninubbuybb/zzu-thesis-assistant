"""知识库元数据存储（knowledge_bases 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class KBStore:
    """知识库 MySQL CRUD。"""

    def create_kb(self, name: str, description: str = "") -> dict:
        """创建知识库。

        Args:
            name: 知识库唯一名称。
            description: 可选描述。

        Returns:
            新建的知识库行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                "INSERT INTO knowledge_bases (name, description, created_at) VALUES (%s, %s, %s)",
                (name, description, now),
            )
            conn.commit()
            cur.execute("SELECT * FROM knowledge_bases WHERE name = %s", (name,))
            return cur.fetchone()

    def list_kbs(self) -> list[dict]:
        """列出所有知识库，含文档数统计。

        Returns:
            按创建时间降序的知识库列表。
        """
        with get_conn() as conn, conn.cursor() as cur:
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
        """按名称查询知识库。

        Args:
            name: 知识库名称。

        Returns:
            知识库行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM knowledge_bases WHERE name = %s", (name,))
            return cur.fetchone()

    def delete_kb(self, name: str) -> None:
        """删除知识库及其所有文档记录。

        Args:
            name: 知识库名称。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE kb_name = %s", (name,))
            cur.execute("DELETE FROM knowledge_bases WHERE name = %s", (name,))
            conn.commit()
