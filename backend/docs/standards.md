# 后端开发规范

> **作用**：约束 `backend/` 内部所有代码的目录布局、分层依赖、命名、编码、测试和异常处理。
>
> **范围**：仅适用于 `backend/`。顶层目录规范见 [docs/directory-layout.md](../../docs/directory-layout.md)。前端规范见 [frontend/docs/standards.md](../../frontend/docs/standards.md)。
>
> **强制级别**：每条规则标【强制】【推荐】【参考】。【强制】违反即架构问题，CI 应当能机器检测；【推荐】是公认最佳实践，无充分理由不应违反；【参考】是建议，可按场景调整。
>
> **状态**：目标态。当前代码尚未完成迁移，待落地清单见文末附录。

---

## 目录

1. [目录布局](#1-目录布局)
2. [分层依赖规则](#2-分层依赖规则)
3. [文件大小硬约束](#3-文件大小硬约束)
4. [命名与导出规范](#4-命名与导出规范)
5. [各层编码规范](#5-各层编码规范)
6. [异常处理](#6-异常处理)
7. [数据库约定](#7-数据库约定)
8. [测试规范](#8-测试规范)
9. [新增功能标准流程](#9-新增功能标准流程)
10. [禁止事项](#10-禁止事项)
11. [附录：待落地清单](#11-附录待落地清单)

---

## 1. 目录布局

```
backend/
├── src/
│   ├── main.py                     # 启动入口（dev / start 脚本）
│   ├── config.py                   # 配置加载（YAML + env + DB 三级优先级）
│   ├── exceptions.py               # 全局业务异常（四层之外，所有层可 import）
│   │
│   ├── api/                        # ★ 第一层：HTTP 控制层
│   │   ├── app.py                  # FastAPI 实例 + CORS + 全局异常 handler + startup
│   │   ├── auth.py                 # JWT 生成/验证、密码哈希、角色守卫依赖
│   │   ├── deps.py                 # 统一依赖注入工厂（所有 Service 在这里创建）
│   │   ├── schemas/                # Pydantic 请求/响应模型（按业务域分文件）
│   │   │   ├── auth.py / chat.py / document.py / faq.py
│   │   │   ├── user.py / ticket.py / knowledge.py / common.py
│   │   │   └── __init__.py         # re-export 所有模型
│   │   └── routes/                 # 路由文件（每函数 ≤ 30 行）
│   │       ├── auth.py / chat.py / document.py / faq.py
│   │       ├── knowledge.py / user.py / ticket.py / config.py / analytics.py
│   │
│   ├── services/                   # ★ 第二层：业务编排层
│   │   ├── base.py                 # BaseService（可选基类，提供 logger）
│   │   ├── chat_service.py         # 聊天编排：FAQ 防线 + RAG pipeline + SSE
│   │   ├── document_service.py
│   │   ├── faq_service.py
│   │   ├── knowledge_service.py
│   │   ├── user_service.py
│   │   ├── ticket_service.py
│   │   ├── config_service.py
│   │   ├── conversation_service.py
│   │   ├── analytics_service.py
│   │   └── user_import.py          # 用户批量导入（Excel）
│   │
│   ├── core/                       # ★ 第三层：AI 核心层
│   │   ├── interfaces/             # Protocol/ABC 接口定义
│   │   │   ├── retriever.py / reranker.py / generator.py
│   │   │   ├── faq.py / safety.py / store.py
│   │   ├── shared/                 # 跨子模块共享基础设施
│   │   │   ├── llm_factory.py      # LLM 实例工厂
│   │   │   ├── embedding.py        # Embedding 工厂
│   │   │   └── eval_base.py        # EvaluatorOutput dataclass（10 行）
│   │   ├── preprocessing/          # 【目标态】文档预处理（待迁入）
│   │   │   ├── splitter.py         # 文本切分基类 + 工厂
│   │   │   ├── splitter_manual.py  # 操作手册步骤切分
│   │   │   └── image_describer.py  # VLM 图片描述
│   │   ├── rag/                    # 检索基础设施
│   │   │   ├── retriever.py        # Vector / BM25 / Hybrid
│   │   │   ├── reranker.py         # DashScope GTE-Rerank
│   │   │   ├── query_enhancer.py   # 规则查询扩写
│   │   │   └── embedding.py
│   │   ├── indexing/               # 文档索引流水线
│   │   │   ├── dispatcher.py       # 按 doc_type 分发
│   │   │   ├── policy.py / manual.py / form.py
│   │   │   └── _helpers.py
│   │   ├── agent/                  # 主 RAG Agent（自包含）
│   │   │   ├── state.py / orchestrator.py / factory.py
│   │   │   ├── prompts.py / safety_guards.py
│   │   │   ├── router.py / grader.py / rewriter.py
│   │   │   ├── generator.py / document_linker.py
│   │   │   └── tools/              # Agent 工具
│   │   │       ├── calendar.py     # get_academic_calendar
│   │   │       └── knowledge.py    # search_knowledge_base
│   │   ├── cleaning/               # LangGraph 子图：文档清洗
│   │   ├── form_extraction/        # LangGraph 子图：表单提取
│   │   └── faq_match.py            # FAQ 防线算法（业务专属，留根）
│   │
│   ├── storage/                    # ★ 第四层：数据访问层
│   │   ├── database.py             # PyMySQL 连接池
│   │   ├── interfaces/             # Store Protocol 接口
│   │   │   ├── kb_store.py / doc_store.py / faq_store.py
│   │   │   ├── conversation_store.py / ticket_store.py
│   │   │   ├── user_store.py / settings_store.py
│   │   ├── kb_store.py / doc_store.py / faq_store.py
│   │   ├── conversation_store.py / ticket_store.py
│   │   ├── user_store.py / settings_store.py
│   │   ├── vector_store.py         # Qdrant 封装
│   │   └── document_store.py       # 向后兼容聚合入口（不接受新方法）
│   │
│   └── parsers/                    # 文档解析器（IO/基础设施层）
│       ├── base.py / registry.py / converter.py
│       ├── docx_parser.py / txt_parser.py
│       └── pdf/                    # PDF 解析子目录
│
├── tests/                          # pytest 测试（镜像 src/ 结构）
│   ├── conftest.py
│   ├── api/ services/ core/ storage/ parsers/
│
├── evaluation/                     # RAG 评测套件（与 tests/ 平级）
│   ├── datasets/
│   ├── runners/
│   │   ├── ragas_runner.py
│   │   └── dataset_runner.py
│   └── reports/                    # gitignore
│
├── configs/
│   └── config.yaml
├── sql/
│   └── init.sql
├── scripts/                        # 一次性工具：seed / migrate / normalize
├── data/                           # 运行时数据（gitignore）
│
├── pyproject.toml
├── poetry.lock
├── Dockerfile
├── .gitignore
├── .env.example
├── CLAUDE.md
├── README.md
└── docs/
    ├── standards.md                # 本文件
    ├── architecture.md
    └── adr/
```

---

## 2. 分层依赖规则

### 2.1 【强制】单向依赖

```
api/routes  →  services  →  core
                         →  storage

所有层都可 import src/exceptions.py（不计入依赖）
```

| 层 | 可以 import | 禁止 import |
|----|------------|-------------|
| `api/routes/` | `services/`、`api/schemas/`、`api/auth.py`、`api/deps.py`、`exceptions.py` | `core/`、`storage/`（直接） |
| `services/` | `core/`、`storage/`、`parsers/`、`exceptions.py` | `fastapi`（除 `Depends` 仅在 deps.py 用）、`api/` |
| `core/` | `core/` 内部、`exceptions.py`、`parsers/`（受限） | `api/`、`storage/`、`services/` |
| `storage/` | `storage/database.py`、`exceptions.py` | 其他三层任何东西 |
| `parsers/` | 第三方库、`exceptions.py` | `api/`、`services/`、`core/`、`storage/` |

### 2.2 【强制】违规自检命令

CI 阶段执行，任一条命令有输出即为违规：

```bash
# routes 直接 import storage/core（应该走 services）
grep -rn "from src.storage\|from src.core" backend/src/api/routes/

# services 层 import fastapi（Request/HTTPException 等）
grep -rn "from fastapi\|^import fastapi" backend/src/services/

# core 层 import storage/api/services（违反层级）
grep -rn "from src.storage\|from src.api\|from src.services" backend/src/core/

# storage 层 import 其他三层
grep -rn "from src.core\|from src.api\|from src.services" backend/src/storage/
```

### 2.3 【强制】不同 Agent 不得共享 prompts

`core/agent/`、`core/cleaning/`、`core/form_extraction/` 各自独立的 LangGraph 子图，每个子图的 `prompts.py` 只服务本子图，不得跨子图 import。

**反例**：
```python
# ❌ core/cleaning/nodes.py
from src.core.agent.prompts import ROUTER_PROMPT   # 越界
```

**正例**：
```python
# ✅ 每个子图自己写 prompts，重复也比耦合好
# core/cleaning/prompts.py
CLEANER_PROMPT = ChatPromptTemplate.from_messages([...])
```

---

## 3. 文件大小硬约束

| 文件类型 | 行数上限 | 超出后操作 |
|---------|---------|-----------|
| 接口文件（Protocol/ABC） | 150 | 按职责拆成多文件，按组件分组 |
| 实现文件（Service/Store/节点） | 250 | 改成同名包（目录），内部拆文件 |
| 路由函数（单个） | 30 | 业务逻辑下移到 Service |
| 节点函数（单个） | 100 | 抽出辅助函数，节点保持薄 |
| Pydantic schema 单个 | 100 | 按业务域拆分 schema 文件 |
| **规则集中文件**（如 `safety_guards.py`、`prompts.py`） | 400 | 单个规则文件的天然形态，可保留 |

### 3.1 关于行数上限的说明

- **接口文件 150 行**：放宽自原 100。Python Protocol/ABC 配 Google docstring 后 100 行容易溢出，150 行允许 8-10 个方法 + 完整 docstring，是务实平衡。
- **实现文件 250 行**：放宽自原 200。带完整 Google docstring 的 Service / Store / 节点函数往往单方法 30-50 行，250 行约对应 5-8 个方法的合理体量。**超过 250 行才走拆包**。
- **规则集中文件 400 行**：`safety_guards.py`（拦截规则）、`prompts.py`（提示词模板）、长枚举类等是"规则列表的天然集中点"，拆开反而难维护。该类文件由 review 时人工判断"是否还在做一件事"，行数仅供参考。

### 拆包示例：超 200 行的 Service

```
services/chat_service/
    __init__.py       # re-export ChatService 主类
    service.py        # ChatService 主类（含 __init__ 和共享辅助方法）
    _faq.py           # FaqMixin：FAQ 防线相关方法
    _rag.py           # RagMixin：RAG 编排相关方法
    _sse.py           # SseMixin：SSE 事件生成方法
```

外部调用永远 `from src.services.chat_service import ChatService`，内部拆分不影响调用方。

### 3.2 推荐用 Mixin 而非组合

Service 拆包时**推荐用多 Mixin 装配同一个类**，而非"主 Service 持有子 Service 实例"的组合方式：

**正例（Mixin）**：
```python
# services/faq_service/service.py
class FAQService(CrudMixin, ExcelMixin, SearchMixin, BaseService):
    def __init__(self, ...):
        super().__init__()
        self._faq_store = ...
        # 共享辅助方法
    def _require_kb(self, kb_name): ...
```

**反例（组合 + delegate）**：
```python
class FAQService(BaseService):
    def __init__(self, ...):
        self._crud = _FAQCrud(...)
        self._excel = _FAQExcel(...)
    def create(self, ...):           # 大量 delegate boilerplate
        return self._crud.create(...)
```

**理由**：
- Mixin 让主类调用方无感知（保持原有 `service.method()` 调用方式）
- 不增加 delegate 转发样板代码
- 共享辅助方法（如 `_require_kb`）放主类，各 Mixin 通过 `self` 自然调用
- 缺点是 Python 多继承，但只要每个 Mixin 只做单一职责、不互相 import，可控

**Mixin 内部约定**：
- 文件名下划线开头（`_crud.py`、`_excel.py`），表明私有实现
- 类名 `XxxMixin` 后缀
- 顶部用前向声明语法注明依赖的实例属性（供类型检查器使用）
- 不写 `__init__`，全部依赖 `FAQService` 的 `__init__`

---

## 4. 命名与导出规范

### 4.1 【强制】文件与模块命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 模块/包 | `snake_case` | `faq_service.py`、`document_store.py` |
| 类 | `PascalCase` | `FAQService`、`HybridRetriever` |
| 函数/变量 | `snake_case` | `get_faq()`、`hybrid_retriever` |
| 常量 | `UPPER_SNAKE_CASE` | `FALLBACK_MARKER`、`DEFAULT_TOP_K` |
| LangGraph 节点函数 | `_node` 结尾 | `router_node`、`grader_node` |
| 条件路由函数 | `_should_` 开头 | `_should_continue`、`_should_rewrite` |
| LangChain 工具函数 | 动词 + 名词 | `search_knowledge_base`、`list_kb_documents` |
| 私有模块/函数 | `_` 前缀 | `_helpers.py`、`_apply_safety_guards()` |

### 4.2 【强制】类型标注

所有**公共函数**必须有完整的参数和返回值类型标注。

**正例**：
```python
def retrieve(self, query: str, top_k: int = 10) -> list[RetrievedNode]:
    ...

def make_search_kb_tool(
    retriever_fn: Callable[[str], list[dict]],
    captured_nodes: list[dict],
) -> BaseTool:
    ...
```

**反例**：
```python
# ❌ 公共函数无类型
def retrieve(self, query, top_k=10):
    ...
```

私有函数（`_` 前缀）按需添加，但鼓励标注。

### 4.3 【强制】Docstring 格式（Google Style）

所有公共函数和类必须使用 Google 风格 docstring。

**正例**：
```python
def rerank(self, query: str, nodes: list[dict], top_n: int = 5) -> list[dict]:
    """对候选文档进行语义重排序。

    Args:
        query: 用户查询文本。
        nodes: 候选文档列表，每个元素包含 text 和 metadata。
        top_n: 返回排名前 N 的结果。

    Returns:
        按相关性降序排列的文档列表。

    Raises:
        httpx.TimeoutException: DashScope API 请求超时。
    """
```

**反例**：
```python
# ❌ 缺 docstring
def rerank(self, query, nodes, top_n=5):
    ...

# ❌ Sphinx 或 NumPy 风格
def rerank(self, query, nodes, top_n=5):
    """
    :param query: ...
    :param nodes: ...
    """
```

### 4.4 【强制】Import 顺序

由 Ruff（isort 规则）自动排序，三组之间空一行：

```python
# 1. 标准库
import json
import logging
from datetime import date

# 2. 第三方库
from fastapi import APIRouter, Depends
from langchain_core.messages import HumanMessage

# 3. 本项目（src 为 first-party）
from src.config import get_config
from src.core.rag.retriever import HybridRetriever
from src.exceptions import FAQNotFoundError
```

### 4.5 【推荐】Async 边界

- FastAPI 路由使用 `async def`
- LangGraph 同步图调用必须用 `asyncio.to_thread` 包装

**正例**：
```python
# ✅ 同步图用 to_thread 包装
result = await asyncio.to_thread(graph.invoke, state)
```

**反例**：
```python
# ❌ 在 async 路由里直接调用同步图，阻塞事件循环
@router.post("/chat")
async def chat(...):
    result = graph.invoke(state)   # 错
```

---

## 5. 各层编码规范

### 5.1 `api/` — HTTP 控制层

#### 5.1.1 【强制】路由函数只做"翻译"

路由函数职责：解析请求 → 调用 Service → 返回响应。**不写业务逻辑**。

**正例**：
```python
# api/routes/faq.py
@router.post("/", response_model=FAQResponse)
async def create_faq(
    body: FAQCreateRequest,
    current_user: dict = Depends(get_current_user),
    faq_service: FAQService = Depends(get_faq_service),
) -> FAQResponse:
    return await faq_service.create(
        kb_name=body.kb_name,
        question=body.question,
        answer=body.answer,
        created_by=current_user["id"],
    )
```

**反例**：
```python
# ❌ 路由里写业务逻辑
@router.post("/")
async def create_faq(body: FAQCreateRequest):
    # ❌ 直接调 storage
    if not document_store.get_kb(body.kb_name):
        raise HTTPException(404, "KB 不存在")

    # ❌ 业务编排
    faq_id = document_store.create_faq(body.kb_name, body.question, body.answer)
    await vector_store.upsert_faq(faq_id, body.question, body.answer, body.kb_name)
    return document_store.get_faq(faq_id)
```

#### 5.1.2 【强制】所有依赖通过 `deps.py` 注入

新增 Service 时，**先在 `api/deps.py` 注册工厂函数**，路由函数只通过 `Depends(get_xxx_service)` 拿到实例。

**正例**：
```python
# api/deps.py
def get_faq_store() -> FAQStore:
    return FAQStore()

def get_faq_service(
    faq_store: FAQStore = Depends(get_faq_store),
    vector_store: VectorStore = Depends(get_vector_store),
    faq_matcher: FAQMatcher = Depends(get_faq_matcher),
) -> FAQService:
    return FAQService(faq_store, vector_store, faq_matcher)
```

**反例**：
```python
# ❌ 路由函数内手动 new
@router.post("/")
async def create_faq(body: FAQCreateRequest):
    faq_service = FAQService(FAQStore(), VectorStore(), FAQMatcher())   # 错
    ...
```

#### 5.1.3 【强制】不在路由内捕获业务异常

业务异常由 `app.py` 的全局 handler 统一转 HTTP 响应。

**正例**：
```python
# ✅ 路由不处理异常
@router.delete("/{faq_id}")
async def delete_faq(faq_id: int, faq_service: FAQService = Depends(get_faq_service)):
    await faq_service.delete(faq_id)   # 抛 FAQNotFoundError 由全局 handler 接管
    return {"ok": True}

# ✅ app.py 全局 handler
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.http_status,
        content={"code": exc.code, "message": str(exc)},
    )
```

**反例**：
```python
# ❌ 路由内 try/except 业务异常
@router.delete("/{faq_id}")
async def delete_faq(faq_id: int):
    try:
        await faq_service.delete(faq_id)
    except FAQNotFoundError:
        raise HTTPException(404, "FAQ 不存在")   # 多此一举
```

#### 5.1.4 【强制】所有路由必须加认证依赖

```python
# 普通登录校验
def my_route(current_user: dict = Depends(get_current_user)): ...

# 仅 admin/teacher
def admin_route(current_user: dict = Depends(require_teacher_or_admin)): ...

# 仅 admin
def super_route(current_user: dict = Depends(require_admin)): ...
```

未加认证依赖的路由不允许合并（CI 应检测）。

#### 5.1.5 【强制】SSE 路由约定

- 使用 `EventSourceResponse`
- 阶段事件用 `event` 字段区分：`status` / `agent_action` / `token` / `sources` / `file` / `suggestions` / `done`
- Service 层产出 `AsyncGenerator[dict, None]`，路由层负责包装成 SSE 响应

#### 5.1.6 【推荐】Schema 按业务域分文件

避免单个 `schemas.py` 膨胀（之前 375 行），按业务域拆到 `schemas/<domain>.py`。

`schemas/__init__.py` re-export 所有模型，保持现有 import 路径不变：

```python
# api/schemas/__init__.py
from .auth import LoginRequest, TokenResponse
from .chat import ChatRequest, SSEEvent
from .faq import FAQCreateRequest, FAQResponse
# ...
```

---

### 5.2 `services/` — 业务编排层

#### 5.2.1 【强制】Service 通过构造参数接收依赖

不在方法体内 `new` 任何具体实现（无法测试）。

**正例**：
```python
class FAQService:
    def __init__(
        self,
        faq_store: BaseFAQStore,        # 注入接口，不注入具体类
        vector_store: VectorStore,
        faq_matcher: FAQMatcher,
    ):
        self._faq_store = faq_store
        self._vector_store = vector_store
        self._faq_matcher = faq_matcher
```

**反例**：
```python
class FAQService:
    def __init__(self):
        self._faq_store = FAQStore()        # ❌ 硬编码具体类
        self._vector_store = VectorStore()  # ❌ 无法 mock
```

#### 5.2.2 【强制】Service 不抛 `HTTPException`

只抛业务异常（`AppException` 的子类）。HTTP 翻译由 api 层全局 handler 完成。

**正例**：
```python
async def delete(self, faq_id: int) -> None:
    faq = self._faq_store.get_faq(faq_id)
    if not faq:
        raise FAQNotFoundError(f"FAQ {faq_id} 不存在")   # ✅ 业务异常
    ...
```

**反例**：
```python
async def delete(self, faq_id: int):
    if not faq:
        raise HTTPException(404, "FAQ 不存在")   # ❌ Service 不知道 HTTP
```

#### 5.2.3 【强制】一个 Service 只负责一个业务域

跨域协作通过注入多个 Service 实现，**不在一个 Service 内做多个业务领域的工作**。

**反例**：
```python
# ❌ 一个 Service 跨多个领域
class MegaService:
    def create_faq(self, ...): ...
    def upload_document(self, ...): ...
    def manage_users(self, ...): ...
```

#### 5.2.4 【强制】Service 间协作通过依赖注入

**正例**：
```python
class ChatService:
    def __init__(
        self,
        faq_matcher: FAQMatcher,
        rag_orchestrator,
        settings_store: BaseSettingsStore,
    ): ...
```

**反例**：
```python
class ChatService:
    def some_method(self):
        from src.services.faq_service import FAQService   # ❌ 函数体内 import 注入
        faq_service = FAQService(...)
```

#### 5.2.5 【推荐】使用 `BaseService` 基类

提供统一日志前缀，非强制但鼓励：

```python
class BaseService:
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

class FAQService(BaseService):
    def __init__(self, ...):
        super().__init__()
        ...
```

#### 5.2.6 【强制】LangGraph 同步调用必须 to_thread

```python
# ✅ Service 调 LangGraph
result = await asyncio.to_thread(graph.invoke, state)
```

---

### 5.3 `core/` — AI 核心层

#### 5.3.1 【强制】core 不知道 HTTP，不知道数据库

- 禁止 import `fastapi`、`Request`、`HTTPException`
- 禁止 import `src.storage`、`src.api`、`src.services`
- 数据通过参数传入，结果通过返回值传出

#### 5.3.2 【强制】节点函数只做单步逻辑

LangGraph 节点函数职责单一，不在节点内构造 LLM/Retriever，使用模块级工厂函数获取。

**正例**：
```python
# core/agent/router.py
from src.core.agent.prompts import ROUTER_PROMPT
from src.core.shared.llm_factory import get_llm

def router_node(state: AgentState) -> dict:
    """路由：判断走 hard_rag / download / direct。"""
    chain = ROUTER_PROMPT | get_llm("fast")
    result = chain.invoke({"query": state["query"]})
    return {"route": result.content.strip()}
```

**反例**：
```python
# ❌ 节点内 new LLM、写死配置
def router_node(state):
    llm = DashScope(model="qwen-turbo", api_key=os.getenv("DASHSCOPE_API_KEY"))
    ...
```

#### 5.3.3 【强制】RAG Agent 图全局只编译一次

```python
# core/agent/orchestrator.py
from functools import lru_cache

@lru_cache(maxsize=None)
def get_compiled_graph():
    builder = StateGraph(AgentState)
    builder.add_node("router", router_node)
    # ...
    return builder.compile()
```

#### 5.3.4 【强制】`retrieve_node` 是空占位

实际检索在 `run_rag()` / `stream_rag()` 外部循环中通过 `retriever_fn` 注入执行。**不要在 `retrieve_node` 内部写检索逻辑**。

#### 5.3.5 【强制】Safety guards 修改必须附测试用例

`core/agent/safety_guards.py` 内置硬编码规则拦截 LLM 高频错误答案。

**任何修改**必须同时在 `backend/tests/core/agent/test_safety_guards.py` 添加对应测试用例。不附测试用例的修改 CI 拒绝合并。

#### 5.3.6 【强制】提示词统一用 `ChatPromptTemplate`

```python
# ✅ 变量显式声明
ROUTER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "你是路由助手..."),
    ("human", "{query}"),
])
```

**反例**：
```python
# ❌ 字符串拼接
prompt = "你是路由助手...\n问题: " + query
```

#### 5.3.7 【强制】禁止改回 `create_react_agent`

`rag_pipeline.py` 必须保持手写 StateGraph。当前实现支持 CRAG 循环控制、路由决策、safety guards 拦截，`create_react_agent` 无法支持这些能力。

#### 5.3.8 【推荐】新增文档类型在 `core/indexing/`

按现有 `dispatcher.py` 分发模式：
1. 新建 `core/indexing/<type>.py`，继承 `BaseIndexingPipeline`
2. 在 `core/indexing/dispatcher.py` 加分发逻辑
3. 其他文件不动

#### 5.3.9 【推荐】新增 Agent 工具在 `core/agent/tools/`

1. 在 `core/agent/tools/<tool>.py` 定义 `@tool` 函数
2. 在 `core/agent/factory.py` 工具列表追加
3. docstring 必须写清楚：做什么 / 何时用 / 参数含义（LLM 看的）

#### 5.3.10 【强制】工具必须返回 `str`

```python
@tool
def search_knowledge_base(query: str) -> str:
    """从知识库检索文档片段。..."""
    try:
        nodes = retriever_fn(query)
        return format_nodes(nodes)
    except Exception as e:
        return f"检索失败：{e}"     # ✅ 返回友好字符串
```

工具内部异常必须捕获，返回友好字符串。**不抛异常出工具**。

---

### 5.4 `storage/` — 数据访问层

#### 5.4.1 【强制】Store 只做 SQL 操作

不写业务判断（`if` 业务条件属于 Service 层）。

**正例**：
```python
# ✅ Store 只查询
def get_faq(self, faq_id: int) -> dict | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM faqs WHERE id = %s", (faq_id,))
            return cur.fetchone()
    except Exception as e:
        logger.error("[FAQStore.get_faq] faq_id=%d error=%s", faq_id, e)
        raise StorageError(f"查询 FAQ 失败：{e}") from e
    finally:
        conn.close()
```

**反例**：
```python
# ❌ Store 里写业务判断
def get_faq(self, faq_id: int, current_user: dict) -> dict | None:
    if current_user["role"] != "admin":       # ❌ 权限判断属于 Service
        raise PermissionDeniedError()
    ...
```

#### 5.4.2 【强制】不在 Store 内调 VectorStore

向量操作由 Service 层协调。Store 只管单一数据源。

#### 5.4.3 【强制】所有数据库异常包装成 `StorageError`

不暴露原始 SQL 异常细节。

```python
try:
    cur.execute(...)
except Exception as e:
    raise StorageError(f"...") from e   # 保留原因链
```

#### 5.4.4 【强制】Store 实现对齐 Protocol 接口

每个 Store 在 `storage/interfaces/` 有对应 Protocol 定义。实现类的方法签名必须与 Protocol 完全匹配。

```python
# storage/interfaces/faq_store.py
class BaseFAQStore(Protocol):
    def get_faq(self, faq_id: int) -> dict | None: ...
    def list_faqs(self, kb_name: str, page: int, page_size: int) -> list[dict]: ...
    # ...

# storage/faq_store.py
class FAQStore:
    """FAQ 的 MySQL 数据访问实现，对齐 BaseFAQStore Protocol。"""
    def get_faq(self, faq_id: int) -> dict | None: ...  # 签名一致
```

#### 5.4.5 【强制】`document_store.py` 仅作向后兼容聚合

- 多继承聚合（KBStore + DocStore + FAQStore + ConversationStore + TicketStore + SettingsStore），不存在独有方法
- **禁止往里加新方法**：新功能用具体 Store
- **允许 import 它的位置（"wiring boundary"）**——这些是装配 Agent / Orchestrator 的边界点：
  1. **`api/deps.py` 的工厂函数**——FastAPI 依赖注入聚合
  2. **`evaluation/runners/*.py`**——评测 runner 自行装配 orchestrator
  3. **`tests/storage/test_document_store.py`**——专门测试聚合 facade
- 业务代码（`core/` / `services/` 的非工厂位置）要求类型标注用 `BaseDocumentStore` Protocol（来自 `core/interfaces/storage.py`），实际实例由 wiring boundary 注入
- 仅需 `get_setting` 等单一 store 方法的位置（如 `config.py`），**必须**直接用对应具体 Store（`SettingsStore` 等），不走聚合

#### 5.4.6 【推荐】连接通过外部注入

提升可测性。生产代码默认用全局 `get_conn`，测试时传入 mock：

```python
class FAQStore:
    def __init__(self, conn_factory: Callable = None):
        self._conn_factory = conn_factory or get_conn
```

---

### 5.5 `parsers/` — 文档解析层

#### 5.5.1 【强制】Parser 不调 LLM

文档解析是 IO/基础设施层，不应该调用 LLM。如果需要 LLM 处理（如图片描述、表格理解），应在 `core/preprocessing/` 处理，而非 parser 层。

#### 5.5.2 【推荐】新增 Parser 在 `parsers/` 用 registry 模式

按现有 `registry.py` 注册新解析器。

---

## 6. 异常处理

### 6.1 【强制】统一异常层级

所有业务异常继承 `src.exceptions.AppException`：

```python
# src/exceptions.py
class AppException(Exception):
    """所有业务异常的基类。"""
    code: str = "APP_ERROR"
    http_status: int = 400

class StorageError(AppException):
    code = "STORAGE_ERROR"
    http_status = 500

class DocumentNotFoundError(AppException):
    code = "DOCUMENT_NOT_FOUND"
    http_status = 404

# ... 详见 exceptions.py
```

### 6.2 【强制】异常流转规则

```
storage/   →  抛 StorageError（包装原始 DB 异常）
core/      →  抛 IndexingError / RAGError
services/  →  抛业务异常（FAQNotFoundError 等）
api/app.py →  全局 handler 转 JSONResponse
api/routes →  不处理异常，让全局 handler 接管
```

### 6.3 【强制】禁止裸 `except Exception: pass`

```python
# ❌
try:
    do_something()
except Exception:
    pass

# ✅ 至少要 log + 决定后续行为
try:
    do_something()
except SpecificException as e:
    logger.warning("[module] 操作失败: %s", e)
    return fallback_value
```

### 6.4 【强制】外部调用必须有超时

所有 HTTP / LLM / DB 调用都要带超时和异常分类处理：

```python
# ✅
try:
    resp = httpx.post(url, timeout=12)
    resp.raise_for_status()
except httpx.TimeoutException:
    logger.warning("[tool] 请求超时: %s", url)
    return "请求超时，请稍后重试。"
except httpx.HTTPStatusError as e:
    logger.error("[tool] HTTP %d: %s", e.response.status_code, url)
    return f"请求失败：{e.response.status_code}"
```

### 6.5 【强制】对外部数据防御性解析

```python
# ✅
result = json.loads(raw)
relevant = result.get("relevant", False)

# ❌
relevant = json.loads(raw)["relevant"]   # KeyError 会炸
```

### 6.6 【推荐】函数入口前置校验

```python
def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
    if not nodes:
        return []
    if not query.strip():
        return nodes
    # ...
```

---

## 7. 数据库约定

### 7.1 【强制】连接使用模板

```python
from src.storage.database import get_conn

conn = get_conn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT ...", (param,))
        row = cur.fetchone()   # DictCursor 返回 dict
    conn.commit()
finally:
    conn.close()
```

### 7.2 【强制】字段命名约定

| 字段 | 类型 |
|------|------|
| 主键 | `id INT AUTO_INCREMENT PRIMARY KEY` 或 `BIGINT UNSIGNED` |
| 时间戳 | `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` |
| 外键 | 必须 `ON DELETE CASCADE` 或 `ON DELETE SET NULL` |
| JSON 字段（sources/files） | 存 `TEXT`，读写时手动 `json.loads` / `json.dumps` |
| 软删除字段 | `deleted_at DATETIME NULL`（仅业务确实需要保留时） |

### 7.3 【强制】配置读取优先级

```
DB system_settings  >  环境变量  >  config.yaml 默认值
```

封装在 `src/config.py` 的 `get_api_key()` / `get_api_base_url()`，调用方不要自己拼优先级。

### 7.4 【强制】系统设置统一通过 SettingsStore

```python
# ✅
settings_store.get_setting("active_kb")
settings_store.set_setting("active_kb", kb_name)
```

常用 key：

| key | 说明 |
|-----|------|
| `active_kb` | 学生端知识库名 |
| `admin_kb` | 管理端知识库名 |
| `api_key` / `dashscope_api_key` | LLM API Key |
| `api_base_url` | LLM API Base URL |
| `cors_origins` | 允许的前端来源（JSON 数组） |

### 7.5 【强制】SQL 注入防护：值必须参数化

**核心规则**：用户输入的**值**绝对不允许字符串拼接进 SQL；动态**列名 / where 子句结构**可以拼接，但拼入的标识符必须来自代码内字面量。

**反例 1（值拼接，注入风险）**：
```python
# ❌ 值用 f-string 拼接
cur.execute(f"SELECT * FROM faqs WHERE kb_name = '{kb_name}'")
```

**正例 1（值参数化）**：
```python
# ✅ 值用 %s 占位，参数另传
cur.execute("SELECT * FROM faqs WHERE kb_name = %s", (kb_name,))
```

**正例 2（动态列名 / where 子句允许）**：
```python
# ✅ updates 的 key 来自代码内常量字段名，不来自用户输入
# 值仍然用 %s 占位，参数化传入
set_clause = ", ".join(f"{k} = %s" for k in updates)
values = list(updates.values()) + [user_id]
cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
```

**正例 3（动态 where 子句）**：
```python
# ✅ conditions 是代码内构造的 SQL 片段（如 ["role = %s", "is_active = %s"]）
# 值仍走参数化
where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
cur.execute(f"SELECT * FROM users {where}", params)
```

**底线**：任何拼入 SQL 字符串的**标识符**（表名、列名、子句结构）都必须在 Store 实现里有白名单或来自字段名枚举，**绝对不能**来自路由/Service 层透传的用户输入。

---

## 8. 测试规范

### 8.1 【强制】测试目录镜像 `src/`

```
backend/tests/
├── conftest.py             # 全局 fixture
├── api/                    # 镜像 src/api/
│   ├── conftest.py
│   ├── test_chat_sse.py
│   └── ...
├── services/               # 镜像 src/services/
│   ├── conftest.py
│   ├── test_faq_service.py
│   ├── test_chat_service.py
│   └── ...
├── core/                   # 镜像 src/core/
│   ├── agent/
│   ├── preprocessing/
│   └── test_faq_match.py
├── storage/
├── parsers/                # 镜像 src/parsers/（待补）
```

### 8.2 【强制】文件与函数命名

- 文件：`test_<module>.py`，对应 `src/<path>/<module>.py`
- 测试类：`Test<Subject>`（仅在需要组织相关测试时）
- 测试函数：`test_<scenario>`

```python
# tests/services/test_faq_service.py
class TestFAQServiceCreate:
    async def test_create_persists_faq(self, ...): ...
    async def test_create_syncs_vector_store(self, ...): ...
    async def test_create_raises_when_kb_missing(self, ...): ...
```

### 8.3 【强制】单元 vs 集成用 marker 区分

不分目录，用 `@pytest.mark.integration` 标记：

```python
@pytest.mark.integration
def test_real_mysql_query():
    """需要真实 MySQL 才能跑。"""
    ...
```

```bash
pytest                          # 默认跑全部
pytest -m "not integration"     # CI 快速通道
pytest -m integration           # 单独跑集成
```

`pyproject.toml` 已注册 marker：

```toml
[tool.pytest.ini_options]
markers = [
    "integration: tests that require a running MySQL instance",
]
```

### 8.4 【强制】Mock 边界规则

| 测哪一层 | mock 什么 |
|---------|----------|
| `services/` 单元测试 | mock `storage/` + `core/` |
| `core/agent/` 单元测试 | mock LLM 工厂函数（`get_llm`） |
| `storage/` 单元测试 | mock `conn_factory` |
| `api/` 集成测试 | 用 `app.dependency_overrides` 替换 Service |

### 8.5 【强制】必须有测试的场景

任何修改以下场景**必须**附带测试用例，否则 CI 拒绝合并：

1. `core/agent/safety_guards.py` 任何规则变动
2. 新增业务异常类型（`exceptions.py`）
3. `storage/` 层 SQL 改动（新增字段、改 JOIN 逻辑等）
4. 新增 Agent 工具（`core/agent/tools/`）
5. 新增文档索引流水线（`core/indexing/`）

### 8.6 【推荐】Fixture 分层

```
tests/conftest.py             # 全局：测试 DB session、临时目录
tests/services/conftest.py    # services 共用：mock store / mock vector_store
tests/storage/conftest.py     # storage 共用：测试 DB 连接、初始化数据
```

### 8.7 【强制】评测脚本不放 `tests/`

RAG 评测（如 `evaluate_rag_dataset.py`）属于"分数报告"而非"过/不过"，放在 `backend/evaluation/`：

```
backend/evaluation/
├── datasets/                       # 测试集
├── runners/
│   ├── ragas_runner.py
│   └── dataset_runner.py
└── reports/                        # gitignore
```

执行方式独立于 `pytest`：

```bash
poetry run python evaluation/runners/ragas_runner.py --dataset eval_v1
```

---

## 9. 新增功能标准流程

### 9.1 新增 API 接口

按以下顺序创建/修改文件：

```
1. backend/src/api/schemas/<domain>.py  →  加请求/响应 Pydantic 模型
2. backend/src/storage/interfaces/<store>.py  →  如需新 DB 操作，先加接口
3. backend/src/storage/<store>.py  →  实现新方法（带 StorageError 包装）
4. backend/src/services/<service>.py  →  新增业务方法（构造时注入 Store）
5. backend/src/api/deps.py  →  如需新 Service，注册工厂函数
6. backend/src/api/routes/<domain>.py  →  加路由函数（调用 Service）
7. backend/tests/services/test_<service>.py  →  加 Service 单元测试
8. backend/tests/storage/test_<store>.py  →  加 Store 单元测试
```

### 9.2 新增文档类型

```
1. backend/src/core/indexing/<type>.py  →  继承 BaseIndexingPipeline
2. backend/src/core/indexing/dispatcher.py  →  加一行分发
3. backend/src/parsers/<parser>.py  →  如需新解析器，在 registry 注册
4. backend/tests/core/indexing/test_<type>.py  →  加流水线测试
```

### 9.3 新增 Agent 工具

```
1. backend/src/core/agent/tools/<tool>.py  →  定义 @tool 函数
2. backend/src/core/agent/factory.py  →  工具列表追加
3. backend/tests/core/agent/test_<tool>.py  →  加工具单元测试
```

### 9.4 新增 Safety Guard 规则

```
1. backend/src/core/agent/safety_guards.py  →  加规则
2. backend/tests/core/agent/test_safety_guards.py  →  必须配对应测试用例
3. PR 描述里说明：触发条件 + 期望被拦截的 LLM 答案样本
```

### 9.5 修改提示词

- 找到对应子图的 `prompts.py`
- 直接修改 `ChatPromptTemplate` 内容
- 提示词变量（`{query}`、`{context}` 等）的传入位置同步检查

---

## 10. 禁止事项

### 10.1 架构边界

| 禁止 | 检测命令 |
|------|---------|
| `core/` import `fastapi` / `Request` / `HTTPException` | `grep -rn "fastapi" backend/src/core/` |
| `core/` import `src.storage` | `grep -rn "from src.storage" backend/src/core/` |
| `core/` import `src.api` 或 `src.services` | `grep -rn "from src.api\|from src.services" backend/src/core/` |
| `services/` import `fastapi`（Request/HTTPException 等） | `grep -rn "from fastapi" backend/src/services/` |
| `routes/` 直接 import `src.storage` / `src.core` | `grep -rn "from src.storage\|from src.core" backend/src/api/routes/` |
| 跨 Agent 子图共享 prompts | 人工 review |

### 10.2 实现陷阱

- **禁止**将 `rag_pipeline.py` 改回 `create_react_agent`
- **禁止**在 `retrieve_node` 内部写检索逻辑（空占位节点）
- **禁止**直接修改 `safety_guards.py` 而不附带测试用例
- **禁止**在 `core/` 任何文件 import 其他 Agent 子图的 `prompts.py`
- **禁止**把 `document_store.py` 当新功能入口（用具体 Store）
- **禁止**在 `storage/` 内调用 `VectorStore`（向量操作属 Service 层）
- **禁止**在 `stream_rag` / `run_rag` 内部构造 `HybridRetriever`（职责属于 chat_service.py）

### 10.3 配置与安全

- **禁止**把 API Key 硬编码进代码，统一从 `get_api_key()` 读取
- **禁止**向 git 提交 `.env` 文件
- **禁止**新增路由时忘记加认证依赖
- **禁止**直接修改 `poetry.lock`（通过 `poetry add` / `poetry lock` 管理）

### 10.4 防御性编码

- **禁止**裸 `except Exception: pass`
- **禁止**外部 HTTP / LLM / DB 调用不带 timeout
- **禁止**JSON 解析、dict 取值不带默认值或 try/except

### 10.5 后端去耦合（完全分开后）

- **禁止** FastAPI 托管前端静态资源（`app.mount("/admin", ...)` 等）
- **禁止** FastAPI 处理 SPA fallback 路由
- **禁止** 后端代码引用前端构建产物路径

---

## 11. 附录：待落地清单

本规范描述目标态。以下变动需另开重构会话执行：

### 11.1 目录迁移（顶层）

详见 [docs/directory-layout.md 的待落地清单](../../docs/directory-layout.md#6-附录待落地清单)。

### 11.2 后端内部结构调整

| 动作 | 文件 | 说明 |
|------|------|------|
| **删除** | `core/user_import.py` | 兼容 shim，零外部 import |
| **删除** | `core/faq_service.py` | 合并进 `services/faq_service.py`，业务逻辑不在 core |
| **新建** | `core/preprocessing/` | 接收下面 3 个文件 |
| **迁移** | `core/splitter.py` → `core/preprocessing/splitter.py` | 业界惯例（LlamaIndex `text_splitter/`） |
| **迁移** | `core/splitter_manual.py` → `core/preprocessing/splitter_manual.py` | 同上 |
| **迁移** | `core/image_describer.py` → `core/preprocessing/image_describer.py` | 业界惯例（Haystack `converters/`） |
| **迁移** | `core/eval_base.py` → `core/shared/eval_base.py` | 10 行 dataclass，shared 即可 |
| **保留** | `core/faq_match.py` | 业务专属算法，根级即可 |
| **保留+标 deprecated** | `core/llm_factory.py` (5 行 shim) | 11 处旧代码依赖；新代码必须用 `core/shared/llm_factory` |

### 11.3 反模式修复

- `splitter_manual.py` 反向 import `splitter.py`（基类引用派生类）→ 重构 preprocessing 时解掉

### 11.4 待补测试目录

- `backend/tests/parsers/`（镜像 `src/parsers/`）
- `backend/tests/core/agent/`（镜像 `src/core/agent/`）
- `backend/tests/core/preprocessing/`（镜像新建的 `src/core/preprocessing/`）

### 11.5 评测脚本迁移

- `scripts/evaluate_rag_dataset.py` → `backend/evaluation/runners/dataset_runner.py`
- `scripts/evaluate_ragas_like_judge.py` → `backend/evaluation/runners/ragas_runner.py`

---

*文档版本：v1.0 | 创建日期：2026-05-30 | 相关文档：[directory-layout](../../docs/directory-layout.md) · [frontend standards](../../frontend/docs/standards.md)*
