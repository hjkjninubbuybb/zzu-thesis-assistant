# 前端重构设计文档

**日期**：2026-05-27
**作者**：设计评审通过
**状态**：已确认，待实施

---

## 一、背景与目标

### 现状问题

| 问题 | 具体表现 |
|------|---------|
| 页面巨石化 | 15 个页面文件共 9936 行，最大单文件 1069 行（KnowledgeBasePage），UI / 逻辑 / 数据访问三者耦合在一起 |
| Custom Hooks 严重不足 | `/hooks/` 目录只有 2 个 Hook，动画 Hook 内联定义在页面里，分页、表单、弹窗等高频模式到处重复 |
| 无业务逻辑层 | 页面直接调用 `api.ts`，没有 service 层做数据转换和请求封装 |
| 组件库缺失 | `/components/ui/` 只有 2 个组件，每个页面各自手写 Button / Input / Modal |
| 全局状态散乱 | 每个页面各自维护 toast、confirm 等 UI 状态，`AuthContext` 随功能增加有臃肿趋势 |

### 重构目标

1. **可维护性**：新开发者看到文件夹名就知道去哪里改代码
2. **可扩展性**：新增功能只需在对应 feature 下新建文件，不影响其他功能
3. **解耦**：页面展示、业务逻辑、数据访问三层严格分离
4. **企业级规范**：符合 Bulletproof React + Feature-Sliced Design 社区最佳实践
5. **单文件体积受控**：任何文件超出行数上限必须拆分

### 重构方式

**全量重写**：新建完整项目结构，把现有功能逐一迁移。不存在向后兼容包袱。

---

## 二、整体目录结构

```
frontend/src/
├── app/
│   ├── App.tsx               # 路由配置（唯一路由入口）
│   ├── providers.tsx         # 全局 Provider 组合（QueryClient、Auth、Upload）
│   └── routes.tsx            # 路由常量表
│
├── features/                 # 业务功能模块（每个 feature 完全自治）
│   ├── auth/
│   ├── knowledge/
│   ├── documents/
│   ├── faq/
│   ├── conversations/
│   ├── users/
│   ├── tickets/
│   ├── analytics/
│   ├── settings/
│   └── student/              # 学生端专属功能
│
├── shared/                   # 跨 feature 共享资源
│   ├── components/
│   │   ├── ui/               # shadcn/ui 基础组件（可控副本）
│   │   └── layout/           # AppLayout、Sidebar、StudentLayout 等
│   ├── hooks/                # 全局 Hook（useToast、useConfirm、useMediaQuery）
│   ├── store/                # Zustand stores（authStore、uiStore、uploadStore）
│   ├── lib/
│   │   ├── api.ts            # Axios 实例 + 按业务域组织的 API 模块
│   │   ├── streamChat.ts     # SSE 流式对话封装
│   │   ├── auth.ts           # Token 存取、Portal 识别
│   │   ├── errorHandler.ts   # 集中式错误处理（新增）
│   │   ├── download.ts       # 文件下载工具
│   │   └── utils.ts          # 通用工具函数
│   └── types/
│       └── api.ts            # 全局 TypeScript 类型（后端接口对应）
│
└── pages/                    # 路由入口（极薄，只组合 feature，不写业务逻辑）
    ├── admin/
    │   ├── KnowledgePage.tsx
    │   ├── DocumentsPage.tsx
    │   ├── FaqPage.tsx
    │   ├── ConversationsPage.tsx
    │   ├── UsersPage.tsx
    │   ├── TicketsPage.tsx
    │   ├── AnalyticsPage.tsx
    │   ├── SettingsPage.tsx
    │   └── OverviewPage.tsx
    └── student/
        ├── ChatPage.tsx
        ├── FaqPage.tsx
        ├── TicketsPage.tsx
        └── ProfilePage.tsx
```

### 核心原则

