# CLAUDE.md — 项目编码规范

## 项目概览

郑州大学本科毕业设计 Q&A 系统（Agentic RAG）。
- **后端**: FastAPI + LangGraph ReAct Agent
- **检索**: Qdrant 向量库 + BM25，RRF 融合 + DashScope Rerank
- **LLM/Embedding**: DashScope（通义千问系列）
- **前端**: React + TypeScript + Vite（构建产物由 FastAPI 静态托管）
- **存储**: Qdrant（向量）+ SQLite（文档元数据）

### 启动方式

1. 启动 Qdrant：`docker-compose up -d`
2. 确认 `.env` 中已填写 `DASHSCOPE_API_KEY`
3. 启动后端：

```powershell
# PowerShell（开发模式，热重载）
$env:PYTHONUTF8=1; poetry run dev

# PowerShell（生产模式）
$env:PYTHONUTF8=1; poetry run start
```

```bash
# Git Bash / Linux / macOS
PYTHONUTF8=1 poetry run dev
```

4. 前端改动后需重新构建（开发模式也需要）：

```bash
cd frontend && npm run build
```

访问地址：http://localhost:8000

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
relevant = result.get("relevant", False)   # 有默认值

# ❌
relevant = json.loads(raw)["relevant"]     # 两处都可能抛异常
```

**函数入口校验前置条件。** 空列表、None、空字符串在函数开头 early return，不要让错误传播进逻辑核心。

```python
def rerank(self, query: str, nodes: list[dict]) -> list[dict]:
    if not nodes:          # ✅ early return
        return []
    if not query.strip():
        return nodes
    ...
```

---

### 1.2 可维护性（Maintainable）

**常量和配置不要硬编码在业务逻辑里。** 数字、字符串常量提取为模块级常量或放入 `configs/config.yaml`。

```python
# ✅
RELEVANCE_THRESHOLD = 0.5
RRF_K = 60

# ❌
if score >= 0.5:          # 魔法数字
    ...
```

**每个模块只做一件事。** `tools.py` 只放工具定义；`retrieval.py` 只管检索；`rag_pipeline.py` 只管 Agent 编排。跨职责的逻辑要拆开，不要图省事往一个文件里塞。

**日志要有上下文，用结构化格式。** 每条 log 要能回答"哪个模块、发生了什么、关键数值是多少"。

```python
# ✅
logger.info("[grade_docs] %d/%d 篇相关，sufficient=%s", len(graded), len(nodes), sufficient)

# ❌
logger.info("done")
```

**不要写没有调用者的死代码。** 节点写好必须接入图；函数写好必须有调用路径。写了不用的代码要立即删除或注明 TODO。

---

### 1.3 可扩展性（Extensible）

**用工厂函数/依赖注入，不要在函数体内硬构造依赖。**

```python
# ✅ 通过参数注入，方便测试和替换
def build_rag_agent(retriever_fn, captured_nodes: list):
    ...

# ❌ 内部硬构造，无法替换
def build_rag_agent():
    retriever = HybridRetriever(kb_name="zzu_thesis")  # 写死了
    ...
```

**新增工具/节点遵循现有接口，不改已有签名。** 给 Agent 加工具只需在 `tools.py` 加 `@tool` 函数，然后在 `rag_pipeline.py` 的 `tools` 列表里追加，不要改其他任何地方。

**配置优先于代码。** 能放 `config.yaml` 的参数（模型名、top_k、阈值）就放 config，不要散落在代码里，方便调参时不动代码。

---

## 二、Python 编码规范

### 类型标注

所有 **公共函数** 必须有完整的参数和返回值类型标注。

```python
# ✅
def retrieve(self, query: str) -> list[dict]:
    ...

def make_search_kb_tool(retriever_fn, captured_nodes: list) -> ...:
    ...
```

内部私有函数（`_` 前缀）可以省略，但有复杂逻辑时建议加。

### 命名

- 文件/模块：`snake_case`
- 类：`PascalCase`
- 函数/变量：`snake_case`
- 常量：`UPPER_SNAKE_CASE`
- LangGraph 节点函数统一以 `_node` 结尾：`retrieve_node`, `generate_node`
- LangChain 工具函数用动词名词：`search_knowledge_base`, `get_academic_calendar`

### 异步

FastAPI 路由用 `async def`，但 LangGraph/LangChain 的同步调用（`agent.invoke`）不要放在事件循环里直接 await。需要异步时用 `asyncio.to_thread` 包装。

```python
# ✅ 在 async 路由中调用同步阻塞函数
final_state = await asyncio.to_thread(run_rag, query=..., retriever_fn=...)
```

---

## 三、LangGraph / LangChain 规范

### Agent 和 Graph 分离

- **ReAct Agent**（`create_react_agent`）：用于需要自主决策工具调用的场景
- **StateGraph 手动编排**：用于需要精确控制节点顺序/条件路由的场景
- 不要在一个 graph 里既有 `create_react_agent` 又有手动节点，职责要清晰

### 工具（Tool）

- 每个 `@tool` 函数的 docstring 是 LLM 看到的工具描述，**必须写清楚：做什么、什么时候用、参数含义**
- 工具必须返回 `str`，不要返回复杂对象
- 工具内部异常不能向上抛，要捕获后返回友好字符串（Agent 会把异常当做 Observation 继续推理）
- 需要运行时绑定依赖的工具用工厂函数（`make_xxx_tool`），不要用全局变量

### State

- `TypedDict` 中所有字段都要有合理默认值（在 `run_rag` 的 `initial` 里设置）
- 节点函数只返回需要更新的字段，不要返回整个 state

---

## 四、FastAPI 规范

- 路由按资源拆文件：`chat.py` / `knowledge.py` / `document.py` / `config.py`
- 请求体用 Pydantic `BaseModel`，**字段加 `Field(...)` 做校验**（`min_length`, `ge`, `le`, `pattern`）
- 业务异常用 `HTTPException(status_code=4xx, detail="...")`，不要直接返回 500
- SSE 路由用 `EventSourceResponse`，每个阶段 yield `status` 事件，结束 yield `done`

---

## 五、禁止事项

- **禁止** 在 `core/` 层直接 import `FastAPI`、`Request` 等框架对象
- **禁止** 把 API key 硬编码进代码，统一从 `os.environ.get(...)` 读取
- **禁止** 在不确定的地方用 `except Exception: pass`（吞掉所有异常）
- **禁止** 在 `build_rag_graph` / `build_rag_agent` 内部构造 `HybridRetriever`（职责属于调用层）
- **禁止** 写完节点不接入图就提交（检查：每个 `add_node` 都要有对应的 edge）
- **禁止** 向 git 提交 `.env` 文件
