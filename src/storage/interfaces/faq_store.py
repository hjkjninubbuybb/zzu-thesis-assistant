"""FAQStore Protocol 接口。"""

from typing import Protocol


class BaseFAQStore(Protocol):
    """FAQ 数据访问接口。"""

    def add_faq(
        self,
        kb_name: str,
        question: str,
        answer: str,
        category: str = "",
        sort_order: int = 0,
        vector_id: str | None = None,
        author_id: int | None = None,
        status: str = "approved",
    ) -> dict:
        """新增 FAQ 条目，返回新建行 dict。"""
        ...

    def list_faqs(
        self,
        kb_name: str,
        enabled_only: bool = False,
        status: str | None = None,
    ) -> list[dict]:
        """列出 FAQ，支持状态过滤。"""
        ...

    def get_faq(self, faq_id: int) -> dict | None:
        """按 ID 查询 FAQ，不存在返回 None。"""
        ...

    def update_faq(self, faq_id: int, **kwargs: object) -> dict | None:
        """更新 FAQ 字段，返回更新后的行或 None。"""
        ...

    def delete_faq(self, faq_id: int) -> dict | None:
        """删除 FAQ，返回被删除的行或 None。"""
        ...

    def search_by_text(self, kb_name: str, query: str, limit: int = 20) -> list[dict]:
        """Question 或 answer 包含 query 的 FAQ，不过滤 status/enabled，按 sort_order ASC, id DESC 排序。"""
        ...
