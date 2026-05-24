"""答案生成器：基于检索上下文生成最终回答。

实现 BaseGenerator 接口。
"""

import logging
from collections.abc import Generator
from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.core.agent.prompts import SYSTEM_PROMPT, format_preloaded_context
from src.core.interfaces import BaseGenerator
from src.core.llm_factory import get_llm
from src.storage.document_store import DocumentStore

logger = logging.getLogger(__name__)


class LLMGenerator(BaseGenerator):
    """基于 LLM 的答案生成器。"""

    def __init__(self, doc_store: DocumentStore | None = None):
        self._ds = doc_store or DocumentStore()

    def _build_messages(
        self,
        query: str,
        context_nodes: list[dict],
        kb_name: str,
        history: list | None,
        route_decision: str,
        is_relevant: bool,
    ) -> list:
        """构建发送给 LLM 的完整消息列表。"""
        now = datetime.now()
        weekday_map = ["日", "一", "二", "三", "四", "五", "六"]
        today_str = f"{now.strftime('%Y-%m-%d %H:%M:%S')} 星期{weekday_map[int(now.strftime('%w'))]}"

        docs = self._ds.list_documents(kb_name)
        doc_list = "\n".join([f"- {d['file_name']}: {d.get('summary') or '暂无摘要'}" for d in docs])

        system_prompt = SYSTEM_PROMPT.format(
            kb_name=kb_name or "默认",
            today=today_str,
            doc_list=doc_list or "（知识库为空）",
        )

        context_prefix = ""
        if route_decision == "hard_rag":
            if is_relevant:
                context_prefix = format_preloaded_context(context_nodes)
            else:
                context_prefix = "⚠️ 知识库中未找到直接相关的资料，请明确告知用户并给出合理的通用建议。\n"

        # 构建历史消息
        history_msgs = self._build_history_messages(history)

        return [
            SystemMessage(content=system_prompt),
            SystemMessage(content=context_prefix),
            *history_msgs,
            HumanMessage(content=query),
        ]

    @staticmethod
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

    def generate(
        self,
        query: str,
        context_nodes: list[dict],
        kb_name: str,
        history: list | None = None,
        route_decision: str = "direct",
        is_relevant: bool = True,
    ) -> str:
        use_fast = route_decision != "hard_rag"
        llm = get_llm(fast=use_fast, streaming=False)
        messages = self._build_messages(query, context_nodes, kb_name, history, route_decision, is_relevant)
        resp = llm.invoke(messages)
        return str(resp.content)

    def stream(
        self,
        query: str,
        context_nodes: list[dict],
        kb_name: str,
        history: list | None = None,
        route_decision: str = "direct",
        is_relevant: bool = True,
    ) -> Generator[str, None, None]:
        use_fast = route_decision != "hard_rag"
        llm = get_llm(fast=use_fast, streaming=True)
        messages = self._build_messages(query, context_nodes, kb_name, history, route_decision, is_relevant)
        for chunk in llm.stream(messages):
            if chunk.content:
                yield chunk.content
