# 前端全功能测试计划（E2E）

> 目标：模拟真实用户登录、点击、使用前端所有页面与关键功能，同时监视后端日志，捕获前端报错与后端异常（4xx/5xx/Traceback）。
> 配套自动化脚本：`e2e/full-smoke.spec.ts`，运行方式见文末。

## 1. 测试环境

| 项 | 值 |
|---|---|
| 前端 | http://localhost:5173 |
| 后端 | http://127.0.0.1:8000 |
| 启动 | `poetry run dev`（自动拉起 Docker / Vite / FastAPI） |
| 依赖 | Qdrant :6333、MySQL :3306（rag_db / rag_user / rag_pass_123） |

### 测试账号（来自 `scripts/seed_demo_data.py`）

| 角色 | 账号 | 密码 |
|---|---|---|
| 管理员 | `admin` | `admin123` |
| 教师 | `teacher_li` / `teacher_wang` / `teacher_chen` | `Demo@123456` |
| 学生 | `202201001` … `202201xxx` | `Demo@123456` |

## 2. 页面清单与路由

### 管理端（`/admin/*`，AppLayout + Sidebar）

| # | 页面 | 路由 | 标题(h1) | 可见角色 |
|---|---|---|---|---|
| A1 | 登录 | `/admin/login` | 登录 | 公开 |
| A2 | 概览 | `/admin` | 概览 | admin / teacher |
| A3 | 对话 | `/admin/conversations` | 问答对话 | admin / teacher |
| A4 | 答疑请求 | `/admin/tickets` | 答疑请求 | admin / teacher |
| A5 | 师生管理 | `/admin/users` | 师生管理 | admin / teacher |
| A6 | 使用统计 | `/admin/analytics` | 使用统计 | admin / teacher |
| A7 | 知识库管理 | `/admin/knowledge` | 知识库 | **admin only** |
| A8 | 文档 | `/admin/documents` | 文档 | **admin only** |
| A9 | 系统配置 | `/admin/settings` | 系统配置 | **admin only** |
| A10 | 文档清洗审核 | `/admin/document/:kb/:id/review` | — | admin only |
| A11 | 文档分块审核 | `/admin/document/:kb/:id/chunks` | — | admin only |

### 学生端（`/student/*`，StudentLayout + StudentSidebar）

| # | 页面 | 路由 | 标题(h1) |
|---|---|---|---|
| S1 | 登录 | `/student/login` | 你好，同学 |
| S2 | 首页 | `/student` | 你好，{姓名} |
| S3 | 智能问答 | `/student/chat` | 问答对话 |
| S4 | 答疑记录 | `/student/tickets` | 我的答疑记录 |
| S5 | 常见问题 | `/student/faq` | 常见问题 |
| S6 | 我的 | `/student/profile` | {姓名} |

## 3. 测试用例

### 3.1 登录与鉴权

| 用例 | 步骤 | 预期 |
|---|---|---|
| TC-LOGIN-01 | 打开 `/admin/login`，输入 admin/admin123，点登录 | 跳转 `/admin`，显示"概览" |
| TC-LOGIN-02 | 输入错误密码 | 显示红色错误提示，停留登录页 |
| TC-LOGIN-03 | 打开 `/student/login`，输入学生账号 | 跳转 `/student`，显示"你好，…" |
| TC-LOGIN-04 | 教师 teacher_li 登录 | 跳转 `/admin`，侧边栏**无**知识库/文档/系统配置项 |
| TC-AUTH-01 | 未登录直接访问 `/admin/users` | 重定向到登录页 |
| TC-AUTH-02 | 学生登录后访问 `/admin` | 不允许进入管理端（跳转/拦截） |

### 3.2 管理端页面冒烟（admin 登录）

逐项通过**侧边栏点击**导航，断言标题可见、无前端报错、相关 list 接口正常：

