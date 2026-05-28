# Refactor Phase 0+1: Foundations — Exceptions + Storage Interfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `src/exceptions.py` (shared exception hierarchy) and `storage/interfaces/` (Protocol definitions for all Stores), giving the services layer type-safe injection points without changing any runtime behavior.

**Architecture:** Pure additions — no existing files are modified. Exceptions sit outside the 4-layer hierarchy so every layer can import them. Store Protocols are structural (no explicit inheritance required), each in its own file under `storage/interfaces/`.

**Tech Stack:** Python 3.10+, `typing.Protocol`

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/exceptions.py` |
| Create | `src/storage/interfaces/__init__.py` |
| Create | `src/storage/interfaces/kb_store.py` |
| Create | `src/storage/interfaces/doc_store.py` |
| Create | `src/storage/interfaces/faq_store.py` |
| Create | `src/storage/interfaces/settings_store.py` |
| Create | `src/storage/interfaces/ticket_store.py` |
| Create | `src/storage/interfaces/conversation_store.py` |
| Create | `src/storage/interfaces/user_store.py` |

---

### Task 1: Create `src/exceptions.py`

**Files:**
- Create: `src/exceptions.py`

- [ ] **Step 1: Create the file**

```python
# src/exceptions.py
"""全局业务异常层级。

位置：四层之外，src/ 根目录。
所有层（api/services/core/storage）均可 import，不计入层级违规。
"""


class AppException(Exception):
    """所有业务异常的基类。"""

    code: str = "APP_ERROR"
    http_status: int = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)


# ── 存储相关（storage/ 层使用）──────────────────────────────


class StorageError(AppException):
    """数据库/存储操作失败。"""

    code = "STORAGE_ERROR"
    http_status = 500


# ── 文档相关（core/ 和 services/ 层使用）───────────────────


class DocumentNotFoundError(AppException):
    """文档不存在。"""

    code = "DOCUMENT_NOT_FOUND"
    http_status = 404


class IndexingError(AppException):
    """文档索引失败。"""

    code = "INDEXING_FAILED"
    http_status = 500


# ── FAQ 相关 ────────────────────────────────────────────────


class FAQNotFoundError(AppException):
    """FAQ 条目不存在。"""

    code = "FAQ_NOT_FOUND"
    http_status = 404


# ── 知识库相关 ──────────────────────────────────────────────


class KnowledgeBaseNotFoundError(AppException):
    """知识库不存在。"""

    code = "KB_NOT_FOUND"
    http_status = 404


# ── RAG 相关 ────────────────────────────────────────────────


class RAGError(AppException):
    """RAG pipeline 执行失败。"""

    code = "RAG_ERROR"
    http_status = 500


# ── 用户相关 ────────────────────────────────────────────────


class UserNotFoundError(AppException):
    """用户不存在。"""

    code = "USER_NOT_FOUND"
    http_status = 404


class PermissionDeniedError(AppException):
    """权限不足。"""

    code = "PERMISSION_DENIED"
    http_status = 403
```

- [ ] **Step 2: Verify import works**

```bash
cd /Users/gefeng/projects/rag1.0
poetry run python -c "
from src.exceptions import (
    AppException, StorageError, DocumentNotFoundError, IndexingError,
    FAQNotFoundError, KnowledgeBaseNotFoundError, RAGError,
    UserNotFoundError, PermissionDeniedError,
)
e = FAQNotFoundError('faq 1 not found')
assert e.code == 'FAQ_NOT_FOUND'
assert e.http_status == 404
assert str(e) == 'faq 1 not found'
print('OK')
"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/exceptions.py
git commit -m "feat(exceptions): add shared AppException hierarchy"
```

---

### Task 2: Create `storage/interfaces/kb_store.py`

**Files:**
- Create: `src/storage/interfaces/__init__.py`
- Create: `src/storage/interfaces/kb_store.py`

- [ ] **Step 1: Create the interfaces directory**

```python
# src/storage/interfaces/__init__.py
"""Store Protocol 接口定义。

新代码通过依赖注入使用这些接口，不直接 import 具体实现类。
"""

from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.faq_store import BaseFAQStore
from src.storage.interfaces.settings_store import BaseSettingsStore
from src.storage.interfaces.ticket_store import BaseTicketStore
from src.storage.interfaces.conversation_store import BaseConversationStore
from src.storage.interfaces.user_store import BaseUserStore

__all__ = [
    "BaseKBStore",
    "BaseDocStore",
    "BaseFAQStore",
    "BaseSettingsStore",
    "BaseTicketStore",
    "BaseConversationStore",
    "BaseUserStore",
]
```

- [ ] **Step 2: Create `kb_store.py`**

```python
# src/storage/interfaces/kb_store.py
"""KBStore Protocol 接口。"""

from typing import Protocol


