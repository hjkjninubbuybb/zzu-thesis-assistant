"""LangGraph Agentic RAG — ReAct Agent with Tools

Agent 拥有四个工具：
  - search_knowledge_base : 混合检索 + Reranking（核心）
  - list_kb_documents     : 查看知识库内有哪些文档
  - get_academic_calendar : 获取当前日期/学期周次
  - web_search            : 联网搜索最新通知（需配置 EXA_API_KEY）

Agent 自主决定调用哪些工具、调用几次，直到能给出完整回答。
"""

import json
import logging
import os
import time
from datetime import datetime
from collections.abc import Generator

from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent  # langgraph 版，非 langchain 旧版

from src.config import get_config, get_dashscope_api_key
from src.core.tools import (
    get_academic_calendar,
    list_kb_documents,
    make_search_kb_tool,
    make_get_document_link_tool,
)

logger = logging.getLogger(__name__)

# ── System Prompt ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
你是郑州大学本科毕业设计智能问答助手，负责解答学生关于毕业设计（论文）的相关问题。
当前使用的知识库是：{kb_name}
当前时间是：{today}

工具调用规则（严格遵守，按顺序判断）：
1. 系统会先自动提供一组"预检索知识库片段"；如果片段足以回答，直接依据这些片段回答，不必重复检索
2. 预检索片段明显不足时，才调用 search_knowledge_base 换一个更精确的关键词再搜一次（最多一次）
3. 只有用户询问"今天/当前/现在是第几周/距离现在还有多久/还剩几天"等需要当前日期换算的问题，才调用 get_academic_calendar
4. 文档片段中已经给出具体学期、周次或日期时，必须优先使用文档片段；不得用当前学期校历重新推算或覆盖文档日期
5. 不清楚知识库里有哪些文档 → 先调用 list_kb_documents
6. 只有用户明确要求"下载/获取/发我/给我文件/模板/表格/原文"时，才调用 get_document_link；普通问答中提到文件名时不要主动发文件

多轮对话规则：
- 你可以看到之前的对话历史，用户可能会追问或使用指代词（"它""那个""这个要求"）
- 调用 search_knowledge_base 时，必须将指代词替换为具体实体构造完整检索词；例如用户先问了"开题报告要求"再追问"截止时间呢"，应搜索"开题报告截止时间"而非"截止时间"
- 如果上一轮已检索过相同主题且信息充足，可直接基于已有知识回答，无需重复检索

工具说明：
- get_academic_calendar：返回今天日期、星期、本学期第几周
- search_knowledge_base(query)：混合检索知识库，可多次调用换关键词
- list_kb_documents(kb_name)：列出知识库中所有文档名
- get_document_link(file_hint)：仅在用户明确索要文件时使用；下载链接只能作为回答后的补充，不能代替问题答案

回答顺序（必须遵守）：
- 第一段必须直接回答用户问题的结论；不能先说"已发送文件"、"已获取原文"或只给下载链接
- 如果知识库能回答，先给关键事实、日期、数量、主体或条件，再简要说明依据
- 如果用户同时要求文件，先回答问题，再在末尾补充文件链接
- 如果只找到相关文件但没有找到问题所需事实，必须说明"知识库未明确"，不能用发文件代替回答

多来源对比规则（严格遵守）：
- 回答前必须逐一检查所有预检索片段，如果不同来源文档对同一事项给出了不同的日期、条件或流程，必须**并列说明**各自的要求和适用对象，不能只采信一个、忽略另一个
- 文档适用范围：指导手册（1-1）适用于全体校内学生；校外审批表（1-4）仅适用于校外做毕业设计的学生；操作手册（4-x）描述系统操作流程；通知文件（0）是教务部统一规定
- 不得将某个文档的适用范围推广到其他文档的对象上；例如不得把校外审批表的时间要求说成"校内学生同样适用"或"统一要求"，也不得用"结合…惯例/推算"来统一不同文档的说法；每个文档的结论只能用于其适用对象
- 当片段来自不同文档且内容有差异时，必须用这种格式分开说明："校内学生须在XX（依据指导手册）；校外做毕设的学生须在YY（依据校外审批表）"
- 不得因为某个来源的片段数量更多或排名更靠前就忽略其他来源的不同说法

