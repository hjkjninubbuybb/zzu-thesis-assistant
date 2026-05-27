# 项目重构设计文档

**项目：** 郑州大学毕业设计 Q&A 助手（Agentic RAG）
**日期：** 2026-05-27
**目标受众：** 下一位接手本项目的独立开发者
**重构范围：** 架构蓝图（本文档只规划设计，不改代码）

---

## 一、重构目标

1. **看得懂**：看目录结构就能理解系统分层，不需要通读所有代码
2. **改得动**：每个组件有清晰接口，替换/修改一个组件不影响其他组件
3. **加得进**：新功能知道往哪放，加新文档类型、新 Agent 工具有明确的扩展点
4. **测得了**：每层职责单一，可以独立测试，不需要启动整个系统才能跑测试

---

## 二、核心架构：四层分层 + 共享异常模块

```
HTTP 请求
    ↓
api/routes/          第一层：HTTP 控制层（薄）
    ↓
services/            第二层：业务编排层（新增）
    ↓           ↘
core/            storage/   第三层：AI 核心层 / 第四层：数据访问层
    ↑                ↑
    └──── src/exceptions.py ────┘   （四层之外的共享异常模块）
```

### 共享异常模块：`src/exceptions.py`

**位置：** 四层之外，`src/` 根目录，所有层都可以 import。

**设计原因：** `storage/` 需要抛 `StorageError`，但按依赖规则 `storage/` 不能 import `core/`。把异常定义提取到四层之外解决这个矛盾，同时保持其他层的依赖规则不变。

```python
# src/exceptions.py

class AppException(Exception):
    """所有业务异常的基类。"""
    code: str = "APP_ERROR"
    http_status: int = 400

    def __init__(self, message: str):
        super().__init__(message)

# 存储相关（storage/ 层使用）
class StorageError(AppException):
    code = "STORAGE_ERROR"
    http_status = 500

# 文档相关（core/ 和 services/ 层使用）
class DocumentNotFoundError(AppException):
    code = "DOCUMENT_NOT_FOUND"
    http_status = 404

class IndexingError(AppException):
    code = "INDEXING_FAILED"

# FAQ 相关
class FAQNotFoundError(AppException):
    code = "FAQ_NOT_FOUND"
    http_status = 404

# 知识库相关
class KnowledgeBaseNotFoundError(AppException):
    code = "KB_NOT_FOUND"
    http_status = 404

# RAG 相关
class RAGError(AppException):
    code = "RAG_ERROR"
    http_status = 500

# 用户相关
class UserNotFoundError(AppException):
    code = "USER_NOT_FOUND"
    http_status = 404

class PermissionDeniedError(AppException):
    code = "PERMISSION_DENIED"
    http_status = 403
```

**异常流转规则：**

```
storage/ 层      → 抛 StorageError（包装原始 DB 异常，不暴露 SQL 细节）
core/ 层         → 抛 IndexingError / RAGError 等
services/ 层     → 捕获底层异常，转换成合适的业务异常后向上抛
api/app.py       → 全局 handler 把 AppException 转成 JSONResponse
api/routes/      → 不处理异常（让全局 handler 接管）
```

### 单向依赖规则（最重要，违反即为架构问题）

```
api/routes → services → core
                      → storage
所有层均可 import src/exceptions.py（不计入违规）
```

| 层 | 可以 import | 禁止 import |
|----|------------|-------------|
| `api/routes/` | `services/`、`api/schemas/`、`api/auth.py`、`api/deps.py`、`src/exceptions.py` | `core/`、`storage/` |
| `services/` | `core/`、`storage/`、`src/exceptions.py` | `fastapi`（Request/HTTPException 等）、`api/` |
| `core/` | `core/` 内部模块、`src/exceptions.py` | `api/`、`storage/`、`services/` |
| `storage/` | `storage/database.py`、`src/exceptions.py` | 上面三层任何东西 |

**如何检查违规：** 在任意文件里看到 import 了不该出现的层，即为违规，需要立刻重构。

---

## 三、文件大小约定

| 类型 | 单文件上限 | 超出后处理方式 |
|------|-----------|---------------|
| 接口文件（Protocol/ABC） | **100 行** | 按组件拆成多个文件 |
| 实现文件（Service/Store/节点） | **200 行** | 改成同名包（目录），内部拆文件 |
| 路由文件（每个路由函数） | **30 行** | 业务逻辑下移到 Service |

