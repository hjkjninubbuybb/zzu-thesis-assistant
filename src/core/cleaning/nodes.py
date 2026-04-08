import json
import os

from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel

from .state import CleaningState
from .prompts import (
    OPTIMIZER_SYSTEM_PROMPT,
    OPTIMIZER_RETRY_TEMPLATE,
    TABLE_OPTIMIZER_SYSTEM_PROMPT,
    EVALUATOR_SYSTEM_PROMPT,
)

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


def _get_llm() -> ChatTongyi:
    return ChatTongyi(
        model="qwen-plus",
        api_key=os.environ.get("DASHSCOPE_API_KEY"),
    )


def optimizer_node(state: CleaningState) -> dict:
    llm = _get_llm()
    content_type = state.get("content_type", "text")

    # 按内容类型选择系统提示词
    if content_type == "table":
        system_prompt = TABLE_OPTIMIZER_SYSTEM_PROMPT
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
    response = llm.invoke(messages)
    cleaned = response.content.strip()

    return {
        "current_content": cleaned,
        "attempts": state["attempts"] + [cleaned],
    }


def evaluator_node(state: CleaningState) -> dict:
    llm = _get_llm()

    user_content = (
        f"## 原始文档\n\n{state['original_content']}\n\n"
        f"## 清洗后文档\n\n{state['current_content']}"
    )
    messages = [
        SystemMessage(content=EVALUATOR_SYSTEM_PROMPT),
        HumanMessage(content=user_content),
    ]
    response = llm.invoke(messages)

    try:
        output = EvaluatorOutput(**json.loads(response.content.strip()))
    except Exception:
        output = EvaluatorOutput(status="FAIL", feedback=response.content.strip())

    return {
        "status": output.status,
        "feedback_history": state["feedback_history"] + [output.feedback],
        "retry_count": state["retry_count"] + 1,
    }
