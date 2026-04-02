from typing import Literal
from typing_extensions import TypedDict


class CleaningState(TypedDict):
    original_content: str
    current_content: str
    attempts: list[str]
    feedback_history: list[str]
    retry_count: int
    status: Literal["PASS", "FAIL"]
