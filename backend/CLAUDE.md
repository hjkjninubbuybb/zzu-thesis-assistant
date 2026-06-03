# CLAUDE.md — 后端编码规范

> 本文件是后端项目的入口指南。**完整规范**见 [docs/standards.md](./docs/standards.md)。本文件聚焦"最关键的约束 + 项目特有信息"，便于 AI 助手快速建立上下文。

## 项目概览

郑州大学本科毕业设计 Q&A 助手——**后端**部分。

- **框架**：FastAPI + Uvicorn
- **AI 编排**：LangGraph（手写 StateGraph）+ LangChain
- **LLM / Embedding / VLM**：DashScope（qwen-plus 强能力模型 / qwen-turbo 快速模型 / qwen-vl-plus VLM）
- **向量检索**：Qdrant + text-embedding-v3（1024 维）
- **关键词检索**：BM25（bm25s + jieba）
- **重排序**：DashScope GTE-Rerank
- **关系数据库**：MySQL 8.0
- **认证**：JWT（python-jose + passlib/bcrypt），三种角色：admin / teacher / student

### 双层问答架构

- **第一层（FAQ 防线）**：`src/core/faq_match.py` — LLM 改写查询 → 语义向量匹配 FAQ 库（阈值 0.75），超过阈值用快速模型生成答案；答案含 `[FALLBACK]` 标记则降级到 RAG
- **第二层（RAG 核心）**：`src/core/agent/orchestrator.py` — **手写 StateGraph**（非 `create_react_agent`）三条路由：
  - `hard_rag`：所有毕设相关问题 → 混合检索 → 强能力模型 CRAG 评估 → 最多 3 次重写
  - `download`：下载请求 → 文件匹配 → 卡片下发
  - `direct`：闲聊 → 直接生成
- **Safety Guards**：`src/core/agent/safety_guards.py` 内置 20+ 条硬编码规则，LLM 生成后拦截高频错误答案（查重率/开题时间/指导人数等），**修改时必须附测试用例**

### 角色权限

| 角色 | 可访问功能 |
|------|-----------|
| admin | 全部（知识库/文档/FAQ/用户管理/统计/设置 + 对话 + 工单管理） |
| teacher | 同 admin（工单由导师回答） |
| student | 仅聊天/FAQ/工单（求助导师） |

默认管理员：`admin` / `admin123`（首次启动 `ensure_default_admin()` 自动创建）

### 启动方式

```bash
poetry install
poetry run dev    # 开发（:8000，热重载）
poetry run start  # 生产（:8000）
```

前端独立启动（见 [../frontend/CLAUDE.md](../frontend/CLAUDE.md)），不在后端职责内。

### 配置文件

- `configs/config.yaml`：全局配置（模型/检索/DB/Auth）
- `.env`：API Key 等敏感配置（gitignore）
- DB `system_settings` 表：运行时配置（前端可改）

配置读取优先级：**DB > 环境变量 > config.yaml**，封装在 `src/config.py`。

---

## 四层架构

```
api/routes  →  services  →  core
                         →  storage
                                  ↘
                      所有层 → src/exceptions.py
```

| 层 | 职责 | 关键禁止 |
|----|------|---------|
| `api/routes/` | HTTP 翻译（请求 ↔ 响应） | 不写业务逻辑、不直接调 storage/core |
| `services/` | 业务编排（调 core + storage） | 不抛 HTTPException、不 import fastapi |
| `core/` | AI 算法（Agent / RAG / 切分） | 不知道 HTTP、不知道数据库 |
| `storage/` | 数据访问（MySQL / Qdrant） | 不写业务判断、不调 VectorStore |

依赖单向，下层严禁 import 上层。详见 [docs/standards.md § 2](./docs/standards.md#2-分层依赖规则)。

---

## 关键约束（10 条必看）

1. **禁止**将 RAG pipeline 改回 `create_react_agent`（StateGraph 实现了 CRAG 循环、路由决策、safety guards 拦截，`create_react_agent` 无法支持）
2. **禁止**在 `retrieve_node` 内部写检索逻辑（空占位节点，检索通过 `retriever_fn` 在图外注入）
3. **禁止**直接修改 `safety_guards.py` 而不附带测试用例
4. **禁止** `core/` 任何文件 import `fastapi` / `src.storage` / `src.api` / `src.services`
5. **禁止** `services/` 抛 `HTTPException`（只抛 `AppException` 子类）
6. **禁止**裸 `except Exception: pass`，外部调用必须带 timeout + 异常分类
7. **禁止**把 `document_store.py` 当新功能入口（用具体 Store）
8. **禁止**新增路由时忘记加认证依赖（`Depends(get_current_user)`）
9. **禁止**SQL 字符串拼接（用参数化查询）
10. **禁止**API Key 硬编码，统一从 `get_api_key()` 读取

---

## 关键文件速查

| 任务 | 改哪里 |
|------|--------|
| 加新 API 接口 | `api/schemas/<域>.py` → `services/<域>_service.py` → `api/deps.py` → `api/routes/<域>.py` |
| 加新文档类型 | `core/indexing/<type>.py` + `core/indexing/dispatcher.py` |
| 加新 Agent 工具 | `core/agent/tools/<tool>.py` + `core/agent/factory.py` |
| 加新 Safety Guard 规则 | `core/agent/safety_guards.py` + `tests/core/agent/test_safety_guards.py`（必须配测试） |
| 改提示词 | 对应子图的 `prompts.py`（`core/agent/` / `core/cleaning/` / `core/form_extraction/`） |
| 加新数据库表 | `sql/init.sql` + `storage/interfaces/<store>.py` + `storage/<store>.py` |

---

## 测试

- pytest 测试在 `tests/`，镜像 `src/` 结构
- 集成测试用 `@pytest.mark.integration` marker，不分目录
- RAG 评测在 `evaluation/`（不属于 pytest）
- 必测场景：safety guards 改动、新异常类型、storage SQL 改动、新 Agent 工具、新索引流水线

详见 [docs/standards.md § 8](./docs/standards.md#8-测试规范)。

---

## 代码格式化

```bash
poetry run ruff check --fix .   # lint + 自动修复
poetry run ruff format .        # 格式化
```

规则要点：行长 120、双引号、isort first-party = `src`、Google docstring。pre-commit 自动跑。

---

## 状态说明

本目录是**完全分开后的目标态**。当前代码仍部分在 `<repo>/src/`、`<repo>/tests/` 等顶层位置，迁移待执行。

详细待落地清单见 [docs/standards.md § 11](./docs/standards.md#11-附录待落地清单)。

---

*相关：[docs/standards.md](./docs/standards.md) · [顶层 CLAUDE.md](../CLAUDE.md) · [前端 CLAUDE.md](../frontend/CLAUDE.md)*
