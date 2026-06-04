# Refactor Phase 3+4: API Cleanup + Core Reorganization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `api/schemas.py` into per-domain files, verify all routes are ≤30 lines, then reorganize `core/` by splitting `indexing.py`, moving `tools.py`, moving `llm_factory.py`, and splitting `interfaces.py` — all without changing behavior.

**Architecture:** Pure refactoring (move/split). No logic changes. External import paths preserved via re-exports. System remains runnable after every task.

**Tech Stack:** Python, FastAPI

**Prerequisite:** Phase 2 complete (services layer in place, routes are already thin).

---

## File Map

**Phase 3 — API Cleanup**

| Action | Path |
|--------|------|
| Create | `src/api/schemas/__init__.py` |
| Create | `src/api/schemas/auth.py` |
| Create | `src/api/schemas/chat.py` |
| Create | `src/api/schemas/document.py` |
| Create | `src/api/schemas/faq.py` |
| Create | `src/api/schemas/user.py` |
| Create | `src/api/schemas/ticket.py` |
| Create | `src/api/schemas/knowledge.py` |
| Create | `src/api/schemas/common.py` |
| Delete | `src/api/schemas.py` (after re-export verified) |

**Phase 4 — Core Reorganization**

| Action | Path |
|--------|------|
| Create | `src/core/indexing/__init__.py` |
| Create | `src/core/indexing/base.py` |
| Create | `src/core/indexing/dispatcher.py` |
| Create | `src/core/indexing/policy.py` |
| Create | `src/core/indexing/manual.py` |
| Create | `src/core/indexing/form.py` |
| Create | `src/core/indexing/_helpers.py` |
| Delete | `src/core/indexing.py` |
| Create | `src/core/agent/tools/__init__.py` |
| Create | `src/core/agent/tools/calendar.py` |
| Create | `src/core/agent/tools/knowledge.py` |
| Delete | `src/core/tools.py` (after re-export verified) |
| Create | `src/core/shared/__init__.py` |
| Create | `src/core/shared/llm_factory.py` |
| Modify | `src/core/llm_factory.py` (re-export shim) |
| Create | `src/core/interfaces/__init__.py` |
| Create | `src/core/interfaces/retriever.py` |
| Create | `src/core/interfaces/reranker.py` |
| Create | `src/core/interfaces/generator.py` |
| Create | `src/core/interfaces/indexing.py` |
| Create | `src/core/interfaces/faq.py` |
| Create | `src/core/interfaces/safety.py` |
| Delete | `src/core/interfaces.py` (after re-export verified) |

---

## Phase 3: API Schema Split

### Task 3-1: Split `api/schemas.py` into `api/schemas/`

**Files:**
- Create: `src/api/schemas/` (all files)
- Delete: `src/api/schemas.py`

- [ ] **Step 1: Read current `schemas.py` to catalog all models**

```bash
grep -n "^class " src/api/schemas.py
```

Note down all class names — you'll need to place each one in the right domain file.

- [ ] **Step 2: Create `src/api/schemas/common.py`**

Move all generic/shared models here:

```python
# src/api/schemas/common.py
"""通用 Pydantic 模型。"""

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str


class PagedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
```

- [ ] **Step 3: Create `src/api/schemas/auth.py`**

```python
# src/api/schemas/auth.py
"""认证相关 Pydantic 模型。"""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
```

- [ ] **Step 4: Create `src/api/schemas/knowledge.py`**

```python
# src/api/schemas/knowledge.py
"""知识库相关 Pydantic 模型。"""

from pydantic import BaseModel


class KBCreate(BaseModel):
    name: str
    description: str = ""


class KBInfo(BaseModel):
    name: str
    description: str = ""
    doc_count: int = 0


class ActiveKBResponse(BaseModel):
    kb_name: str
    description: str = ""
    doc_count: int = 0


class SetActiveKBRequest(BaseModel):
    kb_name: str
```

- [ ] **Step 5: Create `src/api/schemas/document.py`**

