"""用户业务编排：账号 CRUD + 档案 + 师生关系 + Excel 导入导出。

外部统一通过 ``from src.services.user_service import UserService`` 引用。
内部按职责拆分到 _crud / _mentor / _import / _export 四个 Mixin。
"""

from src.services.user_service.service import UserService

__all__ = ["UserService"]
