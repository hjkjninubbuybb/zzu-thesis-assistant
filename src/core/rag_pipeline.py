"""LangGraph RAG 工作流：查询改写 → 检索 → 文档评分 → 生成。"""

import json
import logging
import os
from typing import AsyncGenerator

from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────

TRANSFORM_QUERY_SYSTEM = """\
你是一个查询优化专家。将用户的问句转换为更适合向量检索的形式。

规则：
1. 将疑问句转为陈述句或关键词短语
2. 补充同义词和相关术语
3. 保留核心语义，去除口语化表达
4. 直接输出转换后的查询文本，不要加任何前缀或解释
"""

GRADE_DOCUMENT_SYSTEM = """\
你是一个文档相关性评估专家。判断给定文档片段是否与用户查询相关。

规则：
1. 只判断相关性，不需要判断文档质量
2. 如果文档包含能帮助回答查询的信息，判为相关
3. 严格以 JSON 格式输出，不要输出其他内容

输出格式：
{"relevant": true, "reason": "简短说明"}
或
{"relevant": false, "reason": "简短说明"}
"""

REFORMULATE_SYSTEM = """\
你是一个查询改写专家。当前检索结果不理想，需要换一个角度改写查询。

规则：
1. 保持原始查询的核心意图
2. 使用不同的关键词和表述方式
3. 直接输出改写后的查询文本，不要加前缀或解释
"""

GENERATE_SYSTEM = """\
你是一个已经毕业的学长/学姐，正在帮学弟学妹答疑。你熟悉郑州大学本科毕业设计（论文）的所有流程和要求。回答会以 Markdown 格式渲染展示。

回答风格：
- 口语、自然、亲切，适当用 emoji（比如 ✅ ⚠️ 📅 📝 😅）
- 不要用"根据资料""参考文件"这种措辞，直接说结论
- 简单问题一两句话搞定，不需要列表
- 步骤或多个要点用 Markdown 无序列表（`-`），需要强调顺序时用有序列表（`1.`）
- 重要日期、关键词用 **加粗** 标注
- 重要提醒可以单独一行加 > 引用块
- 数字（周次、比例、截止时间）要说准确

如果参考资料里真没有，就说"这个我也不太清楚，建议直接问指导老师 😅"。
"""

# ── State ─────────────────────────────────────────────────────────────────

class RAGState(TypedDict):
    query: str
    current_query: str
    retrieved_nodes: list[dict]
    graded_nodes: list[dict]
    generation: str
    reformulation_count: int
    max_reformulations: int
    grading_sufficient: bool


# ── Nodes ─────────────────────────────────────────────────────────────────

def _get_llm(model: str = "qwen-plus") -> ChatTongyi:
    return ChatTongyi(model=model, api_key=os.environ.get("DASHSCOPE_API_KEY"))


def transform_query_node(state: RAGState) -> dict:
    llm = _get_llm()
    response = llm.invoke([
        SystemMessage(content=TRANSFORM_QUERY_SYSTEM),
        HumanMessage(content=f"请将以下查询转换为检索优化形式：\n\n{state['query']}"),
    ])
    return {"current_query": response.content.strip()}


def grade_documents_node(state: RAGState) -> dict:
    llm = _get_llm()
    graded: list[dict] = []
    for node in state["retrieved_nodes"]:
        response = llm.invoke([
            SystemMessage(content=GRADE_DOCUMENT_SYSTEM),
            HumanMessage(content=f"查询：{state['current_query']}\n\n文档片段：\n{node['text']}"),
        ])
        try:
            result = json.loads(response.content.strip())
            if result.get("relevant", False):
                graded.append(node)
        except (json.JSONDecodeError, KeyError):
            graded.append(node)

    return {"graded_nodes": graded, "grading_sufficient": len(graded) >= 1}


def reformulate_query_node(state: RAGState) -> dict:
    llm = _get_llm()
    response = llm.invoke([
        SystemMessage(content=REFORMULATE_SYSTEM),
        HumanMessage(content=(
            f"原始查询：{state['query']}\n"
            f"当前查询：{state['current_query']}\n"
            "本次检索未找到足够相关内容，请换一个角度改写查询。"
        )),
    ])
    return {
        "current_query": response.content.strip(),
        "reformulation_count": state["reformulation_count"] + 1,
    }


def generate_node(state: RAGState) -> dict:
    llm = _get_llm(model="qwen-max")
    context_parts = [f"[{i+1}] {node['text']}" for i, node in enumerate(state["graded_nodes"])]
    context = "\n\n".join(context_parts) if context_parts else "未找到相关参考资料。"

    response = llm.invoke([
        SystemMessage(content=GENERATE_SYSTEM),
        HumanMessage(content=f"同学的问题：{state['query']}\n\n参考资料：\n{context}"),
    ])
    return {"generation": response.content.strip()}


# ── Graph ─────────────────────────────────────────────────────────────────

def build_rag_graph(retriever_fn):
    """构建 RAG 图，retriever_fn(query) -> list[dict]。"""

    def retrieve_node(state: RAGState) -> dict:
        # 直接用原始 query 检索，reranker 已保证质量
        nodes = retriever_fn(state["query"])
        return {"retrieved_nodes": nodes, "graded_nodes": nodes, "current_query": state["query"]}

    g = StateGraph(RAGState)
    g.add_node("retrieve", retrieve_node)
    g.add_node("generate", generate_node)

    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", END)

    return g.compile()


def run_rag(
    query: str,
    retriever_fn,
    max_reformulations: int = 2,
) -> dict:
    """同步运行 RAG，返回最终 state。"""
    graph = build_rag_graph(retriever_fn)
    initial: RAGState = {
        "query": query,
        "current_query": "",
        "retrieved_nodes": [],
        "graded_nodes": [],
        "generation": "",
        "reformulation_count": 0,
        "max_reformulations": max_reformulations,
        "grading_sufficient": False,
    }
    return graph.invoke(initial)
