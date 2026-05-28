# Phase 3: Storage Layer Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 482-line `DocumentStore` "God class" into 6 focused specialized stores, then make `DocumentStore` a backward-compatible multiple-inheritance facade so zero importers need to change.

**Architecture:** Extract each logical group of methods (Settings, KB, Doc, FAQ, Conversation+Message+Feedback, Ticket) into its own module under `src/storage/`. Each new class is a standalone store with no inheritance. `DocumentStore` is then reduced to a single-class that inherits from all six, preserving every existing call site without change. The 119 existing tests act as the regression net — all must still pass after every task.

**Tech Stack:** Python 3.11, PyMySQL + DBUtils PooledDB, pytest 8.2 + pytest-asyncio, Docker MySQL 8.0 (`rag_db_test` schema in tests)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/storage/settings_store.py` | `get_setting`, `set_setting`, `delete_setting` |
| Create | `src/storage/kb_store.py` | `create_kb`, `list_kbs`, `get_kb`, `delete_kb` |
| Create | `src/storage/doc_store.py` | `add_document`, `update_document`, `update_document_summary`, `list_documents`, `delete_document`, `get_document` |
| Create | `src/storage/faq_store.py` | `add_faq`, `list_faqs`, `get_faq`, `update_faq`, `delete_faq` |
| Create | `src/storage/conversation_store.py` | `create_conversation`, `list_conversations`, `get_conversation`, `update_conversation_title`, `delete_conversation`, `add_message`, `list_messages`, `_parse_message_row`, `get_message_feedback`, `set_message_feedback` |
| Create | `src/storage/ticket_store.py` | `create_qa_request`, `update_qa_request`, `list_qa_requests`, `get_qa_request` |
| Modify | `src/storage/document_store.py` | Stripped to facade: `class DocumentStore(KBStore, DocStore, FAQStore, ConversationStore, TicketStore, SettingsStore): pass` |
| Create | `tests/storage/test_store_split.py` | Integration tests verifying each specialized store works independently |

---

### Task 1: Create `SettingsStore`

**Files:**
- Create: `src/storage/settings_store.py`
- Create: `tests/storage/test_store_split.py` (first test block only)

- [ ] **Step 1: Write the failing test**

```python
# tests/storage/test_store_split.py
"""Integration tests verifying each specialized store works independently."""

import pytest
from src.storage.settings_store import SettingsStore


class TestSettingsStore:
    def test_set_and_get_setting(self):
        s = SettingsStore()
        s.set_setting("_test_key", "hello")
        assert s.get_setting("_test_key") == "hello"

    def test_get_missing_setting_returns_none(self):
        s = SettingsStore()
        assert s.get_setting("__nonexistent__") is None

    def test_delete_setting(self):
        s = SettingsStore()
        s.set_setting("_del_key", "val")
        s.delete_setting("_del_key")
        assert s.get_setting("_del_key") is None
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/gefeng/projects/rag1.0
poetry run pytest tests/storage/test_store_split.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.storage.settings_store'`

- [ ] **Step 3: Create `src/storage/settings_store.py`**

```python
"""系统设置存储（system_settings 表）。"""

import logging

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class SettingsStore:
    """系统键值对设置的 MySQL CRUD。"""

    def get_setting(self, key: str) -> str | None:
        """读取系统设置值。

        Args:
            key: 设置键名。

        Returns:
            设置值字符串，键不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT value FROM system_settings WHERE `key` = %s", (key,))
            row = cur.fetchone()
            return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        """写入或更新系统设置值（upsert）。

        Args:
            key: 设置键名。
            value: 设置值。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO system_settings (`key`, value) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE value = VALUES(value)",
                (key, value),
            )
            conn.commit()

    def delete_setting(self, key: str) -> None:
        """删除系统设置项。

        Args:
            key: 设置键名。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM system_settings WHERE `key` = %s", (key,))
            conn.commit()
```

- [ ] **Step 4: Run to verify it passes**

```bash
poetry run pytest tests/storage/test_store_split.py::TestSettingsStore -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/storage/settings_store.py tests/storage/test_store_split.py
git commit -m "refactor(storage): extract SettingsStore to settings_store.py"
```

---

### Task 2: Create `KBStore`

**Files:**
- Create: `src/storage/kb_store.py`
- Modify: `tests/storage/test_store_split.py` (add TestKBStore block)

- [ ] **Step 1: Append the failing test to `tests/storage/test_store_split.py`**

Add below the existing `TestSettingsStore` class:

