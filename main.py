"""启动入口：以独立子进程启动 FastAPI，React 前端由 FastAPI serve 静态文件。"""

import logging
import os
import signal
import socket
import subprocess
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def check_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def get_pid_on_port(port: int) -> str:
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                return line.split()[-1]
    except Exception:
        pass
    return "unknown"


def wait_for_port(port: int, timeout: int = 15) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def run_fastapi(host: str, port: int) -> subprocess.Popen:
    cmd = [
        sys.executable, "-m", "uvicorn",
        "src.api.app:app",
        "--host", host,
        "--port", str(port),
        "--log-level", "info",
    ]
    logger.info(f"[FastAPI] 子进程启动: {' '.join(cmd)}")
    return subprocess.Popen(cmd, env=os.environ.copy())


def main() -> None:
    from src.config import get_config
    cfg = get_config()
    srv = cfg["server"]

    api_host = srv.get("api_host", "0.0.0.0")
    api_port = int(srv.get("api_port", 8000))

    logger.info(f"FastAPI  → http://localhost:{api_port}")
    logger.info(f"前端界面 → http://localhost:{api_port}")
    logger.info(f"API Docs → http://localhost:{api_port}/docs")

    if not check_port_free(api_port):
        pid = get_pid_on_port(api_port)
        logger.error(
            f"端口 {api_port} 已被 PID={pid} 占用，请先执行：taskkill /PID {pid} /F"
        )
        sys.exit(1)
    logger.info(f"端口检查通过：{api_port} 空闲")

    api_proc = run_fastapi(api_host, api_port)

    logger.info(f"[FastAPI] 等待端口 {api_port} 就绪...")
    if not wait_for_port(api_port, timeout=15):
        logger.error("[FastAPI] 15 秒内未能就绪，终止")
        api_proc.terminate()
        sys.exit(1)
    logger.info(f"[FastAPI] 已就绪，访问 http://localhost:{api_port}")

    def _shutdown(*_args):
        logger.info("收到退出信号，正在关闭服务...")
        try:
            api_proc.terminate()
            api_proc.wait(timeout=5)
        except Exception:
            api_proc.kill()
        logger.info("服务已退出")
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    logger.info("服务已启动，按 Ctrl+C 退出")

    while True:
        ret = api_proc.poll()
        if ret is not None:
            logger.error(f"[FastAPI] 子进程意外退出（code={ret}）")
            sys.exit(1)
        time.sleep(1)


if __name__ == "__main__":
    main()
