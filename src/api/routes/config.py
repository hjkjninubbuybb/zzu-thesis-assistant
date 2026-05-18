"""系统配置读写接口。"""

import logging

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import httpx
from src.api.auth import require_admin
from src.config import ROOT_DIR, get_config, get_api_key, get_api_base_url

router = APIRouter(prefix="/api/config", tags=["config"])
logger = logging.getLogger(__name__)

CONFIG_PATH = ROOT_DIR / "configs" / "config.yaml"

# 默认允许的模型名枚举（仅作为初始化参考，后续通过接口动态获取）
_ALLOWED_LLM_MODELS = {"qwen-turbo", "qwen-plus", "qwen-max", "qwen-long", "deepseek-chat", "deepseek-reasoner"}
_ALLOWED_EMBED_MODELS = {"text-embedding-v2", "text-embedding-v3"}
_ALLOWED_RERANKER_MODELS = {"gte-rerank", "gte-rerank-hybrid"}


# ── Pydantic 模型 ─────────────────────────────────────────

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
    form:   DocTypeSplitterConfig | None = None


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


# ── API 密钥与平台接口 ─────────────────────────────────────

@router.get("/api-key")
def get_api_key_info(current_user: dict = Depends(require_admin)) -> dict:
    """获取已配置的 API 信息（脱敏显示）。"""
    key = get_api_key()
    url = get_api_base_url()
    if not key:
        return {"has_key": False, "masked_key": "", "api_base_url": url}
    masked = key[:3] + "****" + key[-4:] if len(key) > 7 else "****"
    return {"has_key": True, "masked_key": masked, "api_base_url": url}


@router.put("/api-key")
def update_api_info(body: ApiKeyUpdate, current_user: dict = Depends(require_admin)) -> dict:
    """更新 API Key 和 Base URL。"""
    from src.storage.document_store import DocumentStore
    ds = DocumentStore()
    ds.set_setting("api_key", body.api_key)
    if body.api_base_url:
        ds.set_setting("api_base_url", body.api_base_url)
    logger.info("LLM API 信息已更新")
    return {"message": "API 信息已更新", "has_key": True}


@router.post("/api-key/test")
async def test_api_info(current_user: dict = Depends(require_admin)) -> dict:
    """测试当前 API 配置是否有效（拉取模型列表）。"""
    key = get_api_key()
    url = get_api_base_url()
    if not key or not url:
        return {"ok": False, "message": "未配置 API Key 或 Base URL"}
    
    try:
        models = await _fetch_remote_models(url, key)
        return {"ok": True, "message": f"连接成功，发现 {len(models)} 个模型", "models": models}
    except Exception as e:
        logger.warning("[api-key/test] 连接测试失败: %s", e)
        return {"ok": False, "message": f"连接失败: {e}"}


@router.get("/models")
async def list_available_models(current_user: dict = Depends(require_admin)) -> list[str]:
    """动态拉取平台支持的模型列表。"""
    key = get_api_key()
    url = get_api_base_url()
    if not key or not url:
        return sorted(list(_ALLOWED_LLM_MODELS))
    
    try:
        return await _fetch_remote_models(url, key)
    except Exception:
        return sorted(list(_ALLOWED_LLM_MODELS))


async def _fetch_remote_models(url: str, key: str) -> list[str]:
    """从 OpenAI 兼容端点拉取模型列表。"""
    endpoint = url.rstrip("/")
    if not endpoint.endswith("/models"):
        endpoint = f"{endpoint}/models"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            endpoint,
            headers={"Authorization": f"Bearer {key}"}
        )
        resp.raise_for_status()
        data = resp.json()
        # OpenAI 标准返回 { "data": [ { "id": "..." }, ... ] }
        return sorted([m["id"] for m in data.get("data", [])])


# ── 配置接口 ─────────────────────────────────────────────

@router.get("")
def read_config(current_user: dict = Depends(require_admin)) -> dict:
    """返回当前配置（已解析环境变量，管理员专用）。"""
    return get_config()