- `pages/` 里的文件只做一件事：把 feature 导出的组件挂到路由上，不写任何业务逻辑
- `features/` 里每个模块完全自治，通过 `index.ts` 对外暴露公共接口
- `shared/` 只放真正被 2 个及以上 feature 使用的资源，不提前放

---

## 三、Feature 文件夹内部结构

每个 feature 的内部结构统一，以 `features/knowledge/` 为例：

```
features/knowledge/
├── components/
│   ├── KnowledgeManagement.tsx  # feature 根组件（被 pages 引用的唯一入口）
│   ├── KnowledgeList.tsx        # 知识库列表
│   ├── KnowledgeCard.tsx        # 单个知识库卡片
│   ├── CreateKBDialog.tsx       # 新建知识库弹窗
│   └── KBColorPicker.tsx        # 颜色选择器
│
├── hooks/
│   ├── queryKeys.ts             # 该 feature 的 React Query Key 工厂（见第五节）
│   ├── useKnowledgeList.ts      # 列表查询 + 增删改
│   └── useKBForm.ts             # 新建/编辑表单状态
│
├── services/
│   └── knowledgeService.ts      # 纯函数：调用 api.ts，处理数据转换
│
├── types.ts                     # feature 内部类型（不对外暴露）
└── index.ts                     # 对外唯一出口
```

最复杂的 `features/conversations/`：

```
features/conversations/
├── components/
│   ├── ConversationRoot.tsx     # feature 根组件
│   ├── ChatPanel.tsx            # 消息输入 + 发送区
│   ├── MessageList.tsx          # 消息滚动列表
│   ├── MessageBubble.tsx        # 单条消息气泡
│   ├── ThinkingProcess.tsx      # Agent 思考过程展示
│   ├── SourcesPanel.tsx         # 来源文档面板
│   ├── FileCard.tsx             # 文件下载卡片
│   ├── SuggestionsBar.tsx       # 推荐问题栏
│   └── ConversationSidebar.tsx  # 会话列表侧边栏
│
├── hooks/
│   ├── queryKeys.ts
│   ├── useChat.ts               # 核心：流式发送状态机
│   ├── useConversationList.ts   # 会话列表（无限滚动）
│   └── useMessageHistory.ts     # 历史消息加载
│
├── services/
│   └── chatService.ts           # 封装 streamChat.ts，屏蔽 SSE 底层细节
│
└── index.ts
```

---

## 四、文件拆分硬性规范

**行数上限**（超出必须拆分，无例外）：

| 文件类型 | 行数上限 | 超出时的操作 |
|----------|---------|------------|
| `pages/` 路由入口 | **100 行** | 拆出子组件到对应 feature |
| feature 组件 | **250 行** | 拆出子组件或提取 Hook |
| 自定义 Hook | **150 行** | 拆分为多个单职责 Hook |
| Service 文件 | **200 行** | 按子域拆分（如 `kbService.ts` + `documentService.ts`） |
| `index.ts` 导出文件 | **50 行** | feature 边界设计不合理，需重新划分 |

**判断是否该拆的三个问题**：

1. 这个文件做了超过一件事吗？
2. 有没有可以独立命名的子逻辑？
3. 如果只改其中一部分，会不会牵连其他不相关的代码？

任意一条答"是"就应该拆分。

---

## 五、各层职责划分

### 层次依赖图

```
pages/                →  只组合，不写逻辑
    ↓
features/components/  →  只管渲染和用户交互
    ↓
features/hooks/       →  只管状态和副作用
    ↓
features/services/    →  只管数据转换和 API 调用
    ↓
shared/lib/api.ts     →  只管 HTTP 请求
```

**单向依赖，下层严禁 import 上层。**

---

### pages/ — 路由入口层

**能做**：import feature 的导出组件、传递路由参数（`useParams`）、决定页面布局。

**不能做**：`useState`、`useQuery`、业务逻辑、直接调用 `api.ts`。

```tsx
// ✅ pages/admin/KnowledgePage.tsx（全文约 10 行）
import { KnowledgeManagement } from "@/features/knowledge";

export default function KnowledgePage() {
  return <KnowledgeManagement />;
}
```

