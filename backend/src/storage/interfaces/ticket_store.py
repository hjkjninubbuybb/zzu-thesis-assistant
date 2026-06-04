"""TicketStore Protocol 接口。"""

from typing import Protocol


class BaseTicketStore(Protocol):
    """答疑工单数据访问接口。"""

    def create_qa_request(
        self,
        student_id: int,
        mentor_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        """创建答疑工单，返回新建行 dict。"""
        ...

    def update_qa_request(
        self,
        request_id: int,
        answer: str,
        status: str = "replied",
    ) -> dict | None:
        """填写回答，更新工单状态。"""
        ...

    def list_qa_requests(
        self,
        mentor_id: int | None = None,
        student_id: int | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """列出工单，支持多条件过滤（分页）。返回 (items, total)。"""
        ...

    def get_qa_request(self, request_id: int) -> dict | None:
        """按 ID 查询工单，不存在返回 None。"""
        ...

    def count_pending_by_mentor(self, mentor_id: int) -> int:
        """返回该 mentor 名下 status='pending' 的工单数。"""
        ...

    def list_recent_events_by_mentor(self, mentor_id: int, limit: int) -> list[dict]:
        """返回该 mentor 名下最近 limit 个工单事件，按 occurred_at 倒序。

        每个事件 dict 字段：
            event_type: 'ticket_created' | 'ticket_replied' | 'ticket_closed'
            student_id: int
            student_name: str
            ticket_id: int
            ticket_title: str  (取 question 前 60 字符)
            occurred_at: datetime
        """
        ...