```python
# src/api/schemas/document.py
"""文档相关 Pydantic 模型。"""

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: int
    kb_name: str
    file_name: str
    file_size: int = 0
    chunk_count: int = 0
    doc_type: str = "plain_text"
    status: str = "completed"
    summary: str | None = None


class DocumentUploadResponse(BaseModel):
    id: int
    file_name: str
    status: str
```

- [ ] **Step 6: Create `src/api/schemas/faq.py`**

```python
# src/api/schemas/faq.py
"""FAQ 相关 Pydantic 模型。"""

from pydantic import BaseModel, Field


class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str = ""
    sort_order: int = 0


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    sort_order: int | None = None
    status: str | None = None


class FAQItem(BaseModel):
    id: int
    kb_name: str
    question: str
    answer: str
    category: str = ""
    status: str = "approved"
    sort_order: int = 0
    vector_id: str | None = None


class FAQImportError(BaseModel):
    row: int
    error: str


class FAQImportResult(BaseModel):
    imported: int
    errors: list[FAQImportError] = Field(default_factory=list)


class FAQSearchResponse(BaseModel):
    items: list[FAQItem]
    total: int
```

- [ ] **Step 7: Create `src/api/schemas/user.py`**

```python
# src/api/schemas/user.py
"""用户相关 Pydantic 模型。"""

from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "student"
    display_name: str = ""
    email: str = ""


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    display_name: str = ""
    email: str = ""


class UserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    password: str | None = None
```

- [ ] **Step 8: Create `src/api/schemas/ticket.py`**

```python
# src/api/schemas/ticket.py
"""工单相关 Pydantic 模型。"""

from pydantic import BaseModel


class TicketCreate(BaseModel):
    mentor_id: int
    conversation_id: int
    message_id: int
    question: str


class TicketAnswer(BaseModel):
    answer: str


class TicketResponse(BaseModel):
    id: int
    student_id: int
    mentor_id: int
    question: str
    answer: str | None = None
    status: str = "pending"
```

- [ ] **Step 9: Create `src/api/schemas/chat.py`**

```python
# src/api/schemas/chat.py
"""聊天相关 Pydantic 模型。"""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str
    kb_name: str
    history: list[dict] = Field(default_factory=list)
```

- [ ] **Step 10: Create `src/api/schemas/__init__.py` with full re-export**

从原 `schemas.py` 的所有 class 名称按域归入相应模块，然后 re-export 全部，确保原有 `from src.api.schemas import XYZ` 不报错：

```python
# src/api/schemas/__init__.py
"""Pydantic 请求/响应模型（统一 re-export）。

所有外部代码使用 from src.api.schemas import XYZ，不需要知道模型在哪个子文件里。
"""

from src.api.schemas.auth import ChangePasswordRequest, LoginRequest, TokenResponse
from src.api.schemas.chat import ChatRequest
from src.api.schemas.common import MessageResponse, PagedResponse
from src.api.schemas.document import DocumentResponse, DocumentUploadResponse
from src.api.schemas.faq import (
    FAQCreate,
    FAQImportError,
    FAQImportResult,
    FAQItem,
    FAQSearchResponse,
    FAQUpdate,
)
from src.api.schemas.knowledge import ActiveKBResponse, KBCreate, KBInfo, SetActiveKBRequest
from src.api.schemas.ticket import TicketAnswer, TicketCreate, TicketResponse
from src.api.schemas.user import UserCreate, UserResponse, UserUpdate

__all__ = [
    # auth
    "LoginRequest", "TokenResponse", "ChangePasswordRequest",
    # chat
    "ChatRequest",
    # common
    "MessageResponse", "PagedResponse",
    # document
    "DocumentResponse", "DocumentUploadResponse",
    # faq
    "FAQCreate", "FAQUpdate", "FAQItem", "FAQImportError", "FAQImportResult", "FAQSearchResponse",
    # knowledge
    "KBCreate", "KBInfo", "ActiveKBResponse", "SetActiveKBRequest",
    # ticket
    "TicketCreate", "TicketAnswer", "TicketResponse",
    # user
    "UserCreate", "UserResponse", "UserUpdate",
]
```