**拆包示例：** `document_service.py` 超 200 行时改为：

```
services/document_service/
    __init__.py       # 只暴露 DocumentService 类
    _upload.py        # 上传逻辑（下划线前缀=内部实现）
    _indexing.py      # 索引逻辑
    _export.py        # 导出逻辑
```

外部调用者永远只 `from src.services.document_service import DocumentService`，内部怎么拆不影响外部。

---

## 四、第一层：`api/` — HTTP 控制层

### 职责

把 HTTP 请求翻译成 Service 调用，把 Service 结果翻译成 HTTP 响应。**不写任何业务逻辑。**

### 目录结构

```
src/api/
├── app.py               # FastAPI 实例创建、路由注册、全局异常 handler、startup hook
├── auth.py              # JWT 生成/验证、密码哈希、角色守卫依赖函数
├── deps.py              # 【新增】统一依赖注入工厂函数
├── schemas/             # 【拆分自 schemas.py】Pydantic 请求/响应模型
│   ├── __init__.py      # 统一 re-export
│   ├── auth.py          # LoginRequest、TokenResponse
│   ├── chat.py          # ChatRequest、SSEEvent
│   ├── document.py      # DocumentUploadRequest、DocumentResponse
│   ├── faq.py           # FAQCreateRequest、FAQResponse、FAQImportRequest
│   ├── user.py          # UserCreateRequest、UserResponse
│   ├── ticket.py        # TicketCreateRequest、TicketResponse
│   ├── knowledge.py     # KBCreateRequest、KBResponse
│   └── common.py        # PagedResponse、ErrorResponse 等通用结构
└── routes/
    ├── auth.py          # /api/auth/*
    ├── chat.py          # /api/chat（SSE 流式）
    ├── document.py      # /api/document/*
    ├── faq.py           # /api/faq/*
    ├── knowledge.py     # /api/knowledge/*
    ├── user.py          # /api/users/*
    ├── ticket.py        # /api/tickets/*
    ├── config.py        # /api/config/*
    └── analytics.py     # /api/analytics/*
```

### `deps.py` — 统一依赖注入

所有 Service 的创建都在这里，换实现时只改这一个文件：

```python
# api/deps.py
from src.storage.faq_store import FAQStore
from src.storage.vector_store import VectorStore
from src.services.faq_service import FAQService

def get_faq_store() -> FAQStore:
    return FAQStore()

def get_vector_store() -> VectorStore:
    return VectorStore()

def get_faq_service(
    faq_store: FAQStore = Depends(get_faq_store),
    vector_store: VectorStore = Depends(get_vector_store),
) -> FAQService:
    return FAQService(faq_store, vector_store)
    # FastAPI 在同一请求内自动缓存相同依赖，不会重复创建
```

### 路由文件标准写法

每个路由函数目标 **10～30 行**，超出说明有业务逻辑需要下移：

```python
# api/routes/faq.py
@router.post("/", response_model=FAQResponse)
async def create_faq(
    body: FAQCreateRequest,
    current_user: dict = Depends(get_current_user),
    faq_service: FAQService = Depends(get_faq_service),
):
    return await faq_service.create(
        kb_name=body.kb_name,
        question=body.question,
        answer=body.answer,
        created_by=current_user["id"],
    )
```

### `app.py` — 全局异常 Handler

所有业务异常统一在这里转成 HTTP 响应，路由文件不处理异常：

```python
# api/app.py
from src.exceptions import AppException

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.http_status,
        content={"code": exc.code, "message": str(exc)},
    )
```

---

## 五、第二层：`services/` — 业务编排层（新增）

### 职责

编排业务流程：调 `core/` 做 AI 计算，调 `storage/` 读写数据，把结果组装好返回。**不知道 HTTP 是什么。**

### 目录结构

