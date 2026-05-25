# Phase 1: Frontend Component Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared UI components and split god-page-components to reduce duplication and improve maintainability, without changing any visual behavior.

**Architecture:** Extract duplicated patterns (Toast, ConfirmDialog, download helper, modal overlay) into shared modules. Then split ConversationsPage.tsx (1,800 lines) into focused sub-components under `components/chat/`. Other large pages get their inline sub-components extracted to colocated files. All changes are pure refactoring — no API changes, no behavior changes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest (new — for unit testing extracted utilities), TailwindCSS

---

## File Structure

### New shared files
| File | Responsibility |
|------|----------------|
| `frontend/src/lib/download.ts` | `downloadBlob(url, filename)` utility — replaces 7 identical blob patterns in api.ts |
| `frontend/src/components/ui/Toast.tsx` | Shared Toast notification — replaces 4 inline copies |
| `frontend/src/components/ui/ConfirmDialog.tsx` | Shared confirm dialog — replaces 2 inline copies |

### New chat component files (split from ConversationsPage.tsx)
| File | Responsibility | Source lines |
|------|----------------|-------------|
| `frontend/src/lib/streamChat.ts` | SSE streaming function + buildHistory helper | ConversationsPage L50-186 |
| `frontend/src/components/chat/AgentAvatar.tsx` | Memoized AI avatar | ConversationsPage L190-225 |
| `frontend/src/components/chat/FileCard.tsx` | Download file card with extension badge | ConversationsPage L229-287 |
| `frontend/src/components/chat/SourcesPanel.tsx` | Expandable citation sources | ConversationsPage L291-335 |
| `frontend/src/components/chat/AcademicMarkdown.tsx` | Markdown renderer with inline citations | ConversationsPage L339-430 |
| `frontend/src/components/chat/MessageBubble.tsx` | MessageActions + MessageBubble (memoized) | ConversationsPage L434-586 |
| `frontend/src/components/chat/ThinkingProcess.tsx` | Agent thinking steps display + ConversationSkeleton | ConversationsPage L975-1063 |
| `frontend/src/components/chat/ConversationSidebar.tsx` | groupByDate + ConversationItem + Admin/Student sidebars | ConversationsPage L590-970 |
| `frontend/src/components/chat/TutorHelpModal.tsx` | Tutor help modal | ConversationsPage L1666-1768 |

### Modified files
| File | Change |
|------|--------|
| `frontend/src/lib/api.ts` | Replace 7 blob download blocks with `downloadBlob()` calls |
| `frontend/src/pages/ConversationsPage.tsx` | Import extracted components; main component stays (~400 lines) |
| `frontend/src/pages/KnowledgeBasePage.tsx` | Replace inline Toast + ConfirmDialog with shared imports |
| `frontend/src/pages/FaqPage.tsx` | Replace inline Toast with shared import |

### Test files
| File | Tests |
|------|-------|
| `frontend/src/__tests__/lib/download.test.ts` | downloadBlob utility |
| `frontend/src/__tests__/lib/streamChat.test.ts` | SSE parser, buildHistory |

---

## Task 1: Set up Vitest

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/__tests__/setup.ts`

- [ ] **Step 1: Install vitest**

```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create vitest config**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create test setup file**

Create `frontend/src/__tests__/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test script to package.json**

Add to `"scripts"` in `frontend/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Run vitest to verify setup**

```bash
cd frontend && npm test
```

Expected: 0 tests found, no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/__tests__/setup.ts
git commit -m "chore(frontend): set up vitest test framework"
```

---

## Task 2: Extract downloadBlob utility

**Files:**
- Create: `frontend/src/lib/download.ts`
- Test: `frontend/src/__tests__/lib/download.test.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/lib/download.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadBlob } from "@/lib/download";

