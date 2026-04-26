import os
import socket
import subprocess
import sys
import time

import uvicorn

# docker-compose.yml 所在目录（项目根）
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ensure_docker():
    """启动 docker compose 并等待服务就绪（兼容 Colima / Docker Desktop）。"""
    compose_file = os.path.join(_PROJECT_ROOT, "docker-compose.yml")
    if not os.path.exists(compose_file):
        print("[docker] docker-compose.yml 不存在，跳过")
        return

    # macOS 上如果没有 /var/run/docker.sock，尝试启动 Colima
    _ensure_docker_daemon()

    compose_cmd = _detect_compose_cmd()
    if compose_cmd is None:
        print("[docker] 未找到 docker compose 或 docker-compose，跳过自动启动")
        return

    print("[docker] 启动容器...")
    ret = subprocess.run(
        [*compose_cmd, "-f", compose_file, "up", "-d"],
        cwd=_PROJECT_ROOT,
    )
    if ret.returncode != 0:
        print("[docker] 容器启动失败，请手动检查", file=sys.stderr)
        return

    # 等待 MySQL + Qdrant 端口可连接（最多 60 秒）
    print("[docker] 等待 MySQL + Qdrant 就绪...", end="", flush=True)
    for _ in range(60):
        try:
            with socket.create_connection(("127.0.0.1", 3306), timeout=1):
                pass
            with socket.create_connection(("127.0.0.1", 6333), timeout=1):
                pass
            print(" 就绪")
            return
        except OSError:
            print(".", end="", flush=True)
            time.sleep(1)

    print("\n[docker] 等待超时，服务可能尚未完全启动", file=sys.stderr)


def _ensure_docker_daemon():
    """确保 Docker daemon 可用。macOS 上优先尝试 Colima。"""
    # 如果默认 socket 已存在，直接返回
    if os.path.exists("/var/run/docker.sock"):
        return

    # 检查 Colima socket
    colima_sock = os.path.expanduser("~/.colima/default/docker.sock")
    if os.path.exists(colima_sock):
        os.environ["DOCKER_HOST"] = f"unix://{colima_sock}"
        print(f"[docker] 使用 Colima socket: {colima_sock}")
        return

    # Colima 已安装但未运行，尝试启动
    ret = subprocess.run(["which", "colima"], capture_output=True)
    if ret.returncode == 0:
        print("[docker] 正在启动 Colima...")
        ret = subprocess.run(
            ["colima", "start"],
            timeout=120,
        )
        if ret.returncode == 0 and os.path.exists(colima_sock):
            os.environ["DOCKER_HOST"] = f"unix://{colima_sock}"
            print(f"[docker] Colima 已启动，socket: {colima_sock}")
            return
        print("[docker] Colima 启动失败", file=sys.stderr)


def _detect_compose_cmd() -> list[str] | None:
    """检测 docker compose (v2) 或 docker-compose (v1)。"""
    ret = subprocess.run(
        ["docker", "compose", "version"],
        capture_output=True,
    )
    if ret.returncode == 0:
        return ["docker", "compose"]

    ret = subprocess.run(
        ["docker-compose", "version"],
        capture_output=True,
    )
    if ret.returncode == 0:
        return ["docker-compose"]

    return None


def run():
    _ensure_docker()
    print("管理端访问地址: http://localhost:8000/admin")
    print("学生端访问地址: http://localhost:8000/student")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000)


def dev():
    _ensure_docker()
    print("管理端访问地址: http://localhost:8000/admin")
    print("学生端访问地址: http://localhost:8000/student")
    uvicorn.run("src.api.app:app", host="127.0.0.1", port=8000, reload=True)
