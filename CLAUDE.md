# CLAUDE.md — 项目编码规范

## 项目概览

郑州大学本科毕业设计 Q&A 助手（Agentic RAG）。面向学生和导师，解答毕业设计全流程问题。

- **后端**: FastAPI + LangGraph 手写 StateGraph
- **检索**: Qdrant 向量库 + BM25，RRF 融合 + DashScope GTE-Rerank
- **LLM/Embedding**: DashScope（qwen-plus 强能力模型 / qwen-turbo 快速模型 / qwen-vl-plus VLM）
- **前端**: React 19 + TypeScript + Vite（构建产物由 FastAPI 静态托管，SPA fallback）
- **存储**: Qdrant（向量）+ MySQL 8.0（用户/文档/FAQ/对话/工单/系统设置等全部元数据）
- **认证**: JWT（python-jose + passlib/bcrypt），三种角色：admin / teacher / student

### 双层问答架构

- **第一层（FAQ 防线）**：`src/core/faq_match.py` — LLM 改写查询 → 语义向量匹配 FAQ 库（阈值 0.75），超过阈值用快速模型生成答案；答案含 `[FALLBACK]` 标记则降级到 RAG
- **第二层（RAG 核心）**：`src/core/rag_pipeline.py` — **手写 StateGraph**（非 create_react_agent）四条路由：
  - `hard_rag`：涉及具体政策/时间节点 → 混合检索 → 慢模型 CRAG 评估 → 最多 3 次重写
  - `easy_rag`：简单概念 → 混合检索 → 有结果即通过
  - `download`：下载请求 → 文件匹配 → 卡片下发
  - `direct`：闲聊 → 直接生成
- **Safety Guards**：`_apply_answer_safety_guards()` 内置 20+ 条硬编码规则，在 LLM 生成后拦截高频错误答案（查重率/开题时间/指导人数等），**修改时必须附带测试用例**

### 角色权限

| 角色 | 可访问功能 |
|------|-----------|
| admin | 全部（知识库/文档/FAQ/用户管理/统计/设置 + 对话 + 工单管理） |
| teacher | 同 admin（工单由导师回答） |
| student | 仅聊天/FAQ/工单（求助导师） |

默认管理员：`admin` / `admin123`（首次启动 `ensure_default_admin()` 自动创建）

### 访问地址

- 管理端：`http://localhost:8000/admin`（生产）/ `http://localhost:5173/admin`（开发）
- 学生端：`http://localhost:8000/student`（生产）/ `http://localhost:5173/student`（开发）
- API 文档：`http://localhost:8000/docs`

### 启动方式

```bash
docker-compose up -d
# 配置 .env: DASHSCOPE_API_KEY=sk-xxxx
poetry install
poetry run dev    # 开发（热重载，前端 :5173，后端 :8000）
poetry run start  # 生产（绑定 0.0.0.0:8000，托管 dist/）
```

---

## 项目结构