describe("downloadBlob", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn().mockReturnValue("blob:http://localhost/fake");
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();

    globalThis.URL.createObjectURL = createObjectURLSpy;
    globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

    vi.spyOn(document, "createElement").mockReturnValue({
      set href(v: string) { this._href = v; },
      get href() { return this._href; },
      set download(v: string) { this._download = v; },
      get download() { return this._download; },
      click: clickSpy,
      _href: "",
      _download: "",
    } as unknown as HTMLAnchorElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates object URL, triggers download, and revokes URL", () => {
    const blob = new Blob(["test"], { type: "application/octet-stream" });
    downloadBlob(blob, "test-file.xlsx");

    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:http://localhost/fake");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/lib/download.test.ts
```

Expected: FAIL — cannot find module `@/lib/download`

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/download.ts`:

```ts
/**
 * Download a Blob as a file by creating a temporary object URL and clicking an anchor.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/__tests__/lib/download.test.ts
```

Expected: PASS

- [ ] **Step 5: Replace 7 blob patterns in api.ts**

In `frontend/src/lib/api.ts`, add import at top:

```ts
import { downloadBlob } from "@/lib/download";
```

Replace each blob download pattern. There are 7 occurrences. Each follows this shape:

```ts
// BEFORE (example: downloadTeacherTemplate, line 172-182)
downloadTeacherTemplate: () => {
  client
    .get("/users/teachers/template", { responseType: "blob" })
    .then((r) => {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "教师账号导入模板.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    });
},

// AFTER
downloadTeacherTemplate: () => {
  client
    .get("/users/teachers/template", { responseType: "blob" })
    .then((r) => downloadBlob(r.data, "教师账号导入模板.xlsx"));
},
```

Apply the same transformation to all 7:
1. `downloadTeacherTemplate` → filename `"教师账号导入模板.xlsx"`
2. `exportTeachers` → filename `` `教师账号_${new Date().toISOString().slice(0, 10)}.xlsx` ``
3. `downloadRelationsTemplate` → filename `"师生关系导入模板.xlsx"`
4. `downloadTemplate` (students) → filename `"学生账号导入模板.xlsx"`
5. `exportStudents` → filename `` `学生账号_${new Date().toISOString().slice(0, 10)}.xlsx` ``
6. `faqApi.downloadTemplate` → filename `"FAQ_导入模板.xlsx"`
7. `faqApi.exportExcel` → filename `` `${kbName}_FAQ.xlsx` ``

- [ ] **Step 6: Run TypeScript check**

```bash
cd frontend && npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/download.ts frontend/src/__tests__/lib/download.test.ts frontend/src/lib/api.ts
git commit -m "refactor(frontend): extract downloadBlob utility, deduplicate 7 blob patterns in api.ts"
```

---

## Task 3: Extract shared Toast component

**Files:**
- Create: `frontend/src/components/ui/Toast.tsx`
- Modify: `frontend/src/pages/ConversationsPage.tsx` (remove lines 1771-1801)
- Modify: `frontend/src/pages/FaqPage.tsx` (remove lines 51-72)
- Modify: `frontend/src/pages/KnowledgeBasePage.tsx` (remove lines 85-106)

- [ ] **Step 1: Create shared Toast component**

Create `frontend/src/components/ui/Toast.tsx`:

```tsx
import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
  /** Auto-dismiss delay in ms. Pass 0 to disable. Default: 3000 */
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm z-50 animate-apple-toast ${
        type === "success" ? "bg-slate-700" : "bg-red-600"
      }`}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        className="opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

Note: The 4 existing Toast implementations differ slightly in styling (position, colors). We unify to `bottom-6 right-6` + `bg-slate-700` for success. ConversationsPage used `bottom-24 left-1/2` — we override it there via a prop or accept the minor visual change (simpler, consistent).

- [ ] **Step 2: Replace Toast in KnowledgeBasePage.tsx**

In `frontend/src/pages/KnowledgeBasePage.tsx`:
- Remove the inline `Toast` function (lines 85-106)
- Add import at top: `import { Toast } from "@/components/ui/Toast";`

- [ ] **Step 3: Replace Toast in FaqPage.tsx**

In `frontend/src/pages/FaqPage.tsx`:
- Remove the inline `Toast` function (lines 51-72)
- Add import at top: `import { Toast } from "@/components/ui/Toast";`

- [ ] **Step 4: Replace Toast in ConversationsPage.tsx**

In `frontend/src/pages/ConversationsPage.tsx`:
- Remove the inline `Toast` function (lines 1771-1801, end of file)
- Add import at top: `import { Toast } from "@/components/ui/Toast";`

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Toast.tsx frontend/src/pages/ConversationsPage.tsx frontend/src/pages/FaqPage.tsx frontend/src/pages/KnowledgeBasePage.tsx
git commit -m "refactor(frontend): extract shared Toast component, remove 3 inline duplicates"
```

---

## Task 4: Extract shared ConfirmDialog component

**Files:**
- Create: `frontend/src/components/ui/ConfirmDialog.tsx`
- Modify: `frontend/src/pages/KnowledgeBasePage.tsx` (remove lines 108-149)
- Modify: `frontend/src/pages/FaqPage.tsx` (the ConfirmDeleteDialog, lines 229-277)

- [ ] **Step 1: Create shared ConfirmDialog**

Create `frontend/src/components/ui/ConfirmDialog.tsx`:

```tsx
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  destructive?: boolean;
}

export function ConfirmDialog({
  title = "确认删除",
  message,
  confirmLabel = "删除",
  onConfirm,
  onCancel,
  loading,
  destructive = true,
}: ConfirmDialogProps) {
  const btnClass = destructive
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-slate-700 text-white hover:bg-slate-800";

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 animate-apple-fade">
      <div className="glass-card rounded-xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-4 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm rounded-md disabled:opacity-60 flex items-center gap-2 ${btnClass}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace ConfirmDialog in KnowledgeBasePage.tsx**

In `frontend/src/pages/KnowledgeBasePage.tsx`:
- Remove the inline `ConfirmDialog` function (lines 108-149)
- Add import: `import { ConfirmDialog } from "@/components/ui/ConfirmDialog";`
- Update usage to pass `message` prop instead of `name`:

```tsx
// BEFORE
<ConfirmDialog name={deleteTarget.name} onConfirm={...} onCancel={...} loading={...} />

// AFTER
<ConfirmDialog
  message={`将删除知识库 "${deleteTarget.name}" 及其所有文档，此操作不可撤销。`}
  onConfirm={...}
  onCancel={...}
  loading={...}
/>
```

- [ ] **Step 3: Replace ConfirmDeleteDialog in FaqPage.tsx**

In `frontend/src/pages/FaqPage.tsx`:
- Remove the inline `ConfirmDeleteDialog` (lines 229-277)
- Add import: `import { ConfirmDialog } from "@/components/ui/ConfirmDialog";`
- Update usage to match new props interface (pass `message` string).

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ConfirmDialog.tsx frontend/src/pages/KnowledgeBasePage.tsx frontend/src/pages/FaqPage.tsx
git commit -m "refactor(frontend): extract shared ConfirmDialog, remove 2 inline duplicates"
```

---

## Task 5: Extract streamChat + buildHistory to lib/

**Files:**
- Create: `frontend/src/lib/streamChat.ts`
- Test: `frontend/src/__tests__/lib/streamChat.test.ts`
- Modify: `frontend/src/pages/ConversationsPage.tsx`

- [ ] **Step 1: Write the failing test for buildHistory**

Create `frontend/src/__tests__/lib/streamChat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHistory } from "@/lib/streamChat";
import type { ChatMessage, HistoryMessage } from "@/types/api";