@router.post("")
def update_config(body: ConfigUpdate, current_user: dict = Depends(require_admin)) -> dict:
    """
    更新 config.yaml 并清除缓存。
    """
    # 基础校验（不再死锁模型名，允许通过动态获取）
    if body.embedding_model is not None and body.embedding_model not in _ALLOWED_EMBED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 Embedding 模型 '{body.embedding_model}'，可选: {sorted(_ALLOWED_EMBED_MODELS)}",
        )

    # 读取原始 yaml
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        raw: dict = yaml.safe_load(f) or {}

    # 逐字段 merge
    if body.llm_base_url is not None:
        raw.setdefault("llm", {})["api_base_url"] = body.llm_base_url
    if body.llm_model is not None:
        raw.setdefault("llm", {})["model"] = body.llm_model
    if body.llm_fast_model is not None:
        raw.setdefault("llm", {})["fast_model"] = body.llm_fast_model
    if body.embedding_model is not None:
        raw.setdefault("embedding", {})["model"] = body.embedding_model

    if body.splitter is not None:
        sp = raw.setdefault("splitter", {})
        sp["strategy"] = body.splitter.strategy
        if body.splitter.chunk_size is not None:
            sp["chunk_size"] = body.splitter.chunk_size
        if body.splitter.chunk_overlap_ratio is not None:
            sp["chunk_overlap_ratio"] = body.splitter.chunk_overlap_ratio
        if body.splitter.buffer_size is not None:
            sp["buffer_size"] = body.splitter.buffer_size
        if body.splitter.breakpoint_percentile_threshold is not None:
            sp["breakpoint_percentile_threshold"] = body.splitter.breakpoint_percentile_threshold
        for _doc_type in ("policy", "manual", "form"):
            dt_cfg: DocTypeSplitterConfig | None = getattr(body.splitter, _doc_type, None)
            if dt_cfg is None:
                continue
            node = sp.setdefault(_doc_type, {})
            if dt_cfg.splitter_type is not None:
                node["type"] = dt_cfg.splitter_type
            if dt_cfg.chunk_size is not None:
                node["chunk_size"] = dt_cfg.chunk_size
            if dt_cfg.chunk_overlap_ratio is not None:
                node["chunk_overlap_ratio"] = dt_cfg.chunk_overlap_ratio
            if dt_cfg.enable_cleaning is not None:
                node["enable_cleaning"] = dt_cfg.enable_cleaning

    if body.vector_top_k is not None:
        raw.setdefault("retrieval", {})["vector_top_k"] = body.vector_top_k
    if body.bm25_top_k is not None:
        raw.setdefault("retrieval", {})["bm25_top_k"] = body.bm25_top_k
    if body.hybrid_top_k is not None:
        raw.setdefault("retrieval", {})["hybrid_top_k"] = body.hybrid_top_k
    if body.rrf_k is not None:
        raw.setdefault("retrieval", {})["rrf_k"] = body.rrf_k
    if body.query_enhance is not None:
        raw.setdefault("retrieval", {})["query_enhance"] = body.query_enhance
    if body.protect_raw_top_n is not None:
        raw.setdefault("retrieval", {})["protect_raw_top_n"] = body.protect_raw_top_n

    if body.reranker_model is not None:
        raw.setdefault("reranker", {})["model"] = body.reranker_model
    if body.reranker_top_n is not None:
        raw.setdefault("reranker", {})["top_n"] = body.reranker_top_n

    if body.max_reformulations is not None:
        raw.setdefault("rag", {})["max_reformulations"] = body.max_reformulations
    if body.agent_recursion_limit is not None:
        raw.setdefault("rag", {})["agent_recursion_limit"] = body.agent_recursion_limit
    if body.agent_retry_count is not None:
        raw.setdefault("rag", {})["agent_retry_count"] = body.agent_retry_count

    # 写回 yaml
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            yaml.dump(raw, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
    except OSError as e:
        raise HTTPException(status_code=500, detail="写入配置失败，请检查文件权限") from e

    get_config.cache_clear()
    logger.info("config.yaml 已更新并清除缓存")
    return get_config()

