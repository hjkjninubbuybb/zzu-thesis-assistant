# CLAUDE.md — 项目顶层入口

## 项目概览

郑州大学本科毕业设计 Q&A 助手（Agentic RAG）。面向学生和导师，解答毕业设计全流程问题。

- **后端**：FastAPI + LangGraph 手写 StateGraph + Qdrant + MySQL + DashScope（详见 [backend/CLAUDE.md](./backend/CLAUDE.md)）
- **前端**：React 19 + TypeScript + Vite + Zustand + React Query（详见 [frontend/CLAUDE.md](./frontend/CLAUDE.md)）
- **架构原则**：前后端**完全分开**——FastAPI 不托管前端静态资源，两者仅通过 HTTP API + CORS 通信

---

## 顶层结构

```
rag1.0/
├── backend/                ← 后端项目（Python / FastAPI）
├── frontend/               ← 前端项目（React / Vite）
├── infra/                  ← 跨项目基础设施（docker-compose）
├── docs/                   ← 跨项目文档
│   ├── directory-layout.md ← 顶层目录规范
│   ├── adr/
│   └── superpowers/specs/  ← 历史设计稿
├── .github/                ← CI 工作流
└── CLAUDE.md (本文件)
```

详细约束见 [docs/directory-layout.md](./docs/directory-layout.md)。

---

## 我该看哪份规范

| 我在改什么 | 看哪份 CLAUDE.md | 看哪份 standards.md |
|------------|-----------------|---------------------|
| `backend/` 任何内容 | [backend/CLAUDE.md](./backend/CLAUDE.md) | [backend/docs/standards.md](./backend/docs/standards.md) |
| `frontend/` 任何内容 | [frontend/CLAUDE.md](./frontend/CLAUDE.md) | [frontend/docs/standards.md](./frontend/docs/standards.md) |
| 新增顶层目录或文件 | 本文件 | [docs/directory-layout.md](./docs/directory-layout.md) |
| 部署相关（docker / nginx） | 本文件 | [docs/directory-layout.md](./docs/directory-layout.md) |

`backend/CLAUDE.md` 和 `frontend/CLAUDE.md` 都是**完整的**——只看其中一份就能改对应项目，无需跨目录跳转。

---

## 启动方式（完全分开后）

```bash
# 1. 启动基础设施（一次性）
docker-compose -f infra/docker-compose.yml up -d

# 2. 启动后端（开发期 :8000）
cd backend && poetry run dev

# 3. 启动前端（开发期 :5173）
cd frontend && npm run dev
```

访问地址：
- 管理端：`http://localhost:5173/admin`
- 学生端：`http://localhost:5173/student`
- API 文档：`http://localhost:8000/docs`

---

## 顶层约束（跨项目通用）

### 禁止事项

- **禁止** 后端代码 import 前端、或反之
- **禁止** 后端 FastAPI 托管前端静态资源 / SPA fallback
- **禁止** 在仓库根新增**单项目专属**文件（应放进 `backend/` 或 `frontend/`）
- **禁止** 单项目专属文档放进 `docs/`（应放进 `<project>/docs/`）
- **禁止** 向 git 提交 `.env` 文件
- **禁止** 把 API key 硬编码进代码

### 状态说明

本仓库正在从「混合根目录」迁移到「完全分开」结构。当前代码尚未完成迁移，三份规范文档描述的是**目标态**：

- [docs/directory-layout.md § 待落地清单](./docs/directory-layout.md#6-附录待落地清单)
- [backend/docs/standards.md § 待落地清单](./backend/docs/standards.md#11-附录待落地清单)
- [frontend/docs/standards.md § 待落地清单](./frontend/docs/standards.md#12-附录待落地清单)

代码层面的迁移需另开重构会话执行。

---

## 历史设计稿

```
docs/superpowers/specs/
├── 2026-05-27-refactor-design.md           ← 后端 4 层架构重构设计
├── 2026-05-27-frontend-refactor-design.md  ← 前端 features/shared 重构设计
└── 2026-05-30-engineering-docs-design.md   ← 本次规范文档总体设计
```

这些是**历史决策记录**（ADR 性质），用于追溯设计意图，不再更新。日常开发约束以 `standards.md` 为准。