> **重要：** 在删除 `schemas.py` 之前，先检查原文件里所有的 class 名称是否都已出现在 `__init__.py` 的 re-export 里。遗漏的类要先补到对应域文件再 re-export。

- [ ] **Step 11: Verify all original imports still work**

```bash
poetry run python -c "
# 模拟各路由文件的 import 方式
from src.api.schemas import (
    LoginRequest, TokenResponse, MessageResponse,
    FAQCreate, FAQItem, FAQImportResult,
    KBCreate, KBInfo, ActiveKBResponse,
    ChatRequest, DocumentResponse,
)
print('all schemas import OK')
"
```

Expected: `all schemas import OK`

- [ ] **Step 12: Delete `src/api/schemas.py`**

```bash
git rm src/api/schemas.py
```

- [ ] **Step 13: Run full import check**

```bash
poetry run python -c "from src.api.app import app; print('app OK')"
```

Expected: `app OK`

- [ ] **Step 14: Commit**

```bash
git add src/api/schemas/
git commit -m "refactor(api): split schemas.py into per-domain files under schemas/"
```

---

### Task 3-2: Verify all route functions are ≤30 lines

- [ ] **Step 1: Check line counts**

```bash
poetry run python - <<'EOF'
import ast, pathlib

routes_dir = pathlib.Path("src/api/routes")
for f in sorted(routes_dir.glob("*.py")):
    tree = ast.parse(f.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef):
            lines = node.end_lineno - node.lineno + 1
            if lines > 30:
                print(f"OVER: {f.name}::{node.name} = {lines} lines")

print("check done")
EOF
```

Expected: only `check done` (no `OVER:` lines). If any function is over 30 lines, the corresponding business logic still hasn't been moved to the Service layer — go back to Phase 2 and add the missing Service method.

- [ ] **Step 2: Commit if any fixes were needed**

```bash
git add src/api/routes/ src/services/
git commit -m "refactor(api): move remaining business logic to services, all routes ≤30 lines"
```

---

## Phase 4: Core Reorganization

### Task 4-1: Split `core/indexing.py` → `core/indexing/`

**Files:**
- Create: `src/core/indexing/__init__.py`, `base.py`, `dispatcher.py`, `policy.py`, `manual.py`, `form.py`, `_helpers.py`
- Delete: `src/core/indexing.py`

- [ ] **Step 1: Read current `core/indexing.py`**

```bash
cat src/core/indexing.py
```

Identify which code belongs in each target file:
- `PolicyPipeline` or equivalent → `policy.py`
- `ManualPipeline` (manual step splitter + image description) → `manual.py`
- `FormPipeline` (form extraction workflow) → `form.py`
- Dispatch logic (`if doc_type == ...`) → `dispatcher.py`
- Shared helpers (chunking, vector write) → `_helpers.py`

- [ ] **Step 2: Create `src/core/indexing/base.py`**

```python
# src/core/indexing/base.py
"""文档索引流水线基类。"""

from abc import ABC, abstractmethod


class BaseIndexingPipeline(ABC):
    """文档索引流水线抽象基类。

    新增文档类型时继承此类，在 dispatcher.py 加一行分发即可。
    """

    @abstractmethod
    def run(
        self,
        file_bytes: bytes,
        file_name: str,
        kb_name: str,
        doc_id: int,
        chunk_size: int = 256,
        **kwargs: object,
    ) -> int:
        """执行索引流水线。

        Args:
            file_bytes: 文件原始字节。
            file_name: 原始文件名（含扩展名）。
            kb_name: 目标知识库名称。
            doc_id: 文档数据库 ID（用于更新进度）。
            chunk_size: 切分块大小（token）。

        Returns:
            成功写入的 chunk 数量。

        Raises:
            IndexingError: 索引过程中发生错误。
        """
```

- [ ] **Step 3: Move pipeline classes to their target files**

