"""Normalize student-account demo data for frontend display."""

from __future__ import annotations

from datetime import timedelta

from src.storage.database import get_conn


MAJORS = ["计算机科学与技术", "软件工程"]


def main() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.created_at
                FROM users u
                JOIN student_profiles sp ON sp.user_id = u.id
                WHERE u.role = 'student'
                ORDER BY u.id ASC
                """
            )
            students = cur.fetchall()

            for row in students:
                temp_value = f"tmp_demo_{row['id']}"
                cur.execute("UPDATE users SET username = %s WHERE id = %s", (temp_value, row["id"]))
                cur.execute("UPDATE student_profiles SET student_id = %s WHERE user_id = %s", (temp_value, row["id"]))

            for index, row in enumerate(students, start=1):
                student_id = f"202201{index:03d}"
                major = MAJORS[(index - 1) % len(MAJORS)]
                class_name = "计科2201" if major == "计算机科学与技术" else "软工2201"
                created_at = row["created_at"] - timedelta(days=7)
                cur.execute(
                    """
                    UPDATE users
                    SET username = %s,
                        created_at = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (student_id, created_at, created_at, row["id"]),
                )
                cur.execute(
                    """
                    UPDATE student_profiles
                    SET student_id = %s,
                        grade = '2022',
                        major = %s,
                        class_name = %s
                    WHERE user_id = %s
                    """,
                    (student_id, major, class_name, row["id"]),
                )
        conn.commit()

    print(f"已整理 {len(students)} 个学生账号：创建时间提前 7 天，学号/年级改为 2022 开头，专业限定为计科或软工。")


if __name__ == "__main__":
    main()
