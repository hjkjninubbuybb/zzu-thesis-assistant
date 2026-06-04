"""操作手册步骤的 LLM 语义抽取（few-shot）。

接受 ``_manual_blocks._parse_blocks`` 产出的原始块，调用快速模型抽取结构化
语义字段（step_title / goal / precondition / action_type / state_before /
state_after）。LLM 失败时回退到 ``_default_semantic`` 的规则默认值。
"""

import json
import logging
import re

from src.core.preprocessing._manual_blocks import _IMG

logger = logging.getLogger(__name__)


_FEW_SHOT_EXAMPLES = [
    {
        "role": "student",
        "stage": "师生双选",
        "title": "填写选题具体要求并提交",
        "body": "学生选择对应选题，按要求填写课题名称、申请理由等信息后提交申请。",
        "output": {
            "step_title": "填写选题信息并提交申请",
            "goal": "完成选题申请，等待指导老师审核",
            "precondition": ["已找到合适的选题"],
            "action_type": ["fill_form", "submit"],
            "state_before": "已浏览可选题目",
            "state_after": ["待指导老师审核"],
        },
    },
    {
        "role": "student",
        "stage": "论文检测",
        "title": "查看检测结果并决定是否重新检测",
        "body": "论文检测完成后，将显示检测结果并提供对应的检测报告，学生可下载查看。若第一次检测未通过，可重新选择论文提交检测。如果全部通过可以选择结束检测进入下一环节。",
        "output": {
            "step_title": "查看检测结果并决定是否重新检测",
            "goal": "确认检测是否通过，决定进入下一环节或重新检测",
            "precondition": ["已完成一次检测"],
            "action_type": ["view", "download", "retry", "finish"],
            "state_before": "检测中 / 已完成一次检测",
            "state_after": ["重新检测", "进入下一环节"],
        },
    },
    {
        "role": "teacher",
        "stage": "过程管理",
        "title": "任务书审核—学生为任务书发起人",
        "body": "如设置学生为任务书发起人，学生提交任务书后，需指导老师对任务书进行审核。点击审核可查看任务书详情，若审核通过，则需点击签字并选择日期。",
        "output": {
            "step_title": "审核学生提交的任务书并签字",
            "goal": "完成任务书审核，签字确认",
            "precondition": ["学生已提交任务书"],
            "action_type": ["review", "sign", "approve"],
            "state_before": "待指导老师审核",
            "state_after": ["任务书审核通过", "进入开题报告阶段"],
        },
    },
]

_EXTRACT_SYSTEM = """你是一个信息抽取专家。根据操作手册的步骤文字，抽取结构化字段。
严格按 JSON 格式输出，不要有其他内容。字段说明：
- step_title: 简短的步骤标题（10字以内）
- goal: 用户做这一步的目的（一句话）
- precondition: 触发此步骤的前置条件列表
- action_type: 操作类型列表，从以下选：navigate/select/fill_form/submit/upload/review/approve/reject/sign/download/view/retry/finish/wait/check_status
- state_before: 进入此步骤时系统显示的状态
- state_after: 完成此步骤后可能进入的状态列表"""


def _extract_semantic(block: dict) -> dict:
    """用 LLM 抽取语义字段，失败时返回默认值。"""
    body = "\n".join(line for line in block["body_lines"] if not _IMG.search(line)).strip()

    if not body:
        return _default_semantic(block)

    examples_text = "\n\n".join(
        f"输入：\n角色={ex['role']}\n阶段={ex['stage']}\n标题={ex['title']}\n文字={ex['body']}\n输出：\n"
        f"{json.dumps(ex['output'], ensure_ascii=False)}"
        for ex in _FEW_SHOT_EXAMPLES
    )

    user_content = (
        f"{examples_text}\n\n"
        f"输入：\n角色={block['role']}\n阶段={block['stage']}\n"
        f"标题={block['title']}\n文字={body}\n输出："
    )

    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        from src.core.shared.llm_factory import get_llm

        llm = get_llm(fast=False, streaming=False)
        resp = llm.invoke(
            [
                SystemMessage(content=_EXTRACT_SYSTEM),
                HumanMessage(content=user_content),
            ]
        )
        raw = str(resp.content).strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        # LLM 调用 / JSON 解析任何失败都退到规则默认值，不阻塞索引流程
        logger.warning("LLM 语义抽取失败 [%s]: %s", block.get("title"), e)
        return _default_semantic(block)


def _default_semantic(block: dict) -> dict:
    return {
        "step_title": block["title"][:20],
        "goal": "",
        "precondition": [],
        "action_type": [],
        "state_before": "",
        "state_after": [],
    }
