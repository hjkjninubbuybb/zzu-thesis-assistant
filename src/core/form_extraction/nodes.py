"""Form 提取工作流的节点：extractor（强模型）+ evaluator（快速模型）。"""

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, ValidationError

from src.core.eval_base import EvaluatorOutput
from src.core.llm_factory import get_llm

from .prompts import (
    FORM_EVALUATOR_PROMPT,
    FORM_EXTRACTOR_PROMPT,
    FORM_EXTRACTOR_RETRY_TEMPLATE,
)
from .state import FormExtractionState

logger = logging.getLogger(__name__)


# ── Pydantic 输出模型 ──────────────────────────────────────────


class FormSection(BaseModel):
    topic: str = Field(description="主题名称，如'中文摘要格式要求'")
    content: str = Field(description="该主题下的完整信息描述，只包含原文实际存在的文字")


class FormExtraction(BaseModel):
    sections: list[FormSection] = Field(
        description="提取的 sections，无实质内容时为空列表"
    )
    no_extraction_reason: str = Field(
        default="",
        description="sections 为空时说明理由，非空时留空",
    )


# ── extractor_node ─────────────────────────────────────────────


def extractor_node(state: FormExtractionState) -> dict:
    """强模型判断是否有实质内容，有则按主题提取，无则输出空 sections + 理由。"""
    llm = get_llm(fast=False, streaming=False)
    structured_llm = llm.with_structured_output(FormExtraction)

    if not state["attempts"]:
        # 首次提取
        user_content = f"请判断并处理以下文档：\n\n{state['original_text']}"
    else:
        # 重试：带上历史和 feedback
        history = ""
        for i, (attempt, feedback) in enumerate(
            zip(state["attempts"], state["feedback_history"])
        ):
            if attempt:
                sections_text = "\n".join(
                    f"- [{s['topic']}] {s['content']}" for s in attempt
                )
                history += f"### 第 {i + 1} 次提取结果\n{sections_text}\n\n"
            else:
                reason = state.get("no_extraction_reason", "")
                history += f"### 第 {i + 1} 次结果\n（无需提取，理由：{reason}）\n\n"
            history += f"### 评估反馈\n{feedback}\n\n"
        history += f"### 原始文档\n{state['original_text']}"
        user_content = FORM_EXTRACTOR_RETRY_TEMPLATE.format(history=history)

    messages = [
        SystemMessage(content=FORM_EXTRACTOR_PROMPT),
        HumanMessage(content=user_content),
    ]

    try:
        result = structured_llm.invoke(messages)
        sections = [{"topic": s.topic, "content": s.content} for s in result.sections]
        no_extraction_reason = result.no_extraction_reason or ""
    except Exception as e:
        logger.warning("[extractor_node] LLM 调用失败，保留上次结果: %s", e)
        sections = state.get("sections") or []
        no_extraction_reason = state.get("no_extraction_reason", "")

    return {
        "sections": sections,
        "no_extraction_reason": no_extraction_reason,
        "attempts": state["attempts"] + [sections],
    }


# ── evaluator_node ─────────────────────────────────────────────


def evaluator_node(state: FormExtractionState) -> dict:
    """快速模型评估提取结果：有内容则验证完整性，无内容则审核不提取理由。"""
    llm = get_llm(fast=True, streaming=False)

    if state["sections"]:
        sections_text = "\n\n".join(
            f"**[{s['topic']}]**\n{s['content']}" for s in state["sections"]
        )
        extraction_block = f"## 提取结果\n\n{sections_text}"
    else:
        reason = state.get("no_extraction_reason", "（未说明理由）")
        extraction_block = f"## 提取结果\n\n（无需提取）\n\n**不提取理由**：{reason}"

    user_content = f"## 原始文档\n\n{state['original_text']}\n\n{extraction_block}"

    # 追加历史评估记录
    if state["feedback_history"]:
        history = "\n\n".join(
            f"### 第 {i + 1} 轮反馈\n{fb}"
            for i, fb in enumerate(state["feedback_history"])
        )
        user_content += f"\n\n## 历史评估记录\n\n{history}"

    messages = [
        SystemMessage(content=FORM_EVALUATOR_PROMPT),
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