```python
from src.storage.kb_store import KBStore


class TestKBStore:
    def test_create_and_get_kb(self):
        store = KBStore()
        kb = store.create_kb("_split_test_kb", "test desc")
        assert kb["name"] == "_split_test_kb"
        assert kb["description"] == "test desc"
        fetched = store.get_kb("_split_test_kb")
        assert fetched is not None
        store.delete_kb("_split_test_kb")

    def test_list_kbs_includes_new(self):
        store = KBStore()
        store.create_kb("_split_list_kb")
        names = [kb["name"] for kb in store.list_kbs()]
        assert "_split_list_kb" in names
        store.delete_kb("_split_list_kb")

    def test_get_nonexistent_kb_returns_none(self):
        store = KBStore()
        assert store.get_kb("__no_such_kb__") is None

    def test_delete_kb(self):
        store = KBStore()
        store.create_kb("_split_del_kb")
        store.delete_kb("_split_del_kb")
        assert store.get_kb("_split_del_kb") is None
```

- [ ] **Step 2: Run to verify it fails**

```bash
poetry run pytest tests/storage/test_store_split.py::TestKBStore -v
```

Expected: `ModuleNotFoundError: No module named 'src.storage.kb_store'`

- [ ] **Step 3: Create `src/storage/kb_store.py`**

```python
"""知识库元数据存储（knowledge_bases 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class KBStore:
    """知识库 MySQL CRUD。"""

    def create_kb(self, name: str, description: str = "") -> dict:
        """创建知识库。

        Args:
            name: 知识库唯一名称。
            description: 可选描述。

        Returns:
            新建的知识库行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                "INSERT INTO knowledge_bases (name, description, created_at) VALUES (%s, %s, %s)",
                (name, description, now),
            )
            conn.commit()
            cur.execute("SELECT * FROM knowledge_bases WHERE name = %s", (name,))
            return cur.fetchone()

    def list_kbs(self) -> list[dict]:
        """列出所有知识库，含文档数统计。

        Returns:
            按创建时间降序的知识库列表。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT kb.*, COUNT(d.id) as doc_count
                FROM knowledge_bases kb
                LEFT JOIN documents d ON kb.name = d.kb_name
                GROUP BY kb.id
                ORDER BY kb.created_at DESC
                """
            )
            return cur.fetchall()

    def get_kb(self, name: str) -> dict | None:
        """按名称查询知识库。

        Args:
            name: 知识库名称。

        Returns:
            知识库行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM knowledge_bases WHERE name = %s", (name,))
            return cur.fetchone()

    def delete_kb(self, name: str) -> None:
        """删除知识库及其所有文档记录。

        Args:
            name: 知识库名称。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE kb_name = %s", (name,))
            cur.execute("DELETE FROM knowledge_bases WHERE name = %s", (name,))
            conn.commit()
```

- [ ] **Step 4: Run to verify it passes**

```bash
poetry run pytest tests/storage/test_store_split.py::TestKBStore -v
```

Expected: `4 passed`

- [ ] **Step 5: Run the full existing test suite to confirm nothing broke**

```bash
poetry run pytest tests/ -q --tb=short
```

Expected: `119 passed`

- [ ] **Step 6: Commit**

```bash
git add src/storage/kb_store.py tests/storage/test_store_split.py
git commit -m "refactor(storage): extract KBStore to kb_store.py"
```

---

### Task 3: Create `DocStore`

**Files:**
- Create: `src/storage/doc_store.py`
- Modify: `tests/storage/test_store_split.py` (add TestDocStore block)

- [ ] **Step 1: Append the failing test to `tests/storage/test_store_split.py`**

```python
from src.storage.doc_store import DocStore


class TestDocStore:
    def test_add_and_get_document(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_doc_split_kb")
        store = DocStore()
        doc = store.add_document("_doc_split_kb", "test.txt", file_size=100)
        assert doc["file_name"] == "test.txt"
        fetched = store.get_document(doc["id"])
        assert fetched["id"] == doc["id"]
        KBStore().delete_kb("_doc_split_kb")

    def test_list_documents(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_doc_list_kb")
        store = DocStore()
        store.add_document("_doc_list_kb", "a.txt")
        store.add_document("_doc_list_kb", "b.txt")
        docs = store.list_documents("_doc_list_kb")
        names = [d["file_name"] for d in docs]
        assert "a.txt" in names and "b.txt" in names
        KBStore().delete_kb("_doc_list_kb")

    def test_update_document_summary(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_doc_upd_kb")
        store = DocStore()
        doc = store.add_document("_doc_upd_kb", "upd.txt")
        ok = store.update_document_summary(doc["id"], "new summary")
        assert ok is True
        fetched = store.get_document(doc["id"])
        assert fetched["summary"] == "new summary"
        KBStore().delete_kb("_doc_upd_kb")

    def test_delete_document(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_doc_del_kb")
        store = DocStore()
        doc = store.add_document("_doc_del_kb", "del.txt")
        deleted = store.delete_document(doc["id"])
        assert deleted["id"] == doc["id"]
        assert store.get_document(doc["id"]) is None
        KBStore().delete_kb("_doc_del_kb")
```

