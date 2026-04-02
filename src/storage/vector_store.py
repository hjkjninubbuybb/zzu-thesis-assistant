"""Qdrant 向量数据库操作封装。"""

import logging
import os
import uuid

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from src.config import get_config

logger = logging.getLogger(__name__)


class VectorStore:
    """Qdrant 向量数据库操作封装。"""

    def __init__(self):
        cfg = get_config()["qdrant"]
        self.client = QdrantClient(
            url=cfg["url"],
            timeout=cfg.get("timeout", 30),
        )
        self.dimension = get_config()["embedding"]["dimension"]

    # ── Collection 操作 ────────────────────────────────────

    def create_collection(self, name: str) -> None:
        """创建 collection，如果已存在则跳过。"""
        collections = [c.name for c in self.client.get_collections().collections]
        if name in collections:
            logger.info(f"Collection '{name}' 已存在，跳过创建")
            return
        self.client.create_collection(
            collection_name=name,
            vectors_config=qmodels.VectorParams(
                size=self.dimension,
                distance=qmodels.Distance.COSINE,
            ),
        )
        logger.info(f"Collection '{name}' 创建成功")

    def delete_collection(self, name: str) -> None:
        """删除 collection。"""
        self.client.delete_collection(collection_name=name)
        logger.info(f"Collection '{name}' 已删除")

    def list_collections(self) -> list[str]:
        """列出所有 collection 名称。"""
        return [c.name for c in self.client.get_collections().collections]

    def collection_info(self, name: str) -> dict:
        """获取 collection 信息（包含向量数量）。"""
        info = self.client.get_collection(collection_name=name)
        return {
            "name": name,
            "vectors_count": info.vectors_count,
            "points_count": info.points_count,
        }

    # ── 向量操作 ──────────────────────────────────────────

    def add_vectors(
        self,
        collection_name: str,
        vectors: list[list[float]],
        payloads: list[dict],
        ids: list[str] | None = None,
    ) -> None:
        """批量添加向量到 collection。"""
        if ids is None:
            ids = [str(uuid.uuid4()) for _ in vectors]
        points = [
            qmodels.PointStruct(id=pid, vector=vec, payload=payload)
            for pid, vec, payload in zip(ids, vectors, payloads)
        ]
        self.client.upsert(collection_name=collection_name, points=points)
        logger.info(f"向 '{collection_name}' 添加了 {len(points)} 个向量")

    def search(
        self,
        collection_name: str,
        query_vector: list[float],
        top_k: int = 10,
        score_threshold: float | None = None,
    ) -> list[dict]:
        """向量相似度搜索。"""
        results = self.client.query_points(
            collection_name=collection_name,
            query=query_vector,
            limit=top_k,
            score_threshold=score_threshold,
        )
        return [
            {
                "id": str(p.id),
                "score": p.score,
                **p.payload,
            }
            for p in results.points
        ]

    def delete_by_metadata(
        self, collection_name: str, key: str, value: str
    ) -> None:
        """根据 payload 中的元数据字段删除向量。"""
        self.client.delete(
            collection_name=collection_name,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key=key,
                            match=qmodels.MatchValue(value=value),
                        )
                    ]
                )
            ),
        )
        logger.info(f"从 '{collection_name}' 删除了 {key}={value} 的向量")
