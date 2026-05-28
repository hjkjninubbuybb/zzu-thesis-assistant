"""DocStore Protocol 接口。"""

from typing import Protocol


class BaseDocStore(Protocol):
    """文档数据访问接口。"""

    def add_document(
        self,
        kb_name: str,
        file_name: str,
        file_size: int = 0,
        chunk_count: int = 0,
        chunk_size: int = 256,
        chunk_overlap_ratio: float = 0.1,
        doc_type: str = "plain_text",
        splitter_type: str = "recursive",
        status: str = "completed",
        summary: str | None = None,
        content: str | None = None,
    ) -> dict:
        """插入文档记录，返回新建行 dict。"""
        ...

    def update_document(self, doc_id: int, **kwargs: object) -> bool:
        """更新文档字段，返回是否成功。"""
        ...

    def update_document_summary(self, doc_id: int, summary: str) -> bool:
        """更新文档摘要字段，返回是否成功。"""
        ...

    def list_documents(self, kb_name: str) -> list[dict]:
        """列出知识库内所有文档。"""
        ...

    def delete_document(self, doc_id: int) -> dict | None:
        """删除文档记录，返回被删除的行或 None。"""
        ...

    def get_document(self, doc_id: int) -> dict | None:
        """按 ID 查询文档，不存在返回 None。"""
        ...
