"""Seed demo data for the RAG 1.0 frontend.

Run from the project root:
    poetry run python scripts/seed_demo_data.py
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from src.api.auth import hash_password
from src.storage.database import get_conn


DEMO_PASSWORD = "Demo@123456"


TEACHERS = [
    ("teacher_li", "李明", "T2026001", "计算机与人工智能学院", "教授"),
    ("teacher_wang", "王敏", "T2026002", "软件学院", "副教授"),
    ("teacher_chen", "陈杰", "T2026003", "教务办公室", "讲师"),
]

STUDENTS = [
    ("202201001", "张一凡", "2022", "计算机科学与技术", "计科2201"),
    ("202201002", "刘雨晴", "2022", "计算机科学与技术", "计科2201"),
    ("202201003", "周浩然", "2022", "软件工程", "软工2202"),
    ("202201004", "赵梓涵", "2022", "人工智能", "智科2201"),
    ("202201005", "孙思远", "2022", "数据科学与大数据技术", "大数据2201"),
    ("202301006", "吴佳宁", "2023", "软件工程", "软工2301"),
    ("202301007", "郑博文", "2023", "计算机科学与技术", "计科2302"),
    ("202301008", "冯可欣", "2023", "人工智能", "智科2301"),
    ("202401009", "许晨曦", "2024", "网络工程", "网工2401"),
    ("202401010", "马亦辰", "2024", "信息安全", "信安2401"),
    ("202401011", "林若溪", "2024", "软件工程", "软工2402"),
    ("202501012", "何嘉乐", "2025", "计算机科学与技术", "计科2501"),
]

KBS = [
    (
        "毕业设计指导知识库",
        "面向学生的毕业设计流程、选题、开题、中期检查、论文格式和答辩要求。",
    ),
    (
        "教师管理手册知识库",
        "面向指导教师的过程管理、材料审核、成绩评定和风险预警说明。",
    ),
]

DOCS = [
    ("毕业设计指导知识库", "2026届本科毕业设计指导手册.pdf", 1843200, 128, 512, "pdf"),
    ("毕业设计指导知识库", "论文格式与AIGC检测规则.docx", 642500, 46, 512, "docx"),
    ("毕业设计指导知识库", "开题报告填写示例.docx", 355200, 28, 512, "docx"),
    ("教师管理手册知识库", "指导教师过程管理说明.pdf", 912300, 72, 512, "pdf"),
    ("教师管理手册知识库", "毕业设计评分细则.xlsx", 228900, 18, 512, "form"),
]

FAQS = [
    (
        "毕业设计指导知识库",
        "学生什么时候提交开题报告？",
        "通常应在选题确认后两周内提交开题报告，具体截止时间以学院通知为准。",
        "开题",
    ),
    (
        "毕业设计指导知识库",
        "论文查重率超过要求怎么办？",
        "需要根据检测报告修改重复内容，完成降重后重新提交检测，最终结果必须满足学院要求。",
        "论文规范",
    ),
    (
        "毕业设计指导知识库",
        "可以更换毕业设计题目吗？",
        "可以申请更换，但需要指导教师同意并提交变更说明，经过学院审核后才可生效。",
        "选题",
    ),
    (
        "教师管理手册知识库",
        "教师如何查看学生阶段材料？",
        "教师登录管理端后进入学生列表，可按班级、年级或学号筛选，并查看开题、中期和论文材料状态。",
        "过程管理",
    ),
    (
        "教师管理手册知识库",
        "答辩成绩由哪些部分组成？",
        "答辩成绩一般由论文质量、系统实现、现场陈述、问题回答和过程材料完整性综合评定。",
        "评分",
    ),
]

CONVERSATIONS = [
    (
        "202201001",
        "毕业设计指导知识库",
        "开题报告提交时间",
        "开题报告最晚什么时候提交？",
        "一般在选题确认后两周内完成提交。如果学院另行发布了具体截止日期，应以学院通知为准。",
        "up",
        0,
    ),
    (
        "202201003",
        "毕业设计指导知识库",
        "论文格式规范咨询",
        "论文正文的标题层级有什么要求？",
        "正文标题应按学校模板逐级编号，字体、字号、行距和页边距保持与模板一致，提交前建议使用格式检查清单逐项核对。",
        "up",
        1,
    ),
    (
        "202301008",
        "毕业设计指导知识库",
        "中期检查材料",
        "中期检查需要准备哪些材料？",
        "通常需要提交中期检查表、阶段成果说明、系统原型或实验结果，以及后续计划。具体材料以学院通知为准。",
        "up",
        2,
    ),
    (
        "202401010",
        "毕业设计指导知识库",
        "AIGC检测规则",
        "AIGC检测结果偏高会影响答辩吗？",
        "若检测结果超过学院要求，通常需要修改并重新检测。是否影响答辩资格要看最终复检结果和学院规定。",
        "down",
        3,
    ),
    (
        "teacher_li",
        "教师管理手册知识库",
        "指导教师过程管理",
        "怎么快速看哪些学生还没交中期材料？",
        "可以在管理端学生列表按阶段状态筛选，优先查看“中期未提交”或“待审核”的学生，并导出名单进行提醒。",
        "up",
        4,
    ),
]


def scalar(cur, sql: str, params: tuple = ()) -> int:
    cur.execute(sql, params)
    return int(cur.fetchone()["value"])


def upsert_user(cur, username: str, display_name: str, role: str, hashed_pwd: str) -> int:
    cur.execute(
        """
        INSERT INTO users (username, hashed_pwd, display_name, role, is_active)
        VALUES (%s, %s, %s, %s, 1)
        ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            hashed_pwd = VALUES(hashed_pwd),
            display_name = VALUES(display_name),
            role = VALUES(role),
            is_active = 1
        """,
        (username, hashed_pwd, display_name, role),
    )
    return int(cur.lastrowid)


def upsert_student_profile(cur, user_id: int, student_id: str, grade: str, major: str, class_name: str) -> None:
    cur.execute(
        """
        INSERT INTO student_profiles (user_id, student_id, grade, major, class_name)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            student_id = VALUES(student_id),
            grade = VALUES(grade),
            major = VALUES(major),
            class_name = VALUES(class_name)
        """,
        (user_id, student_id, grade, major, class_name),
    )


def upsert_teacher_profile(cur, user_id: int, employee_id: str, department: str, title: str) -> None:
    cur.execute(
        """
        INSERT INTO teacher_profiles (user_id, employee_id, department, title)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            employee_id = VALUES(employee_id),
            department = VALUES(department),
            title = VALUES(title)
        """,
        (user_id, employee_id, department, title),
    )


def upsert_kb(cur, name: str, description: str, owner_id: int | None) -> None:
    cur.execute(
        """
        INSERT INTO knowledge_bases (name, description, owner_id)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            description = VALUES(description),
            owner_id = VALUES(owner_id)
        """,
        (name, description, owner_id),
    )


def insert_document_once(
    cur,
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_count: int,
    chunk_size: int,
    doc_type: str,
) -> bool:
    cur.execute("SELECT id FROM documents WHERE kb_name = %s AND file_name = %s LIMIT 1", (kb_name, file_name))
    if cur.fetchone():
        return False
    cur.execute(
        """
        INSERT INTO documents
            (kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, 'completed', %s)
        """,
        (kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, datetime.now() - timedelta(days=7)),
    )
    return True


def insert_faq_once(cur, kb_name: str, question: str, answer: str, category: str, sort_order: int) -> bool:
    cur.execute("SELECT id FROM faqs WHERE kb_name = %s AND question = %s LIMIT 1", (kb_name, question))
    if cur.fetchone():
        return False
    cur.execute(
        """
        INSERT INTO faqs (kb_name, question, answer, category, sort_order, enabled, vector_id)
        VALUES (%s, %s, %s, %s, %s, 1, %s)
        """,
        (kb_name, question, answer, category, sort_order, f"demo-faq-{sort_order + 1:03d}"),
    )
    return True


def insert_login_logs(cur, user_ids: list[int]) -> int:
    inserted = 0
    now = datetime.now()
    for idx, user_id in enumerate(user_ids):
        cur.execute(
            """
            SELECT COUNT(*) AS value
            FROM user_login_logs
            WHERE user_id = %s AND user_agent = 'RAG-Demo-Seed'
            """,
            (user_id,),
        )
        if int(cur.fetchone()["value"]) > 0:
            continue
        for day_offset in range(idx % 3 + 1):
            cur.execute(
                """
                INSERT INTO user_login_logs (user_id, ip_addr, user_agent, created_at)
                VALUES (%s, %s, 'RAG-Demo-Seed', %s)
                """,
                (user_id, f"192.168.10.{20 + idx}", now - timedelta(days=day_offset, hours=idx)),
            )
            inserted += 1
    return inserted


def insert_conversation_once(
    cur,
    user_id: int,
    kb_name: str,
    title: str,
    question: str,
    answer: str,
    rating: str,
    days_ago: int,
) -> bool:
    cur.execute(
        """
        SELECT id FROM conversations
        WHERE user_id = %s AND kb_name = %s AND title = %s
        LIMIT 1
        """,
        (user_id, kb_name, title),
    )
    if cur.fetchone():
        return False

    created_at = datetime.now() - timedelta(days=days_ago, hours=days_ago)
    cur.execute(
        """
        INSERT INTO conversations (user_id, kb_name, title, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (user_id, kb_name, title, created_at, created_at + timedelta(minutes=3)),
    )
    conv_id = int(cur.lastrowid)
    cur.execute(
        """
        INSERT INTO conversation_messages (conversation_id, role, content, created_at)
        VALUES (%s, 'user', %s, %s)
        """,
        (conv_id, question, created_at),
    )
    sources = json.dumps(
        [
            {
                "file_name": "2026届本科毕业设计指导手册.pdf",
                "score": 0.87,
                "snippet": "演示数据引用片段，用于前端展示来源卡片。",
            }
        ],
        ensure_ascii=False,
    )
    cur.execute(
        """
        INSERT INTO conversation_messages (conversation_id, role, content, sources, created_at)
        VALUES (%s, 'assistant', %s, %s, %s)
        """,
        (conv_id, answer, sources, created_at + timedelta(minutes=2)),
    )
    answer_msg_id = int(cur.lastrowid)
    cur.execute(
        "INSERT INTO message_feedback (message_id, rating, created_at) VALUES (%s, %s, %s)",
        (answer_msg_id, rating, created_at + timedelta(minutes=4)),
    )
    return True


