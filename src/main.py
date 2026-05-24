import atexit
import os
import socket
import subprocess
import sys
import threading
import time

import uvicorn

# 屏蔽第三方库的各类 DeprecationWarning（如 LangChain/LangGraph），子进程继承
os.environ.setdefault("PYTHONWARNINGS", "ignore")

# docker-compose.yml 所在目录（项目根）
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _kill_port(port: int):
    """强力清理端口占用（macOS / Linux）。"""
    try:
        # 查找占用端口的 PID
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
    except Exception:
        pass


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

    # 先静默检查容器是否已全部运行，避免不必要的 up -d
    check = subprocess.run(
        [*compose_cmd, "-f", compose_file, "ps", "--status", "running", "-q"],
        cwd=_PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    already_running = bool(check.stdout.strip())

    if not already_running:
        print("[docker] 启动容器...")
        ret = subprocess.run(
            [*compose_cmd, "-f", compose_file, "up", "-d"],
            cwd=_PROJECT_ROOT,
            capture_output=True,
        )
        if ret.returncode != 0:
            print(
                "[docker] 容器启动失败，请手动检查是否已执行 'colima start'",
                file=sys.stderr,
            )
            sys.exit(1)

    # 先静默快速检查端口，已就绪则直接返回，无需任何提示
    try:
        with socket.create_connection(("127.0.0.1", 3306), timeout=1):
            pass
        with socket.create_connection(("127.0.0.1", 6333), timeout=1):
            pass
        return

    except OSError:
        pass

    # 确实需要等待时才打印提示
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


def _ensure_docker_daemon():
    """确保 Docker daemon 可用。macOS 上优先尝试 Colima。"""
    # 如果默认 socket 已存在，直接返回
    if os.path.exists("/var/run/docker.sock"):
        return

    # 检查 Colima socket
    colima_sock = os.path.expanduser("~/.colima/default/docker.sock")

    # colima status 输出走 stderr（log 格式），returncode=0 即表示运行中
    colima_running = False
    ret = subprocess.run(["colima", "status"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if ret.returncode == 0:
        colima_running = True

    if colima_running and os.path.exists(colima_sock):
        os.environ["DOCKER_HOST"] = f"unix://{colima_sock}"
        return

    # Colima 已安装但未运行或不正常，尝试重启/启动
    ret = subprocess.run(["which", "colima"], capture_output=True)
    if ret.returncode == 0:
        print("[docker] 正在启动 Colima，请稍候...")
        # 如果已经在跑但不正常，先 stop 再 start
        subprocess.run(["colima", "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ret = subprocess.run(
            ["colima", "start"],
            timeout=180,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if ret.returncode == 0 and os.path.exists(colima_sock):
            os.environ["DOCKER_HOST"] = f"unix://{colima_sock}"
            print("[docker] Colima 启动成功")
            return
        print(
            "[docker] Colima 自动启动失败，请手动执行 'colima start' 并确保其运行正常",
            file=sys.stderr,
        )


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


# Vite 启动 banner 中需要过滤掉的行（banner 里已有地址，这些重复或无用）
_VITE_SKIP_PATTERNS = (
    "VITE v",  # "  VITE v8.0.6  ready in xxx ms"
    "➜  Local:",  # "  ➜  Local:   http://localhost:5173/"
    "➜  Network:",  # "  ➜  Network: use --host to expose"
    "➜  press h",  # "  ➜  press h + enter to show help"
)


def _pipe_vite(src, dst):
    """读取 Vite stdout，过滤掉启动 banner，透传 HMR 等运行时消息。"""
    blank_pending = False
    for raw in src:
        line = raw.decode(errors="replace")
        stripped = line.strip()
        # 跳过 banner 中夹杂的空行（仅在 banner 期间）
        if not stripped:
            blank_pending = True
            continue
        if any(pat in line for pat in _VITE_SKIP_PATTERNS):
            blank_pending = False
            continue
        # 输出前恢复之前积压的空行（HMR 消息间的空行有意义）
        if blank_pending:
            dst.write("\n")
            blank_pending = False
        dst.write(line)
        dst.flush()


def _start_frontend():
    """以子进程启动前端 Vite 开发服务器。"""
    frontend_dir = os.path.join(_PROJECT_ROOT, "frontend")
    if not os.path.exists(frontend_dir):
        print(f"[frontend] 目录不存在: {frontend_dir}", file=sys.stderr)
        return None

    print("[frontend] 正在启动 Vite 开发服务器...")
    env = os.environ.copy()
    env["NODE_NO_WARNINGS"] = "1"
    try:
        process = subprocess.Popen(
            ["npm", "run", "--silent", "dev"],  # --silent 去掉 npm 脚本前缀行
            cwd=frontend_dir,
            stdout=subprocess.PIPE,  # 走过滤线程
            stderr=sys.stderr,
            env=env,
        )
        threading.Thread(
            target=_pipe_vite,
            args=(process.stdout, sys.stdout),
            daemon=True,
        ).start()
        return process
    except Exception as e:
        print(f"[frontend] 启动失败: {e}", file=sys.stderr)
        return None


def run():
    _ensure_docker()
    print("==================================================")
    print("🚀  后端 API 地址: http://localhost:8000")
    print("🎓  学生端访问地址: http://localhost:8000/student")
    print("💼  管理端访问地址: http://localhost:8000/admin")
    print("==================================================")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000)


def dev():
    _dev_start = time.monotonic()
    os.environ["_RAG_DEV_START"] = str(_dev_start)

    # 1. 清理残留端口（有占用时才会有输出）
    _kill_port(8000)
    _kill_port(5173)

    # 2. 确保 Docker 运行
    _ensure_docker()

    # 3. 启动前端
    frontend_process = _start_frontend()

    # 4. 确保退出时终止前端进程
    if frontend_process:
        atexit.register(lambda: frontend_process.terminate())

    # Banner 由 FastAPI startup 事件在全部就绪后打印
    uvicorn.run("src.api.app:app", host="127.0.0.1", port=8000, reload=True, log_level="warning")
