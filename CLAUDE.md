# CLAUDE.md — 项目编码规范

## 项目概览

郑州大学本科毕业设计 Q&A 助手（Agentic RAG）。面向学生和导师，解答毕业设计全流程问题。

- **后端**: FastAPI + LangGraph ReAct Agent（`create_react_agent`）
- **检索**: Qdrant 向量库 + BM25，RRF 融合 + DashScope GTE-Rerank
- **LLM/Embedding**: DashScope（qwen-plus 主模型 / qwen-turbo 快速模型 / qwen-vl-plus VLM）
- **前端**: React 19 + TypeScript + Vite（构建产物由 FastAPI 静态托管，SPA fallback）
- **存储**: Qdrant（向量）+ MySQL 8.0（用户/文档/FAQ/对话/系统设置等全部元数据）
- **认证**: JWT（python-jose + passlib/bcrypt），三种角色：admin / teacher / student

### 双层问答架构

- **第一层（FAQ 防线）**：`src/core/faq_match.py` — LLM 改写查询 → 语义向量匹配 FAQ 库（阈值 0.75），超过阈值用 fast_model 快速生成答案；答案含 `[FALLBACK]` 标记则降级到 RAG
- **第二层（RAG 核心）**：`src/core/rag_pipeline.py` — 混合检索（vector + BM25 + RRF）→ Rerank → LangGraph ReAct Agent（4 个工具）→ LLM 流式生成

### 角色权限

| 角色 | 可访问页面 |
|------|-----------|
| admin | 全部（知识库/文档/FAQ/学生账号/统计/设置 + 对话） |
| teacher | 同 admin |
| student | 仅对话页（`/student/*`） |

默认管理员：`admin` / `admin123`（首次启动 `ensure_default_admin()` 自动创建，凭据在 `configs/config.yaml` 的 `auth` 节）

### 访问地址

- 管理端：`http://localhost:8000/admin`
- 学生端：`http://localhost:8000/student`
- API 文档：`http://localhost:8000/docs`

### 启动方式

```bash
# 1. 启动 Qdrant + MySQL（首次需等 MySQL 初始化完成）
docker-compose up -d

# 2. 配置环境变量（.env 放项目根目录）
DASHSCOPE_API_KEY=sk-xxxx
# 可选，有默认值：
# MYSQL_HOST=localhost
# MYSQL_USER=rag_user
# MYSQL_PASSWORD=rag_pass_123
# AUTH_SECRET_KEY=change-me-in-production-please

# 3. 安装依赖
poetry install

# 4. 启动后端
poetry run dev    # 开发模式（热重载，绑定 127.0.0.1:8000）
poetry run start  # 生产模式（绑定 0.0.0.0:8000）

# 前端改动后需重新构建
cd frontend && npm run build
```

> Mac 用 Colima 替代 Docker Desktop：`colima start` 后 `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock docker-compose up -d`

---

## 项目结构

```
rag1.0/
├── configs/config.yaml         # 全局配置（模型/检索参数/DB/Auth）
├── sql/init.sql                # MySQL 建表 DDL
├── docker-compose.yml          # Qdrant + MySQL 容器
├── pyproject.toml              # 依赖 + scripts（start/dev）
├── src/
│   ├── main.py                 # uvicorn 入口（run/dev 函数）
│   ├── config.py               # YAML+env 配置加载（LRU cached）
│   ├── api/
│   │   ├── app.py              # FastAPI 实例、路由注册、静态文件、startup hook
│   │   ├── auth.py             # JWT 生成/验证、密码哈希、角色守卫、ensure_default_admin
│   │   └── routes/
│   │       ├── auth.py         # /api/auth/*（login/refresh/me/password）
│   │       ├── chat.py         # /api/chat（SSE 流式，双层问答入口）
│   │       ├── knowledge.py    # /api/knowledge/*（KB CRUD + active 设置）
│   │       ├── document.py     # /api/document/*（上传/下载/删除）
│   │       ├── faq.py          # /api/faq/*（CRUD + 批量导入导出）
│   │       ├── conversation.py # /api/conversation/*（对话/消息/反馈）
│   │       ├── user.py         # /api/users/*（用户管理 + 学生批量导入）
│   │       ├── config.py       # /api/config/*（系统配置 + API Key 管理）
│   │       └── analytics.py    # /api/analytics/summary
│   ├── core/
│   │   ├── faq_match.py        # FAQ 防线：改写→语义搜索→快速生成
│   │   ├── rag_pipeline.py     # ReAct Agent 编排（build_rag_agent/stream_rag/run_rag）
│   │   ├── tools.py            # Agent 工具：search_kb/list_docs/calendar/doc_link
│   │   ├── retrieval.py        # VectorRetriever/BM25Retriever/HybridRetriever/fetch_corpus
│   │   ├── reranker.py         # DashScope GTE-Rerank
│   │   ├── indexing.py         # 文档索引 pipeline
│   │   ├── splitter.py         # 文本切分策略（recursive/token/sentence/semantic）
│   │   ├── splitter_manual.py  # 手动步骤切分（图文混排文档）
│   │   ├── image_describer.py  # VLM 图片描述（qwen-vl-plus，batch=8）
│   │   └── cleaning/           # 文档类型专项清洗（policy/manual/form）
│   ├── storage/
│   │   ├── database.py         # PyMySQL + DBUtils 连接池（DictCursor）
│   │   ├── document_store.py   # MySQL CRUD：KB/文档/FAQ/对话/消息/反馈/系统设置
│   │   ├── user_store.py       # MySQL CRUD：用户/学生档案/教师档案/登录日志
│   │   └── vector_store.py     # Qdrant 封装：集合管理/向量 CRUD/payload 过滤
│   └── parsers/                # PDF/Word/Excel 解析器
└── frontend/
    ├── src/
    │   ├── lib/api.ts           # axios client（自动 refresh 拦截器）+ 全部 API 模块
    │   ├── lib/auth.ts          # token 存取
    │   ├── types/api.ts         # 全部接口 TypeScript 类型定义
    │   ├── hooks/useAuth.ts
    │   ├── components/          # AuthProvider/RouteGuard/Layout 等
    │   └── pages/               # 管理端：Overview/KB/Doc/FAQ/Students/Conversations/Settings/Analytics
    │                            # 学生端：StudentHome/StudentFaq/StudentProfile
    └── package.json             # React 19 + TypeScript + Vite + TailwindCSS + TanStack Query
```

