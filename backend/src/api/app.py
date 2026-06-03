"""FastAPI 应用入口。"""

import warnings

# 第一步：在 langchain_core 加载前先全局屏蔽，防止 Pydantic V1 兼容 warning 打印
warnings.filterwarnings("ignore")

# 第二步：langchain_core 的 __init__.py 会调用 surface_langchain_deprecation_warnings()，
# 把 LangChainPendingDeprecationWarning 的 "default" filter 插到 warnings 列表头部，
# 覆盖上面的 "ignore"。所以在其加载后再压入一次 ignore，恢复我们的优先级。
import langchain_core  # noqa: F401

warnings.filterwarnings("ignore", message=".*allowed_objects.*")

from datetime import date, timedelta

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.auth import ensure_default_admin, require_teacher_or_admin
from src.api.routes import chat, document, knowledge
from src.api.routes.auth import router as auth_router
from src.api.routes.config import router as config_router
from src.api.routes.conversation import router as conversation_router
from src.api.routes.faq import router as faq_router
from src.api.routes.ticket import router as ticket_router
from src.api.routes.user import router as user_router
from src.exceptions import AppException

app = FastAPI(title="RAG 1.0 API", version="1.0.0")


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """处理所有业务异常，统一返回格式。"""
    return JSONResponse(
        status_code=exc.http_status,
        content={"code": exc.code, "message": str(exc)},
    )


def _cors_origins() -> list[str]:
    """从 config.yaml 的 server.cors_origins 读取允许的前端来源。

    配置缺失时回退到本地开发常用端口集合，避免生产场景下因配置遗漏导致
    前端无法访问 API。
    """
    from src.config import get_config

    cfg = get_config()
    origins = cfg.get("server", {}).get("cors_origins", []) or []
    if not origins:
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:7860",
            "http://127.0.0.1:7860",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    return list(origins)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.on_event("startup")
def startup_event() -> None:
    import os
    import time

    ensure_default_admin()

    # 计算启动耗时
    start_ts = os.environ.get("_RAG_DEV_START")
    elapsed = f"  ready in {(time.monotonic() - float(start_ts)) * 1000:.0f} ms" if start_ts else ""

    print(
        f"\n"
        f"  RAG 1.0  dev\n"
        f"\n"
        f"  ➜  API      http://127.0.0.1:8000\n"
        f"  ➜  Docs     http://127.0.0.1:8000/docs\n"
        f"  ℹ  前端独立启动：cd frontend && npm run dev\n"
        f"\n"
        f"  ✓{elapsed}",
        flush=True,
    )


# API 路由
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(knowledge.router)
app.include_router(document.router)
app.include_router(chat.router)
app.include_router(config_router)
app.include_router(conversation_router)
app.include_router(faq_router)
app.include_router(ticket_router)


# ── 使用统计端点（内联，避免 import 缓存问题）────────────────


@app.get("/api/analytics/summary", tags=["analytics"])
def analytics_summary(_user: dict = Depends(require_teacher_or_admin)) -> dict:
    """返回系统使用统计汇总。"""
    from src.storage.database import get_conn

    with get_conn() as conn, conn.cursor() as cur:
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
            {
                "day": (date.today() - timedelta(days=6 - i)).isoformat(),
                "count": day_map.get((date.today() - timedelta(days=6 - i)).isoformat(), 0),
            }
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
        "total_questions": total_questions,
        "today_questions": today_questions,
        "total_conversations": total_conversations,
        "week_data": week_data,
        "feedback_up": feedback_map.get("up", 0),
        "feedback_down": feedback_map.get("down", 0),
        "kb_count": kb_count,
        "doc_count": doc_count,
        "faq_count": faq_count,
        "recent_questions": [
            {
                "content": r["content"],
                "created_at": str(r["created_at"]),
                "kb_name": r["kb_name"],
            }
            for r in recent_rows
        ],
    }


@app.get("/health")
def health():
    import httpx

    # Qdrant
    try:
        r = httpx.get("http://localhost:6333/healthz", timeout=2)
        qdrant_ok = r.status_code == 200
    except (httpx.RequestError, httpx.TimeoutException):
        qdrant_ok = False

    # DashScope API key 存在即视为可用（避免计费探测）
    from src.config import get_api_key

    dashscope_ok = bool(get_api_key().strip())

    return {
        "fastapi": True,
        "qdrant": qdrant_ok,
        "dashscope": dashscope_ok,
        "bm25": True,  # 进程内，随 FastAPI 启动
        "reranker": dashscope_ok,  # 依赖同一个 API key
    }


# 前后端完全分开：本后端不托管任何静态资源，不做 SPA fallback。
# 前端独立部署（开发期 Vite :5173，生产期 Nginx 或独立静态托管）。
