"""操作手册步骤级分割器。

将 cleaned markdown（含 ![IMG_xxx] 占位符）按操作步骤分割为 TextNode，
每个节点包含完整步骤的文字内容，metadata 携带结构化语义字段。

支持 LLM few-shot 语义抽取（step_title / goal / precondition / action_type 等），
失败时回退为规则默认值。
"""
from __future__ import annotations

import json
import logging
import os
import re

from llama_index.core.schema import BaseNode, Document, TextNode

from src.core.splitter import BaseSplitter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 章节编号正则（手册四级体系）
# ---------------------------------------------------------------------------
_L1 = re.compile(r"^(?:#+\s*)?[一二三四五六七八九十]+、\s*(.+)")
_L2 = re.compile(r"^(?:#+\s*)?（[一二三四五六七八九十]+）\s*(.+)")
_L3 = re.compile(r"^(?:#+\s*)?(\d+)[.．]\s*(.+)")
_L4 = re.compile(r"^(?:#+\s*)?（(\d+)）\s*(.+)")
_IMG = re.compile(r"!\[IMG_([^\]]+)\]\([^\)]+\)")

# 二级标题 → stage 关键词映射（郑大毕设管理系统）
_STAGE_MAP: dict[str, str] = {
    "师生双选": "师生双选",
    "过程管理": "过程管理",
    "论文检测": "论文检测",
    "评分管理": "评分管理",
    "答辩安排": "答辩安排",
    "论文终稿": "论文终稿",
    "系统登录": "系统登录",
    "论文过程": "论文过程",
    "指导老师评阅": "指导老师评阅",
    "终稿审核": "论文终稿",
    "论文信息": "完善论文信息",
}


# ---------------------------------------------------------------------------
# 结构解析（规则，确定性）
# ---------------------------------------------------------------------------

def _infer_role(source_doc: str) -> str:
    s = source_doc.lower()
    if "student" in s or "学生" in s:
        return "student"
    if "teacher" in s or "教师" in s or "指导" in s:
        return "teacher"
    return "unknown"


def _match_stage(title: str) -> str:
    for kw, stage in _STAGE_MAP.items():
        if kw in title:
            return stage
    return title.strip()


def _parse_blocks(text: str, source_doc: str) -> list[dict]:
    """将 cleaned markdown 解析为原始步骤块列表。"""
    role = _infer_role(source_doc)
    lines = text.splitlines()

    cur_l1 = ""
    cur_l2_stage = ""
    cur_l3_title = ""

    blocks: list[dict] = []
    cur_block: dict | None = None

    def _flush():
        nonlocal cur_block
        if cur_block and cur_block["body_lines"]:
            cur_block["image_refs"] = [
                m.group(1) for line in cur_block["body_lines"]
                for m in [_IMG.search(line)] if m
            ]
            blocks.append(cur_block)
        cur_block = None

    def _new_block(level: int, title: str, branch: str | None):
        nonlocal cur_block
        if "......" in title:
            _flush()
            cur_block = None
            return
        _flush()
        cur_block = {
            "role": role,
            "stage": cur_l2_stage,
            "level": level,
            "title": title,
            "branch_condition": branch,
            "body_lines": [],
            "image_refs": [],
            "source_doc": source_doc,
        }

    for line in lines:
        stripped = line.strip()

        m = _L1.match(stripped)
        if m:
            cur_l1 = m.group(1)
            cur_l2_stage = _match_stage(cur_l1)
            _new_block(1, cur_l1, None)
            continue

        m = _L2.match(stripped)
        if m:
            cur_l2_stage = _match_stage(m.group(1))
            _new_block(2, m.group(1), None)
            continue

        m = _L3.match(stripped)
        if m:
            cur_l3_title = m.group(2)
            _new_block(3, cur_l3_title, None)
            continue

        m = _L4.match(stripped)
        if m:
            branch_title = m.group(2)
            _new_block(4, f"{cur_l3_title}—{branch_title}", branch_title)
            continue

        if cur_block is not None:
            cur_block["body_lines"].append(line)

    _flush()
    return blocks


