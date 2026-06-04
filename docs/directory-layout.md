# 项目顶层目录规范

> **作用**：定义仓库根目录下每个文件夹的职责边界，以及"新增一个文件该放哪"的判断标准。
>
> **范围**：本文档**只规范顶层结构**（一级目录）。`backend/` 内部细节见 [backend/docs/standards.md](../backend/docs/standards.md)，`frontend/` 内部细节见 [frontend/docs/standards.md](../frontend/docs/standards.md)。
>
> **状态**：目标态。当前代码尚未完成迁移，待落地清单见文末附录。

---

## 1. 顶层结构

```
rag1.0/
├── backend/                 # Python 后端项目（自包含）
├── frontend/                # React 前端项目（自包含）
├── infra/                   # 跨前后端基础设施
├── docs/                    # 仅放跨项目内容（本文件所在地）
├── .github/                 # GitHub 配置：CI workflow、模板
├── .gitignore               # 仅忽略顶层级条目（.DS_Store / .idea 等）
├── .pre-commit-config.yaml  # 同时跑 ruff（后端）+ prettier/eslint（前端）
├── CLAUDE.md                # 顶层薄入口，指向 backend/CLAUDE.md 和 frontend/CLAUDE.md
├── README.md                # 项目门面：项目介绍 + 导航到 backend/ 和 frontend/
└── LICENSE
```

### 设计原则

- **前后端完全分开**：`backend/` 和 `frontend/` 各自是自包含的独立项目。每边有自己的 README、依赖、CI 配置、Dockerfile、CLAUDE.md、docs。理论上可以拆成两个独立 git 仓库而无需修改任何代码。
- **顶层只放跨项目内容**：单个项目独占的东西必须放进该项目的目录，不允许散在根目录（违反"前后端完全分开"的核心约束）。
- **后端不知道前端存在**：FastAPI **不**托管前端静态资源，**不**做 SPA fallback。两者仅通过 HTTP API + CORS 通信。

---

## 2. 顶层目录职责

### 2.1 `backend/` — 后端项目

完全自包含的 Python 项目。包含源码、测试、配置、数据库 DDL、工具脚本、评测套件、依赖清单、Dockerfile、专属 CLAUDE.md 和 docs。

详细内部结构见 [backend/docs/standards.md](../backend/docs/standards.md)。

**一级目录概览（仅作导航）**：

| 目录 | 用途 |
|------|------|
| `backend/src/` | Python 源码（api / services / core / storage / parsers） |
| `backend/tests/` | pytest 测试（镜像 `src/` 结构） |
| `backend/configs/` | `config.yaml` 等配置 |
| `backend/sql/` | MySQL DDL（`init.sql`） |
| `backend/scripts/` | 一次性工具脚本：迁移、seed、normalize |
| `backend/evaluation/` | RAG 评测套件（数据集 + runner + 报告） |
| `backend/data/` | 运行时数据（gitignore） |
| `backend/docs/` | 后端专属文档：standards.md、architecture.md、adr/ |

**根文件**：`pyproject.toml`、`poetry.lock`、`Dockerfile`、`.gitignore`、`.env.example`、`README.md`、`CLAUDE.md`

### 2.2 `frontend/` — 前端项目

完全自包含的 Vite + React + TypeScript 项目。

详细内部结构见 [frontend/docs/standards.md](../frontend/docs/standards.md)。

**一级目录概览（仅作导航）**：

| 目录 | 用途 |
|------|------|
| `frontend/src/` | React 源码（app / features / pages / shared） |
| `frontend/e2e/` | Playwright 端到端测试 |
| `frontend/public/` | 静态资源（favicon、robots.txt 等） |
| `frontend/docs/` | 前端专属文档：standards.md、architecture.md |

**根文件**：`package.json`、`vite.config.ts`、`tsconfig.json`、`Dockerfile`、`.gitignore`、`README.md`、`CLAUDE.md`

> **单元/组件测试不在 `tests/` 目录**，而是与源文件同位（co-located）：`<file>.ts` 旁边 `<file>.test.ts`。

### 2.3 `infra/` — 跨项目基础设施

服务于"运行/部署整个系统"的配置，独立于前后端任一项目。

| 文件 | 用途 |
|------|------|
| `infra/docker-compose.yml` | 启动 Qdrant + MySQL 容器（前后端都依赖的运行时） |
| `infra/nginx/` | 可选：生产环境 Nginx 配置示例（静态托管 + API 反代） |

