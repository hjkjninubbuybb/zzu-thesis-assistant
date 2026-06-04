# Refactor Phase 2: Services Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `src/services/` as the business orchestration layer. Routes delegate all business logic to Services; Services know nothing about HTTP. Each task is independently runnable — the system remains functional after every commit.

**Architecture:** 8 services (2-A through 2-H) in complexity order. Each service is created, wired into a new `api/deps.py`, and the corresponding route is thinned. `ChatService` is last because it depends on the most components.

**Tech Stack:** FastAPI `Depends`, Python `asyncio.to_thread`, LangGraph

**Prerequisite:** Phase 0+1 complete (`src/exceptions.py` and `storage/interfaces/` exist).

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/api/deps.py` |
| Create | `src/services/__init__.py` |
| Create | `src/services/base.py` |
| Create | `src/services/analytics_service.py` |
| Create | `src/services/config_service.py` |
| Create | `src/services/knowledge_service.py` |
| Create | `src/services/faq_service.py` |
| Create | `src/services/ticket_service.py` |
| Create | `src/services/user_service.py` |
| Create | `src/services/document_service.py` |
| Create | `src/services/chat_service.py` |
| Modify | `src/api/routes/analytics.py` |
| Modify | `src/api/routes/config.py` |
| Modify | `src/api/routes/knowledge.py` |
| Modify | `src/api/routes/faq.py` |
| Modify | `src/api/routes/ticket.py` |
| Modify | `src/api/routes/user.py` |
| Modify | `src/api/routes/document.py` |
| Modify | `src/api/routes/chat.py` |
| Modify | `src/api/app.py` (add global AppException handler) |

---

### Task 2-0: Scaffolding — `api/deps.py` + `services/` skeleton

**Files:**
- Create: `src/services/__init__.py`
- Create: `src/services/base.py`
- Create: `src/api/deps.py`

- [ ] **Step 1: Create `src/services/__init__.py`**

```python
# src/services/__init__.py
```

- [ ] **Step 2: Create `src/services/base.py`**

```python
# src/services/base.py
"""Service 基类（可选继承）。"""

import logging


class BaseService:
    """所有 Service 的可选基类，提供带类名前缀的 logger。

    不强制继承，不继承也不影响 Service 正常工作。
    唯一职责：让 self.logger 自动带 ClassName 前缀。
    """

    def __init__(self) -> None:
        self.logger = logging.getLogger(self.__class__.__name__)
```

- [ ] **Step 3: Create `src/api/deps.py` (初始骨架，后续每个 Task 追加)**

```python
# src/api/deps.py
"""统一依赖注入工厂函数。

所有 Service 的创建都在这里。换实现时只改这一个文件。
FastAPI 在同一请求内自动缓存相同依赖，不会重复构造 Store。
"""

from fastapi import Depends

from src.storage.conversation_store import ConversationStore
from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.settings_store import SettingsStore
from src.storage.ticket_store import TicketStore
from src.storage.user_store import UserStore
from src.storage.vector_store import VectorStore


# ── Store 工厂 ──────────────────────────────────────────────

def get_kb_store() -> KBStore:
    return KBStore()


def get_doc_store() -> DocStore:
    return DocStore()


def get_faq_store() -> FAQStore:
    return FAQStore()


def get_settings_store() -> SettingsStore:
    return SettingsStore()


def get_ticket_store() -> TicketStore:
    return TicketStore()


def get_conversation_store() -> ConversationStore:
    return ConversationStore()


def get_user_store() -> UserStore:
    return UserStore()


def get_vector_store() -> VectorStore:
    return VectorStore()
```

- [ ] **Step 4: Add global `AppException` handler to `api/app.py`**

在 `src/api/app.py` 中找到 FastAPI 实例创建的位置，在其后（路由注册之前）加入：

```python
# 在 app = FastAPI(...) 之后添加：
from fastapi.responses import JSONResponse
from src.exceptions import AppException

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content={"code": exc.code, "message": str(exc)},
    )
```

- [ ] **Step 5: Verify**

```bash
poetry run python -c "
from src.api.deps import get_kb_store, get_faq_store, get_settings_store
from src.services.base import BaseService
print('deps + base OK')
"
```

Expected: `deps + base OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/ src/api/deps.py src/api/app.py
git commit -m "feat(services): add services scaffold, deps.py, global exception handler"
```

---

### Task 2-A: `AnalyticsService`

**Files:**
- Create: `src/services/analytics_service.py`
- Modify: `src/api/routes/analytics.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read the current analytics route to understand what to move**

```bash
cat src/api/routes/analytics.py
```

- [ ] **Step 2: Create `analytics_service.py`**