```
rag1.0/
├── configs/config.yaml             # 全局配置（模型/检索/DB/Auth）
├── sql/init.sql                    # MySQL 建表 DDL
├── docker-compose.yml              # Qdrant + MySQL 容器
├── pyproject.toml                  # 依赖 + scripts（start/dev）
├── src/
│   ├── main.py                     # 启动入口（run/dev，自动管理 Docker + Vite）
│   ├── config.py                   # YAML+env 配置加载（LRU cached，支持 DB 覆盖）
│   ├── api/
│   │   ├── app.py                  # FastAPI 实例、路由注册、静态文件、startup hook
│   │   ├── auth.py                 # JWT 生成/验证、密码哈希、角色守卫、ensure_default_admin
│   │   ├── schemas.py              # 所有 Pydantic 请求/响应模型
│   │   └── routes/
│   │       ├── auth.py             # /api/auth/*（login/refresh/me/password）
│   │       ├── chat.py             # /api/chat（SSE 流式，双层问答入口）
│   │       ├── knowledge.py        # /api/knowledge/*（KB CRUD + active 设置）
│   │       ├── document.py         # /api/document/*（上传/下载/重索引/删除）
│   │       ├── faq.py              # /api/faq/*（CRUD + 批量导入导出 + 语义搜索）
│   │       ├── conversation.py     # /api/conversation/*（对话/消息/反馈）
│   │       ├── user.py             # /api/users/*（用户管理 + 学生/教师批量导入 + 导师关系）
│   │       ├── ticket.py           # /api/tickets/*（学生求助工单 → 导师回答）
│   │       ├── config.py           # /api/config/*（系统配置 + API Key 管理测试）
│   │       └── analytics.py        # /api/analytics/summary
│   ├── core/
│   │   ├── faq_match.py            # FAQ 防线：改写→语义搜索→快速生成
│   │   ├── rag_pipeline.py         # 手写 StateGraph（router/grade/rewrite/doclink/generate）
│   │   ├── tools.py                # Agent 工具（4 个，含 2 个工厂函数）
│   │   ├── retrieval.py            # VectorRetriever/BM25Retriever/HybridRetriever
│   │   ├── retrieval_strategy.py   # enhance_query（规则扩写）+ protect_raw_candidates
│   │   ├── reranker.py             # DashScope GTE-Rerank（分批并行）
│   │   ├── embedding.py            # DashScope Embedding 工厂函数
│   │   ├── indexing.py             # 文档入库分发（policy/manual/form 三条流水线）
│   │   ├── splitter.py             # 5 种切分策略（recursive/token/sentence/semantic/manual_step）
│   │   ├── splitter_manual.py      # 操作手册步骤级切分
│   │   ├── image_describer.py      # VLM 批量图片描述（qwen-vl-plus，batch=8，MD5 缓存）
│   │   ├── cleaning/               # LangGraph 文本清洗子图（optimizer→placeholder_check→evaluator）
│   │   │   ├── graph.py / nodes.py / prompts.py / state.py
│   │   └── form_extraction/        # LangGraph 表单提取子图（Evaluator-Optimizer，最多 3 次）
│   │       ├── graph.py / nodes.py / prompts.py / state.py
│   ├── storage/
│   │   ├── database.py             # PyMySQL + DBUtils 连接池（DictCursor）
│   │   ├── document_store.py       # MySQL CRUD：KB/文档/FAQ/对话/消息/反馈/工单/设置
│   │   ├── user_store.py           # MySQL CRUD：用户/学生档案/教师档案/登录日志/导师关系
│   │   └── vector_store.py         # Qdrant 封装：集合管理/向量 CRUD/payload 过滤
│   └── parsers/                    # PDF/Word/TXT 解析器
└── frontend/
    └── src/
        ├── lib/api.ts              # Axios client（自动 refresh）+ 9 个 API 模块
        ├── lib/auth.ts             # token 存取
        ├── types/api.ts            # 所有接口 TypeScript 类型定义
        ├── hooks/useAuth.ts
        ├── components/             # AuthProvider/RouteGuard/Layout 等
        └── pages/                  # 管理端（11 页）+ 学生端 student/（4 页）
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
relevant = json.loads(raw)["relevant"]
```

**函数入口校验前置条件。**

```python
def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
    if not nodes:
        return []
    if not query.strip():
        return nodes
```

---

### 1.2 可维护性（Maintainable）

**常量和配置不要硬编码。**

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

---

### 1.3 可扩展性（Extensible）

**用工厂函数/依赖注入，不要在函数体内硬构造依赖。**

```python
# ✅
def stream_rag(query, retriever_fn, kb_name, history):
    ...

# ❌
def stream_rag(query):
    retriever = HybridRetriever(kb_name="zzu_thesis")   # 写死了
```

**给 Agent 加工具**：在 `tools.py` 加 `@tool` 函数，在 `chat.py` 的工具列表追加，不改其他地方。

**配置优先于代码**：能放 `config.yaml` 的参数（模型名、top_k、阈值）就放 config，用 `get_config()` 读取。

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
- LangGraph 节点函数统一以 `_node` 结尾（如 `router_node`, `extractor_node`）
- LangChain 工具函数用动词名词：`search_knowledge_base`, `get_academic_calendar`

### 异步

FastAPI 路由用 `async def`，LangGraph 同步调用用 `asyncio.to_thread` 包装。

```python
# ✅
final_state = await asyncio.to_thread(run_rag, query=..., retriever_fn=...)
```

### Docstring（Google Style）

所有**公共函数和类**必须使用 Google 风格 docstring。私有函数（`_` 前缀）按需添加。