---

### features/components/ — 展示与交互层

**能做**：渲染 UI、响应用户交互、调用 feature 内的 hooks、组合 `shared/components/ui/` 基础组件。

**不能做**：直接调用 `api.ts` 或 services、跨 feature 穿透 `index.ts` 直接 import 内部文件、持有复杂业务状态。

```tsx
// ✅ 组件只关心"展示什么"和"用户做了什么"
export function KnowledgeCard({ kb, onDelete }: Props) {
  return <Card>...</Card>;
}

// ❌ 禁止在组件里直接调用 API
import { knowledgeApi } from "@/shared/lib/api";
await knowledgeApi.delete(kb.id); // 不允许
```

---

### features/hooks/ — 状态与副作用层

**能做**：`useState`、`useEffect`、`useQuery` / `useMutation`（通过 services 调用）、组合多个子 Hook、读写 Zustand store。

**不能做**：返回 JSX、直接调用 `api.ts`（必须经过 services）、处理 HTTP 状态码。

```ts
// ✅ hook 封装状态逻辑，屏蔽数据来源
export function useKnowledgeList() {
  const { data, isLoading } = useQuery({
    queryKey: knowledgeKeys.list(),
    queryFn: knowledgeService.list,   // 通过 service，不直接调 api
  });
  const deleteMutation = useMutation({
    mutationFn: knowledgeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeKeys.all() });
    },
    onError: (err) => handleMutationError(err, showToast), // 集中错误处理
  });
  return { kbList: data ?? [], isLoading, deleteKB: deleteMutation.mutate };
}
```

---

### features/services/ — 数据转换层

**能做**：调用 `shared/lib/api.ts`、组装请求参数、转换响应数据格式、处理业务规则。

**不能做**：持有状态、操作 DOM、import React。

```ts
// ✅ service 是纯函数，输入参数，输出数据
export const knowledgeService = {
  list: () => knowledgeApi.listKBs(),
  delete: (name: string) => knowledgeApi.deleteKB(name),
  formatStats: (raw: RawKBStats): KBStats => ({ ... }),
};
```

---

### shared/lib/api.ts — HTTP 请求层

保持现有设计：Axios 实例 + 按业务域组织（`knowledgeApi`、`documentApi` 等）、自动 token refresh 拦截器。只做 HTTP，不做业务逻辑。

---

## 六、状态管理方案

### 两套系统，职责不重叠

| 状态类型 | 方案 | 示例 |
|---------|------|------|
| 来自后端的异步数据 | React Query | 知识库列表、文档、FAQ、用户 |
| 登录用户信息 | Zustand `authStore` | user、portal、角色判断 |
| 跨页面 UI 状态 | Zustand `uiStore` | toast、confirm、activeKBName |
| 文件上传队列 | Zustand `uploadStore` | 上传进度、状态 |
| 组件内部临时状态 | `useState` | 输入框内容、局部 loading |

**禁止**：用 React Query 存纯 UI 状态；用 Zustand 存来自后端的列表数据；新建 Context 做全局状态（已有 authStore / uiStore 覆盖所有场景）。

---

### React Query — 服务端状态

QueryKey 工厂**放在各自 feature 内部**（不是全局文件），每个 feature 管自己的缓存 key：

```ts
// features/knowledge/hooks/queryKeys.ts
export const knowledgeKeys = {
  all:    () => ["knowledge"] as const,
  list:   () => ["knowledge", "list"] as const,
  detail: (name: string) => ["knowledge", "detail", name] as const,
};
```

Mutation 后的缓存失效统一使用 `knowledgeKeys.all()` 失效最宽范围：

```ts
onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all() })
```

---

### Zustand — 客户端状态

三个独立 Store，Store 末尾导出 Selector Hook，**组件只调用 Selector Hook，不直接操作 store**：

**`authStore`**