- [ ] **Step 2: Run to verify it fails**

```bash
poetry run pytest tests/storage/test_store_split.py::TestDocStore -v
```

Expected: `ModuleNotFoundError: No module named 'src.storage.doc_store'`

- [ ] **Step 3: Create `src/storage/doc_store.py`**

```python
"""文档元数据存储（documents 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class DocStore:
    """文档 MySQL CRUD。"""

    def add_document(
        self,
        kb_name: str,
        file_name: str,
        file_size: int = 0,
        chunk_count: int = 0,
        chunk_size: int = 256,
        chunk_overlap_ratio: float = 0.1,
        doc_type: str = "plain_text",
        splitter_type: str = "recursive",
        status: str = "completed",
        summary: str | None = None,
        content: str | None = None,
    ) -> dict:
        """插入文档记录。

        Args:
            kb_name: 所属知识库名称。
            file_name: 文件名。
            file_size: 文件字节大小。
            chunk_count: 分块数量。
            chunk_size: 分块大小（token）。
            chunk_overlap_ratio: 重叠比率。
            doc_type: 文档类型（plain_text/policy/form 等）。
            splitter_type: 切分策略。
            status: 索引状态。
            summary: 文档摘要。
            content: 清洗后原始文本。

        Returns:
            新插入的文档行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO documents
                   (kb_name, file_name, file_size, chunk_count, chunk_size, chunk_overlap_ratio,
                    doc_type, splitter_type, status, summary, content, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    kb_name,
                    file_name,
                    file_size,
                    chunk_count,
                    chunk_size,
                    chunk_overlap_ratio,
                    doc_type,
                    splitter_type,
                    status,
                    summary,
                    content,
                    now,
                ),
            )
            conn.commit()
            cur.execute("SELECT * FROM documents WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def update_document(self, doc_id: int, **kwargs) -> bool:
        """批量更新文档字段（仅白名单字段）。

        Args:
            doc_id: 文档 ID。
            **kwargs: 待更新的字段与值。

        Returns:
            是否更新了至少一行。
        """
        allowed = {
            "summary",
            "content",
            "chunk_count",
            "status",
            "chunk_size",
            "chunk_overlap_ratio",
            "splitter_type",
            "chunks_preview",
        }
        updates = []
        params = []
        for k, v in kwargs.items():
            if k in allowed:
                updates.append(f"{k} = %s")
                params.append(v)

        if not updates:
            return False

        params.append(doc_id)
        sql = f"UPDATE documents SET {', '.join(updates)} WHERE id = %s"

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return cur.rowcount > 0

    def update_document_summary(self, doc_id: int, summary: str) -> bool:
        """更新文档摘要。

        Args:
            doc_id: 文档 ID。
            summary: 新摘要文本。

        Returns:
            是否更新了至少一行。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE documents SET summary = %s WHERE id = %s",
                (summary, doc_id),
            )
            conn.commit()
            return cur.rowcount > 0

    def list_documents(self, kb_name: str) -> list[dict]:
        """列出知识库下所有文档（按创建时间降序）。

        Args:
            kb_name: 知识库名称。

        Returns:
            文档列表。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM documents WHERE kb_name = %s ORDER BY created_at DESC",
                (kb_name,),
            )
            return cur.fetchall()

    def delete_document(self, doc_id: int) -> dict | None:
        """删除文档，返回删除前的行数据。

        Args:
            doc_id: 文档 ID。

        Returns:
            被删除的文档行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
            row = cur.fetchone()
            if row:
                cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
                conn.commit()
            return row

    def get_document(self, doc_id: int) -> dict | None:
        """按 ID 查询文档。

        Args:
            doc_id: 文档 ID。

        Returns:
            文档行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
            return cur.fetchone()
```

- [ ] **Step 4: Run to verify it passes**

```bash
poetry run pytest tests/storage/test_store_split.py::TestDocStore -v
```

Expected: `4 passed`

- [ ] **Step 5: Confirm full suite still passes**

```bash
poetry run pytest tests/ -q --tb=short
```

Expected: `119 passed` (plus the new store split tests)

- [ ] **Step 6: Commit**

```bash
git add src/storage/doc_store.py tests/storage/test_store_split.py
git commit -m "refactor(storage): extract DocStore to doc_store.py"
```

---

### Task 4: Create `FAQStore`

**Files:**
- Create: `src/storage/faq_store.py`
- Modify: `tests/storage/test_store_split.py` (add TestFAQStore block)

- [ ] **Step 1: Append the failing test**

