"""师生关系 Mixin：列出 / 查询 / 建立 / 解除。"""

import logging

from src.storage.interfaces.user_store import BaseUserStore


class MentorMixin:
    """师生关系方法集合。"""

    _user_store: BaseUserStore
    logger: logging.Logger

    def list_mentor_students(self, mentor_id: int) -> list[dict]:
        """列出导师名下的学生。

        Args:
            mentor_id: 导师用户 ID。

        Returns:
            学生 dict 列表（含学生档案字段）。
        """
        return self._user_store.list_mentor_students(mentor_id)

    def get_student_mentor(self, student_id: int) -> dict | None:
        """获取学生的指导教师。

        Args:
            student_id: 学生用户 ID。

        Returns:
            教师 dict（含教师档案字段），未分配则返回 None。
        """
        return self._user_store.get_student_mentor(student_id)

    def add_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        """建立师生关系。

        Args:
            mentor_id: 导师用户 ID。
            student_id: 学生用户 ID。
        """
        self._user_store.add_mentor_relation(mentor_id, student_id)

    def remove_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        """解除师生关系。

        Args:
            mentor_id: 导师用户 ID。
            student_id: 学生用户 ID。
        """
        self._user_store.remove_mentor_relation(mentor_id, student_id)
