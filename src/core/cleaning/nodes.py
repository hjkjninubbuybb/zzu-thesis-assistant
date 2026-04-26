import json
import logging
import os

from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, ValidationError

from src.config import get_config, get_dashscope_api_key
from .state import CleaningState
from .prompts import (
    OPTIMIZER_SYSTEM_PROMPT,
    OPTIMIZER_RETRY_TEMPLATE,
    TABLE_OPTIMIZER_SYSTEM_PROMPT,
    FORM_TABLE_EXTRACTOR_PROMPT,
    FORM_DOCUMENT_OPTIMIZER_PROMPT,
    EVALUATOR_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)

_COMMON_SPECIAL = set(
    "，。！？；：""''（）【】《》、·…—～"
    "≤≥±×÷√∞∑∏∂∫≈≠°%℃℉→←↑↓"
    "①②③④⑤⑥⑦⑧⑨⑩"
)


def _detect_unusual_chars(text: str) -> list[str]:
    result = []
    for ch in sorted(set(text)):
        cp = ord(ch)
        if cp < 128:
            continue
        if 0x4E00 <= cp <= 0x9FFF:
            continue
        if 0x3000 <= cp <= 0x303F:
            continue
        if 0xFF00 <= cp <= 0xFFEF:
            continue
        if ch in _COMMON_SPECIAL:
            continue
        result.append(ch)
    return result


class EvaluatorOutput(BaseModel):
    status: str
    feedback: str


def _get_llm(fast: bool = False) -> ChatTongyi:
    cfg = get_config()["llm"]
    model = cfg["fast_model"] if fast else cfg["model"]
    return ChatTongyi(model=model, api_key=get_dashscope_api_key())


def optimizer_node(state: CleaningState) -> dict:
    llm = _get_llm()
    content_type = state.get("content_type", "text")

    if content_type == "table":
        system_prompt = TABLE_OPTIMIZER_SYSTEM_PROMPT
    elif content_type == "form_table":
        system_prompt = FORM_TABLE_EXTRACTOR_PROMPT
    elif content_type == "form":
        system_prompt = FORM_DOCUMENT_OPTIMIZER_PROMPT
    else:
        system_prompt = OPTIMIZER_SYSTEM_PROMPT

    unusual = _detect_unusual_chars(state["original_content"])
    unusual_note = (
        f"\n\n⚠️ 检测到以下不常见特殊字符，请结合上下文判断是否为字符识别错误并酌情纠正："
        f"{'、'.join(f'{ch}（U+{ord(ch):04X}）' for ch in unusual)}"
        if unusual else ""
    )

    if not state["attempts"]:
        user_content = f"请清洗以下文档：\n\n{state['original_content']}{unusual_note}"
    else:
        history = ""
        for i, (attempt, feedback) in enumerate(
            zip(state["attempts"], state["feedback_history"])
        ):
            history += f"### 第 {i + 1} 次尝试结果\n{attempt}\n\n### 评估反馈\n{feedback}\n\n"
        history += f"### 原始文档\n{state['original_content']}"
        user_content = OPTIMIZER_RETRY_TEMPLATE.format(history=history)

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]
    try:
        response = llm.invoke(messages)
        cleaned = response.content.strip()
    except Exception as e:
        logger.warning("[optimizer_node] LLM 调用失败，保留上次结果: %s", e)
        # 失败时保留上次结果（或原始内容）
        cleaned = state.get("current_content") or state["original_content"]

    return {
        "current_content": cleaned,
        "attempts": state["attempts"] + [cleaned],
    }


def evaluator_node(state: CleaningState) -> dict:
    llm = _get_llm(fast=True)  # PASS/FAIL 判断，用快速模型

    user_content = (
        f"## 原始文档\n\n{state['original_content']}\n\n"
        f"## 清洗后文档\n\n{state['current_content']}"
    )
    messages = [
        SystemMessage(content=EVALUATOR_SYSTEM_PROMPT),
        HumanMessage(content=user_content),
    ]
    try:
        response = llm.invoke(messages)
        try:
            output = EvaluatorOutput(**json.loads(response.content.strip()))
        except (json.JSONDecodeError, ValidationError, KeyError):
            logger.warning("[evaluator_node] 解析评估结果失败，标记为 FAIL")
            output = EvaluatorOutput(status="FAIL", feedback=response.content.strip())
    except Exception as e:
        logger.warning("[evaluator_node] LLM 调用失败，标记为 FAIL: %s", e)
        output = EvaluatorOutput(status="FAIL", feedback=str(e))

    return {
        "status": output.status,
        "feedback_history": state["feedback_history"] + [output.feedback],
        "retry_count": state["retry_count"] + 1,
    }