```
src/services/
├── base.py              # BaseService（可选：提供通用日志/异常包装）
├── chat_service.py      # 聊天：FAQ 防线 + RAG 流程编排
├── document_service.py  # 文档：上传、索引触发、下载、删除
├── faq_service.py       # FAQ：CRUD + 向量同步 + 批量导入导出
│                        # （合并现有 faq_match.py 和 faq_service.py）
├── knowledge_service.py # 知识库：KB CRUD + active 设置
├── user_service.py      # 用户：CRUD + 批量导入 + 导师关系管理
├── ticket_service.py    # 工单：创建 + 回答 + 状态流转
├── config_service.py    # 系统配置：读写 + API Key 连通性验证
└── analytics_service.py # 统计：查询汇总数据
```

### Service 标准写法

```python
# services/faq_service.py
from src.storage.interfaces.faq_store import BaseFAQStore
from src.storage.vector_store import VectorStore
from src.core.faq_match import FAQMatcher
from src.exceptions import FAQNotFoundError

class FAQService:
    """FAQ 业务编排：CRUD、向量同步、批量操作、语义匹配。"""

    def __init__(
        self,
        faq_store: BaseFAQStore,    # 注入接口，不注入具体类
        vector_store: VectorStore,
        faq_matcher: FAQMatcher,
    ):
        self._faq_store = faq_store
        self._vector_store = vector_store
        self._faq_matcher = faq_matcher

    async def create(self, kb_name: str, question: str, answer: str, created_by: int) -> dict:
        """创建 FAQ 并同步向量库。"""
        faq_id = self._faq_store.create_faq(kb_name, question, answer, created_by)
        await self._vector_store.upsert_faq(faq_id, question, answer, kb_name)
        return self._faq_store.get_faq(faq_id)

    async def delete(self, faq_id: int) -> None:
        """删除 FAQ 并同步清理向量库。"""
        faq = self._faq_store.get_faq(faq_id)
        if not faq:
            raise FAQNotFoundError(f"FAQ {faq_id} 不存在")   # 抛业务异常，不抛 HTTPException
        self._faq_store.delete_faq(faq_id)
        await self._vector_store.delete_faq(faq_id)
```

### 关键约束

- Service 方法**不抛 `HTTPException`**，只抛业务异常（`AppException` 子类）
- Service 构造函数通过参数接收依赖，不在方法体内 `new` 具体实现
- 一个 Service 只负责一个业务域，跨域通过注入多个 Service 实现
- 调用 LangGraph（同步）时必须用 `asyncio.to_thread` 包装，不阻塞事件循环

```python
# ✅ 正确：同步图用 to_thread 包装
result = await asyncio.to_thread(graph.invoke, state)

# ❌ 错误：直接调用会阻塞整个 FastAPI 事件循环
result = graph.invoke(state)
```

---

## 六、第三层：`core/` — AI 核心层

### 职责

所有 AI 相关逻辑：接口定义、RAG 检索、Agent 编排、文档索引流水线、工具。**不知道数据库是什么，不知道 HTTP 是什么。**

### 目录结构

```
src/core/
├── interfaces/              # 所有公共接口（Protocol 定义）
├── shared/                  # 跨 Agent 共享基础设施
├── agent/                   # 主 RAG Agent（自包含）
├── rag/                     # 检索基础设施
├── indexing/                # 文档索引流水线（拆分自 884 行大文件）
├── cleaning/                # 文档清洗工作流（已有，保留结构）
└── form_extraction/         # 表单提取工作流（已有，保留结构）
```

---

### 6.1 `core/interfaces/` — 公共接口层

**规则：接口文件只有方法签名，零实现代码。单文件超 100 行拆成多文件。**

**接口优先使用 `Protocol`（Python 3.8+ 主流）**，对外暴露的接口不要求调用方显式继承，只需方法签名匹配。内部有共享实现代码的基类用 `ABC`。

```
core/interfaces/
├── __init__.py          # re-export 所有接口
├── retriever.py         # BaseRetriever Protocol
├── reranker.py          # BaseReranker Protocol
├── generator.py         # BaseGenerator Protocol
├── indexing.py          # BaseIndexingPipeline ABC（有共享实现）
├── faq.py               # BaseFAQMatcher Protocol
└── safety.py            # BaseSafetyGuard Protocol
```

