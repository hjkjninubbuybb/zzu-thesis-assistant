"""查询重写器 (CRAG)：检索失败时改写查询词。

实现 BaseQueryRewriter 接口。
"""

import logging

from langchain_core.messages import HumanMessage

from src.core.agent.prompts import REWRITE_PROMPT
from src.core.interfaces import BaseQueryRewriter
from src.core.shared.llm_factory import get_llm

logger = logging.getLogger(__name__)


class LLMQueryRewriter(BaseQueryRewriter):
    """使用快速模型重写查询词。"""

    def rewrite(self, query: str, original_query: str = "") -> str:
        logger.info("[Agent] 进入 rewrite_query")
        llm = get_llm(fast=True, streaming=False)
        prompt = REWRITE_PROMPT.format(query=query)

        try:
            resp = llm.invoke([HumanMessage(content=prompt)])
            rewritten = str(resp.content).strip()
            logger.info("[Agent] 查询改写: '%s' -> '%s'", query, rewritten)
            return rewritten if rewritten else query
        except Exception as e:
            logger.warning("[Agent] 查询改写失败，使用原词: %s", e)
            return query
