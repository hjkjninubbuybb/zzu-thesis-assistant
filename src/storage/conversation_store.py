"""对话、消息及反馈存储（conversations / conversation_messages / message_feedback 表）。"""

import json
import logging
from datetime import datetime

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class ConversationStore:
    """对话/消息/反馈 MySQL CRUD。"""

    # ── 对话 ──────────────────────────────────────────────────

    def create_conversation(self, kb_name: str, title: str = "新对话", user_id: int | None = None) -> dict:
        """创建对话。

        Args:
            kb_name: 关联知识库名称。
            title: 对话标题。
            user_id: 创建人用户 ID。

        Returns:
            新建的对话行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO conversations (kb_name, user_id, title, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s)""",
                (kb_name, user_id, title, now, now),
            )
            conn.commit()
            cur.execute("SELECT * FROM conversations WHERE id = %s", (cur.lastrowid,))
            return cur.fetchone()

    def list_conversations(
        self,
        kb_name: str | None = None,
        user_id: int | None = None,
        limit: int = 30,
        cursor_id: int | None = None,
        cursor_updated_at: str | None = None,
    ) -> dict:
        """分页列出对话（游标分页）。

        Args:
            kb_name: 按知识库过滤。
            user_id: 按用户过滤。
            limit: 每页条数。
            cursor_id: 上一页最后一条 ID（用于游标分页）。
            cursor_updated_at: 上一页最后一条的 updated_at。

        Returns:
            {'items': [...], 'has_more': bool, 'next_cursor': dict | None}
        """
        sql = "SELECT * FROM conversations WHERE 1=1"
        params: list = []
        if kb_name:
            sql += " AND kb_name = %s"
            params.append(kb_name)
        if user_id is not None:
            sql += " AND user_id = %s"
            params.append(user_id)
        if cursor_id is not None and cursor_updated_at is not None:
            sql += " AND (updated_at < %s OR (updated_at = %s AND id < %s))"
            params.extend([cursor_updated_at, cursor_updated_at, cursor_id])
        sql += " ORDER BY updated_at DESC, id DESC LIMIT %s"
        params.append(limit + 1)

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

        has_more = len(rows) > limit
        items = rows[:limit]
        next_cursor: dict | None = None
        if has_more and items:
            last = items[-1]
            updated_at = last["updated_at"]
            if isinstance(updated_at, datetime):
                updated_at = updated_at.strftime("%Y-%m-%d %H:%M:%S")
            next_cursor = {"id": last["id"], "updated_at": str(updated_at)}
        return {"items": items, "has_more": has_more, "next_cursor": next_cursor}

    def get_conversation(self, conv_id: int) -> dict | None:
        """按 ID 查询对话。

        Args:
            conv_id: 对话 ID。

        Returns:
            对话行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
            return cur.fetchone()

    def update_conversation_title(self, conv_id: int, title: str) -> dict | None:
        """更新对话标题。

        Args:
            conv_id: 对话 ID。
            title: 新标题。

        Returns:
            更新后的对话行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                "UPDATE conversations SET title = %s, updated_at = %s WHERE id = %s",
                (title, now, conv_id),
            )
            conn.commit()
            cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
            return cur.fetchone()

    def delete_conversation(self, conv_id: int) -> None:
        """删除对话（MySQL FK CASCADE 自动删除消息和反馈）。

        Args:
            conv_id: 对话 ID。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM conversations WHERE id = %s", (conv_id,))
            conn.commit()

    # ── 消息 ──────────────────────────────────────────────────

    def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        sources_json: str | None = None,
        files_json: str | None = None,
    ) -> dict:
        """插入消息并更新对话的 updated_at。

        Args:
            conversation_id: 对话 ID。
            role: 发送角色（user/assistant）。
            content: 消息内容。
            sources_json: 引用来源的 JSON 字符串。
            files_json: 文件卡片的 JSON 字符串。

        Returns:
            新建的消息行 dict（sources/files 已反序列化为 list）。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO conversation_messages
                   (conversation_id, role, content, sources, files, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (conversation_id, role, content, sources_json, files_json, now),
            )
            msg_id = cur.lastrowid
            cur.execute(
                "UPDATE conversations SET updated_at = %s WHERE id = %s",
                (now, conversation_id),
            )
            conn.commit()
            cur.execute("SELECT * FROM conversation_messages WHERE id = %s", (msg_id,))
            return self._parse_message_row(cur.fetchone())

    def list_messages(self, conversation_id: int) -> list[dict]:
        """列出对话的所有消息（按 id ASC）。

        Args:
            conversation_id: 对话 ID。

        Returns:
            消息列表（sources/files 已反序列化）。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM conversation_messages WHERE conversation_id = %s ORDER BY id ASC",
                (conversation_id,),
            )
            return [self._parse_message_row(r) for r in cur.fetchall()]

    @staticmethod
    def _parse_message_row(row: dict) -> dict:
        """将 sources/files 字段从 JSON 字符串反序列化为 list。

        pymysql DictCursor 返回 dict；MySQL JSON 列可能返回 str 或已解析的对象。
        """
        if row is None:
            return {}
        msg = dict(row)
        for field in ("sources", "files"):
            raw = msg.get(field)
            if raw is None:
                continue
            if isinstance(raw, (list, dict)):
                continue
            try:
                msg[field] = json.loads(raw)
            except (ValueError, TypeError):
                logger.warning("[message] 无法解析 %s 字段（msg_id=%s）", field, msg.get("id"))
                msg[field] = None
        return msg

    # ── 反馈 ──────────────────────────────────────────────────

    def get_message_feedback(self, message_id: int) -> dict | None:
        """查询消息的评分反馈。

        Args:
            message_id: 消息 ID。

        Returns:
            反馈行 dict，不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM message_feedback WHERE message_id = %s", (message_id,))
            return cur.fetchone()

    def set_message_feedback(self, message_id: int, rating: str) -> dict:
        """设置或更新消息评分反馈（upsert）。

        Args:
            message_id: 消息 ID。
            rating: 评分（up/down）。

        Returns:
            更新后的反馈行 dict。
        """
        with get_conn() as conn, conn.cursor() as cur:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """INSERT INTO message_feedback (message_id, rating, created_at)
                   VALUES (%s, %s, %s)
                   ON DUPLICATE KEY UPDATE rating = VALUES(rating), created_at = VALUES(created_at)""",
                (message_id, rating, now),
            )
            conn.commit()
            cur.execute("SELECT * FROM message_feedback WHERE message_id = %s", (message_id,))
            return cur.fetchone()