def main() -> None:
    hashed_pwd = hash_password(DEMO_PASSWORD)
    created = {
        "teachers": 0,
        "students": 0,
        "documents": 0,
        "faqs": 0,
        "login_logs": 0,
        "conversations": 0,
    }
    user_ids: dict[str, int] = {}

    with get_conn() as conn:
        with conn.cursor() as cur:
            for username, name, employee_id, department, title in TEACHERS:
                existed = scalar(cur, "SELECT COUNT(*) AS value FROM users WHERE username = %s", (username,))
                user_id = upsert_user(cur, username, name, "teacher", hashed_pwd)
                upsert_teacher_profile(cur, user_id, employee_id, department, title)
                user_ids[username] = user_id
                created["teachers"] += 0 if existed else 1

            for student_id, name, grade, major, class_name in STUDENTS:
                existed = scalar(cur, "SELECT COUNT(*) AS value FROM users WHERE username = %s", (student_id,))
                user_id = upsert_user(cur, student_id, name, "student", hashed_pwd)
                upsert_student_profile(cur, user_id, student_id, grade, major, class_name)
                user_ids[student_id] = user_id
                created["students"] += 0 if existed else 1

            owner_id = user_ids.get("teacher_li")
            for name, description in KBS:
                upsert_kb(cur, name, description, owner_id)

            for doc in DOCS:
                if insert_document_once(cur, *doc):
                    created["documents"] += 1

            for idx, faq in enumerate(FAQS):
                if insert_faq_once(cur, *faq, idx):
                    created["faqs"] += 1

            demo_user_ids = list(user_ids.values())
            created["login_logs"] = insert_login_logs(cur, demo_user_ids[:8])

            for username, kb_name, title, question, answer, rating, days_ago in CONVERSATIONS:
                if insert_conversation_once(cur, user_ids[username], kb_name, title, question, answer, rating, days_ago):
                    created["conversations"] += 1

            cur.execute(
                """
                INSERT INTO system_settings (`key`, value)
                VALUES ('active_kb', %s), ('admin_kb', %s)
                ON DUPLICATE KEY UPDATE value = VALUES(value)
                """,
                ("毕业设计指导知识库", "教师管理手册知识库"),
            )
        conn.commit()

    print("演示数据已写入。")
    print(f"统一密码: {DEMO_PASSWORD}")
    print(f"新增/补齐教师: {created['teachers']}，学生: {created['students']}")
    print(f"新增文档: {created['documents']}，FAQ: {created['faqs']}，登录日志: {created['login_logs']}，对话: {created['conversations']}")
    print("可登录账号示例: teacher_li / 202201001 / 202301008")


if __name__ == "__main__":
    main()
