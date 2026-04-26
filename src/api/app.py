"""FastAPI 应用入口。"""

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


@app.get("/api/analytics/summary", tags=["analytics"])
def analytics_summary(_user: dict = Depends(require_teacher_or_admin)) -> dict:
    """返回系统使用统计汇总。"""
    from src.storage.database import get_conn

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM conversation_messages WHERE role = 'user'")
            total_questions: int = cur.fetchone()["cnt"]

            today_str = date.today().isoformat()
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM conversation_messages WHERE role = 'user' AND DATE(created_at) = %s",
                (today_str,),
            )
            today_questions: int = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT DATE(created_at) AS day, COUNT(*) AS cnt "
                "FROM conversation_messages WHERE role = 'user' AND DATE(created_at) >= %s "
                "GROUP BY DATE(created_at) ORDER BY day",
                ((date.today() - timedelta(days=6)).isoformat(),),
            )
            week_rows = cur.fetchall()
            day_map = {str(row["day"]): row["cnt"] for row in week_rows}
            week_data = [
                {"day": (date.today() - timedelta(days=6 - i)).isoformat(),
                 "count": day_map.get((date.today() - timedelta(days=6 - i)).isoformat(), 0)}
                for i in range(7)
            ]

            cur.execute("SELECT COUNT(*) AS cnt FROM conversations")
            total_conversations: int = cur.fetchone()["cnt"]

            cur.execute("SELECT rating, COUNT(*) AS cnt FROM message_feedback GROUP BY rating")
            feedback_map = {row["rating"]: row["cnt"] for row in cur.fetchall()}

            cur.execute("SELECT COUNT(*) AS cnt FROM knowledge_bases")
            kb_count: int = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM documents")
            doc_count: int = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM faqs WHERE enabled = 1")
            faq_count: int = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT cm.content, cm.created_at, c.kb_name "
                "FROM conversation_messages cm "
                "JOIN conversations c ON cm.conversation_id = c.id "
                "WHERE cm.role = 'user' "
                "ORDER BY cm.created_at DESC LIMIT 10",
            )
            recent_rows = cur.fetchall()

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
        "recent_questions":    [{"content": r["content"], "created_at": str(r["created_at"]), "kb_name": r["kb_name"]} for r in recent_rows],
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
    from src.config import get_dashscope_api_key
    dashscope_ok = bool(get_dashscope_api_key().strip())

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
