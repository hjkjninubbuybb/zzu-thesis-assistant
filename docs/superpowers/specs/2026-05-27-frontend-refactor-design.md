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
│   ├── services/             # 被 2+ feature 共用的查询 service（如 useKBList 所依赖的 sharedKnowledgeService）
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

`features/student/`（学生端专属功能，含仪表盘和个人中心）：

```
features/student/
├── components/
│   ├── StudentHome.tsx          # feature 根组件：学生仪表盘（统计卡片、快速入口）
│   │                            # 迁移自 pages/student/StudentHomePage.tsx（514 行）
│   └── StudentProfile.tsx       # 学生个人中心（基本信息 + 导师信息 + 修改密码）
│                                # 迁移自 pages/student/StudentProfilePage.tsx（186 行）
│
├── hooks/
│   ├── queryKeys.ts
│   ├── useStudentHome.ts        # 仪表盘数据：最近对话、FAQ 统计、知识库状态
│   └── useStudentProfile.ts    # 个人信息查询 + 修改密码 mutation
│
├── services/
│   └── studentService.ts       # 封装学生端 API 调用（conversationApi + knowledgeApi）
│
└── index.ts                    # 导出 StudentHome、StudentProfile
```

> **注意**：学生端的 FAQ 浏览（`StudentFaqPage`）和工单（`StudentTicketsPage`）**不单独建 student 子组件**，直接复用 `features/faq/` 和 `features/tickets/` 的 feature 根组件；`pages/student/FaqPage.tsx` 和 `pages/student/TicketsPage.tsx` 只负责引用对应 feature 的学生视图变体（通过 prop 或 route context 区分 portal）。

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
        { type: "app",     pattern: "src/app/*" },
        { type: "pages",   pattern: "src/pages/*" },
        // 用 capture 把每个 feature 的名称捕获为 featureName，
        // 这样规则可以区分 features/a 和 features/b，从而阻止跨 feature 引用
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
          // feature 只能引用 shared 和"自身"（featureName 相同）
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
      // 即使是 pages → feature，也只允许通过 index.ts 引用，不得穿透内部文件
      "boundaries/entry-point": ["error", {
        default: "disallow",
        rules: [{ target: ["feature"], allow: ["index.ts"] }],
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

**方式 A：提升到 shared/services + shared/hooks**（推荐，数据被 2+ feature 使用）

公共查询的数据转换放在 `shared/services/`，Hook 封装放在 `shared/hooks/`，各 feature 从这里引用，保持层次一致（hooks → services → api.ts）：

```ts
// shared/services/knowledgeSharedService.ts
import { knowledgeApi } from "@/shared/lib/api";
export const knowledgeSharedService = {
  list: () => knowledgeApi.listKBs(),
};

// shared/hooks/useKBList.ts（提升后的共享 Hook）
import { knowledgeSharedService } from "@/shared/services/knowledgeSharedService";
export function useKBList() {
  return useQuery({
    queryKey: ["knowledge", "list"],
    queryFn: knowledgeSharedService.list,  // 通过 shared/services，保持层次一致
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

### 管理端页面

| 现有文件 | 行数 | 迁移目标 |
|---------|-----|---------|
| `pages/KnowledgeBasePage.tsx` | 1069 | `features/knowledge/`（导出 `DocumentKnowledgeTab`） |
| `pages/KnowledgeManagementPage.tsx` | 43 | `pages/admin/KnowledgePage.tsx`（薄容器，组合 knowledge + faq 两个 Tab，保留 Tab 切换逻辑） |
| `pages/DocumentPage.tsx` | 973 | `features/documents/` |
| `pages/DocumentChunkReviewPage.tsx` | 162 | `features/documents/components/ChunkReview.tsx` + `pages/admin/DocumentChunkReviewPage.tsx` |
| `pages/DocumentCleanReviewPage.tsx` | 153 | `features/documents/components/CleanReview.tsx` + `pages/admin/DocumentCleanReviewPage.tsx` |
| `pages/SettingsPage.tsx` | 969 | `features/settings/` |
| `pages/FaqPage.tsx` | 947 | `features/faq/`（导出 `FaqKnowledgeTab` 供 KnowledgePage 复用） |
| `pages/ConversationsPage.tsx` | 640 | `features/conversations/` |
| `pages/StudentsPage.tsx` | — | `features/users/components/StudentsTab.tsx` |
| `pages/TeachersPage.tsx` | — | `features/users/components/TeachersTab.tsx` |
| `pages/MentorRelationsTab.tsx` | 416 | `features/users/components/MentorRelationsTab.tsx` |
| `pages/UsersPage.tsx` | 52 | `pages/admin/UsersPage.tsx`（薄容器，组合三个 Tab）→ `features/users/` |
| `pages/AnalyticsPage.tsx` | — | `features/analytics/` |
| `pages/OverviewPage.tsx` | — | `features/analytics/components/OverviewPanel.tsx` 或独立 feature `overview` |
| `pages/LoginPage.tsx` | 226 | `features/auth/components/LoginForm.tsx` + `pages/LoginPage.tsx`（路由入口保留） |

### 学生端页面

| 现有文件 | 行数 | 迁移目标 |
|---------|-----|---------|
| `pages/student/StudentHomePage.tsx` | 514 | `features/student/components/StudentHome.tsx` |
| `pages/student/StudentProfilePage.tsx` | 186 | `features/student/components/StudentProfile.tsx` |
| `pages/student/StudentFaqPage.tsx` | 227 | `pages/student/FaqPage.tsx` → 复用 `features/faq/` 学生视图 |
| `pages/student/StudentTicketsPage.tsx` | 276 | `pages/student/TicketsPage.tsx` → 复用 `features/tickets/` 学生视图 |

### 共享组件与基础设施

| 现有文件 | 迁移目标 |
|---------|---------|
| `components/chat/*` | `features/conversations/components/` |
| `components/AuthProvider.tsx` | 替换为 `shared/store/authStore.ts` |
| `lib/uploadContext.tsx` | 替换为 `shared/store/uploadStore.ts` |
| `components/ui/Toast.tsx` | 替换为 shadcn `Toast` + `uiStore.showToast` |
| `components/ui/ConfirmDialog.tsx` | 替换为 shadcn `Dialog` + `uiStore.showConfirm` |

### KnowledgeManagementPage 关系说明

现有代码中存在两个知识库相关页面：

- **`KnowledgeBasePage.tsx`（1069 行）**：真正的知识库管理实现（集合 CRUD、文档列表、向量检索配置等），导出 `DocumentKnowledgeTab` 组件供上层复用
- **`KnowledgeManagementPage.tsx`（43 行）**：薄容器，用 Tab 组合 `DocumentKnowledgeTab`（来自 KnowledgeBasePage）和 `FaqKnowledgeTab`（来自 FaqPage），是真正的路由落地页

重构后：
- `KnowledgeBasePage` 的实现全部迁入 `features/knowledge/`
- `FaqPage` 的实现全部迁入 `features/faq/`
- 新的 `pages/admin/KnowledgePage.tsx` 继续扮演"薄容器 + Tab 切换"角色，引用两个 feature 的导出组件