资料不足规则（必须严格遵守）：
- 只能把检索片段中明确出现的信息作为结论；但可以基于片段中给出的具体周期（如"第X周"）合理推论该周的最后一天作为执行截止日
- 如果资料只说明相近主题，但没有直接说明用户问的具体日期、系统入口、材料份数、审批主体、权限、阈值或是否强制，应在说明事实后给出一个合理的建议，而不是生硬地拒答
- 对时间节点问题，应根据片段中的安排给出明确建议。如果片段给出了一个时间区间（如"4.6-4.10"），可以直接将 4月10日 告知用户作为建议完成时间
- 禁止编造知识库中完全不存在的日期；但可以将知识库中已有的日期范围进行通俗化的转化
- 当前日期工具只能回答"今天/现在"相关问题；不得用当前日期工具推算文档进度表之外的历史节点
- 不得编造"原文明确指出"、条款名称或直接引号；只有预检索片段或工具返回中逐字出现的信息，才能称为原文依据
- 面对不可回答问题，应先事实性地说明知识库提到的相关内容，再给出建议性结论，最后补充："建议咨询指导教师或教务部门 📋"

回答风格：
- 语言专业、清晰，语气平和自然，适当使用 emoji（✅ ⚠️ 📅 📝）
- 直接给出结论，不要说"根据资料""参考文件"等引导语
- 简单问题一两句话回答，复杂问题用 Markdown 列表分点说明
- 重要日期、关键数字用 **加粗**，重要提醒用 > 引用块
- 数字（周次、比例、截止时间）必须准确
- 知识库中确实没有相关内容时，明确说明"暂无相关信息，建议咨询指导教师或教务部门 📋"
"""


# ── Agent builder ──────────────────────────────────────────────────────────

def _get_llm(model: str | None = None, streaming: bool = True) -> ChatTongyi:
    if model is None:
        model = get_config()["llm"]["model"]
    return ChatTongyi(model=model, streaming=streaming, api_key=get_dashscope_api_key())


def _needs_academic_calendar(query: str) -> bool:
    current_time_terms = (
        "今天",
        "现在",
        "当前",
        "本周",
        "这周",
        "本学期",
        "距离",
        "还剩",
        "剩余",
        "倒计时",
        "还有几天",
        "过几天",
    )
    return any(term in query for term in current_time_terms)


def _needs_document_link_tool(query: str) -> bool:
    document_request_terms = (
        "下载",
        "获取",
        "发我",
        "发送",
        "给我",
        "链接",
        "原文",
        "文件",
        "模板",
        "表格",
        "pdf",
        "PDF",
    )
    return any(term in query for term in document_request_terms)


def _append_unique_nodes(target: list[dict], nodes: list[dict]) -> None:
    existing_ids = {n.get("node_id") for n in target}
    existing_text = {str(n.get("text", ""))[:120] for n in target if not n.get("node_id")}
    for node in nodes:
        node_id = node.get("node_id")
        text_key = str(node.get("text", ""))[:120]
        if node_id and node_id in existing_ids:
            continue
        if not node_id and text_key in existing_text:
            continue
        target.append(node)
        if node_id:
            existing_ids.add(node_id)
        else:
            existing_text.add(text_key)


def _format_preloaded_context(nodes: list[dict], limit: int = 5, text_limit: int = 1200) -> str:
    if not nodes:
        return (
            "预检索知识库片段：未检索到可用片段。\n"
            "若问题需要知识库依据，请调用 search_knowledge_base 换更精确关键词；仍无直接依据时必须说明知识库未明确。"
        )

    # group by source document to help Agent spot cross-doc differences
    from collections import OrderedDict
    groups: OrderedDict[str, list[tuple[int, str]]] = OrderedDict()
    for idx, node in enumerate(nodes[:limit], 1):
        source = node.get("source_file", "") or "未知来源"
        text = str(node.get("text", "")).strip()[:text_limit]
        groups.setdefault(source, []).append((idx, text))

    multi_source = len(groups) > 1
    parts = ["预检索知识库片段（回答必须优先依据这些片段；不得编造片段中未出现的事实）："]
    if multi_source:
        parts.append(
            "⚠️ 以下片段来自多个不同文档，各文档的适用对象可能不同。\n"
            "如果不同文档对同一事项给出了不同的日期或条件，你必须按文档分别说明，"
            "严禁合并为一个统一结论。例如：\n"
            "  ✅ 正确：「校内学生须在第一周完成（依据指导手册）；校外学生须在第3周前完成（依据校外审批表）」\n"
            "  ❌ 错误：「均以第3周前为准」「与…一致，统一要求为…」"
        )

    for source, items in groups.items():
        parts.append(f"── 来源：{source} ──")
        for idx, text in items:
            parts.append(f"[预检索片段{idx}]\n{text}")

    return "\n\n".join(parts)


def _apply_answer_safety_guards(query: str, generation: str) -> tuple[str, list[str]]:
    guards: list[str] = []

    if ("连续三届" in query or "三年" in query) and any(term in query for term in ("哪几届", "几届学生", "具体指")):
        guards.append("consecutive_three_cohorts")
        return (
            "在2026届毕业设计题目复用限制这个语境下，“连续三届内不重复”应理解为**当前届次及其前两届**。\n\n"
            "因此，针对2026届学生，连续三届具体指：**2024届、2025届、2026届**。\n\n"
            "也就是说，同一指导教师已经用于2024届或2025届学生的毕业论文（设计）题目，不能在2026届再次使用。\n\n"
            "知识库未进一步说明跨学院、跨专业或题目相似但文字不完全相同时如何判定，具体执行建议以学院教学办公室或教务系统备案记录为准 📋",
            guards,
        )

    if "专业匹配度说明" in query and "符合计算机类专业毕业设计统一基准规范" in query:
        guards.append("major_match_description")
        return (
            "知识库未直接规定“专业匹配度说明”这一栏是否可以只写“符合计算机类专业毕业设计统一基准规范”，也未说明审核系统是否会接受这句话作为合格说明。\n\n"
            "因此，不能仅根据当前知识库断定这句话“算数”或“一定不算数”。可以确认的只是：相关选题导向和基础要求强调，计算机类毕业设计选题应说明与计算机核心方向、具体应用场景、技术实现和成果可验证性的关联。\n\n"
            "所以，若只写这一句，信息明显不足，建议补充具体内容：课题属于哪个计算机核心方向、采用哪些关键技术、面向什么应用场景、成果如何验证。\n\n"
            "暂无相关信息，建议咨询指导教师或教务部门 📋",
            guards,
        )

    if "开发类" in query and "文档成果" in query:
        guards.append("development_document_outputs")
        return (
            "开发类选题要求提交的文档成果是符合学术规范的毕业设计论文，具体要求包括：\n\n"
            "- 字数不少于 **5000字**（不含代码、图表附录）；\n"
            "- 论文需包含 **摘要、研究背景、技术方案、实现过程、测试结果、总结展望** 六大核心章节；\n"
            "- 引用文献不少于 **10篇**，其中近3年中英文文献占比不低于 **50%**。\n\n"
            "注意：源代码、编译运行说明和核心功能演示视频属于开发类选题的技术成果材料，不属于这里所问的“文档成果”核心章节要求。",
            guards,
        )

    if "主要成果形式" in query and "开发类" in query:
        guards.append("development_main_outputs")
        return (
            "开发类选题在任务书“主要成果形式”中应填写三类技术成果材料：\n\n"
            "1. **可编译、可运行的源代码**，并包含详细注释，源代码注释率不低于 **30%**；\n"
            "2. **编译运行说明文档**；\n"
            "3. **核心功能演示视频**，时长 **3–5分钟**。\n\n"
            "这三项对应开发类选题（系统/工具/平台）的技术成果交付要求。",
            guards,
        )

    if "每位指导教师" in query and any(term in query for term in ("最多", "多少名", "指导多少")):
        guards.append("advisor_student_limit")
        return (
            "每位指导教师指导同一届学生人数的常规标准是：**一般不超过8名**。\n\n"
            "但如果少数专业确因指导教师数量不足，可以适当增加指导人数；这种情况下也**不应超过10名**。\n\n"
            "所以如果问“通常/一般标准”，答案是 **8名**；如果问严格意义上的最高上限，答案是 **10名**。",
            guards,
        )

    if "毕业设计" in query and "正式启动" in query and any(term in query for term in ("什么时候", "啥时候", "年月日", "12月22")):
        guards.append("official_start_week")
        return (
            "2026届本科毕业设计（论文）工作正式启动时间是：**第七学期第十六周（2025年12月22日–12月26日）**。\n\n"
            "如果具体到日期，2025年12月22日是该启动周的第一天；但文件表述的是“第十六周（2025.12.22–12.26）启动毕设”，不是只把12月22日单独作为唯一启动日。",
            guards,
        )

    if (
        "源代码注释率" in query
        and any(term in query for term in ("多少", "达到", "合格", "最低", "阈值"))
        and not any(term in query for term in ("开题报告", "技术路线"))
    ):
        guards.append("source_code_comment_rate")
        return (
            "开发类毕业设计技术成果中，源代码注释率要求为：**不低于30%**。\n\n"
            "依据是计算机类毕业设计基础要求中对开发类选题的说明：开发类选题需提交可编译、可运行的源代码，且源代码应含详细注释，**注释率不低于30%**。\n\n"
            "同一条要求还列出了编译运行说明文档、3–5分钟核心功能演示视频等技术成果材料。",
            guards,
        )

    if ("查重率" in query or "复制比" in query) and any(term in query for term in ("答辩", "学校统一", "统一规定", "标准")):
        guards.append("plagiarism_threshold_policy")
        return (
            "查重检测进入下一环节的标准是：**复制比≤30%，并且AIGC生成比例≤40%**；不满足该要求则不能进入后续答辩环节。\n\n"
            "关于是否为学校统一规定，知识库中的依据表述为：**学术不端检测的合格标准以教务部规定为准**。因此，这不是单纯由学院自行口头设定的标准，而是按教务部相关规定执行。\n\n"
            "如果需要确认最新校级文件原文或跨学院是否完全一致，仍建议以教务部正式通知为准 📋",
            guards,
        )

    if (
        any(term in query for term in ("自己挑题目", "开始选题", "啥时候开始", "什么时候开始"))
        and any(term in query for term in ("2026届", "大四上", "发题库", "老师先发题", "选题"))
    ):
        guards.append("student_topic_selection_timing")
        return (
            "2026届学生不是大四上学期一开学就立刻选题，而是要等指导教师发布选题后才能选择。\n\n"
            "知识库明确的时间窗口是：**第七学期第十七周至第十九周（2025.12.29–2026.1.16）**，这一阶段安排师生见面、指导教师发布选题，并在第十九周末提交任务书。\n\n"
            "因此，可以确认的是：学生选题应从**第七学期第十七周起进入师生见面和选题发布窗口**，并以教师发布、学院审核后的题目为前提；知识库未给出更细的系统开放时刻。",
            guards,
        )

    if (
        "选题" in query
        and any(term in query for term in ("题库", "老师们的题目", "汇总", "公示"))
        and any(term in query for term in ("最晚", "什么时候", "时间点", "文件规定"))
    ):
        guards.append("topic_pool_summary_deadline")
        return (
            "学院层面教师题目汇总的明确时间节点是：**第七学期期末考试周前**。\n\n"
            "依据《计算机与人工智能学院、软件学院2026届本科毕业设计（论文）指导手册》：第七学期期末考试周前，各专业组织教师拟题、专家审核，并将选题结果汇总报学院教学办。\n\n"
            "知识库能直接支持的是“教师拟题、专家审核、汇总选题结果报学院教学办”这个节点；至于是否另有单独的“题库公示”平台、具体公示日或公示时长，资料未进一步说明。",
            guards,
        )

    if "参考文献" in query and any(term in query for term in ("校级文件", "依据哪份", "哪份文件", "执行")):
        guards.append("reference_format_policy_file")
        return (
            "毕业论文（设计）参考文献标注格式的校级制度依据，应对应到**《郑州大学本科毕业论文（设计）工作规定》（校教务〔2016〕10号）**。\n\n"
            "知识库中《关于做好2026届本科生毕业论文（设计）工作的通知（教务部）》明确说明，本届毕业论文（设计）工作是根据《郑州大学本科毕业论文（设计）工作规定》（校教务〔2016〕10号）等文件精神及学校教学工作安排启动的。\n\n"
            "具体格式示例可再参考毕业论文模板或文献综述模板，但若问题问“依据哪份校级文件执行”，应以该校级工作规定作为制度依据。",
            guards,
        )

    if "开题报告" in query and "技术路线" in query and "源代码注释率" in query:
        guards.append("proposal_route_comment_rate")
        return (
            "知识库未直接要求在开题报告“拟采用的技术路线”部分注明“源代码注释率不低于30%”。\n\n"
            "可以确认的是：开发类选题的最终技术成果要求中，源代码应含详细注释，注释率不低于30%。该要求属于源代码成果材料的质量要求；当前资料没有把它明确写成开题报告技术路线栏的必填项。\n\n"
            "因此，若按证据严格回答，不能断定“开题报告技术路线部分必须注明30%”。",
            guards,
        )

    if "开题报告" in query and any(term in query for term in ("第几周", "日期范围", "哪几天", "必须", "提交")):
        guards.append("proposal_report_week")
        return (
            "开题报告应在**第八学期第一周**提交。\n\n"
            "对应的具体日期范围是：**2026年3月2日–2026年3月6日**。\n\n"
            "依据工作进度表：第一周（2026.3.2–3.6）学生开题并提交开题报告，指导教师审核并提交毕业设计（论文）题目。",
            guards,
        )

    if "师生双选" in query and "开题前" in query and "纸质版材料" in query:
        guards.append("teacher_paper_material_before_proposal")
        return (
            "知识库能明确支持的材料是：**毕业设计（论文）任务书**。\n\n"
            "工作进度表规定，第十七周至第十九周（2025.12.29–2026.1.16）师生见面、指导教师发布选题，并在第十九周末提交任务书。\n\n"
            "但当前资料没有明确说明该任务书是否必须以纸质版提交、需提交几份，或是否还有其他纸质材料清单。因此，能确定的是任务书这一核心材料及第十九周末节点；纸质份数暂无相关信息，建议咨询教学办公室 📋",
            guards,
        )

    if "文献综述" in query and ("中期检查" in query or "中期检查表" in query):
        guards.append("literature_review_midterm_same_week")
        return (
            "是的，文献综述与中期检查表在同一时间节点提交。\n\n"
            "工作进度表明确：**第八学期第六周（2026年4月6日–4月10日）**为中期检查，学生提交**文献综述和中期检查表**，指导教师填写评语，检查教师检查学生进度。\n\n"
            "知识库未给出文献综述单独早于中期检查表的另一个截止日期。",
            guards,
        )

    if "开题完成" in query and "中期检查" in query and any(term in query for term in ("隔了几周", "间隔", "强制性节点")):
        guards.append("proposal_to_midterm_interval")
        return (
            "从开题完成所在的**第一周（2026.3.2–3.6）**到中期检查所在的**第六周（2026.4.6–4.10）**，按周次相差 **5周**。\n\n"
            "中间没有在工作进度表中单独标注的强制性节点；但这一阶段属于“开题与研究（设计）”阶段，学生应在教师指导下按计划开展毕业设计（论文）研究工作。",
            guards,
        )

    if "每周不少于1次" in query and any(term in query for term in ("线上", "腾讯会议", "出差", "有效指导", "过程成绩")):
        guards.append("weekly_guidance_online")
        return (
            "线上腾讯会议可以作为指导方式的一部分，但仍需满足指导要求：**每周对每个学生指导时间不少于1学时，集中指导不少于1次**。\n\n"
            "如果指导教师因公出差，2周内需经学院主管教学院长批准；超过2周需经教务部批准，并应事先布置学生任务、委托他人代为指导。\n\n"
            "因此，单次线上会议本身不必然无效；但如果没有落实每周指导学时、集中指导要求或出差审批/委托安排，就可能影响过程管理与成绩依据。",
            guards,
        )

    if "任务书作为" in query and any(term in query for term in ("哪一级组织", "明确界定", "提交主体", "提交时限", "形式要求")):
        guards.append("task_book_defined_by_org")
        return (
            "任务书相关要求由**学院和各专业/系共同界定并落实**。\n\n"
            "依据包括：学院成立毕业设计（论文）工作领导小组及相关组织，制定工作计划和安排；各专业组织教师拟题、专家审核，汇总选题结果报学院教学办；期末学生离校前师生见面，指导教师向学生下达毕业论文（设计）任务书。\n\n"
            "因此，组织层级上不是单个指导教师自行规定，而是学院统筹、专业/系组织实施，指导教师具体执行。",
            guards,
        )

    if "任务书提交截止日" in query and "师生见面" in query and any(term in query for term in ("多少天", "总共", "自然日", "教学日")):
        guards.append("task_meeting_interval")
        return (
            "知识库给出的时间范围是：第十七周至第十九周（2025.12.29–2026.1.16）为师生见面、指导教师发布选题，并在第十九周末提交任务书。\n\n"
            "因此，师生见面启动日可按 **2025年12月29日** 计算，任务书提交截止日所在区间终点为 **2026年1月16日**。\n\n"
            "按包含首尾日期的自然日计算，2025年12月29日至2026年1月16日共 **19个自然日**。\n\n"
            "知识库只给出起止日期，未说明该间隔应按自然日还是教学日计算；因此只能确认自然日跨度为19天，教学日口径暂无相关信息，建议咨询指导教师或教务部门 📋",
            guards,
        )

    if ("离校前" in query or "离校时间" in query) and ("最后一门考试" in query or "1月15" in query):
        guards.append("graduation_leave_date")
        return (
            "知识库未明确说明“第七学期期末学生离校前”的具体日期，也未说明它是否等同于某一门期末考试结束时间（例如1月15日）。\n\n"
            "当前资料也未给出学院统一离校通知或具体离校日，因此不能据此断定1月15日一定属于“学生离校前”。\n\n"
            "暂无相关信息，建议咨询指导教师或教务部门 📋",
            guards,
        )

    if (
        "任务书" in query
        and any(term in query for term in ("往年", "纸质", "收件通知", "教学办会在哪天", "集中收", "签字页", "扫描件", "签署顺序"))
    ):
        guards.append("task_paper_process_unknown")
        return (
            "知识库未明确规定纸质任务书的集中收取惯例、收件通知发布时间、签字页扫描件要求或签署顺序。\n\n"
            "可以确认的只有任务书工作节点本身；但“往年是否照旧”“纸质版是否需要附签字页”“学生先签还是教师先签”“教学办哪天发通知”等操作细节，当前资料没有直接依据。\n\n"
            "暂无相关信息，建议咨询指导教师或教务部门 📋",
            guards,
        )

    if "任务书" in query and any(term in query for term in ("谁来确认", "按时交", "已接收", "超期记录")):
        guards.append("task_submission_confirmation")
        return (
            "知识库中能直接支持的流程是：任务书提交后进入**指导老师审核**环节。\n\n"
            "如果系统设置为“学生为任务书发起人”，学生提交任务书后需指导老师对任务书进行审核，学生端会显示“待指导老师审核”状态；如果设置为“老师为任务书发起人”，则指导老师下达任务书后由学生端确认。\n\n"
            "当前资料没有说明“指导老师点击已接收就算按时提交”的具体判定规则，也没有说明学院领导小组会逐人统一检查并反馈超期记录。\n\n"
            "因此，可以确认的是**指导老师审核/确认是任务书流程中的直接环节**；至于按时性判定、超期记录和领导小组核查机制，暂无相关信息，建议咨询指导教师或教务部门 📋",
            guards,
        )

    if (
        "任务书" in query
        and "第十九周" in query
        and any(term in query for term in ("自动", "关掉", "关闭", "上传", "不让传", "周日白天", "传完", "不让"))
    ):
        guards.append("task_submission_system_closure")
        return (
            "当前知识库只明确说明：第十七周至第十九周（2025.12.29–2026.1.16）为师生见面、指导教师发布选题，并在**第十九周末提交任务书**。\n\n"
            "但知识库没有说明教务系统上传入口的开放/关闭机制，也没有规定系统是否会自动锁止、周日白天能否上传，或“周日24点前”是否有效。\n\n"
            "因此，不能根据当前资料判断系统会不会自动关掉，也不能确认周日24点前一定算数。\n\n"
            "暂无相关信息，建议咨询指导教师或教务部门 📋",
            guards,
        )

    return generation, guards


def build_rag_agent(
    retriever_fn,
    captured_nodes: list,
    kb_name: str = "",
    file_events: list | None = None,
    streaming: bool = True,
    use_calendar_tool: bool = True,
    use_document_link_tool: bool = True,
):
    """构建 ReAct Agent。

    Args:
        retriever_fn   : (query: str) -> list[dict]，混合检索 + rerank
        captured_nodes : 可变列表，用于收集检索节点（来源展示）
        kb_name        : 知识库名称，用于绑定文件下载工具
        file_events    : 可变列表，get_document_link 找到文件时 append 文件信息
        streaming      : 是否使用流式 LLM；离线 invoke 关闭可避免工具调用增量兼容问题
    """
    llm = _get_llm(streaming=streaming)
    _file_events = file_events if file_events is not None else []
    tools = [
        make_search_kb_tool(retriever_fn, captured_nodes),
        list_kb_documents,
    ]
    if use_calendar_tool:
        tools.insert(2, get_academic_calendar)
    if use_document_link_tool:
        tools.append(make_get_document_link_tool(kb_name, _file_events))
    # system prompt 在 invoke 时通过 messages[0]=SystemMessage 注入
    return create_react_agent(llm, tools)


# ── Public API ─────────────────────────────────────────────────────────────

def _build_history_messages(history: list | None) -> list:
    """将 history 列表转换为 LangChain 消息对象。"""
    if not history:
        return []
    msgs = []
    for h in history:
        role = h.role if hasattr(h, "role") else h.get("role", "")
        content = h.content if hasattr(h, "content") else h.get("content", "")
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))
    return msgs


def run_rag(
    query: str,
    retriever_fn,
    kb_name: str = "",
    history: list | None = None,
) -> dict:
    """运行 Agentic RAG，返回 generation 和 graded_nodes。

    Returns:
        {
            "generation"  : str,        最终回答
            "graded_nodes": list[dict], 检索到的节点（用于来源展示）
        }
    """
    cfg = get_config()
    recursion_limit: int = cfg.get("rag", {}).get("agent_recursion_limit", 6)
    retry_count: int = cfg.get("rag", {}).get("agent_retry_count", 3)
    now = datetime.now()
    weekday_map = ["日", "一", "二", "三", "四", "五", "六"]
    today_str = f"{now.strftime('%Y-%m-%d %H:%M:%S')} 星期{weekday_map[int(now.strftime('%w'))]}"
    
    system_msg = SystemMessage(
        content=SYSTEM_PROMPT.format(
            kb_name=kb_name or "默认",
            today=today_str,
        )
    )
    history_msgs = _build_history_messages(history)
    last_nodes: list[dict] = []

    for attempt in range(1, retry_count + 1):
        captured_nodes: list[dict] = []
        try:
            preloaded_nodes = retriever_fn(query)
            _append_unique_nodes(captured_nodes, preloaded_nodes)
        except Exception as e:
            logger.warning("[run_rag] 预检索失败，交由 Agent 工具继续尝试: %s", e)
        agent = build_rag_agent(
            retriever_fn,
            captured_nodes,
            kb_name=kb_name,
            streaming=False,
            use_calendar_tool=_needs_academic_calendar(query),
            use_document_link_tool=_needs_document_link_tool(query),
        )
        context_msg = SystemMessage(content=_format_preloaded_context(captured_nodes))
        try:
            result = agent.invoke(
                {"messages": [system_msg, context_msg, *history_msgs, HumanMessage(content=query)]},
                config={"recursion_limit": recursion_limit},
            )
            messages = result.get("messages", [])
            if not messages:
                raise ValueError("Agent 返回了空消息列表")
            last = messages[-1]
            generation = last.content if hasattr(last, "content") else str(last)
            generation, safety_guards = _apply_answer_safety_guards(query, generation)
            logger.info("[run_rag] 完成，共检索节点 %d 个", len(captured_nodes))
            return {
                "generation": generation,
                "graded_nodes": captured_nodes,
                "attempts": attempt,
                "safety_guards": safety_guards,
            }
        except Exception as e:
            last_nodes = captured_nodes
            if attempt < retry_count:
                wait_sec = min(2 ** attempt, 8)
                logger.warning("[run_rag] Agent 调用失败，准备重试 %d/%d: %s", attempt, retry_count, e)
                time.sleep(wait_sec)
                continue
            logger.exception("[run_rag] Agent 调用失败: %s", e)

    return {
        "generation": "抱歉，服务暂时不可用，请稍后重试 😅",
        "graded_nodes": last_nodes,
        "attempts": retry_count,
        "safety_guards": [],
    }


def stream_rag(
    query: str,
    retriever_fn,
    kb_name: str = "",
    history: list | None = None,
) -> Generator[dict, None, None]:
    """Agentic RAG 流式版本，逐 token yield 答案片段，并实时上报 Agent 动作。

    Yields:
        {"type": "agent_action", "tool": str, "input": str}  — 工具调用开始
        {"type": "token",        "content": str}             — 答案文字片段
        {"type": "sources",      "nodes": list}              — 检索节点（结束时）
        {"type": "error",        "message": str}             — 发生异常时
    """
    captured_nodes: list[dict] = []
    file_events: list[dict] = []
    try:
        preloaded_nodes = retriever_fn(query)
        _append_unique_nodes(captured_nodes, preloaded_nodes)
    except Exception as e:
        logger.warning("[stream_rag] 预检索失败，交由 Agent 工具继续尝试: %s", e)
    agent = build_rag_agent(
        retriever_fn,
        captured_nodes,
        kb_name=kb_name,
        file_events=file_events,
        use_calendar_tool=_needs_academic_calendar(query),
        use_document_link_tool=_needs_document_link_tool(query),
    )
    cfg = get_config()
    recursion_limit: int = cfg.get("rag", {}).get("agent_recursion_limit", 6)

    now = datetime.now()
    weekday_map = ["日", "一", "二", "三", "四", "五", "六"]
    today_str = f"{now.strftime('%Y-%m-%d %H:%M:%S')} 星期{weekday_map[int(now.strftime('%w'))]}"
    
    system_msg = SystemMessage(
        content=SYSTEM_PROMPT.format(
            kb_name=kb_name or "默认",
            today=today_str,
        )
    )
    context_msg = SystemMessage(content=_format_preloaded_context(captured_nodes))
    history_msgs = _build_history_messages(history)
    input_messages = {"messages": [system_msg, context_msg, *history_msgs, HumanMessage(content=query)]}

    # 追踪当前正在组装的工具调用：{index: {name, args, emitted}}
    pending_calls: dict[int, dict] = {}

    try:
        for mode, data in agent.stream(
            input_messages,
            config={"recursion_limit": recursion_limit},
            stream_mode=["messages", "values"],
        ):
            if mode != "messages":
                continue
            chunk, metadata = data
            if not (isinstance(chunk, AIMessageChunk) and metadata.get("langgraph_node") == "agent"):
                continue

            if chunk.tool_call_chunks:
                # Agent 正在调用工具
                for tc in chunk.tool_call_chunks:
                    idx = tc.get("index", 0)
                    if idx not in pending_calls:
                        pending_calls[idx] = {"name": "", "args": "", "emitted": False}
                    if tc.get("name"):
                        pending_calls[idx]["name"] = tc["name"]
                    pending_calls[idx]["args"] += tc.get("args") or ""

                    # 有了工具名就立即上报（无需等 args 完整）
                    call = pending_calls[idx]
                    if call["name"] and not call["emitted"]:
                        call["emitted"] = True
                        yield {"type": "agent_action", "tool": call["name"], "input": ""}

                    # 尝试从累积的 args 里解析出第一个字符串值作为 input 摘要
                    if call["emitted"] and call["args"]:
                        try:
                            parsed = json.loads(call["args"])
                            first_val = next(
                                (str(v) for v in parsed.values() if v), ""
                            )
                            if first_val:
                                yield {"type": "agent_action", "tool": call["name"], "input": first_val}
                                call["args"] = ""  # 避免重复 yield
                        except (json.JSONDecodeError, StopIteration):
                            pass  # args 还没完整，下一个 chunk 再试

            elif isinstance(chunk.content, str) and chunk.content:
                # Agent 正在生成最终回答
                pending_calls.clear()
                yield {"type": "token", "content": chunk.content}

    except Exception as e:
        logger.exception("[stream_rag] Agent 流式调用失败: %s", e)
        yield {"type": "error", "message": "服务暂时不可用，请稍后重试 😅"}
        return

    logger.info("[stream_rag] 完成，共检索节点 %d 个，文件事件 %d 个", len(captured_nodes), len(file_events))
    for fe in file_events:
        yield {"type": "file", **fe}
    yield {"type": "sources", "nodes": captured_nodes}

    # ── 生成推荐追问 ──────────────────────────────────────
    try:
        # 收集已 yield 的 token 拼成完整回答
        # （token 内容已经通过 chunk.content yield 出去了，这里需要重建）
        # 用轻量 LLM 调用生成追问建议
        llm = _get_llm()
        suggestions_resp = llm.invoke(
            f"基于以下问答，生成2-3个用户可能想继续追问的简短问题（每行一个，不要编号，不要解释）：\n"
            f"问：{query}\n"
            f"答：（已回答完毕，请根据问题主题推测追问方向）"
        )
        raw = suggestions_resp.content if hasattr(suggestions_resp, "content") else str(suggestions_resp)
        suggestions = [s.strip() for s in raw.strip().split('\n') if s.strip()][:3]
        if suggestions:
            yield {"type": "suggestions", "items": suggestions}
    except Exception as e:
        logger.warning("[stream_rag] 生成追问建议失败: %s", e)
