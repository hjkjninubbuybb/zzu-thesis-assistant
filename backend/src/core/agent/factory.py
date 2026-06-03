"""Agent 编排器工厂 —— 一键组装完整 RAG Agent 管道。

从配置中读取所有参数，构建检索链和推理节点，返回 AgentOrchestrator 实例。
"""

import logging

from src.config import get_config
from src.core.agent.document_linker import DocumentLinker
from src.core.agent.generator import LLMGenerator
from src.core.agent.grader import LLMDocumentGrader
from src.core.agent.orchestrator import AgentOrchestrator
from src.core.agent.rewriter import LLMQueryRewriter
from src.core.agent.router import LLMRouter
from src.core.agent.safety_guards import RuleSafetyGuard
from src.core.agent.tools import calendar as calendar_tool
from src.core.agent.tools import knowledge as knowledge_tool
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore
from src.core.rag.chain import RetrievalChain
from src.core.rag.query_enhancer import RuleQueryEnhancer
from src.core.rag.reranker import Reranker
from src.core.rag.retriever import HybridRetriever, fetch_corpus

logger = logging.getLogger(__name__)


def build_orchestrator(
    kb_name: str,
    vector_store: BaseVectorStore,
    doc_store: BaseDocumentStore,
) -> AgentOrchestrator:
    """组装完整的 Agent 编排器。

    Args:
        kb_name: 当前知识库名称。
        vector_store: Qdrant 向量存储实例。
        doc_store: MySQL 文档存储实例。

    Returns:
        可直接调用 run() / stream() 的 AgentOrchestrator。
    """
    cfg = get_config()
    ret_cfg = cfg["retrieval"]
    rer_cfg = cfg["reranker"]

    # 工具模块级单例注入（必须在使用工具前完成）
    calendar_tool.set_doc_store(doc_store)
    knowledge_tool.set_doc_store(doc_store)

    # ── RAG 检索链 ──────────────────────────────────────────────
    corpus_nodes = fetch_corpus(kb_name, vector_store)

    retriever = HybridRetriever(
        kb_name=kb_name,
        corpus_nodes=corpus_nodes,
        k_vector=ret_cfg["vector_top_k"],
        k_bm25=ret_cfg["bm25_top_k"],
        k_total=ret_cfg["hybrid_top_k"],
        rrf_k=ret_cfg["rrf_k"],
        vector_store=vector_store,
    )
    reranker = Reranker(model=rer_cfg["model"], top_n=rer_cfg["top_n"])
    query_enhancer = RuleQueryEnhancer()

    protect_n = int(ret_cfg.get("protect_raw_top_n", 0) or 0)
    final_n = int(rer_cfg["top_n"])

    chain = RetrievalChain(
        retriever=retriever,
        reranker=reranker,
        query_enhancer=query_enhancer,
        protect_n=protect_n,
        final_n=final_n,
    )

    # ── Agent 推理节点 ──────────────────────────────────────────
    router = LLMRouter()
    grader = LLMDocumentGrader()
    rewriter = LLMQueryRewriter()
    generator = LLMGenerator(doc_store=doc_store)
    safety_guard = RuleSafetyGuard()
    linker = DocumentLinker(doc_store=doc_store)

    logger.info("[factory] 已组装 AgentOrchestrator: kb=%s", kb_name)

    return AgentOrchestrator(
        retrieval_chain=chain,
        router=router,
        grader=grader,
        rewriter=rewriter,
        generator=generator,
        safety_guard=safety_guard,
        document_linker=linker,
        doc_store=doc_store,
    )
