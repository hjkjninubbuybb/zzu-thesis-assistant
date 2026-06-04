# 前端开发规范

> **作用**：约束 `frontend/` 内部所有代码的目录布局、分层依赖、命名、编码、测试和状态管理。
>
> **范围**：仅适用于 `frontend/`。顶层目录规范见 [docs/directory-layout.md](../../docs/directory-layout.md)。后端规范见 [backend/docs/standards.md](../../backend/docs/standards.md)。
>
> **强制级别**：每条规则标【强制】【推荐】【参考】。【强制】违反即架构问题，ESLint/CI 应当能机器检测；【推荐】是公认最佳实践；【参考】是建议。
>
> **状态**：目标态。当前代码已基本完成 features/shared 重构，少数细节待补，待落地清单见文末附录。

---

## 目录

1. [目录布局](#1-目录布局)
2. [分层依赖规则](#2-分层依赖规则)
3. [文件大小硬约束](#3-文件大小硬约束)
4. [命名与导出规范](#4-命名与导出规范)
5. [各层编码规范](#5-各层编码规范)
6. [状态管理](#6-状态管理)
7. [错误处理](#7-错误处理)
8. [测试规范](#8-测试规范)
9. [shadcn/ui 组件规范](#9-shadcnui-组件规范)
10. [新增功能标准流程](#10-新增功能标准流程)
11. [禁止事项](#11-禁止事项)
12. [附录：待落地清单](#12-附录待落地清单)

---

## 1. 目录布局

```
frontend/
├── src/
│   ├── main.tsx                    # 入口：渲染 <App />
│   ├── index.css                   # 全局样式 + Tailwind 入口
│   ├── App.css                     # 兼容遗留样式（可逐步并入 index.css）
│   │
│   ├── app/                        # ★ 应用级配置
│   │   ├── App.tsx                 # 路由配置（唯一路由入口；所有页面路由懒加载）
│   │   ├── providers.tsx           # 全局 Provider 组合（QueryClient、Auth、Upload）
│   │   └── routes.tsx              # 路由常量表
│   │
│   ├── features/                   # ★ 业务功能模块（每个 feature 完全自治）
│   │   ├── auth/
│   │   ├── knowledge/
│   │   ├── documents/
│   │   ├── faq/
│   │   ├── conversations/
│   │   ├── users/
│   │   ├── tickets/
│   │   ├── analytics/
│   │   ├── settings/
│   │   └── student/                # 学生端专属
│   │
│   ├── shared/                     # ★ 跨 feature 共享资源
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui 基础组件副本
│   │   │   ├── layout/             # AppLayout / Sidebar / StudentLayout
│   │   │   └── auth/               # RouteGuard 等鉴权相关
│   │   ├── hooks/                  # 全局 Hook（useToast / useConfirm / useMediaQuery）
│   │   ├── services/               # 被 2+ feature 共用的 service
│   │   ├── store/                  # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── uiStore.ts
│   │   │   └── uploadStore.ts
│   │   ├── lib/
│   │   │   ├── api.ts              # Axios 实例 + 按业务域组织 API 模块
│   │   │   ├── auth.ts             # Token 存取、Portal 识别
│   │   │   ├── errorHandler.ts     # 集中式错误处理
│   │   │   ├── streamChat.ts       # SSE 流式封装
│   │   │   ├── download.ts         # 文件下载
│   │   │   └── utils.ts            # 通用工具
│   │   └── types/
│   │       └── api.ts              # 后端接口的 TypeScript 类型
│   │
│   ├── pages/                      # ★ 路由入口（极薄，只组合 feature）
│   │   ├── admin/
│   │   │   ├── KnowledgePage.tsx
│   │   │   ├── DocumentsPage.tsx
│   │   │   ├── FaqPage.tsx
│   │   │   ├── ConversationsPage.tsx
│   │   │   ├── UsersPage.tsx
│   │   │   ├── TicketsPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── OverviewPage.tsx
│   │   └── student/
│   │       ├── ChatPage.tsx
│   │       ├── FaqPage.tsx
│   │       ├── TicketsPage.tsx
│   │       └── ProfilePage.tsx
│   │
│   └── assets/                     # 静态资源（图片、字体）
│
├── e2e/                            # Playwright E2E 测试
│   ├── full-smoke.spec.ts
│   ├── chat.spec.ts
│   └── shared-ui.spec.ts
│
├── public/                         # Vite 静态资源（favicon 等）
│
├── docs/
│   ├── standards.md                # 本文件
│   └── architecture.md
│
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── eslint.config.js
├── .prettierrc
├── Dockerfile
├── .gitignore
├── .env.example
├── README.md
└── CLAUDE.md
```

### 1.1 Feature 内部结构（统一模板）

每个 feature 内部按相同结构组织：

```
features/<name>/
├── components/                     # 该 feature 所有 React 组件
│   ├── <Feature>Root.tsx           # feature 根组件（被 pages 引用的唯一入口）
│   └── <Sub>.tsx                   # 子组件（平铺；如确需归类，参考 5.2.4）
│
├── hooks/                          # 该 feature 的自定义 Hook
│   ├── queryKeys.ts                # React Query Key 工厂（固定文件名）
│   ├── use<Feature>List.ts
│   └── use<Feature>Form.ts
│
├── services/                       # 数据访问/转换层（纯函数）
│   └── <feature>Service.ts
│
├── types.ts                        # feature 内部类型（不对外）
└── index.ts                        # 对外唯一出口（仅导出根组件）
```

---

## 2. 分层依赖规则

### 2.1 【强制】单向依赖

```
pages/                  →  只组合，不写逻辑
    ↓
features/components/    →  渲染 + 用户交互
    ↓
features/hooks/         →  状态 + 副作用
    ↓
features/services/      →  数据转换 + API 调用
    ↓
shared/lib/api.ts       →  HTTP 请求
```

**下层严禁 import 上层。**

| 层 | 可以 import | 禁止 import |
|----|------------|-------------|
| `app/` | 所有层 | — |
| `pages/` | `features/*`、`shared/*` | 其他 `pages/`、`pages/` import `features/*` 内部文件 |
| `features/<a>/` | `shared/*`、自身 feature 内部 | **其他 `features/<b>/`（任何形式）**、`pages/`、`app/` |
| `shared/` | `shared/` 内部 | `features/*`、`pages/`、`app/` |

### 2.2 【强制】跨 feature 通过 `index.ts` 引用

```ts
// ✅
import { KnowledgeManagement } from "@/features/knowledge";

// ❌ 穿透 index.ts 直接 import 内部文件
import { KnowledgeCard } from "@/features/knowledge/components/KnowledgeCard";
```

### 2.3 【强制】Feature 间不互相 import

`features/a/` 不能 import `features/b/`（任何形式）。共享数据有两种方式：

**方式 A：升级到 `shared/services/` + `shared/hooks/`**（多个 feature 共用的后端数据）

```ts
// shared/services/knowledgeSharedService.ts
import { knowledgeApi } from "@/shared/lib/api";
export const knowledgeSharedService = {
  list: () => knowledgeApi.listKBs(),
};

// shared/hooks/useKBList.ts
export function useKBList() {
  return useQuery({
    queryKey: ["knowledge", "list"],
    queryFn: knowledgeSharedService.list,
  });
}

// features/documents/hooks/useDocumentList.ts
import { useKBList } from "@/shared/hooks/useKBList";   // ✅ 合法
```

**方式 B：通过 `shared/store/uiStore.ts`**（跨 feature 的 UI 状态）

```ts
// 当前选中的知识库名属于 UI 状态
const activeKBName = useActiveKB();   // 来自 uiStore
```

### 2.4 【推荐】升级到 shared 的判定

何时把 feature 内的代码升级到 `shared/`：

| 资源 | 升级条件 |
|------|---------|
| Service / Hook | **被 2 个及以上 feature 使用**，提前升级不算 |
| 组件 | 跨 portal（admin / student）通用的基础组件 |
| 类型 | 与后端接口一一对应（统一放 `shared/types/api.ts`） |
| 工具函数 | 完全无业务语义（如 `formatDate`、`debounce`） |
| 基础设施类资源 | 「活跃 KB」「系统配置」等概念上跨多 feature 的概念，**允许预升级** |

**反例**：
```ts
// ❌ 只有 1 个 feature 用、且是该 feature 特有业务概念
// shared/services/onlyUsedByKnowledgeImportFlowService.ts
```

#### 审计盲点警告

**直接 grep `shared/services/` 的使用方时容易漏检**——shared service 经常通过 `shared/hooks/` 被 feature 间接使用。正确的审计命令应该串联两层：

```bash
# 1. 看 shared/hooks/<X>.ts 被哪些 feature import
grep -rn "from \"@shared/hooks/<X>\"" src/features/

# 2. 看 shared/services/<Y>.ts 被哪些 shared/hook import
grep -rn "from \"@shared/services/<Y>\"" src/shared/hooks/
```

只有两层都为空时，才能判定 shared 资源真死。

### 2.5 【强制】ESLint boundaries 强制校验

```js
// eslint.config.js
import boundaries from "eslint-plugin-boundaries";

export default [{
  plugins: { boundaries },
  settings: {
    "boundaries/elements": [
      { type: "app",     pattern: "src/app/*" },
      { type: "pages",   pattern: "src/pages/*" },
      { type: "feature", pattern: "src/features/([^/]+)/**", capture: ["featureName"] },
      { type: "shared",  pattern: "src/shared/*" },
    ],
  },
  rules: {
    "boundaries/element-types": ["error", {
      default: "disallow",
      rules: [
        { from: "app",     allow: ["pages", "feature", "shared"] },
        { from: "pages",   allow: ["feature", "shared"] },
        {
          from: "feature",
          allow: [
            "shared",
            ["feature", { featureName: "${from.featureName}" }],
          ],
        },
        { from: "shared",  allow: ["shared"] },
      ],
    }],
    "boundaries/entry-point": ["error", {
      default: "disallow",
      rules: [{ target: ["feature"], allow: ["index.ts"] }],
    }],
  },
}];
```

---

## 3. 文件大小硬约束

| 文件类型 | 行数上限 | 超出时操作 |
|---------|---------|-----------|
| `pages/` 路由入口 | 100 | 拆出子组件到对应 feature |
| feature 组件 | 250 | 拆出子组件或提取 Hook |
| 自定义 Hook | 150 | 拆分为多个单职责 Hook |
| Service 文件 | 200 | 按子域拆分（如 `kbService.ts` + `documentService.ts`） |
| `index.ts` 导出文件 | 50 | feature 边界设计不合理，重新划分 |
| Zustand store 文件 | 250 | 拆分为多个 store |

### 3.1 判断是否该拆的三个问题

1. 这个文件做了超过一件事吗？
2. 有没有可以独立命名的子逻辑？
3. 只改其中一部分时，会不会牵连其他不相关代码？

任意一条答"是"就应该拆分。

---

## 4. 命名与导出规范

### 4.1 【强制】文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | `PascalCase.tsx` | `KnowledgeCard.tsx` |
| Hook 文件 | `camelCase.ts`，`use` 开头 | `useKnowledgeList.ts` |
| Service 文件 | `camelCase.ts`，`Service` 结尾 | `knowledgeService.ts` |
| Store 文件 | `camelCase.ts`，`Store` 结尾 | `authStore.ts` |
| QueryKey 文件 | 固定名 `queryKeys.ts` | `features/knowledge/hooks/queryKeys.ts` |
| Feature 类型 | 固定名 `types.ts` | `features/knowledge/types.ts` |
| Feature 出口 | 固定名 `index.ts` | `features/knowledge/index.ts` |
| 测试文件 | `<file>.test.ts(x)` | `useKnowledgeList.test.ts` |

### 4.2 【强制】Hook 命名原则

动词 + 名词，描述"做什么"：

```ts
useKnowledgeList()     // ✅ 获取知识库列表
useKBForm()            // ✅ 知识库表单状态
useChat()              // ✅ 聊天流式状态机

useKnowledge()         // ❌ 太模糊
useStuff()             // ❌ 无意义
```

### 4.3 【强制】Feature index.ts 导出规范

只导出**真正被 pages 或其他 feature 用到的内容**，内部实现不对外暴露：

```ts
// ✅ features/knowledge/index.ts
export { KnowledgeManagement } from "./components/KnowledgeManagement";

// ❌ 不要导出内部 hooks、services、子组件
export { useKnowledgeList } from "./hooks/useKnowledgeList";   // 错
export { knowledgeService } from "./services/knowledgeService"; // 错
```

### 4.4 【强制】路径别名

`tsconfig.json` + `vite.config.ts` 配置：

```ts
"@/*"         →  src/*
"@features/*" →  src/features/*
"@shared/*"   →  src/shared/*
"@pages/*"    →  src/pages/*
```

**正例**：
```ts
import { useToast } from "@/shared/hooks/useToast";
```

**反例**：
```ts
import { useToast } from "../../../shared/hooks/useToast";   // ❌ 相对路径多层
```

### 4.5 【强制】TypeScript 类型

- 公共函数和 Hook 必须有返回类型
- Props 必须有显式 type/interface（不依赖推断）
- 禁止 `any`（除非有 `// eslint-disable-next-line` 注释说明原因）

```ts
// ✅
interface KnowledgeCardProps {
  kb: KnowledgeBase;
  onDelete: (id: string) => void;
}

export function KnowledgeCard({ kb, onDelete }: KnowledgeCardProps): JSX.Element {
  ...
}

// ❌
export function KnowledgeCard({ kb, onDelete }: any) { ... }
```

---

## 5. 各层编码规范

### 5.1 `pages/` — 路由入口层

#### 5.1.0 【强制】所有页面路由使用 `React.lazy()` 懒加载

`app/App.tsx` 中所有页面组件必须通过动态 `import()` 加载，禁止静态顶部 import。整个 `<Routes>` 树包在 `<Suspense>` 内。

```tsx
// ✅ app/App.tsx
import { lazy, Suspense } from "react";
const KnowledgePage = lazy(() => import("@pages/admin/KnowledgePage"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="knowledge" element={<KnowledgePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

**原因**：双门户设计下，学生用户永远不需要管理端代码（反之亦然）。静态 import 会把两端的所有页面打进同一个 bundle，懒加载后各门户按需加载。

#### 5.1.1 【强制】Page 只组合，不写逻辑

**能做**：import feature 导出组件、传递路由参数（`useParams`）、决定页面布局。

**不能做**：`useState`、`useQuery`、业务逻辑、直接调 `shared/lib/api.ts`。

**正例**：
```tsx
// ✅ pages/admin/KnowledgePage.tsx（全文 ≤ 10 行）
import { KnowledgeManagement } from "@/features/knowledge";

export default function KnowledgePage() {
  return <KnowledgeManagement />;
}
```

**反例**：
```tsx
// ❌ Page 里写业务逻辑
export default function KnowledgePage() {
  const { data: kbList } = useQuery({   // ❌ Page 不写 useQuery
    queryKey: ["knowledge"],
    queryFn: () => knowledgeApi.listKBs(),
  });
  const [editing, setEditing] = useState(null);   // ❌ Page 不持有业务状态
  return <div>...</div>;
}
```

### 5.2 `features/components/` — 展示与交互层

#### 5.2.1 【强制】组件不直接调 API

**能做**：渲染 UI、响应用户交互、调用 feature 内的 hooks、组合 `shared/components/ui/`。

**不能做**：直接调 `shared/lib/api.ts` 或 services、跨 feature 穿透 `index.ts`、持有复杂业务状态。

**正例**：
```tsx
// ✅
export function KnowledgeCard({ kb, onDelete }: Props) {
  return (
    <Card>
      <CardHeader>{kb.name}</CardHeader>
      <Button onClick={() => onDelete(kb.id)}>删除</Button>
    </Card>
  );
}
```

**反例**：
```tsx
// ❌ 组件直接调 API
import { knowledgeApi } from "@/shared/lib/api";

export function KnowledgeCard({ kb }: Props) {
  const handleDelete = async () => {
    await knowledgeApi.delete(kb.id);   // ❌
  };
  return <Card>...</Card>;
}
```

#### 5.2.2 【强制】useQuery / useMutation 不写在组件函数体内

必须封装到 feature hooks，组件只调用 Hook。

**正例**：
```tsx
// ✅
export function KnowledgeList() {
  const { kbList, deleteKB, isLoading } = useKnowledgeList();
  if (isLoading) return <Skeleton />;
  return kbList.map(kb => <KnowledgeCard key={kb.id} kb={kb} onDelete={deleteKB} />);
}
```

**反例**：
```tsx
// ❌
export function KnowledgeList() {
  const { data } = useQuery({           // ❌ 应该在 hooks/useKnowledgeList.ts
    queryKey: ["knowledge"],
    queryFn: knowledgeService.list,
  });
  return data?.map(...);
}
```

#### 5.2.3 【推荐】组件 props 显式声明

避免依赖结构推断。

```ts
// ✅
interface ChatPanelProps {
  conversationId: string;
  onSend: (text: string) => void;
  disabled?: boolean;
}

// ❌
export function ChatPanel(props: any) { ... }
```

#### 5.2.4 【参考】components 内部默认平铺，确需归类才开子目录

```
features/knowledge/components/
├── KnowledgeManagement.tsx   ← 根组件
├── KnowledgeList.tsx
├── KnowledgeCard.tsx
├── CreateKBDialog.tsx
└── KBColorPicker.tsx
```

确实超过 8-10 个、且能按子域归类时，可以开子目录：

```
features/analytics/components/
├── overview/
│   ├── OverviewPanel.tsx
│   ├── StatsCards.tsx
│   └── ActivityChart.tsx
├── analytics/
│   ├── AnalyticsDashboard.tsx
│   └── ChartFilters.tsx
└── shared/                   ← 子组件间共享的内部组件（不导出）
```

但**子目录例外应在 feature 的 `README.md` 或 `index.ts` 顶部注释说明原因**，避免每个 feature 各自杜撰子目录约定。

### 5.3 `features/hooks/` — 状态与副作用层

#### 5.3.1 【强制】Hook 通过 service 调 API，不直接调 `api.ts`

**正例**：
```ts
// ✅
import { knowledgeService } from "../services/knowledgeService";
import { knowledgeKeys } from "./queryKeys";

export function useKnowledgeList() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: knowledgeKeys.list(),
    queryFn: knowledgeService.list,           // ✅ 走 service
  });

  const deleteMutation = useMutation({
    mutationFn: knowledgeService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all() }),
    onError: (err) => handleMutationError(err, showToast),
  });

  return { kbList: data ?? [], isLoading, deleteKB: deleteMutation.mutate };
}
```

**反例**：
```ts
// ❌ Hook 直接调 api
export function useKnowledgeList() {
  return useQuery({
    queryFn: () => knowledgeApi.listKBs(),   // ❌ 跳过 service
  });
}
```

#### 5.3.2 【强制】Hook 不返回 JSX，不处理 HTTP 状态码

- Hook 返回数据和操作函数
- HTTP 错误处理交给 `errorHandler.ts`

#### 5.3.3 【强制】QueryKey 工厂统一在 feature 内 `queryKeys.ts`

```ts
// features/knowledge/hooks/queryKeys.ts
export const knowledgeKeys = {
  all:    () => ["knowledge"] as const,
  list:   () => ["knowledge", "list"] as const,
  detail: (name: string) => ["knowledge", "detail", name] as const,
};
```

Mutation 后缓存失效统一用 `.all()` 失效最宽范围：

```ts
onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all() })
```

#### 5.3.4 【强制】跨多 key 的 Zustand selector 用 `useShallow`

避免每次 store 变化触发不必要的重渲染：

```ts
import { useShallow } from "zustand/react/shallow";

// ✅ 多 key selector
const { collapsed, set } = useUIStore(useShallow(s => ({
  collapsed: s.sidebarCollapsed,
  set: s.setSidebarCollapsed,
})));

// ✅ 单 key selector 不需要
const user = useAuthStore(s => s.user);
```

### 5.4 `features/services/` — 数据转换层

#### 5.4.1 【强制】Service 是纯函数集合

**能做**：调 `shared/lib/api.ts`、组装请求参数、转换响应格式、处理业务规则。

**不能做**：持有状态、操作 DOM、import React、import 任何 hook。

**正例**：
```ts
// ✅
import { knowledgeApi } from "@/shared/lib/api";

export const knowledgeService = {
  list: () => knowledgeApi.listKBs(),
  delete: (name: string) => knowledgeApi.deleteKB(name),
  formatStats: (raw: RawKBStats): KBStats => ({
    total: raw.doc_count,
    avgChunks: raw.total_chunks / raw.doc_count,
  }),
};
```

**反例**：
```ts
// ❌ Service 持有状态
let cachedList: KB[] = [];
export const knowledgeService = {
  list: () => cachedList,                  // ❌ 不应有状态
};

// ❌ Service import React
import { useState } from "react";          // ❌
```

### 5.5 `shared/lib/api.ts` — HTTP 请求层

保持设计：Axios 实例 + 按业务域组织（`knowledgeApi`、`documentApi` 等）、自动 token refresh 拦截器。**只做 HTTP，不做业务逻辑**。

```ts
// shared/lib/api.ts
import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,   // 从 env 读取
  timeout: 30000,
});

// 自动 token 刷新拦截器
client.interceptors.response.use(...);

export const knowledgeApi = {
  listKBs: () => client.get<KB[]>("/knowledge").then(r => r.data),
  deleteKB: (name: string) => client.delete(`/knowledge/${name}`),
  // ...
};
```

---

## 6. 状态管理

### 6.1 【强制】职责不重叠的两套系统

| 状态类型 | 方案 | 示例 |
|---------|------|------|
| 来自后端的异步数据 | React Query | 知识库列表、文档、FAQ |
| 登录用户信息 | Zustand `authStore` | user、portal、角色判断 |
| 跨页面 UI 状态 | Zustand `uiStore` | toast、confirm、activeKBName |
| 文件上传队列 | Zustand `uploadStore` | 上传进度、状态 |
| 组件内部临时状态 | `useState` | 输入框内容、局部 loading |

### 6.2 【强制】不允许的状态管理方式

- **禁止**用 React Query 存纯 UI 状态
- **禁止**用 Zustand 存来自后端的列表数据（应该用 React Query）
- **禁止**新建 React Context 做全局状态（authStore / uiStore 已覆盖所有场景）

### 6.3 【强制】Store 末尾导出 Selector Hook

组件**只调用 Selector Hook**，不直接操作 store：

```ts
// shared/store/authStore.ts
interface AuthState {
  user: User | null;
  portal: "admin" | "student" | null;
  login: (user: User, portal: string) => void;
  logout: () => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>(...);

// 末尾导出 Selector Hooks
export const useAuthUser    = () => useAuthStore(s => s.user);
export const useAuthLogin   = () => useAuthStore(s => s.login);
export const useIsAdmin     = () => useAuthStore(s => s.isAdmin());
```

**正例**：
```tsx
// ✅
const user = useAuthUser();
```

**反例**：
```tsx
// ❌ 组件直接调用 store
const user = useAuthStore(s => s.user);
```

### 6.4 【强制】当前三个 Store 的职责

**`authStore`**：登录用户、portal、角色判断
**`uiStore`**：toast、confirm、sidebar、活跃知识库名
**`uploadStore`**：文件上传队列与状态

新 store 必须满足"跨页面共享"才允许新建，单页面状态用 `useState`。

### 6.5 【强制】`authStore` 同步初始化，禁止延迟 hydration

`authStore` 在模块加载时从 `localStorage` 同步读取初始状态，**禁止**将 `hydrate()` 放进 `useEffect`：

```ts
// ✅ shared/store/authStore.ts
const _initialPortal = getCurrentPortal();
const _initialUser   = getStoredUser(_initialPortal);

const useAuthStore = create<AuthState>(() => ({
  user:   _initialUser,
  portal: _initialPortal,
  // ...
}));
```

**原因**：`useEffect` 在首次渲染后才执行。若延迟 hydration，`RouteGuard` 第一次渲染时 `user` 为 `null`，会将已登录用户重定向到登录页，随后 hydration 完成再跳回，造成闪烁和不必要的 API 请求（甚至 401）。

---

## 7. 错误处理

### 7.1 【强制】错误工具集中在 `errorHandler.ts`

所有"错误信息提取 + 展示"的工具函数必须在 `shared/lib/errorHandler.ts`，**不允许放在 `api.ts`**——后者只做 HTTP 请求。

```ts
// shared/lib/errorHandler.ts
import axios from "axios";

/** 提取原始错误描述（无兜底文案），适合需要透传给业务表单的场景。 */
export function extractError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail ?? error.message;
  }
  return String(error);
}

/** 提取错误描述并保证有兜底文案，适合直接展示给用户的 toast。 */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data?.detail as string) ?? err.message ?? "请求失败";
  }
  if (err instanceof Error) return err.message;
  return "发生未知错误，请稍后重试";
}

