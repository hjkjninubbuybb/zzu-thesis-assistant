# Frontend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor frontend from monolithic pages into Feature-Sliced Design with Zustand stores and shadcn/ui components.

**Architecture:** New `features/` directory (one self-contained module per business domain), `shared/` for cross-feature resources, thin `pages/` as route-only entry points. Zustand replaces AuthContext/UploadContext. shadcn/ui replaces hand-rolled Button/Input/Modal primitives.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query v5, Zustand, shadcn/ui (Radix UI), Tailwind CSS, eslint-plugin-boundaries

**Spec:** `docs/superpowers/specs/2026-05-27-frontend-refactor-design.md`

---

## Phase 0 — Foundation

### Task 1: Install missing dependencies

**Files:**
- Modify: `frontend/package.json` (via npm install)

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
npm install zustand sonner @radix-ui/react-dialog @radix-ui/react-select \
  @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-label \
  @radix-ui/react-slot @radix-ui/react-separator @radix-ui/react-checkbox \
  @radix-ui/react-popover
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D eslint-plugin-boundaries
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add zustand, radix-ui, sonner, eslint-plugin-boundaries"
```

---

### Task 2: Update path aliases and shadcn config

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/components.json`

- [ ] **Step 1: Update `frontend/vite.config.ts`** — replace the `alias` block:

```ts
resolve: {
  alias: {
    "@":          path.resolve(__dirname, "./src"),
    "@features":  path.resolve(__dirname, "./src/features"),
    "@shared":    path.resolve(__dirname, "./src/shared"),
    "@pages":     path.resolve(__dirname, "./src/pages"),
  },
},
```

- [ ] **Step 2: Update `frontend/tsconfig.app.json`** — replace `paths`:

```json
"paths": {
  "@/*":          ["./src/*"],
  "@features/*":  ["./src/features/*"],
  "@shared/*":    ["./src/shared/*"],
  "@pages/*":     ["./src/pages/*"]
}
```

- [ ] **Step 3: Update `frontend/components.json`** — replace `aliases` block so shadcn generates files into `shared/`:

```json
"aliases": {
  "components": "@shared/components",
  "utils": "@shared/lib/utils",
  "ui": "@shared/components/ui",
  "lib": "@shared/lib",
  "hooks": "@shared/hooks"
}
```

- [ ] **Step 4: Verify build still passes**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: Build succeeds (no code changes yet, only config).

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/vite.config.ts frontend/tsconfig.app.json frontend/components.json
git commit -m "chore(frontend): update path aliases and shadcn aliases for FSD layout"
```

---

### Task 3: Scaffold directory structure

**Files:**
- Create: all new `frontend/src/` directories

- [ ] **Step 1: Create all directories**

```bash
cd /Users/gefeng/projects/rag1.0/frontend/src
mkdir -p app
mkdir -p features/auth/{components,hooks,services}
mkdir -p features/knowledge/{components,hooks,services}
mkdir -p features/documents/{components,hooks,services}
mkdir -p features/faq/{components,hooks,services}
mkdir -p features/conversations/{components,hooks,services}
mkdir -p features/users/{components,hooks,services}
mkdir -p features/tickets/{components,hooks,services}
mkdir -p features/analytics/{components,hooks,services}
mkdir -p features/settings/{components,hooks,services}
mkdir -p features/student/{components,hooks,services}
mkdir -p shared/components/{ui,layout}
mkdir -p shared/{hooks,services,store,lib,types}
mkdir -p pages/{admin,student}
```

- [ ] **Step 2: Commit**

```bash
cd ../../..
git add frontend/src/
git commit -m "chore(frontend): scaffold FSD directory skeleton"
```

---

### Task 4: Migrate shared/lib and shared/types

**Files:**
- Create: `frontend/src/shared/types/api.ts`
- Create: `frontend/src/shared/lib/auth.ts`
- Create: `frontend/src/shared/lib/utils.ts`
- Create: `frontend/src/shared/lib/download.ts`
- Create: `frontend/src/shared/lib/streamChat.ts`
- Create: `frontend/src/shared/lib/api.ts`
- Create: `frontend/src/shared/lib/errorHandler.ts`

- [ ] **Step 1: Copy types**

```bash
cd /Users/gefeng/projects/rag1.0/frontend/src
cp types/api.ts shared/types/api.ts
```

- [ ] **Step 2: Copy lib files, rewriting internal imports to `@shared/`**

```bash
sed 's|@/types/api|@shared/types/api|g; s|@/lib/auth|@shared/lib/auth|g; s|@/lib/download|@shared/lib/download|g' lib/auth.ts > shared/lib/auth.ts

cp lib/utils.ts shared/lib/utils.ts
cp lib/download.ts shared/lib/download.ts

sed 's|@/lib/auth|@shared/lib/auth|g; s|@/types/api|@shared/types/api|g' lib/streamChat.ts > shared/lib/streamChat.ts

sed 's|@/types/api|@shared/types/api|g; s|@/lib/auth|@shared/lib/auth|g; s|@/lib/download|@shared/lib/download|g' lib/api.ts > shared/lib/api.ts
```

- [ ] **Step 3: Create `frontend/src/shared/lib/errorHandler.ts`**

```ts
import axios from "axios";

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

- [ ] **Step 4: Verify new shared files compile**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors (old files still exist, new ones coexist).

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/shared/
git commit -m "feat(frontend/shared): migrate lib and types to shared/"
```

---

### Task 5: Create Zustand stores

**Files:**
- Create: `frontend/src/shared/store/authStore.ts`
- Create: `frontend/src/shared/store/uiStore.ts`
- Create: `frontend/src/shared/store/uploadStore.ts`

- [ ] **Step 1: Create `frontend/src/shared/store/authStore.ts`**

```ts
import { create } from "zustand";
import type { UserInfo } from "@shared/types/api";
import {
  getStoredUser,
  saveAuth,
  clearAuth,
  getCurrentPortal,
  type Portal,
} from "@shared/lib/auth";
import { authApi } from "@shared/lib/api";

interface AuthState {
  user: UserInfo | null;
  portal: Portal | null;
  setUser: (user: UserInfo | null) => void;
  setPortal: (portal: Portal) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  isStudent: () => boolean;
  hydrate: () => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  portal: null,

  setUser: (user) => set({ user }),
  setPortal: (portal) => set({ portal }),

  hydrate: () => {
    const portal = getCurrentPortal();
    const user = getStoredUser(portal);
    set({ user, portal });
  },

  login: async (username, password) => {
    const portal = get().portal ?? getCurrentPortal();
    const data = await authApi.login(username, password);
    saveAuth(data, portal);
    set({ user: data.user });
  },

  logout: () => {
    const portal = get().portal ?? getCurrentPortal();
    clearAuth(portal);
    set({ user: null });
  },

  isAdmin: () => get().user?.role === "admin",
  isTeacher: () => get().user?.role === "teacher",
  isStudent: () => get().user?.role === "student",
}));

// Selector hooks — components only use these, never access the store directly
export const useAuthUser    = () => useAuthStore((s) => s.user);
export const useAuthLogin   = () => useAuthStore((s) => s.login);
export const useAuthLogout  = () => useAuthStore((s) => s.logout);
export const useSetUser     = () => useAuthStore((s) => s.setUser);
export const useSetPortal   = () => useAuthStore((s) => s.setPortal);
export const useHydrate     = () => useAuthStore((s) => s.hydrate);
export const useIsAdmin     = () => useAuthStore((s) => s.isAdmin());
export const useIsTeacher   = () => useAuthStore((s) => s.isTeacher());
export const useIsStudent   = () => useAuthStore((s) => s.isStudent());
export const useAuthPortal  = () => useAuthStore((s) => s.portal);

export default useAuthStore;
```

- [ ] **Step 2: Create `frontend/src/shared/store/uiStore.ts`**

```ts
import { create } from "zustand";

export interface ToastPayload {
  id: string;
  message: string;
  type: "success" | "error";
}

export interface ConfirmPayload {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface UIState {
  sidebarCollapsed: boolean;
  toasts: ToastPayload[];
  confirmDialog: ConfirmPayload | null;
  activeKBName: string | null;

  setSidebarCollapsed: (v: boolean) => void;
  showToast: (message: string, type: "success" | "error") => void;
  dismissToast: (id: string) => void;
  showConfirm: (payload: ConfirmPayload) => void;
  dismissConfirm: () => void;
  setActiveKBName: (name: string | null) => void;
}

const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toasts: [],
  confirmDialog: null,
  activeKBName: null,

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  showToast: (message, type) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  showConfirm: (payload) => set({ confirmDialog: payload }),
  dismissConfirm: () => set({ confirmDialog: null }),

  setActiveKBName: (name) => set({ activeKBName: name }),
}));

// Selector hooks
export const useToast       = () => useUIStore((s) => ({ toasts: s.toasts, showToast: s.showToast, dismissToast: s.dismissToast }));
export const useConfirm     = () => useUIStore((s) => ({ dialog: s.confirmDialog, showConfirm: s.showConfirm, dismissConfirm: s.dismissConfirm }));
export const useActiveKB    = () => useUIStore((s) => s.activeKBName);
export const useSetActiveKB = () => useUIStore((s) => s.setActiveKBName);
export const useSidebar     = () => useUIStore((s) => ({ collapsed: s.sidebarCollapsed, set: s.setSidebarCollapsed }));

