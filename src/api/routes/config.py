"""系统配置读写接口。"""

import logging
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import get_config, ROOT_DIR

router = APIRouter(prefix="/api/config", tags=["config"])
logger = logging.getLogger(__name__)

CONFIG_PATH = ROOT_DIR / "configs" / "config.yaml"


# ── Pydantic 模型 ─────────────────────────────────────────

class SplitterConfig(BaseModel):
    strategy: str = "recursive"
    chunk_size: int | None = None
    chunk_overlap_ratio: float | None = None
    buffer_size: int | None = None
    breakpoint_percentile_threshold: int | None = None


class ConfigUpdate(BaseModel):
    llm_model: str | None = None
    embedding_model: str | None = None
    splitter: SplitterConfig | None = None
    vector_top_k: int | None = None
    bm25_top_k: int | None = None
    hybrid_top_k: int | None = None
    rrf_k: int | None = None
    reranker_model: str | None = None
    reranker_top_n: int | None = None
    max_reformulations: int | None = None


# ── 接口 ─────────────────────────────────────────────────

@router.get("")
def read_config() -> dict:
    """返回当前配置（已解析环境变量）。"""
    return get_config()


@router.post("")
def update_config(body: ConfigUpdate) -> dict:
    """
    更新 config.yaml 并清除缓存。
    只修改请求中非 None 的字段。
    """
    # 读取原始 yaml（保留原有结构，但注释会丢失）
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        raw: dict = yaml.safe_load(f) or {}

    # 逐字段 merge
    if body.llm_model is not None:
        raw.setdefault("llm", {})["model"] = body.llm_model

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入配置失败: {e}")

    # 清除 lru_cache，下次调用 get_config() 会重新读取文件
    get_config.cache_clear()
    logger.info("config.yaml 已更新并清除缓存")

    return get_config()