```python
# ✅ Google Style
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

# ❌ 不写 docstring / 写成 Sphinx 或 NumPy 风格
```

### Import 顺序

由 Ruff（isort 规则）自动排序，三组之间空一行：

```python
# 1. 标准库
import json
import logging
from datetime import date

# 2. 第三方库
from fastapi import APIRouter
from langchain_core.messages import HumanMessage

# 3. 本项目
from src.config import get_config
from src.core.retrieval import HybridRetriever
```

### 代码格式化工具

本项目使用 **Ruff** 统一 lint + 格式化，配置在 `pyproject.toml` 的 `[tool.ruff]` 段。

```bash
poetry run ruff check --fix .   # lint + 自动修复
poetry run ruff format .        # 格式化
```

**规则要点：**
- 行长度上限 120 字符
- quote 风格：双引号
- import 排序遵循 isort 规则，`src` 为 first-party
- docstring 遵循 Google Python Style Guide
- pre-commit 会在 `git commit` 前自动运行 Ruff

前端使用 **Prettier** 格式化：

```bash
cd frontend && npm run format   # 格式化所有前端文件
```

---

## 三、LangGraph / LangChain 规范

### 当前架构：三个手写 StateGraph

| 文件 | Graph 说明 |
|------|-----------|
| `rag_pipeline.py` | 主 RAG：router → [retrieve → grade → rewrite]循环 → generate |
| `core/cleaning/graph.py` | 文档清洗：optimizer → placeholder_check → evaluator |
| `core/form_extraction/graph.py` | 表单提取：extractor → evaluator → 条件循环（最多 3 次） |

**禁止**将 `rag_pipeline.py` 改回 `create_react_agent`。当前 StateGraph 实现了精确的 CRAG 循环控制、路由决策和 safety guards 拦截，`create_react_agent` 无法支持这些能力。

### 节点命名

- 节点函数统一以 `_node` 结尾：`router_node`, `extractor_node`, `evaluator_node`
- 条件路由函数以 `_should_` 开头：`_should_continue`, `_should_rewrite`

### 工具（Tool）规范

- docstring 是 LLM 看到的描述，**必须写清楚：做什么、何时用、参数含义**
- 工具必须返回 `str`
- 工具内部异常必须捕获，返回友好字符串
- 需要运行时绑定依赖的工具用工厂函数，不用全局变量

### 当前 4 个工具（tools.py）

| 工具 | 类型 | 描述 |
|------|------|------|
| `list_kb_documents(kb_name)` | 直接工具 | 列出知识库所有文档名和 chunk 数 |
| `get_academic_calendar()` | 直接工具 | 今日日期/星期/教学周（三级缓存：知识库 → 爬取 → 过期兜底） |
| `make_search_kb_tool(retriever_fn, captured_nodes)` | **工厂函数** | 运行时绑定检索器，返回 `search_knowledge_base` 工具 |
| `make_get_document_link_tool(kb_name, file_events)` | **工厂函数** | 运行时绑定 kb_name，返回 `get_document_link` 工具 |

### retrieve_node 约定

`rag_pipeline.py` 中的 `retrieve_node` 是**空占位节点**，实际检索在 `run_rag()` / `stream_rag()` 的循环中通过 `retriever_fn` 注入执行。**不要在 `retrieve_node` 内部写检索逻辑。**

---

## 四、FastAPI 规范

### 路由文件职责

| 文件 | 职责 |
|------|------|
| `auth.py` | login / refresh / me / change-password |
| `chat.py` | SSE 流式聊天，双层问答入口 |
| `knowledge.py` | KB CRUD + active 分配 |
| `document.py` | 上传（asyncio.to_thread）/ 下载（download token）/ 重索引 / 删除 |
| `faq.py` | FAQ CRUD + 批量导入导出（openpyxl）+ 语义搜索 |
| `conversation.py` | 对话 / 消息 / 反馈 |
| `user.py` | 用户管理 + 学生/教师批量导入导出 + 导师-学生关系 |
| `ticket.py` | 学生求助工单 → 导师回答 |
| `config.py` | 系统配置读写 + API Key 管理测试 |
| `analytics.py` | 统计汇总 |

### 通用规则

