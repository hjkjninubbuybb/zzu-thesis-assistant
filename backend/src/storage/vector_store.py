"""Qdrant 向量数据库操作封装。"""

import logging
import uuid

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from qdrant_client.http.exceptions import UnexpectedResponse

from src.config import get_config

logger = logging.getLogger(__name__)


class VectorStoreError(RuntimeError):
    """VectorStore 操作失败时抛出，隐藏底层实现细节。"""


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
        try:
            collections = [c.name for c in self.client.get_collections().collections]
            if name in collections:
                logger.info("Collection '%s' 已存在，跳过创建", name)
                return
            self.client.create_collection(
                collection_name=name,
                vectors_config=qmodels.VectorParams(
                    size=self.dimension,
                    distance=qmodels.Distance.COSINE,
                ),
            )
            logger.info("Collection '%s' 创建成功", name)
        except UnexpectedResponse as e:
            raise VectorStoreError(f"创建 collection '{name}' 失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"创建 collection '{name}' 失败: {e}") from e

    def delete_collection(self, name: str) -> None:
        """删除 collection。"""
        try:
            self.client.delete_collection(collection_name=name)
            logger.info("Collection '%s' 已删除", name)
        except UnexpectedResponse as e:
            if e.status_code == 404:
                logger.info("Collection '%s' 不存在，跳过删除", name)
                return
            raise VectorStoreError(f"删除 collection '{name}' 失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"删除 collection '{name}' 失败: {e}") from e

    def list_collections(self) -> list[str]:
        """列出所有 collection 名称。"""
        try:
            return [c.name for c in self.client.get_collections().collections]
        except Exception as e:
            raise VectorStoreError(f"获取 collection 列表失败: {e}") from e

    def collection_info(self, name: str) -> dict:
        """获取 collection 信息（包含向量数量）。"""
        try:
            info = self.client.get_collection(collection_name=name)
            return {
                "name": name,
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
            }
        except UnexpectedResponse as e:
            raise VectorStoreError(f"获取 collection '{name}' 信息失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"获取 collection '{name}' 信息失败: {e}") from e

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
        try:
            self.client.upsert(collection_name=collection_name, points=points)
            logger.info("向 '%s' 添加了 %d 个向量", collection_name, len(points))
        except UnexpectedResponse as e:
            raise VectorStoreError(f"写入向量失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"写入向量失败: {e}") from e

    def search(
        self,
        collection_name: str,
        query_vector: list[float],
        top_k: int = 10,
        score_threshold: float | None = None,
        payload_filter: dict | None = None,
    ) -> list[dict]:
        """向量相似度搜索。

        Args:
            payload_filter: 可选 payload 字段精确匹配过滤，如 {"source_type": "faq"}
        """
        qdrant_filter: qmodels.Filter | None = None
        if payload_filter:
            qdrant_filter = qmodels.Filter(
                must=[
                    qmodels.FieldCondition(key=k, match=qmodels.MatchValue(value=v)) for k, v in payload_filter.items()
                ]
            )
        try:
            results = self.client.query_points(
                collection_name=collection_name,
                query=query_vector,
                limit=top_k,
                score_threshold=score_threshold,
                query_filter=qdrant_filter,
            )
            return [
                {
                    "id": str(p.id),
                    "score": p.score,
                    **p.payload,
                }
                for p in results.points
            ]
        except UnexpectedResponse as e:
            raise VectorStoreError(f"向量搜索失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"向量搜索失败: {e}") from e

    def delete_by_ids(self, collection_name: str, ids: list[str]) -> None:
        """根据 point id 列表精确删除向量。"""
        if not ids:
            return
        try:
            self.client.delete(
                collection_name=collection_name,
                points_selector=qmodels.PointIdsList(points=ids),
            )
            logger.info("从 '%s' 删除了 %d 个向量(by id)", collection_name, len(ids))
        except UnexpectedResponse as e:
            raise VectorStoreError(f"按 id 删除向量失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"按 id 删除向量失败: {e}") from e

    def delete_by_metadata(self, collection_name: str, key: str, value: str) -> None:
        """根据 payload 中的元数据字段删除向量。"""
        try:
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
            logger.info("从 '%s' 删除了 %s=%s 的向量", collection_name, key, value)
        except UnexpectedResponse as e:
            raise VectorStoreError(f"删除向量失败: {e.status_code}") from e
        except Exception as e:
            raise VectorStoreError(f"删除向量失败: {e}") from e