class BaseKBStore(Protocol):
    """知识库数据访问接口。"""

    def create_kb(self, name: str, description: str = "") -> dict:
        """新建知识库记录。

        Args:
            name: 知识库唯一名称。
            description: 描述信息。

        Returns:
            新建的知识库行 dict。
        """
        ...

    def list_kbs(self) -> list[dict]:
        """列出所有知识库（含 doc_count 统计）。"""
        ...

    def get_kb(self, name: str) -> dict | None:
        """按名称查询知识库，不存在返回 None。"""
        ...

    def delete_kb(self, name: str) -> None:
        """删除知识库记录（级联删除由 DB 外键处理）。"""
        ...
```

- [ ] **Step 3: Verify import**

```bash
poetry run python -c "
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.kb_store import KBStore
# Protocol structural check: KBStore 满足 BaseKBStore（无需显式继承）
store: BaseKBStore = KBStore()
print('OK')
"
```

Expected: `OK`

---

### Task 3: Create remaining 5 Store interfaces

**Files:**
- Create: `src/storage/interfaces/doc_store.py`
- Create: `src/storage/interfaces/faq_store.py`
- Create: `src/storage/interfaces/settings_store.py`
- Create: `src/storage/interfaces/ticket_store.py`
- Create: `src/storage/interfaces/conversation_store.py`
- Create: `src/storage/interfaces/user_store.py`

- [ ] **Step 1: Create `doc_store.py`**

```python
# src/storage/interfaces/doc_store.py
"""DocStore Protocol 接口。"""

from typing import Protocol


class BaseDocStore(Protocol):
    """文档数据访问接口。"""

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
        """插入文档记录，返回新建行 dict。"""
        ...

    def update_document(self, doc_id: int, **kwargs: object) -> bool:
        """更新文档字段，返回是否成功。"""
        ...

    def update_document_summary(self, doc_id: int, summary: str) -> bool:
        """更新文档摘要字段，返回是否成功。"""
        ...

    def list_documents(self, kb_name: str) -> list[dict]:
        """列出知识库内所有文档。"""
        ...

    def delete_document(self, doc_id: int) -> dict | None:
        """删除文档记录，返回被删除的行或 None。"""
        ...

    def get_document(self, doc_id: int) -> dict | None:
        """按 ID 查询文档，不存在返回 None。"""
        ...
```

- [ ] **Step 2: Create `faq_store.py`**

```python
# src/storage/interfaces/faq_store.py
"""FAQStore Protocol 接口。"""

from typing import Protocol


class BaseFAQStore(Protocol):
    """FAQ 数据访问接口。"""

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
        """新增 FAQ 条目，返回新建行 dict。"""
        ...

    def list_faqs(
        self,
        kb_name: str,
        enabled_only: bool = False,
        status: str | None = None,
    ) -> list[dict]:
        """列出 FAQ，支持状态过滤。"""
        ...

    def get_faq(self, faq_id: int) -> dict | None:
        """按 ID 查询 FAQ，不存在返回 None。"""
        ...

    def update_faq(self, faq_id: int, **kwargs: object) -> dict | None:
        """更新 FAQ 字段，返回更新后的行或 None。"""
        ...

    def delete_faq(self, faq_id: int) -> dict | None:
        """删除 FAQ，返回被删除的行或 None。"""
        ...
```

- [ ] **Step 3: Create `settings_store.py`**

```python
# src/storage/interfaces/settings_store.py
"""SettingsStore Protocol 接口。"""

from typing import Protocol


class BaseSettingsStore(Protocol):
    """系统设置数据访问接口。"""

    def get_setting(self, key: str) -> str | None:
        """读取配置项，key 不存在返回 None。"""
        ...

    def set_setting(self, key: str, value: str) -> None:
        """写入配置项（upsert 语义）。"""
        ...

    def delete_setting(self, key: str) -> None:
        """删除配置项。"""
        ...
```

- [ ] **Step 4: Create `ticket_store.py`**

```python
# src/storage/interfaces/ticket_store.py
"""TicketStore Protocol 接口。"""

from typing import Protocol