**不属于 infra/ 的**：
- 后端 Dockerfile（属于 `backend/`）
- 前端 Dockerfile（属于 `frontend/`）
- 单项目的 CI 配置（属于 `.github/workflows/`）

### 2.4 `docs/` — 跨项目文档

只放**真正跨前后端**的文档。单项目专属文档必须放进该项目的 `docs/`。

```
docs/
├── directory-layout.md     # 本文件
├── adr/                    # 跨项目架构决策（如"前后端完全分开"的决策记录）
└── superpowers/            # 历史 specs 沿用此路径，不迁移
    ├── specs/              # 已有的重构设计稿
    └── plans/
```

**什么文档放这里**：
- 项目整体架构（前后端如何通信、部署形态）
- 跨项目决策记录（ADR）
- 历史设计稿（已沉淀的 specs/plans）

**什么文档**不**放这里**：
- 后端编码规范 → `backend/docs/standards.md`
- 前端编码规范 → `frontend/docs/standards.md`
- 后端架构细节 → `backend/docs/architecture.md`
- 前端架构细节 → `frontend/docs/architecture.md`

### 2.5 `.github/` — GitHub 配置

| 文件 | 用途 |
|------|------|
| `.github/workflows/backend-ci.yml` | 后端 CI（path filter: `backend/**`）：ruff + pytest |
| `.github/workflows/frontend-ci.yml` | 前端 CI（path filter: `frontend/**`）：tsc + eslint + vitest + build |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 模板（可选） |
| `.github/ISSUE_TEMPLATE/` | Issue 模板（可选） |

**GitHub 强制要求这个目录在仓库根**，不能放进 `backend/` 或 `frontend/`。

### 2.6 顶层根文件

| 文件 | 内容 |
|------|------|
| `CLAUDE.md` | 薄入口：项目简介 + 指向 `backend/CLAUDE.md` 和 `frontend/CLAUDE.md` |
| `README.md` | 项目门面：项目介绍 + 启动方式 + 导航到 backend/ 和 frontend/ |
| `LICENSE` | 项目许可证（推荐 MIT） |
| `.gitignore` | **极简版**：只忽略 OS 级和 IDE 级条目（`.DS_Store`、`.idea/`）。Python/Node 相关忽略放进各自项目的 `.gitignore` |
| `.pre-commit-config.yaml` | 同时跑后端 ruff 和前端 prettier/eslint |
| `.env.example` | 留顶层，开发者从根目录一眼可见；实际加载由 backend 完成 |

---

## 3. 文件放置决策树

新增一个文件时，按以下顺序判断该放哪：

```
1. 这是 Python 代码 / 后端配置 / 后端测试 / SQL / 后端脚本吗？
   是 → backend/<对应子目录>
   否 → 继续

2. 这是 React 代码 / TypeScript 代码 / 前端测试 / 前端配置吗？
   是 → frontend/<对应子目录>
   否 → 继续

3. 这是 docker-compose / nginx / k8s 等部署基础设施吗？
   是 → infra/
   否 → 继续

4. 这是跨前后端的文档吗？（架构、ADR、历史 spec）
   是 → docs/
   否 → 继续

5. 这是 GitHub 平台强制的配置吗？（workflow、模板）
   是 → .github/
   否 → 继续

6. 这是 OS/工具链级别的根文件吗？（.gitignore、README、LICENSE）
   是 → 顶层
   否 → 重新分类，大概率应该归入 backend/ 或 frontend/
```

### 反例：常见误放

| 文件 | 错误位置 | 正确位置 | 原因 |
|------|---------|---------|------|
| `evaluate_rag_dataset.py` | `scripts/`（顶层） | `backend/evaluation/runners/` | 评测属于后端 |
| `migrate_sqlite_to_mysql.py` | `scripts/`（顶层） | `backend/scripts/` | 单项目脚本不放顶层 |
| `architecture.md`（描述后端分层） | `docs/` | `backend/docs/architecture.md` | 不是跨项目的 |
| `docker-compose.yml` | 顶层 | `infra/docker-compose.yml` | 部署基础设施 |
| `Dockerfile.backend` + `Dockerfile.frontend` 顶层 | 顶层 | `backend/Dockerfile` + `frontend/Dockerfile` | 单项目 Dockerfile 跟项目走 |
| `tsconfig.json` | 顶层 | `frontend/tsconfig.json` | 前端工具配置 |
| `dist/`（前端构建产物） | 顶层 | `frontend/dist/` | 前端产物 |

