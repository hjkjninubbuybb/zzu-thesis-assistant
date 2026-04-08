"""FastAPI 应用入口。"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import knowledge, document, chat
from src.api.routes.config import router as config_router

app = FastAPI(title="RAG 1.0 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由（必须在 SPA fallback 之前注册）
app.include_router(knowledge.router)
app.include_router(document.router)
app.include_router(chat.router)
app.include_router(config_router)


@app.get("/health")
def health():
    return {"status": "ok"}


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