```python
# core/interfaces/retriever.py
from typing import Protocol
from dataclasses import dataclass

@dataclass
class RetrievedNode:
    """检索结果的统一数据结构。"""
    text: str
    score: float
    metadata: dict

class BaseRetriever(Protocol):
    """文档检索器接口。所有检索实现只需方法签名匹配，无需显式继承。"""

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

---

### 6.2 `core/shared/` — 跨 Agent 共享基础设施

**规则：只放真正被多个 Agent/模块共用的东西，不是"感觉有用"就放这里。**

```
core/shared/
├── llm_factory.py       # LLM 实例工厂：get_fast_llm() / get_capable_llm()
└── embedding.py         # Embedding 工厂函数
```

---

### 6.3 `core/agent/` — 主 RAG Agent（自包含）

**规则：Agent 内部所有文件只服务本 Agent，不跨 Agent 共享提示词或节点代码。**

```
core/agent/
├── __init__.py          # 只暴露 get_compiled_graph()
├── state.py             # AgentState TypedDict 定义
├── graph.py             # StateGraph 构建 + lru_cache 编译
├── factory.py           # build_orchestrator()：组装检索器 + 图
├── prompts.py           # 本 Agent 所有提示词（PromptTemplate）
├── safety_guards.py     # 安全拦截规则（修改必须附测试用例）
├── nodes/               # 每个节点一个文件，超 200 行拆包
│   ├── __init__.py
│   ├── router.py        # router_node：路由决策（hard_rag/download/direct）
│   ├── grader.py        # grader_node：文档相关性评分
│   ├── rewriter.py      # rewriter_node：查询重写
│   ├── generator.py     # generator_node：答案生成 + safety_guards 拦截
│   └── document_linker.py  # document_linker_node：文件卡片下发
└── tools/               # Agent 工具（拆分自 tools.py）
    ├── __init__.py
    ├── calendar.py      # get_academic_calendar（含三级缓存逻辑）
    └── knowledge.py     # search_knowledge_base、list_kb_documents
```

**图编译：全局只编译一次（重要性能优化）**

```python
# core/agent/graph.py
from functools import lru_cache
from langgraph.graph import StateGraph

@lru_cache(maxsize=None)
def get_compiled_graph():
    """编译 RAG Agent 图。全局只执行一次，后续调用返回缓存实例。"""
    builder = StateGraph(AgentState)
    builder.add_node("router", router_node)
    builder.add_node("retrieve", retrieve_node)   # 空占位节点，检索在外部注入
    builder.add_node("grade", grader_node)
    builder.add_node("rewrite", rewriter_node)
    builder.add_node("generate", generator_node)
    builder.add_node("document_link", document_linker_node)
    # 添加边和条件路由...
    return builder.compile()
```

**提示词规范（全部在 `prompts.py`，使用 `PromptTemplate`）：**

```python
# core/agent/prompts.py
from langchain_core.prompts import ChatPromptTemplate

# ✅ 变量显式声明，不用字符串拼接
ROUTER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "你是一个路由助手，判断问题属于哪种类型..."),
    ("human", "{query}"),
])

GRADER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "评估以下文档片段与问题的相关性。\n\n文档：{document}"),
    ("human", "{query}"),
])

GENERATOR_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "基于以下上下文回答问题，不要编造信息：\n{context}"),
    ("human", "{query}"),
])

REWRITER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "将以下问题改写得更具体，以便检索..."),
    ("human", "{query}"),
])
```

**节点文件标准写法：**

```python
# core/agent/nodes/router.py
from src.core.agent.state import AgentState
from src.core.agent.prompts import ROUTER_PROMPT
from src.core.shared.llm_factory import get_fast_llm

def router_node(state: AgentState) -> dict:
    """路由节点：判断问题走 hard_rag / download / direct 哪条路径。"""
    chain = ROUTER_PROMPT | get_fast_llm()
    result = chain.invoke({"query": state["query"]})
    return {"route": result.content.strip()}
