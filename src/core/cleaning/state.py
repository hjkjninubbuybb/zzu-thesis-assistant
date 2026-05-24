from typing import Literal

from typing_extensions import TypedDict


class CleaningState(TypedDict):
    original_content: str
    current_content: str
    attempts: list[str]
    feedback_history: list[str]
    retry_count: int
    status: Literal["PASS", "FAIL"]
    content_type: str  # "text" | "table" | "image"，默认 "text"
    doc_type: str  # "plain_text" | "multimodal"，默认 "plain_text"
    placeholder_failed: bool  # placeholder_check_node 检测到占位符丢失时为 True
