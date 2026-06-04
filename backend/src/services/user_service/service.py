"""UserService 主类：装配 CRUD / Mentor / Import / Export 四个 Mixin。"""

from src.services.base import BaseService
from src.services.user_service._crud import CrudMixin
from src.services.user_service._export import ExportMixin
from src.services.user_service._import import ImportMixin
from src.services.user_service._mentor import MentorMixin
from src.storage.interfaces.user_store import BaseUserStore


class UserService(CrudMixin, MentorMixin, ImportMixin, ExportMixin, BaseService):
    """用户账号增删查改、档案、师生关系及 Excel 批量导入服务。"""

    def __init__(self, user_store: BaseUserStore) -> None:
        super().__init__()
        self._user_store = user_store
