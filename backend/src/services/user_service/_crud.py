"""用户 CRUD + 档案 + 查找辅助 Mixin。"""

import logging

from src.exceptions import UserNotFoundError
from src.storage.interfaces.user_store import BaseUserStore


class CrudMixin:
    """用户账号 / 档案 / 查找辅助方法集合。"""

    _user_store: BaseUserStore
    logger: logging.Logger

    # ── 用户基本操作 ──────────────────────────────────────────

    def list_users(
        self,
        role: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[dict], int]:
        """分页列出用户。

        Args:
            role: 角色过滤（admin / teacher / student），None 表示不过滤。
            page: 页码（从 1 开始）。
            page_size: 每页条数。

        Returns:
            (用户列表, 总数) 元组。
        """
        return self._user_store.list_users(role=role, page=page, page_size=page_size)

    def get_user(self, user_id: int) -> dict:
        """获取用户，不存在则抛出异常。

        Args:
            user_id: 用户 ID。

        Returns:
            用户 dict。

        Raises:
            UserNotFoundError: 用户不存在。
        """
        user = self._user_store.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        return user

    def get_user_by_username(self, username: str) -> dict | None:
        """按用户名查询用户。

        Args:
            username: 用户名。

        Returns:
            用户 dict，不存在返回 None。
        """
        return self._user_store.get_user_by_username(username)

    def create_user(
        self,
        username: str,
        hashed_pwd: str,
        display_name: str,
        role: str,
    ) -> dict:
        """创建新用户。

        Args:
            username: 用户名（唯一）。
            hashed_pwd: 已哈希的密码。
            display_name: 展示名称。
            role: 角色（admin / teacher / student）。

        Returns:
            新建用户 dict。
        """
        return self._user_store.create_user(
            username=username,
            hashed_pwd=hashed_pwd,
            display_name=display_name,
            role=role,
        )

    def update_user(self, user_id: int, **kwargs: object) -> dict:
        """更新用户字段，不存在则抛出异常。

        Args:
            user_id: 用户 ID。
            **kwargs: 可更新的字段（display_name / hashed_pwd / role / is_active）。

        Returns:
            更新后的用户 dict。

        Raises:
            UserNotFoundError: 用户不存在。
        """
        user = self._user_store.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        updated = self._user_store.update_user(user_id, **kwargs)
        return updated or user

    def delete_user(self, user_id: int) -> None:
        """删除用户，不存在则抛出异常。

        Args:
            user_id: 用户 ID。

        Raises:
            UserNotFoundError: 用户不存在。
        """
        user = self._user_store.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        self._user_store.delete_user(user_id)

    def add_login_log(self, user_id: int, ip_addr: str = "", user_agent: str = "") -> None:
        """记录用户登录日志（失败时静默忽略）。

        Args:
            user_id: 用户 ID。
            ip_addr: 客户端 IP 地址。
            user_agent: User-Agent 字符串。
        """
        try:
            self._user_store.add_login_log(user_id, ip_addr, user_agent)
        except Exception as e:
            self.logger.warning("[UserService] 记录登录日志失败: %s", e)

    # ── 档案操作 ──────────────────────────────────────────────

    def get_profile(self, user: dict) -> dict | None:
        """根据用户角色获取对应档案。

        Args:
            user: 用户 dict，需包含 id 和 role 字段。

        Returns:
            学生或教师档案 dict，无档案时返回 None。
        """
        role = user["role"]
        uid = user["id"]
        if role == "student":
            return self._user_store.get_student_profile(uid)
        if role in ("teacher", "admin"):
            return self._user_store.get_teacher_profile(uid)
        return None

    def upsert_student_profile(
        self,
        user_id: int,
        student_id: str,
        grade: str,
        major: str,
        class_name: str,
    ) -> dict:
        """创建或更新学生档案。"""
        return self._user_store.upsert_student_profile(user_id, student_id, grade, major, class_name)

    def upsert_teacher_profile(
        self,
        user_id: int,
        employee_id: str,
        department: str,
        title: str,
    ) -> dict:
        """创建或更新教师档案。"""
        return self._user_store.upsert_teacher_profile(user_id, employee_id, department, title)

    # ── 用户查找辅助 ──────────────────────────────────────────

    def get_user_by_student_id(self, student_id: str) -> dict | None:
        """通过学号查用户。"""
        return self._user_store.get_user_by_student_id(student_id)

    def get_user_by_employee_id(self, employee_id: str) -> dict | None:
        """通过工号查用户。"""
        return self._user_store.get_user_by_employee_id(employee_id)

    def update_self_profile(self, user_id: int, display_name: str | None) -> dict:
        """更新登录用户自己的资料（display_name）。

        Args:
            user_id: 用户 ID。
            display_name: 新展示名称，None 表示不更新。

        Returns:
            更新后的用户 dict。

        Raises:
            UserNotFoundError: 用户不存在。
        """
        user = self._user_store.update_self_profile(user_id, display_name)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        return user