export function handleMutationError(
  err: unknown,
  showToast: (msg: string, type: "success" | "error") => void,
): void {
  showToast(getErrorMessage(err), "error");
}
```

**两个函数的区别**：
- `extractError`：原始错误信息，**无兜底**，调用方自己决定如何展示
- `getErrorMessage` + `handleMutationError`：带兜底文案 + 自动 toast，标准的 mutation onError 入口

### 7.2 【强制】Mutation onError 走 handleMutationError

```ts
// ✅ feature hooks
const { showToast } = useToast();
const deleteMutation = useMutation({
  mutationFn: knowledgeService.delete,
  onError: (err) => handleMutationError(err, showToast),
});
```

### 7.3 【强制】不在各页面各自 try/catch API 错误

错误处理集中在两层：
1. `shared/lib/api.ts` 拦截器：401 自动 refresh、5xx 全局 log
2. `errorHandler.ts`：mutation onError 入口

### 7.4 【推荐】错误边界（Error Boundary）

App 顶层（`app/App.tsx`）包一个 Error Boundary，捕获渲染期错误，展示降级 UI。

---

## 8. 测试规范

### 8.1 【参考】单元/组件测试为可选

单人项目场景下，单元/组件测试**不强制**，但已编写的测试必须遵守本节位置和命名约定。**强烈建议**至少为以下场景补单测：

- `features/*/services/` 的纯函数（高性价比）
- `features/conversations/hooks/useChat.ts` 等复杂业务 hooks
- `shared/lib/errorHandler.ts`

### 8.2 【强制】测试位置：Co-located（紧贴源码）

```
features/knowledge/hooks/
├── useKnowledgeList.ts
├── useKnowledgeList.test.ts        ← 紧贴
├── useKBForm.ts
└── useKBForm.test.ts

features/knowledge/services/
├── knowledgeService.ts
└── knowledgeService.test.ts

features/knowledge/components/
├── KnowledgeCard.tsx
└── KnowledgeCard.test.tsx
```

**例外**（少数情况用 `__tests__/` 子目录）：

- 大量共享 fixture / mock 数据：集中到 `features/<name>/__tests__/fixtures/`
- 跨多个文件的集成测试：放 `features/<name>/__tests__/integration.test.ts`

### 8.3 【强制】测试文件命名

- 与被测文件同名 + `.test.ts(x)` 后缀
- `useKnowledgeList.ts` → `useKnowledgeList.test.ts`
- `KnowledgeCard.tsx` → `KnowledgeCard.test.tsx`

### 8.4 【强制】框架与工具

| 用途 | 工具 |
|------|------|
| 测试框架 | Vitest |
| 组件渲染 | React Testing Library |
| 网络 mock | msw（Mock Service Worker） |
| E2E | Playwright（`frontend/e2e/`） |

### 8.5 【强制】测试金字塔

```
       /\
      /  \      ← E2E（Playwright，少量、慢、关键链路）
     /____\
    /      \    ← 组件交互测试（中等数量）
   /________\
  /          \  ← Hooks 集成测试（较多）
 /____________\
/              \ ← Services 单元测试（最多，最快）
```

优先级从底向上：services 单测 > hooks 测试 > 组件交互测 > e2e。

### 8.6 【强制】E2E 测试位置

Playwright 端到端测试统一在 `frontend/e2e/`：

```
frontend/e2e/
├── full-smoke.spec.ts      # 全链路烟测
├── chat.spec.ts            # 聊天关键路径
└── shared-ui.spec.ts       # 共享 UI 组件
```

**不强制**写新 e2e，但已有 e2e 必须保持绿。

### 8.7 【推荐】测试什么、不测什么

| 应该测 | 不需要测 |
|--------|---------|
| Service 纯函数（输入 → 输出） | 纯展示组件（无逻辑） |
| Hook 状态机（useChat 等） | shadcn 副本组件 |
| `errorHandler.getErrorMessage` 各分支 | 样式与布局 |
| 复杂表单校验逻辑 | 第三方库本身的功能 |

---

## 9. shadcn/ui 组件规范

### 9.1 【强制】引入策略：可控副本

把 shadcn 组件代码**直接复制**到 `src/shared/components/ui/`，不依赖外部版本。

### 9.2 【强制】扩展通过新建文件，不改 shadcn 源文件

需要在 shadcn 基础上定制时，新建同名扩展文件：

```
shared/components/ui/button.tsx       ← shadcn 原文件，不动
shared/components/ui/IconButton.tsx   ← 基于 Button 封装，可自由修改
```

### 9.3 【推荐】当前应包含的组件

| 组件 | 用途 |
|------|------|
| `Button` | 统一按钮样式和 variant |
| `Dialog` | 弹窗、确认框 |
| `Input` / `Textarea` | 表单输入 |
| `Select` | 下拉选择 |
| `Badge` | 状态标签 |
| `Table` | 数据表格 |
| `Tabs` | 标签页 |
| `Skeleton` | 加载占位 |
| `Tooltip` | 图标按钮说明文字 |
| `Toast` / `Sonner` | 全局通知（配合 uiStore） |

### 9.4 【参考】Dashboard 特有样式不用 shadcn 替换

以下保留在 `shared/components/layout/` 和 `index.css`：

- 暖米色背景 `hsl(38 22% 91%)`、白色 `rounded-2xl` 卡片
- 64px 窄图标侧边栏（`w-16`），激活态黑色填充
- 深色对比卡（`#1A1A1A` 背景）
- `fadeSlideUp`、`hover-lift` 动画类

### 9.5 【强制】图标库

统一用 `lucide-react`，不混用其他图标库。

---

## 10. 新增功能标准流程

每次新增业务功能，按以下顺序创建文件：

```
1. shared/types/api.ts              →  添加后端接口对应的 TypeScript 类型
2. shared/lib/api.ts                →  添加对应的 API 模块（如 newFeatureApi）
3. features/new-feature/
   ├── services/newFeatureService.ts   →  封装 API 调用 + 数据转换
   ├── hooks/queryKeys.ts              →  定义 React Query Key 工厂
   ├── hooks/use[Feature].ts           →  封装 useQuery / useMutation
   ├── components/                     →  从根组件开始，按需拆分子组件
   ├── types.ts                        →  feature 内部类型
   └── index.ts                        →  只导出 pages 需要的根组件
4. pages/admin/NewPage.tsx          →  引用 feature index.ts 的根组件
5. app/routes.tsx                   →  添加路由
```

可选：
```
6. 紧贴源码补单元测试
7. 如需 e2e，在 frontend/e2e/ 加 spec
```

---

## 11. 禁止事项

### 11.1 架构边界

| 禁止 | 检测 |
|------|------|
| `pages/` 里写 `useState` / `useQuery` / 业务逻辑 | ESLint + 人工 review |
| 组件直接调 `shared/lib/api.ts` | ESLint custom rule |
| `useQuery` / `useMutation` 写在组件函数体内 | ESLint custom rule |
| Feature 间直接 import（绕过 `index.ts`） | `eslint-plugin-boundaries` |
| `shared/` import `features/*` 或 `pages/*` | `eslint-plugin-boundaries` |
| 新建 React Context 做全局状态 | 人工 review |
| 组件直接操作 Zustand store（不用 Selector Hook） | 人工 review |

### 11.2 实现陷阱

- **禁止**在 `shared/services/` 提前升级（只服务于 1 个 feature 的代码不允许进 shared）
- **禁止**把 API key 写在前端代码里
- **禁止**注释掉代码而不删除（版本控制保留历史）
- **禁止**修改 shadcn 源文件（用扩展文件）
- **禁止**用 `any` 类型（除非 disable 注释说明原因）
- **禁止**相对路径 `../../../` 跨多层，必须用路径别名

### 11.3 前后端边界（完全分开后）

- **禁止**在 feature 里 import 后端代码（`from src.xxx`）
- **禁止**假设 API 同源——所有 API 通过 `shared/lib/api.ts` 走 `VITE_API_BASE_URL`
- **禁止**前端代码引用 backend 项目内任何路径

---

## 12. 附录：待落地清单

本规范描述目标态。当前代码已基本完成 features/shared 重构，少数细节待补：

### 12.1 顶层迁移（与目录规范同步）

详见 [docs/directory-layout.md 的待落地清单](../../docs/directory-layout.md#6-附录待落地清单)。

### 12.2 配置

| 动作 | 文件 | 状态 |
|------|------|------|
| **新增** | `frontend/.env.example`：`VITE_API_BASE_URL=http://localhost:8000/api` | 待落地 |
| ~~**修改**~~ | ~~`shared/lib/api.ts` 的 axios baseURL 从 `/api` 改为 `import.meta.env.VITE_API_BASE_URL`~~ | ✅ 已完成 |
| **修改** | 启动脚本：开发期 `npm run dev` 独立启动，不再被 `poetry run dev` 拉起 | 待落地 |

### 12.3 目录细节

| 动作 | 文件 | 状态 |
|------|------|------|
| ~~**迁移**~~ | ~~`src/shared/components/RouteGuard.tsx` → `src/shared/components/auth/RouteGuard.tsx`~~ | ✅ 已完成 |
| **拆分** | `src/App.css` 内容逐步并入 `src/index.css`，最终删除 | 待落地 |
| **新增** | `eslint.config.js` 配置 `eslint-plugin-boundaries`（如还未配置） | 待落地 |

### 12.4 测试补强（可选，按需）

| 动作 | 位置 |
|------|------|
| **补单测** | `shared/lib/errorHandler.test.ts` |
| **补单测** | `features/conversations/hooks/useChat.test.ts` |
| **补单测** | 各 feature 的 `services/<name>Service.test.ts` |

### 12.5 Vitest 接入

如果决定补单测，需要：

- 安装：`vitest`、`@testing-library/react`、`@testing-library/jest-dom`、`msw`
- `vite.config.ts` 配置 `test` 字段
- `package.json` 加 `"test": "vitest"` 脚本

---

*文档版本：v1.0 | 创建日期：2026-05-30 | 相关文档：[directory-layout](../../docs/directory-layout.md) · [backend standards](../../backend/docs/standards.md)*
