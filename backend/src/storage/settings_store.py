"""系统设置存储（system_settings 表）。"""

import logging

from src.storage.database import get_conn

logger = logging.getLogger(__name__)


class SettingsStore:
    """系统键值对设置的 MySQL CRUD。"""

    def get_setting(self, key: str) -> str | None:
        """读取系统设置值。

        Args:
            key: 设置键名。

        Returns:
            设置值字符串，键不存在时返回 None。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT value FROM system_settings WHERE `key` = %s", (key,))
            row = cur.fetchone()
            return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        """写入或更新系统设置值（upsert）。

        Args:
            key: 设置键名。
            value: 设置值。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO system_settings (`key`, value) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE value = VALUES(value)",
                (key, value),
            )
            conn.commit()

    def delete_setting(self, key: str) -> None:
        """删除系统设置项。

        Args:
            key: 设置键名。
        """
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM system_settings WHERE `key` = %s", (key,))
            conn.commit()