```python
from src.storage.faq_store import FAQStore


class TestFAQStore:
    def test_add_and_get_faq(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_faq_split_kb")
        store = FAQStore()
        faq = store.add_faq("_faq_split_kb", "Q?", "A.")
        assert faq["question"] == "Q?"
        fetched = store.get_faq(faq["id"])
        assert fetched["answer"] == "A."
        KBStore().delete_kb("_faq_split_kb")

    def test_list_faqs(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_faq_list_kb")
        store = FAQStore()
        store.add_faq("_faq_list_kb", "Q1?", "A1.")
        store.add_faq("_faq_list_kb", "Q2?", "A2.")
        faqs = store.list_faqs("_faq_list_kb")
        assert len(faqs) == 2
        KBStore().delete_kb("_faq_list_kb")

    def test_update_faq(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_faq_upd_kb")
        store = FAQStore()
        faq = store.add_faq("_faq_upd_kb", "Q?", "A.")
        updated = store.update_faq(faq["id"], answer="New A.")
        assert updated["answer"] == "New A."
        KBStore().delete_kb("_faq_upd_kb")

    def test_delete_faq(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_faq_del_kb")
        store = FAQStore()
        faq = store.add_faq("_faq_del_kb", "Q?", "A.")
        deleted = store.delete_faq(faq["id"])
        assert deleted["id"] == faq["id"]
        assert store.get_faq(faq["id"]) is None
        KBStore().delete_kb("_faq_del_kb")
```

- [ ] **Step 2: Run to verify it fails**

```bash
poetry run pytest tests/storage/test_store_split.py::TestFAQStore -v
```

Expected: `ModuleNotFoundError: No module named 'src.storage.faq_store'`

- [ ] **Step 3: Create `src/storage/faq_store.py`**

```python
"""FAQ 存储（faqs 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class FAQStore:
    """FAQ MySQL CRUD。"""

    def add_faq(
        self,
        kb_name: str,
        question: str,
        answer: str,
        category: str = "",
        sort_order: int = 0,
        vector_id: str | None = None,
        author_id: int | None = None,
        status: str = "approved",
    ) -> dict:
        """新增 FAQ 条目。

        Args:
            kb_name: 所属知识库名称。
            question: 问题文本。
            answer: 答案文本。
            category: 分类标签。
            sort_order: 排序权重（越小越靠前）。
            vector_id: Qdrant 向量点 ID。
            author_id: 创建人用户 ID。
            status: 审核状态（approved/pending）。

        Returns:
            新插入的 FAQ 行 dict。
        """
        with get_conn() as conn:
            with conn.cursor() as cur:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(
                    """INSERT INTO faqs
                       (kb_name, question, answer, category, sort_order, enabled, vector_id, author_id, status, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, 1, %s, %s, %s, %s, %s)""",
                    (
                        kb_name,
                        question,
                        answer,
                        category,
                        sort_order,
                        vector_id,
                        author_id,
                        status,
                        now,
                        now,
                    ),
                )
                conn.commit()
                cur.execute("SELECT * FROM faqs WHERE id = %s", (cur.lastrowid,))
                return cur.fetchone()

    def list_faqs(
        self, kb_name: str, enabled_only: bool = False, status: str | None = None
    ) -> list[dict]:
        """列出知识库下的 FAQ 列表。

        Args:
            kb_name: 知识库名称。
            enabled_only: 仅返回已启用（enabled=1）的条目。
            status: 过滤指定审核状态。

        Returns:
            FAQ 列表，按 sort_order ASC, id ASC 排序。
        """
        sql = "SELECT * FROM faqs WHERE kb_name = %s"
        params: list = [kb_name]
        if enabled_only:
            sql += " AND enabled = 1"
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY sort_order ASC, id ASC"
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def get_faq(self, faq_id: int) -> dict | None:
        """按 ID 查询 FAQ。

        Args:
            faq_id: FAQ ID。

        Returns:
            FAQ 行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            return cur.fetchone()

    def update_faq(self, faq_id: int, **kwargs) -> dict | None:
        """更新 FAQ 字段（仅白名单字段）。

        Args:
            faq_id: FAQ ID。
            **kwargs: 待更新的字段与值。

        Returns:
            更新后的 FAQ 行 dict，ID 不存在时返回 None。
        """
        allowed = {
            "question",
            "answer",
            "category",
            "sort_order",
            "enabled",
            "vector_id",
            "status",
            "author_id",
        }
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_faq(faq_id)
        updates["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [faq_id]
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE faqs SET {set_clause} WHERE id = %s", values)
            conn.commit()
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            return cur.fetchone()

    def delete_faq(self, faq_id: int) -> dict | None:
        """删除 FAQ，返回删除前的行数据。

        Args:
            faq_id: FAQ ID。

        Returns:
            被删除的 FAQ 行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            row = cur.fetchone()
            if row:
                cur.execute("DELETE FROM faqs WHERE id = %s", (faq_id,))
                conn.commit()
            return row
```

