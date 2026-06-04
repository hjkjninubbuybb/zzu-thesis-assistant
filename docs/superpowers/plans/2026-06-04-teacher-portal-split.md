# Teacher Portal Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 teacher 角色从 admin 共用 portal 中拆出独立 `/teacher/*` 导师工作台，前后端各自落地，配色与 admin/student 区分，数据视野收紧到"我的学生"。

**Architecture:**
后端新增 `routes/mentor.py` + `services/mentor_service.py` + 必要的 storage 聚合方法；前端按 `features/student/` 已建立的"独立 portal"模式新建 `TeacherLayout` / `TeacherSidebar` / `features/mentor/` / `pages/teacher/*`，工单 UI 在既有 `features/tickets/` 中加 `MentorTicketList` 根组件复用。

**Tech Stack:**
- 后端：FastAPI、Pydantic、PyMySQL、pytest；遵循 [backend/docs/standards.md](../../../backend/docs/standards.md)
- 前端：React 19、TypeScript、Vite、Zustand、TanStack Query、Tailwind、React Router v6；遵循 [frontend/docs/standards.md](../../../frontend/docs/standards.md)
- 设计稿：[2026-06-04-teacher-portal-split-design.md](../specs/2026-06-04-teacher-portal-split-design.md)

---

## File Structure（落地映射）

### 新增（后端）
- `backend/src/api/schemas/mentor.py` — Pydantic 响应模型
- `backend/src/services/mentor_service.py` — 业务编排（导师概览、学生列表、越权校验）
- `backend/src/api/routes/mentor.py` — `/api/mentors/me/*` 路由
- `backend/tests/services/test_mentor_service.py` — service 单测
- `backend/tests/api/test_mentor_routes.py` — route 集成测

### 修改（后端）
- `backend/src/api/auth.py` — 新增 `require_teacher` 依赖
- `backend/src/api/routes/auth.py` — 新增 `PUT /api/auth/me`
- `backend/src/services/user_service/_profile.py`（或同 service 文件）— 新增 `update_self_profile`
- `backend/src/storage/user_store.py` + `interfaces/user_store.py` — 新增 `list_silent_students_for_mentor` / `list_weekly_activity_for_mentor`
- `backend/src/storage/ticket_store.py` + `interfaces/ticket_store.py` — 新增 `count_pending_by_mentor` / `list_recent_events_by_mentor`
- `backend/src/services/ticket_service.py` — `list_tickets` 接受 `student_id` 过滤（带越权校验）
- `backend/src/api/routes/ticket.py` — `GET /api/tickets` 接受 `student_id` query param
- `backend/src/api/deps.py` — 注册 `get_mentor_service`
- `backend/src/api/app.py` — `include_router(mentor.router)`
- `backend/tests/storage/test_user_store.py` — 追加新方法测试
- `backend/tests/storage/test_ticket_store.py` — 追加新方法测试

### 新增（前端）
- `frontend/src/shared/components/layout/TeacherLayout.tsx`
- `frontend/src/shared/components/layout/TeacherSidebar.tsx`
- `frontend/src/features/mentor/` 整个 feature（services / hooks / components / types / index.ts）
- `frontend/src/features/tickets/components/MentorTicketList.tsx`
- `frontend/src/pages/teacher/TeacherHomePage.tsx`
- `frontend/src/pages/teacher/MyStudentsPage.tsx`
- `frontend/src/pages/teacher/MyStudentDetailPage.tsx`
- `frontend/src/pages/teacher/TeacherTicketsPage.tsx`
- `frontend/src/pages/teacher/TeacherProfilePage.tsx`

### 修改（前端）
- `frontend/src/shared/lib/auth.ts` — `Portal` 类型 + `/teacher` 前缀
- `frontend/src/shared/components/auth/RouteGuard.tsx` — 三前缀识别
- `frontend/src/shared/types/api.ts` — 新增 `MentorOverview` 等类型
- `frontend/src/shared/lib/api.ts` — 新增 `mentorApi`、扩 `ticketApi.list`、扩 `authApi.updateMe`
- `frontend/src/features/auth/components/LoginForm.tsx` — 新增 teacher variant
- `frontend/src/pages/admin/LoginPage.tsx` — variant 类型扩到三态
- `frontend/src/features/tickets/hooks/useTicketList.ts` — 支持 `studentId` 过滤
- `frontend/src/features/tickets/services/ticketService.ts` — 透传 `studentId`
- `frontend/src/features/tickets/hooks/queryKeys.ts` — 加 `studentId` 维度
- `frontend/src/features/tickets/index.ts` — 追加导出 `MentorTicketList`
- `frontend/src/app/routes.ts` — 加 `TEACHER_*` 常量
- `frontend/src/app/App.tsx` — 注册 teacher 路由 + admin allowedRoles 收紧 + `RoleRedirect` 三态

---

## Pre-Flight Checklist（每位执行者开始前）

```bash
# 1. 工作区干净
git status   # 应当为 "无文件要提交，工作区干净"

# 2. 在 dev 分支
git branch --show-current   # 应为 dev

# 3. 基础设施就位（MySQL + Qdrant）
docker ps | grep -E 'mysql|qdrant'

# 4. 后端虚拟环境
cd backend && poetry env info && cd ..

# 5. 前端 deps
cd frontend && [ -d node_modules ] && echo "OK" || npm install && cd ..

# 6. 基线测试
cd backend && PATH="$(pwd)/.venv/bin:$PATH" pytest -m "not integration" -q && cd ..
cd frontend && npm run lint && cd ..
```

如果任何一步报红，先修复再开始 Task 1。

---

## Task 1: 后端新增 `require_teacher` 认证依赖

**Files:**
- Modify: `backend/src/api/auth.py:140-152`
- Test: `backend/tests/api/test_auth_dependencies.py` (新建)

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/api/test_auth_dependencies.py`：

```python
"""auth 依赖单测：require_teacher。"""

import pytest
from fastapi import HTTPException

from src.api.auth import require_teacher


def test_require_teacher_passes_for_teacher():
    user = {"id": 1, "role": "teacher", "is_active": True}
    result = require_teacher(current_user=user)
    assert result is user


def test_require_teacher_rejects_admin():
    user = {"id": 1, "role": "admin", "is_active": True}
    with pytest.raises(HTTPException) as exc:
        require_teacher(current_user=user)
    assert exc.value.status_code == 403


def test_require_teacher_rejects_student():
    user = {"id": 1, "role": "student", "is_active": True}
    with pytest.raises(HTTPException) as exc:
        require_teacher(current_user=user)
    assert exc.value.status_code == 403
```

- [ ] **Step 2: 跑测试看失败**

```bash
cd backend
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/api/test_auth_dependencies.py -v
```
Expected: 全部 `ImportError`（`require_teacher` 不存在）

- [ ] **Step 3: 实现 `require_teacher`**

在 `backend/src/api/auth.py` 紧跟 `require_teacher_or_admin` 后追加：

```python
def require_teacher(current_user: dict = Depends(get_current_user)) -> dict:
    """仅 teacher 可访问。"""
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限")
    return current_user
```

- [ ] **Step 4: 跑测试看通过**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/api/test_auth_dependencies.py -v
```
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/auth.py backend/tests/api/test_auth_dependencies.py
git commit -m "feat(auth): add require_teacher dependency for teacher-only endpoints"
```

---

## Task 2: 后端 TicketStore 新增 `count_pending_by_mentor` + `list_recent_events_by_mentor`

**Files:**
- Modify: `backend/src/storage/interfaces/ticket_store.py`
- Modify: `backend/src/storage/ticket_store.py`
- Test: `backend/tests/storage/test_ticket_store.py`

- [ ] **Step 1: 在 interface 声明新方法**

在 `backend/src/storage/interfaces/ticket_store.py` `class BaseTicketStore(Protocol):` 内追加：

```python
    def count_pending_by_mentor(self, mentor_id: int) -> int:
        """返回该 mentor 名下 status='pending' 的工单数。"""
        ...

    def list_recent_events_by_mentor(self, mentor_id: int, limit: int) -> list[dict]:
        """返回该 mentor 名下最近 limit 个工单事件，按 occurred_at 倒序。

        每个事件 dict 字段：
            event_type: 'ticket_created' | 'ticket_replied' | 'ticket_closed'
            student_id: int
            student_name: str
            ticket_id: int
            ticket_title: str  (取 question 前 60 字符)
            occurred_at: datetime
        """
        ...
```

- [ ] **Step 2: 写失败测试**

在 `backend/tests/storage/test_ticket_store.py` 文件**末尾**追加（保持现有测试不动）：

```python
# ── 导师工作台聚合查询 ─────────────────────────────────────


@pytest.mark.integration
class TestMentorAggregations:
    """新增导师工作台所需的聚合方法（依赖真实 MySQL）。"""

    def test_count_pending_returns_zero_when_no_tickets(self, ticket_store, mentor_with_student):
        mentor_id, _ = mentor_with_student
        assert ticket_store.count_pending_by_mentor(mentor_id) == 0

    def test_count_pending_counts_only_pending_status(
        self, ticket_store, mentor_with_student
    ):
        mentor_id, student_id = mentor_with_student
        # 三个工单：pending / replied / closed
        ticket_store.create_qa_request(student_id, None, None, "Q1")
        t2 = ticket_store.create_qa_request(student_id, None, None, "Q2")
        ticket_store.update_qa_request(t2["id"], "ans", status="replied")
        t3 = ticket_store.create_qa_request(student_id, None, None, "Q3")
        ticket_store.update_qa_request(t3["id"], "ans", status="closed")

        assert ticket_store.count_pending_by_mentor(mentor_id) == 1

    def test_recent_events_returns_in_reverse_time_order(
        self, ticket_store, mentor_with_student
    ):
        mentor_id, student_id = mentor_with_student
        a = ticket_store.create_qa_request(student_id, None, None, "Q-A")
        b = ticket_store.create_qa_request(student_id, None, None, "Q-B")
        ticket_store.update_qa_request(b["id"], "ans-B", status="replied")

        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=10)
        assert len(events) >= 2
        # 最新事件在前
        for i in range(len(events) - 1):
            assert events[i]["occurred_at"] >= events[i + 1]["occurred_at"]

    def test_recent_events_respects_limit(self, ticket_store, mentor_with_student):
        mentor_id, student_id = mentor_with_student
        for i in range(5):
            ticket_store.create_qa_request(student_id, None, None, f"Q-{i}")
        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=3)
        assert len(events) == 3

    def test_recent_events_only_own_mentor(
        self, ticket_store, two_mentors_with_students
    ):
        m1, s1, m2, s2 = two_mentors_with_students
        ticket_store.create_qa_request(s1, None, None, "Q-from-mentor1-student")
        ticket_store.create_qa_request(s2, None, None, "Q-from-mentor2-student")

        m1_events = ticket_store.list_recent_events_by_mentor(m1, limit=10)
        assert all(e["student_id"] == s1 for e in m1_events)
```

如 `tests/storage/conftest.py` 中没有 `mentor_with_student` / `two_mentors_with_students` fixture，**同时**在该 conftest 末尾追加：

```python
@pytest.fixture
def mentor_with_student(user_store):
    """创建一个 mentor + 一个绑定学生，返回 (mentor_id, student_id)。"""
    mentor_id = user_store.create_user(
        username="t_mentor_001",
        hashed_pwd="x",
        display_name="测试导师",
        role="teacher",
    )
    student_id = user_store.create_user(
        username="t_student_001",
        hashed_pwd="x",
        display_name="测试学生",
        role="student",
    )
    user_store.add_mentor_relation(mentor_id, student_id)
    yield mentor_id, student_id


