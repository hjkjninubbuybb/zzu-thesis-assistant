"""文档元数据存储（documents 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class DocStore:
    """文档 MySQL CRUD。"""

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
        """插入文档记录。

        Args:
            kb_name: 所属知识库名称。
            file_name: 文件名。
            file_size: 文件字节大小。
            chunk_count: 分块数量。
            chunk_size: 分块大小（token）。
            chunk_overlap_ratio: 重叠比率。
            doc_type: 文档类型（plain_text/policy/form 等）。
            splitter_type: 切分策略。
            status: 索引状态。
            summary: 文档摘要。
            content: 清洗后原始文本。

        Returns:
            新插入的文档行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO documents
                   (kb_name, file_name, file_size, chunk_count, chunk_size, chunk_overlap_ratio,
                    doc_type, splitter_type, status, summary, content, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    kb_name,
                    file_name,
                    file_size,
                    chunk_count,
                    chunk_size,
                    chunk_overlap_ratio,
                    doc_type,
                    splitter_type,
                    status,
                    summary,
                    content,
                    now,
                ),
            )
            conn.commit()
            cur.execute("SELECT * FROM documents WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def update_document(self, doc_id: int, **kwargs) -> bool:
        """批量更新文档字段（仅白名单字段）。

        Args:
            doc_id: 文档 ID。
            **kwargs: 待更新的字段与值。

        Returns:
            是否更新了至少一行。
        """
        allowed = {
            "summary",
            "content",
            "chunk_count",
            "status",
            "chunk_size",
            "chunk_overlap_ratio",
            "splitter_type",
            "chunks_preview",
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

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return cur.rowcount > 0

    def update_document_summary(self, doc_id: int, summary: str) -> bool:
        """更新文档摘要。

        Args:
            doc_id: 文档 ID。
            summary: 新摘要文本。

        Returns:
            是否更新了至少一行。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE documents SET summary = %s WHERE id = %s",
                (summary, doc_id),
            )
            conn.commit()
            return cur.rowcount > 0

    def list_documents(
        self,
        kb_name: str,
        page: int = 1,
        page_size: int = 20,
        doc_type: str | None = None,
    ) -> tuple[list[dict], int]:
        """列出知识库下的文档（按创建时间降序，分页，可按类型过滤）。

        Args:
            kb_name: 知识库名称。
            page: 页码（从 1 开始）。
            page_size: 每页条数。
            doc_type: 文档类型过滤，None 表示不过滤。

        Returns:
            (文档列表, 总条数) 元组。
        """
        where = "kb_name = %s"
        params: list = [kb_name]
        if doc_type:
            where += " AND doc_type = %s"
            params.append(doc_type)
        offset = (page - 1) * page_size
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS cnt FROM documents WHERE {where}", params)
            total: int = cur.fetchone()["cnt"]
            cur.execute(
                f"SELECT * FROM documents WHERE {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
                params + [page_size, offset],
            )
            return cur.fetchall(), total

    def delete_document(self, doc_id: int) -> dict | None:
        """删除文档，返回删除前的行数据。

        Args:
            doc_id: 文档 ID。

        Returns:
            被删除的文档行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
            row = cur.fetchone()
            if row:
                cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
                conn.commit()
            return row

    def get_document(self, doc_id: int) -> dict | None:
        """按 ID 查询文档。

        Args:
            doc_id: 文档 ID。

        Returns:
            文档行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
            return cur.fetchone()
