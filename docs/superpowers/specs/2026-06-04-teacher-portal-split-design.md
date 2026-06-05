# 老师端独立 Portal 设计 — 导师工作台 (Mentor Workspace)

> **创建日期**：2026-06-04
> **状态**：设计稿（待实现）
> **关联**：[frontend/docs/standards.md](../../../frontend/docs/standards.md) · [backend/docs/standards.md](../../../backend/docs/standards.md)

---

## 1. 背景与动机

### 1.1 当前现状

老师 (teacher) 和管理员 (admin) 共用 `/admin/*` 路由：

- `AppLayout` + `Sidebar` 一套，菜单项靠 `roles: ['admin', 'teacher']` 字段过滤显示
- 嵌套 `RouteGuard allowedRoles={['admin']}` 把"知识库 / 文档 / 设置"屏蔽给 teacher
- teacher 实际可访问：概览 / 对话 / 答疑请求 / 师生管理 / 使用统计 — 全部是**全局数据视野**

### 1.2 问题

teacher 不是"权限低一档的 admin"，teacher 是**导师 (mentor)**，负责自己绑定的几个学生的毕设过程。两个角色工作动线完全不同：

| 维度 | admin | teacher (导师) |
|------|-------|---------------|
| 服务对象 | 整个学院系统 | 自己绑定的几个学生 |
| 数据视野 | 全局 | 仅"我的学生" |
| 关心的事 | 知识库质量 / 平台运行 / 全校统计 | 我学生的进度 / 没接到的求助 / 学生在问什么 |
| 使用频率 | 偶尔进后台 | 应该是每周/每天进来看一次 |

把老师端继续放在 admin 下，本质是把"导师"塞进"管理员"的产品形态里，长期会越来越别扭。

### 1.3 目标

把老师端从 admin 中**完全拆出**成独立 Portal，按"导师工作台 (Mentor Workspace)"重新定位。路由、登录、布局、storage key 三端各自独立，与 student 端的拆分方式对齐。

后端基本不动权限模型——已有 `mentor-student` 关系、tickets 按 `mentor_id` 自动过滤等基础设施。只新增"我的导师概览"聚合接口和必要的过滤参数。

---

## 2. 范围

### 2.1 In Scope

- 新增 `/teacher/*` 路由族 + `/teacher/login` 独立登录页
- 新增 `TeacherLayout` / `TeacherSidebar`
- 新增 4 个一级菜单页 + 1 个二级详情页：
  - 导师首页（今日待办 / 本周活跃 / 沉默学生 / 最近事件流）
  - 我的学生（列表 + 单生详情）
  - 我的答疑请求
  - 个人中心
- 后端新增 `routes/mentor.py`、`services/mentor_service.py`、`schemas/mentor.py`
- 新增 `require_teacher` 认证依赖（仅 teacher 可访问）
- 三端 storage key 隔离 (`rag_admin_*` / `rag_teacher_*` / `rag_student_*`)
- 配套测试：service 单测 + storage 单测

### 2.2 Out of Scope

- **学生对话查看**：不做。教师不可看学生与 AI 的对话内容/标题（隐私保护）
- **教师贡献 FAQ**：不做。后续可作独立 spec
- **改动 admin 端现有菜单/页面**：除"师生管理"在 admin 仍保留外，admin 视野不变
- **改动 student 端**：完全不动
- **改动 mentor-student 绑定关系管理**：仍由 admin 在 `features/users/` 内管理

---

## 3. 架构总览

### 3.1 路由结构

```
/admin/login         → 管理员登录（保留）
/teacher/login       → 教师登录（新增）
/student/login       → 学生登录（保留）

/admin/*             → admin Portal（保留，但 RouteGuard allowedRoles 收紧为 ['admin']）
/teacher/*           → teacher Portal（新增）
/student/*           → student Portal（保留）
```

### 3.2 teacher Portal 路由表

| 路径 | 页面组件 | 数据 |
|------|---------|------|
| `/teacher` | `TeacherHomePage` | `GET /api/mentors/me/overview` |
| `/teacher/students` | `MyStudentsPage` | `GET /api/mentors/me/students` |
| `/teacher/students/:id` | `MyStudentDetailPage` | 学生信息 + `GET /api/tickets/?student_id=X` |
| `/teacher/tickets` | `TeacherTicketsPage` | `GET /api/tickets/` (后端按 mentor_id 自动过滤) |
| `/teacher/profile` | `TeacherProfilePage` | `GET /api/auth/me` + `PUT /api/auth/me/password` |

