"""对话问答接口（SSE 流式输出）。"""

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from src.api.schemas import ChatRequest
from src.config import get_config
from src.core.retrieval import HybridRetriever, fetch_corpus
from src.core.reranker import Reranker
from src.core.rag_pipeline import stream_rag
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

_ds = DocumentStore()
_vs = VectorStore()


@router.post("")
async def chat(body: ChatRequest):
    """RAG 对话（SSE 流式）。"""
    if not _ds.get_kb(body.kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{body.kb_name}' 不存在")

    cfg = get_config()
    ret_cfg = cfg["retrieval"]
    rer_cfg = cfg["reranker"]

    async def event_generator():
        try:
            # 1. 构建检索器（同步阻塞，用 to_thread 包装）
            yield {"event": "status", "data": json.dumps({"step": "building_retriever"}, ensure_ascii=False)}
            corpus = await asyncio.to_thread(fetch_corpus, body.kb_name, _vs)

            retriever = HybridRetriever(
                kb_name=body.kb_name,
                corpus_nodes=corpus,
                k_vector=ret_cfg["vector_top_k"],
                k_bm25=ret_cfg["bm25_top_k"],
                k_total=ret_cfg["hybrid_top_k"],
                rrf_k=ret_cfg["rrf_k"],
                vector_store=_vs,
            )
            reranker = Reranker(model=rer_cfg["model"], top_n=rer_cfg["top_n"])

            def retriever_fn(query: str) -> list[dict]:
                raw = retriever.retrieve(query)
                return reranker.rerank(query, raw)

            # 2. 流式运行 RAG pipeline
            # stream_rag 是同步生成器，在线程池中运行，通过 asyncio.Queue 桥接到事件循环
            yield {"event": "status", "data": json.dumps({"step": "running_rag"}, ensure_ascii=False)}

            queue: asyncio.Queue[dict | None] = asyncio.Queue()
            loop = asyncio.get_event_loop()

            def _run_stream() -> None:
                try:
                    for item in stream_rag(
                        query=body.query,
                        retriever_fn=retriever_fn,
                        kb_name=body.kb_name,
                    ):
                        loop.call_soon_threadsafe(queue.put_nowait, item)
                except Exception as e:
                    logger.error("[chat] stream_rag 线程异常: %s", e)
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        {"type": "error", "message": "服务暂时不可用，请稍后重试"},
                    )
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, None)  # 哨兵值，标志结束

            thread_task = loop.run_in_executor(None, _run_stream)

            token_parts: list[str] = []
            sources_nodes: list[dict] = []
            file_items: list[dict] = []

            while True:
                item = await queue.get()
                if item is None:
                    break
                item_type = item.get("type")
                if item_type == "agent_action":
                    yield {"event": "agent_action", "data": json.dumps(
                        {"tool": item["tool"], "input": item.get("input", "")},
                        ensure_ascii=False,
                    )}
                elif item_type == "token":
                    token_parts.append(item["content"])
                    yield {"event": "token", "data": json.dumps({"text": item["content"]}, ensure_ascii=False)}
                elif item_type == "file":
                    file_items.append(item)
                    yield {"event": "file", "data": json.dumps(
                        {"file_name": item["file_name"], "url": item["url"], "size_kb": item["size_kb"]},
                        ensure_ascii=False,
                    )}
                elif item_type == "sources":
                    sources_nodes = item.get("nodes", [])
                elif item_type == "error":
                    yield {"event": "error", "data": json.dumps({"message": item["message"]}, ensure_ascii=False)}
                    return

            await thread_task

            # 3. 发送完整答案（兼容现有前端）
            yield {
                "event": "answer",
                "data": json.dumps({"text": "".join(token_parts)}, ensure_ascii=False),
            }

            # 4. 发送引用来源
            sources = [
                {
                    "node_id": n["node_id"],
                    "text": n["text"][:200],
                    "source_file": n.get("source_file", ""),
                    "score": round(n.get("score", 0.0), 4),
                }
                for n in sources_nodes
            ]
            yield {
                "event": "sources",
                "data": json.dumps({"sources": sources}, ensure_ascii=False),
            }

            yield {"event": "done", "data": "{}"}

        except Exception as e:
            logger.exception("RAG chat error")
            yield {
                "event": "error",
                "data": json.dumps({"message": "服务暂时不可用，请稍后重试"}, ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())