@pytest.fixture
def two_mentors_with_students(user_store):
    """两个 mentor 各带一个学生。"""
    m1 = user_store.create_user("t_m1", "x", display_name="M1", role="teacher")
    s1 = user_store.create_user("t_s1", "x", display_name="S1", role="student")
    m2 = user_store.create_user("t_m2", "x", display_name="M2", role="teacher")
    s2 = user_store.create_user("t_s2", "x", display_name="S2", role="student")
    user_store.add_mentor_relation(m1, s1)
    user_store.add_mentor_relation(m2, s2)
    yield m1, s1, m2, s2
```

- [ ] **Step 3: 跑测试看失败**

```bash
cd backend
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/storage/test_ticket_store.py::TestMentorAggregations -v -m integration
```
Expected: `AttributeError: 'TicketStore' object has no attribute 'count_pending_by_mentor'`

- [ ] **Step 4: 实现两个方法**

在 `backend/src/storage/ticket_store.py` `class TicketStore:` 末尾追加：

```python
    def count_pending_by_mentor(self, mentor_id: int) -> int:
        """计算 mentor 名下 pending 工单数。"""
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM qa_requests "
                    "WHERE mentor_id = %s AND status = 'pending'",
                    (mentor_id,),
                )
                row = cur.fetchone()
                return int(row["cnt"]) if row else 0
        except Exception as e:
            logger.error("[TicketStore.count_pending_by_mentor] mentor_id=%d error=%s", mentor_id, e)
            raise StorageError(f"统计待处理工单失败：{e}") from e
        finally:
            conn.close()

    def list_recent_events_by_mentor(self, mentor_id: int, limit: int) -> list[dict]:
        """返回最近 limit 条工单事件，按 occurred_at 倒序。

        事件来源：created_at(ticket_created)、replied_at(ticket_replied)、closed_at(ticket_closed)。
        通过 UNION 把三种事件合到一张时间线上。
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                # 通过 UNION 把三种事件合成一张时间线
                sql = """
                    SELECT 'ticket_created' AS event_type, qa.student_id, u.display_name AS student_name,
                           qa.id AS ticket_id, qa.question AS ticket_title, qa.created_at AS occurred_at
                      FROM qa_requests qa
                      JOIN users u ON u.id = qa.student_id
                     WHERE qa.mentor_id = %s
                    UNION ALL
                    SELECT 'ticket_replied', qa.student_id, u.display_name,
                           qa.id, qa.question, qa.replied_at
                      FROM qa_requests qa
                      JOIN users u ON u.id = qa.student_id
                     WHERE qa.mentor_id = %s AND qa.replied_at IS NOT NULL
                    UNION ALL
                    SELECT 'ticket_closed', qa.student_id, u.display_name,
                           qa.id, qa.question, qa.closed_at
                      FROM qa_requests qa
                      JOIN users u ON u.id = qa.student_id
                     WHERE qa.mentor_id = %s AND qa.closed_at IS NOT NULL
                    ORDER BY occurred_at DESC
                    LIMIT %s
                """
                cur.execute(sql, (mentor_id, mentor_id, mentor_id, int(limit)))
                rows = cur.fetchall() or []
                # 截断 title 到 60 字符
                for r in rows:
                    title = r.get("ticket_title") or ""
                    r["ticket_title"] = title[:60]
                return list(rows)
        except Exception as e:
            logger.error(
                "[TicketStore.list_recent_events_by_mentor] mentor_id=%d error=%s",
                mentor_id, e,
            )
            raise StorageError(f"查询工单事件失败：{e}") from e
        finally:
            conn.close()
```

**注意**：若 `qa_requests` 表实际列名不是 `replied_at` / `closed_at`，先 `grep -i "qa_requests\|replied_at" backend/sql/init.sql backend/src/storage/ticket_store.py` 确认。若没有这些列，本计划假设要补 DDL — 那一步独立成 Task（不在本任务内）。**先核实再写代码**。

- [ ] **Step 5: 跑测试看通过**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/storage/test_ticket_store.py::TestMentorAggregations -v -m integration
```
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add backend/src/storage/interfaces/ticket_store.py \
        backend/src/storage/ticket_store.py \
        backend/tests/storage/test_ticket_store.py \
        backend/tests/storage/conftest.py
git commit -m "feat(storage): add mentor-scoped ticket aggregations

- count_pending_by_mentor: 计待回复工单数
- list_recent_events_by_mentor: 最近工单事件时间线"
```

---

## Task 3: 后端 UserStore 新增 `list_silent_students_for_mentor` + `list_weekly_activity_for_mentor`

**Files:**
- Modify: `backend/src/storage/interfaces/user_store.py`
- Modify: `backend/src/storage/user_store.py`
- Test: `backend/tests/storage/test_user_store.py`

- [ ] **Step 1: 在 interface 声明新方法**

在 `backend/src/storage/interfaces/user_store.py` `class BaseUserStore(Protocol):` 内追加：

```python
    def list_silent_students_for_mentor(
        self, mentor_id: int, days_threshold: int
    ) -> list[dict]:
        """返回该 mentor 名下、最近 last_active_at 超过 days_threshold 天的学生。

        last_active_at = MAX(
            (SELECT MAX(updated_at) FROM conversations WHERE user_id = student.id),
            (SELECT MAX(created_at) FROM qa_requests WHERE student_id = student.id)
        )

        永久沉默的学生（从未活动过）也包含进来。

        返回字段：
            id, display_name, username, last_active_at, days_silent
        """
        ...

    def list_weekly_activity_for_mentor(
        self, mentor_id: int, since: datetime
    ) -> list[dict]:
        """按学生分组返回 since 至今的对话条数 + 工单条数之和。

        返回字段：
            student_id, display_name, count
        """
        ...
```

注意 `datetime` 在 interface 顶部 import：`from datetime import datetime`。

- [ ] **Step 2: 写失败测试**

在 `backend/tests/storage/test_user_store.py` **末尾**追加（保持现有测试不动）：

```python
from datetime import datetime, timedelta


@pytest.mark.integration
class TestMentorOverviewStorageQueries:
    """导师概览所需的聚合查询。"""

    def test_silent_students_returns_empty_when_all_active(
        self, user_store, conv_store, mentor_with_student
    ):
        mentor_id, student_id = mentor_with_student
        # 创建一条今天的对话
        conv_store.create_conversation(student_id, "kb", title="t")

        silent = user_store.list_silent_students_for_mentor(mentor_id, days_threshold=7)
        assert silent == []

    def test_silent_students_lists_never_active_students(
        self, user_store, mentor_with_student
    ):
        mentor_id, student_id = mentor_with_student
        silent = user_store.list_silent_students_for_mentor(mentor_id, days_threshold=7)
        ids = [s["id"] for s in silent]
        assert student_id in ids

    def test_silent_students_only_lists_own_mentor(
        self, user_store, two_mentors_with_students
    ):
        m1, s1, m2, s2 = two_mentors_with_students
        m1_silent = user_store.list_silent_students_for_mentor(m1, days_threshold=7)
        ids = [s["id"] for s in m1_silent]
        assert s1 in ids and s2 not in ids

    def test_weekly_activity_returns_counts_by_student(
        self, user_store, conv_store, ticket_store, mentor_with_student
    ):
        mentor_id, student_id = mentor_with_student
        # 创建 2 个对话 + 1 个工单（都是今天）
        conv_store.create_conversation(student_id, "kb", title="t1")
        conv_store.create_conversation(student_id, "kb", title="t2")
        ticket_store.create_qa_request(student_id, None, None, "q1")

        since = datetime.now() - timedelta(days=7)
        rows = user_store.list_weekly_activity_for_mentor(mentor_id, since=since)
        target = next((r for r in rows if r["student_id"] == student_id), None)
        assert target is not None
        assert target["count"] == 3

    def test_weekly_activity_excludes_other_mentors_students(
        self, user_store, conv_store, two_mentors_with_students
    ):
        m1, s1, m2, s2 = two_mentors_with_students
        conv_store.create_conversation(s2, "kb", title="t")

        since = datetime.now() - timedelta(days=7)
        rows = user_store.list_weekly_activity_for_mentor(m1, since=since)
        ids = [r["student_id"] for r in rows]
        assert s2 not in ids
```

确保 `conftest.py` 暴露 `conv_store` fixture（若没有，追加 `@pytest.fixture\ndef conv_store(): return ConversationStore()`）。

- [ ] **Step 3: 跑测试看失败**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/storage/test_user_store.py::TestMentorOverviewStorageQueries -v -m integration
```
Expected: `AttributeError: 'UserStore' object has no attribute 'list_silent_students_for_mentor'`

- [ ] **Step 4: 实现两个方法**

在 `backend/src/storage/user_store.py` `class UserStore:` 末尾追加（顶部确保 `from datetime import datetime` 已 import）：

```python
    def list_silent_students_for_mentor(
        self, mentor_id: int, days_threshold: int
    ) -> list[dict]:
        """聚合 conversations.updated_at 和 qa_requests.created_at，
        筛选最近活跃时间早于 NOW() - days_threshold 天的学生。
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                sql = """
                    SELECT
                        u.id,
                        u.username,
                        u.display_name,
                        last_act.last_active_at,
                        CASE
                            WHEN last_act.last_active_at IS NULL THEN 9999
                            ELSE DATEDIFF(NOW(), last_act.last_active_at)
                        END AS days_silent
                    FROM mentor_relations mr
                    JOIN users u ON u.id = mr.student_id
                    LEFT JOIN (
                        SELECT student_id, MAX(act_at) AS last_active_at FROM (
                            SELECT user_id AS student_id, MAX(updated_at) AS act_at
                              FROM conversations GROUP BY user_id
                            UNION ALL
                            SELECT student_id, MAX(created_at) AS act_at
                              FROM qa_requests GROUP BY student_id
                        ) merged GROUP BY student_id
                    ) last_act ON last_act.student_id = u.id
                    WHERE mr.mentor_id = %s
                      AND (last_act.last_active_at IS NULL
                           OR last_act.last_active_at < NOW() - INTERVAL %s DAY)
                    ORDER BY last_act.last_active_at IS NULL DESC, last_act.last_active_at ASC
                """
                cur.execute(sql, (mentor_id, int(days_threshold)))
                return list(cur.fetchall() or [])
        except Exception as e:
            logger.error(
                "[UserStore.list_silent_students_for_mentor] mentor_id=%d error=%s",
                mentor_id, e,
            )
            raise StorageError(f"查询沉默学生失败：{e}") from e
        finally:
            conn.close()

    def list_weekly_activity_for_mentor(
        self, mentor_id: int, since: datetime
    ) -> list[dict]:
        """按学生聚合 since 至今的对话 + 工单总数。"""
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                sql = """
                    SELECT
                        u.id AS student_id,
                        u.display_name,
                        COALESCE(conv.cnt, 0) + COALESCE(tk.cnt, 0) AS count
                    FROM mentor_relations mr
                    JOIN users u ON u.id = mr.student_id
                    LEFT JOIN (
                        SELECT user_id, COUNT(*) AS cnt
                          FROM conversations
                         WHERE updated_at >= %s
                         GROUP BY user_id
                    ) conv ON conv.user_id = u.id
                    LEFT JOIN (
                        SELECT student_id, COUNT(*) AS cnt
                          FROM qa_requests
                         WHERE created_at >= %s
                         GROUP BY student_id
                    ) tk ON tk.student_id = u.id
                    WHERE mr.mentor_id = %s
                    ORDER BY count DESC, u.display_name ASC
                """
                cur.execute(sql, (since, since, mentor_id))
                return list(cur.fetchall() or [])
        except Exception as e:
            logger.error(
                "[UserStore.list_weekly_activity_for_mentor] mentor_id=%d error=%s",
                mentor_id, e,
            )
            raise StorageError(f"查询周活跃失败：{e}") from e
        finally:
            conn.close()
```

- [ ] **Step 5: 跑测试看通过**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/storage/test_user_store.py::TestMentorOverviewStorageQueries -v -m integration
```
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add backend/src/storage/interfaces/user_store.py \
        backend/src/storage/user_store.py \
        backend/tests/storage/test_user_store.py \
        backend/tests/storage/conftest.py
