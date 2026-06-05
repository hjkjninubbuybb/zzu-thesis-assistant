"""答疑工单业务逻辑服务层。

职责：封装工单创建、列表、查询、回复、关闭的全部业务逻辑。
本模块不包含任何 FastAPI / HTTP 相关导入。
"""

import logging

from src.exceptions import DocumentNotFoundError, PermissionDeniedError
from src.services.base import BaseService
from src.storage.interfaces.ticket_store import BaseTicketStore
from src.storage.interfaces.user_store import BaseUserStore

logger = logging.getLogger(__name__)


class TicketService(BaseService):
    """答疑工单增删查改及权限校验服务。"""

    def __init__(self, ticket_store: BaseTicketStore, user_store: BaseUserStore) -> None:
        super().__init__()
        self._ticket_store = ticket_store
        self._user_store = user_store

    def create(
        self,
        student_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        """创建答疑工单，自动关联学生的指导教师。

        Args:
            student_id: 发起请求的学生用户 ID。
            conversation_id: 关联的对话 ID。
            message_id: 关联的消息 ID。
            question: 答疑问题文本。

        Returns:
            新建工单的 dict。

        Raises:
            PermissionDeniedError: 学生尚未分配指导教师，无法发起答疑。
        """
        mentor = self._user_store.get_student_mentor(student_id)
        if not mentor:
            raise PermissionDeniedError("您尚未分配指导教师，无法发起答疑请求")

        ticket = self._ticket_store.create_qa_request(
            student_id=student_id,
            mentor_id=mentor["id"],
            conversation_id=conversation_id,
            message_id=message_id,
            question=question,
        )
        self.logger.info(
            "[TicketService] create ticket student_id=%d mentor_id=%d ticket_id=%s",
            student_id,
            mentor["id"],
            ticket.get("id"),
        )
        return ticket

    def list_tickets(
        self,
        role: str,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        student_id: int | None = None,
    ) -> tuple[list[dict], int]:
        """按角色过滤列出工单（分页）。

        Args:
            role: 调用方角色（student / teacher / admin）。
            user_id: 调用方用户 ID。
            page: 页码（从 1 开始）。
            page_size: 每页条数。
            student_id: 可选，按学生 ID 过滤（teacher/admin 专用，teacher 须拥有该学生）。

        Returns:
            (工单 dict 列表, 总条数) 元组。

        Raises:
            PermissionDeniedError: teacher 试图过滤不属于自己的学生。
        """
        if student_id is not None and role == "teacher":
            owner = self._user_store.get_student_mentor(student_id)
            if not owner or owner.get("id") != user_id:
                raise PermissionDeniedError(f"学生 {student_id} 不属于当前导师")

        if role == "student":
            return self._ticket_store.list_qa_requests(student_id=user_id, page=page, page_size=page_size)
        if role == "teacher":
            return self._ticket_store.list_qa_requests(
                mentor_id=user_id, student_id=student_id, page=page, page_size=page_size
            )
        # admin 看全部（可选按 student_id 过滤）
        return self._ticket_store.list_qa_requests(student_id=student_id, page=page, page_size=page_size)

    def get(self, ticket_id: int, role: str, user_id: int) -> dict:
        """查询单个工单，含权限校验。

        Args:
            ticket_id: 工单 ID。
            role: 调用方角色（student / teacher / admin）。
            user_id: 调用方用户 ID。

        Returns:
            工单 dict。

        Raises:
            DocumentNotFoundError: 工单不存在。
            PermissionDeniedError: 调用方无权查看该工单。
        """
        ticket = self._ticket_store.get_qa_request(ticket_id)
        if not ticket:
            raise DocumentNotFoundError(f"工单 {ticket_id} 不存在")

        if role == "student" and ticket["student_id"] != user_id:
            raise PermissionDeniedError("无权查看此请求")
        if role == "teacher" and ticket["mentor_id"] != user_id:
            raise PermissionDeniedError("无权查看此请求")

        return ticket

    def reply(self, ticket_id: int, answer: str, user_id: int, role: str) -> dict:
        """教师或管理员回复工单。

        Args:
            ticket_id: 工单 ID。
            answer: 回答内容。
            user_id: 操作人用户 ID。
            role: 操作人角色（teacher / admin）。

        Returns:
            更新后的工单 dict。

        Raises:
            DocumentNotFoundError: 工单不存在。
            PermissionDeniedError: 教师试图回复未分配给自己的工单。
        """
        ticket = self._ticket_store.get_qa_request(ticket_id)
        if not ticket:
            raise DocumentNotFoundError(f"工单 {ticket_id} 不存在")

        if role == "teacher" and ticket["mentor_id"] != user_id:
            raise PermissionDeniedError("只能回复分配给自己的请求")

        updated = self._ticket_store.update_qa_request(ticket_id, answer=answer, status="replied")
        self.logger.info("[TicketService] replied ticket_id=%d user_id=%d", ticket_id, user_id)
        return updated  # type: ignore[return-value]

    def close(self, ticket_id: int, role: str, user_id: int) -> dict:
        """关闭工单，学生只能关闭自己的，教师只能关闭分配给自己的。

        Args:
            ticket_id: 工单 ID。
            role: 操作人角色（student / teacher / admin）。
            user_id: 操作人用户 ID。

        Returns:
            更新后的工单 dict。

        Raises:
            DocumentNotFoundError: 工单不存在。
            PermissionDeniedError: 调用方无权关闭该工单。
        """
        ticket = self._ticket_store.get_qa_request(ticket_id)
        if not ticket:
            raise DocumentNotFoundError(f"工单 {ticket_id} 不存在")

        if role == "student" and ticket["student_id"] != user_id:
            raise PermissionDeniedError("无权操作")
        if role == "teacher" and ticket["mentor_id"] != user_id:
            raise PermissionDeniedError("无权操作")

        updated = self._ticket_store.update_qa_request(ticket_id, answer=ticket.get("answer") or "", status="closed")
        self.logger.info("[TicketService] closed ticket_id=%d user_id=%d", ticket_id, user_id)
        return updated  # type: ignore[return-value]
