"""统一启动入口：以独立子进程分别启动 FastAPI + Gradio。"""

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
    """检查 127.0.0.1:port 是否空闲。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def get_pid_on_port(port: int) -> str:
    """返回占用该端口的 PID（诊断用）。"""
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
    """等待端口开始监听，返回 True 表示成功。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def run_fastapi(host: str, port: int) -> subprocess.Popen:
    """在子进程启动 FastAPI (uvicorn)。"""
    cmd = [
        sys.executable, "-m", "uvicorn",
        "src.api.app:app",
        "--host", host,
        "--port", str(port),
        "--log-level", "info",
    ]
    logger.info(f"[FastAPI] 子进程启动: {' '.join(cmd)}")
    return subprocess.Popen(cmd, env=os.environ.copy())


def run_gradio(api_port: int, gradio_port: int) -> subprocess.Popen:
    """在子进程启动 Gradio。"""
    script = f"""
import sys, os
sys.path.insert(0, r"{os.getcwd()}")
import src.ui.app as ui_module
ui_module.API_BASE = "http://localhost:{api_port}"
from src.ui.app import build_app
import gradio as gr
demo = build_app()
demo.launch(server_port={gradio_port}, server_name="0.0.0.0", share=False, theme=gr.themes.Soft())
"""
    logger.info(f"[Gradio] 子进程启动（port={gradio_port}）")
    return subprocess.Popen(
        [sys.executable, "-c", script],
        env=os.environ.copy(),
    )


def main() -> None:
    from src.config import get_config
    cfg = get_config()
    srv = cfg["server"]

    api_host = srv.get("api_host", "0.0.0.0")
    api_port = int(srv.get("api_port", 8000))
    gradio_port = int(srv.get("gradio_port", 7860))

    logger.info(f"FastAPI  → http://localhost:{api_port}")
    logger.info(f"Gradio   → http://localhost:{gradio_port}")
    logger.info(f"API Docs → http://localhost:{api_port}/docs")

    # 启动前端口检查
    for port in (api_port, gradio_port):
        if not check_port_free(port):
            pid = get_pid_on_port(port)
            logger.error(
                f"端口 {port} 已被 PID={pid} 占用，请先执行：taskkill /PID {pid} /F"
            )
            sys.exit(1)
    logger.info(f"端口检查通过：{api_port} 和 {gradio_port} 均空闲")

    # 启动 FastAPI 子进程
    api_proc = run_fastapi(api_host, api_port)

    # 等待 FastAPI 就绪
    logger.info(f"[FastAPI] 等待端口 {api_port} 就绪...")
    if not wait_for_port(api_port, timeout=15):
        logger.error("[FastAPI] 15 秒内未能就绪，终止")
        api_proc.terminate()
        sys.exit(1)
    logger.info("[FastAPI] 已就绪")

    # 启动 Gradio 子进程
    gradio_proc = run_gradio(api_port, gradio_port)

    # 捕获 Ctrl+C，优雅退出
    def _shutdown(*_args):
        logger.info("收到退出信号，正在关闭子进程...")
        for proc in (gradio_proc, api_proc):
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        logger.info("所有子进程已退出")
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    logger.info("所有服务已启动，按 Ctrl+C 退出")

    # 主进程：监视子进程，任一意外退出则关闭全部
    while True:
        for name, proc in (("FastAPI", api_proc), ("Gradio", gradio_proc)):
            ret = proc.poll()
            if ret is not None:
                logger.error(f"[{name}] 子进程意外退出（code={ret}），关闭全部服务")
                _shutdown()
        time.sleep(1)


if __name__ == "__main__":
    main()
