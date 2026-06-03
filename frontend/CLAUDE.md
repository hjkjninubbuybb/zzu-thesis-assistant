# CLAUDE.md — 前端编码规范

> 本文件是前端项目的入口指南。**完整规范**见 [docs/standards.md](./docs/standards.md)。本文件聚焦"最关键的约束 + 项目特有信息"，便于 AI 助手快速建立上下文。

## 项目概览

郑州大学本科毕业设计 Q&A 助手——**前端**部分。

- **框架**：React 19 + TypeScript + Vite
- **样式**：TailwindCSS + shadcn/ui（可控副本，本地维护）
- **路由**：React Router v6
- **服务端状态**：TanStack React Query
- **客户端状态**：Zustand（三个 Store：auth / ui / upload）
- **网络**：Axios（含 token 自动刷新拦截器）
- **流式聊天**：原生 SSE 封装（`shared/lib/streamChat.ts`）
- **E2E 测试**：Playwright

### 双 Portal 设计

- **管理端**（`/admin/*`）：admin / teacher 角色访问，完整功能（知识库 / 文档 / FAQ / 用户管理 / 统计 / 设置 / 对话 / 工单）
- **学生端**（`/student/*`）：student 角色访问，仅聊天 / FAQ 浏览 / 个人中心 / 求助工单
- 通过 `shared/components/auth/RouteGuard.tsx` 守卫路由
- 所有页面路由使用 `React.lazy()` + `<Suspense>` 懒加载，管理端与学生端代码分离

### 设计语言

- **管理端**：暖米色背景 `hsl(38 22% 91%)`、白色 `rounded-2xl` 卡片、64px 窄图标侧边栏（激活态黑色填充）、深色对比卡（`#1A1A1A`）、`fadeSlideUp` / `hover-lift` 动画
- **学生端**：复用基础组件，配色和密度按学生场景调整

### 启动方式

```bash
npm install
npm run dev      # 开发（:5173）
npm run build    # 构建（产出 dist/）
npm run preview  # 预览构建产物
```

后端独立启动（见 [../backend/CLAUDE.md](../backend/CLAUDE.md)），通过 `VITE_API_BASE_URL=http://localhost:8000/api` 调用。

---

## 四层架构

```
pages/                  →  只组合，不写逻辑（≤ 10 行）
    ↓
features/components/    →  渲染 + 用户交互
    ↓
features/hooks/         →  状态 + 副作用（useQuery / useMutation / Zustand）
    ↓
features/services/      →  数据转换 + API 调用（纯函数）
    ↓
shared/lib/api.ts       →  Axios HTTP 请求
```

| 层 | 职责 | 关键禁止 |
|----|------|---------|
| `pages/` | 路由入口（≤ 10 行） | 不写 `useState` / `useQuery` / 业务逻辑 |
| `features/components/` | 渲染 + 交互 | 不直接调 `api.ts`，不在函数体内 `useQuery` |
| `features/hooks/` | 状态机 | 不返回 JSX，必须经过 service 调 API |
| `features/services/` | 数据转换 | 不持有状态，不 import React |
| `shared/lib/api.ts` | HTTP | 只做请求，不做业务 |

