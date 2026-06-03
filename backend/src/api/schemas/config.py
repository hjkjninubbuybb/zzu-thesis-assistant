"""Request/response models for /api/config routes."""

from pydantic import BaseModel, Field

GROUPS = ("llm", "fast_llm", "embedding", "reranker")


class GroupCredentials(BaseModel):
    """单组 API 凭据（保存时使用）。"""

    api_base_url: str | None = None
    api_key: str = Field(
        default="",
        description="新 API Key；空字符串表示保留原值。",
        max_length=200,
    )
    model: str | None = None


class GroupInfo(BaseModel):
    """GET /config/api-info 返回的单组信息。"""

    has_key: bool
    masked_key: str
    api_base_url: str | None
    model: str | None


class ApiInfoResponse(BaseModel):
    llm: GroupInfo
    fast_llm: GroupInfo
    embedding: GroupInfo
    reranker: GroupInfo


class GroupTestResult(BaseModel):
    ok: bool
    message: str
    models: list[str] = Field(default_factory=list)


class TestConnectionResponse(BaseModel):
    llm: GroupTestResult
    fast_llm: GroupTestResult
    embedding: GroupTestResult
    reranker: GroupTestResult


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
    """统一保存载荷：4 组凭据 + 其他参数。"""

    llm: GroupCredentials | None = None
    fast_llm: GroupCredentials | None = None
    embedding: GroupCredentials | None = None
    reranker: GroupCredentials | None = None

    splitter: SplitterConfig | None = None
    vector_top_k: int | None = Field(default=None, ge=1, le=50)
    bm25_top_k: int | None = Field(default=None, ge=1, le=50)
    hybrid_top_k: int | None = Field(default=None, ge=1, le=50)
    rrf_k: int | None = Field(default=None, ge=1, le=200)
    query_enhance: bool | None = None
    protect_raw_top_n: int | None = Field(default=None, ge=0, le=5)
    reranker_top_n: int | None = Field(default=None, ge=1, le=20)
    max_reformulations: int | None = Field(default=None, ge=0, le=5)
    agent_recursion_limit: int | None = Field(default=None, ge=4, le=30)
    agent_retry_count: int | None = Field(default=None, ge=1, le=5)