```python
# src/services/analytics_service.py
"""统计汇总业务逻辑。"""

from src.services.base import BaseService
from src.storage.interfaces.settings_store import BaseSettingsStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.faq_store import BaseFAQStore
from src.storage.interfaces.conversation_store import BaseConversationStore
from src.storage.interfaces.user_store import BaseUserStore


class AnalyticsService(BaseService):
    """查询系统统计汇总数据。"""

    def __init__(
        self,
        kb_store: BaseKBStore,
        doc_store: BaseDocStore,
        faq_store: BaseFAQStore,
        conversation_store: BaseConversationStore,
        user_store: BaseUserStore,
        settings_store: BaseSettingsStore,
    ) -> None:
        super().__init__()
        self._kb_store = kb_store
        self._doc_store = doc_store
        self._faq_store = faq_store
        self._conversation_store = conversation_store
        self._user_store = user_store
        self._settings_store = settings_store

    def get_summary(self) -> dict:
        """返回系统统计摘要。

        Returns:
            包含 kb_count, doc_count, faq_count, user_count, conversation_count 的 dict。
        """
        active_kb = self._settings_store.get_setting("active_kb") or ""
        kbs = self._kb_store.list_kbs()
        kb_count = len(kbs)
        doc_count = sum(k.get("doc_count", 0) for k in kbs)
        faq_count = len(self._faq_store.list_faqs(active_kb)) if active_kb else 0
        user_count = self._user_store.count_users()
        return {
            "kb_count": kb_count,
            "doc_count": doc_count,
            "faq_count": faq_count,
            "user_count": user_count,
            "active_kb": active_kb,
        }
```

- [ ] **Step 3: Add `get_analytics_service` to `api/deps.py`**

在 `api/deps.py` 末尾追加：

```python
from src.services.analytics_service import AnalyticsService


def get_analytics_service(
    kb_store: KBStore = Depends(get_kb_store),
    doc_store: DocStore = Depends(get_doc_store),
    faq_store: FAQStore = Depends(get_faq_store),
    conversation_store: ConversationStore = Depends(get_conversation_store),
    user_store: UserStore = Depends(get_user_store),
    settings_store: SettingsStore = Depends(get_settings_store),
) -> AnalyticsService:
    return AnalyticsService(
        kb_store=kb_store,
        doc_store=doc_store,
        faq_store=faq_store,
        conversation_store=conversation_store,
        user_store=user_store,
        settings_store=settings_store,
    )
```

- [ ] **Step 4: Thin `api/routes/analytics.py`**

将路由函数改为只调 `AnalyticsService`，删除原来的直接 Store 调用：

```python
# src/api/routes/analytics.py
"""统计汇总接口。"""

from fastapi import APIRouter, Depends

from src.api.auth import require_teacher_or_admin
from src.api.deps import get_analytics_service
from src.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary(
    current_user: dict = Depends(require_teacher_or_admin),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    return analytics_service.get_summary()
```

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.api.routes.analytics import router
from src.services.analytics_service import AnalyticsService
print('analytics OK')
"
```

Expected: `analytics OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/analytics_service.py src/api/deps.py src/api/routes/analytics.py
git commit -m "feat(services): add AnalyticsService, thin analytics route"
```

---

### Task 2-B: `ConfigService`

**Files:**
- Create: `src/services/config_service.py`
- Modify: `src/api/routes/config.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current config route**

```bash
cat src/api/routes/config.py
```

- [ ] **Step 2: Create `config_service.py`**

```python
# src/services/config_service.py
"""系统配置读写 + API Key 连通性验证。"""

import httpx

from src.config import get_config
from src.services.base import BaseService
from src.storage.interfaces.settings_store import BaseSettingsStore


class ConfigService(BaseService):
    """系统配置业务逻辑。"""

    def __init__(self, settings_store: BaseSettingsStore) -> None:
        super().__init__()
        self._settings_store = settings_store

    def get_all(self) -> dict:
        """读取所有配置项，返回合并后的配置 dict（DB 覆盖 config.yaml）。"""
        cfg = get_config()
        return {
            "api_key": self._settings_store.get_setting("api_key") or "",
            "api_base_url": self._settings_store.get_setting("api_base_url") or cfg.llm.base_url,
            "active_kb": self._settings_store.get_setting("active_kb") or "",
            "admin_kb": self._settings_store.get_setting("admin_kb") or "",
        }

    def update(self, key: str, value: str) -> None:
        """写入配置项。"""
        self._settings_store.set_setting(key, value)

    def delete(self, key: str) -> None:
        """删除配置项（恢复为 config.yaml 默认值）。"""
        self._settings_store.delete_setting(key)

    def test_api_key(self, api_key: str, base_url: str) -> dict:
        """测试 DashScope API Key 是否可用。

        Returns:
            {'ok': bool, 'message': str}
        """
        try:
            resp = httpx.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "qwen-turbo",
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return {"ok": True, "message": "API Key 可用"}
            return {"ok": False, "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except httpx.TimeoutException:
            return {"ok": False, "message": "请求超时，请检查网络或 base_url"}
        except httpx.RequestError as e:
            return {"ok": False, "message": f"请求失败：{e}"}
```

- [ ] **Step 3: Add `get_config_service` to `api/deps.py`**

```python
from src.services.config_service import ConfigService


def get_config_service(
    settings_store: SettingsStore = Depends(get_settings_store),
) -> ConfigService:
    return ConfigService(settings_store=settings_store)
```

- [ ] **Step 4: Thin `api/routes/config.py`**

将路由函数改为只调 `ConfigService`，删除原来的直接 Store 调用（保留现有路由路径不变）：