依赖单向，下层严禁 import 上层。详见 [docs/standards.md § 2](./docs/standards.md#2-分层依赖规则)。

---

## Feature 模块自治

```
features/<name>/
├── components/         ← React 组件
├── hooks/
│   ├── queryKeys.ts    ← 固定文件名：React Query Key 工厂
│   └── use<Name>*.ts   ← 业务 Hook
├── services/<name>Service.ts
├── types.ts            ← feature 内部类型
└── index.ts            ← 对外唯一出口（只导出根组件）
```

- **Feature 间禁止互相 import**（任何形式）
- 跨 feature 引用必须通过 `index.ts`
- 跨 feature 数据共享 → 升级到 `shared/services/` + `shared/hooks/`
- 跨 feature UI 状态 → 走 `shared/store/uiStore`

---

## 关键约束（10 条必看）

1. **禁止** `pages/` 里写 `useState` / `useQuery` / 业务逻辑
2. **禁止**组件直接调 `shared/lib/api.ts`（必须经过 service）
3. **禁止** `useQuery` / `useMutation` 写在组件函数体内（必须封装到 feature hooks）
4. **禁止**跨 feature 直接 import（绕过 `index.ts`） — ESLint `eslint-plugin-boundaries` 会拒
5. **禁止**新建 React Context 做全局状态（Zustand 已覆盖所有场景）
6. **禁止**组件直接操作 Zustand store，必须经过 Selector Hook
7. **禁止**修改 shadcn 源文件（新建同名扩展文件）
8. **禁止**用 `any` 类型（除非 disable 注释说明原因）
9. **禁止**相对路径 `../../../`，必须用路径别名（`@/` / `@features/` / `@shared/` / `@pages/`）
10. **禁止**假设 API 同源 — 所有 API 通过 `shared/lib/api.ts` 走 `VITE_API_BASE_URL`

---

## 状态管理速查

| 状态类型 | 方案 |
|---------|------|
| 后端异步数据 | React Query |
| 登录用户信息 | `authStore`（Selector Hook：`useAuthUser` / `useIsAdmin` 等） |
| 跨页面 UI（toast / confirm / sidebar / activeKBName） | `uiStore` |
| 文件上传队列 | `uploadStore` |
| 组件内部临时状态 | `useState` |

**禁止**用 React Query 存纯 UI 状态、用 Zustand 存后端列表数据。

Store 末尾必须导出 Selector Hook，组件只调 Selector Hook。多 key Selector 用 `useShallow`：

```ts
const { collapsed, set } = useUIStore(useShallow(s => ({
  collapsed: s.sidebarCollapsed,
  set: s.setSidebarCollapsed,
})));
```

---

## 错误处理

集中在 `shared/lib/errorHandler.ts`：

```ts
// feature hooks
const { showToast } = useToast();
const deleteMutation = useMutation({
  mutationFn: knowledgeService.delete,
  onError: (err) => handleMutationError(err, showToast),
});
```

不在各页面各自 try/catch API 错误。

---

## 测试

- 单元/组件测试**可选**，但已写的必须遵守位置约定
- **Co-located**：`useChat.ts` 旁边 `useChat.test.ts`
- 框架：Vitest + React Testing Library + msw
- E2E：Playwright 在 `e2e/`，必须保持绿
- 建议至少补：`services/` 纯函数、复杂 hooks（如 `useChat`）、`errorHandler`

详见 [docs/standards.md § 8](./docs/standards.md#8-测试规范)。

---

## 代码格式化

```bash
npm run format    # Prettier
npm run lint      # ESLint
```

pre-commit 自动跑。

---

## 关键文件速查

| 任务 | 改哪里 |
|------|--------|
| 加新 feature | 按 [docs/standards.md § 10](./docs/standards.md#10-新增功能标准流程) 7 步流程 |
| 加新 API 调用 | `shared/types/api.ts` → `shared/lib/api.ts` 新 module → 对应 feature 的 `services/` |
| 加新 Zustand store | `shared/store/<name>Store.ts`，末尾必须导出 Selector Hooks |
| 加新 shadcn 组件 | 复制官方代码到 `shared/components/ui/`，定制时新建 `<Name>Variant.tsx` |
| 改设计语言 | `src/index.css`（动画类、颜色变量）+ `shared/components/layout/` |
| 加新路由 | `app/routes.tsx` + `pages/<portal>/<Name>Page.tsx`（薄容器） |
| 加新 E2E | `e2e/<scenario>.spec.ts` |

---

## 状态说明

本目录已完成 features / shared 重构，近期新增以下改动：

- ✅ `shared/lib/api.ts` baseURL 改为 `import.meta.env.VITE_API_BASE_URL`
- ✅ `RouteGuard.tsx` 已迁移至 `shared/components/auth/`
- ✅ `app/App.tsx` 所有页面路由改为 `React.lazy()` 懒加载
- ✅ `authStore` 改为模块加载时同步从 `localStorage` 初始化（消除 hydration 闪烁）

剩余微调项见 [docs/standards.md § 12](./docs/standards.md#12-附录待落地清单)：

- 新增 `.env.example`：`VITE_API_BASE_URL=http://localhost:8000/api`
- 如启用 Vitest，安装依赖并配 `vite.config.ts`

---

*相关：[docs/standards.md](./docs/standards.md) · [顶层 CLAUDE.md](../CLAUDE.md) · [后端 CLAUDE.md](../backend/CLAUDE.md)*
