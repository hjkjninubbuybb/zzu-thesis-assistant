"""FastAPI 应用入口。"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import knowledge, document, chat
from src.api.routes.config import router as config_router
from src.api.routes.faq import router as faq_router

app = FastAPI(title="RAG 1.0 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:7860",
        "http://127.0.0.1:7860",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# API 路由（必须在 SPA fallback 之前注册）
app.include_router(knowledge.router)
app.include_router(document.router)
app.include_router(chat.router)
app.include_router(config_router)
app.include_router(faq_router)


@app.get("/health")
def health():
    import os
    import httpx

    # Qdrant
    try:
        r = httpx.get("http://localhost:6333/healthz", timeout=2)
        qdrant_ok = r.status_code == 200
    except Exception:
        qdrant_ok = False

    # DashScope API key 存在即视为可用（避免计费探测）
    dashscope_ok = bool(os.environ.get("DASHSCOPE_API_KEY", "").strip())

    return {
        "fastapi": True,
        "qdrant": qdrant_ok,
        "dashscope": dashscope_ok,
        "bm25": True,       # 进程内，随 FastAPI 启动
        "reranker": dashscope_ok,  # 依赖同一个 API key
    }


# ── 静态文件服务（生产模式）────────────────────────────────
# dist/ 存在时启用；开发模式下由 Vite dev server 接管，此处不挂载
_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "dist"

if _DIST_DIR.exists():
    _ASSETS_DIR = _DIST_DIR / "assets"
    if _ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str = ""):  # noqa: ARG001
        return FileResponse(str(_DIST_DIR / "index.html"))
