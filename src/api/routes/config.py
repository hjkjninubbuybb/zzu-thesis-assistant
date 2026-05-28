"""系统配置读写接口。"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.auth import require_admin
from src.api.deps import get_config_service
from src.services.config_service import ConfigService

router = APIRouter(prefix="/api/config", tags=["config"])
logger = logging.getLogger(__name__)


# ── Pydantic 模型 (move to api/schemas/ in Phase 3) ──────────


class DocTypeSplitterConfig(BaseModel):
    splitter_type: str | None = Field(
        default=None,
        pattern=r"^(recursive|token|sentence|semantic|manual_step)$",
    )
    chunk_size: int | None = Field(default=None, ge=64, le=1024)
    chunk_overlap_ratio: float | None = Field(default=None, ge=0.0, le=0.5)
    enable_cleaning: bool | None = None


class SplitterConfig(BaseModel):
    strategy: str = Field(default="recursive", pattern=r"^(recursive|token|sentence)$")
    chunk_size: int | None = Field(default=None, ge=64, le=1024)
    chunk_overlap_ratio: float | None = Field(default=None, ge=0.0, le=0.5)
    buffer_size: int | None = None
    breakpoint_percentile_threshold: int | None = None
    policy: DocTypeSplitterConfig | None = None
    manual: DocTypeSplitterConfig | None = None
    form: DocTypeSplitterConfig | None = None


class ConfigUpdate(BaseModel):
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_fast_model: str | None = None
    embedding_model: str | None = None
    splitter: SplitterConfig | None = None
    vector_top_k: int | None = Field(default=None, ge=1, le=50)
    bm25_top_k: int | None = Field(default=None, ge=1, le=50)
    hybrid_top_k: int | None = Field(default=None, ge=1, le=50)
    rrf_k: int | None = Field(default=None, ge=1, le=200)
    query_enhance: bool | None = None
    protect_raw_top_n: int | None = Field(default=None, ge=0, le=5)
    reranker_model: str | None = None
    reranker_top_n: int | None = Field(default=None, ge=1, le=20)
    max_reformulations: int | None = Field(default=None, ge=0, le=5)
    agent_recursion_limit: int | None = Field(default=None, ge=4, le=30)
    agent_retry_count: int | None = Field(default=None, ge=1, le=5)


class ApiKeyUpdate(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=200)
    api_base_url: str | None = None


# ── 路由 ─────────────────────────────────────────────────


@router.get("/api-key")
def get_api_key_info(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return svc.get_api_key_info()


@router.put("/api-key")
def update_api_info(
    body: ApiKeyUpdate,
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return svc.update_api_key(body.api_key, body.api_base_url)


@router.post("/api-key/test")
async def test_api_info(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return await svc.test_api_connection()


@router.get("/models")
async def list_available_models(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> list[str]:
    return await svc.list_available_models()


@router.get("")
def read_config(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return svc.read_config()


@router.post("")
def update_config(
    body: ConfigUpdate,
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    try:
        splitter_dict = None
        if body.splitter is not None:
            splitter_dict = body.splitter.model_dump(exclude_none=True)
        return svc.update_config(
            {
                "llm_base_url": body.llm_base_url,
                "llm_model": body.llm_model,
                "llm_fast_model": body.llm_fast_model,
                "embedding_model": body.embedding_model,
                "splitter": splitter_dict,
                "vector_top_k": body.vector_top_k,
                "bm25_top_k": body.bm25_top_k,
                "hybrid_top_k": body.hybrid_top_k,
                "rrf_k": body.rrf_k,
                "query_enhance": body.query_enhance,
                "protect_raw_top_n": body.protect_raw_top_n,
                "reranker_model": body.reranker_model,
                "reranker_top_n": body.reranker_top_n,
                "max_reformulations": body.max_reformulations,
                "agent_recursion_limit": body.agent_recursion_limit,
                "agent_retry_count": body.agent_retry_count,
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