git commit -m "feat(storage): add mentor-scoped user aggregations

- list_silent_students_for_mentor: 沉默学生筛选
- list_weekly_activity_for_mentor: 周活跃聚合（conversations + tickets）"
```

---

## Task 4: 后端新增 `api/schemas/mentor.py`

**Files:**
- Create: `backend/src/api/schemas/mentor.py`
- Modify: `backend/src/api/schemas/__init__.py`

- [ ] **Step 1: 新建 schema 文件**

```python
# backend/src/api/schemas/mentor.py
"""导师工作台响应模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


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
    event_type: Literal["ticket_created", "ticket_replied", "ticket_closed"]
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

- [ ] **Step 2: 在 `schemas/__init__.py` re-export**

打开 `backend/src/api/schemas/__init__.py`，按现有风格追加：

```python
from .mentor import (
    MentorOverviewResponse,
    MentorRecentEventItem,
    SilentStudentItem,
    WeeklyActivityBucket,
)
```

- [ ] **Step 3: 验证 import**

```bash
cd backend
PATH="$(pwd)/.venv/bin:$PATH" python -c "from src.api.schemas import MentorOverviewResponse; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/schemas/mentor.py backend/src/api/schemas/__init__.py
git commit -m "feat(api): add mentor overview Pydantic schemas"
```

---

## Task 5: 后端 `MentorService` 实现 + 单测

**Files:**
- Create: `backend/src/services/mentor_service.py`
- Test: `backend/tests/services/test_mentor_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/services/test_mentor_service.py
"""MentorService 单测：mock 各 store，测业务编排与越权。"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest

from src.exceptions import PermissionDeniedError
from src.services.mentor_service import MentorService


@pytest.fixture
def mocks():
    return {
        "user": MagicMock(),
        "ticket": MagicMock(),
    }


@pytest.fixture
def svc(mocks):
    return MentorService(
        user_store=mocks["user"],
        ticket_store=mocks["ticket"],
    )


class TestGetOverview:
    def test_composes_all_fields(self, svc, mocks):
        mocks["ticket"].count_pending_by_mentor.return_value = 3
        mocks["user"].list_weekly_activity_for_mentor.return_value = [
            {"student_id": 10, "display_name": "S1", "count": 5},
        ]
        mocks["user"].list_silent_students_for_mentor.return_value = [
            {
                "id": 11,
                "display_name": "S2",
                "username": "s2",
                "last_active_at": None,
                "days_silent": 9999,
            },
        ]
        mocks["ticket"].list_recent_events_by_mentor.return_value = [
            {
                "event_type": "ticket_created",
                "student_id": 10,
                "student_name": "S1",
                "ticket_id": 1,
                "ticket_title": "Hello",
                "occurred_at": datetime(2026, 6, 4, 10, 0),
            },
        ]

        result = svc.get_overview(mentor_id=99)

        assert result["pending_tickets"] == 3
        assert len(result["weekly_activity"]) == 1
        assert len(result["silent_students"]) == 1
        assert len(result["recent_events"]) == 1

    def test_uses_constants(self, svc, mocks):
        mocks["ticket"].count_pending_by_mentor.return_value = 0
        mocks["user"].list_weekly_activity_for_mentor.return_value = []
        mocks["user"].list_silent_students_for_mentor.return_value = []
        mocks["ticket"].list_recent_events_by_mentor.return_value = []

        svc.get_overview(mentor_id=1)

        # silent students 用 SILENT_DAYS_THRESHOLD
        mocks["user"].list_silent_students_for_mentor.assert_called_once_with(
            1, days_threshold=MentorService.SILENT_DAYS_THRESHOLD
        )
        # recent events 用 RECENT_EVENTS_LIMIT
        mocks["ticket"].list_recent_events_by_mentor.assert_called_once_with(
            1, limit=MentorService.RECENT_EVENTS_LIMIT
        )

    def test_empty_when_no_data(self, svc, mocks):
        mocks["ticket"].count_pending_by_mentor.return_value = 0
        mocks["user"].list_weekly_activity_for_mentor.return_value = []
        mocks["user"].list_silent_students_for_mentor.return_value = []
        mocks["ticket"].list_recent_events_by_mentor.return_value = []

        result = svc.get_overview(mentor_id=1)
        assert result == {
            "pending_tickets": 0,
            "weekly_activity": [],
            "silent_students": [],
            "recent_events": [],
        }


class TestListMyStudents:
    def test_delegates_to_user_store(self, svc, mocks):
        mocks["user"].list_mentor_students.return_value = [{"id": 1}, {"id": 2}]
        result = svc.list_my_students(mentor_id=99)
        mocks["user"].list_mentor_students.assert_called_once_with(99)
        assert result == [{"id": 1}, {"id": 2}]


class TestEnsureOwnsStudent:
    def test_raises_when_student_belongs_to_other_mentor(self, svc, mocks):
        mocks["user"].get_student_mentor.return_value = {"id": 999}
        with pytest.raises(PermissionDeniedError):
            svc.ensure_owns_student(mentor_id=1, student_id=42)

    def test_passes_when_student_is_owned(self, svc, mocks):
        mocks["user"].get_student_mentor.return_value = {"id": 7}
        svc.ensure_owns_student(mentor_id=7, student_id=42)  # 不抛

    def test_raises_when_student_has_no_mentor(self, svc, mocks):
        mocks["user"].get_student_mentor.return_value = None
        with pytest.raises(PermissionDeniedError):
            svc.ensure_owns_student(mentor_id=1, student_id=42)
```

- [ ] **Step 2: 跑测试看失败**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/services/test_mentor_service.py -v
```
Expected: `ModuleNotFoundError: No module named 'src.services.mentor_service'`

- [ ] **Step 3: 实现 `MentorService`**

```python
# backend/src/services/mentor_service.py
"""导师工作台业务编排。

仅服务于 teacher 角色，按 mentor 关系收紧数据视野。
不抛 HTTPException，统一抛 AppException 子类。
"""

from datetime import datetime, timedelta

from src.exceptions import PermissionDeniedError
from src.services.base import BaseService
from src.storage.interfaces.ticket_store import BaseTicketStore
from src.storage.interfaces.user_store import BaseUserStore


class MentorService(BaseService):
    """导师工作台 service。"""

    SILENT_DAYS_THRESHOLD: int = 7
    RECENT_EVENTS_LIMIT: int = 20

    def __init__(
        self,
        user_store: BaseUserStore,
        ticket_store: BaseTicketStore,
    ):
        super().__init__()
        self._user_store = user_store
        self._ticket_store = ticket_store

    def get_overview(self, mentor_id: int) -> dict:
        """聚合导师首页所需的四块数据。"""
        since = datetime.now() - timedelta(days=7)
        return {
            "pending_tickets": self._ticket_store.count_pending_by_mentor(mentor_id),
            "weekly_activity": self._user_store.list_weekly_activity_for_mentor(
                mentor_id, since=since
            ),
            "silent_students": self._user_store.list_silent_students_for_mentor(
                mentor_id, days_threshold=self.SILENT_DAYS_THRESHOLD
            ),
            "recent_events": self._ticket_store.list_recent_events_by_mentor(
                mentor_id, limit=self.RECENT_EVENTS_LIMIT
            ),
        }

    def list_my_students(self, mentor_id: int) -> list[dict]:
        """返回当前 mentor 名下的学生列表。"""
        return self._user_store.list_mentor_students(mentor_id)

    def ensure_owns_student(self, mentor_id: int, student_id: int) -> None:
        """校验 student 属于 mentor，否则抛 PermissionDeniedError。"""
        owner = self._user_store.get_student_mentor(student_id)
        if not owner or owner.get("id") != mentor_id:
            raise PermissionDeniedError(
                f"学生 {student_id} 不属于当前导师"
            )
```

- [ ] **Step 4: 跑测试看通过**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/services/test_mentor_service.py -v
```
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mentor_service.py backend/tests/services/test_mentor_service.py
git commit -m "feat(services): add MentorService — overview + students + ownership guard"
```

---

## Task 6: 后端 `TicketService.list_tickets` 接受 `student_id` 过滤（带越权校验）

**Files:**
- Modify: `backend/src/services/ticket_service.py`
- Test: `backend/tests/services/test_ticket_service.py`

- [ ] **Step 1: 看现有签名**

```bash
grep -n "def list_tickets\|def list_qa_requests" backend/src/services/ticket_service.py
```

记下当前签名（应为 `list_tickets(role, user_id, page, page_size)`，内部分支调 `ticket_store.list_qa_requests(...)`）。

- [ ] **Step 2: 写失败测试**

在 `backend/tests/services/test_ticket_service.py` **末尾**追加：

```python
class TestListTicketsByStudent:
    def test_teacher_can_filter_by_own_student(self, ticket_service, mocks):
        # 学生属于该 mentor
        mocks["user"].get_student_mentor.return_value = {"id": 99}
        mocks["ticket"].list_qa_requests.return_value = ([], 0)

        ticket_service.list_tickets(
            role="teacher", user_id=99, page=1, page_size=20, student_id=42
        )

        mocks["ticket"].list_qa_requests.assert_called_once_with(
            mentor_id=99, student_id=42, page=1, page_size=20
        )

    def test_teacher_cannot_filter_by_other_mentors_student(self, ticket_service, mocks):
        mocks["user"].get_student_mentor.return_value = {"id": 888}
        with pytest.raises(PermissionDeniedError):
            ticket_service.list_tickets(
                role="teacher", user_id=99, page=1, page_size=20, student_id=42
            )

    def test_admin_can_filter_any_student(self, ticket_service, mocks):
        mocks["ticket"].list_qa_requests.return_value = ([], 0)
        ticket_service.list_tickets(
            role="admin", user_id=1, page=1, page_size=20, student_id=42
        )
        # admin 不走 mentor_id 过滤，但 student_id 透传
        call = mocks["ticket"].list_qa_requests.call_args
        assert call.kwargs.get("student_id") == 42
```

确认文件顶部 `from src.exceptions import PermissionDeniedError` 已存在或追加。

- [ ] **Step 3: 跑测试看失败**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/services/test_ticket_service.py::TestListTicketsByStudent -v
```
Expected: `TypeError: list_tickets() got an unexpected keyword argument 'student_id'`

- [ ] **Step 4: 修改 service**

打开 `backend/src/services/ticket_service.py`，找到 `list_tickets`（或对应方法），将签名扩为：

```python
def list_tickets(
    self,
    role: str,
    user_id: int,
    page: int,
    page_size: int,
    student_id: int | None = None,
) -> tuple[list[dict], int]:
    """获取工单列表。

    student_id 是可选过滤——teacher 调用时校验该学生归属。
    """
    if student_id is not None and role == "teacher":
        owner = self._user_store.get_student_mentor(student_id)
        if not owner or owner.get("id") != user_id:
            raise PermissionDeniedError(f"学生 {student_id} 不属于当前导师")

    if role == "student":
        # 学生只看自己
        return self._ticket_store.list_qa_requests(
            student_id=user_id, page=page, page_size=page_size
        )
    if role == "teacher":
        return self._ticket_store.list_qa_requests(
            mentor_id=user_id, student_id=student_id, page=page, page_size=page_size
        )
    # admin
    return self._ticket_store.list_qa_requests(
        student_id=student_id, page=page, page_size=page_size
    )
