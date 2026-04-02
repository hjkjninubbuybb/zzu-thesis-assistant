"""对话问答接口（SSE 流式输出）。"""

import json
import logging

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from src.api.schemas import ChatRequest
from src.config import get_config
from src.core.retrieval import HybridRetriever, fetch_corpus
from src.core.reranker import Reranker
from src.core.rag_pipeline import run_rag
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
            # 1. 构建检索器
            yield {"event": "status", "data": json.dumps({"step": "building_retriever"}, ensure_ascii=False)}
            corpus = fetch_corpus(body.kb_name, vector_store=_vs)

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

            # 2. 运行 RAG pipeline
            yield {"event": "status", "data": json.dumps({"step": "running_rag"}, ensure_ascii=False)}
            final_state = run_rag(
                query=body.query,
                retriever_fn=retriever_fn,
                max_reformulations=body.max_reformulations,
            )

            # 3. 发送答案
            yield {
                "event": "answer",
                "data": json.dumps({"text": final_state["generation"]}, ensure_ascii=False),
            }

            # 4. 发送引用来源
            sources = [
                {
                    "node_id": n["node_id"],
                    "text": n["text"][:200],
                    "source_file": n.get("source_file", ""),
                    "score": round(n.get("score", 0.0), 4),
                }
                for n in final_state["graded_nodes"]
            ]
            yield {
                "event": "sources",
                "data": json.dumps({"sources": sources}, ensure_ascii=False),
            }

            yield {"event": "done", "data": "{}"}

        except Exception as e:
            logger.exception("RAG chat error")
            yield {"event": "error", "data": json.dumps({"message": str(e)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator())
