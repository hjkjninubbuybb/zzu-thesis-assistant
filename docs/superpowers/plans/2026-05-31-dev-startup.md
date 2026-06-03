# Dev Startup 改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `make dev` 先等后端就绪再启动前端，并在前端终端打印学生端和管理端两条入口地址。

**Architecture:** `dev.sh` 改为顺序启动（轮询 `/docs` 返回 200 后再起前端）；`vite.config.ts` 加内联插件，在 Vite 就绪时用 `configureServer` 返回函数打印两条 Portal 地址。

**Tech Stack:** bash, Vite plugin API (configureServer)

---

### Task 1: 改写 `dev.sh`

**Files:**
- Modify: `dev.sh`

- [ ] **Step 1: 替换 dev.sh 全部内容**

```bash
#!/usr/bin/env bash

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
    echo ""
    echo "[dev] 正在关闭..."
    if [ -n "$BACKEND_PID" ]; then
        pkill -TERM -P "$BACKEND_PID" 2>/dev/null || true
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev] 启动后端（:8000）..."
(cd "$REPO_ROOT/backend" && poetry run dev) &
BACKEND_PID=$!

echo "[dev] 等待后端就绪..."
READY=0
for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs 2>/dev/null)
    if [ "$code" = "200" ]; then
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" = "0" ]; then
    echo "[dev] 警告：等待后端超时，前端将照常启动"
fi

echo "[dev] 启动前端（:5173）..."
(cd "$REPO_ROOT/frontend" && npm run dev)
```

- [ ] **Step 2: 确保可执行权限**

```bash
chmod +x dev.sh
```

- [ ] **Step 3: 手动验证 dev.sh 可以运行**

在项目根目录运行 `bash dev.sh`，观察输出：
- 先看到 `[dev] 启动后端` 和 uvicorn 启动信息
- 再看到 `[dev] 等待后端就绪...`
- 后端就绪后看到 `[dev] 启动前端`
- Ctrl+C 后两个进程都退出，`lsof -i:8000` 不再有进程

---

### Task 2: 在 `vite.config.ts` 加 Portal URL 插件

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: 在 plugins 数组末尾加内联插件**

在 `plugins: [react(), tailwindcss()]` 改为：

```ts
plugins: [
  react(),
  tailwindcss(),
  {
    name: "rag-portals",
    configureServer(server) {
      return () => {
        const addr = server.httpServer?.address();
        const port =
          typeof addr === "object" && addr ? addr.port : 5173;
        server.config.logger.info(
          `\n  📚  学生端:  \x1b[36mhttp://localhost:${port}/student\x1b[0m` +
          `\n  🎓  管理端:  \x1b[36mhttp://localhost:${port}/admin\x1b[0m\n`
        );
      };
    },
  },
],
```

- [ ] **Step 2: 验证 Vite 输出包含两条地址**

单独在 `frontend/` 目录运行 `npm run dev`，终端应在 Vite 自带 URL 之后出现：

```
  📚  学生端:  http://localhost:5173/student
  🎓  管理端:  http://localhost:5173/admin
```

若 5173 被占用自动换端口（如 5174），两条地址的端口应跟着变。

- [ ] **Step 3: 完整流程验证**

项目根目录运行 `make dev`，确认：
1. 后端先起、等后端就绪后前端再起
2. 前端终端里打印出学生端和管理端两条地址
3. Ctrl+C 后两个进程都干净退出
