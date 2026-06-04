"""Evaluator-Optimizer 子图共享的基础类型。"""

from pydantic import BaseModel


class EvaluatorOutput(BaseModel):
    """评估节点的标准化输出。"""

    status: str  # "PASS" | "FAIL"
    feedback: str