所有页面通过 `React.lazy()` 注册到 `app/App.tsx`（强制：[前端 standards § 5.1.0](../../../frontend/docs/standards.md#510强制所有页面路由使用-reactlazy-懒加载)）。

`app/routes.ts` 新增常量：

```ts
TEACHER_LOGIN:           '/teacher/login',
TEACHER_ROOT:            '/teacher',
TEACHER_STUDENTS:        '/teacher/students',
TEACHER_STUDENT_DETAIL:  '/teacher/students/:id',
TEACHER_TICKETS:         '/teacher/tickets',
TEACHER_PROFILE:         '/teacher/profile',
```

### 3.3 角色与权限收紧

`RouteGuard` 的 `allowedRoles` 收紧：

```tsx
<Route path="admin" element={<RouteGuard allowedRoles={['admin']} />}>      ← 原 ['admin','teacher']
<Route path="teacher" element={<RouteGuard allowedRoles={['teacher']} />}>  ← 新增
<Route path="student" element={<RouteGuard allowedRoles={['student']} />}>  ← 保留
```

`RouteGuard.tsx` 未登录跳转 / 角色不匹配跳转逻辑扩展为识别 3 个前缀：

```ts
const loginPath =
  pathname.startsWith('/student') ? '/student/login' :
  pathname.startsWith('/teacher') ? '/teacher/login' :
  '/admin/login';
```

---

## 4. 前端设计

### 4.1 目录变更

```
frontend/src/
├── pages/teacher/                    ← 新增
│   ├── TeacherHomePage.tsx           (≤ 10 行)
│   ├── MyStudentsPage.tsx
│   ├── MyStudentDetailPage.tsx
│   ├── TeacherTicketsPage.tsx
│   └── TeacherProfilePage.tsx
│
├── features/mentor/                  ← 新增（仅放导师专属 UI）
│   ├── components/
│   │   ├── TeacherHome.tsx           ← 根（≤ 250 行；超了把卡片拆出）
│   │   ├── cards/
│   │   │   ├── TodayPendingCard.tsx
│   │   │   ├── WeeklyActivityCard.tsx
│   │   │   ├── SilentStudentsCard.tsx
│   │   │   └── RecentEventsCard.tsx
│   │   ├── MyStudentsRoot.tsx        ← 我的学生列表根
│   │   ├── StudentCard.tsx
│   │   ├── MyStudentDetail.tsx       ← 单生详情根（左信息 / 右工单列表）
│   │   └── TeacherProfile.tsx        ← 个人中心根
│   ├── hooks/
│   │   ├── queryKeys.ts
│   │   ├── useMyOverview.ts
│   │   ├── useMyStudents.ts
│   │   ├── useStudentDetail.ts
│   │   └── useUpdateProfile.ts
│   ├── services/mentorService.ts     (≤ 200 行；超了按子域拆)
│   ├── types.ts
│   └── index.ts                      ← 导出 5 个根组件
│
├── features/tickets/                 ← 既有，新增一个 root
│   ├── components/
│   │   ├── TicketsManagement.tsx     (admin 用，保留)
│   │   ├── StudentTicketList.tsx     (student 用，保留)
│   │   └── MentorTicketList.tsx      ← 新增（teacher 用）
│   └── index.ts                      ← 追加导出 MentorTicketList
│
└── shared/components/layout/
    ├── TeacherLayout.tsx             ← 新增（参照 StudentLayout 模式）
    └── TeacherSidebar.tsx            ← 新增
```

#### 4.1.1 features/mentor/index.ts 出口

```ts
export { TeacherHome } from './components/TeacherHome';
export { MyStudentsRoot } from './components/MyStudentsRoot';
export { MyStudentDetail } from './components/MyStudentDetail';
export { TeacherProfile } from './components/TeacherProfile';
```

> 多 root 模式与现有 `features/student/`、`features/tickets/` 一致——这是 standards 既有先例。

#### 4.1.2 features/mentor/ 与 features/tickets/ 的边界

- 工单列表 UI 走 `features/tickets/MentorTicketList`（**不**在 features/mentor/ 重写）
- 单生详情页里的"该生工单列表"也是 `MentorTicketList` 的复用形态（通过 prop 传 `studentId` 过滤）
- 跨 feature 引用通过 `index.ts` 入口（强制：前端 standards § 2.2）

### 4.2 状态管理

#### 4.2.1 Portal 类型扩展

`shared/lib/auth.ts`：

```ts
export type Portal = 'admin' | 'teacher' | 'student';

export function getCurrentPortal(): Portal {
  const p = window.location.pathname;
  if (p.startsWith('/student')) return 'student';
  if (p.startsWith('/teacher')) return 'teacher';
  return 'admin';
}

function keyOf(portal: Portal) {
  return {
    access:  `rag_${portal}_access_token`,
    refresh: `rag_${portal}_refresh_token`,
    user:    `rag_${portal}_user`,
  };
}
```

三端 storage key 完全隔离，互不干扰（与现有"admin/student 两端隔离"一致）。

#### 4.2.2 authStore

**不新建 store**（前端 standards § 6.4：新 store 必须满足"跨页面共享"）。

- `useAuthUser`、`useIsTeacher`、`useAuthLogin`、`useAuthLogout` 等 selector hooks 已就绪
- 模块加载时同步初始化（`_initialPortal = getCurrentPortal()`），不放进 `useEffect`（强制：前端 standards § 6.5）
- 登录跳转：teacher 走 `/teacher`，admin 走 `/admin`，student 走 `/student`

`app/App.tsx` 的 `RoleRedirect` 更新：

```tsx
function RoleRedirect() {
  const user = useAuthUser();
  if (!user) return <Navigate to="/admin/login" replace />;
  const target =
    user.role === 'student' ? '/student' :
    user.role === 'teacher' ? '/teacher' :
    '/admin';
  return <Navigate to={target} replace />;
}
```

### 4.3 数据访问

#### 4.3.1 shared/types/api.ts 新增类型

```ts
export interface MentorOverview {
  pending_tickets: number;
  weekly_activity: WeeklyActivityBucket[];   // 按学生分组的本周对话/工单总数
  silent_students: SilentStudent[];          // 超过 7 天未活跃的学生
  recent_events: MentorRecentEvent[];        // 最近工单事件（仅工单，不含对话）
}

export interface WeeklyActivityBucket {
  student_id: number;
  display_name: string;
  count: number;                              // 本周 ticket + 对话总条数
}

export interface SilentStudent {
  id: number;
  display_name: string;
  username: string;
  last_active_at: string | null;
  days_silent: number;
}

export interface MentorRecentEvent {
  event_type: 'ticket_created' | 'ticket_replied' | 'ticket_closed';
  student_id: number;
  student_name: string;
  ticket_id: number;
  ticket_title: string;
  occurred_at: string;
}
```

#### 4.3.2 shared/lib/api.ts 新增 mentorApi 模块

```ts
export const mentorApi = {
  getMyOverview: () => client.get<MentorOverview>('/mentors/me/overview').then(r => r.data),
  getMyStudents: () => client.get<UserInfo[]>('/mentors/me/students').then(r => r.data),
};
```

`tickets` 现有 API 加 `student_id` 可选过滤参数（如缺）；`auth.updateProfile` 视 `PUT /api/auth/me` 实际存在情况补。

#### 4.3.3 features/mentor/services/mentorService.ts

```ts
import { mentorApi, userApi, authApi } from '@shared/lib/api';

export const mentorService = {
  getOverview:    () => mentorApi.getMyOverview(),
  listMyStudents: () => mentorApi.getMyStudents(),
  getStudent:     (id: number) => userApi.getUser(id),
  updateProfile:  (body: UpdateProfileBody) => authApi.updateMe(body),
  changePassword: (body: ChangePasswordBody) => authApi.changePassword(body),
};
```

> 纯函数集合 + 调 `shared/lib/api.ts`，不持有状态、不 import React（强制：前端 standards § 5.4.1）。

#### 4.3.4 features/mentor/hooks

每个 hook：useQuery / useMutation 都经过 `mentorService`，不直接调 `api.ts`。Mutation `onError` 统一走 `handleMutationError(err, showToast)`（强制：§ 5.3.1 / § 7.2）。

`queryKeys.ts`：

```ts
export const mentorKeys = {
  all:        () => ['mentor'] as const,
  overview:   () => ['mentor', 'overview'] as const,
  students:   () => ['mentor', 'students'] as const,
  student:    (id: number) => ['mentor', 'student', id] as const,
};
```

### 4.4 登录页

**复用 `LoginForm`**，扩 `variant` 枚举：

```tsx
interface LoginFormProps {
  variant: 'admin' | 'teacher' | 'student';
}
```

teacher variant 视觉与 admin 相近（密度高、暗色对比卡），但配色独立（见 § 6）。底部"切换其他身份登录"链接展示另外两个 portal 入口（admin / student）。

`LoginPage.tsx` 接受 `variant` prop：

```tsx
export default function LoginPage({ variant = 'admin' }: { variant?: 'admin' | 'teacher' | 'student' }) {
  return <LoginForm variant={variant} />;
}
```

`app/App.tsx`：

```tsx
<Route path="/admin/login"   element={<LoginPage variant="admin" />} />
<Route path="/teacher/login" element={<LoginPage variant="teacher" />} />
<Route path="/student/login" element={<LoginPage variant="student" />} />
```

### 4.5 页面规范

每个 page 文件 ≤ 10 行（强制：前端 standards § 5.1.1）。例：

```tsx
// pages/teacher/TeacherHomePage.tsx
import { TeacherHome } from '@features/mentor';

export default function TeacherHomePage() {
  return <TeacherHome />;
}
```

详情页通过 `useParams` 拿 ID 传给 feature：

```tsx
// pages/teacher/MyStudentDetailPage.tsx
import { useParams } from 'react-router-dom';
import { MyStudentDetail } from '@features/mentor';

export default function MyStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <MyStudentDetail studentId={Number(id)} />;
}
```

---

## 5. 后端设计

### 5.1 新文件清单

```
backend/src/
├── api/
│   ├── routes/mentor.py              ← 新增
│   ├── schemas/mentor.py             ← 新增
│   └── auth.py                       ← 新增 require_teacher 依赖
├── services/
│   └── mentor_service.py             ← 新增（单文件，预计 < 200 行；超了拆包）
├── storage/
│   ├── user_store.py                 ← 扩接口（沉默学生 / 周活跃聚合）
│   ├── ticket_store.py               ← 扩接口（按 mentor 聚合事件 / pending 计数）
│   └── interfaces/
│       ├── user_store.py             ← 加 Protocol 方法
│       └── ticket_store.py           ← 加 Protocol 方法
└── api/deps.py                       ← 注册 get_mentor_service

backend/tests/
├── services/test_mentor_service.py   ← 新增（必须，§ 8.5 强制）
├── storage/test_user_store.py        ← 追加新方法测试
└── storage/test_ticket_store.py      ← 追加新方法测试
```

> `routes/user.py` 已 **371 行**，已逼近"实现文件 250 行"红线（路由属实现文件）。新增 mentor 接口单独走 `routes/mentor.py`，不再往 `user.py` 加。

### 5.2 接口契约

#### 5.2.1 GET /api/mentors/me/overview

仅 `role == 'teacher'` 可访问（`Depends(require_teacher)`）。

**响应**：`MentorOverviewResponse`

```python
class WeeklyActivityBucket(BaseModel):
    student_id: int
    display_name: str
    count: int

class SilentStudentItem(BaseModel):
    id: int
    display_name: str
    username: str
    last_active_at: datetime | None
    days_silent: int

class MentorRecentEventItem(BaseModel):
    event_type: Literal['ticket_created', 'ticket_replied', 'ticket_closed']
    student_id: int
    student_name: str
    ticket_id: int
    ticket_title: str
    occurred_at: datetime

class MentorOverviewResponse(BaseModel):
    pending_tickets: int
    weekly_activity: list[WeeklyActivityBucket]
    silent_students: list[SilentStudentItem]
    recent_events: list[MentorRecentEventItem]
```

**约束**：
- `weekly_activity.count` 是该学生本周与 AI 的对话总条数 + 工单数（合并指标，避免 dashboard 卡过多）
- `silent_students` 阈值：**默认 7 天未活跃**（学生最近一次发起对话或工单的时间）。该阈值定义在 `mentor_service.py` 顶部常量 `SILENT_DAYS_THRESHOLD = 7`
- `recent_events` 仅工单事件，**不含**学生对话事件（隐私保护，与 § 2.2 一致）
- `recent_events` 最多 20 条，按时间倒序

#### 5.2.2 GET /api/mentors/me/students

简化形式的 `GET /api/mentors/{id}/students`——省去前端拼路径。

实现逻辑：`mentor_service.list_my_students(current_user["id"])` 直接复用现有 `user_service.list_mentor_students`。

#### 5.2.3 GET /api/tickets/?student_id={id}

为"单生详情页的工单列表"准备。**现有 `list_qa_requests(mentor_id, student_id=None, ...)` 已支持 `student_id` 过滤**——无 SQL 改动，无新 storage 方法。

仅需在 `ticket_service.list_qa_requests` 中追加越权校验：teacher 角色调用且传入 `student_id` 时，先调 `user_store.get_student_mentor(student_id)`，确认 `mentor_id == current_user.id`；否则抛 `PermissionDeniedError`。

#### 5.2.4 个人中心相关接口

| 接口 | 状态 | 处理 |
|------|------|------|
| `GET /api/auth/me` | 已存在 | 直接复用 |
| `PUT /api/auth/me/password` | 已存在 | 直接复用 |
| `PUT /api/auth/me` | **不存在，需新增** | 写在 `api/routes/auth.py` 中（与 `/me/password` 同位置），不进 mentor 文件 |

`PUT /api/auth/me` 接受可选字段：`display_name`、`email`。其余字段（username / role / employee_id / department / title）由 admin 在用户管理修改。该接口对**所有登录用户**生效（admin / teacher / student 都能改自己），因此放 `auth.py` 是合理位置。

新增接口需按[后端 standards § 9.1 新增 API 标准 7 步流程](../../../backend/docs/standards.md#91新增-api-接口)：补 schema、`BaseUserStore.update_self_profile`（如需）、`user_service.update_self_profile`、route、tests。

### 5.3 认证依赖

`api/auth.py` 新增：

```python
def require_teacher(current_user: dict = Depends(get_current_user)) -> dict:
    """仅 teacher 可访问。"""
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限")
    return current_user
```

不影响 `require_admin`、`require_teacher_or_admin`。

### 5.4 Service 层

`services/mentor_service.py`：

```python
class MentorService(BaseService):
    """导师工作台业务编排。"""

    SILENT_DAYS_THRESHOLD: int = 7
    RECENT_EVENTS_LIMIT: int = 20

    def __init__(
        self,
        user_store: BaseUserStore,
        ticket_store: BaseTicketStore,
        conversation_store: BaseConversationStore,
    ):
        super().__init__()
        self._user_store = user_store
        self._ticket_store = ticket_store
        self._conversation_store = conversation_store

    def get_overview(self, mentor_id: int) -> dict: ...
    def list_my_students(self, mentor_id: int) -> list[dict]: ...
    def list_my_tickets_by_student(self, mentor_id: int, student_id: int, page: int, page_size: int) -> list[dict]:
        """带越权校验：student_id 必须属于该 mentor。"""
        ...
```

约束：
- 不抛 `HTTPException`，只抛 `AppException` 子类（强制：后端 standards § 5.2.2）
- 不在方法体内 `new` 任何 store（强制：§ 5.2.1，通过 `__init__` 注入）
- 越权校验（teacher 不能看别人的学生）在 Service 层完成，抛 `PermissionDeniedError`

### 5.5 Storage 层新增方法

#### 5.5.1 `BaseUserStore` Protocol

```python
def list_silent_students_for_mentor(
    self, mentor_id: int, days_threshold: int
) -> list[dict]: ...
"""返回 mentor 名下、聚合最近活跃时间超过 days_threshold 天的学生。

聚合定义：last_active_at = MAX(
    SELECT MAX(updated_at) FROM conversations WHERE user_id = student.id,
    SELECT MAX(created_at) FROM tickets WHERE student_id = student.id
)；二者均无记录则视为永久沉默（按账号创建时间排序）。

返回字段：[{id, display_name, username, last_active_at, days_silent}]。
"""

def list_weekly_activity_for_mentor(
    self, mentor_id: int, since: datetime
) -> list[dict]: ...
"""按学生分组返回 since 至今的对话条数 + 工单条数之和。

返回字段：[{student_id, display_name, count}]。
"""
```

> **不新增 users 表字段**——`last_active_at` 通过 JOIN conversations / tickets 表的 MAX 聚合计算。理由：(1) 避免引入物化字段的同步问题；(2) 表数据量不大（一个导师 ≤ 30 学生），查询代价可接受。如未来确实出现性能瓶颈，再加物化列 + 触发器。

#### 5.5.2 `BaseTicketStore` Protocol

```python
def count_pending_by_mentor(self, mentor_id: int) -> int: ...

def list_recent_events_by_mentor(
    self, mentor_id: int, limit: int
) -> list[dict]: ...
"""返回 [{event_type, student_id, student_name, ticket_id, ticket_title, occurred_at}]，按 occurred_at 倒序。"""
```

> 不新增 `list_by_mentor_and_student`——现有 `list_qa_requests(mentor_id, student_id=None, ...)` 已支持。

#### 5.5.3 SQL 规范

- 所有值必须参数化（强制：后端 standards § 7.5）
- 异常包装为 `StorageError`（强制：§ 5.4.3）
- 不写业务 if（强制：§ 5.4.1）

#### 5.5.4 关于 "last_active_at" 的实现位置

学生"最近活跃"语义 = `MAX(conversations.updated_at, tickets.created_at)`，**仅在 storage 层 SQL 内通过 JOIN + GROUP BY 计算**，不修改 `users` 表 schema、不在 service 层做多次 DB 往返。详见 § 5.5.1 注释。

### 5.6 DI 注册

`api/deps.py`：

```python
def get_mentor_service(
    user_store: BaseUserStore = Depends(get_user_store),
    ticket_store: BaseTicketStore = Depends(get_ticket_store),
    conversation_store: BaseConversationStore = Depends(get_conversation_store),
) -> MentorService:
    return MentorService(user_store, ticket_store, conversation_store)
```

### 5.7 路由文件

`api/routes/mentor.py`（每函数 ≤ 30 行，强制：后端 standards § 3）：

```python
router = APIRouter(prefix="/mentors", tags=["mentor"])

@router.get("/me/overview", response_model=MentorOverviewResponse)
def get_my_overview(
    current_user: dict = Depends(require_teacher),
    svc: MentorService = Depends(get_mentor_service),
):
    return svc.get_overview(current_user["id"])

@router.get("/me/students", response_model=list[UserInfo])
def list_my_students(
    current_user: dict = Depends(require_teacher),
    svc: MentorService = Depends(get_mentor_service),
):
    return svc.list_my_students(current_user["id"])
```

`api/app.py` 注册：

```python
app.include_router(mentor.router, prefix="/api")
```

---

## 6. 视觉与品牌

### 6.1 配色提案

| Portal | 背景 | 主色 | 风格 |
|--------|------|------|------|
| admin | `hsl(38 22% 91%)` 暖米 | `#1A1A1A` 深色对比卡 | 严肃管理感 |
| teacher | `hsl(150 18% 93%)` 柔绿 | `#0F766E` 青绿 | 学术沉稳 |
| student | `hsl(215 25% 94%)` 冷灰蓝 | `#2563EB` 蓝 | 友好轻快 |

老师端选柔绿/teal 系，与另外两端有明确区分；既不与 admin 同暖色（避免混淆角色），又比 student 端更"成熟"。

### 6.2 Sidebar / Logo

- Logo 副标题：`导师工作台`
- Sidebar 结构与 admin Sidebar 一致（密度高、信息量大），配色换 teal
- 头像下方角色文案：`导师`

### 6.3 视觉 token

新增 CSS 变量到 `src/index.css`：

```css
[data-portal="teacher"] {
  --portal-bg: hsl(150 18% 93%);
  --portal-accent: #0F766E;
  --portal-accent-hover: #0E6B61;
}
```

`TeacherLayout` 根元素加 `data-portal="teacher"`。具体 Tailwind class 复用现有 `glass-card` / `glass-soft` / `hover-lift` / `fadeSlideUp` 等动画类（强制：[前端 standards § 9.4](../../../frontend/docs/standards.md#94参考-dashboard-特有样式不用-shadcn-替换)）。

> 视觉细节（具体阴影 / 圆角 / 间距）在实现期可微调，本设计稿仅锁定色系方向。

---

## 7. 测试要求

### 7.1 强制必测（后端 standards § 8.5）

- `tests/services/test_mentor_service.py`：
  - `get_overview` 各子字段正确聚合
  - 越权校验：teacher A 查 teacher B 的学生 → `PermissionDeniedError`
  - 沉默学生阈值正确
  - 空数据兜底（无学生 / 无 ticket 时不爆）
- `tests/storage/test_user_store.py` 追加：
  - `list_silent_students_for_mentor`：含活跃 / 沉默 / 边界值
  - `list_weekly_activity_for_mentor`：含跨周边界
- `tests/storage/test_ticket_store.py` 追加：
  - `count_pending_by_mentor`：状态过滤正确
  - `list_recent_events_by_mentor`：limit + 倒序
  - `list_by_mentor_and_student`（若新增）：跨 mentor 数据隔离

### 7.2 前端测试（可选，按需）

- 推荐：`features/mentor/services/mentorService.test.ts`（service 纯函数）
- 推荐：复杂 hook 如 `useMyOverview` 配 msw 集成测
- E2E：新增一条 `e2e/teacher-portal.spec.ts`（登录 → 首页加载 → 学生详情 → 回复工单），保持绿

### 7.3 不做的测试

- Layout / Sidebar 纯展示组件
- shadcn 复制副本
- 配色样式

---

## 8. Standards 合规映射

| 涉及变更 | 规范条款 | 合规要点 |
|---------|---------|---------|
| 4 个 hooks、1 个 service | [前端 § 2.2 / § 5.3.1](../../../frontend/docs/standards.md#22强制跨-feature-通过-indexts-引用) | 全部走 service → api，不绕 `api.ts` |
| pages 文件 ≤ 10 行 | 前端 § 5.1.1 强制 | 只 import feature 根组件 |
| 路由懒加载 | 前端 § 5.1.0 强制 | `React.lazy()` 注册 5 个 page |
| features/mentor 与 features/tickets 互不 import | 前端 § 2.3 强制 | 工单 UI 复用通过 `features/tickets/index.ts` 导出 |
| 多 root 出口 | 前端 § 4.3 强制 | `features/mentor/index.ts` 显式导出 4 个根（不含 cards） |
| authStore 同步初始化 | 前端 § 6.5 强制 | `getCurrentPortal()` 在模块加载时计算，不放 `useEffect` |
| 不新建 store | 前端 § 6.4 强制 | 复用 authStore；teacher Portal 不需要新 store |
| Mutation onError | 前端 § 7.2 强制 | `handleMutationError(err, showToast)` |
| 路由文件 30 行 / 函数 | 后端 § 3 强制 | `routes/mentor.py` 每函数瘦 |
| Service 一个业务域 | 后端 § 5.2.3 强制 | `mentor_service.py` 独立，不进 user_service |
| Service 不抛 HTTPException | 后端 § 5.2.2 强制 | 越权抛 `PermissionDeniedError` |
| Storage 包装异常 | 后端 § 5.4.3 强制 | `StorageError` |
| Storage 不写业务判断 | 后端 § 5.4.1 强制 | 越权校验留在 service |
| SQL 值参数化 | 后端 § 7.5 强制 | 所有 `student_id`、`mentor_id`、`days` 用 `%s` |
| 路由必须加认证依赖 | 后端 § 5.1.4 强制 | 全部 `Depends(require_teacher)` |
| storage SQL 新增必须测试 | 后端 § 8.5 强制 | tests/storage/ 追加 |
| 接口通过 deps.py 注入 | 后端 § 5.1.2 强制 | `get_mentor_service` 工厂 |

---

## 9. 实施顺序建议（提示，不锁定）

1. **后端先行**：mentor_service / mentor_store 方法 / mentor.py 路由 / 测试 → 给前端一个能调的接口
2. **前端基础设施**：Portal 类型扩展 / RouteGuard / authStore 测试 / 三 storage key 验证
3. **前端 Layout**：TeacherLayout / TeacherSidebar
4. **前端登录页**：LoginForm 加 teacher variant
5. **前端 features/mentor**：service / hooks / 各根组件按页面顺序实现
6. **前端 features/tickets**：MentorTicketList 实现
7. **E2E**：teacher-portal smoke

每一步前后端独立可验证。

---

## 10. 未来扩展（不在本次范围）

- 教师贡献 FAQ（独立 spec）
- 学生对话查看（如开启，需先做隐私协议 + 学生告知 + UI 摘要化）
- 导师评估 / 工作量统计（admin 视角的"导师效能"看板）
- 导师之间互相转工单（团队答疑）

---

*文档版本：v1.0 | 创建日期：2026-06-04*