| 用例 | 操作 | 预期 | 关联后端 API |
|---|---|---|---|
| TC-ADM-OVERVIEW | 点"概览" | 显示统计卡片 | `/api/analytics/summary`、`/api/knowledge` |
| TC-ADM-CONV | 点"对话" | 显示"问答对话"、新建对话按钮、输入框 | `/api/conversation/*` |
| TC-ADM-TICKETS | 点"答疑请求" | 显示工单列表/空状态 | `/api/tickets` |
| TC-ADM-USERS | 点"师生管理" | 显示三个 Tab（学生/教师/导师关系） | `/api/users` |
| TC-ADM-ANALYTICS | 点"使用统计" | 显示统计图表 | `/api/analytics/summary` |
| TC-ADM-KB | 点"知识库管理" | 显示"知识库"、新建知识库按钮 | `/api/knowledge` |
| TC-ADM-DOCS | 点"文档" | 显示"文档"、文档列表 | `/api/document/*` |
| TC-ADM-SETTINGS | 点"系统配置" | 显示"系统配置"、保存配置按钮 | `/api/config` |

### 3.3 管理端关键交互

| 用例 | 操作 | 预期 |
|---|---|---|
| TC-INT-KB-NEW | 知识库页点"新建知识库" | 弹出创建表单，可取消 |
| TC-INT-USERS-TAB | 师生管理切换 学生→教师→导师关系 Tab | 各 Tab 内容正常加载 |
| TC-INT-CHAT-SEND | 对话页新建对话→输入问题→回车 | 出现思考过程/流式回答，无 500（**重后端：RAG 全链路**） |
| TC-INT-FAQ-SEARCH | （如有 FAQ 入口）输入搜索词 | 返回结果或空状态，无报错 |
| TC-INT-SETTINGS-READ | 系统配置页读取当前配置 | 配置项正常回显（**不点保存以免改动**） |

### 3.4 学生端页面冒烟（学生登录）

| 用例 | 操作 | 预期 | 关联后端 API |
|---|---|---|---|
| TC-STU-HOME | 进入首页 | 显示"你好，…"、入口卡片 | `/api/analytics`、`/api/knowledge/active` |
| TC-STU-CHAT | 点"智能问答" | 显示"问答对话"、输入框 | `/api/conversation/*` |
| TC-STU-TICKETS | 点"答疑记录" | 显示"我的答疑记录"/空状态 | `/api/tickets` |
| TC-STU-FAQ | 点"常见问题" | 显示"常见问题"、搜索框 | `/api/faq/{kb}` |
| TC-STU-PROFILE | 点"我的" | 显示个人资料 | `/api/auth/me` |

### 3.5 学生端关键交互

| 用例 | 操作 | 预期 |
|---|---|---|
| TC-STU-FAQ-SEARCH | FAQ 页输入关键词搜索 | 列表按关键词过滤，无报错 |
| TC-STU-FAQ-EXPAND | 点击某条 FAQ 展开 | 显示答案、"去提问"按钮 |
| TC-STU-CHAT-SEND | 智能问答输入问题→回车 | 流式返回答案，无 500（**重后端**） |
| TC-STU-LOGOUT | 点退出登录 | 回到 `/student/login` |

## 4. 后端监视要点

测试运行期间持续监视后端日志（`/tmp/rag_dev.log`），重点捕获：

- `Traceback` / `ERROR` / `Exception` — 未处理异常
- HTTP `500` — 服务端错误
- HTTP `4xx`（除预期的 401/422 鉴权用例外）— 非预期客户端错误
- 聊天 SSE：`/api/chat` 流式过程中的 LLM / 检索 / 向量库异常
- 启动期：`ensure_default_admin`、DB 连接、Qdrant 连接告警

前端侧同时收集：

- `pageerror` — 前端运行时未捕获异常
- `console.error` — React 错误边界 / 网络错误
- 响应状态 ≥ 400 的请求 URL

## 5. 运行方式

```bash
# 环境已通过 poetry run dev 启动（:5173 + :8000 + Docker）
cd frontend
npm run test                 # 无头运行全部 e2e
npx playwright test e2e/full-smoke.spec.ts   # 仅运行全功能冒烟
npm run test:headed          # 有头模式（可视化观察点击过程）
npx playwright show-report   # 查看 HTML 报告（失败截图）
```
