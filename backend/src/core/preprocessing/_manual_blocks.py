"""操作手册结构解析：按 markdown 四级标题切分原始块。

规则确定性，不调用 LLM。产出的 block dict 后续由 ``_manual_semantic`` 做 LLM
语义抽取并由 ``splitter_manual`` 装配为最终 step。
"""

import re

# ── 章节编号正则（手册四级体系）─────────────────────────────────
_L1 = re.compile(r"^(?:#+\s*)?[一二三四五六七八九十]+、\s*(.+)")
_L2 = re.compile(r"^(?:#+\s*)?([一二三四五六七八九十]+)\s*(.+)")
_L3 = re.compile(r"^(?:#+\s*)?(\d+)[.．]\s*(.+)")
_L4 = re.compile(r"^(?:#+\s*)?(\d+)\s*(.+)")
_IMG = re.compile(r"!\[IMG_([^\]]+)\]\(([^\)]+)\)")

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
    """将 cleaned markdown 解析为原始步骤块列表。

    Args:
        text: 已清洗的 markdown 文本（含 ![IMG_xxx] 占位符）。
        source_doc: 源文件标识，用于 role 推断和回填到每个 block。

    Returns:
        每个块包含 role / stage / level / title / branch_condition /
        body_lines / image_refs / source_doc 字段。
    """
    role = _infer_role(source_doc)
    lines = text.splitlines()

    cur_l1 = ""
    cur_l2_stage = ""
    cur_l3_title = ""

    blocks: list[dict] = []
    cur_block: dict | None = None

    def _flush() -> None:
        nonlocal cur_block
        if cur_block and cur_block["body_lines"]:
            cur_block["image_refs"] = [m.group(1) for line in cur_block["body_lines"] for m in [_IMG.search(line)] if m]
            blocks.append(cur_block)
        cur_block = None

    def _new_block(level: int, title: str, branch: str | None) -> None:
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