从 `core/indexing.py` 中提取各 Pipeline 类，分别放入 `policy.py`、`manual.py`、`form.py`。提取规则：
- 保留类名和方法签名不变
- 只修改 import 路径（`from src.core.indexing._helpers import ...`）
- 如果原文件没有明确的 Pipeline 类结构，按功能拆分成对应模块

- [ ] **Step 4: Create `src/core/indexing/dispatcher.py`**

```python
# src/core/indexing/dispatcher.py
"""根据 doc_type 将文档分发到对应索引流水线。"""

from src.core.indexing.base import BaseIndexingPipeline
from src.core.indexing.form import FormPipeline
from src.core.indexing.manual import ManualPipeline
from src.core.indexing.policy import PolicyPipeline
from src.exceptions import IndexingError

_PIPELINES: dict[str, type[BaseIndexingPipeline]] = {
    "policy": PolicyPipeline,
    "manual": ManualPipeline,
    "form": FormPipeline,
    "plain_text": PolicyPipeline,   # 默认用 policy 流水线
}


def index_document(
    file_bytes: bytes,
    file_name: str,
    kb_name: str,
    doc_id: int,
    doc_type: str = "plain_text",
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    **kwargs: object,
) -> int:
    """统一索引入口：按 doc_type 分发到对应 Pipeline。

    Args:
        file_bytes: 文件原始字节。
        file_name: 原始文件名。
        kb_name: 目标知识库。
        doc_id: 文档数据库 ID。
        doc_type: 文档类型（policy/manual/form/plain_text）。
        splitter_type: 切分策略。
        chunk_size: 切分块大小。

    Returns:
        写入的 chunk 数量。

    Raises:
        IndexingError: 未知文档类型或索引过程失败。
    """
    pipeline_cls = _PIPELINES.get(doc_type)
    if pipeline_cls is None:
        raise IndexingError(f"未知文档类型：{doc_type}")
    pipeline = pipeline_cls()
    return pipeline.run(
        file_bytes=file_bytes,
        file_name=file_name,
        kb_name=kb_name,
        doc_id=doc_id,
        chunk_size=chunk_size,
        splitter_type=splitter_type,
        **kwargs,
    )
```

- [ ] **Step 5: Create `src/core/indexing/__init__.py`**

```python
# src/core/indexing/__init__.py
"""文档索引流水线。

外部调用者只需：
    from src.core.indexing import index_document
    count = index_document(file_bytes, file_name, kb_name, doc_id, doc_type)
"""

from src.core.indexing.dispatcher import index_document

__all__ = ["index_document"]
```

- [ ] **Step 6: Verify import**

```bash
poetry run python -c "
from src.core.indexing import index_document
print('indexing import OK')
"
```

Expected: `indexing import OK`

- [ ] **Step 7: Delete old file**

```bash
git rm src/core/indexing.py
```

- [ ] **Step 8: Commit**

```bash
git add src/core/indexing/
git commit -m "refactor(core): split indexing.py into indexing/ package"
```

---

### Task 4-2: Move `core/tools.py` → `core/agent/tools/`

**Files:**
- Create: `src/core/agent/tools/__init__.py`
- Create: `src/core/agent/tools/calendar.py`
- Create: `src/core/agent/tools/knowledge.py`
- Delete: `src/core/tools.py`

- [ ] **Step 1: Read current `core/tools.py`**

```bash
cat src/core/tools.py
```

- [ ] **Step 2: Create `src/core/agent/tools/calendar.py`**

读取 `src/core/tools.py`，将 `get_academic_calendar` 函数及其所有依赖（缓存变量、爬取函数、兜底逻辑）完整迁移到新文件，只修改文件顶部注释：

```bash
# 先确认需要移动的函数名
grep -n "def " src/core/tools.py | grep -v "make_"
```

然后创建 `src/core/agent/tools/calendar.py`，文件头为：

```python
# src/core/agent/tools/calendar.py
"""学术日历工具：今日日期/星期/教学周。

三级缓存：知识库 → 爬取 → 过期兜底。
"""
```

