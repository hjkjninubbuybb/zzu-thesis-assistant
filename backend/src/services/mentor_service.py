"""导师工作台业务编排。

仅服务于 teacher 角色，按 mentor 关系收紧数据视野。
不抛 HTTPException，统一抛 AppException 子类。
"""

from datetime import datetime, timedelta

from src.exceptions import PermissionDeniedError
from src.services.base import BaseService
from src.storage.interfaces.ticket_store import BaseTicketStore
from src.storage.interfaces.user_store import BaseUserStore


class MentorService(BaseService):
    """导师工作台 service。"""

    SILENT_DAYS_THRESHOLD: int = 7
    RECENT_EVENTS_LIMIT: int = 20

    def __init__(
        self,
        user_store: BaseUserStore,
        ticket_store: BaseTicketStore,
    ) -> None:
        super().__init__()
        self._user_store = user_store
        self._ticket_store = ticket_store

    def get_overview(self, mentor_id: int) -> dict:
        """聚合导师首页所需的四块数据。"""
        since = datetime.now() - timedelta(days=7)
        return {
            "pending_tickets": self._ticket_store.count_pending_by_mentor(mentor_id),
            "weekly_activity": self._user_store.list_weekly_activity_for_mentor(
                mentor_id, since=since
            ),
            "silent_students": self._user_store.list_silent_students_for_mentor(
                mentor_id, days_threshold=self.SILENT_DAYS_THRESHOLD
            ),
            "recent_events": self._ticket_store.list_recent_events_by_mentor(
                mentor_id, limit=self.RECENT_EVENTS_LIMIT
            ),
        }

    def list_my_students(self, mentor_id: int) -> list[dict]:
        """返回当前 mentor 名下的学生列表。"""
        return self._user_store.list_mentor_students(mentor_id)

    def ensure_owns_student(self, mentor_id: int, student_id: int) -> None:
        """校验 student 属于 mentor，否则抛 PermissionDeniedError。"""
        owner = self._user_store.get_student_mentor(student_id)
        if not owner or owner.get("id") != mentor_id:
            raise PermissionDeniedError(f"学生 {student_id} 不属于当前导师")