```ts
// shared/store/authStore.ts
interface AuthState {
  user: User | null;
  portal: "admin" | "student" | null;
  login: (user: User, portal: string) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  isStudent: () => boolean;
}

// Selector Hooks（组件只用这些）
export const useAuthUser    = () => useAuthStore(s => s.user);
export const useAuthLogin   = () => useAuthStore(s => s.login);
export const useIsAdmin     = () => useAuthStore(s => s.isAdmin());
export const useIsStudent   = () => useAuthStore(s => s.isStudent());
```

**`uiStore`**

```ts
// shared/store/uiStore.ts
interface UIState {
  sidebarCollapsed: boolean;
  toast: ToastPayload | null;
  confirmDialog: ConfirmPayload | null;
  activeKBName: string | null;

  setSidebarCollapsed: (v: boolean) => void;
  showToast: (msg: string, type: "success" | "error") => void;
  showConfirm: (payload: ConfirmPayload) => void;
  setActiveKBName: (name: string | null) => void;
}

// Selector Hooks
export const useToast       = () => useUIStore(s => ({ toast: s.toast, showToast: s.showToast }));
export const useConfirm     = () => useUIStore(s => s.showConfirm);
export const useActiveKB    = () => useUIStore(s => s.activeKBName);
export const useSidebar     = () => useUIStore(s => ({ collapsed: s.sidebarCollapsed, set: s.setSidebarCollapsed }));
```

**`uploadStore`**（替代现有 `uploadContext.tsx`）

```ts
// shared/store/uploadStore.ts
interface UploadState {
  queue: UploadItem[];
  enqueue: (files: File[], kbName: string, params: UploadParams) => void;
  updateItem: (id: string, patch: Partial<UploadItem>) => void;
  clearDone: () => void;
}

// Selector Hooks
export const useUploadQueue  = () => useUploadStore(s => s.queue);
export const useEnqueue      = () => useUploadStore(s => s.enqueue);
```

---

## 七、shadcn/ui 组件规范

### 引入策略

把 shadcn 组件代码直接复制到 `shared/components/ui/`，完全可控，不依赖外部版本。

### 初始化组件清单

| 组件 | 替代现有 | 用途 |
|------|---------|------|
| `Button` | 各页面手写按钮 | 统一按钮样式和 variant |
| `Dialog` | `ConfirmDialog.tsx` | 弹窗、确认框 |
| `Input` / `Textarea` | 各页面手写 input | 表单输入 |
| `Select` | 各页面手写下拉 | 知识库选择、类型选择 |
| `Badge` | 手写状态标签 | 文档状态、角色标签 |
| `Table` | 各页面手写表格 | 用户列表、工单列表 |
| `Tabs` | 各页面手写 tab | 用户管理、设置页 |
| `Skeleton` | 无 | 加载占位 |
| `Tooltip` | 无 | 图标按钮说明文字 |
| `Toast` / `Sonner` | `Toast.tsx` | 全局通知（配合 uiStore） |

### 保留原有实现的情况

Dashboard 特有 UI **不用 shadcn 替换**，保留在 `shared/components/layout/` 和 `index.css`：
- 暖米色背景（`hsl(38 22% 91%)`）白色 `rounded-2xl` 卡片
- 64px 窄图标侧边栏，激活态黑色填充
- 深色对比卡（`#1A1A1A` 背景）
- `fadeSlideUp`、`hover-lift` 动画类

### 扩展规范

需要在 shadcn 基础上定制时，**新建同名扩展文件**，不直接修改 shadcn 源文件：

```
shared/components/ui/button.tsx       ← shadcn 原文件，不动
shared/components/ui/IconButton.tsx   ← 基于 Button 封装，可自由修改
```

---

## 八、命名与导出规范

### 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | `PascalCase.tsx` | `KnowledgeCard.tsx` |
| Hook 文件 | `camelCase.ts`，`use` 开头 | `useKnowledgeList.ts` |
| Service 文件 | `camelCase.ts`，`Service` 结尾 | `knowledgeService.ts` |
| Store 文件 | `camelCase.ts`，`Store` 结尾 | `authStore.ts` |
| QueryKey 文件 | 固定名 `queryKeys.ts` | `features/knowledge/hooks/queryKeys.ts` |
| Feature 类型文件 | 固定名 `types.ts` | `features/knowledge/types.ts` |
| Feature 导出文件 | 固定名 `index.ts` | `features/knowledge/index.ts` |

