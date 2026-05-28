"""安全护栏接口。"""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseSafetyGuard(ABC):
    """安全护栏：在生成后拦截高频错误答案。"""

    @abstractmethod
    def check(self, query: str, generation: str) -> tuple[str, list[str]]:
        """检查并可能替换生成结果。

        Args:
            query: 用户查询
            generation: LLM 生成的原始回答

        Returns:
            (最终回答, 触发的规则名列表)
        """
