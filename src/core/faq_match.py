"""FAQ 防线：语义匹配 → 轻量 LLM 快答 → 不足则 fallback 到 RAG Agent。"""

import logging
import os

from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import HumanMessage, SystemMessage

from src.config import get_config
from src.core.embedding import get_embed_model
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)

# ── 查询改写 ──────────────────────────────────────────────────────────────

_REWRITE_SYSTEM = (
    "你是一个搜索查询优化助手，专门为郑州大学本科毕业设计问答系统优化用户的搜索词。"
    "将用户输入改写为语义更清晰、更适合向量检索的标准问题形式。"
    "规则：展开口语缩写、补全省略主语、替换非正式用语为规范术语。"
    "只输出改写后的查询词，不要任何解释或标点以外的内容。"
)


def rewrite_query(raw: str) -> str:
    """调用快速 LLM 改写查询词，失败时回退原始输入。"""
    try:
        cfg = get_config()["llm"]
        llm = ChatTongyi(
            model=cfg["fast_model"],
            api_key=os.environ.get("DASHSCOPE_API_KEY"),
        )
        resp = llm.invoke([SystemMessage(content=_REWRITE_SYSTEM), HumanMessage(content=raw)])
        rewritten = resp.content.strip()
        logger.info("[faq_match] 查询改写: %r → %r", raw, rewritten)
        return rewritten if rewritten else raw
    except Exception as e:
        logger.warning("[faq_match] 查询改写失败，使用原始输入: %s", e)
        return raw


# ── FAQ 语义匹配 ──────────────────────────────────────────────────────────

def try_faq_match(
    query: str,
    kb_name: str,
    vs: VectorStore,
    ds: DocumentStore,
    score_threshold: float = 0.75,
    top_k: int = 3,
) -> list[dict] | None:
    """FAQ 防线：改写 → embed → Qdrant 搜索 FAQ → 回查 MySQL 确认启用。

    Returns:
        命中: [{"question", "answer", "score", "faq_id"}, ...]（按 score 降序）
        未命中: None
    """
    rewritten = rewrite_query(query)

    try:
        embed_model = get_embed_model(text_type="query")
        vector = embed_model.get_text_embedding(rewritten)
    except Exception as e:
        logger.warning("[faq_match] embed 失败: %s", e)
        return None

    try:
        hits = vs.search(
            kb_name, vector,
            top_k=top_k,
            score_threshold=score_threshold,
            payload_filter={"source_type": "faq"},
        )
    except Exception as e:
        logger.warning("[faq_match] Qdrant 搜索失败: %s", e)
        return None

    if not hits:
        logger.info("[faq_match] 未命中 FAQ（阈值=%.2f）", score_threshold)
        return None

    results: list[dict] = []
    seen: set[int] = set()
    for hit in hits:
        faq_id = hit.get("faq_id")
        if not isinstance(faq_id, int) or faq_id in seen:
            continue
        row = ds.get_faq(faq_id)
        if row and row.get("enabled"):
            results.append({
                "question": row["question"],
                "answer": row["answer"],
                "score": hit["score"],
                "faq_id": row["id"],
            })
            seen.add(faq_id)

    if not results:
        return None

    logger.info("[faq_match] 命中 %d 条 FAQ，最高分=%.4f", len(results), results[0]["score"])
    return results


# ── FAQ 快答（含 fallback 判断）────────────────────────────────────────────

FALLBACK_MARKER = "[FALLBACK]"

_FAQ_ANSWER_SYSTEM = """\
你是郑州大学毕业设计问答助手。根据以下 FAQ 内容回答用户问题。

规则：
- 如果 FAQ 内容足以回答，直接给出自然、简洁的回答，语气平和自然，适当使用 emoji（✅ ⚠️ 📅 📝）
- 简单问题一两句话回答，复杂问题用 Markdown 列表分点说明
- 重要日期、关键数字用 **加粗**
- 如果 FAQ 内容不足以完整回答用户的问题，只输出 [FALLBACK]，不要输出任何其他内容

FAQ 参考：
{faq_context}"""


def faq_generate(query: str, faq_results: list[dict]) -> str | None:
    """用 fast_model 基于 FAQ 生成回答。

    Returns:
        正常回答文本，或 None 表示 FAQ 不足以回答（需 fallback 到 RAG Agent）。
    """
    faq_context = "\n\n".join(
        f"Q: {r['question']}\nA: {r['answer']}" for r in faq_results
    )
    system = _FAQ_ANSWER_SYSTEM.format(faq_context=faq_context)

    try:
        cfg = get_config()["llm"]
        llm = ChatTongyi(
            model=cfg["fast_model"],
            streaming=False,
            api_key=os.environ.get("DASHSCOPE_API_KEY"),
        )
        resp = llm.invoke([SystemMessage(content=system), HumanMessage(content=query)])
        text = resp.content.strip()
    except Exception as e:
        logger.warning("[faq_match] FAQ 快答 LLM 调用失败: %s", e)
        return None

    if FALLBACK_MARKER in text:
        logger.info("[faq_match] fast_model 判断 FAQ 不足以回答，转 RAG Agent")
        return None

    logger.info("[faq_match] FAQ 快答成功，回答长度=%d", len(text))
    return text
