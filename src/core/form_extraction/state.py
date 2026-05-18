"""Form 提取工作流的状态定义。"""

from typing import TypedDict


class FormExtractionState(TypedDict):
    original_text: str           # 原始文档文本
    file_name: str               # 文件名（上下文信息）
    sections: list[dict]         # 当前提取结果 [{"topic": "...", "content": "..."}, ...]
    no_extraction_reason: str    # sections 为空时，extractor 给出的不提取理由
    attempts: list[list[dict]]   # 历史提取尝试
    feedback_history: list[str]  # 每轮 evaluator 反馈
    retry_count: int
    status: str                  # PASS / FAIL
