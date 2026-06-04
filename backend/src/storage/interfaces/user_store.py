"""UserStore Protocol 接口。"""

from typing import Protocol


class BaseUserStore(Protocol):
    """用户数据访问接口。"""

    def create_user(
        self,
        username: str,
        hashed_pwd: str,
        display_name: str = "",
        role: str = "student",
    ) -> dict:
        """新建用户，返回新建行 dict。"""
        ...

    def get_user_by_username(self, username: str) -> dict | None:
        """按用户名查询，不存在返回 None。"""
        ...

    def get_user_by_id(self, user_id: int) -> dict | None:
        """按 ID 查询，不存在返回 None。"""
        ...

    def list_users(
        self,
        role: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """分页列出用户，返回 (用户列表, 总数)，支持角色过滤。"""
        ...

    def update_user(self, user_id: int, **kwargs: object) -> dict | None:
        """更新用户字段，返回更新后的行或 None。"""
        ...

    def delete_user(self, user_id: int) -> None:
        """删除用户（级联删除由 DB 外键处理）。"""
        ...

    def count_users(self, role: str | None = None) -> int:
        """统计用户数，支持角色过滤。"""
        ...

    def upsert_student_profile(
        self,
        user_id: int,
        student_id: str,
        grade: str = "",
        major: str = "",
        class_name: str = "",
    ) -> dict:
        """创建或更新学生档案，返回档案行 dict。"""
        ...

    def get_student_profile(self, user_id: int) -> dict | None:
        """查询学生档案，不存在返回 None。"""
        ...

    def get_user_by_student_id(self, student_id: str) -> dict | None:
        """通过学号查用户，不存在返回 None。"""
        ...

    def upsert_teacher_profile(
        self,
        user_id: int,
        employee_id: str,
        department: str = "",
        title: str = "",
    ) -> dict:
        """创建或更新教师档案，返回档案行 dict。"""
        ...

    def get_teacher_profile(self, user_id: int) -> dict | None:
        """查询教师档案，不存在返回 None。"""
        ...

    def get_user_by_employee_id(self, employee_id: str) -> dict | None:
        """通过工号查用户，不存在返回 None。"""
        ...

    def add_login_log(
        self,
        user_id: int,
        ip_addr: str = "",
        user_agent: str = "",
    ) -> None:
        """记录登录日志。"""
        ...

    def list_login_logs(self, user_id: int, limit: int = 20) -> list[dict]:
        """列出用户的登录日志。"""
        ...

    def add_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        """建立导师-学生关系。"""
        ...

    def remove_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        """解除导师-学生关系。"""
        ...

    def list_mentor_students(self, mentor_id: int) -> list[dict]:
        """列出导师名下所有学生。"""
        ...

    def get_student_mentor(self, student_id: int) -> dict | None:
        """查询学生的导师，不存在返回 None。"""
        ...

    def update_self_profile(self, user_id: int, display_name: str | None) -> dict | None:
        """仅更新自己可改的字段（display_name），其他字段不动。"""
        ...
