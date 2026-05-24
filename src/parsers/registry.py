"""解析器注册中心。

设计原则：
- 注册与查找分离，支持运行时扩展。
- get_parser() 是 indexing.py 的唯一入口，不感知具体解析器实现。
- SUPPORTED_EXTS 由 registry 动态维护，外部通过 get_supported_extensions() 获取。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.parsers.base import BaseParser

# 内部注册表：扩展名（小写，含点）-> 解析器实例
_REGISTRY: dict[str, BaseParser] = {}


def register_parser(ext: str, parser: BaseParser) -> None:
    """注册一个解析器。

    Args:
        ext:    文件扩展名，须含点号且小写，如 ".pdf"。
        parser: 满足 BaseParser 协议的解析器实例。

    Raises:
        ValueError: ext 格式不合法时。
    """
    if not ext.startswith("."):
        raise ValueError(f"扩展名必须以点号开头，收到: {ext!r}")
    _REGISTRY[ext.lower()] = parser


def get_parser(ext: str) -> BaseParser:
    """根据文件扩展名获取对应解析器。

    Args:
        ext: 文件扩展名（小写，含点），如 ".pdf"。

    Returns:
        对应的解析器实例。

    Raises:
        ValueError: 该扩展名未注册时，携带友好错误信息。
    """
    parser = _REGISTRY.get(ext.lower())
    if parser is None:
        supported = ", ".join(sorted(_REGISTRY.keys()))
        raise ValueError(f"不支持的文件类型 '{ext}'，当前支持: {supported}")
    return parser


def get_supported_extensions() -> frozenset[str]:
    """返回当前已注册的所有扩展名集合（只读视图）。"""
    return frozenset(_REGISTRY.keys())