其余内容：从 `src/core/tools.py` 中剪切 `get_academic_calendar` 及其所有辅助函数/变量（不含 `list_kb_documents`、`make_search_kb_tool`、`make_get_document_link_tool`）粘贴到此文件。

- [ ] **Step 3: Create `src/core/agent/tools/knowledge.py`**

创建 `src/core/agent/tools/knowledge.py`，文件头为：

```python
# src/core/agent/tools/knowledge.py
"""知识库检索工具。

包含：
- list_kb_documents: 直接工具，列出文档名和 chunk 数
- make_search_kb_tool: 工厂函数，运行时绑定检索器
- make_get_document_link_tool: 工厂函数，运行时绑定 kb_name
"""
```

其余内容：从 `src/core/tools.py` 中剪切 `list_kb_documents`、`make_search_kb_tool`、`make_get_document_link_tool` 三个函数粘贴到此文件。保持函数签名和 docstring 完全不变。

- [ ] **Step 4: Create `src/core/agent/tools/__init__.py`**

```python
# src/core/agent/tools/__init__.py
"""Agent 工具集。"""

from src.core.agent.tools.calendar import get_academic_calendar
from src.core.agent.tools.knowledge import (
    list_kb_documents,
    make_get_document_link_tool,
    make_search_kb_tool,
)

__all__ = [
    "get_academic_calendar",
    "list_kb_documents",
    "make_search_kb_tool",
    "make_get_document_link_tool",
]
```

- [ ] **Step 5: Update `core/agent/factory.py`** — 将 `from src.core.tools import ...` 改为 `from src.core.agent.tools import ...`

```bash
# 先查到确切的 import 行
grep -n "from src.core.tools" src/core/agent/factory.py
```

然后用 Edit 工具将该行改为：
```python
from src.core.agent.tools import get_academic_calendar, list_kb_documents, make_get_document_link_tool, make_search_kb_tool
```
（根据 `factory.py` 实际 import 的符号，只保留用到的那些）

- [ ] **Step 6: Delete `core/tools.py`**

```bash
git rm src/core/tools.py
```

- [ ] **Step 7: Verify**

```bash
poetry run python -c "
from src.core.agent.tools import (
    get_academic_calendar, list_kb_documents,
    make_search_kb_tool, make_get_document_link_tool,
)
print('agent tools import OK')
"
```

Expected: `agent tools import OK`

- [ ] **Step 8: Commit**

```bash
git add src/core/agent/tools/ src/core/agent/factory.py
git commit -m "refactor(core): move tools.py into core/agent/tools/"
```

---

### Task 4-3: Move `core/llm_factory.py` → `core/shared/llm_factory.py`

**Files:**
- Create: `src/core/shared/__init__.py`
- Create: `src/core/shared/llm_factory.py`
- Modify: `src/core/llm_factory.py` (re-export shim)

- [ ] **Step 1: Read current `core/llm_factory.py`**

```bash
cat src/core/llm_factory.py
```

- [ ] **Step 2: Create `src/core/shared/__init__.py`**

```python
# src/core/shared/__init__.py
```

- [ ] **Step 3: Create `src/core/shared/llm_factory.py`**

读取 `src/core/llm_factory.py` 的完整内容，创建 `src/core/shared/llm_factory.py`，内容与原文件相同，只将文件顶部注释改为：

```python
# src/core/shared/llm_factory.py
"""LLM 实例工厂：get_fast_llm() / get_capable_llm()。

跨 Agent 共享。每次调用返回同一实例（functools.lru_cache）。
"""
```

其余代码（import、函数体、lru_cache 装饰器等）完整复制自 `src/core/llm_factory.py`，一行不改。

- [ ] **Step 4: Replace `core/llm_factory.py` with re-export shim**

```python
# src/core/llm_factory.py
"""向后兼容 re-export。新代码请从 src.core.shared.llm_factory 导入。"""

from src.core.shared.llm_factory import get_capable_llm, get_fast_llm  # noqa: F401
```