---

## 一、工程化原则

### 1.1 防御性编程（Defensive）

**外部调用必须有超时和异常处理。** 所有 HTTP 请求、LLM 调用、数据库操作都要捕获具体异常，不要裸 `except Exception`。

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

# ❌
try:
    resp = httpx.post(url)
except Exception:
    return "失败"
```

**对外部数据做防御性解析。** JSON 解析、dict 取值都要有默认值或 try/except。

```python
# ✅
result = json.loads(raw)
relevant = result.get("relevant", False)

# ❌
relevant = json.loads(raw)["relevant"]     # 两处都可能抛异常
```

**函数入口校验前置条件。** 空列表、None、空字符串在函数开头 early return。

```python
def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
    if not nodes:
        return []
    if not query.strip():
        return nodes
```

---

### 1.2 可维护性（Maintainable）

**常量和配置不要硬编码。** 数字、字符串常量提取为模块级常量或放入 `configs/config.yaml`。

```python
# ✅（config.yaml 中）
faq:
  score_threshold: 0.75

# ❌
if score >= 0.75:   # 魔法数字
```

**每个模块只做一件事。** `tools.py` 只放工具定义；`retrieval.py` 只管检索；`rag_pipeline.py` 只管 Agent 编排。

**日志要有上下文。**

```python
# ✅
logger.info("[grade_docs] %d/%d 篇相关，sufficient=%s", len(graded), len(nodes), sufficient)

# ❌
logger.info("done")
```

**不要写没有调用者的死代码。**

---

### 1.3 可扩展性（Extensible）

**用工厂函数/依赖注入，不要在函数体内硬构造依赖。**

```python
# ✅
def build_rag_agent(retriever_fn, captured_nodes: list, kb_name: str, file_events: list):
    ...

# ❌
def build_rag_agent():
    retriever = HybridRetriever(kb_name="zzu_thesis")   # 写死了