- 请求体用 Pydantic `BaseModel`，字段加 `Field(...)` 校验
- 业务异常用 `HTTPException(status_code=4xx)`
- SSE 路由用 `EventSourceResponse`，阶段事件用 `event` 字段区分（`status` / `agent_action` / `token` / `sources` / `file` / `suggestions` / `done`）
- **所有路由必须加认证依赖**（默认 `Depends(get_current_user)`）
- 路由注册必须在 SPA fallback（`app.get("/{full_path:path}")`）**之前**

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

- 主键：`id INT AUTO_INCREMENT PRIMARY KEY`（或 `BIGINT UNSIGNED`）
- 时间戳：`created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- 外键：必须有 `ON DELETE CASCADE`（或 `SET NULL`）
- JSON 字段（sources/files）存 TEXT，读写时手动 `json.loads` / `json.dumps`

### 系统设置（system_settings）

用 `document_store.get_setting(key)` / `set_setting(key, value)` 存取。常用 key：

| key | 说明 |
|-----|------|
| `active_kb` | 学生端知识库名 |
| `admin_kb` | 管理端知识库名 |
| `api_key` / `dashscope_api_key` | LLM API Key（优先级高于环境变量） |
| `api_base_url` | LLM API Base URL |

### 配置读取优先级

DB `system_settings` > 环境变量 > `config.yaml` 默认值（`src/config.py` 的 `get_api_key()` / `get_api_base_url()` 已封装此逻辑）

---

## 六、前端规范

### 设计语言（Dashboard 风格）

- 外层背景：`hsl(38 22% 91%)` 暖米色，白色 `rounded-2xl` 卡片，`p-3 gap-3`
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

- **禁止** 将 `rag_pipeline.py` 改回 `create_react_agent`（当前 StateGraph 实现了 CRAG 循环控制、路由决策、safety guards 拦截，`create_react_agent` 无法支持）
- **禁止** 在 `retrieve_node` 内部写检索逻辑（该节点是空占位，检索通过 `retriever_fn` 在图外注入）
- **禁止** 直接修改 safety guards 规则列表（`_apply_answer_safety_guards`）而不附带测试用例和变更说明
- **禁止** 在 `core/` 层直接 import `FastAPI`、`Request` 等框架对象
- **禁止** 把 API key 硬编码进代码，统一从 `get_api_key()` 读取
- **禁止** 裸 `except Exception: pass`（吞掉所有异常）
- **禁止** 在 `stream_rag` / `run_rag` 内部构造 `HybridRetriever`（职责属于调用层 `chat.py`）
- **禁止** 向 git 提交 `.env` 文件
- **禁止** 新增路由时忘记加认证依赖
- **禁止** 直接修改 `poetry.lock`（通过 `poetry add` / `poetry lock` 管理）

---

## 八、Office 文档生成（claude-office-skills）

本项目集成了 [claude-office-skills](https://github.com/tfriedel/claude-office-skills)，支持生成 PPTX / DOCX / XLSX / PDF。

### 路径

- Skills 仓库：`/Users/gefeng/projects/claude-office-skills/`
- Python 环境：`/Users/gefeng/projects/claude-office-skills/venv/bin/python`
- 输出目录：`/Users/gefeng/projects/claude-office-skills/outputs/<document-name>/`

### 使用流程

创建任何 Office 文档前，**必须先阅读对应的 SKILL.md**：

| 格式 | SKILL.md 路径 |
|------|--------------|
| PPTX | `/Users/gefeng/projects/claude-office-skills/public/pptx/SKILL.md` |
| DOCX | `/Users/gefeng/projects/claude-office-skills/public/docx/SKILL.md` |
| XLSX | `/Users/gefeng/projects/claude-office-skills/public/xlsx/SKILL.md` |
| PDF  | `/Users/gefeng/projects/claude-office-skills/public/pdf/SKILL.md` |

### 关键规则

1. **所有命令使用绝对路径**的 venv python：`/Users/gefeng/projects/claude-office-skills/venv/bin/python`
2. **输出文件统一放到** `outputs/<document-name>/` 目录下
3. **PPTX 创建流程**：设计 HTML slides → html2pptx 转换 → 缩略图验证 → 迭代修正
4. **OOXML 编辑后必须验证**：`venv/bin/python public/pptx/ooxml/scripts/validate.py`
