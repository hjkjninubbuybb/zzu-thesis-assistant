"""Service 基类（可选继承）。"""

import logging


class BaseService:
    """所有 Service 的可选基类，提供带类名前缀的 logger。

    不强制继承，不继承也不影响 Service 正常工作。
    唯一职责：让 self.logger 自动带 ClassName 前缀。
    """

    def __init__(self) -> None:
        self.logger = logging.getLogger(self.__class__.__name__)