export default useUIStore;
```

- [ ] **Step 3: Create `frontend/src/shared/store/uploadStore.ts`**

The upload queue state lives in Zustand; the async upload processing (which needs `useQueryClient`) lives in a companion hook `useUploadProcessor` that is mounted once in the root layout.

```ts
import { create } from "zustand";
import type { DocType, UploadParams, CleanResult } from "@shared/types/api";

export type UploadStatus = "pending" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  file: File;
  kbName: string;
  docType: DocType;
  params: UploadParams;
  status: UploadStatus;
  progress: number;
  cleanResult?: CleanResult;
  errorMsg?: string;
}

interface UploadState {
  queue: UploadItem[];
  enqueue: (kbName: string, docType: DocType, files: File[], params: UploadParams) => void;
  updateItem: (id: string, patch: Partial<UploadItem>) => void;
  removeItem: (id: string) => void;
  clearDone: (kbName: string, docType: DocType) => void;
}

const useUploadStore = create<UploadState>((set) => ({
  queue: [],

  enqueue: (kbName, docType, files, params) => {
    const items: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      kbName,
      docType,
      params,
      status: "pending",
      progress: 0,
    }));
    set((s) => ({ queue: [...s.queue, ...items] }));
  },

  updateItem: (id, patch) =>
    set((s) => ({
      queue: s.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    })),

  removeItem: (id) =>
    set((s) => ({
      queue: s.queue.filter((q) => !(q.id === id && q.status !== "uploading")),
    })),

  clearDone: (kbName, docType) =>
    set((s) => ({
      queue: s.queue.filter(
        (q) =>
          !(q.kbName === kbName && q.docType === docType && q.status === "done"),
      ),
    })),
}));

// Selector hooks
export const useUploadQueue  = () => useUploadStore((s) => s.queue);
export const useEnqueue      = () => useUploadStore((s) => s.enqueue);
export const useRemoveItem   = () => useUploadStore((s) => s.removeItem);
export const useClearDone    = () => useUploadStore((s) => s.clearDone);
export const useUpdateItem   = () => useUploadStore((s) => s.updateItem);

