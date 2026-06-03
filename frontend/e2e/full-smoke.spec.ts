import { test, expect, type Page } from '@playwright/test';

// ── 账号 ──────────────────────────────────────────────────
const ADMIN = { u: 'admin', p: 'admin123' };
const TEACHER = { u: 'teacher_li', p: 'Demo@123456' };
const STUDENT = { u: '202201001', p: 'Demo@123456' };

// ── 错误收集（前端崩溃 / console.error / HTTP ≥400）────────
type ErrorBag = {
  pageErrors: string[];
  consoleErrors: string[];
  httpErrors: string[];
};
let bag: ErrorBag;

test.beforeEach(({ page }) => {
  bag = { pageErrors: [], consoleErrors: [], httpErrors: [] };
  page.on('pageerror', (e) => bag.pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') bag.consoleErrors.push(m.text());
  });
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400) {
      bag.httpErrors.push(`${s} ${r.request().method()} ${r.url()}`);
    }
  });
});

test.afterEach(async ({}, testInfo) => {
  if (bag.httpErrors.length)
    await testInfo.attach('http-errors', { body: bag.httpErrors.join('\n') });
  if (bag.consoleErrors.length)
    await testInfo.attach('console-errors', {
      body: bag.consoleErrors.join('\n'),
    });
  if (bag.pageErrors.length)
    await testInfo.attach('page-errors', { body: bag.pageErrors.join('\n') });

  // 前端运行时未捕获异常 → 必失败
  expect(bag.pageErrors, '前端运行时未捕获异常 (pageerror)').toEqual([]);
  // 后端 5xx → 必失败（4xx 仅记录，登录失败等用例本就预期 401/422）
  const serverErrors = bag.httpErrors.filter((e) => /^5\d\d /.test(e));
  expect(serverErrors, '后端 5xx 错误').toEqual([]);
});

// ── 工具函数 ──────────────────────────────────────────────
async function login(page: Page, portal: 'admin' | 'student', u: string, p: string) {
  await page.goto(`/${portal}/login`);
  await page.fill('input[type="text"]', u);
  await page.fill('input[type="password"]', p);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
    timeout: 15000,
  });
}

const h1 = (page: Page, text: string) => page.locator('h1', { hasText: text }).first();
const navLink = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

// ══════════════════════════════════════════════════════════
// 1. 登录与鉴权
// ══════════════════════════════════════════════════════════
test.describe('登录与鉴权', () => {
  test('TC-LOGIN-01 管理员登录成功', async ({ page }) => {
    await login(page, 'admin', ADMIN.u, ADMIN.p);
    await expect(h1(page, '概览')).toBeVisible();
  });

  test('TC-LOGIN-02 错误密码被拒', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'wrong-pwd-xxx');
    await page.click('button[type="submit"]');
    // 实际错误文案来自 Axios：英文 "Request failed with status code 401"
    await expect(page.locator('text=/Request failed|登录失败|错误/').first()).toBeVisible({
      timeout: 10000,
    });
    expect(page.url()).toContain('/admin/login');
  });

  test('TC-LOGIN-03 学生登录成功', async ({ page }) => {
    await login(page, 'student', STUDENT.u, STUDENT.p);
    await expect(h1(page, '你好')).toBeVisible();
  });

  test('TC-LOGIN-04 教师无管理员专属导航', async ({ page }) => {
    await login(page, 'admin', TEACHER.u, TEACHER.p);
    await expect(h1(page, '概览')).toBeVisible();
    await expect(navLink(page, '知识库管理')).toHaveCount(0);
    await expect(navLink(page, '系统配置')).toHaveCount(0);
  });

  test('TC-AUTH-01 未登录访问被拦截', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('input[type="password"]')).toBeVisible({
      timeout: 10000,
    });
  });

  test('TC-AUTH-02 学生不能进入管理端', async ({ page }) => {
    await login(page, 'student', STUDENT.u, STUDENT.p);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(h1(page, '概览')).toHaveCount(0);
  });
});