```

如现有 `list_tickets` 内部已经按 role 分支了，**保持原分支不动，仅追加 student_id 参数 + 越权校验 + 透传到底层调用**。

确保顶部 `from src.exceptions import PermissionDeniedError` 存在。

- [ ] **Step 5: 跑测试看通过**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/services/test_ticket_service.py -v
```
Expected: 既有用例 + 新用例全 pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ticket_service.py backend/tests/services/test_ticket_service.py
git commit -m "feat(services): TicketService.list_tickets accepts student_id with ownership check"
```

---

## Task 7: 后端 `routes/ticket.py` `GET /` 接受 `student_id` query

**Files:**
- Modify: `backend/src/api/routes/ticket.py:39-48`

- [ ] **Step 1: 修改路由签名**

把现有 `list_tickets` 路由改为：

```python
@router.get("", response_model=PaginatedTickets)
async def list_tickets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    student_id: int | None = Query(default=None, description="按学生过滤；teacher 仅可过滤自己的学生"),
    current_user: dict = Depends(get_current_user),
    svc: TicketService = Depends(get_ticket_service),
):
    """获取答疑请求列表。学生看自己的，教师看分配给自己的（可按 student_id 过滤）。"""
    try:
        items, total = await asyncio.to_thread(
            svc.list_tickets,
            current_user["role"], current_user["id"],
            page, page_size, student_id,
        )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    return {"items": items, "total": total, "page": page, "page_size": page_size}