```

---

### 6.4 `core/rag/` — 检索基础设施

被 `core/agent/` 调用，不直接暴露给 Service 层。

```
core/rag/
├── retriever.py         # VectorRetriever、BM25Retriever、HybridRetriever
│                        # 均实现 BaseRetriever Protocol（方法签名匹配即可）
├── reranker.py          # DashScopeReranker（实现 BaseReranker Protocol）
├── query_enhancer.py    # 查询增强（规则扩写），合并 rewriter 重复逻辑
└── embedding.py         # Embedding 调用封装
```

**注意：** 现有 `rag/query_enhancer.py` 和 `agent/nodes/rewriter.py` 存在功能重叠（都做查询改写）。应明确分工：
- `query_enhancer.py`：基于规则的查询扩写（无 LLM 调用）
- `rewriter_node`：基于 LLM 的查询重写（CRAG 循环内）

两者职责不同，保留两个，但在代码注释里说明区别。

---

### 6.5 `core/indexing/` — 文档索引流水线（拆分 884 行大文件）

```
core/indexing/
├── __init__.py          # 只暴露 index_document() 统一入口
├── base.py              # BaseIndexingPipeline ABC（有共享实现用 ABC）
├── dispatcher.py        # 根据 doc_type 分发到对应流水线
├── policy.py            # PolicyPipeline：普通政策/规章文档
├── manual.py            # ManualPipeline：操作手册（含图片描述）
├── form.py              # FormPipeline：表单类文档（含结构提取）
└── _helpers.py          # 内部共用：切分、向量写入等（下划线=不对外）
```

```python
# core/indexing/base.py
from abc import ABC, abstractmethod

class BaseIndexingPipeline(ABC):
    """文档索引流水线基类。"""

    @abstractmethod
    def run(self, doc_path: str, kb_name: str, metadata: dict) -> int:
        """执行索引流水线。

        Args:
            doc_path: 文档临时文件路径。
            kb_name: 目标知识库名称。
            metadata: 文档元数据（文件名、类型、上传者等）。

        Returns:
            成功写入的 chunk 数量。

        Raises:
            IndexingError: 索引过程中发生错误。
        """
```

```python
# core/indexing/__init__.py（外部调用入口）
from .dispatcher import index_document
__all__ = ["index_document"]

# 使用方式：
# from src.core.indexing import index_document
# count = index_document(doc_path, kb_name, doc_type, metadata)
```

**新增文档类型时只需：** 在 `core/indexing/` 下新建一个文件，继承 `BaseIndexingPipeline`，在 `dispatcher.py` 里加一行分发逻辑。其他文件不用动。

---

### 6.6 `core/cleaning/` 和 `core/form_extraction/` — 保留现有结构

这两个已经是自包含的 LangGraph 子图，结构合理。只需做两件事：

1. `prompts.py` 里的硬编码字符串改用 `ChatPromptTemplate`
2. 确认内部没有 import `storage/` 或 `api/`（违反层级规则）

---

## 七、第四层：`storage/` — 数据访问层

### 职责

所有数据库读写操作。**不写业务判断，不调 VectorStore（向量操作是 Service 层协调的事）。**

### 目录结构

```
src/storage/
├── database.py              # PyMySQL 连接池（保持不变）
├── interfaces/              # 【新增】每个 Store 的抽象接口
│   ├── __init__.py
│   ├── kb_store.py          # BaseKBStore Protocol
│   ├── doc_store.py         # BaseDocStore Protocol
│   ├── faq_store.py         # BaseFAQStore Protocol
│   ├── conversation_store.py
│   ├── ticket_store.py
│   ├── user_store.py
│   └── settings_store.py
├── kb_store.py              # KBStore（对齐 BaseKBStore 接口）
├── doc_store.py             # DocStore（对齐 BaseDocStore 接口）
├── faq_store.py             # FAQStore（对齐 BaseFAQStore 接口）
├── conversation_store.py    # ConversationStore
├── ticket_store.py          # TicketStore
├── settings_store.py        # SettingsStore
├── user_store.py            # UserStore
├── vector_store.py          # VectorStore：Qdrant 封装
└── document_store.py        # 【改造】向后兼容聚合入口（组合模式）
```

### Store 接口定义

```python
# storage/interfaces/faq_store.py
from typing import Protocol

class BaseFAQStore(Protocol):
    """FAQ 数据访问接口。"""

    def get_faq(self, faq_id: int) -> dict | None: ...
    def list_faqs(self, kb_name: str, page: int, page_size: int) -> list[dict]: ...
    def count_faqs(self, kb_name: str) -> int: ...
    def create_faq(self, kb_name: str, question: str, answer: str, created_by: int) -> int: ...
    def update_faq(self, faq_id: int, question: str, answer: str) -> bool: ...
    def delete_faq(self, faq_id: int) -> bool: ...
    def batch_create_faqs(self, kb_name: str, items: list[dict]) -> int: ...
