"""向后兼容 shim — 实现已移至 src/core/shared/llm_factory.py。"""

from src.core.shared.llm_factory import get_llm

__all__ = ["get_llm"]
