"""LangGraph 驱动的文档清洗 pipeline。"""

from langgraph.graph import StateGraph, START, END

from .state import CleaningState
from .nodes import optimizer_node, evaluator_node

MAX_RETRIES = 3


def _should_continue(state: CleaningState) -> str:
    if state["status"] == "PASS" or state["retry_count"] >= MAX_RETRIES:
        return END
    return "optimizer"


def _build_graph():
    g = StateGraph(CleaningState)
    g.add_node("optimizer", optimizer_node)
    g.add_node("evaluator", evaluator_node)
    g.add_edge(START, "optimizer")
    g.add_edge("optimizer", "evaluator")
    g.add_conditional_edges("evaluator", _should_continue)
    return g.compile()


_graph = _build_graph()


def clean_text(content: str, content_type: str = "text") -> str:
    """对给定内容执行 LLM 清洗，返回清洗后的文本。

    Args:
        content:      待清洗的文本内容。
        content_type: 内容类型，取值 "text" | "table" | "image"。
                      - "text":  使用标准清洗 prompt（现有行为）。
                      - "table": 使用表格专用清洗 prompt。
                      - "image": 图片描述块，跳过清洗直接返回原文。
    """
    if content_type == "image":
        return content

    initial_state: CleaningState = {
        "original_content": content,
        "current_content": "",
        "attempts": [],
        "feedback_history": [],
        "retry_count": 0,
        "status": "FAIL",
        "content_type": content_type,
    }
    final_state = _graph.invoke(initial_state)
    return final_state["current_content"]
