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


def clean_text(content: str) -> str:
    """对给定文本内容执行 LLM 清洗，返回清洗后的文本。"""
    initial_state: CleaningState = {
        "original_content": content,
        "current_content": "",
        "attempts": [],
        "feedback_history": [],
        "retry_count": 0,
        "status": "FAIL",
    }
    final_state = _graph.invoke(initial_state)
    return final_state["current_content"]
