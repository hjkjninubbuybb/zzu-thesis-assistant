# Phase 2: Backend Behavior-Protection Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pytest test suite covering storage layer (integration with real MySQL), safety guards (unit), FAQ matching (unit), and chat SSE (unit) — so Phase 3's storage-layer split has regression protection.

**Architecture:** Integration tests connect to a dedicated `rag_db_test` database on the existing Docker MySQL instance. Unit tests mock LLM/embedding/vector-store calls. All tests run via `poetry run pytest`.

**Tech Stack:** pytest 8+, pytest-asyncio 0.25+, httpx 0.28+ (FastAPI TestClient), unittest.mock

---

## File Structure

```
tests/
├── conftest.py                     # pytest config marker, shared helpers
├── storage/
│   ├── conftest.py                 # DB session fixture, table truncation
│   ├── test_document_store.py      # KB + Doc + FAQ + Setting + Conversation + Message + Feedback + QA
│   └── test_user_store.py          # User + Profile + Login log + Mentor relation
├── core/
│   ├── test_safety_guards.py       # All 24 safety guard rules
│   └── test_faq_match.py           # rewrite_query, try_faq_match, faq_generate
└── api/
    └── test_chat_sse.py            # SSE event sequence for FAQ and RAG paths
```

**Modified files:**
- `pyproject.toml` — add pytest/pytest-asyncio/httpx to dev deps + `[tool.pytest.ini_options]`

---

### Task 1: Test Infrastructure

**Files:**
- Modify: `pyproject.toml:60-64` (dev deps) + add `[tool.pytest.ini_options]`
- Create: `tests/conftest.py`
- Create: `tests/storage/conftest.py`

- [ ] **Step 1: Add test dependencies to pyproject.toml**

In `pyproject.toml`, update the `[dependency-groups]` dev section and add pytest config:

