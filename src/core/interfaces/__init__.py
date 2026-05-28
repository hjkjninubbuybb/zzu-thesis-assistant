"""核心抽象接口包 —— 统一 re-export，保持向后兼容。

所有外部代码使用 from src.core.interfaces import XYZ 即可。
"""

from src.core.interfaces.faq import BaseDocumentLinker, BaseFAQMatcher
from src.core.interfaces.generator import (
    BaseDocumentGrader,
    BaseGenerator,
    BaseQueryRewriter,
    BaseRAGPipeline,
    BaseRouter,
    GenerationResult,
    GradeResult,
    RouteResult,
)
from src.core.interfaces.retriever import (
    BaseEmbedder,
    BaseQueryEnhancer,
    BaseReranker,
    BaseRetrievalChain,
    BaseRetriever,
    RetrievedNode,
)
from src.core.interfaces.safety import BaseSafetyGuard

__all__ = [
    "BaseDocumentGrader",
    "BaseDocumentLinker",
    "BaseEmbedder",
    "BaseFAQMatcher",
    "BaseGenerator",
    "BaseQueryEnhancer",
    "BaseQueryRewriter",
    "BaseRAGPipeline",
    "BaseReranker",
    "BaseRetrievalChain",
    "BaseRetriever",
    "BaseRouter",
    "BaseSafetyGuard",
    "GenerationResult",
    "GradeResult",
    "RetrievedNode",
    "RouteResult",
]