```python
# src/api/routes/config.py
"""系统配置接口。"""

from fastapi import APIRouter, Depends

from src.api.auth import require_admin
from src.api.deps import get_config_service
from src.api.schemas import MessageResponse
from src.services.config_service import ConfigService

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/")
async def get_config_settings(
    current_user: dict = Depends(require_admin),
    config_service: ConfigService = Depends(get_config_service),
) -> dict:
    return config_service.get_all()


@router.put("/{key}")
async def update_setting(
    key: str,
    body: dict,
    current_user: dict = Depends(require_admin),
    config_service: ConfigService = Depends(get_config_service),
) -> MessageResponse:
    config_service.update(key, body.get("value", ""))
    return MessageResponse(message="已更新")


@router.delete("/{key}")
async def delete_setting(
    key: str,
    current_user: dict = Depends(require_admin),
    config_service: ConfigService = Depends(get_config_service),
) -> MessageResponse:
    config_service.delete(key)
    return MessageResponse(message="已删除")


@router.post("/test-api-key")
async def test_api_key(
    body: dict,
    current_user: dict = Depends(require_admin),
    config_service: ConfigService = Depends(get_config_service),
) -> dict:
    return config_service.test_api_key(
        api_key=body.get("api_key", ""),
        base_url=body.get("base_url", ""),
    )
```

> **注意：** 如果原 `config.py` 路由路径或 schema 与上面不同，以原文件为准，只替换业务逻辑部分（删除直接 Store 调用，改为调 Service），不改路由路径。

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.api.routes.config import router
from src.services.config_service import ConfigService
print('config OK')
"
```

Expected: `config OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/config_service.py src/api/deps.py src/api/routes/config.py
git commit -m "feat(services): add ConfigService, thin config route"
```

---

### Task 2-C: `KnowledgeService`

**Files:**
- Create: `src/services/knowledge_service.py`
- Modify: `src/api/routes/knowledge.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current knowledge route**

```bash
cat src/api/routes/knowledge.py
```

- [ ] **Step 2: Create `knowledge_service.py`**

```python
# src/services/knowledge_service.py
"""知识库 CRUD + 活跃知识库分配。"""

from src.exceptions import KnowledgeBaseNotFoundError
from src.services.base import BaseService
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.settings_store import BaseSettingsStore
from src.storage.vector_store import VectorStore

_STUDENT_KB_KEY = "active_kb"
_ADMIN_KB_KEY = "admin_kb"


class KnowledgeService(BaseService):
    """知识库业务逻辑。"""

    def __init__(
        self,
        kb_store: BaseKBStore,
        settings_store: BaseSettingsStore,
        vector_store: VectorStore,
    ) -> None:
        super().__init__()
        self._kb_store = kb_store
        self._settings_store = settings_store
        self._vector_store = vector_store

    def list_kbs(self) -> list[dict]:
        """列出所有知识库。"""
        return self._kb_store.list_kbs()

    def create_kb(self, name: str, description: str = "") -> dict:
        """新建知识库（同时在 Qdrant 创建集合）。"""
        kb = self._kb_store.create_kb(name, description)
        self._vector_store.ensure_collection(name)
        return kb

    def delete_kb(self, name: str) -> None:
        """删除知识库（同时删除 Qdrant 集合）。"""
        kb = self._kb_store.get_kb(name)
        if not kb:
            raise KnowledgeBaseNotFoundError(f"知识库 '{name}' 不存在")
        self._kb_store.delete_kb(name)
        self._vector_store.delete_collection(name)

    def get_active_kb(self, key: str = _STUDENT_KB_KEY) -> dict | None:
        """查询当前活跃知识库信息，含 doc_count。"""
        kb_name = self._settings_store.get_setting(key)
        if not kb_name:
            return None
        kb = self._kb_store.get_kb(kb_name)
        if not kb:
            self._settings_store.delete_setting(key)
            return None
        kbs = self._kb_store.list_kbs()
        doc_count = next((k["doc_count"] for k in kbs if k["name"] == kb_name), 0)
        return {"kb_name": kb_name, "description": kb.get("description", ""), "doc_count": doc_count}

    def set_active_kb(self, kb_name: str, key: str = _STUDENT_KB_KEY) -> dict:
        """设置活跃知识库，返回更新后的活跃 KB 信息。"""
        kb = self._kb_store.get_kb(kb_name)
        if not kb:
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        self._settings_store.set_setting(key, kb_name)
        return self.get_active_kb(key)
```

- [ ] **Step 3: Add `get_knowledge_service` to `api/deps.py`**

```python
from src.services.knowledge_service import KnowledgeService


def get_knowledge_service(
    kb_store: KBStore = Depends(get_kb_store),
    settings_store: SettingsStore = Depends(get_settings_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> KnowledgeService:
    return KnowledgeService(
        kb_store=kb_store,
        settings_store=settings_store,
        vector_store=vector_store,
    )
```

- [ ] **Step 4: Thin `api/routes/knowledge.py`**

删除文件中所有直接 `_ds` / `_vs` 调用，改为调 `KnowledgeService`。路由路径不变，只替换函数体：

