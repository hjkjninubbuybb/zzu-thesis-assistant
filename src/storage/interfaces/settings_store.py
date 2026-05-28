"""SettingsStore Protocol 接口。"""

from typing import Protocol


class BaseSettingsStore(Protocol):
    """系统设置数据访问接口。"""

    def get_setting(self, key: str) -> str | None:
        """读取配置项，key 不存在返回 None。"""
        ...

    def set_setting(self, key: str, value: str) -> None:
        """写入配置项（upsert 语义）。"""
        ...

    def delete_setting(self, key: str) -> None:
        """删除配置项。"""
        ...
