"""查询增强：规则扩写 + 候选保护策略。

实现 BaseQueryEnhancer 接口。
"""

from __future__ import annotations

from typing import Any

from src.core.interfaces import BaseQueryEnhancer


def node_key(node: dict[str, Any]) -> str:
    """Return a stable key for de-duplicating retrieved nodes."""
    node_id = node.get("node_id")
    if node_id is not None:
        return str(node_id)
    return f"{node.get('source_file', '')}:{str(node.get('text', ''))[:80]}"


def protect_raw_candidates(
    raw_nodes: list[dict[str, Any]],
    reranked_nodes: list[dict[str, Any]],
    protect_n: int,
    final_n: int,
) -> list[dict[str, Any]]:
    """Keep top raw candidates in the final context to reduce reranker truncation loss."""
    if protect_n <= 0 or final_n <= 0:
        return reranked_nodes

    selected = list(reranked_nodes[:final_n])
    selected_keys = {node_key(n) for n in selected}
    protected_keys = {node_key(n) for n in raw_nodes[:protect_n]}

    for raw in raw_nodes[:protect_n]:
        key = node_key(raw)
        if key in selected_keys:
            continue

        while len(selected) >= final_n:
            drop_idx = next(
                (idx for idx in range(len(selected) - 1, -1, -1) if node_key(selected[idx]) not in protected_keys),
                len(selected) - 1,
            )
            removed = selected.pop(drop_idx)
            selected_keys.discard(node_key(removed))

        selected.append(raw)
        selected_keys.add(key)

    return selected


class RuleQueryEnhancer(BaseQueryEnhancer):
    """基于规则的查询扩写器（毕业设计领域特化）。"""

    def enhance(self, query: str) -> str:
        """根据关键词规则扩写查询。"""
        additions: list[str] = []
        stage_related = any(term in query for term in ("文献综述", "开题", "中期检查", "初稿", "定稿"))
        topic_pool_deadline_related = (
            any(term in query for term in ("题库", "公示", "汇总", "老师们的题目"))
            and "选题" in query
            and any(term in query for term in ("最晚", "什么时候", "时间点", "文件规定", "汇总", "公示"))
        )
        task_timing_related = (
            any(term in query for term in ("任务书", "选题", "师生见面", "师生双选", "题库"))
            and any(
                term in query
                for term in (
                    "什么时候",
                    "啥时候",
                    "开始",
                    "启动",
                    "第十六周",
                    "第十七周",
                    "第十九周",
                    "周末",
                    "发布时间",
                    "发布选题",
                    "提交时间",
                    "截止",
                    "具体日期",
                    "日期范围",
                    "几周",
                    "间隔",
                    "最晚",
                    "大四上",
                    "开学",
                    "汇总",
                    "公示",
                    "题库",
                    "另行通知",
                    "安排依据",
                )
            )
            and not topic_pool_deadline_related
        )

        if "文献综述" in query:
            additions.append("文献综述 引言 国内外现状 技术分析 问题与挑战 总结 参考文献 中期检查")
        reference_policy_file_related = "参考文献" in query and any(
            term in query for term in ("校级文件", "依据哪份", "哪份文件", "执行")
        )
        if reference_policy_file_related:
            additions.append("郑州大学本科毕业论文（设计）工作规定 校教务 2016 10号 文件精神 教务部通知")
        elif "参考文献" in query or "著录格式" in query or "GB/T" in query:
            additions.append("郑州大学学报 工学版 标准格式 GB/T 7714-2015 参考文献规范")
        if "开题" in query:
            additions.append("开题报告 指导教师 自行组织开题 是否能够开题 学院统一汇总")
        if "中期检查" in query:
            additions.append("中期检查 指导教师填写评语 检查教师 分组听取学生汇报 第六周")
        if stage_related and any(
            term in query for term in ("审核", "权限", "批准", "二级审核", "学院审核", "领导小组")
        ):
            additions.append("指导教师审核 学院管理员 二级审核 学院毕业设计领导小组 监督 检查")
        if any(term in query for term in ("格式", "图表", "公式", "摘要", "缩略语", "模板")):
            additions.append("格式规范 图表编号 公式排版 摘要要求 缩略语 首次出现 全称")
        if "初稿" in query:
            additions.append("论文初稿 第十一周 2026.5.11 2026.5.15 上传论文初稿 查重")
        if "开题报告" in query and any(term in query for term in ("第几周", "日期范围", "哪几天", "必须", "提交")):
            additions.append("第一周 2026.3.2 2026.3.6 学生开题并提交开题报告")
        if "文献综述" in query and ("中期检查" in query or "中期检查表" in query):
            additions.append("第六周 2026.4.6 2026.4.10 中期检查 学生提交文献综述和中期检查表")
        if "查重" in query or "复制比" in query or "AIGC" in query:
            additions.append("学术不端检测 合格标准 教务部规定 复制比≤30% AIGC生成比例≤40% 进入下一环节")
        if topic_pool_deadline_related:
            additions.append("第七学期期末考试周前 各专业组织教师拟题 专家审核 汇总选题结果报学院教学办")
        if "师生双选" in query and any(term in query for term in ("启动", "开始", "立即", "另行通知", "安排依据")):
            additions.append("第十七周–第十九周 2025.12.29–2026.1.16 师生见面 指导教师发布选题 提交任务书")
        if "任务书" in query and any(
            term in query for term in ("谁来确认", "按时", "已接收", "超期记录", "指导过程记录表")
        ):
            additions.append("指导教师 检查工作进度 工作质量 指导过程记录表 学生填写指导内容 指导教师审核并签名")
        paper_material_before_proposal = any(
            term in query for term in ("纸质版材料", "纸质材料", "每类材料", "几份")
        ) and any(term in query for term in ("师生双选", "开题前", "教学办公室", "指导教师"))
        if (
            "任务书" in query
            and any(
                term in query
                for term in (
                    "纸质版材料",
                    "纸质材料",
                    "每类材料",
                    "几份",
                    "开题前",
                    "教学办公室",
                )
            )
        ) or paper_material_before_proposal:
            additions.append("第十七周–第十九周 2025.12.29 2026.1.16 师生见面 指导教师发布选题 第十九周末提交任务书")
        if stage_related and any(term in query for term in ("第几周", "哪一周", "具体日期", "时间节点", "最晚")):
            additions.append("工作进度表 第七学期 第八学期 周次 日期")
        if task_timing_related:
            additions.append(
                "工作进度表 第七学期 第十六周 第十七周 第十九周 "
                "2025.12.22 2025.12.29 2026.1.16 师生见面 指导教师发布选题 提交任务书"
            )

        unique: list[str] = []
        seen: set[str] = set()
        for addition in additions:
            if addition not in seen:
                unique.append(addition)
                seen.add(addition)
        return query if not unique else f"{query} {' '.join(unique)}"
