"""FastAPI 应用入口。"""

import sqlite3
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.auth import ensure_default_admin, require_teacher_or_admin
from src.api.routes import knowledge, document, chat
from src.api.routes.auth import router as auth_router
from src.api.routes.config import router as config_router
from src.api.routes.conversation import router as conversation_router
from src.api.routes.faq import router as faq_router
from src.api.routes.user import router as user_router
from src.config import ROOT_DIR

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

@app.on_event("startup")
def startup_event() -> None:
    ensure_default_admin()


# API 路由（必须在 SPA fallback 之前注册）
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(knowledge.router)
app.include_router(document.router)
app.include_router(chat.router)
app.include_router(config_router)
app.include_router(conversation_router)
app.include_router(faq_router)


# ── 使用统计端点（内联，避免 import 缓存问题）────────────────

_DB_PATH = ROOT_DIR / "data" / "metadata.db"


def _analytics_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/api/analytics/summary", tags=["analytics"])
def analytics_summary(_user: dict = Depends(require_teacher_or_admin)) -> dict:
    """返回系统使用统计汇总。"""
    with closing(_analytics_conn()) as conn:
        total_questions: int = conn.execute(
            "SELECT COUNT(*) FROM conversation_messages WHERE role = 'user'"
        ).fetchone()[0]

        today_str = date.today().isoformat()
        today_questions: int = conn.execute(
            "SELECT COUNT(*) FROM conversation_messages WHERE role = 'user' AND DATE(created_at) = ?",
            (today_str,),
        ).fetchone()[0]

        week_rows = conn.execute(
            "SELECT DATE(created_at) AS day, COUNT(*) AS cnt "
            "FROM conversation_messages WHERE role = 'user' AND DATE(created_at) >= ? "
            "GROUP BY DATE(created_at) ORDER BY day",
            ((date.today() - timedelta(days=6)).isoformat(),),
        ).fetchall()
        day_map = {row[0]: row[1] for row in week_rows}
        week_data = [
            {"day": (date.today() - timedelta(days=6 - i)).isoformat(),
             "count": day_map.get((date.today() - timedelta(days=6 - i)).isoformat(), 0)}
            for i in range(7)
        ]

        total_conversations: int = conn.execute(
            "SELECT COUNT(*) FROM conversations"
        ).fetchone()[0]

        feedback_rows = conn.execute(
            "SELECT rating, COUNT(*) AS cnt FROM message_feedback GROUP BY rating"
        ).fetchall()
        feedback_map = {row[0]: row[1] for row in feedback_rows}

        kb_count: int  = conn.execute("SELECT COUNT(*) FROM knowledge_bases").fetchone()[0]
        doc_count: int = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        faq_count: int = conn.execute("SELECT COUNT(*) FROM faqs WHERE enabled = 1").fetchone()[0]

        recent_rows = conn.execute(
            "SELECT cm.content, cm.created_at, c.kb_name "
            "FROM conversation_messages cm "
            "JOIN conversations c ON cm.conversation_id = c.id "
            "WHERE cm.role = 'user' "
            "ORDER BY cm.created_at DESC LIMIT 10",
        ).fetchall()

    return {
        "total_questions":     total_questions,
        "today_questions":     today_questions,
        "total_conversations": total_conversations,
        "week_data":           week_data,
        "feedback_up":         feedback_map.get("up", 0),
        "feedback_down":       feedback_map.get("down", 0),
        "kb_count":            kb_count,
        "doc_count":           doc_count,
        "faq_count":           faq_count,
        "recent_questions":    [{"content": r[0], "created_at": r[1], "kb_name": r[2]} for r in recent_rows],
    }


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