```python
# src/api/routes/knowledge.py
"""知识库 CRUD 接口 + 学生/管理端知识库分配。"""

from fastapi import APIRouter, Depends

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.deps import get_knowledge_service
from src.api.schemas import ActiveKBResponse, KBCreate, KBInfo, MessageResponse, SetActiveKBRequest
from src.services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/", response_model=list[KBInfo])
async def list_kbs(
    current_user: dict = Depends(get_current_user),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> list[dict]:
    return svc.list_kbs()


@router.post("/", response_model=KBInfo)
async def create_kb(
    body: KBCreate,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> dict:
    return svc.create_kb(body.name, body.description)


@router.delete("/{name}", response_model=MessageResponse)
async def delete_kb(
    name: str,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> MessageResponse:
    svc.delete_kb(name)
    return MessageResponse(message=f"知识库 '{name}' 已删除")


@router.get("/active", response_model=ActiveKBResponse | None)
async def get_active_kb(
    current_user: dict = Depends(get_current_user),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> dict | None:
    return svc.get_active_kb()


@router.put("/active", response_model=ActiveKBResponse)
async def set_active_kb(
    body: SetActiveKBRequest,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: KnowledgeService = Depends(get_knowledge_service),
) -> dict:
    return svc.set_active_kb(body.kb_name)
```

> **注意：** 如果原路由有更多接口（admin_kb 等），按相同模式一一迁移：把函数体改为调 `svc`，`KnowledgeService` 补充对应方法。

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.api.routes.knowledge import router
import src.api.routes.knowledge as m
# 验证没有直接 import storage
import ast, inspect
src_code = inspect.getsource(m)
assert 'from src.storage' not in src_code, 'route still imports storage directly'
print('knowledge OK')
"
```

Expected: `knowledge OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/knowledge_service.py src/api/deps.py src/api/routes/knowledge.py
git commit -m "feat(services): add KnowledgeService, thin knowledge route"
```

---

### Task 2-D: `FAQService`

**Files:**
- Create: `src/services/faq_service.py`
- Modify: `src/api/routes/faq.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current faq route and core/faq_service.py**

```bash
cat src/api/routes/faq.py
cat src/core/faq_service.py
```

- [ ] **Step 2: Create `services/faq_service.py`**

把 `core/faq_service.py` 的业务函数（`upsert_faq_vector`, `batch_embed_and_upsert`, `parse_faq_sheet`, `build_faq_workbook`, `make_xlsx_response`）迁移进 `FAQService` 类：

```python
# src/services/faq_service.py
"""FAQ CRUD + 向量同步 + 批量导入导出。"""

import io
import uuid
from collections.abc import Generator

import openpyxl
from fastapi.responses import StreamingResponse

from src.exceptions import FAQNotFoundError, KnowledgeBaseNotFoundError
from src.services.base import BaseService
from src.storage.interfaces.faq_store import BaseFAQStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore
from src.core.rag.embedding import get_embed_model


class FAQService(BaseService):
    """FAQ 业务编排：CRUD、向量同步、批量操作、语义匹配入口。"""

    def __init__(
        self,
        faq_store: BaseFAQStore,
        kb_store: BaseKBStore,
        vector_store: VectorStore,
    ) -> None:
        super().__init__()
        self._faq_store = faq_store
        self._kb_store = kb_store
        self._vector_store = vector_store

    def _require_kb(self, kb_name: str) -> None:
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")

    def list_faqs(
        self,
        kb_name: str,
        status: str | None = None,
        role: str = "admin",
    ) -> list[dict]:
        """列出 FAQ，学生角色只能看 approved 状态。"""
        self._require_kb(kb_name)
        effective_status = "approved" if role == "student" else status
        return self._faq_store.list_faqs(kb_name, status=effective_status)

    def create(
        self,
        kb_name: str,
        question: str,
        answer: str,
        category: str,
        sort_order: int,
        author_id: int,
        role: str = "admin",
    ) -> dict:
        """新建 FAQ，同步向量库。教师提交为 pending，管理员为 approved。"""
        self._require_kb(kb_name)
        status = "approved" if role == "admin" else "pending"
        row = self._faq_store.add_faq(
            kb_name=kb_name,
            question=question,
            answer=answer,
            category=category,
            sort_order=sort_order,
            author_id=author_id,
            status=status,
        )
        if status == "approved":
            self._upsert_vector(row["id"], question, answer, kb_name)
        return row

    def update(self, faq_id: int, **kwargs: object) -> dict:
        """更新 FAQ，若答案/问题变化则重新同步向量。"""
        row = self._faq_store.update_faq(faq_id, **kwargs)
        if not row:
            raise FAQNotFoundError(f"FAQ {faq_id} 不存在")
        if "question" in kwargs or "answer" in kwargs:
            self._upsert_vector(faq_id, row["question"], row["answer"], row["kb_name"])
        return row

    def delete(self, faq_id: int) -> dict:
        """删除 FAQ，同步清理向量库。"""
        row = self._faq_store.delete_faq(faq_id)
        if not row:
            raise FAQNotFoundError(f"FAQ {faq_id} 不存在")
        self._vector_store.delete_faq_vector(faq_id)
        return row

    def import_from_xlsx(
        self,
        kb_name: str,
        file_bytes: bytes,
        author_id: int,
    ) -> dict:
        """从 Excel 批量导入 FAQ，返回 {imported, errors} 汇总。"""
        self._require_kb(kb_name)
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes))
        ws = wb.active
        imported = 0
        errors: list[dict] = []
        rows_to_embed: list[tuple[int, str, str]] = []

        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            question = str(row[0]).strip() if row[0] else ""
            answer = str(row[1]).strip() if len(row) > 1 and row[1] else ""
            if not question or not answer:
                errors.append({"row": i, "error": "question 或 answer 为空"})
                continue
            try:
                faq = self._faq_store.add_faq(
                    kb_name=kb_name,
                    question=question,
                    answer=answer,
                    author_id=author_id,
                    status="approved",
                )
                rows_to_embed.append((faq["id"], question, answer))
                imported += 1
            except Exception as e:
                errors.append({"row": i, "error": str(e)})

        # 批量向量化
        if rows_to_embed:
            embed_model = get_embed_model()
            texts = [f"{q} {a}" for _, q, a in rows_to_embed]
            embeddings = embed_model.embed_documents(texts)
            for (faq_id, q, a), vec in zip(rows_to_embed, embeddings):
                vid = str(uuid.uuid4())
                self._vector_store.upsert_faq_vector(faq_id, vid, vec, q, a, kb_name)
                self._faq_store.update_faq(faq_id, vector_id=vid)

        return {"imported": imported, "errors": errors}

    def export_to_xlsx(self, kb_name: str) -> StreamingResponse:
        """导出知识库 FAQ 为 Excel 文件。"""
        self._require_kb(kb_name)
        faqs = self._faq_store.list_faqs(kb_name)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["问题", "答案", "分类", "状态"])
        for faq in faqs:
            ws.append([faq["question"], faq["answer"], faq.get("category", ""), faq.get("status", "")])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="faq_{kb_name}.xlsx"'},
        )

    def _upsert_vector(self, faq_id: int, question: str, answer: str, kb_name: str) -> None:
        embed_model = get_embed_model()
        vec = embed_model.embed_query(f"{question} {answer}")
        vid = str(uuid.uuid4())
        self._vector_store.upsert_faq_vector(faq_id, vid, vec, question, answer, kb_name)
        self._faq_store.update_faq(faq_id, vector_id=vid)
```

