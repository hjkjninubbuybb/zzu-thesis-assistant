"""系统配置读写接口。"""

import logging

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.auth import require_admin
from src.config import ROOT_DIR, get_config, get_dashscope_api_key

router = APIRouter(prefix="/api/config", tags=["config"])
logger = logging.getLogger(__name__)

CONFIG_PATH = ROOT_DIR / "configs" / "config.yaml"

# 允许写入的模型名枚举（防止写入无效模型名导致运行时报错）
_ALLOWED_LLM_MODELS = {"qwen-turbo", "qwen-plus", "qwen-max", "qwen-long"}
_ALLOWED_EMBED_MODELS = {"text-embedding-v2", "text-embedding-v3"}
_ALLOWED_RERANKER_MODELS = {"gte-rerank", "gte-rerank-hybrid"}


# ── Pydantic 模型 ─────────────────────────────────────────

class SplitterConfig(BaseModel):
    strategy: str = Field(default="recursive", pattern=r"^(recursive|token|sentence)$")
    chunk_size: int | None = Field(default=None, ge=64, le=1024)
    chunk_overlap_ratio: float | None = Field(default=None, ge=0.0, le=0.5)
    buffer_size: int | None = None
    breakpoint_percentile_threshold: int | None = None


class ConfigUpdate(BaseModel):
    llm_model: str | None = None
    llm_fast_model: str | None = None
    embedding_model: str | None = None
    splitter: SplitterConfig | None = None
    vector_top_k: int | None = Field(default=None, ge=1, le=50)
    bm25_top_k: int | None = Field(default=None, ge=1, le=50)
    hybrid_top_k: int | None = Field(default=None, ge=1, le=50)
    rrf_k: int | None = Field(default=None, ge=1, le=200)
    reranker_model: str | None = None
    reranker_top_n: int | None = Field(default=None, ge=1, le=20)
    max_reformulations: int | None = Field(default=None, ge=0, le=5)


class ApiKeyUpdate(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=200)


# ── API 密钥接口 ─────────────────────────────────────────

@router.get("/api-key")
def get_api_key(current_user: dict = Depends(require_admin)) -> dict:
    """获取已配置的 API Key（脱敏显示）。"""
    key = get_dashscope_api_key()
    if not key:
        return {"has_key": False, "masked_key": ""}
    masked = key[:3] + "****" + key[-4:] if len(key) > 7 else "****"
    return {"has_key": True, "masked_key": masked}


@router.put("/api-key")
def update_api_key(body: ApiKeyUpdate, current_user: dict = Depends(require_admin)) -> dict:
    """更新 DashScope API Key（写入数据库 system_settings）。"""
    from src.storage.document_store import DocumentStore
    ds = DocumentStore()
    ds.set_setting("dashscope_api_key", body.api_key)
    logger.info("DashScope API Key 已更新")
    return {"message": "API Key 已更新", "has_key": True}


@router.post("/api-key/test")
def test_api_key(current_user: dict = Depends(require_admin)) -> dict:
    """测试当前 DashScope API Key 是否有效（发送一次轻量 Embedding 请求）。"""
    key = get_dashscope_api_key()
    if not key:
        return {"ok": False, "message": "未配置 API Key"}
    try:
        import dashscope
        dashscope.api_key = key
        resp = dashscope.TextEmbedding.call(
            model="text-embedding-v3",
            input="connection test",
        )
        if resp.status_code == 200:
            return {"ok": True, "message": "连接成功"}
        return {"ok": False, "message": f"API 返回错误: {resp.message}"}
    except Exception as e:
        logger.warning("[api-key/test] 连接测试失败: %s", e)
        return {"ok": False, "message": f"连接失败: {e}"}


# ── 配置接口 ─────────────────────────────────────────────

@router.get("")
def read_config(current_user: dict = Depends(require_admin)) -> dict:
    """返回当前配置（已解析环境变量，管理员专用）。"""
    return get_config()


@router.post("")
def update_config(body: ConfigUpdate, current_user: dict = Depends(require_admin)) -> dict:
    """
    更新 config.yaml 并清除缓存。
    只修改请求中非 None 的字段，写入前校验模型名是否合法。
    """
    # 模型名枚举校验
    if body.llm_model is not None and body.llm_model not in _ALLOWED_LLM_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 LLM 模型 '{body.llm_model}'，可选: {sorted(_ALLOWED_LLM_MODELS)}",
        )
    if body.llm_fast_model is not None and body.llm_fast_model not in _ALLOWED_LLM_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的快速模型 '{body.llm_fast_model}'，可选: {sorted(_ALLOWED_LLM_MODELS)}",
        )
    if body.embedding_model is not None and body.embedding_model not in _ALLOWED_EMBED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 Embedding 模型 '{body.embedding_model}'，可选: {sorted(_ALLOWED_EMBED_MODELS)}",
        )
    if body.reranker_model is not None and body.reranker_model not in _ALLOWED_RERANKER_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 Reranker 模型 '{body.reranker_model}'，可选: {sorted(_ALLOWED_RERANKER_MODELS)}",
        )

    # 读取原始 yaml
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        raw: dict = yaml.safe_load(f) or {}

    # 逐字段 merge
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

    if body.vector_top_k is not None:
        raw.setdefault("retrieval", {})["vector_top_k"] = body.vector_top_k
    if body.bm25_top_k is not None:
        raw.setdefault("retrieval", {})["bm25_top_k"] = body.bm25_top_k
    if body.hybrid_top_k is not None:
        raw.setdefault("retrieval", {})["hybrid_top_k"] = body.hybrid_top_k
    if body.rrf_k is not None:
        raw.setdefault("retrieval", {})["rrf_k"] = body.rrf_k

    if body.reranker_model is not None:
        raw.setdefault("reranker", {})["model"] = body.reranker_model
    if body.reranker_top_n is not None:
        raw.setdefault("reranker", {})["top_n"] = body.reranker_top_n

    if body.max_reformulations is not None:
        raw.setdefault("rag", {})["max_reformulations"] = body.max_reformulations

    # 写回 yaml
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            yaml.dump(raw, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
    except OSError as e:
        raise HTTPException(status_code=500, detail="写入配置失败，请检查文件权限") from e

    get_config.cache_clear()
    logger.info("config.yaml 已更新并清除缓存")
    return get_config()
