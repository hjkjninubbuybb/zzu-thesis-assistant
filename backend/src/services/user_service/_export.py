"""用户 Excel 批量导出 Mixin：学生 / 教师。"""

import logging

from src.storage.interfaces.user_store import BaseUserStore


class ExportMixin:
    """用户批量导出方法集合。"""

    _user_store: BaseUserStore
    logger: logging.Logger

    def export_students(self) -> list[dict]:
        """导出所有学生账号及档案。

        Returns:
            含展示字段的学生信息 dict 列表，适合直接传给 build_student_workbook。
        """
        items, _ = self._user_store.list_users(role="student", page=1, page_size=10000)
        rows = []
        for u in items:
            profile = self._user_store.get_student_profile(u["id"]) or {}
            rows.append(
                {
                    "display_name": u["display_name"],
                    "student_id": profile.get("student_id", ""),
                    "grade": profile.get("grade", ""),
                    "major": profile.get("major", ""),
                    "class_name": profile.get("class_name", ""),
                }
            )
        return rows

    def export_teachers(self) -> list[dict]:
        """导出所有教师账号及档案。

        Returns:
            含展示字段的教师信息 dict 列表，适合直接传给 build_teacher_workbook。
        """
        items, _ = self._user_store.list_users(role="teacher", page=1, page_size=10000)
        rows = []
        for u in items:
            profile = self._user_store.get_teacher_profile(u["id"]) or {}
            rows.append(
                {
                    "display_name": u["display_name"],
                    "employee_id": profile.get("employee_id", ""),
                    "department": profile.get("department", ""),
                    "title": profile.get("title", ""),
                }
            )
        return rows
