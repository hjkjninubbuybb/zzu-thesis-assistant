"""Agent 编排器：将 FAQ 防线 + RAG 检索链 + Agent 推理节点组装为完整管道。

实现 BaseRAGPipeline 接口。所有节点通过构造函数注入，编排器本身不创建任何依赖。
"""

import logging
from collections.abc import Generator

from src.config import get_config
from src.core.interfaces import (
    BaseDocumentGrader,
    BaseDocumentLinker,
    BaseGenerator,
    BaseQueryRewriter,
    BaseRAGPipeline,
    BaseRetrievalChain,
    BaseRouter,
    BaseSafetyGuard,
    GenerationResult,
)

logger = logging.getLogger(__name__)


def _append_unique_nodes(target: list[dict], nodes: list[dict]) -> None:
    """将 nodes 去重追加到 target。"""
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


class AgentOrchestrator(BaseRAGPipeline):
    """完整 Agent 编排器。

    流程：Router → [RetrievalChain + Grader + Rewriter 循环] → Generator → SafetyGuard

    所有节点均通过接口注入，可独立替换任意组件。
    """

    def __init__(
        self,
        retrieval_chain: BaseRetrievalChain,
        router: BaseRouter,
        grader: BaseDocumentGrader,
        rewriter: BaseQueryRewriter,
        generator: BaseGenerator,
        safety_guard: BaseSafetyGuard,
        document_linker: BaseDocumentLinker,
        doc_store=None,
    ):
        self._chain = retrieval_chain
        self._router = router
        self._grader = grader
        self._rewriter = rewriter
        self._generator = generator
        self._safety_guard = safety_guard
        self._linker = document_linker
        from src.storage.document_store import DocumentStore

        self._ds = doc_store or DocumentStore()

    def _get_max_retries(self) -> int:
        cfg = get_config()
        return cfg.get("rag", {}).get("agent_retry_count", 3)

    def _get_doc_summaries(self, kb_name: str) -> list[dict]:
        docs = self._ds.list_documents(kb_name)
        return [{"file_name": d["file_name"], "summary": d.get("summary") or ""} for d in docs]

    def run(
        self,
        query: str,
        kb_name: str,
        history: list | None = None,
    ) -> GenerationResult:
        max_retries = self._get_max_retries()
        doc_summaries = self._get_doc_summaries(kb_name)

        # 1. 路由
        route = self._router.route(query, kb_name, doc_summaries)

        # 2. 按路由分支执行
        final_nodes: list[dict] = []
        file_events: list[dict] = []

        if route.decision == "download":
            file_events = self._linker.link(route.file_hint, kb_name)

        elif route.decision == "hard_rag":
            for task in route.tasks:
                current_task = task
                task_nodes: list[dict] = []
                is_task_relevant = False

                for attempt in range(max_retries):
                    nodes = self._chain.retrieve(current_task)

                    grade_result = self._grader.grade(query, nodes)
                    is_task_relevant = grade_result.is_relevant

                    if is_task_relevant:
                        task_nodes = nodes
                        break
                    elif attempt < max_retries - 1:
                        current_task = self._rewriter.rewrite(current_task, query)

                _append_unique_nodes(final_nodes, task_nodes)

        # 3. 生成
        is_relevant = len(final_nodes) > 0
        generation = self._generator.generate(
            query,
            final_nodes,
            kb_name,
            history,
            route_decision=route.decision,
            is_relevant=is_relevant,
        )

        # 4. 安全护栏
        generation, safety_guards = self._safety_guard.check(query, generation)

        return GenerationResult(
            text=generation,
            nodes=final_nodes,
            file_events=file_events,
            safety_guards=safety_guards,
        )

    def stream(
        self,
        query: str,
        kb_name: str,
        history: list | None = None,
    ) -> Generator[dict, None, None]:
        max_retries = self._get_max_retries()
        doc_summaries = self._get_doc_summaries(kb_name)

        # 1. 路由
        yield {
            "type": "agent_action",
            "tool": "意图分析",
            "input": "正在分析问题深度与任务拆解...",
        }
        route = self._router.route(query, kb_name, doc_summaries)

        # 2. 按路由分支执行
        final_nodes: list[dict] = []
        file_events: list[dict] = []
        retry_count = 0

        if route.decision == "download":
            yield {
                "type": "agent_action",
                "tool": "文件查找",
                "input": f"正在为您准备《{route.file_hint}》相关文件...",
            }
            file_events = self._linker.link(route.file_hint, kb_name)

        elif route.decision == "hard_rag":
            for task_idx, task in enumerate(route.tasks):
                current_task = task
                task_nodes: list[dict] = []
                is_task_relevant = False

                if len(route.tasks) > 1:
                    yield {
                        "type": "agent_action",
                        "tool": "任务拆解",
                        "input": f"正在处理子任务 ({task_idx + 1}/{len(route.tasks)}): {current_task}",
                    }
                else:
                    yield {
                        "type": "agent_action",
                        "tool": "深度检索",
                        "input": f"正在搜索关于 '{current_task}' 的资料...",
                    }

                for attempt in range(max_retries):
                    nodes = self._chain.retrieve(current_task)

                    if len(route.tasks) == 1 and attempt == 0:
                        yield {
                            "type": "agent_action",
                            "tool": "深度评估",
                            "input": f"搜到 {len(nodes)} 个片段，正在进行逻辑对齐...",
                        }
                    grade_result = self._grader.grade(query, nodes)
                    is_task_relevant = grade_result.is_relevant

                    if is_task_relevant:
                        task_nodes = nodes
                        break
                    else:
                        retry_count += 1
                        if attempt < max_retries - 1:
                            yield {
                                "type": "agent_action",
                                "tool": "反思纠错",
                                "input": f"相关度不足，尝试第 {attempt + 1} 次改写查询...",
                            }
                            current_task = self._rewriter.rewrite(current_task, query)

                _append_unique_nodes(final_nodes, task_nodes)

            if not final_nodes:
                yield {
                    "type": "agent_action",
                    "tool": "资料不足",
                    "input": "未能检索到强相关支撑，准备为您提供合理建议。",
                }
        else:
            yield {
                "type": "agent_action",
                "tool": "直接回答",
                "input": "日常咨询，直接为您生成回答。",
            }

        # 3. 流式生成
        is_relevant = len(final_nodes) > 0
        try:
            for token in self._generator.stream(
                query,
                final_nodes,
                kb_name,
                history,
                route_decision=route.decision,
                is_relevant=is_relevant,
            ):
                yield {"type": "token", "content": token}
        except Exception as e:
            logger.exception("[stream] 生成失败: %s", e)
            yield {"type": "error", "message": "回答生成失败，请重试"}
            return

        # 4. 文件事件
        for fe in file_events:
            yield {"type": "file", **fe}

        # 5. 来源
        yield {"type": "sources", "nodes": final_nodes}

        # 6. 追问建议
        try:
            from src.core.llm_factory import get_llm

            llm = get_llm(fast=True, streaming=False)
            suggestions_resp = llm.invoke(
                f"基于以下问题，生成2-3个用户可能想继续追问的简短问题（每行一个，不要编号，不要解释）：\n问：{query}"
            )
            raw = suggestions_resp.content if hasattr(suggestions_resp, "content") else str(suggestions_resp)
            suggestions = [s.strip() for s in raw.strip().split("\n") if s.strip()][:3]
            if suggestions:
                yield {"type": "suggestions", "items": suggestions}
        except Exception as e:
            logger.warning("[stream] 生成追问建议失败: %s", e)
