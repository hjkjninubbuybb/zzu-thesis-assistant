"""LangGraph 驱动的 Form 文档提取 pipeline（Evaluator-Optimizer 模式）。"""

import logging

from langgraph.graph import END, START, StateGraph

from .nodes import evaluator_node, extractor_node
from .state import FormExtractionState

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


def _should_continue(state: FormExtractionState) -> str:
    if state["status"] == "PASS" or state["retry_count"] >= MAX_RETRIES:
        return END
    return "extractor"


def _build_graph():
    g = StateGraph(FormExtractionState)
    g.add_node("extractor", extractor_node)
    g.add_node("evaluator", evaluator_node)
    g.add_edge(START, "extractor")
    g.add_edge("extractor", "evaluator")
    g.add_conditional_edges("evaluator", _should_continue)
    return g.compile()


_graph = _build_graph()


def extract_form_sections(
    text: str,
    file_name: str = "",
) -> dict:
    """对给定表单/模板文档执行 LLM 提取，返回提取结果和状态。

    返回格式：``{"sections": [...], "status": "PASS" | "FAIL"}``

    - ``status="PASS", sections 非空``：提取成功，使用 sections 向量化
    - ``status="PASS", sections 为空``：主动判断无实质内容，调用方不应 fallback
    - ``status="FAIL", sections 为空``：提取失败或重试耗尽，调用方可 fallback
    """
    initial_state: FormExtractionState = {
        "original_text": text,
        "file_name": file_name,
        "sections": [],
        "no_extraction_reason": "",
        "attempts": [],
        "feedback_history": [],
        "retry_count": 0,
        "status": "FAIL",
    }

    try:
        final_state = _graph.invoke(initial_state)
        sections = final_state.get("sections") or []
        status = final_state.get("status", "FAIL")

        logger.info(
            "[extract_form] '%s' 完成: %d sections, status=%s, retries=%d",
            file_name,
            len(sections),
            status,
            final_state["retry_count"],
        )
        return {"sections": sections, "status": status}
    except Exception as e:
        logger.warning("[extract_form] 提取异常，返回 FAIL: %s", e)
        return {"sections": [], "status": "FAIL"}