- [ ] **Step 4: Run to verify it passes**

```bash
poetry run pytest tests/storage/test_store_split.py::TestFAQStore -v
```

Expected: `4 passed`

- [ ] **Step 5: Confirm full suite still passes**

```bash
poetry run pytest tests/ -q --tb=short
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/storage/faq_store.py tests/storage/test_store_split.py
git commit -m "refactor(storage): extract FAQStore to faq_store.py"
```

---

### Task 5: Create `ConversationStore`

**Files:**
- Create: `src/storage/conversation_store.py`
- Modify: `tests/storage/test_store_split.py` (add TestConversationStore block)

- [ ] **Step 1: Append the failing test**

```python
from src.storage.conversation_store import ConversationStore


class TestConversationStore:
    def test_create_and_get_conversation(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_conv_split_kb")
        store = ConversationStore()
        conv = store.create_conversation("_conv_split_kb", "Test Conv")
        assert conv["title"] == "Test Conv"
        fetched = store.get_conversation(conv["id"])
        assert fetched["id"] == conv["id"]
        store.delete_conversation(conv["id"])
        KBStore().delete_kb("_conv_split_kb")

    def test_add_and_list_messages(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_msg_split_kb")
        store = ConversationStore()
        conv = store.create_conversation("_msg_split_kb")
        store.add_message(conv["id"], "user", "hello")
        store.add_message(conv["id"], "assistant", "hi there")
        msgs = store.list_messages(conv["id"])
        assert len(msgs) == 2
        assert msgs[0]["role"] == "user"
        store.delete_conversation(conv["id"])
        KBStore().delete_kb("_msg_split_kb")

    def test_set_and_get_message_feedback(self):
        from src.storage.kb_store import KBStore
        KBStore().create_kb("_fb_split_kb")
        store = ConversationStore()
        conv = store.create_conversation("_fb_split_kb")
        msg = store.add_message(conv["id"], "assistant", "answer")
        store.set_message_feedback(msg["id"], "up")
        fb = store.get_message_feedback(msg["id"])
        assert fb["rating"] == "up"
        store.delete_conversation(conv["id"])
        KBStore().delete_kb("_fb_split_kb")
```

- [ ] **Step 2: Run to verify it fails**

```bash
poetry run pytest tests/storage/test_store_split.py::TestConversationStore -v
```

Expected: `ModuleNotFoundError: No module named 'src.storage.conversation_store'`

- [ ] **Step 3: Create `src/storage/conversation_store.py`**

