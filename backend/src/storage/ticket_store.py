"""导师答疑请求存储（qa_requests 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class TicketStore:
    """导师答疑工单 MySQL CRUD。"""

    def create_qa_request(
        self,
        student_id: int,
        mentor_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        """创建答疑请求。

        Args:
            student_id: 学生用户 ID。
            mentor_id: 导师用户 ID。
            conversation_id: 关联对话 ID。
            message_id: 触发工单的消息 ID。
            question: 问题文本。

        Returns:
            新建的答疑请求行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO qa_requests (student_id, mentor_id, conversation_id, message_id, question)
                   VALUES (%s, %s, %s, %s, %s)""",
                (student_id, mentor_id, conversation_id, message_id, question),
            )
            conn.commit()
            cur.execute("SELECT * FROM qa_requests WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def update_qa_request(self, request_id: int, answer: str, status: str = "replied") -> dict | None:
        """更新答疑请求（填写回答）。

        Args:
            request_id: 工单 ID。
            answer: 导师回答文本。
            status: 新状态（replied/closed）。

        Returns:
            更新后的工单行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
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
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """列出答疑请求，支持多条件过滤（分页）。

        Args:
            mentor_id: 按导师过滤。
            student_id: 按学生过滤。
            status: 按状态过滤（pending/replied/closed）。
            page: 页码（从 1 开始）。
            page_size: 每页条数。

        Returns:
            (工单列表, 总条数) 元组，按创建时间降序。
        """
        where = "WHERE 1=1"
        params: list = []
        if mentor_id:
            where += " AND mentor_id = %s"
            params.append(mentor_id)
        if student_id:
            where += " AND student_id = %s"
            params.append(student_id)
        if status:
            where += " AND status = %s"
            params.append(status)
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS cnt FROM qa_requests {where}", params)
            total: int = cur.fetchone()["cnt"]
            offset = (page - 1) * page_size
            cur.execute(
                f"SELECT * FROM qa_requests {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
                params + [page_size, offset],
            )
            return cur.fetchall(), total

    def get_qa_request(self, request_id: int) -> dict | None:
        """按 ID 查询答疑请求。

        Args:
            request_id: 工单 ID。

        Returns:
            工单行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM qa_requests WHERE id = %s", (request_id,))
            return cur.fetchone()