function msg(role: "user" | "assistant", content: string, status = "done"): ChatMessage {
  return { role, content, status } as ChatMessage;
}

describe("buildHistory", () => {
  it("returns empty array for empty messages", () => {
    expect(buildHistory([])).toEqual([]);
  });

  it("pairs user+assistant messages", () => {
    const msgs = [msg("user", "hello"), msg("assistant", "hi")];
    const result = buildHistory(msgs);
    expect(result).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("truncates long assistant messages at 1500 chars", () => {
    const long = "a".repeat(2000);
    const msgs = [msg("user", "q"), msg("assistant", long)];
    const result = buildHistory(msgs);
    expect(result[1].content).toHaveLength(1500 + "\n...(内容已截断)".length);
    expect(result[1].content).toContain("...(内容已截断)");
  });

  it("only keeps last 10 turns (20 messages)", () => {
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 15; i++) {
      msgs.push(msg("user", `q${i}`));
      msgs.push(msg("assistant", `a${i}`));
    }
    const result = buildHistory(msgs);
    expect(result.length).toBe(20);
    expect(result[0].content).toBe("q5");
  });

  it("skips unpaired messages", () => {
    const msgs = [msg("user", "q1"), msg("user", "q2"), msg("assistant", "a2")];
    const result = buildHistory(msgs);
    expect(result).toEqual([
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("skips assistant messages that are not done", () => {
    const msgs = [msg("user", "q"), msg("assistant", "...", "loading")];
    expect(buildHistory(msgs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/lib/streamChat.test.ts
```

Expected: FAIL — cannot find module `@/lib/streamChat`

- [ ] **Step 3: Create streamChat.ts**

Create `frontend/src/lib/streamChat.ts` by moving lines 50-186 from ConversationsPage.tsx:

```ts
import {
  getAccessToken,
  getRefreshToken,
  saveAuth,
  clearAuth,
  getCurrentPortal,
} from "@/lib/auth";
import type { ChatMessage, FileItem, HistoryMessage, SourceItem } from "@/types/api";

const MAX_HISTORY_TURNS = 10;
const MAX_MSG_LENGTH = 1500;

export function buildHistory(messages: ChatMessage[]): HistoryMessage[] {
  const pairs: HistoryMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const next = messages[i + 1];
    if (
      m.role === "user" &&
      next?.role === "assistant" &&
      next?.status === "done"
    ) {
      pairs.push({ role: "user", content: m.content });
      pairs.push({
        role: "assistant",
        content:
          next.content.length > MAX_MSG_LENGTH
            ? next.content.slice(0, MAX_MSG_LENGTH) + "\n...(内容已截断)"
            : next.content,
      });
      i++;
    }
  }
  return pairs.slice(-MAX_HISTORY_TURNS * 2);
}

export async function streamChat(
  kb_name: string,
  query: string,
  max_reformulations: number,
  history: HistoryMessage[],
  signal: AbortSignal,
  onStatus: (step: string) => void,
  onAnswer: (text: string) => void,
  onSources: (sources: SourceItem[]) => void,
  onError: (msg: string) => void,
  onToken?: (text: string) => void,
  onAgentAction?: (tool: string, input: string) => void,
  onFile?: (file: FileItem) => void,
  onSuggestions?: (items: string[]) => void,
): Promise<void> {
  const token = getAccessToken();
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kb_name, query, max_reformulations, history }),
    signal,
  });
  if (resp.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshResp = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshResp.ok) {
          const data = await refreshResp.json();
          saveAuth(data);
          return streamChat(
            kb_name, query, max_reformulations, history, signal,
            onStatus, onAnswer, onSources, onError, onToken, onAgentAction, onFile, onSuggestions,
          );
        }
      } catch {
        /* refresh failed */
      }
    }
    const p = getCurrentPortal();
    clearAuth(p);
    window.location.href = p === "student" ? "/student/login" : "/admin/login";
    return;
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.detail ?? `HTTP ${resp.status}`);
    return;
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (currentEvent === "status") onStatus(data.step);
          else if (currentEvent === "token") onToken?.(data.text);
          else if (currentEvent === "agent_action")
            onAgentAction?.(data.tool, data.input ?? "");
          else if (currentEvent === "answer") onAnswer(data.text);
          else if (currentEvent === "sources") onSources(data.sources);
          else if (currentEvent === "file") onFile?.(data as FileItem);
          else if (currentEvent === "suggestions") onSuggestions?.(data.items);
          else if (currentEvent === "error") onError(data.message);
        } catch {
          /* ignore parse errors */
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/__tests__/lib/streamChat.test.ts
```

Expected: PASS (all 5 buildHistory tests)

- [ ] **Step 5: Update ConversationsPage.tsx imports**

In `frontend/src/pages/ConversationsPage.tsx`:
- Remove lines 50-186 (the `buildHistory` function, `MAX_HISTORY_TURNS`, `MAX_MSG_LENGTH` constants, and `streamChat` function)
- Add import at top:

```ts
import { buildHistory, streamChat } from "@/lib/streamChat";
```

- Remove unused imports that were only used by streamChat: `getAccessToken`, `getRefreshToken`, `saveAuth`, `clearAuth`, `getCurrentPortal` from `@/lib/auth` (check if any are still used by the main component — `getCurrentPortal` may still be needed).

- [ ] **Step 6: Run TypeScript check + tests**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
```

Expected: No type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/streamChat.ts frontend/src/__tests__/lib/streamChat.test.ts frontend/src/pages/ConversationsPage.tsx
git commit -m "refactor(frontend): extract streamChat + buildHistory to lib/streamChat.ts"
```

---

## Task 6: Extract chat sub-components (part 1 — leaf components)

**Files:**
- Create: `frontend/src/components/chat/AgentAvatar.tsx`
- Create: `frontend/src/components/chat/FileCard.tsx`
- Create: `frontend/src/components/chat/SourcesPanel.tsx`
- Create: `frontend/src/components/chat/AcademicMarkdown.tsx`
- Modify: `frontend/src/pages/ConversationsPage.tsx`

- [ ] **Step 1: Create AgentAvatar.tsx**

Create `frontend/src/components/chat/AgentAvatar.tsx` — move the `AgentAvatar` memo component (ConversationsPage lines 190-225):

```tsx
import { memo } from "react";

export const AgentAvatar = memo(function AgentAvatar({ isStudent }: { isStudent: boolean }) {
  return (
    <div
      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 hover:rotate-3 border ${
        isStudent
          ? "bg-blue-50 text-[#2563EB] border-[#DBEAFE]"
          : "bg-slate-100 text-[#334155] border-[#E2E8F0]"
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3L2 8L12 13L22 8L12 3Z" />
        <path d="M6 10V15.5C6 15.5 8.5 17.5 12 17.5C15.5 17.5 18 15.5 18 15.5V10" />
        <path d="M22 8V13" />
        <circle cx="12" cy="8" r="1.5" fill="currentColor" className="animate-pulse" />
        <circle cx="12" cy="14" r="1" fill="currentColor" opacity="0.5" />
      </svg>
    </div>
  );
});
```

- [ ] **Step 2: Create FileCard.tsx**

Create `frontend/src/components/chat/FileCard.tsx` — move FileCard (ConversationsPage lines 229-287):

```tsx
import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { documentApi } from "@/lib/api";
import type { FileItem } from "@/types/api";

const EXT_COLORS: Record<string, string> = {
  pdf: "bg-red-500",
  docx: "bg-blue-500",
  doc: "bg-blue-500",
  xlsx: "bg-green-600",
  xls: "bg-green-600",
  pptx: "bg-orange-500",
  ppt: "bg-orange-500",
  txt: "bg-gray-500",
};

export function FileCard({ file }: { file: FileItem }) {
  const ext = file.file_name.split(".").pop()?.toLowerCase() ?? "";
  const badgeColor = EXT_COLORS[ext] ?? "bg-gray-500";
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { token } = await documentApi.getDownloadToken(file.url);
      const a = document.createElement("a");
      a.href = `${file.url}?token=${token}`;
      a.download = file.file_name;
      a.click();
    } catch {
      // silent fail
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      onClick={handleDownload}
      className="cursor-pointer flex items-center gap-3 bg-[#F7F5F1] border border-[#E8E4DC] rounded-xl px-3 py-2.5 hover:bg-[#F0EDE8] transition-colors group"
    >
      <div
        className={`${badgeColor} text-white text-[10px] font-bold uppercase rounded-md px-1.5 py-1 min-w-[2.2rem] text-center leading-none`}
      >
        {ext || "FILE"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.file_name}</p>
        <p className="text-xs text-gray-400">{file.size_kb} KB</p>
      </div>
      {downloading ? (
        <Loader2 size={14} className="text-gray-400 shrink-0 animate-spin" />
      ) : (
        <Download size={14} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create SourcesPanel.tsx**

Create `frontend/src/components/chat/SourcesPanel.tsx` — move SourcesPanel (ConversationsPage lines 291-335):

```tsx
import { useState } from "react";
import { BookOpen, ChevronUp, ChevronDown } from "lucide-react";
import type { SourceItem } from "@/types/api";

export function SourcesPanel({ sources }: { sources: SourceItem[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors uppercase tracking-wider"
      >
        <BookOpen size={12} />
        知识库参考 ({sources.length})
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-2 animate-apple-fade-up">
          {sources.map((s, i) => (
            <div key={s.node_id} className="bg-gray-50/50 rounded-xl p-3 border border-gray-100/50">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-white border border-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shadow-sm">
                  {i + 1}
                </span>
                <span className="text-[11px] font-semibold text-gray-700 break-all">{s.source_file}</span>
                <div className="ml-auto flex items-center gap-1 opacity-40">
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                  <span className="text-[9px] font-medium">REL {Math.round(s.score * 100)}%</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed italic whitespace-pre-wrap">
                "{s.text}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create AcademicMarkdown.tsx**

Create `frontend/src/components/chat/AcademicMarkdown.tsx` — move AcademicMarkdown (ConversationsPage lines 339-430):

```tsx
import ReactMarkdown from "react-markdown";
import type { SourceItem } from "@/types/api";

export function AcademicMarkdown({
  content,
  sources,
}: {
  content: string;
  sources?: SourceItem[];
}) {
  let processedContent = content.replace(
    /\[(.*?)\]\(sandbox:\/mnt\/data\/(.*?)\)/g,
    (_, p1, p2) => `[${p1}](#sandbox:${encodeURIComponent(p2)})`,
  );

  const parts = processedContent.split(/(\[\d+(?:,\s*\d+)*\])/g);

  return (
    <div className="prose prose-sm prose-academic max-w-none">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
        if (match && sources && sources.length > 0) {
          const indices = match[1].split(",").map((s) => parseInt(s.trim()) - 1);
          return (
            <span key={i} className="inline-flex gap-0.5">
              {indices.map((idx) => {
                const source = sources[idx];
                if (!source) return <span key={idx}>{part}</span>;
                return (
                  <span
                    key={idx}
                    title={`${source.source_file}: ${source.text.slice(0, 100)}...`}
                    className="citation-marker"
                  >
                    {idx + 1}
                  </span>
                );
              })}
            </span>
          );
        }
        return (
          <ReactMarkdown
            key={i}
            components={{
              p: "span",
              a: ({ href, children, ...props }) => {
                if (href?.startsWith("#sandbox:")) {
                  const filename = decodeURIComponent(href.replace("#sandbox:", ""));
                  return (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        alert(
                          `【演示文件下载】\n\n文件名: ${filename}\n\n注：此为 AI 生成的演示下载链接，实际物理文件并未在此演示环境中持久化。`,
                        );
                      }}
                      className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
                      {...(props as any)}
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
                    {...(props as any)}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {part}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Update ConversationsPage.tsx**

In `frontend/src/pages/ConversationsPage.tsx`:
- Remove `AgentAvatar` (lines 188-225), `EXT_COLORS` + `FileCard` (lines 229-287), `SourcesPanel` (lines 289-335), `AcademicMarkdown` (lines 337-430)
- Add imports:

```ts
import { AgentAvatar } from "@/components/chat/AgentAvatar";
import { FileCard } from "@/components/chat/FileCard";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { AcademicMarkdown } from "@/components/chat/AcademicMarkdown";
```

- Remove unused imports that were only used by moved components: `ReactMarkdown`, `BookOpen`, `Download` (check if still used elsewhere in the file).

- [ ] **Step 6: Run TypeScript check + tests**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
```

Expected: No errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/ frontend/src/pages/ConversationsPage.tsx
git commit -m "refactor(frontend): extract AgentAvatar, FileCard, SourcesPanel, AcademicMarkdown from ConversationsPage"
```

---

## Task 7: Extract chat sub-components (part 2 — MessageBubble + ThinkingProcess)

**Files:**
- Create: `frontend/src/components/chat/MessageBubble.tsx`
- Create: `frontend/src/components/chat/ThinkingProcess.tsx`
- Modify: `frontend/src/pages/ConversationsPage.tsx`

- [ ] **Step 1: Create MessageBubble.tsx**

Create `frontend/src/components/chat/MessageBubble.tsx` — move MessageActions (lines 434-483) + MessageBubble (lines 487-586):

```tsx
import { memo } from "react";
import { Loader2, AlertCircle, ThumbsUp, ThumbsDown, HelpCircle } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { AcademicMarkdown } from "./AcademicMarkdown";
import { FileCard } from "./FileCard";
import { SourcesPanel } from "./SourcesPanel";
import type { ChatMessage } from "@/types/api";

function MessageActions({
  dbMessageId,
  feedback,
  onFeedback,
  onAskTutor,
}: {
  dbMessageId?: number;
  feedback?: "up" | "down" | null;
  onFeedback: (rating: "up" | "down") => void;
  onAskTutor?: () => void;
}) {
  if (!dbMessageId) return null;
  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={() => onFeedback("up")}
        className={`p-1 rounded-md transition-colors ${
          feedback === "up"
            ? "text-green-600 bg-green-50"
            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
        }`}
        title="有帮助"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={() => onFeedback("down")}
        className={`p-1 rounded-md transition-colors ${
          feedback === "down"
            ? "text-red-500 bg-red-50"
            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
        }`}
        title="没帮助"
      >
        <ThumbsDown size={13} />
      </button>
      {onAskTutor && (
        <button
          onClick={onAskTutor}
          className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-md text-[10px] text-blue-600 bg-blue-50/50 hover:bg-blue-50 hover:text-blue-700 transition-colors border border-blue-100/50 hover:border-blue-200"
          title="求助导师"
        >
          <HelpCircle size={12} />
          <span className="font-medium">求助导师</span>
        </button>
      )}
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  onFeedback,
  onSuggestionClick,
  onAskTutor,
  isStudent,
}: {
  msg: ChatMessage;
  onFeedback: (msgId: number, rating: "up" | "down") => void;
  onSuggestionClick?: (text: string) => void;
  onAskTutor?: (msg: ChatMessage) => void;
  isStudent?: boolean;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div
          className={`max-w-[85%] text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm ${isStudent ? "bg-[#2563EB]" : "bg-[#334155]"} ${msg.isNew ? "animate-apple-slide-r" : ""}`}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 mb-10 ${msg.isNew ? "animate-apple-fade-up" : ""}`}>
      <div className="flex gap-4">
        <AgentAvatar isStudent={!!isStudent} />
        <div className="flex-1 min-w-0 pt-1">
          {msg.status === "loading" ? (
            msg.content ? (
              <div className="relative">
                <AcademicMarkdown content={msg.content} sources={msg.sources} />
                <span className="cursor-blink" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-shimmer">正在思考...</span>
              </div>
            )
          ) : msg.status === "error" ? (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 px-4 py-3 rounded-xl text-sm border border-red-100 shadow-sm">
              <AlertCircle size={15} />
              <span>{msg.content}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <AcademicMarkdown content={msg.content} sources={msg.sources} />
              {msg.files && msg.files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md animate-apple-fade-up">
                  {msg.files.map((f, i) => (
                    <FileCard key={i} file={f} />
                  ))}
                </div>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <SourcesPanel sources={msg.sources} />
              )}
              <div className="flex items-center justify-between mt-4">
                <MessageActions
                  dbMessageId={msg.dbMessageId}
                  feedback={msg.feedback}
                  onFeedback={(rating) => msg.dbMessageId && onFeedback(msg.dbMessageId, rating)}
                  onAskTutor={() => onAskTutor?.(msg)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {msg.status === "done" && msg.suggestions && msg.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-12">
          {msg.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick?.(s)}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`animate-apple-fade-up text-xs px-3.5 py-1.5 rounded-full border border-gray-100 bg-white/50 text-gray-600 hover:bg-white hover:text-[#334155] hover:border-gray-200 transition-all shadow-sm active:scale-[0.97] ${isStudent ? "hover:text-[#2563EB] hover:border-[#D9DEE5]" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Create ThinkingProcess.tsx**

Create `frontend/src/components/chat/ThinkingProcess.tsx` — move ThinkingStep interface, ThinkingProcess, and ConversationSkeleton (lines 989-1063):

```tsx
import { Loader2, Check } from "lucide-react";

export interface ThinkingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  input?: string;
}

export function ThinkingProcess({ steps }: { steps: ThinkingStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 mb-6 pl-12 animate-apple-fade-up">
      <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        <Loader2 size={12} className="animate-spin" />
        Agent 思考过程
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                step.status === "active"
                  ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  : step.status === "done"
                    ? "bg-emerald-500"
                    : "bg-gray-200"
              }`}
            />
            <div className="flex flex-col min-w-0">
              <span
                className={`text-xs font-medium truncate ${
                  step.status === "pending" ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {step.label}
              </span>
              {step.input && step.status !== "pending" && (
                <span className="text-[10px] text-gray-400 truncate italic">
                  "{step.input}"
                </span>
              )}
            </div>
            {step.status === "done" && <Check size={10} className="text-emerald-500 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="flex-1 overflow-hidden p-6 space-y-8 animate-pulse">
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-xl bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-4 bg-gray-100 rounded-md w-3/4" />
          <div className="h-4 bg-gray-100 rounded-md w-1/2" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-10 bg-gray-100 rounded-2xl w-2/3" />
      </div>
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-xl bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-4 bg-gray-100 rounded-md w-full" />
          <div className="h-4 bg-gray-100 rounded-md w-5/6" />
          <div className="h-4 bg-gray-100 rounded-md w-4/6" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update ConversationsPage.tsx**

In `frontend/src/pages/ConversationsPage.tsx`:
- Remove `MessageActions` (lines 434-483), `MessageBubble` (lines 485-586), `ThinkingStep` interface (lines 989-994), `ThinkingProcess` (lines 996-1038), `ConversationSkeleton` (lines 1040-1063)
- Add imports:

```ts
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ThinkingProcess, ConversationSkeleton } from "@/components/chat/ThinkingProcess";
import type { ThinkingStep } from "@/components/chat/ThinkingProcess";
```

- Remove now-unused icon imports: `ThumbsUp`, `ThumbsDown`, `AlertCircle` (verify they're not used elsewhere in the file).

- [ ] **Step 4: Run TypeScript check + tests**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
```

Expected: No errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/MessageBubble.tsx frontend/src/components/chat/ThinkingProcess.tsx frontend/src/pages/ConversationsPage.tsx
git commit -m "refactor(frontend): extract MessageBubble + ThinkingProcess from ConversationsPage"
```

---

## Task 8: Extract ConversationSidebar + TutorHelpModal

**Files:**
- Create: `frontend/src/components/chat/ConversationSidebar.tsx`
- Create: `frontend/src/components/chat/TutorHelpModal.tsx`
- Modify: `frontend/src/pages/ConversationsPage.tsx`

- [ ] **Step 1: Create ConversationSidebar.tsx**

Create `frontend/src/components/chat/ConversationSidebar.tsx` — move `groupByDate` (lines 590-614), `ConversationItem` (lines 618-732), `AdminConversationSidebar` (lines 736-851), `StudentConversationSidebar` (lines 855-970):

```tsx
import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Loader2,
  Pencil,
  Check,
  X as XIcon,
  Trash2,
  BookOpen,
  ShieldAlert,
} from "lucide-react";
import type { ConversationInfo } from "@/types/api";

function groupByDate(conversations: ConversationInfo[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: ConversationInfo[] }[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "最近7天", items: [] },
    { label: "更早", items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

function ConversationItem({
  conv,
  active,
  theme,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: ConversationInfo;
  active: boolean;
  theme: "admin" | "student";
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(conv.title);
  }, [conv.title, editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== conv.title) onRename(conv.id, t);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(conv.title);
    setEditing(false);
  };

  const activeBorder = theme === "admin" ? "border-[#E8E4DC]" : "border-[#D9DEE5]";

  if (editing) {
    return (
      <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white shadow-sm border ${activeBorder}`}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          maxLength={50}
          className="flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-900"
        />
        <button onClick={commit} title="保存" className="p-1 rounded text-emerald-500 hover:bg-emerald-50 transition-colors">
          <Check size={13} />
        </button>
        <button onClick={cancel} title="取消" className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors">
          <XIcon size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(conv.id)}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
        active
          ? `bg-white shadow-sm border ${activeBorder} text-gray-900`
          : "text-gray-600 hover:bg-white/70"
      }`}
    >
      <span className="flex-1 truncate">{conv.title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="重命名"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-[#334155] transition-all"
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
        title="删除"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

interface SidebarProps {
  conversations: ConversationInfo[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}

interface ConversationListProps extends SidebarProps {
  theme: "admin" | "student";
  emptyText: string;
}

function ConversationList({
  conversations, activeId, theme, emptyText, onSelect, onDelete, onRename, onLoadMore, isFetchingMore,
}: ConversationListProps) {
  const groups = groupByDate(conversations);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) onLoadMore();
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [onLoadMore]);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-3">
      {conversations.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-8">{emptyText}</p>
      )}
      {(() => {
        let idx = 0;
        return groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((conv) => {
                const delay = Math.min(idx++ * 35, 280);
                return (
                  <div key={conv.id} className="animate-apple-fade-up" style={{ animationDelay: `${delay}ms` }}>
                    <ConversationItem
                      conv={conv}
                      active={conv.id === activeId}
                      theme={theme}
                      onSelect={onSelect}
                      onRename={onRename}
                      onDelete={onDelete}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}
      {isFetchingMore && (
        <div className="flex justify-center py-2">
          <Loader2 size={14} className="animate-spin text-gray-300" />
        </div>
      )}
    </div>
  );
}

export function AdminConversationSidebar({
  adminKbName,
  ...rest
}: SidebarProps & { adminKbName: string | null }) {
  return (
    <div className="w-64 shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-[#F0EDE8]">
        {adminKbName ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-emerald-50 rounded-xl mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <BookOpen size={14} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-emerald-700 leading-none mb-0.5">当前知识库</p>
              <p className="text-sm font-semibold text-emerald-900 truncate">{adminKbName}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-xl mb-2">
            <ShieldAlert size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">请在知识库页面选择管理端知识库</p>
          </div>
        )}
        <button
          onClick={rest.onNew}
          disabled={!adminKbName}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-slate-700 hover:bg-slate-800"
        >
          <Plus size={15} />
          新建对话
        </button>
      </div>
      <ConversationList {...rest} theme="admin" emptyText={adminKbName ? "暂无对话记录" : "等待知识库配置"} />
    </div>
  );
}

export function StudentConversationSidebar({
  activeKbName,
  ...rest
}: SidebarProps & { activeKbName: string | null }) {
  return (
    <div className="w-64 shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-[#EEF2FF]">
        {activeKbName ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#EEF2FF] rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center shrink-0">
              <BookOpen size={14} className="text-[#4F46E5]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-[#4338CA] leading-none mb-0.5">当前知识库</p>
              <p className="text-sm font-semibold text-[#312E81] truncate">{activeKbName}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-xl">
            <ShieldAlert size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">管理员尚未分配知识库</p>
          </div>
        )}
        <button
          onClick={rest.onNew}
          disabled={!activeKbName}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-[#2563EB] hover:bg-[#1D4ED8]"
        >
          <Plus size={15} />
          新建对话
        </button>
      </div>
      <ConversationList {...rest} theme="student" emptyText={activeKbName ? "暂无对话记录" : "等待知识库分配"} />
    </div>
  );
}
```

Note: The two sidebar components share nearly identical conversation list logic. We extract the shared `ConversationList` as an internal component — only the header differs.

- [ ] **Step 2: Create TutorHelpModal.tsx**

Create `frontend/src/components/chat/TutorHelpModal.tsx` — move TutorHelpModal (ConversationsPage lines 1666-1768):

```tsx
import { useState } from "react";
import { Loader2, X as XIcon, HelpCircle } from "lucide-react";
import { ticketApi } from "@/lib/api";
import type { ChatMessage } from "@/types/api";

export function TutorHelpModal({
  msg,
  convId,
  onClose,
  onSuccess,
}: {
  msg: ChatMessage;
  convId: number;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await ticketApi.create({
        conversation_id: convId,
        message_id: msg.dbMessageId!,
        question: question.trim(),
      });
      onSuccess("请求已发送给导师");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "发送失败，请稍后重试";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl w-full max-w-md mx-4 overflow-hidden animate-apple-pop shadow-2xl border border-white/20">
        <div className="px-6 py-4 border-b border-[#F0EDE8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <HelpCircle size={16} />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">求助导师</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <XIcon size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">AI 的回答（参考）</label>
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 line-clamp-3 border border-gray-100 italic leading-relaxed">
              {msg.content}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              描述您的问题 <span className="text-red-400">*</span>
            </label>
            <textarea
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="请详细描述 AI 回答中不足的地方，或您进一步的问题..."
              rows={4}
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none shadow-inner"
            />
          </div>
          {error && <p className="text-xs text-red-500 animate-shake">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-gray-50/50 border-t border-[#F0EDE8] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <HelpCircle size={14} />}
            发送求助
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update ConversationsPage.tsx**

In `frontend/src/pages/ConversationsPage.tsx`:
- Remove `groupByDate` (lines 588-614), `ConversationItem` (lines 616-732), `AdminConversationSidebar` (lines 734-851), `StudentConversationSidebar` (lines 853-970), `TutorHelpModal` (lines 1664-1768)
- Add imports:

```ts
import { AdminConversationSidebar, StudentConversationSidebar } from "@/components/chat/ConversationSidebar";
import { TutorHelpModal } from "@/components/chat/TutorHelpModal";
```

- Remove now-unused icon imports: `Pencil`, `Check`, `X as XIcon`, `ShieldAlert`, `BookOpen`, `HelpCircle` (check carefully — `XIcon` and `HelpCircle` may still be needed if used in main component).

- [ ] **Step 4: Run TypeScript check + tests**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
```

Expected: No errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ConversationSidebar.tsx frontend/src/components/chat/TutorHelpModal.tsx frontend/src/pages/ConversationsPage.tsx
git commit -m "refactor(frontend): extract ConversationSidebar + TutorHelpModal from ConversationsPage"
```

---

## Task 9: Final cleanup and verification

**Files:**
- Modify: `frontend/src/pages/ConversationsPage.tsx` (clean up unused imports)

- [ ] **Step 1: Verify ConversationsPage size**

```bash
wc -l frontend/src/pages/ConversationsPage.tsx
```

Expected: ~400-500 lines (down from 1,800). The file should now contain only:
- `STATUS_TEXT` and `TOOL_LABELS` constants
- The main `ConversationsPage` component with state, queries, callbacks, and JSX layout
- All sub-components imported from `@/components/chat/`

- [ ] **Step 2: Clean up imports in ConversationsPage.tsx**

Remove any imports that are no longer used after extraction. Run:

```bash
cd frontend && npx tsc -b --noEmit
```

Fix any unused import warnings.

- [ ] **Step 3: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Run TypeScript build**

```bash
cd frontend && npx tsc -b
```

Expected: No errors.

- [ ] **Step 5: Visual verification**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/admin` and `http://localhost:5173/student` in browser. Verify:
- Chat page loads correctly
- SSE streaming works
- Message bubbles render with markdown
- Sidebars show conversation list with date grouping
- File cards download correctly
- Sources panel expands/collapses
- Thinking process animation works
- Toast notifications appear
- Tutor help modal opens and submits

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ConversationsPage.tsx
git commit -m "refactor(frontend): clean up ConversationsPage imports after extraction"
```

- [ ] **Step 7: Code review checkpoint**

Use `superpowers:requesting-code-review` to review Phase 1 changes.

---

## Summary

After Phase 1 completion:

| Metric | Before | After |
|--------|--------|-------|
| ConversationsPage.tsx | 1,800 lines | ~400-500 lines |
| Shared UI components | 0 | 3 (Toast, ConfirmDialog, downloadBlob) |
| Chat components | 0 (all inline) | 9 files under components/chat/ |
| Duplicate Toast | 4 copies | 1 shared |
| Duplicate download blob | 7 copies | 1 utility |
| Duplicate ConfirmDialog | 2 copies | 1 shared |
| Test files | 0 | 2 (download, streamChat) |

**Next:** Phase 2 (backend behavior-protection tests) and Phase 3 (backend storage layer split) will be planned in separate documents after Phase 1 is complete and reviewed.