```python
"""对话、消息及反馈存储（conversations / conversation_messages / message_feedback 表）。"""

import json
import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class ConversationStore:
    """对话/消息/反馈 MySQL CRUD。"""

    # ── 对话 ──────────────────────────────────────────────────

    def create_conversation(
        self, kb_name: str, title: str = "新对话", user_id: int | None = None
    ) -> dict:
        """创建对话。

        Args:
            kb_name: 关联知识库名称。
            title: 对话标题。
            user_id: 创建人用户 ID。

        Returns:
            新建的对话行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO conversations (kb_name, user_id, title, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s)""",
                (kb_name, user_id, title, now, now),
            )
            conn.commit()
            cur.execute("SELECT * FROM conversations WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def list_conversations(
        self,
        kb_name: str | None = None,
        user_id: int | None = None,
        limit: int = 30,
        cursor_id: int | None = None,
        cursor_updated_at: str | None = None,
    ) -> dict:
        """分页列出对话（游标分页）。

        Args:
            kb_name: 按知识库过滤。
            user_id: 按用户过滤。
            limit: 每页条数。
            cursor_id: 上一页最后一条 ID（用于游标分页）。
            cursor_updated_at: 上一页最后一条的 updated_at。

        Returns:
            {'items': [...], 'has_more': bool, 'next_cursor': dict | None}
        """
        sql = "SELECT * FROM conversations WHERE 1=1"
        params: list = []
        if kb_name:
            sql += " AND kb_name = %s"
            params.append(kb_name)
        if user_id is not None:
            sql += " AND user_id = %s"
            params.append(user_id)
        if cursor_id is not None and cursor_updated_at is not None:
            sql += " AND (updated_at < %s OR (updated_at = %s AND id < %s))"
            params.extend([cursor_updated_at, cursor_updated_at, cursor_id])
        sql += " ORDER BY updated_at DESC, id DESC LIMIT %s"
        params.append(limit + 1)

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

        has_more = len(rows) > limit
        items = rows[:limit]
        next_cursor: dict | None = None
        if has_more and items:
            last = items[-1]
            updated_at = last["updated_at"]
            if isinstance(updated_at, datetime):
                updated_at = updated_at.strftime("%Y-%m-%d %H:%M:%S")
            next_cursor = {"id": last["id"], "updated_at": str(updated_at)}
        return {"items": items, "has_more": has_more, "next_cursor": next_cursor}

    def get_conversation(self, conv_id: int) -> dict | None:
        """按 ID 查询对话。

        Args:
            conv_id: 对话 ID。

        Returns:
            对话行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
            return cur.fetchone()

    def update_conversation_title(self, conv_id: int, title: str) -> dict | None:
        """更新对话标题。

        Args:
            conv_id: 对话 ID。
            title: 新标题。

        Returns:
            更新后的对话行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                "UPDATE conversations SET title = %s, updated_at = %s WHERE id = %s",
                (title, now, conv_id),
            )
            conn.commit()
            cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
            return cur.fetchone()

    def delete_conversation(self, conv_id: int) -> None:
        """删除对话（MySQL FK CASCADE 自动删除消息和反馈）。

        Args:
            conv_id: 对话 ID。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM conversations WHERE id = %s", (conv_id,))
            conn.commit()

    # ── 消息 ──────────────────────────────────────────────────

    def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        sources_json: str | None = None,
        files_json: str | None = None,
    ) -> dict:
        """插入消息并更新对话的 updated_at。

        Args:
            conversation_id: 对话 ID。
            role: 发送角色（user/assistant）。
            content: 消息内容。
            sources_json: 引用来源的 JSON 字符串。
            files_json: 文件卡片的 JSON 字符串。

        Returns:
            新建的消息行 dict（sources/files 已反序列化为 list）。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO conversation_messages
                   (conversation_id, role, content, sources, files, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (conversation_id, role, content, sources_json, files_json, now),
            )
            msg_id = cur.lastrowid
            cur.execute(
                "UPDATE conversations SET updated_at = %s WHERE id = %s",
                (now, conversation_id),
            )
            conn.commit()
            cur.execute("SELECT * FROM conversation_messages WHERE id = %s", (msg_id,))
            return self._parse_message_row(cur.fetchone())

    def list_messages(self, conversation_id: int) -> list[dict]:
        """列出对话的所有消息（按 id ASC）。

        Args:
            conversation_id: 对话 ID。

        Returns:
            消息列表（sources/files 已反序列化）。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM conversation_messages WHERE conversation_id = %s ORDER BY id ASC",
                (conversation_id,),
            )
            return [self._parse_message_row(r) for r in cur.fetchall()]

    @staticmethod
    def _parse_message_row(row: dict) -> dict:
        """将 sources/files 字段从 JSON 字符串反序列化为 list。

        pymysql DictCursor 返回 dict；MySQL JSON 列可能返回 str 或已解析的对象。
        """
        if row is None:
            return {}
        msg = dict(row)
        for field in ("sources", "files"):
            raw = msg.get(field)
            if raw is None:
                continue
            if isinstance(raw, (list, dict)):
                continue
            try:
                msg[field] = json.loads(raw)
            except (ValueError, TypeError):
                logger.warning(
                    "[message] 无法解析 %s 字段（msg_id=%s）", field, msg.get("id")
                )
                msg[field] = None
        return msg

    # ── 反馈 ──────────────────────────────────────────────────

    def get_message_feedback(self, message_id: int) -> dict | None:
        """查询消息的评分反馈。

        Args:
            message_id: 消息 ID。

        Returns:
            反馈行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM message_feedback WHERE message_id = %s", (message_id,)
            )
            return cur.fetchone()

    def set_message_feedback(self, message_id: int, rating: str) -> dict:
        """设置或更新消息评分反馈（upsert）。

        Args:
            message_id: 消息 ID。
            rating: 评分（up/down）。

        Returns:
            更新后的反馈行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO message_feedback (message_id, rating, created_at)
                   VALUES (%s, %s, %s)
                   ON DUPLICATE KEY UPDATE rating = VALUES(rating), created_at = VALUES(created_at)""",
                (message_id, rating, now),
            )
            conn.commit()
            cur.execute(
                "SELECT * FROM message_feedback WHERE message_id = %s", (message_id,)
            )
            return cur.fetchone()
```

- [ ] **Step 4: Run to verify it passes**

```bash
poetry run pytest tests/storage/test_store_split.py::TestConversationStore -v
```

Expected: `3 passed`

- [ ] **Step 5: Confirm full suite still passes**

```bash
poetry run pytest tests/ -q --tb=short
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/storage/conversation_store.py tests/storage/test_store_split.py
git commit -m "refactor(storage): extract ConversationStore to conversation_store.py"
```

---

### Task 6: Create `TicketStore`

**Files:**
- Create: `src/storage/ticket_store.py`
- Modify: `tests/storage/test_store_split.py` (add TestTicketStore block)

- [ ] **Step 1: Append the failing test**

