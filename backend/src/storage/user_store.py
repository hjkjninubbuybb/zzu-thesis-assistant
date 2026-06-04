"""用户账号数据存储。"""

import logging

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class UserStore:
    """用户、档案、登录日志的 MySQL CRUD 操作。"""

    # ── 用户基本操作 ──────────────────────────────────────────

    def create_user(
        self,
        username: str,
        hashed_pwd: str,
        display_name: str = "",
        role: str = "student",
    ) -> dict:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (username, hashed_pwd, display_name, role)
                       VALUES (%s, %s, %s, %s)""",
                (username, hashed_pwd, display_name, role),
            )
            conn.commit()
            cur.execute("SELECT * FROM users WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def get_user_by_username(self, username: str) -> dict | None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            return cur.fetchone()

    def get_user_by_id(self, user_id: int) -> dict | None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            return cur.fetchone()

    def list_users(
        self,
        role: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """返回 (用户列表, 总数)。"""
        conditions = []
        params: list = []
        if role:
            conditions.append("role = %s")
            params.append(role)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        offset = (page - 1) * page_size

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM users {where}", params)
            total = cur.fetchone()["total"]
            cur.execute(
                f"SELECT * FROM users {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
                params + [page_size, offset],
            )
            items = cur.fetchall()
        return items, total

    def update_user(self, user_id: int, **kwargs) -> dict | None:
        allowed = {"display_name", "hashed_pwd", "role", "is_active"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_user_by_id(user_id)
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [user_id]
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
            conn.commit()
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            return cur.fetchone()

    def delete_user(self, user_id: int) -> None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()

    def count_users(self, role: str | None = None) -> int:
        sql = "SELECT COUNT(*) AS total FROM users"
        params: list = []
        if role:
            sql += " WHERE role = %s"
            params.append(role)
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()["total"]

    # ── 学生档案 ──────────────────────────────────────────────

    def upsert_student_profile(
        self,
        user_id: int,
        student_id: str,
        grade: str = "",
        major: str = "",
        class_name: str = "",
    ) -> dict:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO student_profiles (user_id, student_id, grade, major, class_name)
                       VALUES (%s, %s, %s, %s, %s)
                       ON DUPLICATE KEY UPDATE
                           student_id = VALUES(student_id),
                           grade      = VALUES(grade),
                           major      = VALUES(major),
                           class_name = VALUES(class_name)""",
                (user_id, student_id, grade, major, class_name),
            )
            conn.commit()
            cur.execute("SELECT * FROM student_profiles WHERE user_id = %s", (user_id,))
            return cur.fetchone()

    def get_student_profile(self, user_id: int) -> dict | None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM student_profiles WHERE user_id = %s", (user_id,))
            return cur.fetchone()

    def get_user_by_student_id(self, student_id: str) -> dict | None:
        """通过学号查用户（用于登录）。"""
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT u.* FROM users u JOIN student_profiles sp ON u.id = sp.user_id WHERE sp.student_id = %s",
                (student_id,),
            )
            return cur.fetchone()

    # ── 教师档案 ──────────────────────────────────────────────

    def upsert_teacher_profile(
        self,
        user_id: int,
        employee_id: str,
        department: str = "",
        title: str = "",
    ) -> dict:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO teacher_profiles (user_id, employee_id, department, title)
                       VALUES (%s, %s, %s, %s)
                       ON DUPLICATE KEY UPDATE
                           employee_id = VALUES(employee_id),
                           department  = VALUES(department),
                           title       = VALUES(title)""",
                (user_id, employee_id, department, title),
            )
            conn.commit()
            cur.execute("SELECT * FROM teacher_profiles WHERE user_id = %s", (user_id,))
            return cur.fetchone()

    def get_teacher_profile(self, user_id: int) -> dict | None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM teacher_profiles WHERE user_id = %s", (user_id,))
            return cur.fetchone()

    def get_user_by_employee_id(self, employee_id: str) -> dict | None:
        """通过工号查用户（用于登录）。"""
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT u.* FROM users u JOIN teacher_profiles tp ON u.id = tp.user_id WHERE tp.employee_id = %s",
                (employee_id,),
            )
            return cur.fetchone()

    # ── 登录日志 ──────────────────────────────────────────────

    def add_login_log(self, user_id: int, ip_addr: str = "", user_agent: str = "") -> None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO user_login_logs (user_id, ip_addr, user_agent) VALUES (%s, %s, %s)",
                (user_id, ip_addr[:45], user_agent[:255]),
            )
            conn.commit()

    def list_login_logs(self, user_id: int, limit: int = 20) -> list[dict]:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM user_login_logs WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
                (user_id, limit),
            )
            return cur.fetchall()

    # ── 师生关系 ──────────────────────────────────────────────

    def add_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT IGNORE INTO mentor_student_relations (mentor_id, student_id) VALUES (%s, %s)",
                (mentor_id, student_id),
            )
            conn.commit()

    def remove_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM mentor_student_relations WHERE mentor_id = %s AND student_id = %s",
                (mentor_id, student_id),
            )
            conn.commit()

    def list_mentor_students(self, mentor_id: int) -> list[dict]:
        """列出导师名下的学生。"""
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT u.*, sp.student_id, sp.grade, sp.major, sp.class_name 
                       FROM users u 
                       JOIN mentor_student_relations msr ON u.id = msr.student_id
                       LEFT JOIN student_profiles sp ON u.id = sp.user_id
                       WHERE msr.mentor_id = %s""",
                (mentor_id,),
            )
            return cur.fetchall()

    def get_student_mentor(self, student_id: int) -> dict | None:
        """获取学生的指导教师。"""
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT u.*, tp.employee_id, tp.department, tp.title
                       FROM users u
                       JOIN mentor_student_relations msr ON u.id = msr.mentor_id
                       LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
                       WHERE msr.student_id = %s""",
                (student_id,),
            )
            return cur.fetchone()

    # ── 自助资料更新 ──────────────────────────────────────────

    def update_self_profile(self, user_id: int, display_name: str | None) -> dict | None:
        """部分字段更新（只更新非 None 字段）。"""
        updates: dict[str, object] = {}
        if display_name is not None:
            updates["display_name"] = display_name
        if not updates:
            return self.get_user_by_id(user_id)

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [user_id]

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
            conn.commit()
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            return cur.fetchone()
