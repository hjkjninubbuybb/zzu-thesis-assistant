"""LangGraph 驱动的文档清洗 pipeline。"""

import logging
import re

from langgraph.graph import StateGraph, START, END

from .state import CleaningState
from .nodes import optimizer_node, evaluator_node

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

_IMG_PLACEHOLDER_RE = re.compile(r"!\[IMG_[^\]]+\]")


def placeholder_check_node(state: CleaningState) -> dict:
    """程序级占位符校验节点。

    统计原文和清洗后文本中的 ``![IMG_...]`` 数量，若清洗后有丢失则注入
    feedback 并将 status 置为 FAIL，optimizer 下一轮会收到明确提示。
    占位符数量一致（或文档非 multimodal）时不修改 state，让 evaluator 继续。
    """
    if state.get("doc_type", "plain_text") != "multimodal":
        return {}

    orig_count = len(_IMG_PLACEHOLDER_RE.findall(state["original_content"]))
    if orig_count == 0:
        return {}

    clean_count = len(_IMG_PLACEHOLDER_RE.findall(state["current_content"]))
    if clean_count >= orig_count:
        return {"placeholder_failed": False}

    lost = orig_count - clean_count
    feedback = (
        f"⚠️ 程序检测：清洗后占位符从 {orig_count} 个减少为 {clean_count} 个，"
        f"丢失了 {lost} 个 ![IMG_...] 图片引用。"
        "请重新清洗，确保每一个 ![IMG_xxx](...) 原样保留，绝对不能删除。"
    )
    logger.warning(
        "[placeholder_check] 丢失占位符 %d 个（原 %d → 清洗后 %d）",
        lost, orig_count, clean_count,
    )
    return {
        "placeholder_failed": True,
        "status": "FAIL",
        "feedback_history": state["feedback_history"] + [feedback],
        "retry_count": state["retry_count"] + 1,
    }


def _after_placeholder_check(state: CleaningState) -> str:
    """placeholder_check 触发则打回 optimizer，否则走 evaluator。"""
    if state.get("placeholder_failed") and state["retry_count"] < MAX_RETRIES:
        return "optimizer"
    return "evaluator"


def _should_continue(state: CleaningState) -> str:
    if state["status"] == "PASS" or state["retry_count"] >= MAX_RETRIES:
        return END
    return "optimizer"


def _build_graph():
    g = StateGraph(CleaningState)
    g.add_node("optimizer", optimizer_node)
    g.add_node("placeholder_check", placeholder_check_node)
    g.add_node("evaluator", evaluator_node)
    g.add_edge(START, "optimizer")
    g.add_edge("optimizer", "placeholder_check")
    g.add_conditional_edges("placeholder_check", _after_placeholder_check)
    g.add_conditional_edges("evaluator", _should_continue)
    return g.compile()


_graph = _build_graph()


def clean_text(
    content: str,
    content_type: str = "text",
    doc_type: str = "plain_text",
) -> str:
    """对给定内容执行 LLM 清洗，返回清洗后的文本。

    清洗失败或结果为空时返回原始内容（不抛异常，调用方无需处理）。

    Args:
        content:      待清洗的文本内容。
        content_type: "text" | "table" | "image"
        doc_type:     "plain_text" | "multimodal"（multimodal 时启用占位符校验）
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
        "doc_type": doc_type,
        "placeholder_failed": False,
    }
    try:
        final_state = _graph.invoke(initial_state)
        result = (final_state.get("current_content") or "").strip()
        if not result:
            logger.warning("[clean_text] 清洗结果为空，返回原始内容")
            return content
        return result
    except Exception as e:
        logger.warning("[clean_text] 清洗失败，返回原始内容: %s", e)
        return content
