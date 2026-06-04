# Dev Startup 改进设计

**日期：** 2026-05-31  
**状态：** 已批准

## 背景

现有 `dev.sh` 同时启动前后端，存在两个问题：

1. 前后端并发启动——前端起来时后端可能还没就绪，导致开发初期 API 请求全部失败。
2. 前端只打印 Vite 默认的根路径地址，开发者需要手动拼 `/student`、`/admin` 路径。

## 目标

- 后端完全就绪后再启动前端。
- 前端就绪时在终端明确打印学生端和管理端两条入口地址。
- cleanup 能完整杀死所有子进程（包括 uvicorn），消除"端口被占用"的干扰。

## 设计

### 1. `dev.sh` — 顺序启动 + 可靠 cleanup

**就绪判断：** 轮询 `GET http://127.0.0.1:8000/docs`，返回 HTTP 200 视为就绪。每秒一次，最多等 60 秒；超时后打印警告但不阻断（前端仍会启动）。

**进程管理：**

- 去掉 `set -e`，避免轮询期间 curl 非零退出码意外终止脚本。
- 后端以 `(cd backend && poetry run dev) &` 起在后台，记录 `$BACKEND_PID`。
- `cleanup` 用 `pkill -TERM -P $BACKEND_PID` 递归杀子进程（覆盖 poetry → uvicorn 链路），再 `kill -TERM $BACKEND_PID` 杀外层 shell。
- `trap cleanup EXIT INT TERM` 确保 Ctrl+C 或异常退出时都能清理。

**启动顺序：**

```
后端起在后台（$BACKEND_PID）
  ↓
轮询 /docs，最多 60s
  ↓ 200 OK（或超时警告）
启动前端（前台，前端退出触发 cleanup）
```

### 2. `vite.config.ts` — Portal URL 插件

在 `plugins` 数组末尾加一个内联插件，利用 `configureServer` 返回函数的方式（Vite 在服务就绪后调用），打印两条入口地址。

端口从 `server.httpServer?.address()` 动态读取，兼容 Vite 自动换端口的情况（如 5173 被占用时用 5174）。

```ts
{
  name: 'rag-portals',
  configureServer(server) {
    return () => {
      const addr = server.httpServer?.address();
      const port = typeof addr === 'object' && addr ? addr.port : 5173;
      server.config.logger.info(
        `\n  📚  学生端:  http://localhost:${port}/student` +
        `\n  🎓  管理端:  http://localhost:${port}/admin\n`
      );
    };
  }
}
```

### 3. 改动范围

| 文件 | 改动 |
|------|------|
| `dev.sh` | 去掉 `set -e`；加轮询循环；改写 cleanup 用 pkill 递归杀进程 |
| `frontend/vite.config.ts` | `plugins` 末尾加内联 `rag-portals` 插件 |
| `Makefile` | 无需改动 |

## 不在本次范围内

- 后端崩溃后自动重启
- 多实例并发开发场景
- Windows 兼容性（项目仅在 macOS 开发）
