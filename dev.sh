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
pids=$(lsof -t -i:5173 2>/dev/null)
if [ -n "$pids" ]; then
    echo "[dev] 端口 5173 被占用，正在清除..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
fi
(cd "$REPO_ROOT/frontend" && npm run dev)