### Hook 命名原则

动词 + 名词，描述"做什么"：

```ts
useKnowledgeList()     // ✅ 获取知识库列表
useKBForm()            // ✅ 知识库表单状态
useChat()              // ✅ 聊天流式状态机
useKnowledge()         // ❌ 太模糊，不知道做什么
```

### Feature index.ts 导出规范

只导出**其他 feature 或 pages 真正需要用的内容**，内部实现细节不对外暴露：

```ts
// features/knowledge/index.ts
export { KnowledgeManagement } from "./components/KnowledgeManagement";
// 内部 hooks、services、子组件不导出
```

跨 feature 引用只能通过 `index.ts`：

```ts
// ✅
import { KnowledgeManagement } from "@/features/knowledge";

// ❌ 禁止穿透 index.ts
import { KnowledgeCard } from "@/features/knowledge/components/KnowledgeCard";
```

### 路径别名（vite.config.ts + tsconfig.json）

```ts
"@/*"         →  src/*
"@features/*" →  src/features/*
"@shared/*"   →  src/shared/*
"@pages/*"    →  src/pages/*
```

---

## 九、集中式错误处理

所有 mutation 错误和 API 错误统一经过 `shared/lib/errorHandler.ts`，不在各页面各自处理：

```ts
// shared/lib/errorHandler.ts

/**
 * 从任意错误对象中提取人类可读的错误信息。
 * 优先读取后端返回的 detail 字段，其次是 message，最后是兜底文案。
 */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message ?? "请求失败";
  }
  if (err instanceof Error) return err.message;
  return "发生未知错误，请稍后重试";
}

/**
 * useMutation 的 onError 标准处理器。
 * 统一提取错误信息并通过 uiStore showToast 展示。
 */
export function handleMutationError(
  err: unknown,
  showToast: (msg: string, type: "error") => void
): void {
  showToast(getErrorMessage(err), "error");
}
```

使用方式：

```ts
// features/knowledge/hooks/useKnowledgeList.ts
const { showToast } = useToast();

const deleteMutation = useMutation({
  mutationFn: knowledgeService.delete,
  onError: (err) => handleMutationError(err, showToast),
});
```

---

## 十、ESLint 架构边界强制校验

架构约束不仅写在文档里，还通过 ESLint 在 CI 阶段强制执行，推荐使用 `eslint-plugin-boundaries`：

### 配置规则

```js
// eslint.config.js（新增部分）
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app",      pattern: "src/app/*" },
        { type: "pages",    pattern: "src/pages/*" },
        { type: "features", pattern: "src/features/*" },
        { type: "shared",   pattern: "src/shared/*" },
      ],
    },
    rules: {
      // pages 可以引用 features 和 shared，不能引用 app
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "app",      allow: ["pages", "features", "shared"] },
          { from: "pages",    allow: ["features", "shared"] },
          { from: "features", allow: ["shared"] },
          { from: "shared",   allow: ["shared"] },
        ],
      }],
    },
  },
];
```

### 核心禁止项

| 禁止行为 | 原因 |
|---------|------|
| `features/a` → `features/b`（任何形式的引用） | feature 完全自治，跨 feature 数据共享走 shared/store |
| `features/*` → `pages/*` | 下层不能依赖上层 |
| `shared/*` → `features/*` | shared 不能反向依赖业务层 |
| 穿透 `index.ts` 引用 feature 内部文件 | 破坏封装边界 |

### Feature 间数据共享方式

features 之间不能互相 import，当多个 feature 需要同一份数据时，有两种方式：

**方式 A：提升到 shared/hooks**（推荐，数据被 2+ feature 使用）

