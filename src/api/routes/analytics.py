"""使用统计接口（仅 admin / teacher 可访问）。"""

import logging
from contextlib import closing
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from src.api.auth import require_teacher_or_admin
from src.storage.document_store import DocumentStore

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)

_ds = DocumentStore()


@router.get("/summary")
def get_summary(_current_user: dict = Depends(require_teacher_or_admin)) -> dict:
    """返回系统使用统计汇总。"""
    with closing(_ds._get_conn()) as conn:

        # ── 提问量 ────────────────────────────────────────
        total_questions: int = conn.execute(
            "SELECT COUNT(*) FROM conversation_messages WHERE role = 'user'"
        ).fetchone()[0]

        today_str = date.today().isoformat()
        today_questions: int = conn.execute(
            "SELECT COUNT(*) FROM conversation_messages WHERE role = 'user' AND DATE(created_at) = ?",
            (today_str,),
        ).fetchone()[0]

        # ── 近 7 天每日提问量 ─────────────────────────────
        week_rows = conn.execute(
            """
            SELECT DATE(created_at) AS day, COUNT(*) AS cnt
            FROM conversation_messages
            WHERE role = 'user'
              AND DATE(created_at) >= ?
            GROUP BY DATE(created_at)
            ORDER BY day
            """,
            ((date.today() - timedelta(days=6)).isoformat(),),
        ).fetchall()

        # 填充没有数据的日期为 0
        day_map = {row[0]: row[1] for row in week_rows}
        week_data = [
            {
                "day": (date.today() - timedelta(days=6 - i)).isoformat(),
                "count": day_map.get((date.today() - timedelta(days=6 - i)).isoformat(), 0),
            }
            for i in range(7)
        ]

        # ── 对话总数 ──────────────────────────────────────
        total_conversations: int = conn.execute(
            "SELECT COUNT(*) FROM conversations"
        ).fetchone()[0]

        # ── 反馈 ──────────────────────────────────────────
        feedback_rows = conn.execute(
            "SELECT rating, COUNT(*) AS cnt FROM message_feedback GROUP BY rating"
        ).fetchall()
        feedback_map = {row[0]: row[1] for row in feedback_rows}
        feedback_up: int   = feedback_map.get("up", 0)
        feedback_down: int = feedback_map.get("down", 0)

        # ── 知识库 / 文档 / FAQ ───────────────────────────
        kb_count: int  = conn.execute("SELECT COUNT(*) FROM knowledge_bases").fetchone()[0]
        doc_count: int = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        faq_count: int = conn.execute(
            "SELECT COUNT(*) FROM faqs WHERE enabled = 1"
        ).fetchone()[0]

        # ── 最近 10 条提问 ────────────────────────────────
        recent_rows = conn.execute(
            """
            SELECT cm.content, cm.created_at, c.kb_name
            FROM conversation_messages cm
            JOIN conversations c ON cm.conversation_id = c.id
            WHERE cm.role = 'user'
            ORDER BY cm.created_at DESC
            LIMIT 10
            """,
        ).fetchall()
        recent_questions = [
            {"content": row[0], "created_at": row[1], "kb_name": row[2]}
            for row in recent_rows
        ]

    return {
        "total_questions":    total_questions,
        "today_questions":    today_questions,
        "total_conversations": total_conversations,
        "week_data":          week_data,
        "feedback_up":        feedback_up,
        "feedback_down":      feedback_down,
        "kb_count":           kb_count,
        "doc_count":          doc_count,
        "faq_count":          faq_count,
        "recent_questions":   recent_questions,
    }
