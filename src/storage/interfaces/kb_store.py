"""KBStore Protocol 接口。"""

from typing import Protocol


class BaseKBStore(Protocol):
    """知识库数据访问接口。"""

    def create_kb(self, name: str, description: str = "") -> dict:
        """新建知识库记录。

        Args:
            name: 知识库唯一名称。
            description: 描述信息。

        Returns:
            新建的知识库行 dict。
        """
        ...

    def list_kbs(self) -> list[dict]:
        """列出所有知识库（含 doc_count 统计）。"""
        ...

    def get_kb(self, name: str) -> dict | None:
        """按名称查询知识库，不存在返回 None。"""
        ...

    def delete_kb(self, name: str) -> None:
        """删除知识库记录（级联删除由 DB 外键处理）。"""
        ...
