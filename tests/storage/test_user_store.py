import time

import pytest

from src.storage.user_store import UserStore


@pytest.fixture()
def us():
    return UserStore()


class TestUserCRUD:
    def test_create_user(self, us):
        user = us.create_user("alice", "hashed_pw", display_name="Alice", role="student")
        assert user["username"] == "alice"
        assert user["display_name"] == "Alice"
        assert user["role"] == "student"
        assert user["is_active"] == 1

    def test_create_user_duplicate_raises(self, us):
        us.create_user("dup", "hash")
        with pytest.raises(Exception):  # noqa: B017  # pymysql raises IntegrityError on duplicate unique key
            us.create_user("dup", "hash")

    def test_get_user_by_username(self, us):
        us.create_user("bob", "hash")
        user = us.get_user_by_username("bob")
        assert user is not None
        assert user["username"] == "bob"

    def test_get_user_by_username_not_found(self, us):
        assert us.get_user_by_username("nobody") is None

    def test_get_user_by_id(self, us):
        created = us.create_user("charlie", "hash")
        assert us.get_user_by_id(created["id"])["username"] == "charlie"

    def test_list_users_paginated(self, us):
        for i in range(5):
            us.create_user(f"user{i}", "hash", role="student")
        items, total = us.list_users(page=1, page_size=3)
        assert len(items) == 3
        assert total == 5

    def test_list_users_filter_by_role(self, us):
        us.create_user("admin1", "hash", role="admin")
        us.create_user("stu1", "hash", role="student")
        items, total = us.list_users(role="admin")
        assert total == 1
        assert items[0]["role"] == "admin"

    def test_update_user(self, us):
        user = us.create_user("upd_user", "hash", display_name="Old")
        updated = us.update_user(user["id"], display_name="New")
        assert updated["display_name"] == "New"

    def test_update_user_no_valid_keys(self, us):
        user = us.create_user("no_upd", "hash")
        result = us.update_user(user["id"], invalid="value")
        assert result["username"] == "no_upd"

    def test_delete_user(self, us):
        user = us.create_user("del_user", "hash")
        us.delete_user(user["id"])
        assert us.get_user_by_id(user["id"]) is None

    def test_count_users(self, us):
        us.create_user("c1", "h", role="student")
        us.create_user("c2", "h", role="teacher")
        assert us.count_users() == 2
        assert us.count_users(role="student") == 1


class TestStudentProfile:
    def test_upsert_student_profile(self, us):
        user = us.create_user("stu", "hash", role="student")
        profile = us.upsert_student_profile(user["id"], "2022001", grade="2022", major="CS")
        assert profile["student_id"] == "2022001"
        assert profile["major"] == "CS"

    def test_upsert_student_profile_update(self, us):
        user = us.create_user("stu2", "hash", role="student")
        us.upsert_student_profile(user["id"], "2022002", major="CS")
        updated = us.upsert_student_profile(user["id"], "2022002", major="AI")
        assert updated["major"] == "AI"

    def test_get_student_profile(self, us):
        user = us.create_user("stu3", "hash", role="student")
        us.upsert_student_profile(user["id"], "2022003")
        assert us.get_student_profile(user["id"]) is not None

    def test_get_student_profile_not_found(self, us):
        assert us.get_student_profile(999999) is None

    def test_get_user_by_student_id(self, us):
        user = us.create_user("stu4", "hash", role="student")
        us.upsert_student_profile(user["id"], "2022004")
        found = us.get_user_by_student_id("2022004")
        assert found["username"] == "stu4"


class TestTeacherProfile:
    def test_upsert_teacher_profile(self, us):
        user = us.create_user("teach", "hash", role="teacher")
        profile = us.upsert_teacher_profile(user["id"], "T001", department="CS", title="教授")
        assert profile["employee_id"] == "T001"
        assert profile["title"] == "教授"

    def test_get_teacher_profile(self, us):
        user = us.create_user("teach2", "hash", role="teacher")
        us.upsert_teacher_profile(user["id"], "T002")
        assert us.get_teacher_profile(user["id"]) is not None

    def test_get_user_by_employee_id(self, us):
        user = us.create_user("teach3", "hash", role="teacher")
        us.upsert_teacher_profile(user["id"], "T003")
        found = us.get_user_by_employee_id("T003")
        assert found["username"] == "teach3"


class TestLoginLog:
    def test_add_and_list_login_logs(self, us):
        user = us.create_user("logger", "hash")
        us.add_login_log(user["id"], ip_addr="127.0.0.1", user_agent="TestAgent/1.0")
        time.sleep(1)
        us.add_login_log(user["id"], ip_addr="10.0.0.1")
        logs = us.list_login_logs(user["id"])
        assert len(logs) == 2
        assert logs[0]["ip_addr"] == "10.0.0.1"  # DESC order

    def test_login_log_truncates_long_fields(self, us):
        user = us.create_user("long_ua", "hash")
        long_ua = "X" * 500
        us.add_login_log(user["id"], user_agent=long_ua)
        logs = us.list_login_logs(user["id"])
        assert len(logs[0]["user_agent"]) <= 255


class TestMentorRelation:
    @pytest.fixture(autouse=True)
    def _users(self, us):
        self.mentor = us.create_user("mentor1", "hash", role="teacher")
        self.stu1 = us.create_user("stu_a", "hash", role="student")
        self.stu2 = us.create_user("stu_b", "hash", role="student")

    def test_add_mentor_relation(self, us):
        us.add_mentor_relation(self.mentor["id"], self.stu1["id"])
        students = us.list_mentor_students(self.mentor["id"])
        assert len(students) == 1
        assert students[0]["username"] == "stu_a"

    def test_add_mentor_relation_idempotent(self, us):
        us.add_mentor_relation(self.mentor["id"], self.stu1["id"])
        us.add_mentor_relation(self.mentor["id"], self.stu1["id"])  # INSERT IGNORE
        assert len(us.list_mentor_students(self.mentor["id"])) == 1

    def test_remove_mentor_relation(self, us):
        us.add_mentor_relation(self.mentor["id"], self.stu1["id"])
        us.remove_mentor_relation(self.mentor["id"], self.stu1["id"])
        assert len(us.list_mentor_students(self.mentor["id"])) == 0

    def test_list_mentor_students_with_profile(self, us):
        us.upsert_student_profile(self.stu1["id"], "2022010", major="CS")
        us.add_mentor_relation(self.mentor["id"], self.stu1["id"])
        students = us.list_mentor_students(self.mentor["id"])
        assert students[0]["major"] == "CS"

    def test_get_student_mentor(self, us):
        us.upsert_teacher_profile(self.mentor["id"], "T010", department="AI")
        us.add_mentor_relation(self.mentor["id"], self.stu1["id"])
        mentor = us.get_student_mentor(self.stu1["id"])
        assert mentor["username"] == "mentor1"
        assert mentor["department"] == "AI"

    def test_get_student_mentor_none(self, us):
        assert us.get_student_mentor(self.stu2["id"]) is None