# ---------------------------------------------------------------------------
# LLM 语义抽取（few-shot）
# ---------------------------------------------------------------------------

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
    body = "\n".join(
        line for line in block["body_lines"]
        if not _IMG.search(line)
    ).strip()

    if not body:
        return _default_semantic(block)

    examples_text = "\n\n".join(
        f"输入：\n角色={ex['role']}\n阶段={ex['stage']}\n标题={ex['title']}\n文字={ex['body']}\n输出：\n{json.dumps(ex['output'], ensure_ascii=False)}"
        for ex in _FEW_SHOT_EXAMPLES
    )

    user_content = (
        f"{examples_text}\n\n"
        f"输入：\n角色={block['role']}\n阶段={block['stage']}\n"
        f"标题={block['title']}\n文字={body}\n输出："
    )

    try:
        from src.core.rag_pipeline import _get_llm
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = _get_llm(fast=False, streaming=False)
        resp = llm.invoke([
            SystemMessage(content=_EXTRACT_SYSTEM),
            HumanMessage(content=user_content),
        ])
        raw = str(resp.content).strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        return json.loads(raw)
    except Exception as e:
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


# ---------------------------------------------------------------------------
# 组装 step 对象
# ---------------------------------------------------------------------------

def _make_step_id(block: dict, idx: int) -> str:
    role_short = "s" if block["role"] == "student" else "t"
    stage_short = re.sub(r"\s", "", block["stage"])[:4]
    return f"{role_short}_{stage_short}_{idx:02d}"


def _blocks_to_steps(blocks: list[dict], use_llm: bool = True) -> list[dict]:
    """将解析块列表转换为 step 对象列表（含语义字段）。"""
    steps = []
    idx = 1
    for block in blocks:
        if not block["body_lines"] and not block["image_refs"]:
            continue

        semantic = _extract_semantic(block) if use_llm else _default_semantic(block)

        body_text = "\n".join(
            line for line in block["body_lines"]
            if not _IMG.search(line)
        ).strip()

        step: dict = {
            "role": block["role"],
            "stage": block["stage"],
            "step_id": _make_step_id(block, idx),
            "step_title": semantic.get("step_title", block["title"][:20]),
            "goal": semantic.get("goal", ""),
            "precondition": semantic.get("precondition", []),
            "branch_condition": block["branch_condition"],
            "action_type": semantic.get("action_type", []),
            "state_before": semantic.get("state_before", ""),
            "state_after": semantic.get("state_after", []),
            "raw_text": body_text,
            "image_refs": block["image_refs"],
            "source_doc": block["source_doc"],
        }
        steps.append(step)
        idx += 1

    return steps


# ---------------------------------------------------------------------------
# BaseSplitter 接口
# ---------------------------------------------------------------------------

class ManualStepSplitter(BaseSplitter):
    """操作手册步骤级分割器。

    将 cleaned markdown 按操作步骤分割为 TextNode，
    每个节点包含完整步骤的文字内容，metadata 携带结构化语义字段。

    构造参数：
        chunk_size / chunk_overlap_ratio: 接口一致性保留，本分割器不使用
        use_llm: 是否调用 LLM 语义抽取（False 时仅做结构解析）
    """

    def __init__(
        self,
        chunk_size: int = 256,
        chunk_overlap_ratio: float = 0.2,
        *,
        use_llm: bool = True,
    ):
        self._use_llm = use_llm

    def split(self, documents: list[Document]) -> list[BaseNode]:
        nodes: list[BaseNode] = []

        for doc in documents:
            source_doc = doc.metadata.get("file_name", "unknown")
            source_doc_key = _infer_role(source_doc) + "_manual"

            blocks = _parse_blocks(doc.text, source_doc_key)
            steps = _blocks_to_steps(blocks, use_llm=self._use_llm)

            for step in steps:
                node_text = f"{step['step_title']}\n\n{step['raw_text']}".strip()
                if not node_text:
                    continue

                metadata: dict = {}
                for k, v in step.items():
                    if k == "raw_text":
                        continue
                    if isinstance(v, list):
                        metadata[k] = json.dumps(v, ensure_ascii=False)
                    elif v is None or isinstance(v, (str, int, float)):
                        metadata[k] = v
                    else:
                        metadata[k] = str(v)
                metadata["content_type"] = "manual_step"

                node = TextNode(text=node_text, metadata=metadata)
                nodes.append(node)

        return nodes