- [ ] **Step 5: Verify both import paths work**

```bash
poetry run python -c "
from src.core.shared.llm_factory import get_fast_llm, get_capable_llm
from src.core.llm_factory import get_fast_llm, get_capable_llm   # backward compat
print('llm_factory import OK')
"
```

Expected: `llm_factory import OK`

- [ ] **Step 6: Commit**

```bash
git add src/core/shared/ src/core/llm_factory.py
git commit -m "refactor(core): move llm_factory to core/shared/, add re-export shim"
```

---

### Task 4-4: Split `core/interfaces.py` → `core/interfaces/`

**Files:**
- Create: `src/core/interfaces/__init__.py`
- Create: `src/core/interfaces/retriever.py`
- Create: `src/core/interfaces/reranker.py`
- Create: `src/core/interfaces/generator.py`
- Create: `src/core/interfaces/indexing.py`
- Create: `src/core/interfaces/faq.py`
- Create: `src/core/interfaces/safety.py`
- Delete: `src/core/interfaces.py`

- [ ] **Step 1: Read current `core/interfaces.py`**

```bash
cat src/core/interfaces.py
```

Identify all Protocol/ABC/dataclass definitions and which target file they belong to.

- [ ] **Step 2: Create `src/core/interfaces/retriever.py`**

```python
# src/core/interfaces/retriever.py
"""检索器接口。"""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class RetrievedNode:
    """检索结果的统一数据结构。"""

    text: str
    score: float
    metadata: dict


class BaseRetriever(Protocol):
    """文档检索器接口。实现类只需方法签名匹配，无需显式继承。"""

    def retrieve(self, query: str, top_k: int = 10) -> list[RetrievedNode]:
        """根据查询检索相关文档块。

        Args:
            query: 用户查询文本。
            top_k: 返回文档数量上限。

        Returns:
            按相关性降序排列的文档块列表。
        """
        ...
```

- [ ] **Step 3: Create `src/core/interfaces/reranker.py`**

```python
# src/core/interfaces/reranker.py
"""重排序器接口。"""

from typing import Protocol


class BaseReranker(Protocol):
    """文档重排序器接口。"""

    def rerank(self, query: str, nodes: list[dict], top_n: int = 5) -> list[dict]:
        """对候选文档进行语义重排序。

        Args:
            query: 用户查询文本。
            nodes: 候选文档列表。
            top_n: 返回前 N 个结果。

        Returns:
            按相关性降序排列的文档列表。
        """
        ...
```

- [ ] **Step 4: Create `src/core/interfaces/generator.py`**

```python
# src/core/interfaces/generator.py
"""答案生成器接口。"""

from collections.abc import Generator
from typing import Protocol


class BaseGenerator(Protocol):
    """答案生成器接口。"""

    def generate(self, query: str, context: str, history: list[dict]) -> str:
        """基于上下文生成答案。"""
        ...

    def stream(self, query: str, context: str, history: list[dict]) -> Generator[str, None, None]:
        """流式生成答案。"""
        ...
```

- [ ] **Step 5: Create `src/core/interfaces/indexing.py`**

```python
# src/core/interfaces/indexing.py
"""索引流水线接口（ABC，有共享实现代码）。"""

from abc import ABC, abstractmethod


class BaseIndexingPipeline(ABC):
    """文档索引流水线抽象基类。

    与 core/indexing/base.py 中的 ABC 相同——core/interfaces/indexing.py
    供外部代码（services/）做类型标注用，core/indexing/base.py 是实现侧基类。
    两者签名保持一致。
    """

    @abstractmethod
    def run(
        self,
        file_bytes: bytes,
        file_name: str,
        kb_name: str,
        doc_id: int,
        chunk_size: int = 256,
        **kwargs: object,
    ) -> int: ...
```

- [ ] **Step 6: Create `src/core/interfaces/faq.py`**