- [ ] **Step 3: Add `get_faq_service` to `api/deps.py`**

```python
from src.services.faq_service import FAQService


def get_faq_service(
    faq_store: FAQStore = Depends(get_faq_store),
    kb_store: KBStore = Depends(get_kb_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> FAQService:
    return FAQService(
        faq_store=faq_store,
        kb_store=kb_store,
        vector_store=vector_store,
    )
```

- [ ] **Step 4: Thin `api/routes/faq.py`**

删除所有直接 Store 调用和 `core/faq_service` import，改为调 `FAQService`：

```python
# src/api/routes/faq.py
"""FAQ CRUD 路由。"""

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi import Query as QueryParam
from fastapi.responses import StreamingResponse

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.deps import get_faq_service
from src.api.schemas import FAQCreate, FAQImportResult, FAQItem, FAQUpdate, MessageResponse
from src.services.faq_service import FAQService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/faq", tags=["faq"])


@router.get("/{kb_name}", response_model=list[FAQItem])
async def list_faqs(
    kb_name: str,
    status: str | None = QueryParam(None, pattern=r"^(draft|pending|approved|rejected)$"),
    current_user: dict = Depends(get_current_user),
    svc: FAQService = Depends(get_faq_service),
) -> list[dict]:
    return svc.list_faqs(kb_name, status=status, role=current_user["role"])


@router.post("/{kb_name}", response_model=FAQItem)
async def create_faq(
    kb_name: str,
    body: FAQCreate,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    return svc.create(
        kb_name=kb_name,
        question=body.question,
        answer=body.answer,
        category=body.category,
        sort_order=body.sort_order,
        author_id=current_user["id"],
        role=current_user["role"],
    )


@router.put("/{faq_id}", response_model=FAQItem)
async def update_faq(
    faq_id: int,
    body: FAQUpdate,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    return svc.update(faq_id, **body.model_dump(exclude_none=True))


@router.delete("/{faq_id}", response_model=MessageResponse)
async def delete_faq(
    faq_id: int,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> MessageResponse:
    svc.delete(faq_id)
    return MessageResponse(message="已删除")


@router.post("/{kb_name}/import")
async def import_faqs(
    kb_name: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> FAQImportResult:
    file_bytes = await file.read()
    result = svc.import_from_xlsx(kb_name, file_bytes, author_id=current_user["id"])
    return FAQImportResult(**result)


@router.get("/{kb_name}/export")
async def export_faqs(
    kb_name: str,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> StreamingResponse:
    return svc.export_to_xlsx(kb_name)
```

> **注意：** 如果原路由有语义搜索 (`/search`) 接口，也迁移到 `FAQService.search()` 方法，调用 `faq_match.py` 的语义匹配逻辑。

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.api.routes.faq import router
import src.api.routes.faq as m
import inspect
src_code = inspect.getsource(m)
assert 'from src.storage' not in src_code, 'faq route still imports storage directly'
assert 'from src.core.faq_service' not in src_code, 'faq route still imports core.faq_service'
print('faq OK')
"
```

Expected: `faq OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/faq_service.py src/api/deps.py src/api/routes/faq.py
git commit -m "feat(services): add FAQService, thin faq route, migrate vector sync logic"
```

---

### Task 2-E: `TicketService`

**Files:**
- Create: `src/services/ticket_service.py`
- Modify: `src/api/routes/ticket.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current ticket route**

```bash
cat src/api/routes/ticket.py
```

- [ ] **Step 2: Create `ticket_service.py`**

