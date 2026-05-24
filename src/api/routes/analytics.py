"""使用统计接口（仅 admin / teacher 可访问）。"""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from src.api.auth import require_teacher_or_admin
from src.storage.database import get_conn

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)


@router.get("/summary")
def get_summary(_current_user: dict = Depends(require_teacher_or_admin)) -> dict:
    """返回系统使用统计汇总。"""
    with get_conn() as conn, conn.cursor() as cur:
        # ── 提问量 ────────────────────────────────────────
        cur.execute("SELECT COUNT(*) AS cnt FROM conversation_messages WHERE role = 'user'")
        total_questions: int = cur.fetchone()["cnt"]

        today_str = date.today().isoformat()
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM conversation_messages WHERE role = 'user' AND DATE(created_at) = %s",
            (today_str,),
        )
        today_questions: int = cur.fetchone()["cnt"]

        # ── 近 7 天每日提问量 ─────────────────────────────
        cur.execute(
            """
                SELECT DATE(created_at) AS day, COUNT(*) AS cnt
                FROM conversation_messages
                WHERE role = 'user'
                  AND DATE(created_at) >= %s
                GROUP BY DATE(created_at)
                ORDER BY day
                """,
            ((date.today() - timedelta(days=6)).isoformat(),),
        )
        week_rows = cur.fetchall()

        # 填充没有数据的日期为 0
        day_map = {str(row["day"]): row["cnt"] for row in week_rows}
        week_data = [
            {
                "day": (date.today() - timedelta(days=6 - i)).isoformat(),
                "count": day_map.get((date.today() - timedelta(days=6 - i)).isoformat(), 0),
            }
            for i in range(7)
        ]

        # ── 对话总数 ──────────────────────────────────────
        cur.execute("SELECT COUNT(*) AS cnt FROM conversations")
        total_conversations: int = cur.fetchone()["cnt"]

        # ── 反馈 ──────────────────────────────────────────
        cur.execute("SELECT rating, COUNT(*) AS cnt FROM message_feedback GROUP BY rating")
        feedback_map = {row["rating"]: row["cnt"] for row in cur.fetchall()}
        feedback_up: int = feedback_map.get("up", 0)
        feedback_down: int = feedback_map.get("down", 0)

        # ── 知识库 / 文档 / FAQ ───────────────────────────
        cur.execute("SELECT COUNT(*) AS cnt FROM knowledge_bases")
        kb_count: int = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) AS cnt FROM documents")
        doc_count: int = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) AS cnt FROM faqs WHERE enabled = 1")
        faq_count: int = cur.fetchone()["cnt"]

        # ── 最近 10 条提问 ────────────────────────────────
        cur.execute(
            """
                SELECT cm.content, cm.created_at, c.kb_name
                FROM conversation_messages cm
                JOIN conversations c ON cm.conversation_id = c.id
                WHERE cm.role = 'user'
                ORDER BY cm.created_at DESC
                LIMIT 10
                """,
        )
        recent_rows = cur.fetchall()
        recent_questions = [
            {
                "content": row["content"],
                "created_at": str(row["created_at"]),
                "kb_name": row["kb_name"],
            }
            for row in recent_rows
        ]

    return {
        "total_questions": total_questions,
        "today_questions": today_questions,
        "total_conversations": total_conversations,
        "week_data": week_data,
        "feedback_up": feedback_up,
        "feedback_down": feedback_down,
        "kb_count": kb_count,
        "doc_count": doc_count,
        "faq_count": faq_count,
        "recent_questions": recent_questions,
    }