```toml
[dependency-groups]
dev = [
    "ruff (>=0.15.14,<0.16.0)",
    "pre-commit (>=4.6.0,<5.0.0)",
    "pytest (>=8.0.0)",
    "pytest-asyncio (>=0.25.0)",
    "httpx (>=0.28.0)",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

Also add `tests/` to ruff per-file-ignores to relax docstring rules for tests:

```toml
[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["D", "S101"]  # No docstrings required in tests; assert is fine
```

(Keep existing per-file-ignores entries unchanged.)

- [ ] **Step 2: Install new dependencies**

Run:
```bash
cd /Users/gefeng/projects/rag1.0 && poetry lock --no-update && poetry install
```

Expected: Lock file updated, pytest/pytest-asyncio/httpx installed.

- [ ] **Step 3: Create root tests/conftest.py**

```python
"""Shared test configuration and helpers."""

import pytest


def pytest_collection_modifyitems(items):
    """Auto-mark tests under tests/storage/ as 'integration'."""
    for item in items:
        if "/storage/" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
```

- [ ] **Step 4: Create tests/storage/conftest.py with DB fixtures**

```python
"""Database fixtures for storage integration tests.

Requires: Docker MySQL running (docker-compose up -d mysql).
Creates a dedicated rag_db_test database with full schema.
"""

import pymysql
import pytest
from dbutils.pooled_db import PooledDB

import src.storage.database as db_module

_TEST_DB = "rag_db_test"
_ROOT_PWD = "rag_root_123"
_HOST = "localhost"
_PORT = 3306

# Tables in truncation-safe order (children first)
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


@pytest.fixture(scope="session")
def _test_db_setup():
    """Create rag_db_test database and apply full schema (once per session)."""
    root = pymysql.connect(host=_HOST, port=_PORT, user="root", password=_ROOT_PWD)
    try:
        with root.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {_TEST_DB}")
            cur.execute(
                f"CREATE DATABASE {_TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            cur.execute(
                f"GRANT ALL PRIVILEGES ON {_TEST_DB}.* TO 'rag_user'@'%%'"
            )
        root.commit()
    finally:
        root.close()

    # Apply schema via rag_user
    conn = pymysql.connect(
        host=_HOST,
        port=_PORT,
        user="rag_user",
        password="rag_pass_123",
        database=_TEST_DB,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cur:
            for stmt in _SCHEMA_SQL.split(";"):
                stmt = stmt.strip()
                if stmt:
                    cur.execute(stmt)
        conn.commit()
    finally:
        conn.close()

    # Override the global connection pool to point at rag_db_test
    test_pool = PooledDB(
        creator=pymysql,
        mincached=0,
        maxcached=2,
        maxshared=0,
        maxconnections=0,
        blocking=True,
        host=_HOST,
        port=_PORT,
        user="rag_user",
        password="rag_pass_123",
        database=_TEST_DB,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
    original_pool = db_module._pool
    db_module._pool = test_pool

    yield

    db_module._pool = original_pool


@pytest.fixture(autouse=True)
def _clean_tables(_test_db_setup):
    """Truncate all tables before each test (clean slate)."""
    with db_module.get_conn() as conn, conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for table in _TABLES:
            cur.execute(f"TRUNCATE TABLE {table}")
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
```

- [ ] **Step 5: Verify pytest discovers tests and DB fixture works**

Create a minimal smoke test at `tests/storage/test_smoke.py`:

```python
from src.storage.database import get_conn


def test_db_connection_works():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT DATABASE()")
        row = cur.fetchone()
    assert row["DATABASE()"] == "rag_db_test"
```

Run:
```bash
cd /Users/gefeng/projects/rag1.0 && poetry run pytest tests/storage/test_smoke.py -v
```

Expected: 1 passed.

- [ ] **Step 6: Delete smoke test and commit**

Delete `tests/storage/test_smoke.py`.

```bash
git add pyproject.toml tests/conftest.py tests/storage/conftest.py
git commit -m "test: add pytest infrastructure with MySQL integration fixtures"
```

---

### Task 2: DocumentStore Integration Tests — KB & Document CRUD

**Files:**
- Create: `tests/storage/test_document_store.py`

**Reference:** `src/storage/document_store.py:17-152` (KB methods L17-50, Doc methods L54-152)

- [ ] **Step 1: Write KB CRUD tests**

Create `tests/storage/test_document_store.py`:

```python
import pytest

from src.storage.document_store import DocumentStore


@pytest.fixture()
def ds():
    return DocumentStore()


# ── Knowledge Base CRUD ─────────────────────────────────────────


class TestKnowledgeBase:
    def test_create_kb(self, ds):
        kb = ds.create_kb("test_kb", "Test knowledge base")
        assert kb["name"] == "test_kb"
        assert kb["description"] == "Test knowledge base"
        assert kb["id"] is not None

    def test_create_kb_duplicate_raises(self, ds):
        ds.create_kb("dup_kb")
        with pytest.raises(Exception):
            ds.create_kb("dup_kb")

    def test_list_kbs_with_doc_count(self, ds):
        ds.create_kb("kb1")
        ds.create_kb("kb2")
        ds.add_document("kb1", "file1.pdf")
        ds.add_document("kb1", "file2.pdf")
        kbs = ds.list_kbs()
        kb_map = {k["name"]: k for k in kbs}
        assert kb_map["kb1"]["doc_count"] == 2
        assert kb_map["kb2"]["doc_count"] == 0

    def test_get_kb_found(self, ds):
        ds.create_kb("found_kb")
        assert ds.get_kb("found_kb") is not None

    def test_get_kb_not_found(self, ds):
        assert ds.get_kb("nonexistent") is None

    def test_delete_kb_cascades_documents(self, ds):
        ds.create_kb("del_kb")
        ds.add_document("del_kb", "file.pdf")
        ds.delete_kb("del_kb")
        assert ds.get_kb("del_kb") is None
        assert ds.list_documents("del_kb") == []
```

- [ ] **Step 2: Run KB tests to verify they pass**

Run:
```bash
poetry run pytest tests/storage/test_document_store.py::TestKnowledgeBase -v
```

Expected: 6 passed.

- [ ] **Step 3: Write Document CRUD tests**

Append to `tests/storage/test_document_store.py`:

```python
class TestDocument:
    @pytest.fixture(autouse=True)
    def _kb(self, ds):
        ds.create_kb("doc_test_kb")

    def test_add_document_defaults(self, ds):
        doc = ds.add_document("doc_test_kb", "report.pdf")
        assert doc["file_name"] == "report.pdf"
        assert doc["kb_name"] == "doc_test_kb"
        assert doc["status"] == "completed"
        assert doc["chunk_count"] == 0

    def test_add_document_all_fields(self, ds):
        doc = ds.add_document(
            "doc_test_kb",
            "big.pdf",
            file_size=1024,
            chunk_count=10,
            chunk_size=512,
            chunk_overlap_ratio=0.2,
            doc_type="policy",
            splitter_type="semantic",
            status="processing",
            summary="A summary",
            content="Full content here",
        )
        assert doc["file_size"] == 1024
        assert doc["chunk_count"] == 10
        assert doc["doc_type"] == "policy"
        assert doc["content"] == "Full content here"

    def test_list_documents_ordered_by_created_desc(self, ds):
        ds.add_document("doc_test_kb", "first.pdf")
        ds.add_document("doc_test_kb", "second.pdf")
        docs = ds.list_documents("doc_test_kb")
        assert docs[0]["file_name"] == "second.pdf"
        assert docs[1]["file_name"] == "first.pdf"

    def test_get_document(self, ds):
        doc = ds.add_document("doc_test_kb", "get_me.pdf")
        fetched = ds.get_document(doc["id"])
        assert fetched["file_name"] == "get_me.pdf"

    def test_get_document_not_found(self, ds):
        assert ds.get_document(999999) is None

    def test_update_document_allowed_fields(self, ds):
        doc = ds.add_document("doc_test_kb", "upd.pdf", chunk_count=0)
        result = ds.update_document(doc["id"], chunk_count=42, summary="Updated")
        assert result is True
        updated = ds.get_document(doc["id"])
        assert updated["chunk_count"] == 42
        assert updated["summary"] == "Updated"

    def test_update_document_ignores_disallowed_fields(self, ds):
        doc = ds.add_document("doc_test_kb", "safe.pdf")
        result = ds.update_document(doc["id"], file_name="hacked.pdf")
        assert result is False  # no valid updates

    def test_update_document_summary(self, ds):
        doc = ds.add_document("doc_test_kb", "sum.pdf")
        assert ds.update_document_summary(doc["id"], "New summary") is True
        assert ds.get_document(doc["id"])["summary"] == "New summary"

    def test_delete_document_returns_row(self, ds):
        doc = ds.add_document("doc_test_kb", "del.pdf")
        deleted = ds.delete_document(doc["id"])
        assert deleted["file_name"] == "del.pdf"
        assert ds.get_document(doc["id"]) is None

    def test_delete_document_not_found(self, ds):
        assert ds.delete_document(999999) is None
```

- [ ] **Step 4: Run all document store tests**

Run:
```bash
poetry run pytest tests/storage/test_document_store.py -v
```

Expected: all passed (6 KB + 10 Doc = 16 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/storage/test_document_store.py
git commit -m "test: add DocumentStore KB & document CRUD integration tests"
```

---

### Task 3: DocumentStore Integration Tests — FAQ, Settings, Conversation, Message, Feedback, QA

**Files:**
- Modify: `tests/storage/test_document_store.py`

**Reference:** `src/storage/document_store.py:156-481` (FAQ L156-241, Settings L245-263, Conv L267-338, Msg L342-397, Feedback L401-421, QA L425-481)

- [ ] **Step 1: Write FAQ CRUD tests**

Append to `tests/storage/test_document_store.py`:

```python
class TestFAQ:
    @pytest.fixture(autouse=True)
    def _kb(self, ds):
        ds.create_kb("faq_kb")

    def test_add_faq_defaults(self, ds):
        faq = ds.add_faq("faq_kb", "What is X?", "X is Y.")
        assert faq["question"] == "What is X?"
        assert faq["answer"] == "X is Y."
        assert faq["enabled"] == 1
        assert faq["status"] == "approved"

    def test_add_faq_with_author(self, ds):
        from src.storage.user_store import UserStore
        us = UserStore()
        user = us.create_user("faq_author", "hash", role="teacher")
        faq = ds.add_faq("faq_kb", "Q?", "A.", author_id=user["id"], status="pending")
        assert faq["author_id"] == user["id"]
        assert faq["status"] == "pending"

    def test_list_faqs_enabled_only(self, ds):
        ds.add_faq("faq_kb", "Q1", "A1")
        faq2 = ds.add_faq("faq_kb", "Q2", "A2")
        ds.update_faq(faq2["id"], enabled=0)
        enabled = ds.list_faqs("faq_kb", enabled_only=True)
        assert len(enabled) == 1
        assert enabled[0]["question"] == "Q1"

    def test_list_faqs_by_status(self, ds):
        ds.add_faq("faq_kb", "Q1", "A1", status="approved")
        ds.add_faq("faq_kb", "Q2", "A2", status="draft")
        approved = ds.list_faqs("faq_kb", status="approved")
        assert len(approved) == 1

    def test_get_faq(self, ds):
        faq = ds.add_faq("faq_kb", "Q?", "A.")
        assert ds.get_faq(faq["id"])["question"] == "Q?"

    def test_update_faq(self, ds):
        faq = ds.add_faq("faq_kb", "Old Q", "Old A")
        updated = ds.update_faq(faq["id"], question="New Q", answer="New A")
        assert updated["question"] == "New Q"
        assert updated["answer"] == "New A"

    def test_update_faq_no_valid_keys(self, ds):
        faq = ds.add_faq("faq_kb", "Q?", "A.")
        result = ds.update_faq(faq["id"], invalid_key="value")
        assert result["question"] == "Q?"  # unchanged, returns current

    def test_delete_faq(self, ds):
        faq = ds.add_faq("faq_kb", "Del Q", "Del A")
        deleted = ds.delete_faq(faq["id"])
        assert deleted["question"] == "Del Q"
        assert ds.get_faq(faq["id"]) is None

    def test_delete_faq_not_found(self, ds):
        assert ds.delete_faq(999999) is None

    def test_list_faqs_order_by_sort_order(self, ds):
        ds.add_faq("faq_kb", "Q2", "A2", sort_order=2)
        ds.add_faq("faq_kb", "Q1", "A1", sort_order=1)
        faqs = ds.list_faqs("faq_kb")
        assert faqs[0]["question"] == "Q1"
        assert faqs[1]["question"] == "Q2"
```

- [ ] **Step 2: Write Settings tests**

Append to `tests/storage/test_document_store.py`:

```python
class TestSettings:
    def test_set_and_get_setting(self, ds):
        ds.set_setting("test_key", "test_value")
        assert ds.get_setting("test_key") == "test_value"

    def test_get_setting_not_found(self, ds):
        assert ds.get_setting("nonexistent") is None

    def test_set_setting_upsert(self, ds):
        ds.set_setting("upsert_key", "v1")
        ds.set_setting("upsert_key", "v2")
        assert ds.get_setting("upsert_key") == "v2"

    def test_delete_setting(self, ds):
        ds.set_setting("del_key", "val")
        ds.delete_setting("del_key")
        assert ds.get_setting("del_key") is None
```

- [ ] **Step 3: Write Conversation, Message, Feedback tests**

Append to `tests/storage/test_document_store.py`:

```python
class TestConversation:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore
        us = UserStore()
        self.user = us.create_user("conv_user", "hash", role="student")
        ds.create_kb("conv_kb")

    def test_create_conversation(self, ds):
        conv = ds.create_conversation("conv_kb", user_id=self.user["id"])
        assert conv["title"] == "新对话"
        assert conv["kb_name"] == "conv_kb"

    def test_list_conversations_pagination(self, ds):
        for i in range(5):
            ds.create_conversation("conv_kb", title=f"Conv {i}", user_id=self.user["id"])
        result = ds.list_conversations(kb_name="conv_kb", limit=3)
        assert len(result["items"]) == 3
        assert result["has_more"] is True
        assert result["next_cursor"] is not None

    def test_list_conversations_filter_by_user(self, ds):
        from src.storage.user_store import UserStore
        us = UserStore()
        other = us.create_user("other_user", "hash", role="student")
        ds.create_conversation("conv_kb", user_id=self.user["id"])
        ds.create_conversation("conv_kb", user_id=other["id"])
        result = ds.list_conversations(user_id=self.user["id"])
        assert len(result["items"]) == 1

    def test_update_conversation_title(self, ds):
        conv = ds.create_conversation("conv_kb", user_id=self.user["id"])
        updated = ds.update_conversation_title(conv["id"], "New Title")
        assert updated["title"] == "New Title"

    def test_delete_conversation_cascades(self, ds):
        conv = ds.create_conversation("conv_kb", user_id=self.user["id"])
        ds.add_message(conv["id"], "user", "Hello")
        ds.delete_conversation(conv["id"])
        assert ds.get_conversation(conv["id"]) is None
        assert ds.list_messages(conv["id"]) == []


class TestMessage:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore
        us = UserStore()
        self.user = us.create_user("msg_user", "hash", role="student")
        ds.create_kb("msg_kb")
        self.conv = ds.create_conversation("msg_kb", user_id=self.user["id"])

    def test_add_message_plain(self, ds):
        msg = ds.add_message(self.conv["id"], "user", "Hello!")
        assert msg["role"] == "user"
        assert msg["content"] == "Hello!"
        assert msg["sources"] is None

    def test_add_message_with_sources_json(self, ds):
        import json
        sources = [{"node_id": "n1", "text": "chunk", "score": 0.9}]
        msg = ds.add_message(self.conv["id"], "assistant", "Answer", sources_json=json.dumps(sources))
        assert isinstance(msg["sources"], list)
        assert msg["sources"][0]["node_id"] == "n1"

    def test_list_messages_order_asc(self, ds):
        ds.add_message(self.conv["id"], "user", "First")
        ds.add_message(self.conv["id"], "assistant", "Second")
        msgs = ds.list_messages(self.conv["id"])
        assert msgs[0]["content"] == "First"
        assert msgs[1]["content"] == "Second"

    def test_add_message_updates_conversation_updated_at(self, ds):
        before = ds.get_conversation(self.conv["id"])["updated_at"]
        import time
        time.sleep(1)
        ds.add_message(self.conv["id"], "user", "New msg")
        after = ds.get_conversation(self.conv["id"])["updated_at"]
        assert after > before


class TestFeedback:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore
        us = UserStore()
        user = us.create_user("fb_user", "hash", role="student")
        ds.create_kb("fb_kb")
        conv = ds.create_conversation("fb_kb", user_id=user["id"])
        self.msg = ds.add_message(conv["id"], "assistant", "Answer")

    def test_set_and_get_feedback(self, ds):
        fb = ds.set_message_feedback(self.msg["id"], "thumbs_up")
        assert fb["rating"] == "thumbs_up"
        assert ds.get_message_feedback(self.msg["id"])["rating"] == "thumbs_up"

    def test_update_feedback_upsert(self, ds):
        ds.set_message_feedback(self.msg["id"], "thumbs_up")
        ds.set_message_feedback(self.msg["id"], "thumbs_down")
        assert ds.get_message_feedback(self.msg["id"])["rating"] == "thumbs_down"

    def test_get_feedback_not_found(self, ds):
        assert ds.get_message_feedback(999999) is None
```

- [ ] **Step 4: Write QA Request tests**

Append to `tests/storage/test_document_store.py`:

```python
class TestQARequest:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore
        us = UserStore()
        self.student = us.create_user("qa_student", "hash", role="student")
        self.mentor = us.create_user("qa_mentor", "hash", role="teacher")
        ds.create_kb("qa_kb")
        self.conv = ds.create_conversation("qa_kb", user_id=self.student["id"])
        self.msg = ds.add_message(self.conv["id"], "user", "Help me!")

    def test_create_qa_request(self, ds):
        req = ds.create_qa_request(
            self.student["id"], self.mentor["id"],
            self.conv["id"], self.msg["id"], "Help me!",
        )
        assert req["status"] == "pending"
        assert req["answer"] is None

    def test_update_qa_request(self, ds):
        req = ds.create_qa_request(
            self.student["id"], self.mentor["id"],
            self.conv["id"], self.msg["id"], "Help!",
        )
        updated = ds.update_qa_request(req["id"], "Here is help.", status="replied")
        assert updated["answer"] == "Here is help."
        assert updated["status"] == "replied"
        assert updated["replied_at"] is not None

    def test_list_qa_requests_by_mentor(self, ds):
        ds.create_qa_request(
            self.student["id"], self.mentor["id"],
            self.conv["id"], self.msg["id"], "Q1",
        )
        results = ds.list_qa_requests(mentor_id=self.mentor["id"])
        assert len(results) == 1

    def test_list_qa_requests_by_status(self, ds):
        req = ds.create_qa_request(
            self.student["id"], self.mentor["id"],
            self.conv["id"], self.msg["id"], "Q1",
        )
        pending = ds.list_qa_requests(status="pending")
        assert len(pending) == 1
        ds.update_qa_request(req["id"], "A1", status="replied")
        pending_after = ds.list_qa_requests(status="pending")
        assert len(pending_after) == 0

    def test_get_qa_request(self, ds):
        req = ds.create_qa_request(
            self.student["id"], self.mentor["id"],
            self.conv["id"], self.msg["id"], "Q?",
        )
        fetched = ds.get_qa_request(req["id"])
        assert fetched["question"] == "Q?"
```

- [ ] **Step 5: Run all tests**

Run:
```bash
poetry run pytest tests/storage/test_document_store.py -v
```

Expected: all passed (~35 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/storage/test_document_store.py
git commit -m "test: add DocumentStore FAQ/settings/conversation/message/feedback/QA integration tests"
```

---

### Task 4: UserStore Integration Tests

**Files:**
- Create: `tests/storage/test_user_store.py`

**Reference:** `src/storage/user_store.py:15-231`

- [ ] **Step 1: Write User CRUD + Profile + Login log + Mentor relation tests**

Create `tests/storage/test_user_store.py`:

```python
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
        with pytest.raises(Exception):
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
        assert result["username"] == "no_upd"  # returns current unchanged

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
```

- [ ] **Step 2: Run all user store tests**

Run:
```bash
poetry run pytest tests/storage/test_user_store.py -v
```

Expected: all passed (~25 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/storage/test_user_store.py
git commit -m "test: add UserStore integration tests (CRUD, profiles, login logs, mentoring)"
```

---

### Task 5: Safety Guards Unit Tests

**Files:**
- Create: `tests/core/test_safety_guards.py`

**Reference:** `src/core/agent/safety_guards.py:10-311` — `RuleSafetyGuard.check()` with 24 rules

- [ ] **Step 1: Write safety guard tests for all 24 rules + passthrough**

Create `tests/core/test_safety_guards.py`:

```python
import pytest

from src.core.agent.safety_guards import RuleSafetyGuard


@pytest.fixture()
def guard():
    return RuleSafetyGuard()


ORIGINAL = "原始LLM回答"


class TestSafetyGuardRules:
    """Each test triggers exactly one rule by providing the required keywords."""

    def test_consecutive_three_cohorts(self, guard):
        text, guards = guard.check("连续三届具体指哪几届学生", ORIGINAL)
        assert "consecutive_three_cohorts" in guards
        assert "2024届、2025届、2026届" in text

    def test_major_match_description(self, guard):
        text, guards = guard.check(
            "专业匹配度说明只写符合计算机类专业毕业设计统一基准规范可以吗", ORIGINAL
        )
        assert "major_match_description" in guards

    def test_development_document_outputs(self, guard):
        text, guards = guard.check("开发类选题需要提交哪些文档成果", ORIGINAL)
        assert "development_document_outputs" in guards
        assert "5000字" in text

    def test_development_main_outputs(self, guard):
        text, guards = guard.check("开发类选题主要成果形式怎么填", ORIGINAL)
        assert "development_main_outputs" in guards
        assert "30%" in text

    def test_advisor_student_limit(self, guard):
        text, guards = guard.check("每位指导教师最多指导多少名学生", ORIGINAL)
        assert "advisor_student_limit" in guards
        assert "8名" in text

    def test_official_start_week(self, guard):
        text, guards = guard.check("毕业设计什么时候正式启动", ORIGINAL)
        assert "official_start_week" in guards
        assert "2025年12月22日" in text

    def test_source_code_comment_rate(self, guard):
        text, guards = guard.check("源代码注释率最低要达到多少", ORIGINAL)
        assert "source_code_comment_rate" in guards
        assert "30%" in text

    def test_source_code_comment_rate_not_triggered_for_proposal(self, guard):
        """开题报告 context should NOT trigger this rule."""
        text, guards = guard.check("开题报告技术路线里源代码注释率达到多少", ORIGINAL)
        assert "source_code_comment_rate" not in guards

    def test_plagiarism_threshold_policy(self, guard):
        text, guards = guard.check("学校统一规定的查重率标准是多少才能答辩", ORIGINAL)
        assert "plagiarism_threshold_policy" in guards
        assert "30%" in text
        assert "40%" in text

    def test_student_topic_selection_timing(self, guard):
        text, guards = guard.check("2026届大四上什么时候开始选题", ORIGINAL)
        assert "student_topic_selection_timing" in guards

    def test_topic_pool_summary_deadline(self, guard):
        text, guards = guard.check("选题题库最晚什么时候汇总", ORIGINAL)
        assert "topic_pool_summary_deadline" in guards

    def test_reference_format_policy_file(self, guard):
        text, guards = guard.check("参考文献标注格式依据哪份校级文件执行", ORIGINAL)
        assert "reference_format_policy_file" in guards
        assert "校教务〔2016〕10号" in text

    def test_proposal_route_comment_rate(self, guard):
        text, guards = guard.check("开题报告技术路线里需要写源代码注释率吗", ORIGINAL)
        assert "proposal_route_comment_rate" in guards

    def test_proposal_report_week(self, guard):
        text, guards = guard.check("开题报告第几周提交", ORIGINAL)
        assert "proposal_report_week" in guards
        assert "2026年3月2日" in text

    def test_teacher_paper_material_before_proposal(self, guard):
        text, guards = guard.check("师生双选到开题前需要提交哪些纸质版材料", ORIGINAL)
        assert "teacher_paper_material_before_proposal" in guards

    def test_literature_review_midterm_same_week(self, guard):
        text, guards = guard.check("文献综述和中期检查表是同一周交吗", ORIGINAL)
        assert "literature_review_midterm_same_week" in guards
        assert "第六周" in text

    def test_proposal_to_midterm_interval(self, guard):
        text, guards = guard.check("开题完成到中期检查隔了几周有没有强制性节点", ORIGINAL)
        assert "proposal_to_midterm_interval" in guards
        assert "5周" in text

    def test_weekly_guidance_online(self, guard):
        text, guards = guard.check("每周不少于1次指导用腾讯会议线上可以吗", ORIGINAL)
        assert "weekly_guidance_online" in guards

    def test_task_book_defined_by_org(self, guard):
        text, guards = guard.check("任务书作为毕设文件由哪一级组织明确界定", ORIGINAL)
        assert "task_book_defined_by_org" in guards

    def test_task_meeting_interval(self, guard):
        text, guards = guard.check(
            "任务书提交截止日和师生见面启动日之间总共多少天自然日", ORIGINAL
        )
        assert "task_meeting_interval" in guards
        assert "19" in text

    def test_graduation_leave_date(self, guard):
        text, guards = guard.check("离校前是否等于最后一门考试结束如1月15", ORIGINAL)
        assert "graduation_leave_date" in guards

    def test_task_paper_process_unknown(self, guard):
        text, guards = guard.check("任务书往年是纸质还是扫描件提交", ORIGINAL)
        assert "task_paper_process_unknown" in guards

    def test_task_submission_confirmation(self, guard):
        text, guards = guard.check("任务书谁来确认按时交了", ORIGINAL)
        assert "task_submission_confirmation" in guards

    def test_task_submission_system_closure(self, guard):
        text, guards = guard.check("任务书第十九周末系统会自动关掉上传入口吗", ORIGINAL)
        assert "task_submission_system_closure" in guards


class TestSafetyGuardPassthrough:
    """Queries that match no rule should return original text unchanged."""

    def test_unrelated_query_passthrough(self, guard):
        text, guards = guard.check("今天天气怎么样", "今天是晴天")
        assert text == "今天是晴天"
        assert guards == []

    def test_partial_keyword_no_match(self, guard):
        text, guards = guard.check("连续三届太难了", ORIGINAL)
        assert text == ORIGINAL
        assert guards == []
```

- [ ] **Step 2: Run safety guard tests**

Run:
```bash
poetry run pytest tests/core/test_safety_guards.py -v
```

Expected: 26 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/core/test_safety_guards.py
git commit -m "test: add safety guards unit tests covering all 24 rules"
```

---

### Task 6: FAQ Match Unit Tests

**Files:**
- Create: `tests/core/test_faq_match.py`

**Reference:** `src/core/faq_match.py:24-151` — `rewrite_query`, `try_faq_match`, `faq_generate`

- [ ] **Step 1: Write rewrite_query tests**

Create `tests/core/test_faq_match.py`:

```python
from unittest.mock import MagicMock, patch

import pytest

from src.core.faq_match import FALLBACK_MARKER, faq_generate, rewrite_query, try_faq_match


class TestRewriteQuery:
    @patch("src.core.faq_match.get_llm")
    def test_rewrite_returns_cleaned_text(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = "毕业设计开题报告提交时间"
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        result = rewrite_query("开题啥时候交")
        assert result == "毕业设计开题报告提交时间"
        mock_get_llm.assert_called_once_with(fast=True, streaming=False)

    @patch("src.core.faq_match.get_llm")
    def test_rewrite_fallback_on_error(self, mock_get_llm):
        mock_get_llm.side_effect = Exception("LLM down")
        result = rewrite_query("开题啥时候交")
        assert result == "开题啥时候交"  # returns original

    @patch("src.core.faq_match.get_llm")
    def test_rewrite_fallback_on_empty_response(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = "   "
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        result = rewrite_query("开题啥时候交")
        assert result == "开题啥时候交"
```

- [ ] **Step 2: Write try_faq_match tests**

Append to `tests/core/test_faq_match.py`:

```python
class TestTryFaqMatch:
    def _make_ds(self, faq_row=None):
        ds = MagicMock()
        ds.get_faq.return_value = faq_row
        return ds

    def _make_vs(self, hits=None):
        vs = MagicMock()
        vs.search.return_value = hits or []
        return vs

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="rewritten query")
    def test_match_returns_results(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        faq_row = {
            "id": 1,
            "question": "开题报告什么时候交？",
            "answer": "第一周",
            "enabled": 1,
            "status": "approved",
        }
        vs = self._make_vs(hits=[{"faq_id": 1, "score": 0.85}])
        ds = self._make_ds(faq_row=faq_row)

        results = try_faq_match("开题什么时候", "kb1", vs, ds, score_threshold=0.75)
        assert results is not None
        assert len(results) == 1
        assert results[0]["score"] == 0.85
        assert results[0]["faq_id"] == 1

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_returns_none_when_no_hits(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        vs = self._make_vs(hits=[])
        ds = self._make_ds()

        result = try_faq_match("random", "kb1", vs, ds)
        assert result is None

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_skips_disabled_faqs(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        disabled_faq = {"id": 2, "question": "Q", "answer": "A", "enabled": 0, "status": "approved"}
        vs = self._make_vs(hits=[{"faq_id": 2, "score": 0.9}])
        ds = self._make_ds(faq_row=disabled_faq)

        result = try_faq_match("query", "kb1", vs, ds)
        assert result is None

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_skips_non_approved_faqs(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        draft_faq = {"id": 3, "question": "Q", "answer": "A", "enabled": 1, "status": "draft"}
        vs = self._make_vs(hits=[{"faq_id": 3, "score": 0.9}])
        ds = self._make_ds(faq_row=draft_faq)

        result = try_faq_match("query", "kb1", vs, ds)
        assert result is None

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_deduplicates_faq_ids(self, mock_rewrite, mock_embed):
        mock_model = MagicMock()
        mock_model.get_text_embedding.return_value = [0.1] * 1024
        mock_embed.return_value = mock_model

        faq_row = {"id": 1, "question": "Q", "answer": "A", "enabled": 1, "status": "approved"}
        vs = self._make_vs(hits=[
            {"faq_id": 1, "score": 0.9},
            {"faq_id": 1, "score": 0.85},  # duplicate
        ])
        ds = self._make_ds(faq_row=faq_row)

        results = try_faq_match("query", "kb1", vs, ds)
        assert len(results) == 1

    @patch("src.core.faq_match.get_embed_model")
    @patch("src.core.faq_match.rewrite_query", return_value="query")
    def test_match_returns_none_on_embed_error(self, mock_rewrite, mock_embed):
        mock_embed.side_effect = Exception("Embed down")
        vs = self._make_vs()
        ds = self._make_ds()
        result = try_faq_match("query", "kb1", vs, ds)
        assert result is None
```

- [ ] **Step 3: Write faq_generate tests**

Append to `tests/core/test_faq_match.py`:

```python
class TestFaqGenerate:
    @patch("src.core.faq_match.get_llm")
    def test_generate_returns_answer(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = "开题报告在第一周提交。"
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        faq_results = [{"question": "Q?", "answer": "A.", "score": 0.9, "faq_id": 1}]
        result = faq_generate("开题什么时候", faq_results)
        assert result == "开题报告在第一周提交。"

    @patch("src.core.faq_match.get_llm")
    def test_generate_returns_none_on_fallback(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_resp = MagicMock()
        mock_resp.content = f"不够详细 {FALLBACK_MARKER}"
        mock_llm.invoke.return_value = mock_resp
        mock_get_llm.return_value = mock_llm

        faq_results = [{"question": "Q?", "answer": "A.", "score": 0.8, "faq_id": 1}]
        result = faq_generate("complex question", faq_results)
        assert result is None

    @patch("src.core.faq_match.get_llm")
    def test_generate_returns_none_on_llm_error(self, mock_get_llm):
        mock_get_llm.side_effect = Exception("LLM down")
        faq_results = [{"question": "Q?", "answer": "A.", "score": 0.9, "faq_id": 1}]
        result = faq_generate("query", faq_results)
        assert result is None
```

- [ ] **Step 4: Run FAQ match tests**

Run:
```bash
poetry run pytest tests/core/test_faq_match.py -v
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/core/test_faq_match.py
git commit -m "test: add FAQ match unit tests (rewrite, match, generate with mocked LLM)"
```

---

### Task 7: Chat SSE Event Sequence Tests

**Files:**
- Create: `tests/api/test_chat_sse.py`

**Reference:** `src/api/routes/chat.py:27-256` — SSE event_generator with FAQ and RAG paths

- [ ] **Step 1: Write SSE test helpers and FAQ-path test**

Create `tests/api/test_chat_sse.py`:

```python
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from src.api.app import app


def _auth_headers(role="admin"):
    """Create a mock JWT auth header (patches get_current_user)."""
    return {"Authorization": "Bearer test-token"}


def _parse_sse(response) -> list[dict]:
    """Parse SSE response body into list of {event, data} dicts."""
    events = []
    current_event = None
    for line in response.text.split("\n"):
        line = line.strip()
        if line.startswith("event:"):
            current_event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            raw = line[len("data:"):].strip()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = raw
            events.append({"event": current_event, "data": data})
            current_event = None
        elif line == "":
            continue
    return events


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _mock_auth():
    """Bypass JWT auth for all tests in this module."""
    mock_user = {"id": 1, "username": "admin", "role": "admin"}
    with patch("src.api.routes.chat.get_current_user", return_value=mock_user):
        yield


class TestChatFAQPath:
    """Test the FAQ fast-answer path (no RAG fallthrough)."""

    @patch("src.api.routes.chat.get_llm")
    @patch("src.api.routes.chat.faq_generate")
    @patch("src.api.routes.chat.try_faq_match")
    @patch("src.api.routes.chat._ds")
    def test_faq_hit_returns_answer_and_done(
        self, mock_ds, mock_try_faq, mock_faq_gen, mock_get_llm, client
    ):
        # Setup mocks
        mock_ds.get_setting.return_value = "test_kb"
        mock_ds.get_kb.return_value = {"name": "test_kb"}

        mock_try_faq.return_value = [
            {"question": "Q?", "answer": "A.", "score": 0.88, "faq_id": 1}
        ]
        mock_faq_gen.return_value = "FAQ Answer text"

        # Mock suggestion LLM
        mock_sug_llm = MagicMock()
        mock_sug_resp = MagicMock()
        mock_sug_resp.content = "建议问题1\n建议问题2"
        mock_sug_llm.invoke.return_value = mock_sug_resp
        mock_get_llm.return_value = mock_sug_llm

        response = client.post(
            "/api/chat",
            json={"query": "开题什么时候", "history": []},
            headers=_auth_headers(),
        )
        assert response.status_code == 200

        events = _parse_sse(response)
        event_types = [e["event"] for e in events]

        assert "status" in event_types
        assert "token" in event_types
        assert "answer" in event_types
        assert "sources" in event_types
        assert "done" in event_types

        answer_event = next(e for e in events if e["event"] == "answer")
        assert answer_event["data"]["text"] == "FAQ Answer text"

    @patch("src.api.routes.chat.build_orchestrator")
    @patch("src.api.routes.chat.faq_generate")
    @patch("src.api.routes.chat.try_faq_match")
    @patch("src.api.routes.chat._ds")
    def test_faq_fallback_to_rag(
        self, mock_ds, mock_try_faq, mock_faq_gen, mock_build, client
    ):
        mock_ds.get_setting.return_value = "test_kb"
        mock_ds.get_kb.return_value = {"name": "test_kb"}

        mock_try_faq.return_value = [{"question": "Q", "answer": "A", "score": 0.8, "faq_id": 1}]
        mock_faq_gen.return_value = None  # FALLBACK

        # Mock orchestrator stream
        mock_orch = MagicMock()
        mock_orch.stream.return_value = iter([
            {"type": "agent_action", "tool": "意图分析", "input": "分析中"},
            {"type": "token", "content": "RAG "},
            {"type": "token", "content": "Answer"},
            {"type": "sources", "nodes": []},
            {"type": "suggestions", "items": ["Follow up?"]},
        ])
        mock_build.return_value = mock_orch

        response = client.post(
            "/api/chat",
            json={"query": "复杂问题", "history": []},
            headers=_auth_headers(),
        )
        events = _parse_sse(response)
        event_types = [e["event"] for e in events]

        assert "agent_action" in event_types
        assert "token" in event_types
        assert "answer" in event_types
        assert "done" in event_types

        answer = next(e for e in events if e["event"] == "answer")
        assert answer["data"]["text"] == "RAG Answer"
```

- [ ] **Step 2: Write RAG path and error handling tests**

Append to `tests/api/test_chat_sse.py`:

```python
class TestChatRAGPath:
    """Test the RAG agent path (no FAQ match)."""

    @patch("src.api.routes.chat.build_orchestrator")
    @patch("src.api.routes.chat.try_faq_match")
    @patch("src.api.routes.chat._ds")
    def test_no_faq_goes_straight_to_rag(
        self, mock_ds, mock_try_faq, mock_build, client
    ):
        mock_ds.get_setting.return_value = "test_kb"
        mock_ds.get_kb.return_value = {"name": "test_kb"}
        mock_try_faq.return_value = None  # No FAQ match

        mock_orch = MagicMock()
        mock_orch.stream.return_value = iter([
            {"type": "token", "content": "Direct answer"},
            {"type": "sources", "nodes": [
                {"node_id": "n1", "text": "chunk", "source_file": "doc.pdf", "score": 0.9}
            ]},
        ])
        mock_build.return_value = mock_orch

        response = client.post(
            "/api/chat",
            json={"query": "What is X?", "history": []},
            headers=_auth_headers(),
        )
        events = _parse_sse(response)

        sources_event = next(e for e in events if e["event"] == "sources")
        assert len(sources_event["data"]["sources"]) == 1
        assert sources_event["data"]["sources"][0]["node_id"] == "n1"

    @patch("src.api.routes.chat.build_orchestrator")
    @patch("src.api.routes.chat.try_faq_match")
    @patch("src.api.routes.chat._ds")
    def test_file_event_cleans_markdown_links(
        self, mock_ds, mock_try_faq, mock_build, client
    ):
        mock_ds.get_setting.return_value = "test_kb"
        mock_ds.get_kb.return_value = {"name": "test_kb"}
        mock_try_faq.return_value = None

        mock_orch = MagicMock()
        mock_orch.stream.return_value = iter([
            {"type": "token", "content": "下载 [报告](http://x.com/report.pdf) 文件"},
            {"type": "file", "file_name": "report.pdf", "url": "/dl/report.pdf", "size_kb": 512},
            {"type": "sources", "nodes": []},
        ])
        mock_build.return_value = mock_orch

        response = client.post(
            "/api/chat",
            json={"query": "下载报告", "history": []},
            headers=_auth_headers(),
        )
        events = _parse_sse(response)
        answer = next(e for e in events if e["event"] == "answer")
        # Markdown link [报告](url) should be cleaned to just 报告
        assert "[报告]" not in answer["data"]["text"]
        assert "报告" in answer["data"]["text"]


class TestChatErrorHandling:
    @patch("src.api.routes.chat._ds")
    def test_no_kb_configured_returns_403(self, mock_ds, client):
        mock_ds.get_setting.return_value = None
        response = client.post(
            "/api/chat",
            json={"query": "test", "history": []},
            headers=_auth_headers(),
        )
        assert response.status_code == 403

    @patch("src.api.routes.chat._ds")
    def test_kb_not_found_returns_404(self, mock_ds, client):
        mock_ds.get_setting.return_value = "missing_kb"
        mock_ds.get_kb.return_value = None
        response = client.post(
            "/api/chat",
            json={"query": "test", "history": []},
            headers=_auth_headers(),
        )
        assert response.status_code == 404

    @patch("src.api.routes.chat.build_orchestrator")
    @patch("src.api.routes.chat.try_faq_match")
    @patch("src.api.routes.chat._ds")
    def test_orchestrator_error_yields_error_event(
        self, mock_ds, mock_try_faq, mock_build, client
    ):
        mock_ds.get_setting.return_value = "test_kb"
        mock_ds.get_kb.return_value = {"name": "test_kb"}
        mock_try_faq.return_value = None

        mock_orch = MagicMock()
        mock_orch.stream.return_value = iter([
            {"type": "error", "message": "Something broke"},
        ])
        mock_build.return_value = mock_orch

        response = client.post(
            "/api/chat",
            json={"query": "test", "history": []},
            headers=_auth_headers(),
        )
        events = _parse_sse(response)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) >= 1
```

- [ ] **Step 3: Run chat SSE tests**

Run:
```bash
poetry run pytest tests/api/test_chat_sse.py -v
```

Expected: all passed (~7 tests).

- [ ] **Step 4: Run the full test suite**

Run:
```bash
poetry run pytest -v
```

Expected: all tests pass (~80+ tests total across all files).

- [ ] **Step 5: Commit**

```bash
git add tests/api/test_chat_sse.py
git commit -m "test: add chat SSE event sequence tests (FAQ path, RAG path, error handling)"
```

---

## Running Tests

```bash
# All tests
poetry run pytest -v

# Only storage integration tests (requires Docker MySQL)
poetry run pytest tests/storage/ -v -m integration

# Only unit tests (no external deps)
poetry run pytest tests/core/ tests/api/ -v

# Specific file
poetry run pytest tests/core/test_safety_guards.py -v
```