把公共查询提升到 `shared/hooks/`，各 feature 从这里引用：

```ts
// shared/hooks/useKBList.ts（提升后的共享 Hook）
export function useKBList() {
  return useQuery({
    queryKey: ["knowledge", "list"],
    queryFn: () => knowledgeApi.listKBs(),  // 直接调 shared/lib/api.ts
  });
}

// features/documents/hooks/useDocumentList.ts
import { useKBList } from "@/shared/hooks/useKBList";  // ← 从 shared 引用，合法
const { data: kbList } = useKBList();
```

**方式 B：Zustand uiStore**（推荐，UI 级别的选择状态）

```ts
// features/documents 读取当前选中知识库
const activeKBName = useActiveKB(); // 来自 uiStore，knowledge feature 负责写入
```

**判断用哪种方式**：数据来自后端且多个 feature 都需要展示 → 方式 A；只是 UI 层面的"当前选中了哪个" → 方式 B。

---

## 十一、禁止事项（继承 + 新增）

以下约束在重构后的代码库中严格执行：

| 禁止行为 | 说明 |
|---------|------|
| `pages/` 里写 `useState` / `useQuery` / 业务逻辑 | 页面只是路由入口 |
| 组件里直接调用 `api.ts` | 必须经过 service 层 |
| `useQuery` / `useMutation` 写在组件函数体内 | 必须封装到 feature hooks |
| feature 间直接 import（绕过 `index.ts`） | 破坏封装边界，ESLint 会报错 |
| 新建 React Context 做全局状态 | 已有 Zustand stores 覆盖所有场景 |
| 组件直接操作 Zustand store（不用 Selector Hook） | 降低未来迁移成本 |
| 在 feature 里 import `FastAPI` / `Request` 等后端对象 | 前后端分离原则 |
| 把 API key 写在前端代码里 | 安全风险 |
| 注释掉代码而不删除 | 保持代码库干净，版本控制有历史记录 |

---

## 十二、新增 Feature 标准流程

每次新增业务功能，按以下顺序创建文件：

```
1. shared/types/api.ts          →  添加后端接口对应的 TypeScript 类型
2. shared/lib/api.ts            →  添加对应的 API 模块（如 newFeatureApi）
3. features/new-feature/
   ├── services/                →  封装 API 调用，处理数据转换
   ├── hooks/queryKeys.ts       →  定义 React Query Key 工厂
   ├── hooks/use[Feature].ts    →  封装 useQuery / useMutation
   ├── components/              →  从根组件开始，按需拆分子组件
   ├── types.ts                 →  feature 内部类型
   └── index.ts                 →  只导出 pages 需要的根组件
4. pages/admin/NewPage.tsx      →  引用 feature index.ts 导出的根组件
5. app/routes.tsx               →  添加路由
```

---

## 附录：现有代码迁移对照表

| 现有文件 | 迁移目标 |
|---------|---------|
| `pages/KnowledgeBasePage.tsx`（1069 行） | 拆分到 `features/knowledge/`，页面文件缩减至 ~10 行 |
| `pages/DocumentPage.tsx`（973 行） | 拆分到 `features/documents/` |
| `pages/SettingsPage.tsx`（969 行） | 拆分到 `features/settings/` |
| `pages/FaqPage.tsx`（947 行） | 拆分到 `features/faq/` |
| `pages/ConversationsPage.tsx`（640 行） | 拆分到 `features/conversations/` |
| `pages/StudentsPage.tsx` + `TeachersPage.tsx` | 合并到 `features/users/` |
| `components/chat/*` | 迁移到 `features/conversations/components/` |
| `components/AuthProvider.tsx` | 替换为 `shared/store/authStore.ts` |
| `lib/uploadContext.tsx` | 替换为 `shared/store/uploadStore.ts` |
| `components/ui/Toast.tsx` | 替换为 shadcn `Toast` + `uiStore.showToast` |
| `components/ui/ConfirmDialog.tsx` | 替换为 shadcn `Dialog` + `uiStore.showConfirm` |
