"""Core 层对存储能力的抽象接口（Protocol）。

存在动机
=======
``core/`` 层禁止直接 import ``src.storage.*``，但 RAG 检索、索引流水线、Agent
工具确实需要读写向量库和文档元数据库。本模块定义 Protocol，让 core 仅依赖
"行为契约"，具体实现（``storage.vector_store.VectorStore`` /
``storage.document_store.DocumentStore``）由 services 层在运行时注入。

只声明 core 当前实际使用的方法签名，不追求 1:1 复制 storage 层全集。
新方法在 core 中被调用前，先在此添加签名。
"""

from typing import Protocol


class BaseVectorStore(Protocol):
    """Core 层对向量存储的能力契约。

    实现：``src.storage.vector_store.VectorStore``（Qdrant 封装）。
    """

    def create_collection(self, name: str) -> None:
        """创建 collection；已存在则跳过。"""
        ...

    def add_vectors(
        self,
        collection_name: str,
        vectors: list[list[float]],
        payloads: list[dict],
        ids: list[str] | None = None,
    ) -> None:
        """批量写入向量与 payload。"""
        ...

    def search(
        self,
        collection_name: str,
        query_vector: list[float],
        top_k: int = 10,
        score_threshold: float | None = None,
        payload_filter: dict | None = None,
    ) -> list[dict]:
        """向量相似度搜索。"""
        ...

    def delete_by_metadata(self, collection_name: str, key: str, value: str) -> None:
        """按 payload 字段精确删除。"""
        ...


class BaseDocumentStore(Protocol):
    """Core 层对文档元数据存储的能力契约。

    实现：``src.storage.document_store.DocumentStore``（MySQL 聚合门面）。

    本 Protocol 合并了 core 实际用到的、来自 ``DocStore`` / ``FAQStore`` /
    ``SettingsStore`` 的方法子集。
    """

    # ── 文档操作（来自 DocStore）────────────────────────────────

    def list_documents(self, kb_name: str, page: int = 1, page_size: int = 20) -> tuple[list[dict], int]:
        """列出知识库下的文档（分页）。返回 (items, total)。"""
        ...

    def get_document(self, doc_id: int) -> dict | None:
        """按 ID 获取文档。"""
        ...

    def add_document(
        self,
        kb_name: str,
        file_name: str,
        file_size: int,
        chunk_count: int,
        chunk_size: int,
        chunk_overlap_ratio: float,
        doc_type: str,
        splitter_type: str,
        status: str = ...,
        content: str = ...,
        summary: str = ...,
    ) -> dict:
        """新增文档记录。"""
        ...

    def update_document(self, doc_id: int, **kwargs: object) -> dict | None:
        """更新文档字段。"""
        ...

    def delete_document(self, doc_id: int) -> None:
        """删除文档记录。"""
        ...

    # ── FAQ 查询（来自 FAQStore，仅 Agent 工具使用）─────────────

    def get_faq(self, faq_id: int) -> dict | None:
        """按 ID 获取 FAQ。"""
        ...

    # ── 系统设置（来自 SettingsStore）───────────────────────────

    def get_setting(self, key: str) -> str | None:
        """读取系统设置项。"""
        ...
