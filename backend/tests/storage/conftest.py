"""Database fixtures for storage integration tests.

Connects to the Docker MySQL instance as root, creates a dedicated
``rag_db_test`` database with the full application schema, and patches
the production connection pool so every ``get_conn()`` call in tests
hits the test database instead.

Each test function gets a clean slate: all tables are truncated (children
first to satisfy foreign-key constraints) before the test body runs.
"""

import os

import pymysql
import pytest
from dbutils.pooled_db import PooledDB

import src.storage.database as db_module

_TEST_DB = "rag_db_test"
_ROOT_PWD = os.environ.get("MYSQL_ROOT_PASSWORD", "rag_root_123")
_HOST = os.environ.get("MYSQL_HOST", "localhost")
_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
_DB_USER = os.environ.get("MYSQL_USER", "rag_user")
_DB_PWD = os.environ.get("MYSQL_PASSWORD", "rag_pass_123")

# ---------------------------------------------------------------------------
# Full schema DDL (test-specific: no partitions, includes columns and tables
# that may be missing from the production init.sql).
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS users (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(32)  NOT NULL UNIQUE,
    hashed_pwd   VARCHAR(255) NOT NULL,
    display_name VARCHAR(64)  NOT NULL DEFAULT '',
    role         ENUM('admin','teacher','student') NOT NULL DEFAULT 'student',
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id    BIGINT UNSIGNED PRIMARY KEY,
    student_id VARCHAR(20)  NOT NULL UNIQUE,
    grade      VARCHAR(10)  NOT NULL DEFAULT '',
    major      VARCHAR(64)  NOT NULL DEFAULT '',
    class_name VARCHAR(32)  NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id     BIGINT UNSIGNED PRIMARY KEY,
    employee_id VARCHAR(20)  NOT NULL UNIQUE,
    department  VARCHAR(64)  NOT NULL DEFAULT '',
    title       VARCHAR(32)  NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_login_logs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    ip_addr    VARCHAR(45)  NOT NULL DEFAULT '',
    user_agent VARCHAR(255) NOT NULL DEFAULT '',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    owner_id    BIGINT UNSIGNED DEFAULT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_owner (owner_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kb_name             VARCHAR(100) NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    file_size           INT UNSIGNED NOT NULL DEFAULT 0,
    chunk_count         INT UNSIGNED NOT NULL DEFAULT 0,
    chunk_size          INT UNSIGNED NOT NULL DEFAULT 256,
    chunk_overlap_ratio FLOAT        NOT NULL DEFAULT 0.1,
    doc_type            VARCHAR(20)  NOT NULL DEFAULT 'plain_text',
    splitter_type       VARCHAR(32)  NOT NULL DEFAULT 'recursive',
    status              VARCHAR(20)  NOT NULL DEFAULT 'processing',
    summary             TEXT         NULL,
    content             LONGTEXT     NULL,
    chunks_preview      LONGTEXT     NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_kb (kb_name),
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS faqs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kb_name    VARCHAR(100) NOT NULL,
    question   TEXT         NOT NULL,
    answer     TEXT         NOT NULL,
    category   VARCHAR(64)  NOT NULL DEFAULT '',
    sort_order INT          NOT NULL DEFAULT 0,
    enabled    TINYINT(1)   NOT NULL DEFAULT 1,
    vector_id  VARCHAR(64)  DEFAULT NULL,
    author_id  BIGINT UNSIGNED DEFAULT NULL,
    status     ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'approved',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_kb (kb_name),
    INDEX idx_category (kb_name, category),
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mentor_student_relations (
    mentor_id  BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mentor_id, student_id),
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
    `key`  VARCHAR(100) PRIMARY KEY,
    value  TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    kb_name    VARCHAR(100) NOT NULL,
    title      VARCHAR(200) NOT NULL DEFAULT '新对话',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_user_kb (user_id, kb_name),
    INDEX idx_updated (updated_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_messages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    role            ENUM('user','assistant') NOT NULL,
    content         TEXT            NOT NULL,
    sources         JSON            DEFAULT NULL,
    files           JSON            DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conv (conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_feedback (
    message_id BIGINT UNSIGNED PRIMARY KEY,
    rating     VARCHAR(20) NOT NULL,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_requests (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id      BIGINT UNSIGNED NOT NULL,
    mentor_id       BIGINT UNSIGNED NOT NULL,
    conversation_id BIGINT UNSIGNED NOT NULL,
    message_id      BIGINT UNSIGNED NOT NULL,
    question        TEXT            NOT NULL,
    answer          TEXT            DEFAULT NULL,
    status          ENUM('pending','replied','closed') NOT NULL DEFAULT 'pending',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    replied_at      DATETIME        DEFAULT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS graduation_milestones (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    deadline    DATE         NOT NULL,
    description TEXT,
    sort_order  INT          NOT NULL DEFAULT 0,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# Tables in FK-safe truncation order (children first).
_TABLES = [
    "qa_requests",
    "message_feedback",
    "conversation_messages",
    "conversations",
    "faqs",
    "documents",
    "mentor_student_relations",
    "user_login_logs",
    "teacher_profiles",
    "student_profiles",
    "system_settings",
    "graduation_milestones",
    "knowledge_bases",
    "users",
]


@pytest.fixture(scope="session")
def _test_db_setup():
    """Create the test database, apply schema, and override the global pool.

    Runs once per test session. The production ``_pool`` in
    ``src.storage.database`` is replaced with one that points to
    ``rag_db_test``, so any code calling ``get_conn()`` during tests
    transparently uses the test database.
    """
    root_conn = pymysql.connect(
        host=_HOST,
        port=_PORT,
        user="root",
        password=_ROOT_PWD,
        charset="utf8mb4",
        autocommit=True,
    )
    try:
        with root_conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS {_TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cur.execute(f"GRANT ALL PRIVILEGES ON {_TEST_DB}.* TO '{_DB_USER}'@'%'")
            cur.execute("FLUSH PRIVILEGES")
    finally:
        root_conn.close()

    # Apply schema ----------------------------------------------------------
    schema_conn = pymysql.connect(
        host=_HOST,
        port=_PORT,
        user=_DB_USER,
        password=_DB_PWD,
        database=_TEST_DB,
        charset="utf8mb4",
        autocommit=True,
    )
    try:
        with schema_conn.cursor() as cur:
            # Drop all tables first with FK checks disabled to ensure clean schema
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table in _TABLES:
                cur.execute(f"DROP TABLE IF EXISTS `{table}`")
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
            # Execute schema statements one by one
            for statement in _SCHEMA_SQL.split(";"):
                statement = statement.strip()
                if statement and not statement.startswith("--"):
                    cur.execute(statement)
    finally:
        schema_conn.close()

    # Override the global pool ----------------------------------------------
    test_pool = PooledDB(
        creator=pymysql,
        mincached=0,
        maxcached=2,
        maxshared=0,
        maxconnections=0,
        blocking=True,
        host=_HOST,
        port=_PORT,
        user=_DB_USER,
        password=_DB_PWD,
        database=_TEST_DB,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
    db_module._pool = test_pool

    yield

    # Teardown: restore pool to None so production code re-initialises if
    # needed (unlikely in test, but keeps things tidy).
    db_module._pool = None


@pytest.fixture(autouse=True)
def _clean_tables(_test_db_setup):
    """Truncate every table before each test to guarantee isolation."""
    conn = db_module.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table in _TABLES:
                cur.execute(f"TRUNCATE TABLE `{table}`")
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Shared store fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def user_store():
    from src.storage.user_store import UserStore

    return UserStore()


@pytest.fixture()
def ticket_store():
    from src.storage.ticket_store import TicketStore

    return TicketStore()


# ---------------------------------------------------------------------------
# Mentor/student relationship fixtures (require a KB + conversation + message
# as FK prerequisites for qa_requests rows).
# ---------------------------------------------------------------------------


@pytest.fixture()
def _ticket_prereqs():
    """Create the KB / conversation / message rows needed by qa_requests FKs.

    Returns a callable ``make_prereqs(student_id)`` that inserts the rows and
    returns ``(conversation_id, message_id)`` for the given student.
    """
    from src.storage.conversation_store import ConversationStore
    from src.storage.kb_store import KBStore

    kb = KBStore()
    kb_name = "_test_ticket_prereqs_kb"
    kb.create_kb(kb_name, "prereq kb for ticket tests")

    conv_store = ConversationStore()

    def make_prereqs(student_id: int) -> tuple[int, int]:
        conv = conv_store.create_conversation(kb_name, title="test conv", user_id=student_id)
        conv_id = conv["id"]
        # Insert a message directly via raw SQL to avoid needing a full message store
        conn = db_module.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO conversation_messages (conversation_id, role, content) VALUES (%s, 'user', 'test')",
                    (conv_id,),
                )
                msg_id = cur.lastrowid
            conn.commit()
        finally:
            conn.close()
        return conv_id, msg_id

    return make_prereqs


@pytest.fixture()
def mentor_with_student(user_store, _ticket_prereqs):
    """创建一个 mentor + 一个绑定学生，返回 (mentor_id, student_id, conv_id, msg_id)。

    Tests that only need (mentor_id, student_id) can unpack the first two values.
    """
    mentor_id = user_store.create_user(
        username="t_mentor_001",
        hashed_pwd="x",
        display_name="测试导师",
        role="teacher",
    )["id"]
    student_id = user_store.create_user(
        username="t_student_001",
        hashed_pwd="x",
        display_name="测试学生",
        role="student",
    )["id"]
    user_store.add_mentor_relation(mentor_id, student_id)
    conv_id, msg_id = _ticket_prereqs(student_id)
    yield mentor_id, student_id, conv_id, msg_id


@pytest.fixture()
def two_mentors_with_students(user_store, _ticket_prereqs):
    """两个 mentor 各带一个学生。

    Returns (m1_id, s1_id, conv1_id, msg1_id, m2_id, s2_id, conv2_id, msg2_id).
    """
    m1 = user_store.create_user("t_m1", "x", display_name="M1", role="teacher")["id"]
    s1 = user_store.create_user("t_s1", "x", display_name="S1", role="student")["id"]
    m2 = user_store.create_user("t_m2", "x", display_name="M2", role="teacher")["id"]
    s2 = user_store.create_user("t_s2", "x", display_name="S2", role="student")["id"]
    user_store.add_mentor_relation(m1, s1)
    user_store.add_mentor_relation(m2, s2)
    c1, msg1 = _ticket_prereqs(s1)
    c2, msg2 = _ticket_prereqs(s2)
    yield m1, s1, c1, msg1, m2, s2, c2, msg2