export default useUploadStore;
```

- [ ] **Step 4: Create `frontend/src/shared/hooks/useUploadProcessor.ts`**

This hook encapsulates the upload processing loop. Mount it once inside `AppLayout` and `StudentLayout`.

```ts
import { useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { documentApi } from "@shared/lib/api";
import { getErrorMessage } from "@shared/lib/errorHandler";
import useUploadStore from "@shared/store/uploadStore";

/**
 * 挂载一次（在布局组件里），监听上传队列并串行处理。
 * 使用 ref 镜像 queue 以避免 async 闭包读到旧值。
 */
export function useUploadProcessor() {
  const qc = useQueryClient();
  const queue = useUploadStore((s) => s.queue);
  const updateItem = useUploadStore((s) => s.updateItem);
  const queueRef = useRef(queue);
  const runningRef = useRef(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const hasPending = queue.some((q) => q.status === "pending");
    if (!hasPending || runningRef.current) return;

    const process = async () => {
      runningRef.current = true;
      while (true) {
        const pending = queueRef.current.find((q) => q.status === "pending");
        if (!pending) break;

        updateItem(pending.id, { status: "uploading", progress: 0 });

        try {
          const doc = await documentApi.uploadAndClean(
            pending.kbName,
            pending.file,
            pending.params,
            (pct) => updateItem(pending.id, { progress: pct }),
          );
          updateItem(pending.id, { status: "done", progress: 100, cleanResult: doc });
          qc.invalidateQueries({ queryKey: ["documents", pending.kbName] });
          qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
        } catch (e) {
          updateItem(pending.id, { status: "error", errorMsg: getErrorMessage(e) });
        }
      }
      runningRef.current = false;
    };

    process();
  }, [queue, updateItem, qc]);
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/shared/store/ frontend/src/shared/hooks/useUploadProcessor.ts
git commit -m "feat(frontend/shared): add authStore, uiStore, uploadStore + useUploadProcessor"
```

---

### Task 6: Add shadcn/ui components

**Files:**
- Create: `frontend/src/shared/components/ui/` (via shadcn CLI)

- [ ] **Step 1: Add shadcn components**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
npx shadcn@latest add button dialog input select badge table tabs skeleton tooltip textarea label separator
```

When prompted "Would you like to use Next.js config?" → No.
Accept all other defaults.

- [ ] **Step 2: Add sonner toast**

```bash
npx shadcn@latest add sonner
```

- [ ] **Step 3: Verify generated files are in shared/components/ui/**

```bash
ls src/shared/components/ui/
```

Expected: `button.tsx`, `dialog.tsx`, `input.tsx`, `select.tsx`, `badge.tsx`, `table.tsx`, `tabs.tsx`, `skeleton.tsx`, `tooltip.tsx`, `textarea.tsx`, `label.tsx`, `separator.tsx`, `sonner.tsx`

If shadcn generated them in `src/components/ui/` instead (due to alias resolution), move them:
```bash
mv src/components/ui/* src/shared/components/ui/ 2>/dev/null || true
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/shared/components/ui/
git commit -m "feat(frontend/shared): add shadcn/ui component set"
```

---

### Task 7: Migrate layout and RouteGuard to shared/

**Files:**
- Create: `frontend/src/shared/components/layout/AppLayout.tsx`
- Create: `frontend/src/shared/components/layout/Sidebar.tsx`
- Create: `frontend/src/shared/components/layout/StudentLayout.tsx`
- Create: `frontend/src/shared/components/layout/StudentSidebar.tsx`
- Create: `frontend/src/shared/components/layout/BlobBackdrop.tsx`
- Create: `frontend/src/shared/components/RouteGuard.tsx`

- [ ] **Step 1: Copy layout files, updating imports**

```bash
cd /Users/gefeng/projects/rag1.0/frontend/src

for f in AppLayout Sidebar StudentLayout StudentSidebar BlobBackdrop; do
  sed 's|@/lib/|@shared/lib/|g; s|@/types/|@shared/types/|g; s|@/hooks/useAuth|@shared/store/authStore|g' \
    components/layout/${f}.tsx > shared/components/layout/${f}.tsx
done
```

- [ ] **Step 2: Update Sidebar.tsx to use Zustand instead of useAuth**

Open `frontend/src/shared/components/layout/Sidebar.tsx`. Replace any `useAuth()` call with the authStore selectors:

```tsx
// Replace:
// import { useAuth } from "@/hooks/useAuth";
// const { user, isAdmin } = useAuth();

// With:
import { useAuthUser, useIsAdmin, useAuthLogout } from "@shared/store/authStore";
const user = useAuthUser();
const isAdmin = useIsAdmin();
const logout = useAuthLogout();
```

Do the same for `StudentSidebar.tsx`, `AppLayout.tsx`, `StudentLayout.tsx` — replace all `useAuth()` references with the appropriate selector hooks.

- [ ] **Step 3: Add `useUploadProcessor` call to AppLayout**

In `shared/components/layout/AppLayout.tsx`, mount the upload processor at the top of the component:

```tsx
import { useUploadProcessor } from "@shared/hooks/useUploadProcessor";

export default function AppLayout() {
  useUploadProcessor();   // ← add this line
  // rest of component unchanged
}
```

- [ ] **Step 4: Copy RouteGuard, updating imports**

```bash
sed 's|@/hooks/useAuth|@shared/store/authStore|g; s|useAuth()|{ isAdmin: useIsAdmin(), isTeacher: useIsTeacher(), isStudent: useIsStudent() }|g' \
  components/RouteGuard.tsx > shared/components/RouteGuard.tsx
```

Then open `shared/components/RouteGuard.tsx` and manually verify the auth check logic is correct — it checks `allowedRoles` against the user's role. Update to use selector hooks:

```tsx
import { useAuthUser } from "@shared/store/authStore";

export default function RouteGuard({ allowedRoles }: { allowedRoles: string[] }) {
  const user = useAuthUser();
  // existing redirect logic unchanged, but now reads from Zustand
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "shared/components" | head -10
```

Fix any import errors in the copied files before continuing.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/shared/components/
git commit -m "feat(frontend/shared): migrate layout and RouteGuard to shared/"
```

---

### Task 8: Create app/ scaffolding

**Files:**
- Create: `frontend/src/app/routes.ts`
- Create: `frontend/src/app/providers.tsx`

- [ ] **Step 1: Create `frontend/src/app/routes.ts`**

```ts
export const ROUTES = {
  // Admin
  ADMIN_LOGIN:       "/admin/login",
  ADMIN_ROOT:        "/admin",
  ADMIN_OVERVIEW:    "/admin",
  ADMIN_KNOWLEDGE:   "/admin/knowledge",
  ADMIN_DOCUMENTS:   "/admin/documents",
  ADMIN_DOC_REVIEW:  "/admin/document/:kbName/:docId/review",
  ADMIN_DOC_CHUNKS:  "/admin/document/:kbName/:docId/chunks",
  ADMIN_CONVERSATIONS: "/admin/conversations",
  ADMIN_USERS:       "/admin/users",
  ADMIN_TICKETS:     "/admin/tickets",
  ADMIN_ANALYTICS:   "/admin/analytics",
  ADMIN_SETTINGS:    "/admin/settings",

  // Student
  STUDENT_LOGIN:     "/student/login",
  STUDENT_ROOT:      "/student",
  STUDENT_CHAT:      "/student/chat",
  STUDENT_FAQ:       "/student/faq",
  STUDENT_TICKETS:   "/student/tickets",
  STUDENT_PROFILE:   "/student/profile",
} as const;

/** Build a concrete path by replacing :param tokens */
export function buildRoute(
  route: string,
  params: Record<string, string>,
): string {
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(`:${k}`, v),
    route,
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/providers.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@shared/components/ui/sonner";
import type { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/app/
git commit -m "feat(frontend/app): add routes constants and Providers wrapper"
```

---

### Task 9: Add ESLint boundaries config

**Files:**
- Modify: `frontend/eslint.config.js`

- [ ] **Step 1: Update `frontend/eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app",     pattern: "src/app/*" },
        { type: "pages",   pattern: "src/pages/*" },
        {
          type: "feature",
          pattern: "src/features/([^/]+)/**",
          capture: ["featureName"],
        },
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
  },
  prettierConfig,
]);
```

- [ ] **Step 2: Verify ESLint runs**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx eslint src/shared/ --max-warnings=0 2>&1 | tail -5
```

Expected: no errors from shared/ (old src/pages/ may have errors — that's expected and will be fixed as features are migrated).

- [ ] **Step 3: Commit**

```bash
cd ..
git add frontend/eslint.config.js
git commit -m "chore(frontend): add eslint-plugin-boundaries with FSD architecture rules"
```

---

## Phase 1 — Feature Migrations

> **Pattern for every feature:**
> 1. `services/` — pure wrappers around `@shared/lib/api.ts`, no React
> 2. `hooks/queryKeys.ts` — React Query key factory
> 3. `hooks/use*.ts` — `useQuery`/`useMutation` wrappers
> 4. `components/` — root component + sub-components (migrate JSX from old page)
> 5. `index.ts` — export only what `pages/` needs
> 6. Verify `npx tsc --noEmit`, commit

---

### Task 10: features/auth

**Files:**
- Create: `frontend/src/features/auth/services/authService.ts`
- Create: `frontend/src/features/auth/hooks/useLogin.ts`
- Create: `frontend/src/features/auth/components/LoginForm.tsx`
- Create: `frontend/src/features/auth/index.ts`

- [ ] **Step 1: Create `features/auth/services/authService.ts`**

```ts
import { authApi } from "@shared/lib/api";
import { saveAuth, clearAuth, type Portal } from "@shared/lib/auth";
import type { LoginResponse } from "@shared/types/api";

export const authService = {
  login: (username: string, password: string): Promise<LoginResponse> =>
    authApi.login(username, password),

  refresh: (refreshToken: string): Promise<LoginResponse> =>
    authApi.refresh(refreshToken),

  persist: (data: LoginResponse, portal: Portal): void =>
    saveAuth(data, portal),

  clear: (portal: Portal): void => clearAuth(portal),
};
```

- [ ] **Step 2: Create `features/auth/hooks/useLogin.ts`**

```ts
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { useSetUser, useAuthPortal } from "@shared/store/authStore";
import { handleMutationError } from "@shared/lib/errorHandler";
import { useToast } from "@shared/store/uiStore";
import type { Portal } from "@shared/lib/auth";

export function useLogin(portal: Portal) {
  const navigate = useNavigate();
  const setUser = useSetUser();
  const { showToast } = useToast();
  const currentPortal = useAuthPortal() ?? portal;

  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authService.login(username, password),
    onSuccess: (data) => {
      authService.persist(data, currentPortal);
      setUser(data.user);
      navigate(currentPortal === "student" ? "/student" : "/admin");
    },
    onError: (err) => handleMutationError(err, showToast),
  });
}
```

- [ ] **Step 3: Create `features/auth/components/LoginForm.tsx`**

Migrate the JSX from `src/pages/LoginPage.tsx` (226 lines). The component receives a `variant` prop:

```tsx
import { useState } from "react";
import { useLogin } from "../hooks/useLogin";
import type { Portal } from "@shared/lib/auth";

interface Props {
  variant: Portal;
}

export function LoginForm({ variant }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { mutate: login, isPending } = useLogin(variant);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ username, password });
  };

  // Migrate the full JSX from src/pages/LoginPage.tsx.
  // The existing component has two variants (admin/student) controlled by the `variant` prop.
  // Keep all existing className, animation, and layout exactly as-is.
  return (
    // ... full JSX from LoginPage.tsx, replacing useAuth with useLogin ...
  );
}
```

Open `src/pages/LoginPage.tsx` and migrate the JSX into this component. Replace:
- `useAuth().login(...)` → call from `useLogin` mutation
- Error state from local state → errors come from `isPending`/`isError` on the mutation

- [ ] **Step 4: Create `features/auth/index.ts`**

```ts
export { LoginForm } from "./components/LoginForm";
```

- [ ] **Step 5: Verify**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/auth" | head -10
```

Fix any errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/features/auth/
git commit -m "feat(features/auth): add LoginForm, useLogin, authService"
```

---

### Task 11: features/knowledge

**Files:**
- Create: `frontend/src/features/knowledge/services/knowledgeService.ts`
- Create: `frontend/src/features/knowledge/hooks/queryKeys.ts`
- Create: `frontend/src/features/knowledge/hooks/useKnowledgeList.ts`
- Create: `frontend/src/features/knowledge/hooks/useKBForm.ts`
- Create: `frontend/src/features/knowledge/components/KnowledgeManagement.tsx` (root)
- Create: `frontend/src/features/knowledge/components/KnowledgeList.tsx`
- Create: `frontend/src/features/knowledge/components/KnowledgeCard.tsx`
- Create: `frontend/src/features/knowledge/components/CreateKBDialog.tsx`
- Create: `frontend/src/features/knowledge/types.ts`
- Create: `frontend/src/features/knowledge/index.ts`
- Create: `frontend/src/shared/services/knowledgeSharedService.ts`
- Create: `frontend/src/shared/hooks/useKBList.ts`

- [ ] **Step 1: Create `features/knowledge/types.ts`**

```ts
import type { KBInfo } from "@shared/types/api";

export type { KBInfo };

export interface KBFormValues {
  name: string;
  description: string;
  color: string;
}
```

- [ ] **Step 2: Create `features/knowledge/services/knowledgeService.ts`**

```ts
import { knowledgeApi } from "@shared/lib/api";
import type { KBCreate } from "@shared/types/api";

export const knowledgeService = {
  list: () => knowledgeApi.listKBs().then((r) => r.data),
  create: (payload: KBCreate) => knowledgeApi.createKB(payload).then((r) => r.data),
  delete: (name: string) => knowledgeApi.deleteKB(name),
  setActive: (name: string) => knowledgeApi.setActiveKB(name),
  getActive: () => knowledgeApi.getActiveKB().then((r) => r.data),
};
```

- [ ] **Step 3: Create `features/knowledge/hooks/queryKeys.ts`**

```ts
export const knowledgeKeys = {
  all:    () => ["knowledge"] as const,
  list:   () => ["knowledge", "list"] as const,
  active: () => ["knowledge", "active"] as const,
};
```

- [ ] **Step 4: Create `features/knowledge/hooks/useKnowledgeList.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeService } from "../services/knowledgeService";
import { knowledgeKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useKnowledgeList() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: kbList = [], isLoading } = useQuery({
    queryKey: knowledgeKeys.list(),
    queryFn: knowledgeService.list,
  });

  const createMutation = useMutation({
    mutationFn: knowledgeService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.all() });
      showToast("知识库已创建", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const deleteMutation = useMutation({
    mutationFn: knowledgeService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.all() });
      showToast("知识库已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const setActiveMutation = useMutation({
    mutationFn: knowledgeService.setActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.all() });
      showToast("已设为学生端知识库", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    kbList,
    isLoading,
    createKB: createMutation.mutate,
    isCreating: createMutation.isPending,
    deleteKB: deleteMutation.mutate,
    setActive: setActiveMutation.mutate,
  };
}
```

- [ ] **Step 5: Create `features/knowledge/hooks/useKBForm.ts`**

```ts
import { useState } from "react";
import type { KBFormValues } from "../types";

const DEFAULT: KBFormValues = { name: "", description: "", color: "#6366f1" };

export function useKBForm() {
  const [values, setValues] = useState<KBFormValues>(DEFAULT);
  const [open, setOpen] = useState(false);

  const reset = () => setValues(DEFAULT);
  const openDialog = () => { reset(); setOpen(true); };
  const closeDialog = () => setOpen(false);

  return { values, setValues, open, openDialog, closeDialog };
}
```

- [ ] **Step 6: Create feature root and sub-components**

Create `features/knowledge/components/KnowledgeManagement.tsx` as the root component that composes `KnowledgeList`, `CreateKBDialog`. Migrate the JSX from `src/pages/KnowledgeBasePage.tsx` (1069 lines). The page currently exports `DocumentKnowledgeTab` — keep this as a named export from the root file OR as a separate file `DocumentKnowledgeTab.tsx`.

Key structure:
```tsx
// features/knowledge/components/KnowledgeManagement.tsx
import { useKnowledgeList } from "../hooks/useKnowledgeList";
import { useKBForm } from "../hooks/useKBForm";
import { KnowledgeList } from "./KnowledgeList";
import { CreateKBDialog } from "./CreateKBDialog";

export function KnowledgeManagement() {
  const { kbList, isLoading, createKB, deleteKB, setActive } = useKnowledgeList();
  const form = useKBForm();
  // JSX migrated from KnowledgeBasePage — top-level tab/section only
  // delegate list rendering to KnowledgeList
}

// Keep the tab export for KnowledgeManagementPage
export { KnowledgeManagement as DocumentKnowledgeTab };
```

Split the remaining large sections from `KnowledgeBasePage.tsx` into:
- `KnowledgeList.tsx` — the list/grid of KB cards
- `KnowledgeCard.tsx` — single card with actions
- `CreateKBDialog.tsx` — the create dialog form

Each file must stay under 250 lines. If a sub-section exceeds this, extract a further subcomponent.

- [ ] **Step 7: Create `frontend/src/shared/services/knowledgeSharedService.ts`**

```ts
import { knowledgeApi } from "@shared/lib/api";

export const knowledgeSharedService = {
  list: () => knowledgeApi.listKBs().then((r) => r.data),
};
```

- [ ] **Step 8: Create `frontend/src/shared/hooks/useKBList.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { knowledgeSharedService } from "@shared/services/knowledgeSharedService";

export function useKBList() {
  return useQuery({
    queryKey: ["knowledge", "list"],
    queryFn: knowledgeSharedService.list,
  });
}
```

- [ ] **Step 9: Create `features/knowledge/index.ts`**

```ts
export { KnowledgeManagement } from "./components/KnowledgeManagement";
export { KnowledgeManagement as DocumentKnowledgeTab } from "./components/KnowledgeManagement";
```

- [ ] **Step 10: Verify**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/knowledge\|shared/hooks" | head -10
```

- [ ] **Step 11: Commit**

```bash
cd ..
git add frontend/src/features/knowledge/ frontend/src/shared/services/ frontend/src/shared/hooks/useKBList.ts
git commit -m "feat(features/knowledge): add KnowledgeManagement feature module"
```

---

### Task 12: features/documents

**Files:**
- Create: `frontend/src/features/documents/services/documentService.ts`
- Create: `frontend/src/features/documents/hooks/queryKeys.ts`
- Create: `frontend/src/features/documents/hooks/useDocumentList.ts`
- Create: `frontend/src/features/documents/hooks/useDocumentUpload.ts`
- Create: `frontend/src/features/documents/components/DocumentManagement.tsx`
- Create: `frontend/src/features/documents/components/DocumentList.tsx`
- Create: `frontend/src/features/documents/components/UploadPanel.tsx`
- Create: `frontend/src/features/documents/components/ChunkReview.tsx`
- Create: `frontend/src/features/documents/components/CleanReview.tsx`
- Create: `frontend/src/features/documents/index.ts`

- [ ] **Step 1: Create `features/documents/services/documentService.ts`**

```ts
import { documentApi, knowledgeApi } from "@shared/lib/api";
import type { DocUpdate } from "@shared/types/api";

export const documentService = {
  list: (kbName: string) => documentApi.listDocs(kbName).then((r) => r.data),
  delete: (kbName: string, docId: number) => documentApi.deleteDoc(kbName, docId),
  reindex: (kbName: string, docId: number) => documentApi.reindexDoc(kbName, docId),
  update: (kbName: string, docId: number, payload: DocUpdate) =>
    documentApi.updateDoc(kbName, docId, payload),
  getReview: (kbName: string, docId: number) =>
    documentApi.getReview(kbName, docId).then((r) => r.data),
  confirmClean: (kbName: string, docId: number, content: string) =>
    documentApi.confirmClean(kbName, docId, content).then((r) => r.data),
  confirmIndex: (kbName: string, docId: number, chunks: unknown[]) =>
    documentApi.confirmIndex(kbName, docId, chunks).then((r) => r.data),
  discardReview: (kbName: string, docId: number) =>
    documentApi.discardReview(kbName, docId),
  getDownloadToken: (kbName: string, docId: number) =>
    documentApi.getDownloadToken(kbName, docId).then((r) => r.data),
  listKBs: () => knowledgeApi.listKBs().then((r) => r.data),
};
```

- [ ] **Step 2: Create `features/documents/hooks/queryKeys.ts`**

```ts
export const documentKeys = {
  all:    (kbName: string) => ["documents", kbName] as const,
  list:   (kbName: string) => ["documents", kbName, "list"] as const,
  review: (kbName: string, docId: number) => ["documents", kbName, docId, "review"] as const,
};
```

- [ ] **Step 3: Create `features/documents/hooks/useDocumentList.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentService } from "../services/documentService";
import { documentKeys } from "./queryKeys";
import { knowledgeKeys } from "@features/knowledge/hooks/queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useDocumentList(kbName: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: documentKeys.list(kbName),
    queryFn: () => documentService.list(kbName),
    enabled: !!kbName,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ docId }: { docId: number }) =>
      documentService.delete(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all(kbName) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.list() });
      showToast("文档已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const reindexMutation = useMutation({
    mutationFn: ({ docId }: { docId: number }) =>
      documentService.reindex(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all(kbName) });
      showToast("重建索引已启动", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    docs,
    isLoading,
    deleteDoc: deleteMutation.mutate,
    reindexDoc: reindexMutation.mutate,
  };
}
```

- [ ] **Step 4: Create `features/documents/hooks/useDocumentUpload.ts`**

```ts
import { useEnqueue, useUploadQueue, useClearDone } from "@shared/store/uploadStore";
import type { DocType, UploadParams } from "@shared/types/api";

export function useDocumentUpload(kbName: string, docType: DocType) {
  const enqueue = useEnqueue();
  const clearDone = useClearDone();
  const queue = useUploadQueue().filter(
    (q) => q.kbName === kbName && q.docType === docType,
  );

  const upload = (files: File[], params: UploadParams) =>
    enqueue(kbName, docType, files, params);

  const clearCompleted = () => clearDone(kbName, docType);

  return { queue, upload, clearCompleted };
}
```

- [ ] **Step 5: Create components**

Create `DocumentManagement.tsx` as root (tab switcher between KB selector + document list + upload panel). Migrate logic from `src/pages/DocumentPage.tsx` (973 lines), splitting into:

- `DocumentManagement.tsx` — top-level KB selector, tab structure (< 200 lines)
- `DocumentList.tsx` — table of documents with actions (< 250 lines)
- `UploadPanel.tsx` — file drop zone + upload queue display (< 250 lines)
- `ChunkReview.tsx` — migrated from `DocumentChunkReviewPage.tsx` (162 lines, can keep as-is)
- `CleanReview.tsx` — migrated from `DocumentCleanReviewPage.tsx` (153 lines, can keep as-is)

Each component uses hooks from `../hooks/`, never calls `@shared/lib/api` directly.

- [ ] **Step 6: Create `features/documents/index.ts`**

```ts
export { DocumentManagement } from "./components/DocumentManagement";
export { ChunkReview } from "./components/ChunkReview";
export { CleanReview } from "./components/CleanReview";
```

- [ ] **Step 7: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/documents" | head -10
cd ..
git add frontend/src/features/documents/
git commit -m "feat(features/documents): add DocumentManagement feature module"
```

---

### Task 13: features/faq

**Files:**
- Create: `frontend/src/features/faq/services/faqService.ts`
- Create: `frontend/src/features/faq/hooks/queryKeys.ts`
- Create: `frontend/src/features/faq/hooks/useFaqList.ts`
- Create: `frontend/src/features/faq/components/FaqManagement.tsx`
- Create: `frontend/src/features/faq/components/FaqTable.tsx`
- Create: `frontend/src/features/faq/components/FaqForm.tsx`
- Create: `frontend/src/features/faq/components/StudentFaqBrowser.tsx`
- Create: `frontend/src/features/faq/index.ts`

- [ ] **Step 1: Create `features/faq/services/faqService.ts`**

```ts
import { faqApi } from "@shared/lib/api";
import type { FAQCreate, FAQUpdate } from "@shared/types/api";

export const faqService = {
  list: (kbName: string) => faqApi.listFAQs(kbName).then((r) => r.data),
  create: (kbName: string, payload: FAQCreate) =>
    faqApi.createFAQ(kbName, payload).then((r) => r.data),
  update: (kbName: string, id: number, payload: FAQUpdate) =>
    faqApi.updateFAQ(kbName, id, payload).then((r) => r.data),
  delete: (kbName: string, id: number) => faqApi.deleteFAQ(kbName, id),
  search: (kbName: string, query: string) =>
    faqApi.searchFAQs(kbName, query).then((r) => r.data),
  importFAQs: (kbName: string, file: File) =>
    faqApi.importFAQs(kbName, file).then((r) => r.data),
  exportFAQs: (kbName: string) => faqApi.exportFAQs(kbName),
};
```

- [ ] **Step 2: Create `features/faq/hooks/queryKeys.ts`**

```ts
export const faqKeys = {
  all:    (kbName: string) => ["faq", kbName] as const,
  list:   (kbName: string) => ["faq", kbName, "list"] as const,
  search: (kbName: string, q: string) => ["faq", kbName, "search", q] as const,
};
```

- [ ] **Step 3: Create `features/faq/hooks/useFaqList.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { faqService } from "../services/faqService";
import { faqKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useFaqList(kbName: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: faqKeys.list(kbName),
    queryFn: () => faqService.list(kbName),
    enabled: !!kbName,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof faqService.create>[1]) =>
      faqService.create(kbName, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all(kbName) });
      showToast("FAQ 已创建", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof faqService.update>[2] }) =>
      faqService.update(kbName, id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all(kbName) });
      showToast("FAQ 已更新", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => faqService.delete(kbName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all(kbName) });
      showToast("FAQ 已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    faqs,
    isLoading,
    createFaq: createMutation.mutate,
    updateFaq: updateMutation.mutate,
    deleteFaq: deleteMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
```

- [ ] **Step 4: Create components**

`FaqManagement.tsx` — root, the tab host (admin side). Migrate from `src/pages/FaqPage.tsx` (947 lines). Keep `FaqKnowledgeTab` as a named export (used by `KnowledgeManagementPage`).

`FaqTable.tsx` — the table/list with edit/delete actions.

`FaqForm.tsx` — create/edit dialog form.

`StudentFaqBrowser.tsx` — read-only FAQ browser for student portal. Migrate from `src/pages/student/StudentFaqPage.tsx` (227 lines).

- [ ] **Step 5: Create `features/faq/index.ts`**

```ts
export { FaqManagement } from "./components/FaqManagement";
export { FaqManagement as FaqKnowledgeTab } from "./components/FaqManagement";
export { StudentFaqBrowser } from "./components/StudentFaqBrowser";
```

- [ ] **Step 6: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/faq" | head -10
cd ..
git add frontend/src/features/faq/
git commit -m "feat(features/faq): add FaqManagement + StudentFaqBrowser feature module"
```

---

### Task 14: features/conversations

**Files:**
- Create: `frontend/src/features/conversations/services/chatService.ts`
- Create: `frontend/src/features/conversations/hooks/queryKeys.ts`
- Create: `frontend/src/features/conversations/hooks/useChat.ts`
- Create: `frontend/src/features/conversations/hooks/useConversationList.ts`
- Create: `frontend/src/features/conversations/hooks/useMessageHistory.ts`
- Create: `frontend/src/features/conversations/components/ConversationRoot.tsx`
- Create: `frontend/src/features/conversations/components/ChatPanel.tsx`
- Create: `frontend/src/features/conversations/components/MessageList.tsx`
- Create: `frontend/src/features/conversations/components/MessageBubble.tsx`
- Create: `frontend/src/features/conversations/components/ThinkingProcess.tsx`
- Create: `frontend/src/features/conversations/components/SourcesPanel.tsx`
- Create: `frontend/src/features/conversations/components/FileCard.tsx`
- Create: `frontend/src/features/conversations/components/SuggestionsBar.tsx`
- Create: `frontend/src/features/conversations/components/ConversationSidebar.tsx`
- Create: `frontend/src/features/conversations/index.ts`

- [ ] **Step 1: Create `features/conversations/services/chatService.ts`**

```ts
import { streamChat, buildHistory } from "@shared/lib/streamChat";
import { conversationApi } from "@shared/lib/api";
import type {
  ChatMessage,
  ConversationInfo,
  ConversationMessage,
  PaginatedConversations,
} from "@shared/types/api";

export const chatService = {
  stream: streamChat,
  buildHistory,

  listConversations: (page: number, pageSize: number): Promise<PaginatedConversations> =>
    conversationApi.listConversations(page, pageSize).then((r) => r.data),

  getMessages: (conversationId: number): Promise<ConversationMessage[]> =>
    conversationApi.getMessages(conversationId).then((r) => r.data),

  deleteConversation: (id: number) => conversationApi.deleteConversation(id),

  submitFeedback: (msgId: number, rating: "up" | "down") =>
    conversationApi.submitFeedback(msgId, rating),
};
```

- [ ] **Step 2: Create `features/conversations/hooks/queryKeys.ts`**

```ts
export const conversationKeys = {
  all:      () => ["conversations"] as const,
  list:     (page: number) => ["conversations", "list", page] as const,
  messages: (id: number) => ["conversations", id, "messages"] as const,
};
```

- [ ] **Step 3: Create `features/conversations/hooks/useConversationList.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatService } from "../services/chatService";
import { conversationKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useConversationList(page = 1, pageSize = 20) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: conversationKeys.list(page),
    queryFn: () => chatService.listConversations(page, pageSize),
  });

  const deleteMutation = useMutation({
    mutationFn: chatService.deleteConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.all() });
      showToast("对话已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    conversations: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    deleteConversation: deleteMutation.mutate,
  };
}
```

- [ ] **Step 4: Create `features/conversations/hooks/useMessageHistory.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { chatService } from "../services/chatService";
import { conversationKeys } from "./queryKeys";

export function useMessageHistory(conversationId: number | null) {
  return useQuery({
    queryKey: conversationKeys.messages(conversationId ?? -1),
    queryFn: () => chatService.getMessages(conversationId!),
    enabled: conversationId !== null,
  });
}
```

- [ ] **Step 5: Create `features/conversations/hooks/useChat.ts`**

```ts
import { useState, useRef, useCallback } from "react";
import { chatService } from "../services/chatService";
import type { ChatMessage, FileItem, SourceItem } from "@shared/types/api";

type ChatStatus = "idle" | "thinking" | "streaming" | "done" | "error";

export function useChat(kbName: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [fileCards, setFileCards] = useState<FileItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", content, status: "done" },
    ]);
  };

  const send = useCallback(
    async (query: string) => {
      if (!kbName || status === "streaming" || status === "thinking") return;

      addUserMessage(query);
      setStatus("thinking");
      setThinkingSteps([]);
      setSources([]);
      setFileCards([]);
      setSuggestions([]);

      const history = chatService.buildHistory(messages);

      // Add placeholder assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", status: "streaming" },
      ]);

      const { abort } = chatService.stream({
        query,
        kbName,
        history,
        onStatus: (msg) => {
          setThinkingSteps((prev) => [...prev, msg]);
          setStatus("thinking");
        },
        onToken: (token) => {
          setStatus("streaming");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last.role !== "assistant") return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + token },
            ];
          });
        },
        onSources: (s) => setSources(s),
        onFile: (f) => setFileCards((prev) => [...prev, f]),
        onSuggestions: (s) => setSuggestions(s),
        onDone: () => {
          setStatus("done");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, status: "done" }];
          });
        },
        onError: () => {
          setStatus("error");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, status: "error" }];
          });
        },
      });

      abortRef.current = abort;
    },
    [kbName, messages, status],
  );

  const stop = () => abortRef.current?.();
  const clear = () => {
    setMessages([]);
    setStatus("idle");
    setThinkingSteps([]);
    setSources([]);
    setFileCards([]);
    setSuggestions([]);
  };

  return {
    messages,
    status,
    thinkingSteps,
    sources,
    fileCards,
    suggestions,
    send,
    stop,
    clear,
    isStreaming: status === "streaming" || status === "thinking",
  };
}
```

- [ ] **Step 6: Create components**

Migrate components from `src/components/chat/` and `src/pages/ConversationsPage.tsx` (640 lines):

- `ConversationRoot.tsx` — root: sidebar + chat area layout. Uses `useChat`, `useConversationList`, `useMessageHistory`. Handles whether user has an active conversation or starts new.
- `ChatPanel.tsx` — input bar + send button + streaming controls. Migrated from the bottom section of `ConversationsPage.tsx`.
- `MessageList.tsx` — scrollable message list. Migrated from `ConversationsPage.tsx`.
- `MessageBubble.tsx` — single message. Migrated from `components/chat/MessageBubble.tsx`.
- `ThinkingProcess.tsx` — from `components/chat/ThinkingProcess.tsx`.
- `SourcesPanel.tsx` — from `components/chat/SourcesPanel.tsx`.
- `FileCard.tsx` — from `components/chat/FileCard.tsx`.
- `SuggestionsBar.tsx` — new, suggestion chips from `ConversationsPage.tsx`.
- `ConversationSidebar.tsx` — from `components/chat/ConversationSidebar.tsx`.

Each must stay under 250 lines. `ConversationRoot.tsx` is allowed up to 250 lines; if larger, split into sub-panels.

- [ ] **Step 7: Create `features/conversations/index.ts`**

```ts
export { ConversationRoot } from "./components/ConversationRoot";
```

- [ ] **Step 8: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/conversations" | head -10
cd ..
git add frontend/src/features/conversations/
git commit -m "feat(features/conversations): add ConversationRoot feature module"
```

---

### Task 15: features/users

**Files:**
- Create: `frontend/src/features/users/services/userService.ts`
- Create: `frontend/src/features/users/hooks/queryKeys.ts`
- Create: `frontend/src/features/users/hooks/useUserList.ts`
- Create: `frontend/src/features/users/hooks/useStudentList.ts`
- Create: `frontend/src/features/users/hooks/useTeacherList.ts`
- Create: `frontend/src/features/users/components/UsersRoot.tsx`
- Create: `frontend/src/features/users/components/StudentsTab.tsx`
- Create: `frontend/src/features/users/components/TeachersTab.tsx`
- Create: `frontend/src/features/users/components/MentorRelationsTab.tsx`
- Create: `frontend/src/features/users/index.ts`

- [ ] **Step 1: Create `features/users/services/userService.ts`**

```ts
import { userApi } from "@shared/lib/api";
import type { UserCreate, UserUpdate } from "@shared/types/api";

export const userService = {
  list: (page: number, pageSize: number, role?: string) =>
    userApi.listUsers(page, pageSize, role).then((r) => r.data),
  create: (payload: UserCreate) => userApi.createUser(payload).then((r) => r.data),
  update: (id: number, payload: UserUpdate) =>
    userApi.updateUser(id, payload).then((r) => r.data),
  delete: (id: number) => userApi.deleteUser(id),
  resetPassword: (id: number, newPassword: string) =>
    userApi.resetPassword(id, newPassword),
  importStudents: (file: File) => userApi.importStudents(file).then((r) => r.data),
  importTeachers: (file: File) => userApi.importTeachers(file).then((r) => r.data),
  listMentorRelations: () => userApi.listMentorRelations().then((r) => r.data),
  assignMentor: (studentId: number, teacherId: number) =>
    userApi.assignMentor(studentId, teacherId),
  removeMentor: (studentId: number) => userApi.removeMentor(studentId),
};
```

- [ ] **Step 2: Create `features/users/hooks/queryKeys.ts`**

```ts
export const userKeys = {
  all:      () => ["users"] as const,
  list:     (role?: string) => ["users", "list", role ?? "all"] as const,
  mentors:  () => ["users", "mentor-relations"] as const,
};
```

- [ ] **Step 3: Create `features/users/hooks/useStudentList.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "../services/userService";
import { userKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useStudentList(page = 1, pageSize = 20) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: userKeys.list("student"),
    queryFn: () => userService.list(page, pageSize, "student"),
  });

  const deleteMutation = useMutation({
    mutationFn: userService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all() });
      showToast("用户已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      userService.resetPassword(id, password),
    onSuccess: () => showToast("密码已重置", "success"),
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    students: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    deleteUser: deleteMutation.mutate,
    resetPassword: resetPasswordMutation.mutate,
  };
}
```

- [ ] **Step 4: Create `features/users/hooks/useTeacherList.ts`**

Mirror `useStudentList.ts` but query with `role: "teacher"` and key `userKeys.list("teacher")`.

- [ ] **Step 5: Create components**

- `UsersRoot.tsx` — tab container (Students / Teachers / Mentor Relations). Migrate from `src/pages/UsersPage.tsx` (52 lines — mostly tab structure).
- `StudentsTab.tsx` — migrate from `src/pages/StudentsPage.tsx`. Uses `useStudentList`.
- `TeachersTab.tsx` — migrate from `src/pages/TeachersPage.tsx`. Uses `useTeacherList`.
- `MentorRelationsTab.tsx` — migrate from `src/pages/MentorRelationsTab.tsx` (416 lines). May need to extract a sub-component if > 250 lines.

- [ ] **Step 6: Create `features/users/index.ts`**

```ts
export { UsersRoot } from "./components/UsersRoot";
```

- [ ] **Step 7: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/users" | head -10
cd ..
git add frontend/src/features/users/
git commit -m "feat(features/users): add UsersRoot, StudentsTab, TeachersTab, MentorRelationsTab"
```

---

### Task 16: features/tickets

**Files:**
- Create: `frontend/src/features/tickets/services/ticketService.ts`
- Create: `frontend/src/features/tickets/hooks/queryKeys.ts`
- Create: `frontend/src/features/tickets/hooks/useTicketList.ts`
- Create: `frontend/src/features/tickets/components/TicketsManagement.tsx`
- Create: `frontend/src/features/tickets/components/StudentTicketList.tsx`
- Create: `frontend/src/features/tickets/index.ts`

- [ ] **Step 1: Create `features/tickets/services/ticketService.ts`**

```ts
import { ticketApi } from "@shared/lib/api";
import type { QARequestCreate } from "@shared/types/api";

export const ticketService = {
  listAll: (page: number, pageSize: number) =>
    ticketApi.listTickets(page, pageSize).then((r) => r.data),
  listMine: (page: number, pageSize: number) =>
    ticketApi.listMyTickets(page, pageSize).then((r) => r.data),
  create: (payload: QARequestCreate) =>
    ticketApi.createTicket(payload).then((r) => r.data),
  reply: (id: number, answer: string) => ticketApi.replyTicket(id, answer),
  close: (id: number) => ticketApi.closeTicket(id),
};
```

- [ ] **Step 2: Create `features/tickets/hooks/queryKeys.ts`**

```ts
export const ticketKeys = {
  all:  () => ["tickets"] as const,
  list: (scope: "all" | "mine", page: number) => ["tickets", scope, page] as const,
};
```

- [ ] **Step 3: Create `features/tickets/hooks/useTicketList.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketService } from "../services/ticketService";
import { ticketKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useTicketList(scope: "all" | "mine", page = 1, pageSize = 20) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ticketKeys.list(scope, page),
    queryFn: () =>
      scope === "all"
        ? ticketService.listAll(page, pageSize)
        : ticketService.listMine(page, pageSize),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, answer }: { id: number; answer: string }) =>
      ticketService.reply(id, answer),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      showToast("回复已提交", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const createMutation = useMutation({
    mutationFn: ticketService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      showToast("求助工单已提交", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    tickets: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    replyTicket: replyMutation.mutate,
    createTicket: createMutation.mutate,
  };
}
```

- [ ] **Step 4: Create components**

`TicketsManagement.tsx` — admin/teacher view. Migrate from `src/pages/TicketsPage.tsx`.

`StudentTicketList.tsx` — student view (scope=mine). Migrate from `src/pages/student/StudentTicketsPage.tsx` (276 lines).

- [ ] **Step 5: Create `features/tickets/index.ts`**

```ts
export { TicketsManagement } from "./components/TicketsManagement";
export { StudentTicketList } from "./components/StudentTicketList";
```

- [ ] **Step 6: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/tickets" | head -10
cd ..
git add frontend/src/features/tickets/
git commit -m "feat(features/tickets): add TicketsManagement + StudentTicketList"
```

---

### Task 17: features/analytics

**Files:**
- Create: `frontend/src/features/analytics/services/analyticsService.ts`
- Create: `frontend/src/features/analytics/hooks/queryKeys.ts`
- Create: `frontend/src/features/analytics/hooks/useAnalytics.ts`
- Create: `frontend/src/features/analytics/components/AnalyticsRoot.tsx`
- Create: `frontend/src/features/analytics/components/OverviewPanel.tsx`
- Create: `frontend/src/features/analytics/index.ts`

- [ ] **Step 1: Create `features/analytics/services/analyticsService.ts`**

```ts
import { analyticsApi } from "@shared/lib/api";

export const analyticsService = {
  getSummary: () => analyticsApi.getSummary().then((r) => r.data),
};
```

- [ ] **Step 2: Create `features/analytics/hooks/queryKeys.ts`**

```ts
export const analyticsKeys = {
  summary: () => ["analytics", "summary"] as const,
};
```

- [ ] **Step 3: Create `features/analytics/hooks/useAnalytics.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "../services/analyticsService";
import { analyticsKeys } from "./queryKeys";

export function useAnalytics() {
  return useQuery({
    queryKey: analyticsKeys.summary(),
    queryFn: analyticsService.getSummary,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 4: Create components**

`OverviewPanel.tsx` — migrate from `src/pages/OverviewPage.tsx`. Uses `useAnalytics`.
`AnalyticsRoot.tsx` — migrate from `src/pages/AnalyticsPage.tsx`. Uses `useAnalytics`.

- [ ] **Step 5: Create `features/analytics/index.ts`**

```ts
export { OverviewPanel } from "./components/OverviewPanel";
export { AnalyticsRoot } from "./components/AnalyticsRoot";
```

- [ ] **Step 6: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/analytics" | head -10
cd ..
git add frontend/src/features/analytics/
git commit -m "feat(features/analytics): add AnalyticsRoot + OverviewPanel"
```

---

### Task 18: features/settings

**Files:**
- Create: `frontend/src/features/settings/services/settingsService.ts`
- Create: `frontend/src/features/settings/hooks/queryKeys.ts`
- Create: `frontend/src/features/settings/hooks/useSettings.ts`
- Create: `frontend/src/features/settings/components/SettingsRoot.tsx`
- Create: `frontend/src/features/settings/index.ts`

- [ ] **Step 1: Create `features/settings/services/settingsService.ts`**

```ts
import { configApi } from "@shared/lib/api";
import type { ConfigUpdate } from "@shared/types/api";

export const settingsService = {
  get: () => configApi.getConfig().then((r) => r.data),
  update: (payload: ConfigUpdate) => configApi.updateConfig(payload).then((r) => r.data),
  testApiKey: (key: string) => configApi.testApiKey(key).then((r) => r.data),
};
```

- [ ] **Step 2: Create `features/settings/hooks/queryKeys.ts`**

```ts
export const settingsKeys = {
  all:    () => ["settings"] as const,
  config: () => ["settings", "config"] as const,
};
```

- [ ] **Step 3: Create `features/settings/hooks/useSettings.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settingsService";
import { settingsKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useSettings() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: config, isLoading } = useQuery({
    queryKey: settingsKeys.config(),
    queryFn: settingsService.get,
  });

  const updateMutation = useMutation({
    mutationFn: settingsService.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all() });
      showToast("设置已保存", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    config,
    isLoading,
    updateConfig: updateMutation.mutate,
    isSaving: updateMutation.isPending,
  };
}
```

- [ ] **Step 4: Create `features/settings/components/SettingsRoot.tsx`**

Migrate from `src/pages/SettingsPage.tsx` (969 lines). This file is large — split into sub-components as needed:
- `ModelSettings.tsx` — LLM model selection, API key config
- `KBSettings.tsx` — active knowledge base settings
- Keep each file under 250 lines.

- [ ] **Step 5: Create `features/settings/index.ts`**

```ts
export { SettingsRoot } from "./components/SettingsRoot";
```

- [ ] **Step 6: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/settings" | head -10
cd ..
git add frontend/src/features/settings/
git commit -m "feat(features/settings): add SettingsRoot feature module"
```

---

### Task 19: features/student

**Files:**
- Create: `frontend/src/features/student/services/studentService.ts`
- Create: `frontend/src/features/student/hooks/queryKeys.ts`
- Create: `frontend/src/features/student/hooks/useStudentHome.ts`
- Create: `frontend/src/features/student/hooks/useStudentProfile.ts`
- Create: `frontend/src/features/student/components/StudentHome.tsx`
- Create: `frontend/src/features/student/components/StudentProfile.tsx`
- Create: `frontend/src/features/student/index.ts`

- [ ] **Step 1: Create `features/student/services/studentService.ts`**

```ts
import { conversationApi, knowledgeApi, userApi, authApi } from "@shared/lib/api";

export const studentService = {
  getMyProfile: () => userApi.getMyProfile().then((r) => r.data),
  updateMyProfile: (payload: unknown) =>
    userApi.updateMyProfile(payload).then((r) => r.data),
  changePassword: (oldPwd: string, newPwd: string) =>
    authApi.changePassword(oldPwd, newPwd),
  listRecentConversations: (limit = 5) =>
    conversationApi.listConversations(1, limit).then((r) => r.data),
  getActiveKB: () => knowledgeApi.getActiveKB().then((r) => r.data),
};
```

- [ ] **Step 2: Create `features/student/hooks/queryKeys.ts`**

```ts
export const studentKeys = {
  profile:          () => ["student", "profile"] as const,
  recentChats:      () => ["student", "recent-chats"] as const,
  activeKB:         () => ["student", "active-kb"] as const,
};
```

- [ ] **Step 3: Create `features/student/hooks/useStudentHome.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { studentService } from "../services/studentService";
import { studentKeys } from "./queryKeys";

export function useStudentHome() {
  const { data: conversations, isLoading: convLoading } = useQuery({
    queryKey: studentKeys.recentChats(),
    queryFn: () => studentService.listRecentConversations(5),
  });

  const { data: activeKB } = useQuery({
    queryKey: studentKeys.activeKB(),
    queryFn: studentService.getActiveKB,
  });

  return {
    recentConversations: conversations?.items ?? [],
    activeKB,
    isLoading: convLoading,
  };
}
```

- [ ] **Step 4: Create `features/student/hooks/useStudentProfile.ts`**

```ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { studentService } from "../services/studentService";
import { studentKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useStudentProfile() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: studentKeys.profile(),
    queryFn: studentService.getMyProfile,
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ oldPwd, newPwd }: { oldPwd: string; newPwd: string }) =>
      studentService.changePassword(oldPwd, newPwd),
    onSuccess: () => showToast("密码已修改", "success"),
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    profile,
    isLoading,
    changePassword: changePasswordMutation.mutate,
    isChangingPassword: changePasswordMutation.isPending,
  };
}
```

- [ ] **Step 5: Create components**

`StudentHome.tsx` — migrate from `src/pages/student/StudentHomePage.tsx` (514 lines). Split if > 250 lines: extract `StatsCards.tsx`, `RecentChats.tsx`.

`StudentProfile.tsx` — migrate from `src/pages/student/StudentProfilePage.tsx` (186 lines, fits in one file).

- [ ] **Step 6: Create `features/student/index.ts`**

```ts
export { StudentHome } from "./components/StudentHome";
export { StudentProfile } from "./components/StudentProfile";
```

- [ ] **Step 7: Verify + commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "features/student" | head -10
cd ..
git add frontend/src/features/student/
git commit -m "feat(features/student): add StudentHome + StudentProfile feature module"
```

---

## Phase 2 — Pages Layer + Wiring

### Task 20: Create thin pages/ entry points

**Files:**
- Create: `frontend/src/pages/admin/KnowledgePage.tsx`
- Create: `frontend/src/pages/admin/DocumentsPage.tsx`
- Create: `frontend/src/pages/admin/DocumentCleanReviewPage.tsx`
- Create: `frontend/src/pages/admin/DocumentChunkReviewPage.tsx`
- Create: `frontend/src/pages/admin/FaqPage.tsx`  *(actually unused — KnowledgePage hosts FAQ tab)*
- Create: `frontend/src/pages/admin/ConversationsPage.tsx`
- Create: `frontend/src/pages/admin/UsersPage.tsx`
- Create: `frontend/src/pages/admin/TicketsPage.tsx`
- Create: `frontend/src/pages/admin/AnalyticsPage.tsx`
- Create: `frontend/src/pages/admin/SettingsPage.tsx`
- Create: `frontend/src/pages/admin/OverviewPage.tsx`
- Create: `frontend/src/pages/student/ChatPage.tsx`
- Create: `frontend/src/pages/student/FaqPage.tsx`
- Create: `frontend/src/pages/student/TicketsPage.tsx`
- Create: `frontend/src/pages/student/ProfilePage.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create all admin thin pages**

Each file is ≤ 10 lines:

```tsx
// pages/admin/OverviewPage.tsx
import { OverviewPanel } from "@features/analytics";
export default function OverviewPage() { return <OverviewPanel />; }
```

```tsx
// pages/admin/KnowledgePage.tsx
import { useState } from "react";
import { DocumentKnowledgeTab } from "@features/knowledge";
import { FaqKnowledgeTab } from "@features/faq";

type Tab = "documents" | "faq";

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>("documents");
  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      <div className="flex items-center gap-1 mt-3 border-b border-[#E8E4DC]">
        {(["documents", "faq"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${tab === t ? "text-[#334155]" : "text-[#9A9A9A]"}`}>
            {t === "documents" ? "文档知识" : "FAQ 知识"}
          </button>
        ))}
      </div>
      {tab === "documents" ? <DocumentKnowledgeTab /> : <FaqKnowledgeTab />}
    </div>
  );
}
```

```tsx
// pages/admin/DocumentsPage.tsx
import { DocumentManagement } from "@features/documents";
export default function DocumentsPage() { return <DocumentManagement />; }
```

```tsx
// pages/admin/DocumentCleanReviewPage.tsx
import { CleanReview } from "@features/documents";
export default function DocumentCleanReviewPage() { return <CleanReview />; }
```

```tsx
// pages/admin/DocumentChunkReviewPage.tsx
import { ChunkReview } from "@features/documents";
export default function DocumentChunkReviewPage() { return <ChunkReview />; }
```

```tsx
// pages/admin/ConversationsPage.tsx
import { ConversationRoot } from "@features/conversations";
export default function ConversationsPage() { return <ConversationRoot />; }
```

```tsx
// pages/admin/UsersPage.tsx
import { UsersRoot } from "@features/users";
export default function UsersPage() { return <UsersRoot />; }
```

```tsx
// pages/admin/TicketsPage.tsx
import { TicketsManagement } from "@features/tickets";
export default function TicketsPage() { return <TicketsManagement />; }
```

```tsx
// pages/admin/AnalyticsPage.tsx
import { AnalyticsRoot } from "@features/analytics";
export default function AnalyticsPage() { return <AnalyticsRoot />; }
```

```tsx
// pages/admin/SettingsPage.tsx
import { SettingsRoot } from "@features/settings";
export default function SettingsPage() { return <SettingsRoot />; }
```

- [ ] **Step 2: Create student thin pages**

```tsx
// pages/student/ChatPage.tsx
import { ConversationRoot } from "@features/conversations";
export default function ChatPage() { return <ConversationRoot portal="student" />; }
```

```tsx
// pages/student/FaqPage.tsx
import { StudentFaqBrowser } from "@features/faq";
export default function StudentFaqPage() { return <StudentFaqBrowser />; }
```

```tsx
// pages/student/TicketsPage.tsx
import { StudentTicketList } from "@features/tickets";
export default function StudentTicketsPage() { return <StudentTicketList />; }
```

```tsx
// pages/student/ProfilePage.tsx
import { StudentProfile } from "@features/student";
export default function StudentProfilePage() { return <StudentProfile />; }
```

- [ ] **Step 3: Create `pages/LoginPage.tsx`**

```tsx
import { LoginForm } from "@features/auth";
import type { Portal } from "@shared/lib/auth";

interface Props { variant: Portal; }

export default function LoginPage({ variant }: Props) {
  return <LoginForm variant={variant} />;
}
```

- [ ] **Step 4: Create `pages/student/StudentHomePage.tsx`**

```tsx
import { StudentHome } from "@features/student";
export default function StudentHomePage() { return <StudentHome />; }
```

- [ ] **Step 5: Verify**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | grep "pages/" | head -20
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/pages/
git commit -m "feat(frontend/pages): create thin route-entry pages using feature modules"
```

---

### Task 21: Rewrite App.tsx to use new structure

**Files:**
- Modify: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`

- [ ] **Step 1: Create `frontend/src/app/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Providers } from "./providers";
import RouteGuard from "@shared/components/RouteGuard";
import AppLayout from "@shared/components/layout/AppLayout";
import StudentLayout from "@shared/components/layout/StudentLayout";
import { useAuthUser, useSetPortal } from "@shared/store/authStore";
import { useEffect } from "react";
import { getCurrentPortal } from "@shared/lib/auth";

// Pages — admin
import LoginPage from "@pages/admin/LoginPage";
import OverviewPage from "@pages/admin/OverviewPage";
import KnowledgePage from "@pages/admin/KnowledgePage";
import DocumentsPage from "@pages/admin/DocumentsPage";
import DocumentCleanReviewPage from "@pages/admin/DocumentCleanReviewPage";
import DocumentChunkReviewPage from "@pages/admin/DocumentChunkReviewPage";
import ConversationsPage from "@pages/admin/ConversationsPage";
import UsersPage from "@pages/admin/UsersPage";
import TicketsPage from "@pages/admin/TicketsPage";
import AnalyticsPage from "@pages/admin/AnalyticsPage";
import SettingsPage from "@pages/admin/SettingsPage";

// Pages — student
import StudentLoginPage from "@pages/student/LoginPage";
import StudentHomePage from "@pages/student/StudentHomePage";
import ChatPage from "@pages/student/ChatPage";
import StudentFaqPage from "@pages/student/FaqPage";
import StudentTicketsPage from "@pages/student/TicketsPage";
import StudentProfilePage from "@pages/student/ProfilePage";

// Create student login page inline (same LoginForm, student variant)
import { LoginForm } from "@features/auth";

function RoleRedirect() {
  const user = useAuthUser();
  if (!user) return <Navigate to="/admin/login" replace />;
  return <Navigate to={user.role === "student" ? "/student" : "/admin"} replace />;
}

function PortalSync() {
  const setPortal = useSetPortal();
  useEffect(() => { setPortal(getCurrentPortal()); }, [setPortal]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <PortalSync />
        <Routes>
          <Route path="/admin/login" element={<LoginPage variant="admin" />} />
          <Route path="/student/login" element={<LoginForm variant="student" />} />
          <Route path="/login" element={<Navigate to="/admin/login" replace />} />

          <Route path="admin" element={<RouteGuard allowedRoles={["admin", "teacher"]} />}>
            <Route element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="students" element={<Navigate to="/admin/users" replace />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />

              <Route element={<RouteGuard allowedRoles={["admin"]} />}>
                <Route path="knowledge" element={<KnowledgePage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="document/:kbName/:docId/review" element={<DocumentCleanReviewPage />} />
                <Route path="document/:kbName/:docId/chunks" element={<DocumentChunkReviewPage />} />
                <Route path="teachers" element={<Navigate to="/admin/users" replace />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="student" element={<RouteGuard allowedRoles={["student"]} />}>
            <Route element={<StudentLayout />}>
              <Route index element={<StudentHomePage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="faq" element={<StudentFaqPage />} />
              <Route path="tickets" element={<StudentTicketsPage />} />
              <Route path="profile" element={<StudentProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
```

Note: `pages/admin/LoginPage.tsx` should be created:
```tsx
// pages/admin/LoginPage.tsx
import { LoginForm } from "@features/auth";
export default function LoginPage({ variant = "admin" }: { variant?: "admin" | "student" }) {
  return <LoginForm variant={variant} />;
}
```

- [ ] **Step 2: Update `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Verify full TypeScript compilation**

```bash
cd /Users/gefeng/projects/rag1.0/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix all remaining type errors before proceeding.

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 5: Start dev server and smoke-test**

```bash
npm run dev &
```

Open `http://localhost:5173/admin/login` — login form should appear.
Login as `admin`/`admin123` — should redirect to `/admin` overview.
Navigate to Knowledge, Documents, Users, Settings — each page should render.
Open `http://localhost:5173/student/login` — student login form.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/app/App.tsx frontend/src/main.tsx frontend/src/pages/admin/LoginPage.tsx
git commit -m "feat(frontend): wire app/ entry point, replace AuthContext with Zustand"
```

---

### Task 22: Delete old files and run ESLint

**Files:**
- Delete: all original `frontend/src/pages/*.tsx` (old, non-relocated versions)
- Delete: `frontend/src/components/AuthProvider.tsx`
- Delete: `frontend/src/lib/uploadContext.tsx`
- Delete: `frontend/src/components/RouteGuard.tsx`
- Delete: `frontend/src/components/layout/*`
- Delete: `frontend/src/hooks/useAuth.ts`
- Delete: `frontend/src/App.tsx` (old root)
- Keep: `frontend/src/lib/` and `frontend/src/types/` until confirmed nothing imports them

- [ ] **Step 1: Delete old page files**

```bash
cd /Users/gefeng/projects/rag1.0/frontend/src
rm pages/KnowledgeBasePage.tsx pages/KnowledgeManagementPage.tsx
rm pages/DocumentPage.tsx pages/DocumentChunkReviewPage.tsx pages/DocumentCleanReviewPage.tsx
rm pages/FaqPage.tsx pages/ConversationsPage.tsx pages/OverviewPage.tsx
rm pages/SettingsPage.tsx pages/AnalyticsPage.tsx pages/TicketsPage.tsx
rm pages/UsersPage.tsx pages/StudentsPage.tsx pages/TeachersPage.tsx
rm pages/MentorRelationsTab.tsx pages/LoginPage.tsx
rm pages/student/StudentHomePage.tsx pages/student/StudentFaqPage.tsx
rm pages/student/StudentTicketsPage.tsx pages/student/StudentProfilePage.tsx
```

- [ ] **Step 2: Delete old components**

```bash
rm components/AuthProvider.tsx components/RouteGuard.tsx
rm components/layout/AppLayout.tsx components/layout/Sidebar.tsx
rm components/layout/StudentLayout.tsx components/layout/StudentSidebar.tsx
rm components/layout/BlobBackdrop.tsx
rm lib/uploadContext.tsx
rm hooks/useAuth.ts
rm App.tsx
```

- [ ] **Step 3: Check for remaining imports of deleted files**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
grep -r "@/components/AuthProvider\|@/lib/uploadContext\|@/hooks/useAuth\|@/components/RouteGuard" src/ --include="*.tsx" --include="*.ts"
```

Expected: no matches. Fix any that appear.

- [ ] **Step 4: Clean up old lib/ and types/ if nothing imports them**

```bash
grep -r "from \"@/lib/\|from \"@/types/" src/ --include="*.tsx" --include="*.ts" | grep -v "shared"
```

If no matches, delete:
```bash
rm -rf src/lib/ src/types/ src/hooks/useTokenAutoRefresh.ts
rm -rf src/components/chat/ src/components/ui/
```

If matches exist, fix the imports to use `@shared/` equivalents first.

- [ ] **Step 5: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run ESLint on the new src/**

```bash
npx eslint src/ --max-warnings=0 2>&1 | head -30
```

Fix any boundary violations.

- [ ] **Step 7: Final build**

```bash
npm run build
```

Expected: Build succeeds, bundle emitted to `../dist/`.

- [ ] **Step 8: Commit**

```bash
cd ..
git add -A
git commit -m "chore(frontend): remove old page files, components, hooks after FSD migration"
```

---

## Self-Review Checklist

Spec coverage verified:
- [x] 二、整体目录结构 → Tasks 3, 4, 7, 8
- [x] 三、Feature 文件夹内部结构 → Tasks 10-19 (each feature has services/hooks/components/index.ts)
- [x] 四、文件拆分硬性规范 → Enforced in component creation steps (< 250 lines)
- [x] 五、各层职责划分 → Services call api.ts; hooks call services; components call hooks; pages call index.ts
- [x] 六、状态管理 — Zustand stores → Task 5; React Query in each feature hook
- [x] 七、shadcn/ui → Task 6
- [x] 八、命名规范 → Followed throughout
- [x] 九、集中式错误处理 → Task 4 (errorHandler.ts), used in every feature hook
- [x] 十、ESLint boundaries → Task 9
- [x] 附录 migration table → All files accounted for in Tasks 10-22
- [x] features/student/ internal structure → Task 19
- [x] KnowledgeManagementPage relationship → Task 20 (KnowledgePage hosts both tabs)
- [x] shared/services/ layer → Task 11 (knowledgeSharedService) + Task 4 (lib)
- [x] useUploadProcessor companion hook → Task 5, mounted in AppLayout (Task 7)
