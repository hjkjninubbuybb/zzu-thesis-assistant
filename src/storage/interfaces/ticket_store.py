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
    ) -> list[dict]:
        """列出工单，支持多条件过滤。"""
        ...

    def get_qa_request(self, request_id: int) -> dict | None:
        """按 ID 查询工单，不存在返回 None。"""
        ...
