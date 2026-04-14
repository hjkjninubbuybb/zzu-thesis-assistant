"""MySQL 连接池管理。"""

import logging

import pymysql
from dbutils.pooled_db import PooledDB

from src.config import get_config

logger = logging.getLogger(__name__)

_pool: PooledDB | None = None


def get_pool() -> PooledDB:
    """获取（或初始化）全局连接池。"""
    global _pool
    if _pool is None:
        cfg = get_config()["database"]
        _pool = PooledDB(
            creator=pymysql,
            mincached=0,
            maxcached=int(cfg.get("pool_size", 5)),
            maxshared=0,
            maxconnections=0,
            blocking=True,
            host=cfg["host"],
            port=int(cfg.get("port", 3306)),
            user=cfg["user"],
            password=cfg["password"],
            database=cfg["database"],
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
        logger.info("[db] MySQL 连接池已初始化 (%s@%s/%s)", cfg["user"], cfg["host"], cfg["database"])
    return _pool


def get_conn():
    """从连接池获取一个连接（调用方负责关闭）。"""
    return get_pool().connection()