---

## 4. 启动方式（顶层视角）

完全分开之后，前后端独立启动：

```bash
# 启动基础设施（一次性）
docker-compose -f infra/docker-compose.yml up -d

# 启动后端（开发期 :8000）
cd backend && poetry run dev

# 启动前端（开发期 :5173）
cd frontend && npm run dev
```

访问地址：
- 管理端：`http://localhost:5173/admin`（前端 Vite 服务）
- 学生端：`http://localhost:5173/student`
- API 文档：`http://localhost:8000/docs`（后端 FastAPI）

前端通过 `VITE_API_BASE_URL=http://localhost:8000/api` 调用后端，后端通过 CORS 中间件允许前端来源。

---

## 5. 禁止事项（顶层规范）

| 禁止 | 原因 |
|------|------|
| 在仓库根新增**单项目专属**文件（如根目录加 Python 源文件） | 破坏"前后端完全分开"，根目录应保持极简 |
| 后端代码 import 前端、或反之（任何形式） | 完全分开的物理表现 |
| 后端 FastAPI 托管前端静态资源 / SPA fallback | 越界，违反完全分开原则 |
| `docs/` 写单项目专属文档 | 应放进 `backend/docs/` 或 `frontend/docs/` |
| `infra/` 放单项目 Dockerfile | Dockerfile 应跟项目走 |
| 顶层 `scripts/` 目录 | 单项目脚本归项目内（`backend/scripts/`） |
| 顶层 `node_modules/` | 应只在 `frontend/node_modules/`（npm 自动管理） |

---

## 6. 附录：待落地清单

本规范描述的是**目标态**。当前代码尚未完成迁移，以下变动需另开重构会话执行：

### 6.1 目录迁移

| 当前位置 | 目标位置 |
|---------|---------|
| `src/` | `backend/src/` |
| `tests/` | `backend/tests/` |
| `configs/` | `backend/configs/` |
| `sql/` | `backend/sql/` |
| `scripts/`（除评测脚本） | `backend/scripts/` |
| `scripts/evaluate_*.py` | `backend/evaluation/runners/` |
| `data/` | `backend/data/` |
| `pyproject.toml` + `poetry.lock` | `backend/pyproject.toml` + `backend/poetry.lock` |
| `.env.example` | 顶层保留（开发者从根可见），实际加载由 `backend/src/config.py` 完成 |
| `docker-compose.yml` | `infra/docker-compose.yml` |
| `dist/` | 删除（前端构建产物放 `frontend/dist/`） |

### 6.2 后端去耦合（删除 FastAPI 托管前端的代码）

- 删除 `src/api/app.py` 中的 `app.mount("/admin", ...)`、`app.mount("/student", ...)`、`app.mount("/assets", ...)`
- 删除 SPA fallback 路由 `@app.get("/{full_path:path}")`
- 新增 CORS 中间件，从 `config.yaml` 读取 `cors_origins`

### 6.3 前端配置

- 新增 `frontend/.env.example`：`VITE_API_BASE_URL=http://localhost:8000/api`
- 改 `frontend/src/shared/lib/api.ts` 的 axios baseURL 从 `/api` 改为 `import.meta.env.VITE_API_BASE_URL`

### 6.4 CLAUDE.md 拆分

- 顶层 `CLAUDE.md` 改为薄入口
- 新建 `backend/CLAUDE.md`、`frontend/CLAUDE.md`（详见各自 standards.md）

### 6.5 CI 配置

- 新建 `.github/workflows/backend-ci.yml`（path filter: `backend/**`）
- 新建 `.github/workflows/frontend-ci.yml`（path filter: `frontend/**`）

### 6.6 启动脚本

- `backend/pyproject.toml` 的 `poetry run dev` / `poetry run start` 不再启动前端 Vite，只管后端
- 前端独立用 `npm run dev` 启动

### 6.7 不再需要的兼容性

落地完成后，所有跨项目引用、共享路径、混合配置应一次性清除。**不保留任何向后兼容**。

---

*文档版本：v1.0 | 创建日期：2026-05-30*
