"""对话问答业务逻辑服务层。

职责：封装 FAQ 防线 + RAG Agent 双层问答的完整事件流生成逻辑。
本模块不包含任何 FastAPI / HTTP / SSE 相关导入。
"""

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator

from src.config import get_config
from src.core.agent.factory import build_orchestrator
from src.core.faq_match import faq_generate, try_faq_match
from src.core.interfaces.storage import BaseDocumentStore
from src.core.shared.llm_factory import get_llm
from src.exceptions import KnowledgeBaseNotFoundError
from src.services.base import BaseService
from src.storage.interfaces.kb_store import BaseKBStore
from src.storage.interfaces.settings_store import BaseSettingsStore
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)

_STUDENT_KB_KEY = "active_kb"
_ADMIN_KB_KEY = "admin_kb"


class ChatService(BaseService):
    """双层问答（FAQ 防线 + RAG Agent）事件流生成服务。"""

    def __init__(
        self,
        settings_store: BaseSettingsStore,
        kb_store: BaseKBStore,
        vector_store: VectorStore,
        doc_store: BaseDocumentStore,
    ) -> None:
        super().__init__()
        self._settings_store = settings_store
        self._kb_store = kb_store
        self._vector_store = vector_store
        self._doc_store = doc_store

    def resolve_kb_name(self, role: str) -> str:
        """根据用户角色解析当前使用的知识库名称。

        Args:
            role: 用户角色（student / admin / teacher）。

        Returns:
            知识库名称字符串。

        Raises:
            KnowledgeBaseNotFoundError: 知识库未配置或不存在。
        """
        if role == "student":
            kb_name = self._settings_store.get_setting(_STUDENT_KB_KEY)
            if not kb_name:
                raise KnowledgeBaseNotFoundError("管理员尚未分配知识库，请联系管理员或稍后再试")
        else:
            kb_name = self._settings_store.get_setting(_ADMIN_KB_KEY)
            if not kb_name:
                raise KnowledgeBaseNotFoundError("尚未配置管理端知识库，请在知识库页面选择后再使用")

        if not self._kb_store.get_kb(kb_name):
            raise KnowledgeBaseNotFoundError(f"知识库 '{kb_name}' 不存在")

        return kb_name

    async def stream_response(
        self,
        query: str,
        kb_name: str,
        history: list[dict],
        user_id: int,
    ) -> AsyncGenerator[dict, None]:
        """生成双层问答的 SSE 事件字典流。

        依次尝试 FAQ 防线和 RAG Agent，以 async generator 形式逐个
        yield 事件字典，每个字典包含 ``event`` 和 ``data`` 键。

        Args:
            query: 用户查询文本。
            kb_name: 目标知识库名称。
            history: 对话历史列表。
            user_id: 当前用户 ID。

        Yields:
            ``{"event": "<type>", "data": "<json_string>"}`` 形式的事件字典。
        """
        try:
            # ── 第一层：FAQ 防线 ──────────────────────────────────
            yield _evt("status", {"step": "faq_matching"})

            cfg = get_config()
            faq_threshold = cfg.get("faq", {}).get("score_threshold", 0.75)
            faq_results = await asyncio.to_thread(
                try_faq_match,
                query,
                kb_name,
                self._vector_store,
                self._doc_store,
                faq_threshold,
            )

            if faq_results:
                yield _evt("status", {"step": "faq_answering"})
                faq_answer = await asyncio.to_thread(faq_generate, query, faq_results)

                if faq_answer is not None:
                    logger.info(
                        "[chat] FAQ 快答命中 (score=%.4f, faq_id=%d)",
                        faq_results[0]["score"],
                        faq_results[0]["faq_id"],
                    )
                    yield _evt("token", {"text": faq_answer})
                    yield _evt("answer", {"text": faq_answer})
                    yield _evt(
                        "sources",
                        {
                            "sources": [
                                {
                                    "node_id": f"faq-{r['faq_id']}",
                                    "text": r["question"][:200],
                                    "source_file": "FAQ",
                                    "score": round(r["score"], 4),
                                }
                                for r in faq_results
                            ]
                        },
                    )

                    # 生成追问建议（可选，失败不影响主流程）
                    try:
                        llm = get_llm()
                        sug_resp = llm.invoke(
                            f"基于以下问答，生成2-3个用户可能想继续追问的简短问题"
                            f"（每行一个，不要编号，不要解释）：\n"
                            f"问：{query}\n答：{faq_answer}"
                        )
                        raw_sug = sug_resp.content if hasattr(sug_resp, "content") else str(sug_resp)
                        suggestions = [s.strip() for s in raw_sug.strip().split("\n") if s.strip()][:3]
                        if suggestions:
                            yield _evt("suggestions", {"items": suggestions})
                    except Exception as e:
                        logger.warning("[chat] FAQ 快答后生成追问建议失败: %s", e)

                    yield _evt("done", {})
                    return

                # faq_answer is None → FAQ 不足以回答，fall through to RAG
                logger.info("[chat] FAQ 命中但内容不足，转 RAG Agent")

            # ── 第二层：RAG Agent ─────────────────────────────────
            yield _evt("status", {"step": "building_retriever"})
            orchestrator = await asyncio.to_thread(build_orchestrator, kb_name, self._vector_store, self._doc_store)

            yield _evt("status", {"step": "running_rag"})

            queue: asyncio.Queue[dict | None] = asyncio.Queue()

            def _run_stream() -> None:
                try:
                    for item in orchestrator.stream(
                        query=query,
                        kb_name=kb_name,
                        history=history,
                    ):
                        queue.put_nowait(item)
                except Exception:
                    logger.exception("orchestrator.stream() error")
                    queue.put_nowait({"type": "error", "message": "RAG 处理异常"})
                finally:
                    queue.put_nowait(None)  # sentinel

            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, _run_stream)

            token_parts: list[str] = []
            sources_nodes: list[dict] = []
            file_items: list[dict] = []

            while True:
                item = await queue.get()
                if item is None:
                    break
                item_type = item.get("type")
                if item_type == "agent_action":
                    yield _evt(
                        "agent_action",
                        {"tool": item["tool"], "input": item.get("input", "")},
                    )
                elif item_type == "token":
                    token_parts.append(item["content"])
                    yield _evt("token", {"text": item["content"]})
                elif item_type == "file":
                    file_items.append(item)
                    yield _evt(
                        "file",
                        {
                            "file_name": item["file_name"],
                            "url": item["url"],
                            "size_kb": item["size_kb"],
                        },
                    )
                elif item_type == "sources":
                    sources_nodes = item.get("nodes", [])
                elif item_type == "suggestions":
                    yield _evt("suggestions", {"items": item.get("items", [])})
                elif item_type == "error":
                    yield _evt("error", {"message": item["message"]})
                    return

            # 发送完整答案（兼容现有前端）
            answer_text = "".join(token_parts)
            if file_items:
                answer_text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", answer_text)
            yield _evt("answer", {"text": answer_text})

            # 发送引用来源
            sources = [
                {
                    "node_id": n["node_id"],
                    "text": n["text"],
                    "source_file": n.get("source_file", ""),
                    "score": round(n.get("score", 0.0), 4),
                }
                for n in sources_nodes
            ]
            yield _evt("sources", {"sources": sources})

            yield _evt("done", {})

        except Exception:
            logger.exception("RAG chat error")
            yield _evt("error", {"message": "服务暂时不可用，请稍后重试"})


def _evt(event: str, data: dict) -> dict:
    """构造标准事件字典。

    Args:
        event: SSE 事件类型。
        data: 事件数据（将被 JSON 序列化）。

    Returns:
        包含 event 和 data 键的字典。
    """
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}
