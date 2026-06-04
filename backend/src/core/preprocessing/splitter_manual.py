"""操作手册步骤级分割器。

将 cleaned markdown（含 ![IMG_xxx] 占位符）按操作步骤分割为 TextNode，
每个节点包含完整步骤的文字内容，metadata 携带结构化语义字段。

支持 LLM few-shot 语义抽取（step_title / goal / precondition / action_type 等），
失败时回退为规则默认值。

实现分三段：
- ``_manual_blocks._parse_blocks``：规则解析 markdown → 原始块
- ``_manual_semantic._extract_semantic``：LLM few-shot 抽取语义字段
- 本文件：组装 step 对象 + 实现 ``BaseSplitter`` 接口
"""

from __future__ import annotations

import json
import logging
import re

from llama_index.core.schema import BaseNode, Document, TextNode

from src.core.preprocessing._manual_blocks import _IMG, _infer_role, _parse_blocks
from src.core.preprocessing._manual_semantic import _default_semantic, _extract_semantic
from src.core.preprocessing.splitter import BaseSplitter

logger = logging.getLogger(__name__)


# ── 组装 step 对象 ───────────────────────────────────────────────


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

        body_text = "\n".join(line for line in block["body_lines"] if not _IMG.search(line)).strip()

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


# ── BaseSplitter 接口 ────────────────────────────────────────────


class ManualStepSplitter(BaseSplitter):
    """操作手册步骤级分割器。

    将 cleaned markdown 按操作步骤分割为 TextNode，每个节点包含完整步骤的
    文字内容，metadata 携带结构化语义字段。

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