```python
# src/services/ticket_service.py
"""答疑工单业务逻辑。"""

from src.exceptions import PermissionDeniedError
from src.services.base import BaseService
from src.storage.interfaces.ticket_store import BaseTicketStore


class TicketService(BaseService):
    """答疑工单：创建、回答、状态流转。"""

    def __init__(self, ticket_store: BaseTicketStore) -> None:
        super().__init__()
        self._ticket_store = ticket_store

    def create(
        self,
        student_id: int,
        mentor_id: int,
        conversation_id: int,
        message_id: int,
        question: str,
    ) -> dict:
        """学生创建答疑工单。"""
        return self._ticket_store.create_qa_request(
            student_id=student_id,
            mentor_id=mentor_id,
            conversation_id=conversation_id,
            message_id=message_id,
            question=question,
        )

    def answer(self, request_id: int, answer: str, answerer_id: int) -> dict:
        """导师回答工单。

        Args:
            request_id: 工单 ID。
            answer: 回答文本。
            answerer_id: 当前用户 ID（用于鉴权验证）。
        """
        ticket = self._ticket_store.get_qa_request(request_id)
        if not ticket:
            from src.exceptions import DocumentNotFoundError
            raise DocumentNotFoundError(f"工单 {request_id} 不存在")
        if ticket["mentor_id"] != answerer_id:
            raise PermissionDeniedError("只有对应导师可以回答此工单")
        result = self._ticket_store.update_qa_request(request_id, answer=answer)
        return result

    def list_tickets(
        self,
        mentor_id: int | None = None,
        student_id: int | None = None,
        status: str | None = None,
    ) -> list[dict]:
        """列出工单，支持按导师/学生/状态过滤。"""
        return self._ticket_store.list_qa_requests(
            mentor_id=mentor_id,
            student_id=student_id,
            status=status,
        )

    def get(self, request_id: int) -> dict | None:
        """查询单个工单。"""
        return self._ticket_store.get_qa_request(request_id)
```

- [ ] **Step 3: Add `get_ticket_service` to `api/deps.py`**

```python
from src.services.ticket_service import TicketService


def get_ticket_service(
    ticket_store: TicketStore = Depends(get_ticket_store),
) -> TicketService:
    return TicketService(ticket_store=ticket_store)
```

- [ ] **Step 4: Thin `api/routes/ticket.py`** — 删除直接 Store 调用，改为调 `TicketService`（路由路径不变）。

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.services.ticket_service import TicketService
from src.api.routes.ticket import router
print('ticket OK')
"
```

Expected: `ticket OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/ticket_service.py src/api/deps.py src/api/routes/ticket.py
git commit -m "feat(services): add TicketService, thin ticket route"
```

---

### Task 2-F: `UserService`

**Files:**
- Create: `src/services/user_service.py`
- Modify: `src/api/routes/user.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current user route**

```bash
cat src/api/routes/user.py
```

- [ ] **Step 2: Create `user_service.py`**

```python
# src/services/user_service.py
"""用户管理：CRUD + 批量导入 + 导师关系。"""

import io

import openpyxl

from src.exceptions import UserNotFoundError
from src.services.base import BaseService
from src.storage.interfaces.user_store import BaseUserStore


class UserService(BaseService):
    """用户管理业务逻辑。"""

    def __init__(self, user_store: BaseUserStore) -> None:
        super().__init__()
        self._user_store = user_store

    def list_users(
        self,
        role: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> list[dict]:
        return self._user_store.list_users(role=role, page=page, page_size=page_size)

    def get_user(self, user_id: int) -> dict:
        user = self._user_store.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        return user

    def update_user(self, user_id: int, **kwargs: object) -> dict:
        user = self._user_store.update_user(user_id, **kwargs)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        return user

    def delete_user(self, user_id: int) -> None:
        self.get_user(user_id)  # 确认存在
        self._user_store.delete_user(user_id)

    def set_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        """建立导师-学生关系。"""
        self._user_store.add_mentor_relation(mentor_id, student_id)

    def remove_mentor_relation(self, mentor_id: int, student_id: int) -> None:
        """解除导师-学生关系。"""
        self._user_store.remove_mentor_relation(mentor_id, student_id)

    def list_mentor_students(self, mentor_id: int) -> list[dict]:
        return self._user_store.list_mentor_students(mentor_id)

    def get_student_mentor(self, student_id: int) -> dict | None:
        return self._user_store.get_student_mentor(student_id)

    def import_students_from_xlsx(self, file_bytes: bytes, password_hash: str) -> dict:
        """批量导入学生账号，返回 {imported, errors}。

        Excel 格式：第一行为表头，列依次为 username, display_name, student_id, major, grade。
        """
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes))
        ws = wb.active
        imported = 0
        errors: list[dict] = []
        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            username = str(row[0]).strip() if row[0] else ""
            display_name = str(row[1]).strip() if len(row) > 1 and row[1] else ""
            student_id_str = str(row[2]).strip() if len(row) > 2 and row[2] else ""
            major = str(row[3]).strip() if len(row) > 3 and row[3] else ""
            grade = str(row[4]).strip() if len(row) > 4 and row[4] else ""
            if not username:
                errors.append({"row": i, "error": "username 为空"})
                continue
            try:
                user = self._user_store.create_user(
                    username=username,
                    password_hash=password_hash,
                    role="student",
                    display_name=display_name,
                )
                if student_id_str:
                    self._user_store.upsert_student_profile(
                        user["id"], student_id=student_id_str, major=major, grade=grade
                    )
                imported += 1
            except Exception as e:
                errors.append({"row": i, "error": str(e)})
        return {"imported": imported, "errors": errors}
```

