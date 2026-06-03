"""后端启动入口：dev (热重载) / start (生产)。

完全分开架构下，本模块**只负责后端**：
  - 启动基础设施（Qdrant + MySQL，通过 infra/docker-compose.yml）
  - 启动 FastAPI（uvicorn）

前端独立运行：``cd frontend && npm run dev`` 或独立静态部署。
"""

import os
import socket
import subprocess
import sys
import time

import uvicorn

# 屏蔽第三方库的各类 DeprecationWarning（如 LangChain/LangGraph），子进程继承
os.environ.setdefault("PYTHONWARNINGS", "ignore")

# backend/src/main.py 所在的项目根目录（即 backend/）
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 仓库根目录（即 backend/ 的上一层）
_REPO_ROOT = os.path.dirname(_BACKEND_ROOT)


def _kill_port(port: int) -> None:
    """强力清理端口占用（macOS / Linux）。"""
    try:
        result = subprocess.run(
            ["lsof", "-t", f"-i:{port}"],
            capture_output=True,
            text=True,
        )
        pids = result.stdout.strip().split("\n")
        for pid in pids:
            if pid:
                print(f"[system] 端口 {port} 被 PID {pid} 占用，正在终止...")
                subprocess.run(["kill", "-9", pid])
    except (FileNotFoundError, subprocess.SubprocessError):
        pass


def _ensure_docker() -> None:
    """启动 infra/docker-compose.yml 并等待 MySQL / Qdrant 就绪。"""
    compose_file = os.path.join(_REPO_ROOT, "infra", "docker-compose.yml")
    if not os.path.exists(compose_file):
        print("[docker] infra/docker-compose.yml 不存在，跳过")
        return

    _ensure_docker_daemon()

    compose_cmd = _detect_compose_cmd()
    if compose_cmd is None:
        print("[docker] 未找到 docker compose 或 docker-compose，跳过自动启动")
        return

    check = subprocess.run(
        [*compose_cmd, "-f", compose_file, "ps", "--status", "running", "-q"],
        cwd=_REPO_ROOT,
        capture_output=True,
        text=True,
    )
    already_running = bool(check.stdout.strip())

    if not already_running:
        print("[docker] 启动容器...")
        ret = subprocess.run(
            [*compose_cmd, "-f", compose_file, "up", "-d"],
            cwd=_REPO_ROOT,
            capture_output=True,
        )
        if ret.returncode != 0:
            print("[docker] 容器启动失败：", file=sys.stderr)
            if ret.stderr:
                print(ret.stderr.decode(errors="replace"), file=sys.stderr)
            sys.exit(1)

    # 已就绪则直接返回
    try:
        with socket.create_connection(("127.0.0.1", 3306), timeout=1):
            pass
        with socket.create_connection(("127.0.0.1", 6333), timeout=1):
            pass
        return
    except OSError:
        pass

    print("[docker] 等待 MySQL + Qdrant 就绪...", flush=True)
    for _ in range(59):
        time.sleep(1)
        try:
            with socket.create_connection(("127.0.0.1", 3306), timeout=1):
                pass
            with socket.create_connection(("127.0.0.1", 6333), timeout=1):
                pass
            print("[docker] MySQL + Qdrant 就绪")
            return
        except OSError:
            pass

    print("[docker] 等待超时，数据库服务未能按时就绪，请检查 Docker 状态", file=sys.stderr)
    sys.exit(1)


def _wait_docker_ready(timeout: int = 30) -> bool:
    """等待 Docker daemon 真正可用（socket 存在不代表 daemon 已就绪）。"""
    for _ in range(timeout):
        ret = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        if ret.returncode == 0:
            return True
        time.sleep(1)
    return False


def _ensure_docker_daemon() -> None:
    """确保 Docker daemon 可用。macOS 上优先尝试 Colima。"""
    if os.path.exists("/var/run/docker.sock"):
        return

    colima_sock = os.path.expanduser("~/.colima/default/docker.sock")

    colima_running = False
    ret = subprocess.run(["colima", "status"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if ret.returncode == 0:
        colima_running = True

    if colima_running and os.path.exists(colima_sock):
        os.environ["DOCKER_HOST"] = f"unix://{colima_sock}"
        return

    ret = subprocess.run(["which", "colima"], capture_output=True)
    if ret.returncode == 0:
        print("[docker] 正在启动 Colima，请稍候...")
        subprocess.run(["colima", "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ret = subprocess.run(
            ["colima", "start"],
            timeout=180,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if ret.returncode == 0 and os.path.exists(colima_sock):
            os.environ["DOCKER_HOST"] = f"unix://{colima_sock}"
            print("[docker] Colima 已启动，等待 Docker daemon 就绪...", flush=True)
            if _wait_docker_ready():
                print("[docker] Docker daemon 就绪")
                return
            print("[docker] Docker daemon 在 30s 内未就绪，请检查 Colima 状态", file=sys.stderr)
            return
        print(
            "[docker] Colima 自动启动失败，请手动执行 'colima start' 并确保其运行正常",
            file=sys.stderr,
        )


def _detect_compose_cmd() -> list[str] | None:
    """检测 docker compose (v2) 或 docker-compose (v1)。"""
    ret = subprocess.run(["docker", "compose", "version"], capture_output=True)
    if ret.returncode == 0:
        return ["docker", "compose"]

    ret = subprocess.run(["docker-compose", "version"], capture_output=True)
    if ret.returncode == 0:
        return ["docker-compose"]

    return None


def run() -> None:
    """生产模式启动后端。前端需独立部署或独立运行。"""
    _ensure_docker()
    print("==================================================")
    print("🚀  后端 API:    http://localhost:8000")
    print("📚  API 文档:    http://localhost:8000/docs")
    print("ℹ️   前端独立运行：cd frontend && npm run dev  (开发) 或独立静态部署")
    print("==================================================")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000)


def dev() -> None:
    """开发模式启动后端（热重载）。前端在另一个终端用 ``npm run dev``。"""
    _kill_port(8000)
    _ensure_docker()
    print("==================================================")
    print("🚀  后端 API（热重载）: http://localhost:8000")
    print("📚  API 文档:           http://localhost:8000/docs")
    print("ℹ️   前端独立启动：另开终端运行 'cd frontend && npm run dev'")
    print("==================================================")
    uvicorn.run("src.api.app:app", host="127.0.0.1", port=8000, reload=True, log_level="warning")
