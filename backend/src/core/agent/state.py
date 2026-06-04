"""Agent 状态定义。"""

import operator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """图的状态定义，严格限制在单次对话会话内。"""

    messages: Annotated[list[BaseMessage], operator.add]
    query: str
    kb_name: str
    captured_nodes: list[dict]
    file_events: list[dict]
    route_decision: str
    is_relevant: bool
    retry_count: int
    tasks: list[str]
    is_document_request: bool
    file_hint: str