- [ ] **Step 3: Add `get_user_service` to `api/deps.py`**

```python
from src.services.user_service import UserService


def get_user_service(
    user_store: UserStore = Depends(get_user_store),
) -> UserService:
    return UserService(user_store=user_store)
```

- [ ] **Step 4: Thin `api/routes/user.py`** — 删除直接 Store 调用，改为调 `UserService`。

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.services.user_service import UserService
from src.api.routes.user import router
print('user OK')
"
```

Expected: `user OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/user_service.py src/api/deps.py src/api/routes/user.py
git commit -m "feat(services): add UserService, thin user route"
```

---

### Task 2-G: `DocumentService`

**Files:**
- Create: `src/services/document_service.py`
- Modify: `src/api/routes/document.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current document route**

```bash
cat src/api/routes/document.py
```

- [ ] **Step 2: Create `document_service.py`**

```python
# src/services/document_service.py
"""文档上传、索引触发、下载、删除。"""

import asyncio

from src.exceptions import DocumentNotFoundError, IndexingError, KnowledgeBaseNotFoundError
from src.services.base import BaseService
from src.storage.interfaces.doc_store import BaseDocStore
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.vector_store import VectorStore


class DocumentService(BaseService):
    """文档生命周期管理。"""

    def __init__(
        self,
        doc_store: BaseDocStore,
        kb_store: BaseKBStore,
        vector_store: VectorStore,
    ) -> None:
        super().__init__()
        self._doc_store = doc_store
        self._kb_store = kb_store
        self._vector_store = vector_store

    def list_documents(self, kb_name: str) -> list[dict]:
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")
        return self._doc_store.list_documents(kb_name)

    def get_document(self, doc_id: int) -> dict:
        doc = self._doc_store.get_document(doc_id)
        if not doc:
            raise DocumentNotFoundError(f"文档 {doc_id} 不存在")
        return doc

    async def upload_and_index(
        self,
        kb_name: str,
        file_name: str,
        file_bytes: bytes,
        doc_type: str = "plain_text",
        splitter_type: str = "recursive",
        chunk_size: int = 256,
    ) -> dict:
        """保存文件并触发索引流水线，返回文档行 dict。

        文件持久化和索引在 asyncio.to_thread 内执行，不阻塞事件循环。
        """
        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")

        # 先写元数据，状态 = pending
        doc = self._doc_store.add_document(
            kb_name=kb_name,
            file_name=file_name,
            file_size=len(file_bytes),
            doc_type=doc_type,
            splitter_type=splitter_type,
            chunk_size=chunk_size,
            status="pending",
        )

        # 异步触发索引（同步函数用 to_thread 包装）
        try:
            from src.core.indexing import index_document  # 将在 Phase 4 后存在
            chunk_count = await asyncio.to_thread(
                index_document,
                file_bytes=file_bytes,
                file_name=file_name,
                kb_name=kb_name,
                doc_id=doc["id"],
                doc_type=doc_type,
                splitter_type=splitter_type,
                chunk_size=chunk_size,
            )
            self._doc_store.update_document(doc["id"], status="completed", chunk_count=chunk_count)
        except Exception as e:
            self._doc_store.update_document(doc["id"], status="failed")
            self.logger.error("[DocumentService] 索引失败 doc_id=%d: %s", doc["id"], e)
            raise IndexingError(f"文档索引失败：{e}") from e

        return self._doc_store.get_document(doc["id"])

    def delete(self, doc_id: int) -> dict:
        """删除文档（同时清理向量库）。"""
        doc = self._doc_store.get_document(doc_id)
        if not doc:
            raise DocumentNotFoundError(f"文档 {doc_id} 不存在")
        self._vector_store.delete_document_vectors(doc_id, doc["kb_name"])
        deleted = self._doc_store.delete_document(doc_id)
        return deleted
```

- [ ] **Step 3: Add `get_document_service` to `api/deps.py`**

```python
from src.services.document_service import DocumentService


def get_document_service(
    doc_store: DocStore = Depends(get_doc_store),
    kb_store: KBStore = Depends(get_kb_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> DocumentService:
    return DocumentService(
        doc_store=doc_store,
        kb_store=kb_store,
        vector_store=vector_store,
    )
```

- [ ] **Step 4: Thin `api/routes/document.py`** — 删除直接 Store 调用，改为调 `DocumentService`。

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.services.document_service import DocumentService
from src.api.routes.document import router
print('document OK')
"
```

Expected: `document OK`

- [ ] **Step 6: Commit**

```bash
git add src/services/document_service.py src/api/deps.py src/api/routes/document.py
git commit -m "feat(services): add DocumentService, thin document route"
```

---

### Task 2-H: `ChatService` (最复杂，最后做)

**Files:**
- Create: `src/services/chat_service.py`
- Modify: `src/api/routes/chat.py`
- Modify: `src/api/deps.py`

- [ ] **Step 1: Read current chat route**

```bash
cat src/api/routes/chat.py
```

- [ ] **Step 2: Create `chat_service.py`**

```python
# src/services/chat_service.py
"""聊天业务编排：FAQ 防线 → RAG pipeline → SSE 事件流。"""

