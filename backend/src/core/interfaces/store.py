"""core 层使用的存储抽象协议 —— 隔离 core/ 与 storage/ 的直接依赖。

core/ 层通过这些协议与存储交互，具体实现（BaseDocumentStore / BaseVectorStore）
由上层（services/ 或 api/deps.py）通过参数注入传入。
"""

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class IDocProvider(Protocol):
    """文档元数据和系统设置访问协议。"""

    def list_documents(self, kb_name: str, page: int = 1, page_size: int = 20) -> tuple[list[dict], int]: ...

    def get_document(self, doc_id: int) -> dict | None: ...

    def add_document(
        self,
        kb_name: str,
        file_name: str,
        file_size: int,
        chunk_count: int,
        chunk_size: int,
        doc_type: str,
        splitter_type: str,
        status: str,
        summary: str,
        content: str,
        **kwargs: Any,
    ) -> dict: ...

    def update_document(self, doc_id: int, **kwargs: Any) -> bool: ...

    def delete_document(self, doc_id: int) -> None: ...

    def get_setting(self, key: str) -> str | None: ...


@runtime_checkable
class IVectorProvider(Protocol):
    """向量存储访问协议。"""

    def search(
        self,
        kb_name: str,
        query_vector: list[float],
        top_k: int,
        filter_: dict | None = None,
    ) -> list[dict]: ...

    def create_collection(self, kb_name: str) -> None: ...

    def add_vectors(
        self,
        kb_name: str,
        vectors: list[list[float]],
        payloads: list[dict],
        ids: list[str],
    ) -> None: ...

    def delete_by_metadata(self, kb_name: str, key: str, value: Any) -> None: ...
