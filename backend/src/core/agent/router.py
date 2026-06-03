"""意图路由器：判断查询走哪条处理路径。

实现 BaseRouter 接口。
"""

import json
import logging
import re

from langchain_core.messages import HumanMessage

from src.core.agent.prompts import ROUTER_PROMPT
from src.core.interfaces import BaseRouter, RouteResult
from src.core.shared.llm_factory import get_llm

logger = logging.getLogger(__name__)


class LLMRouter(BaseRouter):
    """基于 LLM 的意图路由器。"""

    def route(self, query: str, kb_name: str, doc_summaries: list[dict]) -> RouteResult:
        logger.info("[Agent] 进入 router")
        llm = get_llm(fast=True, streaming=False)

        doc_info = "\n".join([f"- {d['file_name']}: {d.get('summary') or '暂无摘要'}" for d in doc_summaries])
        prompt = ROUTER_PROMPT.format(doc_info=doc_info, query=query)

        resp = llm.invoke([HumanMessage(content=prompt)])
        content = str(resp.content).strip()

        # 默认值
        result = RouteResult(decision="direct", tasks=[query])

        try:
            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(0))
                decision = data.get("route_decision", "").lower()
                if decision in ("hard_rag", "direct", "download"):
                    result.decision = decision

                parsed_tasks = data.get("tasks", [])
                if isinstance(parsed_tasks, list) and len(parsed_tasks) > 0:
                    result.tasks = [str(t) for t in parsed_tasks]

                result.file_hint = str(data.get("file_hint", ""))
        except Exception as e:
            logger.warning("[Agent] router 解析 JSON 失败: %s", e)

        logger.info(
            "[Agent] 路由决策: %s, 下载意图: %s (%s)",
            result.decision,
            result.decision == "download",
            result.file_hint,
        )
        return result