```python
# src/core/interfaces/faq.py
"""FAQ 匹配器接口。"""

from typing import Protocol


class BaseFAQMatcher(Protocol):
    """FAQ 语义匹配器接口。"""

    def match(self, query: str, kb_name: str) -> dict | None:
        """语义匹配 FAQ。

        Args:
            query: 用户查询（匹配前会做 LLM 改写）。
            kb_name: 知识库名称。

        Returns:
            匹配结果 dict（含 question/answer/score），或 None（未匹配）。
        """
        ...
```

- [ ] **Step 7: Create `src/core/interfaces/safety.py`**

```python
# src/core/interfaces/safety.py
"""安全拦截器接口。"""

from typing import Protocol


class BaseSafetyGuard(Protocol):
    """答案安全拦截器接口。"""

    def apply(self, answer: str, query: str) -> str:
        """对 LLM 生成的答案应用安全规则。

        Args:
            answer: 原始 LLM 输出。
            query: 原始用户问题。

        Returns:
            经过安全规则修正后的答案。
        """
        ...
```

- [ ] **Step 8: Create `src/core/interfaces/__init__.py`**

收集所有原 `interfaces.py` 中定义的符号，加上新增接口，统一 re-export：

```python
# src/core/interfaces/__init__.py
"""core 层所有公共接口（Protocol / ABC）。"""

from src.core.interfaces.faq import BaseFAQMatcher
from src.core.interfaces.generator import BaseGenerator
from src.core.interfaces.indexing import BaseIndexingPipeline
from src.core.interfaces.reranker import BaseReranker
from src.core.interfaces.retriever import BaseRetriever, RetrievedNode
from src.core.interfaces.safety import BaseSafetyGuard

__all__ = [
    "BaseRetriever",
    "RetrievedNode",
    "BaseReranker",
    "BaseGenerator",
    "BaseIndexingPipeline",
    "BaseFAQMatcher",
    "BaseSafetyGuard",
]
```

- [ ] **Step 9: Verify original import paths still work**

```bash
poetry run python -c "
# 检查原 core/interfaces.py 的所有 class 现在还能 import
from src.core.interfaces import (
    BaseRetriever, RetrievedNode, BaseReranker,
    BaseGenerator, BaseIndexingPipeline,
    BaseFAQMatcher, BaseSafetyGuard,
)
print('all core interfaces OK')
"
```

Expected: `all core interfaces OK`

- [ ] **Step 10: Delete old file**

```bash
git rm src/core/interfaces.py
```

- [ ] **Step 11: Commit**

```bash
git add src/core/interfaces/
git commit -m "refactor(core): split interfaces.py into interfaces/ package"
```

---

### Task 4-5: Final compliance check

- [ ] **Step 1: Run all three layer violation checks**

```bash
echo "=== routes → storage/core 违规 ==="
grep -r "from src.storage\|from src.core" src/api/routes/ || echo "none"

echo "=== services → fastapi 违规 ==="
grep -r "from fastapi\|import fastapi" src/services/ || echo "none"

echo "=== core → storage/api 违规 ==="
grep -r "from src.storage\|from src.api" src/core/ || echo "none"
```

Expected: each section shows `none`.

- [ ] **Step 2: Verify full system startup**

```bash
poetry run python -c "from src.api.app import app; print('system startup OK')"
```

Expected: `system startup OK`

- [ ] **Step 3: Verify deleted files are gone**

```bash
test ! -f src/core/indexing.py && echo "indexing.py gone" || echo "FAIL: indexing.py still exists"
test ! -f src/core/tools.py && echo "tools.py gone" || echo "FAIL: tools.py still exists"
test ! -f src/core/interfaces.py && echo "interfaces.py gone" || echo "FAIL: interfaces.py still exists"
test ! -f src/api/schemas.py && echo "schemas.py gone" || echo "FAIL: schemas.py still exists"
```

Expected: all four lines show `gone`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: Phase 3+4 complete — api/schemas split, core/ reorganized"
```

---

*Plan: Phase 3+4 | Created: 2026-05-28*
