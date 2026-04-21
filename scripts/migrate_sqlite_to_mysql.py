"""
SQLite → MySQL 数据迁移脚本（一次性）。

将现有 data/metadata.db 中的数据迁移到 MySQL。
旧对话没有 user_id，迁移后关联到 admin 账号。

用法（在项目根目录执行）：
    PYTHONUTF8=1 poetry run python scripts/migrate_sqlite_to_mysql.py
"""

import sqlite3
import sys
from pathlib import Path

# 确保能 import src.*
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import ROOT_DIR  # noqa: E402
from src.storage.database import get_conn as get_mysql_conn  # noqa: E402
from src.storage.user_store import UserStore  # noqa: E402

SQLITE_PATH = ROOT_DIR / "data" / "metadata.db"


def migrate() -> None:
    if not SQLITE_PATH.exists():
        print(f"[migrate] SQLite 文件不存在: {SQLITE_PATH}，跳过迁移")
        return

    print(f"[migrate] 读取 SQLite: {SQLITE_PATH}")
    sqlite_conn = sqlite3.connect(str(SQLITE_PATH))
    sqlite_conn.row_factory = sqlite3.Row

    # 获取 admin 用户 id（迁移后旧对话挂到 admin 名下）
    us = UserStore()
    admin = us.get_user_by_username("admin")
    if not admin:
        print("[migrate] 警告: admin 用户不存在，旧对话的 user_id 将设为 NULL")
        admin_id = None
    else:
        admin_id = admin["id"]
        print(f"[migrate] admin user_id = {admin_id}")

    mysql = get_mysql_conn()

    try:
        with mysql.cursor() as cur:
            # ── knowledge_bases ────────────────────────────────────
            rows = sqlite_conn.execute("SELECT * FROM knowledge_bases").fetchall()
            print(f"[migrate] knowledge_bases: {len(rows)} 条")
            for r in rows:
                cur.execute(
                    """INSERT IGNORE INTO knowledge_bases (name, description, owner_id, created_at)
                       VALUES (%s, %s, %s, %s)""",
                    (r["name"], r["description"] or "", admin_id,
                     r["created_at"] if r["created_at"] else "2024-01-01 00:00:00"),
                )

            # ── documents ─────────────────────────────────────────
            rows = sqlite_conn.execute("SELECT * FROM documents").fetchall()
            print(f"[migrate] documents: {len(rows)} 条")
            for r in rows:
                cur.execute(
                    """INSERT IGNORE INTO documents
                       (id, kb_name, file_name, file_size, chunk_count, chunk_size, doc_type, status, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (r["id"], r["kb_name"], r["file_name"], r["file_size"] or 0,
                     r["chunk_count"] or 0, r["chunk_size"] or 256,
                     r["doc_type"] or "plain_text", r["status"] or "completed",
                     r["created_at"] or "2024-01-01 00:00:00"),
                )

            # ── faqs ──────────────────────────────────────────────
            rows = sqlite_conn.execute("SELECT * FROM faqs").fetchall()
            print(f"[migrate] faqs: {len(rows)} 条")
            for r in rows:
                cur.execute(
                    """INSERT IGNORE INTO faqs
                       (id, kb_name, question, answer, category, sort_order, enabled, vector_id, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (r["id"], r["kb_name"], r["question"], r["answer"],
                     r["category"] or "", r["sort_order"] or 0, r["enabled"] or 1,
                     r["vector_id"], r["created_at"], r["updated_at"]),
                )

            # ── conversations ─────────────────────────────────────
            rows = sqlite_conn.execute("SELECT * FROM conversations").fetchall()
            print(f"[migrate] conversations: {len(rows)} 条")
            for r in rows:
                cur.execute(
                    """INSERT IGNORE INTO conversations
                       (id, user_id, kb_name, title, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (r["id"], admin_id, r["kb_name"], r["title"] or "新对话",
                     r["created_at"], r["updated_at"]),
                )

            # ── conversation_messages ──────────────────────────────
            rows = sqlite_conn.execute("SELECT * FROM conversation_messages").fetchall()
            print(f"[migrate] conversation_messages: {len(rows)} 条")
            for r in rows:
                cur.execute(
                    """INSERT IGNORE INTO conversation_messages
                       (id, conversation_id, role, content, sources, files, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (r["id"], r["conversation_id"], r["role"], r["content"],
                     r["sources"], r["files"], r["created_at"]),
                )

            # ── message_feedback ──────────────────────────────────
            rows = sqlite_conn.execute("SELECT * FROM message_feedback").fetchall()
            print(f"[migrate] message_feedback: {len(rows)} 条")
            for r in rows:
                cur.execute(
                    """INSERT IGNORE INTO message_feedback (id, message_id, rating, created_at)
                       VALUES (%s, %s, %s, %s)""",
                    (r["id"], r["message_id"], r["rating"], r["created_at"]),
                )

            # ── system_settings ──────────────────────────────────
            try:
                rows = sqlite_conn.execute("SELECT * FROM system_settings").fetchall()
                print(f"[migrate] system_settings: {len(rows)} 条")
                for r in rows:
                    cur.execute(
                        """INSERT INTO system_settings (`key`, value)
                           VALUES (%s, %s)
                           ON DUPLICATE KEY UPDATE value = VALUES(value)""",
                        (r["key"], r["value"]),
                    )
            except Exception:
                print("[migrate] system_settings 表不存在，跳过")

        mysql.commit()
        print("[migrate] ✅ 迁移完成！")
    except Exception as e:
        mysql.rollback()
        print(f"[migrate] ❌ 迁移失败: {e}")
        raise
    finally:
        mysql.close()
        sqlite_conn.close()


if __name__ == "__main__":
    migrate()
