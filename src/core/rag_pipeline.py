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
from collections.abc import Generator

from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import AIMessageChunk, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent  # langgraph 版，非 langchain 旧版

from src.config import get_config
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

工具调用规则（严格遵守，按顺序判断）：
1. 问题含"第几周""今天""几号""几天""截止""剩余""多久" → 必须先调用 get_academic_calendar
2. 任何问题都应先调用 search_knowledge_base 检索知识库；首次结果明显不足时才可换一个更精确的关键词再搜一次（最多一次）
3. 不清楚知识库里有哪些文档 → 先调用 list_kb_documents
4. 用户提到想获取某个文件、模板、表格，或需要下载某文档 → 必须调用 get_document_link 获取下载链接
5. 回答中提及具体文件（任务书/开题报告/论文格式/审批表等）且该文件可能存在于知识库中 → 主动调用 get_document_link，将链接附在回答末尾

工具说明：
- get_academic_calendar：返回今天日期、星期、本学期第几周
- search_knowledge_base(query)：混合检索知识库，可多次调用换关键词
- list_kb_documents(kb_name)：列出知识库中所有文档名
- get_document_link(file_hint)：根据文件名关键词返回 Markdown 格式下载链接，直接插入回答即可

回答风格：
- 语言专业、清晰，语气平和自然，适当使用 emoji（✅ ⚠️ 📅 📝）
- 直接给出结论，不要说"根据资料""参考文件"等引导语
- 简单问题一两句话回答，复杂问题用 Markdown 列表分点说明
- 重要日期、关键数字用 **加粗**，重要提醒用 > 引用块
- 数字（周次、比例、截止时间）必须准确
- 知识库中确实没有相关内容时，明确说明"暂无相关信息，建议咨询指导教师或教务部门 📋"
"""


# ── Agent builder ──────────────────────────────────────────────────────────

def _get_llm(model: str | None = None) -> ChatTongyi:
    if model is None:
        model = get_config()["llm"]["model"]
    return ChatTongyi(model=model, streaming=True, api_key=os.environ.get("DASHSCOPE_API_KEY"))


def build_rag_agent(
    retriever_fn,
    captured_nodes: list,
    kb_name: str = "",
    file_events: list | None = None,
):
    """构建 ReAct Agent。

    Args:
        retriever_fn   : (query: str) -> list[dict]，混合检索 + rerank
        captured_nodes : 可变列表，用于收集检索节点（来源展示）
        kb_name        : 知识库名称，用于绑定文件下载工具
        file_events    : 可变列表，get_document_link 找到文件时 append 文件信息
    """
    llm = _get_llm()
    _file_events = file_events if file_events is not None else []
    tools = [
        make_search_kb_tool(retriever_fn, captured_nodes),
        list_kb_documents,
        get_academic_calendar,
        make_get_document_link_tool(kb_name, _file_events),
    ]
    # system prompt 在 invoke 时通过 messages[0]=SystemMessage 注入
    return create_react_agent(llm, tools)


# ── Public API ─────────────────────────────────────────────────────────────

def run_rag(
    query: str,
    retriever_fn,
    kb_name: str = "",
) -> dict:
    """运行 Agentic RAG，返回 generation 和 graded_nodes。

    Returns:
        {
            "generation"  : str,        最终回答
            "graded_nodes": list[dict], 检索到的节点（用于来源展示）
        }
    """
    captured_nodes: list[dict] = []
    agent = build_rag_agent(retriever_fn, captured_nodes, kb_name=kb_name)

    cfg = get_config()
    recursion_limit: int = cfg.get("rag", {}).get("agent_recursion_limit", 6)
    system_msg = SystemMessage(content=SYSTEM_PROMPT.format(kb_name=kb_name or "默认"))
    try:
        result = agent.invoke(
            {"messages": [system_msg, HumanMessage(content=query)]},
            config={"recursion_limit": recursion_limit},
        )
        messages = result.get("messages", [])
        if not messages:
            raise ValueError("Agent 返回了空消息列表")
        last = messages[-1]
        generation = last.content if hasattr(last, "content") else str(last)
    except Exception as e:
        logger.error("[run_rag] Agent 调用失败: %s", e)
        generation = "抱歉，服务暂时不可用，请稍后重试 😅"

    logger.info("[run_rag] 完成，共检索节点 %d 个", len(captured_nodes))
    return {
        "generation": generation,
        "graded_nodes": captured_nodes,
    }


def stream_rag(
    query: str,
    retriever_fn,
    kb_name: str = "",
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
    agent = build_rag_agent(retriever_fn, captured_nodes, kb_name=kb_name, file_events=file_events)
    cfg = get_config()
    recursion_limit: int = cfg.get("rag", {}).get("agent_recursion_limit", 6)

    system_msg = SystemMessage(content=SYSTEM_PROMPT.format(kb_name=kb_name or "默认"))
    input_messages = {"messages": [system_msg, HumanMessage(content=query)]}

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
        logger.error("[stream_rag] Agent 流式调用失败: %s", e)
        yield {"type": "error", "message": "服务暂时不可用，请稍后重试 😅"}
        return

    logger.info("[stream_rag] 完成，共检索节点 %d 个，文件事件 %d 个", len(captured_nodes), len(file_events))
    for fe in file_events:
        yield {"type": "file", **fe}
    yield {"type": "sources", "nodes": captured_nodes}
