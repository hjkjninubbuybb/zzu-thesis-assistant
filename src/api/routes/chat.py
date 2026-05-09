"""对话问答接口（SSE 流式输出）。"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from src.api.auth import get_current_user
from src.api.schemas import ChatRequest
from src.config import get_config
from src.core.faq_match import try_faq_match, faq_generate
from src.core.retrieval import HybridRetriever, fetch_corpus
from src.core.retrieval_strategy import enhance_query, protect_raw_candidates
from src.core.reranker import Reranker
from src.core.rag_pipeline import stream_rag, _get_llm
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

_ds = DocumentStore()
_vs = VectorStore()


@router.post("")
async def chat(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    """RAG 对话（SSE 流式）。"""
    role = current_user.get("role")
    if role == "student":
        # 学生：强制使用学生知识库
        kb_name = _ds.get_setting("active_kb")
        if not kb_name:
            raise HTTPException(
                status_code=403,
                detail="管理员尚未分配知识库，请联系管理员或稍后再试",
            )
    else:
        # 管理员/教师：使用管理端预设知识库
        kb_name = _ds.get_setting("admin_kb")
        if not kb_name:
            raise HTTPException(
                status_code=403,
                detail="尚未配置管理端知识库，请在知识库页面选择后再使用",
            )

    if not _ds.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    cfg = get_config()
    ret_cfg = cfg["retrieval"]
    rer_cfg = cfg["reranker"]

    async def event_generator():
        try:
            # ── 第一层：FAQ 防线 ──────────────────────────────────────
            yield {"event": "status", "data": json.dumps({"step": "faq_matching"}, ensure_ascii=False)}
            faq_threshold = cfg.get("faq", {}).get("score_threshold", 0.75)
            faq_results = await asyncio.to_thread(
                try_faq_match, body.query, kb_name, _vs, _ds, faq_threshold,
            )

            if faq_results:
                yield {"event": "status", "data": json.dumps({"step": "faq_answering"}, ensure_ascii=False)}
                faq_answer = await asyncio.to_thread(faq_generate, body.query, faq_results)

                if faq_answer is not None:
                    # FAQ 快答成功 —— 直接返回，不走 RAG Agent
                    logger.info(
                        "[chat] FAQ 快答命中 (score=%.4f, faq_id=%d)",
                        faq_results[0]["score"], faq_results[0]["faq_id"],
                    )
                    yield {"event": "token", "data": json.dumps({"text": faq_answer}, ensure_ascii=False)}
                    yield {
                        "event": "answer",
                        "data": json.dumps({"text": faq_answer}, ensure_ascii=False),
                    }
                    yield {
                        "event": "sources",
                        "data": json.dumps({"sources": [
                            {
                                "node_id": f"faq-{r['faq_id']}",
                                "text": r["question"][:200],
                                "source_file": "FAQ",
                                "score": round(r["score"], 4),
                            }
                            for r in faq_results
                        ]}, ensure_ascii=False),
                    }

                    # 生成追问建议
                    try:
                        llm = _get_llm()
                        sug_resp = llm.invoke(
                            f"基于以下问答，生成2-3个用户可能想继续追问的简短问题"
                            f"（每行一个，不要编号，不要解释）：\n"
                            f"问：{body.query}\n答：{faq_answer}"
                        )
                        raw_sug = sug_resp.content if hasattr(sug_resp, "content") else str(sug_resp)
                        suggestions = [s.strip() for s in raw_sug.strip().split("\n") if s.strip()][:3]
                        if suggestions:
                            yield {"event": "suggestions", "data": json.dumps(
                                {"items": suggestions}, ensure_ascii=False,
                            )}
                    except Exception as e:
                        logger.warning("[chat] FAQ 快答后生成追问建议失败: %s", e)

                    yield {"event": "done", "data": "{}"}
                    return

                # faq_answer is None → fast_model 判断 FAQ 不足，fall through
                logger.info("[chat] FAQ 命中但内容不足，转 RAG Agent")

            # ── 第二层：RAG Agent ─────────────────────────────────────
            # 1. 构建检索器（同步阻塞，用 to_thread 包装）
            yield {"event": "status", "data": json.dumps({"step": "building_retriever"}, ensure_ascii=False)}
            corpus = await asyncio.to_thread(fetch_corpus, kb_name, _vs)

            retriever = HybridRetriever(
                kb_name=kb_name,
                corpus_nodes=corpus,
                k_vector=ret_cfg["vector_top_k"],
                k_bm25=ret_cfg["bm25_top_k"],
                k_total=ret_cfg["hybrid_top_k"],
                rrf_k=ret_cfg["rrf_k"],
                vector_store=_vs,
            )
            reranker = Reranker(model=rer_cfg["model"], top_n=rer_cfg["top_n"])
            query_enhance_enabled = bool(ret_cfg.get("query_enhance", False))
            protect_raw_top_n = int(ret_cfg.get("protect_raw_top_n", 0) or 0)
            final_top_n = int(rer_cfg["top_n"])

            def retriever_fn(query: str) -> list[dict]:
                search_query = enhance_query(query) if query_enhance_enabled else query
                raw = retriever.retrieve(search_query)
                reranked = reranker.rerank(search_query, raw)
                if protect_raw_top_n > 0:
                    return protect_raw_candidates(raw, reranked, protect_raw_top_n, final_top_n)
                return reranked

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
                        kb_name=kb_name,
                        history=body.history,
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
                elif item_type == "suggestions":
                    yield {"event": "suggestions", "data": json.dumps(
                        {"items": item.get("items", [])}, ensure_ascii=False,
                    )}
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
                    "text": n["text"],
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