```

**给 Agent 加工具**：在 `tools.py` 加 `@tool` 函数，在 `rag_pipeline.py` 的 `tools` 列表追加，不改其他地方。

**配置优先于代码**：能放 `config.yaml` 的参数（模型名、top_k、阈值）就放 config。

---

## 二、Python 编码规范

### 类型标注

所有**公共函数**必须有完整的参数和返回值类型标注。

```python
def retrieve(self, query: str) -> list[dict]: ...
def make_search_kb_tool(retriever_fn, captured_nodes: list) -> ...: ...
```

### 命名

- 文件/模块：`snake_case`
- 类：`PascalCase`
- 函数/变量：`snake_case`
- 常量：`UPPER_SNAKE_CASE`
- LangGraph 节点函数统一以 `_node` 结尾（如有手动 StateGraph）
- LangChain 工具函数用动词名词：`search_knowledge_base`, `get_academic_calendar`

### 异步

FastAPI 路由用 `async def`，LangGraph 同步调用（`agent.invoke`）用 `asyncio.to_thread` 包装。

```python
# ✅
final_state = await asyncio.to_thread(run_rag, query=..., retriever_fn=...)
```

---

## 三、LangGraph / LangChain 规范

### 当前架构：ReAct Agent

`src/core/rag_pipeline.py` 使用 `create_react_agent`，不要改成 StateGraph 手动编排。工具在 `src/core/tools.py` 定义。

### 工具（Tool）规范

- docstring 是 LLM 看到的描述，**必须写清楚：做什么、何时用、参数含义**
- 工具必须返回 `str`
- 工具内部异常必须捕获，返回友好字符串（Agent 将其作为 Observation 继续推理）
- 需要运行时绑定依赖的工具用工厂函数（`make_search_kb_tool`, `make_get_document_link_tool`），不用全局变量

### 当前 4 个工具（tools.py）

| 工具 | 描述 |
|------|------|
| `search_knowledge_base(query)` | 混合检索 + Rerank，结果追加到 `captured_nodes` |
| `list_kb_documents(kb_name)` | 列出知识库中所有文档名和 chunk 数 |
| `get_academic_calendar()` | 返回今天日期/星期/学期/当前周数（爬取 ZZU 官方，失败时用 config 兜底） |
| `get_document_link(file_hint)` | 模糊匹配文档名，追加到 `file_events`，返回确认文本 |

---

## 四、FastAPI 规范

### 路由文件职责

| 文件 | 职责 |
|------|------|
| `auth.py` | login / refresh / me / change-password |
| `chat.py` | SSE 流式聊天，双层问答入口 |
| `knowledge.py` | KB CRUD + active 分配 |
| `document.py` | 上传（异步 to_thread）/ 下载 / 删除 |
| `faq.py` | FAQ CRUD + 批量导入导出（openpyxl） |
| `conversation.py` | 对话 / 消息 / 反馈 |
| `user.py` | 用户管理 + 学生批量导入导出 |
| `config.py` | 系统配置读写 + API Key 管理测试 |
| `analytics.py` | 统计汇总 |

### 通用规则

- 请求体用 Pydantic `BaseModel`，字段加 `Field(...)` 校验
- 业务异常用 `HTTPException(status_code=4xx)`
- SSE 路由用 `EventSourceResponse`，阶段事件用 `event` 字段区分（`status` / `agent_action` / `token` / `sources` / `file` / `suggestions` / `done`）
- **所有路由必须加认证依赖**（默认 `Depends(get_current_user)`）

### 认证依赖

```python
# 普通登录校验
def my_route(current_user: dict = Depends(get_current_user)): ...

# 仅 admin/teacher
def admin_route(current_user: dict = Depends(require_teacher_or_admin)): ...

# 仅 admin
def super_route(current_user: dict = Depends(require_admin)): ...
```

---

## 五、数据库规范（MySQL）

### 连接使用

```python
from src.storage.database import get_conn

conn = get_conn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT ...", (param,))
        row = cur.fetchone()   # 返回 dict（DictCursor）
    conn.commit()
finally:
    conn.close()
```

### 字段约定

- 主键：`id INT AUTO_INCREMENT PRIMARY KEY`
- 时间戳：`created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- 外键：必须有 `ON DELETE CASCADE`（如 documents → knowledge_bases）
- JSON 字段（sources/files）存 TEXT，读写时手动 `json.loads` / `json.dumps`

### 系统设置（system_settings）

用 `document_store.get_setting(key)` / `set_setting(key, value)` 存取 key-value 配置（如 `active_kb_name`）。

---

## 六、前端规范

### 设计语言（Dashboard 风格）

- 外层背景：`hsl(38 22% 91%)` 暖米色，白色 `rounded-2xl` 卡片浮在上面，`p-3 gap-3`
- 侧边栏：64px 窄图标栏（`w-16`），激活态黑色填充，hover `scale-110`
- 动画类：`fadeSlideUp`（入场）、`hover-lift`（悬浮），定义在 `index.css`
- 深色对比卡（`#1A1A1A` 背景）用于系统状态、统计等高对比场景
- 空状态要有友好提示，不要显示报错或空白

### API 调用

- 所有请求通过 `frontend/src/lib/api.ts` 的 axios client（含自动 refresh 拦截器）
- 接口响应类型统一在 `frontend/src/types/api.ts` 定义
- 用 `@tanstack/react-query` 管理服务端状态，不要用 `useEffect + useState` 手动 fetch

### 路由守卫

- 未登录 → `/login`
- 已登录但角色不匹配 → `/`
- student 角色默认落地页：`/s`（StudentHomePage）

---

## 七、禁止事项

- **禁止** 在 `core/` 层直接 import `FastAPI`、`Request` 等框架对象
- **禁止** 把 API key 硬编码进代码，统一从 `os.environ.get("DASHSCOPE_API_KEY")` 读取
- **禁止** 裸 `except Exception: pass`（吞掉所有异常）
- **禁止** 在 `build_rag_agent` 内部构造 `HybridRetriever`（职责属于调用层 `chat.py`）
- **禁止** 向 git 提交 `.env` 文件
- **禁止** 新增路由时忘记加认证依赖
- **禁止** 直接修改 `poetry.lock`（通过 `poetry add` / `poetry lock` 管理）
