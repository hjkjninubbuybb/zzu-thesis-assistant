"""FAQ 业务编排：CRUD + 向量同步 + Excel 导入导出 + 语义搜索。

外部统一通过 ``from src.services.faq_service import FAQService`` 引用。
内部按职责拆分到 _crud / _excel / _search 三个 Mixin。
"""

from src.services.faq_service.service import FAQService

__all__ = ["FAQService"]