```python
from src.storage.ticket_store import TicketStore


class TestTicketStore:
    def test_create_and_get_qa_request(self):
        from src.storage.kb_store import KBStore
        from src.storage.conversation_store import ConversationStore
        from src.storage.user_store import UserStore

        KBStore().create_kb("_ticket_split_kb")
        user_store = UserStore()
        student = user_store.create_user("_stu_split", "hash", role="student")
        mentor = user_store.create_user("_men_split", "hash", role="teacher")
        conv = ConversationStore().create_conversation("_ticket_split_kb")
        msg = ConversationStore().add_message(conv["id"], "user", "q?")

        store = TicketStore()
        ticket = store.create_qa_request(
            student_id=student["id"],
            mentor_id=mentor["id"],
            conversation_id=conv["id"],
            message_id=msg["id"],
            question="q?",
        )
        assert ticket["question"] == "q?"
        fetched = store.get_qa_request(ticket["id"])
        assert fetched["id"] == ticket["id"]

        # cleanup
        ConversationStore().delete_conversation(conv["id"])
        user_store.delete_user(student["id"])
        user_store.delete_user(mentor["id"])
        KBStore().delete_kb("_ticket_split_kb")

    def test_list_and_update_qa_request(self):
        from src.storage.kb_store import KBStore
        from src.storage.conversation_store import ConversationStore
        from src.storage.user_store import UserStore

        KBStore().create_kb("_ticket_list_kb")
        user_store = UserStore()
        student = user_store.create_user("_stu2_split", "hash", role="student")
        mentor = user_store.create_user("_men2_split", "hash", role="teacher")
        conv = ConversationStore().create_conversation("_ticket_list_kb")
        msg = ConversationStore().add_message(conv["id"], "user", "q?")

        store = TicketStore()
        ticket = store.create_qa_request(
            student_id=student["id"],
            mentor_id=mentor["id"],
            conversation_id=conv["id"],
            message_id=msg["id"],
            question="q2?",
        )
        tickets = store.list_qa_requests(mentor_id=mentor["id"])
        assert any(t["id"] == ticket["id"] for t in tickets)

        updated = store.update_qa_request(ticket["id"], answer="A!", status="replied")
        assert updated["status"] == "replied"
        assert updated["answer"] == "A!"

        # cleanup
        ConversationStore().delete_conversation(conv["id"])
        user_store.delete_user(student["id"])
        user_store.delete_user(mentor["id"])
        KBStore().delete_kb("_ticket_list_kb")
```

- [ ] **Step 2: Run to verify it fails**

```bash
poetry run pytest tests/storage/test_store_split.py::TestTicketStore -v
```

Expected: `ModuleNotFoundError: No module named 'src.storage.ticket_store'`

- [ ] **Step 3: Create `src/storage/ticket_store.py`**

```python
"""导师答疑请求存储（qa_requests 表）。"""

import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class TicketStore:
    """导师答疑工单 MySQL CRUD。"""

    def create_qa_request(
        self,
        student_id: int,
        mentor_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        """创建答疑请求。

        Args:
            student_id: 学生用户 ID。
            mentor_id: 导师用户 ID。
            conversation_id: 关联对话 ID。
            message_id: 触发工单的消息 ID。
            question: 问题文本。

        Returns:
            新建的答疑请求行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO qa_requests (student_id, mentor_id, conversation_id, message_id, question)
                   VALUES (%s, %s, %s, %s, %s)""",
                (student_id, mentor_id, conversation_id, message_id, question),
            )
            conn.commit()
            cur.execute("SELECT * FROM qa_requests WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def update_qa_request(
        self, request_id: int, answer: str, status: str = "replied"
    ) -> dict | None:
        """更新答疑请求（填写回答）。

        Args:
            request_id: 工单 ID。
            answer: 导师回答文本。
            status: 新状态（replied/closed）。

        Returns:
            更新后的工单行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                "UPDATE qa_requests SET answer = %s, status = %s, replied_at = %s WHERE id = %s",
                (answer, status, now, request_id),
            )
            conn.commit()
            cur.execute("SELECT * FROM qa_requests WHERE id = %s", (request_id,))
            return cur.fetchone()

    def list_qa_requests(
        self,
        mentor_id: int | None = None,
        student_id: int | None = None,
        status: str | None = None,
    ) -> list[dict]:
        """列出答疑请求，支持多条件过滤。

        Args:
            mentor_id: 按导师过滤。
            student_id: 按学生过滤。
            status: 按状态过滤（pending/replied/closed）。

        Returns:
            工单列表（按创建时间降序）。
        """
        sql = "SELECT * FROM qa_requests WHERE 1=1"
        params: list = []
        if mentor_id:
            sql += " AND mentor_id = %s"
            params.append(mentor_id)
        if student_id:
            sql += " AND student_id = %s"
            params.append(student_id)
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def get_qa_request(self, request_id: int) -> dict | None:
        """按 ID 查询答疑请求。

        Args:
            request_id: 工单 ID。

        Returns:
            工单行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM qa_requests WHERE id = %s", (request_id,))
            return cur.fetchone()
```