```

### Store 实现标准写法

```python
# storage/faq_store.py
import logging
from src.storage.database import get_conn
from src.storage.interfaces.faq_store import BaseFAQStore
from src.exceptions import StorageError

logger = logging.getLogger(__name__)

class FAQStore:
    """FAQ 的 MySQL 数据访问实现。"""

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

### `document_store.py` — 从多重继承改为组合

**改造目的：** 现有多重继承导致职责不清，改为组合模式，同时保持向后兼容。

```python
# storage/document_store.py
from src.storage.kb_store import KBStore
from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
from src.storage.conversation_store import ConversationStore
from src.storage.ticket_store import TicketStore
from src.storage.settings_store import SettingsStore

class DocumentStore:
    """向后兼容的存储聚合入口。

    注意：新代码请通过依赖注入直接使用具体 Store，不要继续扩展此类。
    此类只做代理转发，不添加任何业务逻辑。
    """

    def __init__(self):
        self.kb = KBStore()
        self.doc = DocStore()
        self.faq = FAQStore()
        self.conversation = ConversationStore()
        self.ticket = TicketStore()
        self.settings = SettingsStore()

    # 向后兼容代理方法（旧代码不报错）
    def get_faq(self, faq_id: int) -> dict | None:
        return self.faq.get_faq(faq_id)

    def get_kb(self, kb_name: str) -> dict | None:
        return self.kb.get_kb(kb_name)

    def get_setting(self, key: str) -> str | None:
        return self.settings.get_setting(key)

    def set_setting(self, key: str, value: str) -> None:
        return self.settings.set_setting(key, value)

    # 其他向后兼容方法按需添加...
```

### 关键约束

- Store 方法只做 SQL 操作，**不写业务判断**（`if` 业务条件属于 Service 层）
- **不在 Store 里调 VectorStore**，向量操作由 Service 层协调
- `document_store.py` 作向后兼容保留，**禁止往里加新方法**，新功能直接用具体 Store
- 所有数据库异常包装成 `StorageError` 后向上抛，不暴露原始 SQL 异常

---

## 八、FAQ 模块整合方案

现有 `faq_match.py` 和 `faq_service.py` 职责交叉，整合如下：

```
整合前                          整合后
──────────────────────────────────────────────────────
core/faq_match.py               core/faq_match.py
  - 语义匹配算法                  - 只保留匹配算法（FAQMatcher 类）
  - 查询改写                      - 不做 CRUD
  - FAQ 搜索

core/faq_service.py             services/faq_service.py（Service 层）
  - FAQ CRUD                      - CRUD + 向量同步 + 批量操作
  - 批量导入导出                   - 内部调 core/faq_match.py 做语义匹配
  - 向量同步                       - 内部调 storage/faq_store.py 读写数据
```

---

## 九、完整目录总览