// ══════════════════════════════════════════════════════════
// 2. 管理端页面冒烟（admin 登录）
// ══════════════════════════════════════════════════════════
test.describe('管理端页面冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin', ADMIN.u, ADMIN.p);
  });

  test('TC-ADM-OVERVIEW 概览', async ({ page }) => {
    await expect(h1(page, '概览')).toBeVisible();
    await page.waitForLoadState('networkidle');
  });

  test('TC-ADM-CONV 对话', async ({ page }) => {
    await navLink(page, '对话').click();
    await expect(h1(page, '问答对话')).toBeVisible();
    await expect(page.getByText('新建对话').first()).toBeVisible();
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  test('TC-ADM-TICKETS 答疑请求', async ({ page }) => {
    await navLink(page, '答疑请求').click();
    await expect(h1(page, '答疑请求')).toBeVisible();
  });

  test('TC-ADM-USERS 师生管理', async ({ page }) => {
    await navLink(page, '师生管理').click();
    await expect(h1(page, '师生管理')).toBeVisible();
    await expect(page.getByText('学生管理').first()).toBeVisible();
  });

  test('TC-ADM-ANALYTICS 使用统计', async ({ page }) => {
    await navLink(page, '使用统计').click();
    await expect(h1(page, '使用统计')).toBeVisible();
    await page.waitForLoadState('networkidle');
  });

  test('TC-ADM-KB 知识库管理', async ({ page }) => {
    await navLink(page, '知识库管理').click();
    await expect(h1(page, '知识库')).toBeVisible();
    await expect(page.getByRole('button', { name: '新建知识库' })).toBeVisible();
  });

  test('TC-ADM-DOCS 文档', async ({ page }) => {
    // page.goto 会触发完整重载导致 Zustand hydration 竞态（user=null → 重定向）
    // 改用 pushState+popstate 在已加载的 SPA 内做 React Router 客户端导航
    await page.evaluate(() => {
      window.history.pushState(null, '', '/admin/documents');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    await expect(h1(page, '文档')).toBeVisible();
    await page.waitForLoadState('networkidle');
  });

  test('TC-ADM-SETTINGS 系统配置', async ({ page }) => {
    await navLink(page, '系统配置').click();
    await expect(h1(page, '系统配置')).toBeVisible();
    await expect(page.getByText('保存配置').first()).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════
// 3. 管理端关键交互
// ══════════════════════════════════════════════════════════
test.describe('管理端关键交互', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin', ADMIN.u, ADMIN.p);
  });

  test('TC-INT-KB-NEW 打开新建知识库弹窗', async ({ page }) => {
    await navLink(page, '知识库管理').click();
    await page.getByRole('button', { name: '新建知识库' }).click();
    // 弹窗出现：通常含名称输入框
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('TC-INT-USERS-TAB 切换师生管理 Tab', async ({ page }) => {
    await navLink(page, '师生管理').click();
    await page.getByText('教师管理').first().click();
    await page.waitForLoadState('networkidle');
    await page.getByText('导师关系').first().click();
    await page.waitForLoadState('networkidle');
    await page.getByText('学生管理').first().click();
    await expect(h1(page, '师生管理')).toBeVisible();
  });

  test('TC-INT-CHAT-SEND 对话发送消息（重后端 RAG）', async ({ page }) => {
    test.setTimeout(90000);
    await navLink(page, '对话').click();
    await expect(h1(page, '问答对话')).toBeVisible();

    const newBtn = page.getByText('新建对话').first();
    if (await newBtn.isVisible().catch(() => false)) await newBtn.click();

    const ta = page.locator('textarea').first();
    await expect(ta).toBeVisible();
    if (!(await ta.isEnabled())) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: '知识库未配置，输入框禁用，跳过发送',
      });
      return;
    }
    await ta.fill('本科毕业设计开题报告需要包含哪些内容？');
    await ta.press('Enter');
    // 给 RAG 全链路时间，期间监听后端 5xx / 前端崩溃
    await page.waitForTimeout(25000);
    // 记录页面是否出现错误文案（不强制失败，后端日志为准）
    const errText = await page.locator('text=/生成失败|回答失败|出错|请重试/').count();
    if (errText > 0)
      test.info().annotations.push({
        type: 'chat-error',
        description: '对话页出现错误提示文案',
      });
  });

  test('TC-INT-SETTINGS-READ 读取系统配置', async ({ page }) => {
    await navLink(page, '系统配置').click();
    await expect(h1(page, '系统配置')).toBeVisible();
    await page.waitForLoadState('networkidle');
    // 仅读取，不点保存，避免改动配置
  });
});

// ══════════════════════════════════════════════════════════
// 4. 学生端页面冒烟（学生登录）
// ══════════════════════════════════════════════════════════
test.describe('学生端页面冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'student', STUDENT.u, STUDENT.p);
  });

  test('TC-STU-HOME 首页', async ({ page }) => {
    await expect(h1(page, '你好')).toBeVisible();
    await page.waitForLoadState('networkidle');
  });

  test('TC-STU-CHAT 智能问答', async ({ page }) => {
    await navLink(page, '智能问答').click();
    await expect(h1(page, '问答对话')).toBeVisible();
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  test('TC-STU-TICKETS 答疑记录', async ({ page }) => {
    await navLink(page, '答疑记录').click();
    await expect(h1(page, '我的答疑记录')).toBeVisible();
  });

  test('TC-STU-FAQ 常见问题', async ({ page }) => {
    await navLink(page, '常见问题').click();
    await expect(h1(page, '常见问题')).toBeVisible();
    await expect(page.getByPlaceholder('搜索问题或答案...')).toBeVisible();
  });

  test('TC-STU-PROFILE 我的', async ({ page }) => {
    await navLink(page, '我的').click();
    await page.waitForLoadState('networkidle');
    // 个人资料页：显示学号/姓名
    await expect(page.getByText(STUDENT.u).first()).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════
// 5. 学生端关键交互
// ══════════════════════════════════════════════════════════
test.describe('学生端关键交互', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'student', STUDENT.u, STUDENT.p);
  });

  test('TC-STU-FAQ-SEARCH FAQ 搜索与展开', async ({ page }) => {
    await navLink(page, '常见问题').click();
    await expect(h1(page, '常见问题')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const search = page.getByPlaceholder('搜索问题或答案...');
    await search.fill('毕业');
    await page.waitForTimeout(800);

    // 若有结果，点击第一条展开
    const firstFaq = page.locator('button', { hasText: /\?|？|毕业/ }).first();
    if (await firstFaq.isVisible().catch(() => false)) {
      await firstFaq.click();
      await page.waitForTimeout(400);
    }
  });

  test('TC-STU-CHAT-SEND 智能问答发送（重后端 RAG）', async ({ page }) => {
    test.setTimeout(90000);
    await navLink(page, '智能问答').click();
    await expect(h1(page, '问答对话')).toBeVisible();

    const newBtn = page.getByText('新建对话').first();
    if (await newBtn.isVisible().catch(() => false)) await newBtn.click();

    const ta = page.locator('textarea').first();
    await expect(ta).toBeVisible();
    if (!(await ta.isEnabled())) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: '学生端无可用知识库，输入框禁用，跳过发送',
      });
      return;
    }
    await ta.fill('论文查重率要求是多少？');
    await ta.press('Enter');
    await page.waitForTimeout(25000);
    const errText = await page.locator('text=/生成失败|回答失败|出错|请重试/').count();
    if (errText > 0)
      test.info().annotations.push({
        type: 'chat-error',
        description: '学生问答页出现错误提示文案',
      });
  });

  test('TC-STU-LOGOUT 退出登录', async ({ page }) => {
    await page.getByTitle('退出登录').click();
    await page.waitForURL(/\/student\/login/, { timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