```

- [ ] **Step 2: 手测确认**

```bash
# 启动 backend
cd backend && PATH="$(pwd)/.venv/bin:$PATH" poetry run dev &
# 拿一个 teacher token（用现有测试账号，或临时 SQL）
# 调用
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/tickets?student_id=999"
# Expected: 403 if student_id is not under this mentor; 200 if owned
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/ticket.py
git commit -m "feat(api): tickets list accepts optional student_id filter"
```

---

## Task 8: 后端新增 `routes/mentor.py` + 注册

**Files:**
- Create: `backend/src/api/routes/mentor.py`
- Modify: `backend/src/api/deps.py`
- Modify: `backend/src/api/app.py`
- Test: `backend/tests/api/test_mentor_routes.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/api/test_mentor_routes.py
"""mentor routes 集成测：用 dependency_overrides 替换 service。"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.api.auth import get_current_user
from src.api.deps import get_mentor_service


@pytest.fixture
def teacher_user():
    return {"id": 99, "role": "teacher", "is_active": True, "username": "t", "display_name": "T"}


@pytest.fixture
def admin_user():
    return {"id": 1, "role": "admin", "is_active": True, "username": "a", "display_name": "A"}


@pytest.fixture
def mock_svc():
    svc = MagicMock()
    svc.get_overview.return_value = {
        "pending_tickets": 3,
        "weekly_activity": [],
        "silent_students": [],
        "recent_events": [],
    }
    svc.list_my_students.return_value = []
    return svc


@pytest.fixture
def client(teacher_user, mock_svc):
    app.dependency_overrides[get_current_user] = lambda: teacher_user
    app.dependency_overrides[get_mentor_service] = lambda: mock_svc
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_overview_returns_200_for_teacher(client, mock_svc):
    r = client.get("/api/mentors/me/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["pending_tickets"] == 3
    mock_svc.get_overview.assert_called_once_with(99)


def test_overview_returns_403_for_admin(admin_user, mock_svc):
    app.dependency_overrides[get_current_user] = lambda: admin_user
    app.dependency_overrides[get_mentor_service] = lambda: mock_svc
    c = TestClient(app)
    r = c.get("/api/mentors/me/overview")
    assert r.status_code == 403
    app.dependency_overrides.clear()


def test_students_returns_200_for_teacher(client, mock_svc):
    mock_svc.list_my_students.return_value = [
        {
            "id": 10, "username": "s1", "display_name": "S1", "role": "student",
            "is_active": True,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "profile": None,
        }
    ]
    r = client.get("/api/mentors/me/students")
    assert r.status_code == 200
    assert len(r.json()) == 1
    mock_svc.list_my_students.assert_called_once_with(99)
```

- [ ] **Step 2: 跑测试看失败**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/api/test_mentor_routes.py -v
```
Expected: `ImportError: cannot import name 'get_mentor_service'`

- [ ] **Step 3: 在 deps.py 注册 service**

在 `backend/src/api/deps.py` `# ── Service 工厂 ──` 区块末尾追加：

```python
from src.services.mentor_service import MentorService


def get_mentor_service(
    user_store: UserStore = Depends(get_user_store),
    ticket_store: TicketStore = Depends(get_ticket_store),
) -> MentorService:
    return MentorService(user_store=user_store, ticket_store=ticket_store)
```

（注意 `from src.services.mentor_service import MentorService` 应放到文件顶部 import 区，与其它 service import 同位置；这里展示为追加示意。）

- [ ] **Step 4: 写 `routes/mentor.py`**

```python
# backend/src/api/routes/mentor.py
"""导师工作台路由 — 仅 teacher 角色可访问。"""

import asyncio
import logging

from fastapi import APIRouter, Depends

from src.api.auth import require_teacher
from src.api.deps import get_mentor_service
from src.api.schemas import MentorOverviewResponse, UserInfo
from src.services.mentor_service import MentorService

router = APIRouter(prefix="/api/mentors", tags=["mentor"])
logger = logging.getLogger(__name__)


@router.get("/me/overview", response_model=MentorOverviewResponse)
async def get_my_overview(
    current_user: dict = Depends(require_teacher),
    svc: MentorService = Depends(get_mentor_service),
):
    """导师首页聚合接口。"""
    return await asyncio.to_thread(svc.get_overview, current_user["id"])


@router.get("/me/students", response_model=list[UserInfo])
async def list_my_students(
    current_user: dict = Depends(require_teacher),
    svc: MentorService = Depends(get_mentor_service),
):
    """当前导师名下的学生列表。"""
    return await asyncio.to_thread(svc.list_my_students, current_user["id"])
```

- [ ] **Step 5: 在 `app.py` 注册路由**

打开 `backend/src/api/app.py`，找到 `# API 路由` 区块。

在 `from src.api.routes.user import router as user_router` 同位置追加 import：

```python
from src.api.routes.mentor import router as mentor_router
```

在 `app.include_router(user_router)` 后插入：

```python
app.include_router(mentor_router)
```

- [ ] **Step 6: 跑测试看通过**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/api/test_mentor_routes.py -v
```
Expected: 3 passed

- [ ] **Step 7: Commit**

```bash
git add backend/src/api/routes/mentor.py backend/src/api/deps.py \
        backend/src/api/app.py backend/tests/api/test_mentor_routes.py
git commit -m "feat(api): add /api/mentors/me/* routes (overview, students)"
```

---

## Task 9: 后端新增 `PUT /api/auth/me` 编辑个人资料

**Files:**
- Modify: `backend/src/api/schemas/auth.py`（或同位置的 user schema）
- Modify: `backend/src/api/routes/auth.py`
- Modify: `backend/src/services/user_service/service.py` 或新文件
- Modify: `backend/src/storage/interfaces/user_store.py` + `user_store.py`
- Test: 集成测 + 单测

- [ ] **Step 1: 在 schemas/auth.py 加 request 模型**

```python
# 追加到 backend/src/api/schemas/auth.py
from pydantic import EmailStr  # 若未 import


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
```

如果项目暂不需要 `EmailStr` 校验，改用 `str | None = Field(default=None, max_length=128)`。

在 `schemas/__init__.py` re-export：

```python
from .auth import LoginRequest, TokenResponse, UpdateMeRequest  # 按现有风格追加
```

- [ ] **Step 2: 在 `BaseUserStore` 加 `update_self_profile` 方法**

`backend/src/storage/interfaces/user_store.py` 追加：

```python
    def update_self_profile(
        self, user_id: int, display_name: str | None, email: str | None
    ) -> dict | None:
        """仅更新自己可改的字段（display_name / email），其他字段不动。

        Returns:
            更新后的 user dict；用户不存在返回 None。
        """
        ...
```

注：若 `users` 表当前没有 `email` 列，先用 `grep -n email backend/sql/init.sql backend/src/storage/user_store.py` 确认。**若无，则简化本任务：只更新 display_name**，并标注"email 字段后续单独迁移"。

- [ ] **Step 3: 实现 storage 方法**

`backend/src/storage/user_store.py` `class UserStore:` 末尾追加：

```python
    def update_self_profile(
        self, user_id: int, display_name: str | None, email: str | None
    ) -> dict | None:
        """部分字段更新（只更新非 None 字段）。"""
        updates: dict[str, object] = {}
        if display_name is not None:
            updates["display_name"] = display_name
        if email is not None:
            updates["email"] = email   # 若无 email 列，删除本行
        if not updates:
            return self.get_user_by_id(user_id)

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [user_id]

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
                conn.commit()
            return self.get_user_by_id(user_id)
        except Exception as e:
            logger.error("[UserStore.update_self_profile] user_id=%d error=%s", user_id, e)
            raise StorageError(f"更新用户资料失败：{e}") from e
        finally:
            conn.close()
```

- [ ] **Step 4: 在 `user_service` 加 `update_self_profile` 方法**

`backend/src/services/user_service/service.py`（或对应 Mixin）追加：

```python
    def update_self_profile(
        self, user_id: int, display_name: str | None, email: str | None
    ) -> dict:
        """更新登录用户自己的资料（display_name / email）。"""
        user = self._user_store.update_self_profile(user_id, display_name, email)
        if not user:
            raise UserNotFoundError(f"用户 {user_id} 不存在")
        return user
```

确保顶部 `from src.exceptions import UserNotFoundError` 已 import。

- [ ] **Step 5: 加路由**

`backend/src/api/routes/auth.py` 在 `@router.put("/me/password", ...)` **之前**插入：

```python
from src.api.schemas import UpdateMeRequest, UserInfo  # 按现有风格扩 import


@router.put("/me", response_model=UserInfo)
def update_me(
    body: UpdateMeRequest,
    current_user: dict = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
):
    """登录用户更新自己的 display_name / email。其他字段由 admin 在用户管理修改。"""
    return svc.update_self_profile(current_user["id"], body.display_name, body.email)
```

确保顶部 `from src.api.deps import get_user_service` 与 `from src.services.user_service import UserService` 已 import。

- [ ] **Step 6: 写集成测试**

`backend/tests/api/test_auth_routes.py`（如不存在则新建）追加：

```python
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.api.auth import get_current_user
from src.api.deps import get_user_service


def test_put_me_updates_display_name():
    user = {"id": 5, "role": "teacher", "is_active": True, "username": "t", "display_name": "Old"}
    svc = MagicMock()
    svc.update_self_profile.return_value = {
        "id": 5, "username": "t", "display_name": "New", "role": "teacher",
        "is_active": True,
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
        "profile": None,
    }
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_user_service] = lambda: svc
    try:
        c = TestClient(app)
        r = c.put("/api/auth/me", json={"display_name": "New"})
        assert r.status_code == 200
        assert r.json()["display_name"] == "New"
        svc.update_self_profile.assert_called_once_with(5, "New", None)
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 7: 跑测试**

```bash
PATH="$(pwd)/.venv/bin:$PATH" pytest tests/api/test_auth_routes.py -v
```
Expected: pass

- [ ] **Step 8: Commit**

```bash
git add backend/src/api/schemas/auth.py backend/src/api/schemas/__init__.py \
        backend/src/storage/interfaces/user_store.py backend/src/storage/user_store.py \
        backend/src/services/user_service/service.py \
        backend/src/api/routes/auth.py \
        backend/tests/api/test_auth_routes.py
git commit -m "feat(auth): add PUT /api/auth/me for self profile update"
```

---

## Task 10: 前端 `Portal` 类型扩三态 + `getCurrentPortal` 识别 `/teacher`

**Files:**
- Modify: `frontend/src/shared/lib/auth.ts`
- Modify: `frontend/src/shared/components/auth/RouteGuard.tsx`

- [ ] **Step 1: 改 `shared/lib/auth.ts`**

把 `Portal` 类型与 `getCurrentPortal` 改为：

```ts
export type Portal = 'admin' | 'teacher' | 'student';

export function getCurrentPortal(): Portal {
  const p = window.location.pathname;
  if (p.startsWith('/student')) return 'student';
  if (p.startsWith('/teacher')) return 'teacher';
  return 'admin';
}
```

其余 `keyOf` / `getAccessToken` 等不用改动（已经按 portal 参数动态拼 key，三端天然隔离）。

- [ ] **Step 2: 改 `RouteGuard.tsx`**

把两处 `loginPath` 推断改为：

```tsx
function loginPathFor(pathname: string): string {
  if (pathname.startsWith('/student')) return '/student/login';
  if (pathname.startsWith('/teacher')) return '/teacher/login';
  return '/admin/login';
}
```

并在 `if (!user)` 与角色不匹配两处都用 `loginPathFor(pathname)`。

- [ ] **Step 3: 类型检查 + lint**

```bash
cd frontend
npm run lint
```
Expected: 无新报错（旧报错保持原样）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/lib/auth.ts frontend/src/shared/components/auth/RouteGuard.tsx
git commit -m "feat(auth): extend Portal type to include teacher; RouteGuard handles /teacher prefix"
```

---

## Task 11: 前端 `shared/types/api.ts` 加导师相关类型 + `shared/lib/api.ts` 加 `mentorApi`

**Files:**
- Modify: `frontend/src/shared/types/api.ts`
- Modify: `frontend/src/shared/lib/api.ts`

- [ ] **Step 1: 加类型**

在 `frontend/src/shared/types/api.ts` **末尾**追加：

```ts
// ── 导师工作台 ─────────────────────────────────────────────

export interface WeeklyActivityBucket {
  student_id: number;
  display_name: string;
  count: number;
}

export interface SilentStudent {
  id: number;
  display_name: string;
  username: string;
  last_active_at: string | null;
  days_silent: number;
}

export type MentorEventType = 'ticket_created' | 'ticket_replied' | 'ticket_closed';

export interface MentorRecentEvent {
  event_type: MentorEventType;
  student_id: number;
  student_name: string;
  ticket_id: number;
  ticket_title: string;
  occurred_at: string;
}

export interface MentorOverview {
  pending_tickets: number;
  weekly_activity: WeeklyActivityBucket[];
  silent_students: SilentStudent[];
  recent_events: MentorRecentEvent[];
}

export interface UpdateMeRequest {
  display_name?: string;
  email?: string;
}
```

- [ ] **Step 2: 加 `mentorApi` 模块**

在 `frontend/src/shared/lib/api.ts` 中现有 `ticketApi` 之后追加（保持文件按业务域分组的风格）：

```ts
// ── 导师工作台 API ─────────────────────────────────────────

export const mentorApi = {
  getMyOverview: () => client.get<MentorOverview>('/mentors/me/overview').then((r) => r.data),
  getMyStudents: () => client.get<UserInfo[]>('/mentors/me/students').then((r) => r.data),
};
```

确保文件顶部 `import type { ... MentorOverview, UserInfo } from '@shared/types/api';` 把 `MentorOverview` 加进去。

- [ ] **Step 3: 扩 `ticketApi.list` 接受 `studentId`**

把 `ticketApi.list` 改为：

```ts
list: (page = 1, pageSize = 20, studentId?: number) =>
  client
    .get<PaginatedTickets>('/tickets', {
      params: {
        page,
        page_size: pageSize,
        ...(studentId !== undefined ? { student_id: studentId } : {}),
      },
    })
    .then((r) => r.data),
```

- [ ] **Step 4: 扩 `authApi.updateMe`**

在 `authApi` 对象内（`changePassword` 旁边）追加：

```ts
updateMe: (body: UpdateMeRequest) =>
  client.put<UserInfo>('/auth/me', body).then((r) => r.data),
```

顶部 `import type { ... UpdateMeRequest } from '@shared/types/api';` 加上。

- [ ] **Step 5: lint + 类型检查**

```bash
cd frontend
npm run lint
```
Expected: 无新报错

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/types/api.ts frontend/src/shared/lib/api.ts
git commit -m "feat(api): add mentorApi + tickets.list studentId + authApi.updateMe"
```

---

## Task 12: 前端 `TeacherLayout` + `TeacherSidebar`

**Files:**
- Create: `frontend/src/shared/components/layout/TeacherLayout.tsx`
- Create: `frontend/src/shared/components/layout/TeacherSidebar.tsx`

- [ ] **Step 1: 写 TeacherLayout**

```tsx
// frontend/src/shared/components/layout/TeacherLayout.tsx
import { Outlet } from 'react-router-dom';
import TeacherSidebar from '@shared/components/layout/TeacherSidebar';
import BlobBackdrop from '@shared/components/layout/BlobBackdrop';

export default function TeacherLayout() {
  return (
    <div
      data-theme="teacher"
      className="relative flex h-screen w-full p-3 gap-3 overflow-hidden"
      style={{ background: 'hsl(150 18% 93%)' }}
    >
      <BlobBackdrop variant="cool" />
      <div className="relative z-10 flex w-full h-full gap-3">
        <TeacherSidebar />
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

> **关于 `<BlobBackdrop variant="cool" />`**：现有 BlobBackdrop 只有 `'warm' | 'cool'` 两个 variant；teacher 沿用 cool，视觉上能与 admin 暖色拉开。如想加 `'teal'` variant 再独立小 PR 做，本任务保持最小变更。

- [ ] **Step 2: 写 TeacherSidebar**

```tsx
// frontend/src/shared/components/layout/TeacherSidebar.tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Users, Ticket, User, LogOut } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useAuthUser, useAuthLogout } from '@shared/store/authStore';

const TEACHER_NAV = [
  { to: '/teacher', label: '首页', icon: Home, end: true },
  { to: '/teacher/students', label: '我的学生', icon: Users },
  { to: '/teacher/tickets', label: '答疑请求', icon: Ticket },
  { to: '/teacher/profile', label: '个人中心', icon: User },
];

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm',
          isActive
            ? 'bg-[#0F766E] text-white shadow-md'
            : 'text-[#5F6E68] hover:bg-white/50 hover:text-[#0F766E] active:scale-[0.97]',
        )
      }
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export default function TeacherSidebar() {
  const user = useAuthUser();
  const logout = useAuthLogout();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/teacher/login', { replace: true });
  };

  const displayName = user?.display_name || user?.username || '导师';
  const avatarChar = displayName.slice(0, 1).toUpperCase();

  return (
    <aside className="glass-soft w-48 shrink-0 flex flex-col rounded-2xl border-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="w-9 h-9 bg-[#0F766E] rounded-xl flex items-center justify-center shadow-md shrink-0">
          <span className="text-white text-xs font-bold tracking-tight">R</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-[#1F2937] tracking-tight">RAG 1.0</span>
          <span className="text-[10px] text-[#6F7A75]">导师工作台</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col px-2 py-4 gap-1">
        {TEACHER_NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* User info + logout */}
      <div className="flex flex-col px-2 pb-5 gap-1">
        <div className="mx-2 mb-2 h-px bg-white/40" />
        <div className="flex items-center gap-2 px-3 py-2 mt-1 bg-white/30 rounded-xl mx-1">
          <div className="w-7 h-7 rounded-full bg-[#0F766E] flex items-center justify-center text-[11px] font-semibold text-white select-none shrink-0 shadow-sm">
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#1F2937] font-semibold truncate leading-tight">
              {displayName}
            </div>
            <div className="text-[9px] text-[#6F7A75]">导师</div>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="shrink-0 text-[#6F7A75] hover:text-[#1F2937] transition-colors"
          >
            <LogOut size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: lint**

```bash
npm run lint
```
Expected: 无新报错

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/components/layout/TeacherLayout.tsx \
        frontend/src/shared/components/layout/TeacherSidebar.tsx
git commit -m "feat(layout): add TeacherLayout + TeacherSidebar (teal theme)"
```

---

## Task 13: 前端 `LoginForm` 新增 teacher variant

**Files:**
- Modify: `frontend/src/features/auth/components/LoginForm.tsx`
- Modify: `frontend/src/pages/admin/LoginPage.tsx`
- Modify: `frontend/src/features/auth/hooks/useLogin.ts`（如 `Portal` 类型限制）

- [ ] **Step 1: 改 prop 类型**

打开 `LoginForm.tsx`，把 `LoginFormProps` 改为：

```ts
interface LoginFormProps {
  variant: 'admin' | 'teacher' | 'student';
}
```

把 `portal: Portal = variant === 'student' ? 'student' : 'admin';` 改为：

```ts
const portal: Portal = variant === 'student' ? 'student' : variant === 'teacher' ? 'teacher' : 'admin';
```

把 `useEffect` 内的角色匹配 / 跳转分支扩到三态：

```ts
useEffect(() => {
  if (!user) return;
  if (variant === 'student' && user.role === 'student') {
    navigate('/student', { replace: true });
  } else if (variant === 'teacher' && user.role === 'teacher') {
    navigate('/teacher', { replace: true });
  } else if (variant === 'admin' && user.role === 'admin') {
    navigate('/admin', { replace: true });
  } else {
    // 角色与登录页不匹配，清除旧会话
    logout();
  }
}, [user, variant, navigate, logout]);
```

> **行为变化**：admin variant 之前接受 `admin | teacher`，现在只接受 `admin`。teacher 登录走自己的 `/teacher/login`。

- [ ] **Step 2: 加 teacher 渲染分支**

在 `if (isStudent)` 渲染块之**前**追加 teacher 分支（与 admin 分支并列）：

```tsx
if (variant === 'teacher') {
  return (
    <div
      data-theme="teacher"
      className="relative flex-1 flex items-center justify-center p-4 flex-col gap-6 overflow-hidden"
      style={{ background: 'hsl(150 18% 93%)' }}
    >
      <BlobBackdrop variant="cool" intensity="hero" />
      <div className="glass-card relative z-10 w-full max-w-sm rounded-2xl p-8" style={settle(0)}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#0F766E] rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white text-sm font-bold tracking-tight">R</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1F2937] tracking-tight">RAG 1.0</div>
            <div className="text-xs text-[#6F7A75]">导师工作台</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-[#1F2937] mb-6">你好，老师</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#4A5568] font-medium">工号</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入工号"
              autoComplete="username"
              className="px-3 py-2.5 rounded-xl border border-[#D5DDD9] bg-[#F8FAF9] text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 focus:bg-white transition"
              disabled={mutation.isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#4A5568] font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              className="px-3 py-2.5 rounded-xl border border-[#D5DDD9] bg-[#F8FAF9] text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 focus:bg-white transition"
              disabled={mutation.isPending}
            />
          </div>

          {errorMessage && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !username.trim() || !password.trim()}
            className="mt-2 w-full py-2.5 bg-[#0F766E] text-white text-sm font-medium rounded-xl hover:bg-[#0E6B61] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? '登录中...' : '登录'}
          </button>
        </form>
      </div>

      <div className="relative z-10 flex gap-4 text-xs text-[#6F7A75]" style={settle(150)}>
        <Link to="/admin/login" className="hover:text-[#0F766E] transition-colors">管理员登录 →</Link>
        <Link to="/student/login" className="hover:text-[#0F766E] transition-colors">学生登录 →</Link>
      </div>
    </div>
  );
}
```

并把现有 admin 分支底部的"学生登录 →"链接同样改为两个并列链接（admin 同时指向 teacher / student 登录）：

```tsx
<div className="relative z-10 flex gap-4 text-xs text-[#9A9A9A]" style={settle(150)}>
  <Link to="/teacher/login" className="hover:text-[#334155] transition-colors">教师登录 →</Link>
  <Link to="/student/login" className="hover:text-[#334155] transition-colors">学生登录 →</Link>
</div>
```

student 分支底部链接类似（指向 admin + teacher）。

- [ ] **Step 3: 改 `LoginPage.tsx` 的 variant 类型**

```tsx
// frontend/src/pages/admin/LoginPage.tsx
import { LoginForm } from '@features/auth';

export default function LoginPage({ variant = 'admin' }: { variant?: 'admin' | 'teacher' | 'student' }) {
  return <LoginForm variant={variant} />;
}
```

- [ ] **Step 4: 检查 `useLogin` 是否接受 portal 三态**

```bash
grep -n "Portal\|'admin' \| 'student'" frontend/src/features/auth/hooks/useLogin.ts
```
如有硬编码二态联合，扩到三态。

- [ ] **Step 5: lint**

```bash
npm run lint
```
Expected: 无新报错

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth/components/LoginForm.tsx \
        frontend/src/pages/admin/LoginPage.tsx \
        frontend/src/features/auth/hooks/useLogin.ts
git commit -m "feat(auth): LoginForm supports teacher variant (teal)"
```

---

## Task 14: 前端 `features/mentor/` services + queryKeys + hooks 骨架

**Files:**
- Create: `frontend/src/features/mentor/services/mentorService.ts`
- Create: `frontend/src/features/mentor/hooks/queryKeys.ts`
- Create: `frontend/src/features/mentor/hooks/useMyOverview.ts`
- Create: `frontend/src/features/mentor/hooks/useMyStudents.ts`
- Create: `frontend/src/features/mentor/hooks/useStudentDetail.ts`
- Create: `frontend/src/features/mentor/hooks/useUpdateProfile.ts`
- Create: `frontend/src/features/mentor/types.ts`

- [ ] **Step 1: 写 service**

```ts
// frontend/src/features/mentor/services/mentorService.ts
import { mentorApi, userApi, authApi } from '@shared/lib/api';
import type { UpdateMeRequest } from '@shared/types/api';

export const mentorService = {
  getOverview: () => mentorApi.getMyOverview(),
  listMyStudents: () => mentorApi.getMyStudents(),
  getStudent: (id: number) => userApi.get(id),
  updateMe: (body: UpdateMeRequest) => authApi.updateMe(body),
  changePassword: (oldPassword: string, newPassword: string) =>
    authApi.changePassword(oldPassword, newPassword),
};
```

- [ ] **Step 2: 写 queryKeys**

```ts
// frontend/src/features/mentor/hooks/queryKeys.ts
export const mentorKeys = {
  all: () => ['mentor'] as const,
  overview: () => ['mentor', 'overview'] as const,
  students: () => ['mentor', 'students'] as const,
  student: (id: number) => ['mentor', 'student', id] as const,
};
```

- [ ] **Step 3: 写 hooks**

```ts
// frontend/src/features/mentor/hooks/useMyOverview.ts
import { useQuery } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { mentorKeys } from './queryKeys';

export function useMyOverview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: mentorKeys.overview(),
    queryFn: mentorService.getOverview,
  });
  return {
    overview: data,
    isLoading,
    isError,
    refetch,
  };
}
```

```ts
// frontend/src/features/mentor/hooks/useMyStudents.ts
import { useQuery } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { mentorKeys } from './queryKeys';

export function useMyStudents() {
  const { data, isLoading } = useQuery({
    queryKey: mentorKeys.students(),
    queryFn: mentorService.listMyStudents,
  });
  return {
    students: data ?? [],
    isLoading,
  };
}
```

```ts
// frontend/src/features/mentor/hooks/useStudentDetail.ts
import { useQuery } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { mentorKeys } from './queryKeys';

export function useStudentDetail(id: number) {
  const { data, isLoading } = useQuery({
    queryKey: mentorKeys.student(id),
    queryFn: () => mentorService.getStudent(id),
    enabled: Number.isFinite(id) && id > 0,
  });
  return {
    student: data,
    isLoading,
  };
}
```

```ts
// frontend/src/features/mentor/hooks/useUpdateProfile.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';
import { useSetUser } from '@shared/store/authStore';
import type { UpdateMeRequest } from '@shared/types/api';

export function useUpdateProfile() {
  const { showToast } = useToast();
  const setUser = useSetUser();
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (body: UpdateMeRequest) => mentorService.updateMe(body),
    onSuccess: (user) => {
      setUser(user);
      qc.invalidateQueries({ queryKey: ['mentor'] });
      showToast('资料已更新', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      mentorService.changePassword(oldPassword, newPassword),
    onSuccess: () => showToast('密码已修改', 'success'),
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    updateProfile: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    changePassword: passwordMutation.mutate,
    isChangingPassword: passwordMutation.isPending,
  };
}
```

- [ ] **Step 4: 写 types**

```ts
// frontend/src/features/mentor/types.ts
// 留空文件，待真正需要 feature 内部类型时再加。
export {};
```

- [ ] **Step 5: lint**

```bash
npm run lint
```
Expected: 无新报错

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/mentor/services/ \
        frontend/src/features/mentor/hooks/ \
        frontend/src/features/mentor/types.ts
git commit -m "feat(mentor): service + queryKeys + hooks scaffolding"
```

---

## Task 15: 前端 `TeacherHome` 根组件 + 4 张卡片

**Files:**
- Create: `frontend/src/features/mentor/components/TeacherHome.tsx`
- Create: `frontend/src/features/mentor/components/cards/TodayPendingCard.tsx`
- Create: `frontend/src/features/mentor/components/cards/WeeklyActivityCard.tsx`
- Create: `frontend/src/features/mentor/components/cards/SilentStudentsCard.tsx`
- Create: `frontend/src/features/mentor/components/cards/RecentEventsCard.tsx`

- [ ] **Step 1: 写 TodayPendingCard**

```tsx
// frontend/src/features/mentor/components/cards/TodayPendingCard.tsx
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

interface Props {
  count: number;
}

export function TodayPendingCard({ count }: Props) {
  return (
    <div className="glass-card rounded-2xl p-6 flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl bg-[#0F766E]/10 flex items-center justify-center text-[#0F766E] shrink-0">
        <Inbox size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#6F7A75] font-medium">今日待回复</div>
        <div className="mt-1 text-3xl font-bold text-[#1F2937]">{count}</div>
        <Link
          to="/teacher/tickets"
          className="inline-block mt-2 text-xs text-[#0F766E] hover:underline"
        >
          去回复 →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 WeeklyActivityCard**

```tsx
// frontend/src/features/mentor/components/cards/WeeklyActivityCard.tsx
import type { WeeklyActivityBucket } from '@shared/types/api';

interface Props {
  data: WeeklyActivityBucket[];
}

export function WeeklyActivityCard({ data }: Props) {
  const max = data.reduce((m, x) => Math.max(m, x.count), 0) || 1;

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-xs text-[#6F7A75] font-medium mb-3">本周学生活跃</div>
      {data.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">暂无活跃记录</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((b) => (
            <li key={b.student_id} className="flex items-center gap-3">
              <div className="w-20 truncate text-xs text-[#1F2937]">{b.display_name}</div>
              <div className="flex-1 h-2 bg-[#0F766E]/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0F766E]"
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </div>
              <div className="w-8 text-right text-xs text-[#6F7A75]">{b.count}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 写 SilentStudentsCard**

```tsx
// frontend/src/features/mentor/components/cards/SilentStudentsCard.tsx
import { Link } from 'react-router-dom';
import type { SilentStudent } from '@shared/types/api';

interface Props {
  students: SilentStudent[];
}

export function SilentStudentsCard({ students }: Props) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-xs text-[#6F7A75] font-medium mb-3">超过 7 天未活跃</div>
      {students.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">无沉默学生</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {students.map((s) => (
            <li key={s.id}>
              <Link
                to={`/teacher/students/${s.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 transition"
              >
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-semibold">
                  {s.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#1F2937] truncate">{s.display_name}</div>
                  <div className="text-[10px] text-[#9CA3AF]">
                    {s.days_silent >= 9999 ? '从未活跃' : `${s.days_silent} 天未活跃`}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 写 RecentEventsCard**

```tsx
// frontend/src/features/mentor/components/cards/RecentEventsCard.tsx
import type { MentorRecentEvent } from '@shared/types/api';

const EVENT_LABEL: Record<MentorRecentEvent['event_type'], string> = {
  ticket_created: '提交了求助',
  ticket_replied: '工单已回复',
  ticket_closed: '工单已关闭',
};

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

interface Props {
  events: MentorRecentEvent[];
}

export function RecentEventsCard({ events }: Props) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-xs text-[#6F7A75] font-medium mb-3">最近事件</div>
      {events.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">暂无事件</div>
      ) : (
        <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar">
          {events.map((e, idx) => (
            <li key={`${e.ticket_id}-${e.event_type}-${idx}`} className="flex items-start gap-3 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0F766E] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[#1F2937]">
                  <span className="font-semibold">{e.student_name}</span>{' '}
                  <span className="text-[#6F7A75]">{EVENT_LABEL[e.event_type]}</span>
                </div>
                <div className="truncate text-[#9CA3AF] mt-0.5">{e.ticket_title}</div>
                <div className="text-[10px] text-[#B0B7B4] mt-0.5">{ago(e.occurred_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 写 TeacherHome 根组件**

```tsx
// frontend/src/features/mentor/components/TeacherHome.tsx
import { useMyOverview } from '../hooks/useMyOverview';
import { TodayPendingCard } from './cards/TodayPendingCard';
import { WeeklyActivityCard } from './cards/WeeklyActivityCard';
import { SilentStudentsCard } from './cards/SilentStudentsCard';
import { RecentEventsCard } from './cards/RecentEventsCard';

export function TeacherHome() {
  const { overview, isLoading, isError } = useMyOverview();

  if (isLoading) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-[#6F7A75]">加载中...</div>
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-red-500">加载失败，请稍后重试</div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">导师工作台</h1>
        <p className="mt-1 text-sm text-[#6F7A75]">今天的待办、学生活跃和最近事件一览</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TodayPendingCard count={overview.pending_tickets} />
        <div className="lg:col-span-2">
          <WeeklyActivityCard data={overview.weekly_activity} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SilentStudentsCard students={overview.silent_students} />
        <RecentEventsCard events={overview.recent_events} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: lint**

```bash
npm run lint
```
Expected: 无新报错

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/mentor/components/
git commit -m "feat(mentor): TeacherHome dashboard with 4 cards"
```

---

## Task 16: 前端 `MyStudentsRoot` + `StudentCard`

**Files:**
- Create: `frontend/src/features/mentor/components/MyStudentsRoot.tsx`
- Create: `frontend/src/features/mentor/components/StudentCard.tsx`

- [ ] **Step 1: 写 StudentCard**

```tsx
// frontend/src/features/mentor/components/StudentCard.tsx
import { Link } from 'react-router-dom';
import type { UserInfo } from '@shared/types/api';

interface Props {
  student: UserInfo;
}

export function StudentCard({ student }: Props) {
  const initial = (student.display_name || student.username).slice(0, 1).toUpperCase();

  return (
    <Link
      to={`/teacher/students/${student.id}`}
      className="glass-card rounded-2xl p-5 flex items-center gap-4 hover-lift transition"
    >
      <div className="w-12 h-12 rounded-full bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center text-base font-semibold shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#1F2937] truncate">{student.display_name}</div>
        <div className="text-xs text-[#6F7A75] truncate">{student.username}</div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 写 MyStudentsRoot**

```tsx
// frontend/src/features/mentor/components/MyStudentsRoot.tsx
import { useMyStudents } from '../hooks/useMyStudents';
import { StudentCard } from './StudentCard';

export function MyStudentsRoot() {
  const { students, isLoading } = useMyStudents();

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">我的学生</h1>
        <p className="mt-1 text-sm text-[#6F7A75]">点击卡片查看学生详情与工单记录</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-[#6F7A75]">加载中...</div>
      ) : students.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">暂无绑定学生。请联系管理员维护师生关系。</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <StudentCard key={s.id} student={s} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: lint + commit**

```bash
npm run lint && git add frontend/src/features/mentor/components/MyStudentsRoot.tsx \
                        frontend/src/features/mentor/components/StudentCard.tsx
git commit -m "feat(mentor): MyStudentsRoot + StudentCard"
```

---

## Task 17: 前端 `MyStudentDetail` 组件（左信息 / 右工单列表）

**Files:**
- Create: `frontend/src/features/mentor/components/MyStudentDetail.tsx`

> 工单列表通过 `MentorTicketList` 复用 — 该组件在 Task 19 创建。本任务先把 `MyStudentDetail` 写到位，import 链短期会报红，**Task 19 完成后即解决**；如担心 commit 时报红，把这两个 task 调换顺序也行。本计划按"先 feature 内部、再跨 feature 引用"顺序保持现状。

- [ ] **Step 1: 写组件**

```tsx
// frontend/src/features/mentor/components/MyStudentDetail.tsx
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useStudentDetail } from '../hooks/useStudentDetail';
import { MentorTicketList } from '@features/tickets';

interface Props {
  studentId: number;
}

export function MyStudentDetail({ studentId }: Props) {
  const { student, isLoading } = useStudentDetail(studentId);

  if (isLoading) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-[#6F7A75]">加载中...</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-red-500">学生不存在或无权访问</div>
      </div>
    );
  }

  const initial = (student.display_name || student.username).slice(0, 1).toUpperCase();
  const profile = (student.profile ?? {}) as Record<string, unknown>;

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
      <Link
        to="/teacher/students"
        className="self-start flex items-center gap-1 text-xs text-[#6F7A75] hover:text-[#0F766E] transition"
      >
        <ChevronLeft size={14} /> 返回我的学生
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* 左：学生信息 */}
        <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 h-fit">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center text-2xl font-semibold">
              {initial}
            </div>
            <div className="text-base font-semibold text-[#1F2937]">{student.display_name}</div>
            <div className="text-xs text-[#6F7A75]">{student.username}</div>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            {['student_id', 'grade', 'major', 'class_name'].map((k) => {
              const v = profile[k];
              if (v === undefined || v === null || v === '') return null;
              return (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[#9CA3AF]">{k}</span>
                  <span className="text-[#1F2937] truncate">{String(v)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：工单 */}
        <MentorTicketList studentId={studentId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit（lint 在 Task 19 后再过）**

```bash
git add frontend/src/features/mentor/components/MyStudentDetail.tsx
git commit -m "feat(mentor): MyStudentDetail (info panel + reused MentorTicketList)"
```

---

## Task 18: 前端 `TeacherProfile`

**Files:**
- Create: `frontend/src/features/mentor/components/TeacherProfile.tsx`

- [ ] **Step 1: 写组件**

```tsx
// frontend/src/features/mentor/components/TeacherProfile.tsx
import { useState } from 'react';
import { useAuthUser } from '@shared/store/authStore';
import { useUpdateProfile } from '../hooks/useUpdateProfile';

export function TeacherProfile() {
  const user = useAuthUser();
  const { updateProfile, isUpdating, changePassword, isChangingPassword } = useUpdateProfile();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [email, setEmail] = useState((user as { email?: string } | null)?.email ?? '');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  if (!user) return null;

  const handleProfileSave = () => {
    const payload: { display_name?: string; email?: string } = {};
    if (displayName.trim() && displayName !== user.display_name) payload.display_name = displayName.trim();
    if (email.trim()) payload.email = email.trim();
    if (Object.keys(payload).length === 0) return;
    updateProfile(payload);
  };

  const handlePwdSave = () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd !== confirmPwd) {
      alert('两次输入的新密码不一致');
      return;
    }
    changePassword({ oldPassword: oldPwd, newPassword: newPwd });
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
  };

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[#1F2937]">个人中心</h1>
        <p className="mt-1 text-sm text-[#6F7A75]">编辑显示名 / 邮箱、修改密码</p>
      </div>

      {/* 资料 */}
      <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 max-w-xl">
        <div className="text-sm font-semibold text-[#1F2937]">基础资料</div>

        <Field label="用户名（只读）" value={user.username} readOnly />
        <Field label="工号（只读）" value={(user.profile as { employee_id?: string } | null)?.employee_id ?? '—'} readOnly />

        <LabeledInput label="显示名" value={displayName} onChange={setDisplayName} />
        <LabeledInput label="邮箱" value={email} onChange={setEmail} type="email" />

        <button
          onClick={handleProfileSave}
          disabled={isUpdating}
          className="self-start mt-2 px-4 py-2 bg-[#0F766E] text-white text-sm rounded-xl hover:bg-[#0E6B61] disabled:opacity-50 transition"
        >
          {isUpdating ? '保存中...' : '保存资料'}
        </button>
      </div>

      {/* 密码 */}
      <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 max-w-xl">
        <div className="text-sm font-semibold text-[#1F2937]">修改密码</div>

        <LabeledInput label="原密码" value={oldPwd} onChange={setOldPwd} type="password" />
        <LabeledInput label="新密码" value={newPwd} onChange={setNewPwd} type="password" />
        <LabeledInput label="确认新密码" value={confirmPwd} onChange={setConfirmPwd} type="password" />

        <button
          onClick={handlePwdSave}
          disabled={isChangingPassword || !oldPwd || !newPwd}
          className="self-start mt-2 px-4 py-2 bg-[#0F766E] text-white text-sm rounded-xl hover:bg-[#0E6B61] disabled:opacity-50 transition"
        >
          {isChangingPassword ? '提交中...' : '修改密码'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[#6F7A75]">{label}</label>
      <input
        value={value}
        readOnly={readOnly}
        className="px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-sm text-[#1F2937]"
      />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[#6F7A75]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className="px-3 py-2 rounded-xl border border-[#D5DDD9] bg-white text-sm text-[#1F2937] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 transition"
      />
    </div>
  );
}
```

- [ ] **Step 2: lint + Commit**

```bash
npm run lint && git add frontend/src/features/mentor/components/TeacherProfile.tsx
git commit -m "feat(mentor): TeacherProfile (edit profile + change password)"
```

---

## Task 19: 前端 `features/tickets/` 新增 `MentorTicketList` + `useTicketList` 扩 studentId

**Files:**
- Modify: `frontend/src/features/tickets/hooks/queryKeys.ts`
- Modify: `frontend/src/features/tickets/hooks/useTicketList.ts`
- Modify: `frontend/src/features/tickets/services/ticketService.ts`
- Create: `frontend/src/features/tickets/components/MentorTicketList.tsx`
- Modify: `frontend/src/features/tickets/index.ts`

- [ ] **Step 1: 改 queryKeys**

打开 `frontend/src/features/tickets/hooks/queryKeys.ts`，看现有 `ticketKeys.list(scope, page)` 签名。改为：

```ts
export const ticketKeys = {
  all: () => ['tickets'] as const,
  list: (scope: 'all' | 'mine', page: number, studentId?: number) =>
    ['tickets', 'list', scope, page, studentId ?? 'any'] as const,
  // 保持其它现有 key
};
```

- [ ] **Step 2: 改 service**

```ts
// frontend/src/features/tickets/services/ticketService.ts
import { ticketApi, faqApi, knowledgeApi } from '@shared/lib/api';
import { extractError } from '@shared/lib/errorHandler';
import type { QARequestCreate } from '@shared/types/api';

export const ticketService = {
  listAll: (page: number, pageSize: number, studentId?: number) =>
    ticketApi.list(page, pageSize, studentId),
  listMine: (page: number, pageSize: number, studentId?: number) =>
    ticketApi.list(page, pageSize, studentId),
  create: (payload: QARequestCreate) => ticketApi.create(payload),
  reply: (id: number, answer: string) => ticketApi.reply(id, answer),
  close: (id: number) => ticketApi.close(id),
  createFaq: async (kbName: string, question: string, answer: string, category: string) => {
    await faqApi.create(kbName, { question, answer, category, sort_order: 0 });
  },
  listKbs: () => knowledgeApi.list(),
  extractError,
};
```

- [ ] **Step 3: 改 useTicketList 签名**

```ts
// frontend/src/features/tickets/hooks/useTicketList.ts （仅相关部分）
export function useTicketList(scope: 'all' | 'mine', page: number, studentId?: number) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ticketKeys.list(scope, page, studentId),
    queryFn: () =>
      scope === 'all'
        ? ticketService.listAll(page, PAGE_SIZE, studentId)
        : ticketService.listMine(page, PAGE_SIZE, studentId),
  });

  // 其它 mutation 保持不变
  // ...
}
```

- [ ] **Step 4: 写 MentorTicketList**

```tsx
// frontend/src/features/tickets/components/MentorTicketList.tsx
import { useState } from 'react';
import { useTicketList } from '../hooks/useTicketList';
import type { QARequestInfo } from '@shared/types/api';
import { TicketDetailModal } from './TicketDetailModal';

interface Props {
  /** 若提供，只显示该学生的工单（用于"我的学生"详情页）。 */
  studentId?: number;
}

const TABS: { key: QARequestInfo['status']; label: string }[] = [
  { key: 'pending', label: '待回复' },
  { key: 'replied', label: '已回复' },
  { key: 'closed', label: '已结束' },
];

export function MentorTicketList({ studentId }: Props) {
  const [activeTab, setActiveTab] = useState<QARequestInfo['status']>('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QARequestInfo | null>(null);

  const { tickets, totalPages, isLoading } = useTicketList('mine', page, studentId);
  const filtered = tickets.filter((t) => t.status === activeTab);

  return (
    <div className="glass-card rounded-2xl flex flex-col flex-1 min-h-0">
      <div className="px-6 py-5 border-b border-white/40">
        <h2 className="text-base font-semibold text-[#1F2937]">
          {studentId ? '该学生的答疑请求' : '答疑请求'}
        </h2>

        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${
                activeTab === t.key
                  ? 'bg-[#0F766E] text-white shadow-sm'
                  : 'text-[#6F7A75] hover:bg-white/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        {isLoading ? (
          <div className="text-sm text-[#6F7A75] px-2 py-4">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-[#9CA3AF] px-2 py-4">暂无工单</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((t) => (
              <li
                key={t.id}
                onClick={() => setSelected(t)}
                className="px-3 py-2.5 rounded-xl hover:bg-white/60 cursor-pointer transition"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-[#1F2937] truncate flex-1">
                    {t.question.slice(0, 80)}
                  </span>
                  <span className="text-[10px] text-[#9CA3AF] shrink-0">
                    {new Date(t.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-white/40 flex items-center justify-between text-xs text-[#6F7A75]">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="disabled:opacity-40"
          >
            ← 上一页
          </button>
          <span>{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="disabled:opacity-40"
          >
            下一页 →
          </button>
        </div>
      )}

      {selected && (
        <TicketDetailModal
          ticket={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
```

> **TicketDetailModal 是否已经支持 mentor 回复？** 看 `frontend/src/features/tickets/components/TicketDetailModal.tsx` 的 props 与回复表单。当前已经是 admin/teacher 使用的工单回复弹层（StudentTicketList 也复用了它）。复用即可。如发现它依赖 `scope='all'` 不适配，再单独 Task 调整。

- [ ] **Step 5: 在 `features/tickets/index.ts` 导出**

打开 `frontend/src/features/tickets/index.ts`，追加：

```ts
export { MentorTicketList } from './components/MentorTicketList';
```

- [ ] **Step 6: 修复 useTicketList 调用方**

```bash
grep -rn "useTicketList" frontend/src
```

确认 `TicketsManagement.tsx`、`StudentTicketList.tsx` 都还兼容（它们只传 2 个参数，第 3 参数可选，应该没问题）。如有 TS 报错则补默认值。

- [ ] **Step 7: lint + Commit**

```bash
npm run lint
git add frontend/src/features/tickets/
git commit -m "feat(tickets): add MentorTicketList; useTicketList accepts studentId filter"
```

---

## Task 20: 前端 `features/mentor/index.ts`

**Files:**
- Create: `frontend/src/features/mentor/index.ts`

- [ ] **Step 1: 写 index**

```ts
// frontend/src/features/mentor/index.ts
export { TeacherHome } from './components/TeacherHome';
export { MyStudentsRoot } from './components/MyStudentsRoot';
export { MyStudentDetail } from './components/MyStudentDetail';
export { TeacherProfile } from './components/TeacherProfile';
```

- [ ] **Step 2: lint + Commit**

```bash
npm run lint
git add frontend/src/features/mentor/index.ts
git commit -m "feat(mentor): export root components from feature index"
```

---

## Task 21: 前端 `pages/teacher/*` 五个薄页面

**Files:**
- Create: `frontend/src/pages/teacher/TeacherHomePage.tsx`
- Create: `frontend/src/pages/teacher/MyStudentsPage.tsx`
- Create: `frontend/src/pages/teacher/MyStudentDetailPage.tsx`
- Create: `frontend/src/pages/teacher/TeacherTicketsPage.tsx`
- Create: `frontend/src/pages/teacher/TeacherProfilePage.tsx`

- [ ] **Step 1: 写 5 个页面**

```tsx
// pages/teacher/TeacherHomePage.tsx
import { TeacherHome } from '@features/mentor';
export default function TeacherHomePage() {
  return <TeacherHome />;
}
```

```tsx
// pages/teacher/MyStudentsPage.tsx
import { MyStudentsRoot } from '@features/mentor';
export default function MyStudentsPage() {
  return <MyStudentsRoot />;
}
```

```tsx
// pages/teacher/MyStudentDetailPage.tsx
import { useParams } from 'react-router-dom';
import { MyStudentDetail } from '@features/mentor';
export default function MyStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <MyStudentDetail studentId={Number(id)} />;
}
```

```tsx
// pages/teacher/TeacherTicketsPage.tsx
import { MentorTicketList } from '@features/tickets';
export default function TeacherTicketsPage() {
  return <MentorTicketList />;
}
```

```tsx
// pages/teacher/TeacherProfilePage.tsx
import { TeacherProfile } from '@features/mentor';
export default function TeacherProfilePage() {
  return <TeacherProfile />;
}
```

- [ ] **Step 2: lint + Commit**

```bash
npm run lint
git add frontend/src/pages/teacher/
git commit -m "feat(teacher): 5 thin page components wired to features"
```

---

## Task 22: 前端 `app/routes.ts` + `app/App.tsx` 路由注册 + admin 收紧

**Files:**
- Modify: `frontend/src/app/routes.ts`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: 加路由常量**

打开 `frontend/src/app/routes.ts`，在 `// Admin` 段之后插入：

```ts
  // Teacher
  TEACHER_LOGIN:           '/teacher/login',
  TEACHER_ROOT:            '/teacher',
  TEACHER_STUDENTS:        '/teacher/students',
  TEACHER_STUDENT_DETAIL:  '/teacher/students/:id',
  TEACHER_TICKETS:         '/teacher/tickets',
  TEACHER_PROFILE:         '/teacher/profile',
```

- [ ] **Step 2: 改 `app/App.tsx`**

a) 顶部新增 lazy import：

```tsx
import TeacherLayout from '@shared/components/layout/TeacherLayout';

const TeacherHomePage = lazy(() => import('@pages/teacher/TeacherHomePage'));
const MyStudentsPage = lazy(() => import('@pages/teacher/MyStudentsPage'));
const MyStudentDetailPage = lazy(() => import('@pages/teacher/MyStudentDetailPage'));
const TeacherTicketsPage = lazy(() => import('@pages/teacher/TeacherTicketsPage'));
const TeacherProfilePage = lazy(() => import('@pages/teacher/TeacherProfilePage'));
```

b) `<Route path="/student/login" ...>` 之后插入：

```tsx
<Route path="/teacher/login" element={<LoginPage variant="teacher" />} />
```

c) `RoleRedirect` 改三态：

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

d) admin 路由 allowedRoles 收紧为 `['admin']`：

```tsx
<Route path="admin" element={<RouteGuard allowedRoles={['admin']} />}>
```

并把内部的二级 `<Route element={<RouteGuard allowedRoles={['admin']} />}>` 移除（因为外层已是 admin only），保持菜单结构不变即可：

```tsx
<Route path="admin" element={<RouteGuard allowedRoles={['admin']} />}>
  <Route element={<AppLayout />}>
    <Route index element={<OverviewPage />} />
    <Route path="conversations" element={<ConversationsPage />} />
    <Route path="users" element={<UsersPage />} />
    <Route path="students" element={<Navigate to="/admin/users" replace />} />
    <Route path="tickets" element={<TicketsPage />} />
    <Route path="analytics" element={<AnalyticsPage />} />
    <Route path="knowledge" element={<KnowledgePage />} />
    <Route path="documents" element={<DocumentsPage />} />
    <Route path="document/:kbName/:docId/review" element={<DocumentCleanReviewPage />} />
    <Route path="document/:kbName/:docId/chunks" element={<DocumentChunkReviewPage />} />
    <Route path="teachers" element={<Navigate to="/admin/users" replace />} />
    <Route path="settings" element={<SettingsPage />} />
  </Route>
</Route>
```

e) `<Route path="student" ...>` 之前插入 teacher 路由树：

```tsx
<Route path="teacher" element={<RouteGuard allowedRoles={['teacher']} />}>
  <Route element={<TeacherLayout />}>
    <Route index element={<TeacherHomePage />} />
    <Route path="students" element={<MyStudentsPage />} />
    <Route path="students/:id" element={<MyStudentDetailPage />} />
    <Route path="tickets" element={<TeacherTicketsPage />} />
    <Route path="profile" element={<TeacherProfilePage />} />
  </Route>
</Route>
```

- [ ] **Step 3: lint**

```bash
npm run lint
```
Expected: 无新报错

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/routes.ts frontend/src/app/App.tsx
git commit -m "feat(app): register /teacher routes; tighten admin allowedRoles to ['admin']"
```

---

## Task 23: 手动 smoke 验证 + E2E（可选）

- [ ] **Step 1: 启动基础设施 + 后端 + 前端**

```bash
# 终端 1
docker-compose -f infra/docker-compose.yml up -d

# 终端 2
cd backend && PATH="$(pwd)/.venv/bin:$PATH" poetry run dev

# 终端 3
cd frontend && npm run dev
```

- [ ] **Step 2: 准备测试数据（如未就绪）**

可使用 `backend/scripts/seed_demo_data.py` 创建 admin/teacher/student 各一名 + mentor-relation。

```bash
cd backend && PATH="$(pwd)/.venv/bin:$PATH" python scripts/seed_demo_data.py
```

- [ ] **Step 3: 手动 smoke 流程**

按以下流程在浏览器逐步验证：

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 打开 `http://localhost:5173/teacher/login` | 显示导师工作台登录页（柔绿配色） |
| 2 | 用错误密码登录 | 显示登录失败 toast |
| 3 | 用 teacher 账号登录 | 跳转到 `/teacher`，显示首页 4 张卡片（数据可能为 0，不应有 JS 错误） |
| 4 | 点"我的学生" | 进入学生卡片网格 |
| 5 | 点一张学生卡 | 进入 `/teacher/students/:id`，左信息 + 右工单列表 |
| 6 | 切到"答疑请求" | 看到 3 Tab；学生若提交过工单应出现在待回复 |
| 7 | 点击某工单 | 弹出详情 Modal，回复 → 工单状态切到已回复 |
| 8 | 切到"个人中心" | 可改 display_name、改密码 |
| 9 | 退出 → 用 admin 账号登 `/admin/login` | 仍可正常进入 admin portal |
| 10 | 用 student 账号登 `/student/login` | 仍可正常进入 student portal |
| 11 | 浏览器 URL 手填 `/admin`（持 teacher token） | 重定向到 `/teacher/login`（admin 收紧 RouteGuard 后） |
| 12 | 浏览器 URL 手填 `/teacher`（持 admin token） | 重定向到 `/admin/login` |

- [ ] **Step 4 (可选): 写 E2E spec**

```ts
// frontend/e2e/teacher-portal.spec.ts
import { test, expect } from '@playwright/test';

test('teacher portal smoke', async ({ page }) => {
  await page.goto('http://localhost:5173/teacher/login');
  await page.getByPlaceholder('请输入工号').fill('teacher_demo');
  await page.getByPlaceholder('请输入密码').fill('demo123');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/teacher\/?$/);
  await expect(page.getByRole('heading', { name: '导师工作台' })).toBeVisible();

  await page.getByRole('link', { name: /我的学生/ }).click();
  await expect(page).toHaveURL(/\/teacher\/students$/);

  await page.getByRole('link', { name: /答疑请求/ }).click();
  await expect(page).toHaveURL(/\/teacher\/tickets$/);
});
```

跑：

```bash
cd frontend && npx playwright test e2e/teacher-portal.spec.ts
```

- [ ] **Step 5: 提交 E2E（若写了）**

```bash
git add frontend/e2e/teacher-portal.spec.ts
git commit -m "test(e2e): teacher portal smoke"
```

---

## Final Verification

- [ ] 所有 commit 都 push 到 dev 分支或留待 PR
- [ ] 后端整体测试通过：

```bash
cd backend && PATH="$(pwd)/.venv/bin:$PATH" pytest -m "not integration" -q
cd backend && PATH="$(pwd)/.venv/bin:$PATH" pytest -m integration -q   # 需 MySQL 在跑
```

- [ ] 前端 lint 通过：

```bash
cd frontend && npm run lint
```

- [ ] 手动 smoke 流程 12 步全 pass

- [ ] 代码合规检查（grep 自检）：

```bash
# 后端
grep -rn "from src.storage\|from src.core" backend/src/api/routes/      # 应只命中 _store_ 类型 import 文件本身行
grep -rn "from fastapi" backend/src/services/                            # 应无输出
grep -rn "HTTPException" backend/src/services/mentor_service.py          # 应无输出

# 前端
grep -rn "import.*api.ts" frontend/src/features/mentor/components/       # 应无输出
grep -rn "useState\|useQuery" frontend/src/pages/teacher/                # 应无输出（页面只组合）
```

---

## Spec Coverage Checklist

| 设计稿 § | 覆盖 Task |
|---------|-----------|
| § 1 路由 + 目录骨架 | Task 21 + 22 |
| § 2 角色权限收紧 | Task 22（admin allowedRoles 收紧） |
| § 3 RouteGuard 三前缀识别 | Task 10 |
| § 4.1 features/mentor 目录 | Task 14-18, 20 |
| § 4.1 features/tickets MentorTicketList 多 root | Task 19 |
| § 4.2 Portal 三态 + 同步初始化 | Task 10 |
| § 4.3 types + mentorApi + ticketApi 扩 studentId + authApi.updateMe | Task 11 |
| § 4.4 LoginForm teacher variant | Task 13 |
| § 4.5 page ≤ 10 行 | Task 21 |
| § 5.1 backend 新文件清单 | Task 4, 5, 8 |
| § 5.2.1 GET /mentors/me/overview | Task 8 |
| § 5.2.2 GET /mentors/me/students | Task 8 |
| § 5.2.3 GET /tickets?student_id 越权 | Task 6, 7 |
| § 5.2.4 PUT /auth/me | Task 9 |
| § 5.3 require_teacher | Task 1 |
| § 5.4 MentorService 单文件 | Task 5 |
| § 5.5 Storage 新增方法（user_store + ticket_store） | Task 2, 3 |
| § 5.6 deps.py 注册 | Task 8 |
| § 5.7 routes/mentor.py | Task 8 |
| § 6 视觉（柔绿主色 + 导师工作台 logo 副标题） | Task 12, 13 |
| § 7.1 测试（service + 两个 store） | Task 2, 3, 5, 8 |
| § 8 合规映射 | 已在 Pre-Flight + Final Verification grep 自检 |
| § 9 实施顺序 | 后端 Task 1-9 → 前端 Task 10-22 → 验证 Task 23 |

---

*计划版本：v1.0 | 创建日期：2026-06-04 | 关联设计：[2026-06-04-teacher-portal-split-design.md](../specs/2026-06-04-teacher-portal-split-design.md)*