```
src/
├── main.py                      # 启动入口（不变）
├── config.py                    # 配置加载（不变）
├── exceptions.py                # 【新增】统一业务异常层级（四层之外）
│
├── api/                         # 第一层：HTTP 控制层
│   ├── app.py                   # FastAPI 实例 + 全局异常 handler
│   ├── auth.py                  # JWT + 角色守卫
│   ├── deps.py                  # 【新增】统一依赖注入
│   ├── schemas/                 # 【拆分】Pydantic 模型按业务域分文件
│   │   ├── __init__.py
│   │   ├── auth.py / chat.py / document.py / faq.py
│   │   ├── user.py / ticket.py / knowledge.py / common.py
│   └── routes/                  # 薄控制层，每函数 <30 行
│       ├── auth.py / chat.py / document.py / faq.py
│       ├── knowledge.py / user.py / ticket.py / config.py / analytics.py
│
├── services/                    # 第二层：业务编排层（新增整层）
│   ├── base.py
│   ├── chat_service.py
│   ├── document_service.py
│   ├── faq_service.py           # 合并 faq_match + faq_service
│   ├── knowledge_service.py
│   ├── user_service.py
│   ├── ticket_service.py
│   ├── config_service.py
│   └── analytics_service.py
│
├── core/                        # 第三层：AI 核心层
│   ├── interfaces/              # 【新增】所有 Protocol/ABC 定义
│   │   ├── retriever.py / reranker.py / generator.py
│   │   ├── indexing.py / faq.py / safety.py
│   ├── shared/                  # 【新增】跨 Agent 共享基础设施
│   │   ├── llm_factory.py
│   │   ├── embedding.py
│   │   └── exceptions.py        # 统一业务异常层级
│   ├── agent/                   # 主 RAG Agent（自包含）
│   │   ├── state.py / graph.py / factory.py / prompts.py / safety_guards.py
│   │   ├── nodes/               # router / grader / rewriter / generator / document_linker
│   │   └── tools/               # calendar / knowledge
│   ├── rag/                     # 检索基础设施
│   │   ├── retriever.py / reranker.py / query_enhancer.py / embedding.py
│   ├── indexing/                # 【拆分】文档索引流水线
│   │   ├── __init__.py / base.py / dispatcher.py
│   │   ├── policy.py / manual.py / form.py / _helpers.py
│   ├── faq_match.py             # FAQ 语义匹配（只保留算法）
│   ├── cleaning/                # 文档清洗工作流（保留）
│   │   ├── graph.py / nodes.py / prompts.py / state.py
│   └── form_extraction/         # 表单提取工作流（保留）
│       ├── graph.py / nodes.py / prompts.py / state.py
│
└── storage/                     # 第四层：数据访问层
    ├── database.py              # 连接池（不变）
    ├── interfaces/              # 【新增】Store 接口定义
    │   ├── kb_store.py / doc_store.py / faq_store.py
    │   ├── conversation_store.py / ticket_store.py
    │   ├── user_store.py / settings_store.py
    ├── kb_store.py / doc_store.py / faq_store.py
    ├── conversation_store.py / ticket_store.py
    ├── settings_store.py / user_store.py
    ├── vector_store.py
    └── document_store.py        # 改为组合模式，向后兼容
```

---

## 十、扩展指南（新人常见操作）

### 新增文档类型

1. 在 `core/indexing/` 下新建文件，继承 `BaseIndexingPipeline`
2. 在 `core/indexing/dispatcher.py` 加一行分发逻辑
3. 如需新的解析器，在 `parsers/` 下按现有 registry 模式新增

### 新增 Agent 工具

1. 在 `core/agent/tools/` 下新建文件，定义 `@tool` 函数
2. 在 `core/agent/factory.py` 的工具列表里追加
3. 其他文件不动

### 新增 API 接口

1. 在 `api/schemas/` 对应文件里加请求/响应模型
2. 在 `services/` 对应 Service 里加方法
3. 在 `api/routes/` 对应路由文件里加路由函数（调 Service）
4. 如需新的数据库操作，在 `storage/` 对应 Store 里加方法（先加到接口文件）

### 修改提示词

- 找到对应 Agent 目录下的 `prompts.py`，直接修改 `PromptTemplate` 内容
- 提示词变量（`{query}`、`{context}` 等）必须在调用处传入，否则运行时报错

### 修改安全拦截规则

- 文件：`core/agent/safety_guards.py`
- **必须**同时在 `tests/core/test_safety_guards.py` 添加对应测试用例
- 不附测试用例的修改不允许提交

---

## 十一、禁止事项（继承自 CLAUDE.md，此处重申）

- **禁止**在 `core/` 里 import `FastAPI`、`Request`、`HTTPException`
- **禁止**在 `storage/` 里调用 `VectorStore`（向量操作属于 Service 层）
- **禁止**在路由函数里写超过 30 行逻辑（下移到 Service）
- **禁止**在 `core/agent/` 的任何文件里 import 其他 Agent 的 `prompts.py`
- **禁止**把 `document_store.py` 当新功能的入口（用具体 Store）
- **禁止**将 `rag_pipeline.py` 改回 `create_react_agent`
- **禁止**在 `retrieve_node` 内部写检索逻辑（该节点是空占位）
- **禁止**直接修改 `safety_guards.py` 而不附带测试用例

---

*文档版本：v1.0 | 设计日期：2026-05-27*
