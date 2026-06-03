"""文档评估器 (CRAG)：判断检索片段是否足以回答问题。

实现 BaseDocumentGrader 接口。
"""

import logging

from langchain_core.messages import HumanMessage

from src.core.agent.prompts import GRADE_PROMPT
from src.core.interfaces import BaseDocumentGrader, GradeResult
from src.core.shared.llm_factory import get_llm

logger = logging.getLogger(__name__)


class LLMDocumentGrader(BaseDocumentGrader):
    """使用强能力模型进行严苛的文档相关性评估。"""

    def grade(self, query: str, nodes: list[dict]) -> GradeResult:
        logger.info("[Agent] 进入 grade_documents")
        if not nodes:
            return GradeResult(is_relevant=False, reason="无检索结果")

        llm = get_llm(fast=False, streaming=False)
        context = "\n\n".join([f"[资料{i + 1}] {n['text']}" for i, n in enumerate(nodes[:3])])
        prompt = GRADE_PROMPT.format(context=context, query=query)

        resp = llm.invoke([HumanMessage(content=prompt)])
        decision = str(resp.content).strip().lower()
        is_relevant = "yes" in decision
        logger.info("[Agent] 资料评估结果: %s", is_relevant)
        return GradeResult(is_relevant=is_relevant)