- [ ] **Step 4: Run to verify it passes**

```bash
poetry run pytest tests/storage/test_store_split.py::TestTicketStore -v
```

Expected: `2 passed`

- [ ] **Step 5: Confirm full suite still passes**

```bash
poetry run pytest tests/ -q --tb=short
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/storage/ticket_store.py tests/storage/test_store_split.py
git commit -m "refactor(storage): extract TicketStore to ticket_store.py"
```

---

### Task 7: Refactor `DocumentStore` into Backward-Compatible Facade

This is the payoff task. Replace all 482 lines of `DocumentStore` with a 10-line facade that inherits from the 6 specialized stores. All 16 existing importers continue to work unchanged.

**Files:**
- Modify: `src/storage/document_store.py`

- [ ] **Step 1: Verify all 6 specialized stores are importable**

```bash
poetry run python -c "
from src.storage.settings_store import SettingsStore
from src.storage.kb_store import KBStore
from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
from src.storage.conversation_store import ConversationStore
from src.storage.ticket_store import TicketStore
print('All 6 stores OK')
"
```

Expected: `All 6 stores OK`

- [ ] **Step 2: Replace `src/storage/document_store.py` with the facade**

Replace the entire file content with:

```python
"""MySQL 文档元数据存储 — 向后兼容聚合门面。

所有方法已拆分到各专用模块：
  - src.storage.kb_store.KBStore
  - src.storage.doc_store.DocStore
  - src.storage.faq_store.FAQStore
  - src.storage.conversation_store.ConversationStore
  - src.storage.ticket_store.TicketStore
  - src.storage.settings_store.SettingsStore

本类保持多继承聚合，确保所有现有 `DocumentStore()` 调用无需修改。
"""

from src.storage.conversation_store import ConversationStore
from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.settings_store import SettingsStore
from src.storage.ticket_store import TicketStore

__all__ = ["DocumentStore"]


class DocumentStore(KBStore, DocStore, FAQStore, ConversationStore, TicketStore, SettingsStore):
    """向后兼容的存储聚合类。

    聚合 KBStore、DocStore、FAQStore、ConversationStore、TicketStore、SettingsStore
    的全部方法，现有代码无需修改即可继续使用。

    新代码应直接使用各专用 Store 类而非本类。
    """
```

- [ ] **Step 3: Run the complete test suite**

```bash
poetry run pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests (original 119 + new store split tests) passing. Zero failures.

If any test fails, the error will point to a method missing from one of the specialized stores. Compare the failing method name against `document_store.py`'s git history (`git diff HEAD~1 -- src/storage/document_store.py`) and add it to the correct store.

- [ ] **Step 4: Verify the facade from the REPL**

```bash
poetry run python -c "
from src.storage.document_store import DocumentStore
ds = DocumentStore()
methods = [m for m in dir(ds) if not m.startswith('__')]
print('method count:', len(methods))
required = ['create_kb', 'add_document', 'add_faq', 'get_setting', 'create_conversation', 'create_qa_request']
for m in required:
    assert hasattr(ds, m), f'MISSING: {m}'
print('All required methods present')
"
```

Expected:
```
method count: 32
All required methods present
```

- [ ] **Step 5: Run Ruff**

```bash
poetry run ruff check --fix src/storage/ && poetry run ruff format src/storage/
```

Expected: no errors (or only auto-fixed)

- [ ] **Step 6: Commit**

```bash
git add src/storage/document_store.py
git commit -m "refactor(storage): make DocumentStore a backward-compatible facade over 6 specialized stores"
```

---

## Verification

After all 7 tasks are complete:

```bash
# Full test suite
poetry run pytest tests/ -q --tb=short
# Expected: all tests passing, including the 16 new store-split tests

# Confirm imports from all 16 upstream files still resolve
poetry run python -c "
import importlib
mods = [
    'src.api.routes.chat',
    'src.api.routes.knowledge',
    'src.api.routes.faq',
    'src.api.routes.ticket',
    'src.api.routes.conversation',
    'src.api.routes.document',
    'src.api.routes.config',
    'src.core.faq_match',
    'src.core.tools',
    'src.core.indexing',
    'src.core.agent.factory',
    'src.core.agent.generator',
    'src.core.agent.document_linker',
    'src.core.agent.orchestrator',
    'src.config',
]
for m in mods:
    importlib.import_module(m)
    print(f'OK: {m}')
print('All imports resolved')
"
```