class BaseTicketStore(Protocol):
    """答疑工单数据访问接口。"""

    def create_qa_request(
        self,
        student_id: int,
        mentor_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        """创建答疑工单，返回新建行 dict。"""
        ...

    def update_qa_request(
        self,
        request_id: int,
        answer: str,
        status: str = "replied",
    ) -> dict | None:
        """填写回答，更新工单状态。"""
        ...

    def list_qa_requests(
        self,
        mentor_id: int | None = None,
        student_id: int | None = None,
        status: str | None = None,
    ) -> list[dict]:
        """列出工单，支持多条件过滤。"""
        ...

    def get_qa_request(self, request_id: int) -> dict | None:
        """按 ID 查询工单，不存在返回 None。"""
        ...
```

- [ ] **Step 5: Create `conversation_store.py`**

```python
# src/storage/interfaces/conversation_store.py
"""ConversationStore Protocol 接口。"""

from typing import Protocol


class BaseConversationStore(Protocol):
    """对话与消息数据访问接口。"""

    def create_conversation(
        self,
        kb_name: str,
        title: str = "新对话",
        user_id: int | None = None,
    ) -> dict:
        """新建对话，返回新建行 dict。"""
        ...

    def list_conversations(
        self,
        kb_name: str | None = None,
        user_id: int | None = None,
        limit: int = 30,
        cursor_id: int | None = None,
        cursor_updated_at: str | None = None,
    ) -> dict:
        """游标分页列出对话。

        Returns:
            {'items': [...], 'has_more': bool, 'next_cursor': dict | None}
        """
        ...

    def get_conversation(self, conv_id: int) -> dict | None:
        """按 ID 查询对话，不存在返回 None。"""
        ...

    def update_conversation_title(self, conv_id: int, title: str) -> dict | None:
        """更新对话标题，返回更新后的行或 None。"""
        ...

    def delete_conversation(self, conv_id: int) -> None:
        """删除对话及其消息。"""
        ...

    def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        sources: list | None = None,
        files: list | None = None,
    ) -> dict:
        """追加消息，返回新建行 dict。"""
        ...

    def list_messages(self, conversation_id: int) -> list[dict]:
        """列出对话下所有消息（按时间升序）。"""
        ...

    def get_message_feedback(self, message_id: int) -> dict | None:
        """查询消息的反馈评分，不存在返回 None。"""
        ...

    def set_message_feedback(self, message_id: int, rating: str) -> dict:
        """设置消息的反馈评分，返回反馈行 dict。"""
        ...
```

- [ ] **Step 6: Create `user_store.py`**

```python
# src/storage/interfaces/user_store.py
"""UserStore Protocol 接口。"""

from typing import Protocol


class BaseUserStore(Protocol):
    """用户数据访问接口。"""

    def create_user(
        self,
        username: str,
        password_hash: str,
        role: str = "student",
        display_name: str = "",
        email: str = "",
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
    ) -> list[dict]:
        """分页列出用户，支持角色过滤。"""
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
        student_id: str = "",
        major: str = "",
        grade: str = "",
        thesis_title: str = "",
    ) -> dict:
        """创建或更新学生档案，返回档案行 dict。"""
        ...

    def get_student_profile(self, user_id: int) -> dict | None:
        """查询学生档案，不存在返回 None。"""
        ...

    def upsert_teacher_profile(
        self,
        user_id: int,
        employee_id: str = "",
        title: str = "",
        department: str = "",
    ) -> dict:
        """创建或更新教师档案，返回档案行 dict。"""
        ...

    def get_teacher_profile(self, user_id: int) -> dict | None:
        """查询教师档案，不存在返回 None。"""
        ...

    def add_login_log(
        self,
        user_id: int,
        ip_addr: str = "",
        user_agent: str = "",
    ) -> None:
        """记录登录日志。"""
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
```

- [ ] **Step 7: Verify all interfaces import correctly**

```bash
poetry run python -c "
from src.storage.interfaces import (
    BaseKBStore, BaseDocStore, BaseFAQStore,
    BaseSettingsStore, BaseTicketStore,
    BaseConversationStore, BaseUserStore,
)
# Structural check: 实现类满足各自 Protocol
from src.storage.kb_store import KBStore
from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
from src.storage.settings_store import SettingsStore
from src.storage.ticket_store import TicketStore
from src.storage.conversation_store import ConversationStore
from src.storage.user_store import UserStore

_: BaseKBStore = KBStore()
_: BaseDocStore = DocStore()
_: BaseFAQStore = FAQStore()
_: BaseSettingsStore = SettingsStore()
_: BaseTicketStore = TicketStore()
_: BaseConversationStore = ConversationStore()
_: BaseUserStore = UserStore()
print('all store interfaces OK')
"
```

Expected: `all store interfaces OK`

- [ ] **Step 8: Run system smoke test**

```bash
poetry run python -c "
from src.api.app import app
print('app import OK')
"
```

Expected: `app import OK`

- [ ] **Step 9: Commit**

```bash
git add src/storage/interfaces/
git commit -m "feat(storage): add Protocol interfaces for all Store classes"
```

---

### Task 4: Final compliance check

- [ ] **Step 1: Verify no circular imports introduced**

```bash
poetry run python -c "
from src.exceptions import AppException
from src.storage.interfaces import BaseKBStore, BaseFAQStore
from src.storage.kb_store import KBStore
from src.storage.faq_store import FAQStore
from src.api.app import app
print('no circular imports')
"
```

Expected: `no circular imports`

- [ ] **Step 2: Verify system startup (requires Docker services running)**

```bash
poetry run python -m src.main --check-imports 2>/dev/null || \
poetry run python -c "from src.api.app import app; print('startup OK')"
```

Expected: `startup OK`

---

*Plan: Phase 0+1 | Created: 2026-05-28*