import asyncio
import logging
from collections.abc import AsyncGenerator, Callable

from src.services.base import BaseService
from src.storage.interfaces.settings_store import BaseSettingsStore

logger = logging.getLogger(__name__)


class ChatService(BaseService):
    """聊天业务编排：FAQ 防线 → RAG pipeline → SSE 事件流。

    SSE 边界划分：
    - 本类只产出事件 dict，不知道 HTTP 协议。
    - api/routes/chat.py 负责把 AsyncGenerator 包装成 EventSourceResponse。
    """

    def __init__(
        self,
        faq_matcher,            # src.core.faq_match.FAQMatcher 实例
        rag_orchestrator,       # src.core.agent.factory.build_orchestrator() 返回值
        retriever_factory: Callable,   # 接受 kb_name: str，返回 HybridRetriever
        settings_store: BaseSettingsStore,
    ) -> None:
        super().__init__()
        self._faq_matcher = faq_matcher
        self._rag_orchestrator = rag_orchestrator
        self._retriever_factory = retriever_factory
        self._settings_store = settings_store

    async def stream_response(
        self,
        query: str,
        kb_name: str,
        history: list[dict],
        user_id: int,
    ) -> AsyncGenerator[dict, None]:
        """生成 SSE 事件流。

        Yields:
            dict，包含 event 字段，取值：
            status / token / sources / file / suggestions / done
        """
        # 1. FAQ 防线
        yield {"event": "status", "data": "正在匹配知识库..."}
        faq_result = await asyncio.to_thread(
            self._faq_matcher.match, query, kb_name
        )
        if faq_result and "[FALLBACK]" not in faq_result.get("answer", ""):
            yield {"event": "token", "data": faq_result["answer"]}
            yield {"event": "done", "data": ""}
            return

        # 2. RAG pipeline
        yield {"event": "status", "data": "正在检索知识库..."}
        retriever = self._retriever_factory(kb_name)

        async def _run_rag():
            from src.core.agent.factory import stream_rag  # noqa: PLC0415
            async for event in stream_rag(
                query=query,
                retriever_fn=retriever.retrieve,
                kb_name=kb_name,
                history=history,
                orchestrator=self._rag_orchestrator,
            ):
                yield event

        async for event in _run_rag():
            yield event
```

> **注意：** `stream_rag` 的具体导入路径取决于 `core/agent/factory.py` 的现有实现。请先 `cat src/core/agent/factory.py` 确认函数名，按实际路径调整上面的 import。

- [ ] **Step 3: Add `get_chat_service` to `api/deps.py`**

```python
from src.core.faq_match import FAQMatcher
from src.core.agent.factory import build_orchestrator
from src.core.rag.retriever import HybridRetriever
from src.services.chat_service import ChatService


def get_chat_service(
    settings_store: SettingsStore = Depends(get_settings_store),
) -> ChatService:
    faq_matcher = FAQMatcher()
    rag_orchestrator = build_orchestrator()

    def retriever_factory(kb_name: str) -> HybridRetriever:
        return HybridRetriever(kb_name=kb_name)

    return ChatService(
        faq_matcher=faq_matcher,
        rag_orchestrator=rag_orchestrator,
        retriever_factory=retriever_factory,
        settings_store=settings_store,
    )
```

- [ ] **Step 4: Thin `api/routes/chat.py`** — 删除直接 `core/` 调用，改为调 `ChatService`，保留 `EventSourceResponse` 包装：

```python
# src/api/routes/chat.py
"""SSE 流式聊天接口。"""

import json
import logging

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from src.api.auth import get_current_user
from src.api.deps import get_chat_service
from src.api.schemas import ChatRequest
from src.services.chat_service import ChatService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    chat_service: ChatService = Depends(get_chat_service),
) -> EventSourceResponse:
    async def event_generator():
        async for event in chat_service.stream_response(
            query=body.query,
            kb_name=body.kb_name,
            history=body.history or [],
            user_id=current_user["id"],
        ):
            yield {"event": event["event"], "data": json.dumps(event.get("data", ""), ensure_ascii=False)}

    return EventSourceResponse(event_generator())
```

- [ ] **Step 5: Smoke test**

```bash
poetry run python -c "
from src.api.routes.chat import router
from src.services.chat_service import ChatService
import src.api.routes.chat as m
import inspect
src_code = inspect.getsource(m)
assert 'from src.core.faq_match' not in src_code, 'chat route still imports core directly'
print('chat OK')
"
```

Expected: `chat OK`

- [ ] **Step 6: Phase 2 final compliance check**

```bash
# services 层不得 import fastapi
grep -r "from fastapi\|import fastapi" src/services/
# routes 层不得直接 import storage 或 core
grep -r "from src.storage\|from src.core" src/api/routes/
```

两条命令均无输出。

- [ ] **Step 7: Commit**

```bash
git add src/services/chat_service.py src/api/deps.py src/api/routes/chat.py
git commit -m "feat(services): add ChatService, thin chat route — Phase 2 complete"
```

---

*Plan: Phase 2 | Created: 2026-05-28*
