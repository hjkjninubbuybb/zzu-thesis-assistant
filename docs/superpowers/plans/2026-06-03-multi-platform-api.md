# Multi-Platform API Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each of the four model types (LLM reasoning, LLM fast, embedding, reranker) to use its own API URL + Key, with a unified "test all connections" button that populates per-group model dropdowns.

**Architecture:** Replace the single global `(api_base_url, api_key)` pair with four independent pairs. Backend exposes them via `system_settings` rows + `config.yaml` defaults; service layer centralizes test/load logic; frontend collapses the existing two sections (API config + Model selection) into a single compact 4-row table with one shared "测试所有连接" button.

**Tech Stack:** FastAPI + Pydantic / Python httpx (backend); React + TanStack Query + Tailwind / shadcn (frontend); pytest (backend tests).

**Spec:** `docs/superpowers/specs/2026-06-03-multi-platform-api-design.md`

---

## File Map

### Backend — modified
- `backend/configs/config.yaml` — per-group `api_base_url` defaults
- `backend/src/config.py` — replace 2 getters with 4 `(url, key)` getters
- `backend/src/services/config_service.py` — 4-group info / update / test
- `backend/src/api/schemas/config.py` (**new**) — Pydantic models for 4-group requests/responses (currently inline in routes/config.py)
- `backend/src/api/routes/config.py` — wire new schemas, drop `/api-key` + `/models`, add `/api-info` + `/test-connection`
- `backend/src/core/shared/llm_factory.py` — use `get_llm_credentials()` / `get_fast_llm_credentials()`
- `backend/src/core/rag/embedding.py` — use `get_embedding_credentials()`
- `backend/src/core/rag/reranker.py` — use `get_reranker_credentials()`
- `backend/src/core/preprocessing/image_describer.py` — use `get_llm_credentials()` (VLM rides on LLM creds, per spec § 6)
- `backend/src/api/app.py` — healthcheck uses `get_llm_credentials()`
- `backend/tests/services/test_config_service.py` — update fixtures + tests for new contract

### Frontend — modified
- `frontend/src/shared/types/api.ts` — new `SystemConfig`, `ApiCredentialsInfo`, `TestConnectionResult`, `ConfigUpdate`
- `frontend/src/shared/lib/api.ts` — new `configApi.getApiInfo` / `configApi.testConnection`; drop old `getApiKey` / `updateApiKey` / `testApiKey` / `getModels`
- `frontend/src/features/settings/services/settingsService.ts` — match new `configApi`
- `frontend/src/features/settings/hooks/queryKeys.ts` — `apiInfo` instead of `apiKey`, drop `models`
- `frontend/src/features/settings/hooks/settingsForm.ts` — `FormState` carries 4 groups (URL + key + model)
- `frontend/src/features/settings/hooks/useSettings.ts` — send 8 new fields in save payload
- `frontend/src/features/settings/hooks/useApiKeyManager.ts` — manage 4 groups + test-all
- `frontend/src/features/settings/hooks/useModelOptions.ts` — accept 4 per-group model lists, return per-group filtered options
- `frontend/src/features/settings/components/ApiKeySection.tsx` — compact 4-row table with inline model dropdowns + top test button
- `frontend/src/features/settings/components/SettingsRoot.tsx` — drop `ModelSettings` import + render

### Deleted
- `frontend/src/features/settings/components/ModelSettings.tsx`

---

## Phase 1 — Backend Config Layer

### Task 1: Restructure `config.yaml`

**Files:**
- Modify: `backend/configs/config.yaml`

- [ ] **Step 1: Replace the `llm`, `embedding`, `reranker` blocks**

Current (lines 4–13):
```yaml
embedding:
  model: text-embedding-v3
  dimension: 1024
  embed_batch_size: 10
llm:
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: qwen-plus
  fast_model: qwen-turbo
```

Replace with:
```yaml
embedding:
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: text-embedding-v3
  dimension: 1024
  embed_batch_size: 10
llm:
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  fast_api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: qwen-plus
  fast_model: qwen-turbo
```

And modify the `reranker` block:
```yaml
reranker:
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: gte-rerank
  top_n: 5
```

- [ ] **Step 2: Commit**

```bash
git add backend/configs/config.yaml
git commit -m "feat(config): add per-group api_base_url defaults"
```

---

### Task 2: Refactor `src/config.py` — 4 credential getters

**Files:**
- Modify: `backend/src/config.py`

- [ ] **Step 1: Replace `get_api_key()` and `get_api_base_url()` with 4 credential getters**

Delete lines 52–80 (everything after `get_config()`) and append:

```python
def _credential_pair(
    group: str,
    yaml_section: str,
    yaml_url_field: str,
    env_url: str,
    env_key: str,
) -> tuple[str | None, str]:
    """Read (api_base_url, api_key) for a model group.

    Lookup order: system_settings DB → environment → config.yaml.
    """
    try:
        from src.storage.settings_store import SettingsStore

        store = SettingsStore()
        url = store.get_setting(f"{group}_api_base_url")
        key = store.get_setting(f"{group}_api_key")
    except (ImportError, OSError, RuntimeError) as e:
        logger.debug("[config] settings_store unavailable for %s: %s", group, e)
        url, key = None, None

    if not url:
        cfg = get_config()
        url = cfg.get(yaml_section, {}).get(yaml_url_field) or os.environ.get(env_url)
    if not key:
        key = os.environ.get(env_key, "")
    return url, key


def get_llm_credentials() -> tuple[str | None, str]:
    """Reasoning LLM (qwen-plus etc.)."""
    return _credential_pair("llm", "llm", "api_base_url", "LLM_API_BASE_URL", "LLM_API_KEY")


def get_fast_llm_credentials() -> tuple[str | None, str]:
    """Fast LLM (qwen-turbo etc.)."""
    return _credential_pair(
        "fast_llm", "llm", "fast_api_base_url", "FAST_LLM_API_BASE_URL", "FAST_LLM_API_KEY"
    )


def get_embedding_credentials() -> tuple[str | None, str]:
    """Embedding model."""
    return _credential_pair(
        "embedding", "embedding", "api_base_url", "EMBEDDING_API_BASE_URL", "EMBEDDING_API_KEY"
    )


def get_reranker_credentials() -> tuple[str | None, str]:
    """Reranker model."""
    return _credential_pair(
        "reranker", "reranker", "api_base_url", "RERANKER_API_BASE_URL", "RERANKER_API_KEY"
    )
```

- [ ] **Step 2: Verify the module still imports**

Run: `cd backend && .venv/bin/python -c "from src.config import get_llm_credentials, get_fast_llm_credentials, get_embedding_credentials, get_reranker_credentials; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/config.py
git commit -m "feat(config): replace single api creds with 4 per-group getters"
```

---

## Phase 2 — Backend Service Layer

### Task 3: Add Pydantic schemas for credentials

**Files:**
- Create: `backend/src/api/schemas/config.py`

- [ ] **Step 1: Create the schemas file**

```python
"""Request/response models for /api/config routes."""

from pydantic import BaseModel, Field

GROUPS = ("llm", "fast_llm", "embedding", "reranker")


class GroupCredentials(BaseModel):
    """Single group's API credentials in an update payload."""

    api_base_url: str | None = None
    api_key: str = Field(
        default="",
        description="New API key. Empty string means: keep existing value.",
        max_length=200,
    )
    model: str | None = None


class GroupInfo(BaseModel):
    """Single group's info returned by GET /config/api-info."""

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
    """Unified save payload — both per-group credentials and other settings."""

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
```

- [ ] **Step 2: Re-export from schemas package**

Modify `backend/src/api/schemas/__init__.py`, append at the bottom (do NOT remove existing exports):

```python
from src.api.schemas.config import (
    ApiInfoResponse,
    ConfigUpdate,
    GroupCredentials,
    GroupInfo,
    GroupTestResult,
    TestConnectionResponse,
)

__all__ = list(globals().get("__all__", [])) + [
    "ApiInfoResponse",
    "ConfigUpdate",
    "GroupCredentials",
    "GroupInfo",
    "GroupTestResult",
    "TestConnectionResponse",
]
```

- [ ] **Step 3: Verify import**

Run: `cd backend && .venv/bin/python -c "from src.api.schemas.config import ConfigUpdate, ApiInfoResponse; print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/schemas/config.py backend/src/api/schemas/__init__.py
git commit -m "feat(api): add Pydantic schemas for 4-group API config"
```

---

### Task 4: Rewrite `ConfigService` for 4 groups

**Files:**
- Modify: `backend/src/services/config_service.py`

- [ ] **Step 1: Replace the file contents**

Full new content of `backend/src/services/config_service.py`:

```python
"""系统配置读写 + 4 组 API 凭据管理 + 连通性验证。"""

import asyncio
import logging
from typing import Any

import httpx
import yaml

from src.config import (
    ROOT_DIR,
    get_config,
    get_embedding_credentials,
    get_fast_llm_credentials,
    get_llm_credentials,
    get_reranker_credentials,
)
from src.exceptions import StorageError
from src.services.base import BaseService
from src.storage.interfaces.settings_store import BaseSettingsStore

logger = logging.getLogger(__name__)

CONFIG_PATH = ROOT_DIR / "configs" / "config.yaml"

GROUPS = ("llm", "fast_llm", "embedding", "reranker")

_GROUP_CRED_LOADERS = {
    "llm": get_llm_credentials,
    "fast_llm": get_fast_llm_credentials,
    "embedding": get_embedding_credentials,
    "reranker": get_reranker_credentials,
}

# yaml_section -> (model field name inside that section)
_GROUP_YAML_LOCATION = {
    "llm": ("llm", "model"),
    "fast_llm": ("llm", "fast_model"),
    "embedding": ("embedding", "model"),
    "reranker": ("reranker", "model"),
}

# yaml_section -> url field name
_GROUP_YAML_URL_FIELD = {
    "llm": ("llm", "api_base_url"),
    "fast_llm": ("llm", "fast_api_base_url"),
    "embedding": ("embedding", "api_base_url"),
    "reranker": ("reranker", "api_base_url"),
}


def _mask(key: str) -> str:
    if not key:
        return ""
    if len(key) > 7:
        return key[:3] + "****" + key[-4:]
    return "****"


class ConfigService(BaseService):
    """系统配置：读写 config.yaml、管理 4 组 API 凭据、验证连通性。"""

    def __init__(self, settings_store: BaseSettingsStore) -> None:
        super().__init__()
        self._settings_store = settings_store

    # ── credentials info ─────────────────────────────────────

    def get_api_info(self) -> dict:
        """Return masked credentials info for all 4 groups."""
        cfg = get_config()
        out: dict[str, Any] = {}
        for group in GROUPS:
            url, key = _GROUP_CRED_LOADERS[group]()
            yaml_section, model_field = _GROUP_YAML_LOCATION[group]
            model = cfg.get(yaml_section, {}).get(model_field)
            out[group] = {
                "has_key": bool(key),
                "masked_key": _mask(key),
                "api_base_url": url,
                "model": model,
            }
        return out

    # ── test connection ──────────────────────────────────────

    async def test_all_connections(self) -> dict:
        """Test all 4 groups in parallel; return per-group {ok, message, models}."""
        results = await asyncio.gather(
            *(self._test_group(g) for g in GROUPS),
            return_exceptions=False,
        )
        return dict(zip(GROUPS, results, strict=True))

    async def _test_group(self, group: str) -> dict:
        url, key = _GROUP_CRED_LOADERS[group]()
        if not url or not key:
            return {"ok": False, "message": "未配置 URL 或 Key", "models": []}
        try:
            models = await self._fetch_remote_models(url, key)
            return {"ok": True, "message": f"连接成功，发现 {len(models)} 个模型", "models": models}
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError) as e:
            logger.warning("[ConfigService.test_group:%s] failed: %s", group, e)
            return {"ok": False, "message": f"连接失败: {e}", "models": []}

    # ── config read/write ────────────────────────────────────

    def read_config(self) -> dict:
        return get_config()

    def update_config(self, updates: dict[str, Any]) -> dict:
        """Persist 4-group credentials + non-credential settings.

        Args:
            updates: dict with optional keys:
              - llm / fast_llm / embedding / reranker: {api_base_url?, api_key?, model?}
                  (api_key == "" means: do not change the stored key)
              - splitter, vector_top_k, ..., agent_retry_count (existing fields)

        Returns:
            Updated config dict (after cache clear).
        """
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                raw: dict = yaml.safe_load(f) or {}
        except (OSError, yaml.YAMLError) as e:
            raise StorageError(f"读取配置文件失败: {e}") from e

        # ── per-group credentials ────────────────────────────
        for group in GROUPS:
            grp = updates.get(group)
            if not grp:
                continue
            yaml_section, url_field = _GROUP_YAML_URL_FIELD[group]
            _, model_field = _GROUP_YAML_LOCATION[group]

            if grp.get("api_base_url") is not None:
                raw.setdefault(yaml_section, {})[url_field] = grp["api_base_url"]
                self._settings_store.set_setting(f"{group}_api_base_url", grp["api_base_url"])

            if grp.get("api_key"):  # empty string means "keep existing"
                self._settings_store.set_setting(f"{group}_api_key", grp["api_key"])

            if grp.get("model") is not None:
                raw.setdefault(yaml_section, {})[model_field] = grp["model"]

        # ── splitter ─────────────────────────────────────────
        if updates.get("splitter") is not None:
            sp = updates["splitter"]
            sp_raw = raw.setdefault("splitter", {})
            if sp.get("strategy") is not None:
                sp_raw["strategy"] = sp["strategy"]
            for field in ("chunk_size", "chunk_overlap_ratio", "buffer_size", "breakpoint_percentile_threshold"):
                if sp.get(field) is not None:
                    sp_raw[field] = sp[field]
            for doc_type in ("policy", "manual", "form"):
                dt_cfg = sp.get(doc_type)
                if dt_cfg is None:
                    continue
                node = sp_raw.setdefault(doc_type, {})
                if dt_cfg.get("splitter_type") is not None:
                    node["type"] = dt_cfg["splitter_type"]
                for field in ("chunk_size", "chunk_overlap_ratio", "enable_cleaning"):
                    if dt_cfg.get(field) is not None:
                        node[field] = dt_cfg[field]

        # ── retrieval ────────────────────────────────────────
        for key_map in (
            "vector_top_k",
            "bm25_top_k",
            "hybrid_top_k",
            "rrf_k",
            "query_enhance",
            "protect_raw_top_n",
        ):
            if updates.get(key_map) is not None:
                raw.setdefault("retrieval", {})[key_map] = updates[key_map]

        # ── reranker top_n ───────────────────────────────────
        if updates.get("reranker_top_n") is not None:
            raw.setdefault("reranker", {})["top_n"] = updates["reranker_top_n"]

        # ── rag ──────────────────────────────────────────────
        for key_map in ("max_reformulations", "agent_recursion_limit", "agent_retry_count"):
            if updates.get(key_map) is not None:
                raw.setdefault("rag", {})[key_map] = updates[key_map]

        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                yaml.dump(raw, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
        except OSError as e:
            raise StorageError("写入配置失败，请检查文件权限") from e

        get_config.cache_clear()
        logger.info("config.yaml 已更新并清除缓存")
        return get_config()

    # ── helpers ──────────────────────────────────────────────

    @staticmethod
    async def _fetch_remote_models(url: str, key: str) -> list[str]:
        endpoint = url.rstrip("/")
        if not endpoint.endswith("/models"):
            endpoint = f"{endpoint}/models"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(endpoint, headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
            return sorted([m["id"] for m in data.get("data", [])])
```

- [ ] **Step 2: Verify import**

Run: `cd backend && .venv/bin/python -c "from src.services.config_service import ConfigService; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/config_service.py
git commit -m "feat(service): rewrite ConfigService for 4-group credentials"
```

---

### Task 5: Update `ConfigService` tests

**Files:**
- Modify: `backend/tests/services/test_config_service.py`

- [ ] **Step 1: Replace the file with tests against the new contract**

```python
"""Unit tests for ConfigService — 4-group credentials."""

from unittest.mock import MagicMock, patch

import pytest

from src.services.config_service import ConfigService, GROUPS


@pytest.fixture
def svc(mock_settings_store):
    return ConfigService(settings_store=mock_settings_store)


# ── get_api_info ──────────────────────────────────────────────


def test_get_api_info_returns_all_four_groups(svc):
    fake_cfg = {
        "llm": {"model": "qwen-plus", "fast_model": "qwen-turbo"},
        "embedding": {"model": "text-embedding-v3"},
        "reranker": {"model": "gte-rerank"},
    }
    with (
        patch("src.services.config_service.get_config", return_value=fake_cfg),
        patch(
            "src.services.config_service.get_llm_credentials",
            return_value=("https://llm.example.com", "sk-llm-1234567890"),
        ),
        patch(
            "src.services.config_service.get_fast_llm_credentials",
            return_value=("https://fast.example.com", "sk-fast-1234567890"),
        ),
        patch(
            "src.services.config_service.get_embedding_credentials",
            return_value=("https://emb.example.com", "sk-emb-1234567890"),
        ),
        patch(
            "src.services.config_service.get_reranker_credentials",
            return_value=("https://rerank.example.com", "sk-rerank-1234567890"),
        ),
    ):
        info = svc.get_api_info()

    assert set(info.keys()) == set(GROUPS)
    assert info["llm"]["model"] == "qwen-plus"
    assert info["fast_llm"]["model"] == "qwen-turbo"
    assert info["embedding"]["model"] == "text-embedding-v3"
    assert info["reranker"]["model"] == "gte-rerank"
    assert info["llm"]["has_key"] is True
    assert info["llm"]["masked_key"].startswith("sk-")
    assert info["llm"]["masked_key"].endswith("7890")
    assert "****" in info["llm"]["masked_key"]


def test_get_api_info_no_key_returns_empty_masked(svc):
    with (
        patch("src.services.config_service.get_config", return_value={}),
        patch("src.services.config_service.get_llm_credentials", return_value=(None, "")),
        patch("src.services.config_service.get_fast_llm_credentials", return_value=(None, "")),
        patch("src.services.config_service.get_embedding_credentials", return_value=(None, "")),
        patch("src.services.config_service.get_reranker_credentials", return_value=(None, "")),
    ):
        info = svc.get_api_info()

    assert info["llm"]["has_key"] is False
    assert info["llm"]["masked_key"] == ""
    assert info["llm"]["api_base_url"] is None


# ── update_config: per-group credentials ─────────────────────


def test_update_config_persists_per_group_keys(svc, mock_settings_store):
    fake_cfg = {"llm": {}, "embedding": {}, "reranker": {}}

    with (
        patch("builtins.open", create=True) as mock_open,
        patch("yaml.safe_load", return_value=fake_cfg),
        patch("yaml.dump"),
        patch("src.services.config_service.get_config") as mock_get_config,
    ):
        mock_get_config.cache_clear = MagicMock()
        mock_get_config.return_value = {}
        mock_open.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_open.return_value.__exit__ = MagicMock(return_value=False)

        svc.update_config(
            {
                "llm": {
                    "api_base_url": "https://new-llm.com/v1",
                    "api_key": "sk-new-llm",
                    "model": "qwen-plus",
                },
                "embedding": {
                    "api_base_url": "https://new-emb.com/v1",
                    "api_key": "sk-new-emb",
                    "model": "bge-m3",
                },
            }
        )

    calls = {c.args[0]: c.args[1] for c in mock_settings_store.set_setting.call_args_list}
    assert calls["llm_api_base_url"] == "https://new-llm.com/v1"
    assert calls["llm_api_key"] == "sk-new-llm"
    assert calls["embedding_api_base_url"] == "https://new-emb.com/v1"
    assert calls["embedding_api_key"] == "sk-new-emb"
    assert "fast_llm_api_key" not in calls  # not provided
    assert "reranker_api_key" not in calls


def test_update_config_empty_key_keeps_existing(svc, mock_settings_store):
    fake_cfg = {"llm": {}}

    with (
        patch("builtins.open", create=True) as mock_open,
        patch("yaml.safe_load", return_value=fake_cfg),
        patch("yaml.dump"),
        patch("src.services.config_service.get_config") as mock_get_config,
    ):
        mock_get_config.cache_clear = MagicMock()
        mock_get_config.return_value = {}
        mock_open.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_open.return_value.__exit__ = MagicMock(return_value=False)

        svc.update_config(
            {"llm": {"api_base_url": "https://x.com/v1", "api_key": "", "model": "qwen-plus"}}
        )

    keys = [c.args[0] for c in mock_settings_store.set_setting.call_args_list]
    assert "llm_api_key" not in keys
    assert "llm_api_base_url" in keys


# ── test_all_connections ────────────────────────────────────


@pytest.mark.asyncio
async def test_test_all_connections_returns_all_groups(svc):
    async def fake_fetch(url, key):
        return ["model-a", "model-b"]

    with (
        patch(
            "src.services.config_service.get_llm_credentials",
            return_value=("https://x.com", "sk-x"),
        ),
        patch(
            "src.services.config_service.get_fast_llm_credentials",
            return_value=("https://x.com", "sk-x"),
        ),
        patch(
            "src.services.config_service.get_embedding_credentials",
            return_value=("https://x.com", "sk-x"),
        ),
        patch(
            "src.services.config_service.get_reranker_credentials",
            return_value=("https://x.com", "sk-x"),
        ),
        patch.object(ConfigService, "_fetch_remote_models", side_effect=fake_fetch),
    ):
        results = await svc.test_all_connections()

    assert set(results.keys()) == set(GROUPS)
    for group in GROUPS:
        assert results[group]["ok"] is True
        assert results[group]["models"] == ["model-a", "model-b"]


@pytest.mark.asyncio
async def test_test_all_connections_handles_missing_creds(svc):
    with (
        patch("src.services.config_service.get_llm_credentials", return_value=(None, "")),
        patch(
            "src.services.config_service.get_fast_llm_credentials",
            return_value=("https://x.com", "sk-x"),
        ),
        patch("src.services.config_service.get_embedding_credentials", return_value=(None, "")),
        patch("src.services.config_service.get_reranker_credentials", return_value=(None, "")),
        patch.object(ConfigService, "_fetch_remote_models", return_value=["m1"]),
    ):
        results = await svc.test_all_connections()

    assert results["llm"]["ok"] is False
    assert "未配置" in results["llm"]["message"]
    assert results["fast_llm"]["ok"] is True
```

- [ ] **Step 2: Run the new tests**

Run: `cd backend && .venv/bin/pytest tests/services/test_config_service.py -v`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/services/test_config_service.py
git commit -m "test(service): cover 4-group ConfigService contract"
```

---

## Phase 3 — Backend Routes

### Task 6: Update `routes/config.py`

**Files:**
- Modify: `backend/src/api/routes/config.py`

- [ ] **Step 1: Replace the file contents**

```python
"""系统配置接口（4 组 API 凭据 + 其他参数）。"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import require_admin
from src.api.deps import get_config_service
from src.api.schemas.config import (
    ApiInfoResponse,
    ConfigUpdate,
    TestConnectionResponse,
)
from src.services.config_service import ConfigService

router = APIRouter(prefix="/api/config", tags=["config"])
logger = logging.getLogger(__name__)


@router.get("/api-info", response_model=ApiInfoResponse)
def get_api_info(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return svc.get_api_info()


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return await svc.test_all_connections()


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
        return svc.update_config(body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
```

- [ ] **Step 2: Verify routes import + the app can be loaded**

Run: `cd backend && .venv/bin/python -c "from src.api.app import app; print(app.title)"`
Expected: `RAG 1.0 API`

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/config.py
git commit -m "feat(api): wire 4-group endpoints (/api-info, /test-connection)"
```

---

## Phase 4 — Backend Consumers

### Task 7: Update LLM factory + RAG modules

**Files:**
- Modify: `backend/src/core/shared/llm_factory.py`
- Modify: `backend/src/core/rag/embedding.py`
- Modify: `backend/src/core/rag/reranker.py`
- Modify: `backend/src/core/preprocessing/image_describer.py`
- Modify: `backend/src/api/app.py`

- [ ] **Step 1: Rewrite `llm_factory.py`**

Replace the file contents:

```python
"""LLM 工厂 —— 统一创建 OpenAI 兼容模型实例。"""

from langchain_openai import ChatOpenAI

from src.config import get_config, get_fast_llm_credentials, get_llm_credentials


def get_llm(fast: bool = False, streaming: bool = True) -> ChatOpenAI:
    """获取通用的 OpenAI 兼容模型实例。

    Args:
        fast: True 使用快速模型，使用 fast_llm 组的凭据。
        streaming: 是否启用流式输出。
    """
    cfg = get_config()
    if fast:
        url, key = get_fast_llm_credentials()
        model_name = cfg.get("llm", {}).get("fast_model", "qwen-turbo")
    else:
        url, key = get_llm_credentials()
        model_name = cfg.get("llm", {}).get("model", "qwen-plus")

    return ChatOpenAI(
        model=model_name,
        openai_api_key=key,
        openai_api_base=url,
        streaming=streaming,
    )
```

- [ ] **Step 2: Patch `core/rag/embedding.py`**

Replace `from src.config import get_api_key, get_config` (line 8) with:
```python
from src.config import get_config, get_embedding_credentials
```

Find every occurrence of `api_key=get_api_key()` (lines 27 and 46) and replace each one with the local pattern. In both call sites, immediately before the `OpenAIEmbeddings(...)` or `langchain_openai...Embeddings(...)` construction, add:
```python
url, key = get_embedding_credentials()
```
Then change those keyword args to:
```python
api_key=key,
base_url=url,
```
(If the existing constructor uses `openai_api_key` / `openai_api_base`, keep those names; just swap the values to `key` / `url`.)

- [ ] **Step 3: Patch `core/rag/reranker.py`**

Replace `from src.config import get_api_key` (line 9) with:
```python
from src.config import get_reranker_credentials
```

Replace line 23 (`self._api_key = get_api_key()`) with:
```python
self._api_base_url, self._api_key = get_reranker_credentials()
```

Then find every usage of the reranker endpoint URL inside the class and switch any hardcoded base URL to `self._api_base_url`. (Open the file to verify the current request building; if the file currently hardcodes a Dashscope URL, replace it with the read URL.)

- [ ] **Step 4: Patch `core/preprocessing/image_describer.py`**

Replace `from src.config import get_api_key` (line 20) with:
```python
from src.config import get_llm_credentials
```

Replace the construction site (line 106 area) — wherever `api_key=get_api_key()` appears, change to:
```python
_url, _key = get_llm_credentials()
... api_key=_key, base_url=_url, ...
```

- [ ] **Step 5: Patch `api/app.py` healthcheck**

In the healthcheck path (around line 200), replace:
```python
from src.config import get_api_key
...
dashscope_ok = bool(get_api_key().strip())
```
with:
```python
from src.config import get_llm_credentials
...
_, _key = get_llm_credentials()
dashscope_ok = bool(_key.strip())
```

- [ ] **Step 6: Run sanity import**

Run: `cd backend && .venv/bin/python -c "from src.api.app import app; print(app.title)"`
Expected: `RAG 1.0 API` (no ImportError).

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && .venv/bin/pytest -x -q`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/core/shared/llm_factory.py \
        backend/src/core/rag/embedding.py \
        backend/src/core/rag/reranker.py \
        backend/src/core/preprocessing/image_describer.py \
        backend/src/api/app.py
git commit -m "refactor(core): switch consumers to per-group credentials"
```

---

## Phase 5 — Frontend Types & API

### Task 8: Update shared types

**Files:**
- Modify: `frontend/src/shared/types/api.ts`

- [ ] **Step 1: Replace the `SystemConfig`, `ConfigUpdate`, `ApiKeyInfo` block**

Find the section `// ── 系统配置 ──` (line ~352) and replace from `export interface SystemConfig {` through (and including) `export interface ApiKeyInfo {...}` with:

```ts
export type ApiGroup = 'llm' | 'fast_llm' | 'embedding' | 'reranker';

export interface GroupConfig {
  api_base_url?: string;
  model?: string;
}

export interface SystemConfig {
  llm: GroupConfig & { fast_api_base_url?: string; fast_model?: string };
  embedding: GroupConfig & { dimension: number; embed_batch_size: number };
  splitter: {
    strategy?: string;
    chunk_size: number;
    chunk_overlap_ratio: number;
    buffer_size?: number;
    breakpoint_percentile_threshold?: number;
    policy?: DocTypeSplitterParams;
    manual?: DocTypeSplitterParams;
    form?: DocTypeSplitterParams;
  };
  retrieval: {
    vector_top_k: number;
    bm25_top_k: number;
    hybrid_top_k: number;
    rrf_k: number;
  };
  reranker: GroupConfig & { top_n: number };
  rag: {
    max_reformulations: number;
    agent_recursion_limit: number;
    agent_retry_count: number;
  };
}

export interface DocTypeSplitterUpdate {
  splitter_type?: string;
  chunk_size?: number;
  chunk_overlap_ratio?: number;
  enable_cleaning?: boolean;
}

export interface SplitterConfigUpdate {
  strategy: SplitterType;
  chunk_size?: number;
  chunk_overlap_ratio?: number;
  buffer_size?: number;
  breakpoint_percentile_threshold?: number;
  policy?: DocTypeSplitterUpdate;
  manual?: DocTypeSplitterUpdate;
  form?: DocTypeSplitterUpdate;
}

export interface GroupCredentialsUpdate {
  api_base_url?: string;
  /** Empty string means: keep existing key. */
  api_key?: string;
  model?: string;
}

export interface ConfigUpdate {
  llm?: GroupCredentialsUpdate;
  fast_llm?: GroupCredentialsUpdate;
  embedding?: GroupCredentialsUpdate;
  reranker?: GroupCredentialsUpdate;
  splitter?: SplitterConfigUpdate;
  vector_top_k?: number;
  bm25_top_k?: number;
  hybrid_top_k?: number;
  rrf_k?: number;
  reranker_top_n?: number;
  max_reformulations?: number;
  agent_recursion_limit?: number;
  agent_retry_count?: number;
}

export interface GroupInfo {
  has_key: boolean;
  masked_key: string;
  api_base_url: string | null;
  model: string | null;
}

export type ApiInfo = Record<ApiGroup, GroupInfo>;

export interface GroupTestResult {
  ok: boolean;
  message: string;
  models: string[];
}

export type TestConnectionResult = Record<ApiGroup, GroupTestResult>;
```

(Remove the old `export interface ApiKeyInfo { ... }` block.)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/types/api.ts
git commit -m "feat(types): add 4-group API types, drop ApiKeyInfo"
```

---

### Task 9: Update `configApi` in `shared/lib/api.ts`

**Files:**
- Modify: `frontend/src/shared/lib/api.ts`

- [ ] **Step 1: Replace `configApi` definition**

Find `export const configApi = { ... }` (around line 365). Replace the entire `configApi` block with:

```ts
export const configApi = {
  get: () => client.get<SystemConfig>('/config').then((r) => r.data),
  update: (body: ConfigUpdate) =>
    client.post<SystemConfig>('/config', body).then((r) => r.data),
  getApiInfo: () => client.get<ApiInfo>('/config/api-info').then((r) => r.data),
  testConnection: () =>
    client.post<TestConnectionResult>('/config/test-connection').then((r) => r.data),
};
```

At the top of the file, ensure these types are imported (add to the existing `@shared/types/api` import):
```ts
import type {
  SystemConfig,
  ConfigUpdate,
  ApiInfo,
  TestConnectionResult,
} from '@shared/types/api';
```

(Remove any unused `ApiKeyInfo` import.)

- [ ] **Step 2: Verify the project type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: TypeScript errors only in the files we will update next (settings hooks/components). The error count should be finite and confined to settings module.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/lib/api.ts
git commit -m "feat(api): switch configApi to /api-info + /test-connection"
```

---

### Task 10: Update `settingsService.ts` + `queryKeys.ts`

**Files:**
- Modify: `frontend/src/features/settings/services/settingsService.ts`
- Modify: `frontend/src/features/settings/hooks/queryKeys.ts`

- [ ] **Step 1: Replace `settingsService.ts`**

```ts
import { configApi } from '@shared/lib/api';
import type { ConfigUpdate } from '@shared/types/api';

export const settingsService = {
  get: () => configApi.get(),
  update: (payload: ConfigUpdate) => configApi.update(payload),
  getApiInfo: () => configApi.getApiInfo(),
  testConnection: () => configApi.testConnection(),
};
```

- [ ] **Step 2: Replace `queryKeys.ts`**

Read the file first to see its current shape, then replace:

```ts
export const settingsKeys = {
  all: ['settings'] as const,
  config: () => [...settingsKeys.all, 'config'] as const,
  apiInfo: () => [...settingsKeys.all, 'api-info'] as const,
};
```

(Drop `apiKey()` and `models()` if they exist.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/services/settingsService.ts \
        frontend/src/features/settings/hooks/queryKeys.ts
git commit -m "feat(settings): switch service to /api-info + /test-connection"
```

---

## Phase 6 — Frontend Hooks

### Task 11: Rewrite `settingsForm.ts`

**Files:**
- Modify: `frontend/src/features/settings/hooks/settingsForm.ts`

- [ ] **Step 1: Replace file contents**

```ts
import type { SplitterType, SystemConfig } from '@shared/types/api';

export type DocTypeSplitterForm = {
  splitter_type: SplitterType;
  chunk_size: number;
  chunk_overlap_ratio: number;
  enable_cleaning: boolean;
};

export type ApiGroupForm = {
  api_base_url: string;
  /** Empty string = keep existing key (input shows masked existing). */
  api_key: string;
  model: string;
};

export type FormState = {
  llm: ApiGroupForm;
  fast_llm: ApiGroupForm;
  embedding: ApiGroupForm;
  reranker: ApiGroupForm;
  vector_top_k: number;
  bm25_top_k: number;
  hybrid_top_k: number;
  rrf_k: number;
  reranker_top_n: number;
  max_reformulations: number;
  agent_recursion_limit: number;
  agent_retry_count: number;
  splitter_policy: DocTypeSplitterForm;
  splitter_manual: DocTypeSplitterForm;
  splitter_form: DocTypeSplitterForm;
};

const emptyGroup: ApiGroupForm = { api_base_url: '', api_key: '', model: '' };

export const DEFAULT_FORM: FormState = {
  llm: { ...emptyGroup, model: 'qwen-plus' },
  fast_llm: { ...emptyGroup, model: 'qwen-turbo' },
  embedding: { ...emptyGroup, model: 'text-embedding-v3' },
  reranker: { ...emptyGroup, model: 'gte-rerank' },
  vector_top_k: 10,
  bm25_top_k: 10,
  hybrid_top_k: 15,
  rrf_k: 60,
  reranker_top_n: 5,
  max_reformulations: 2,
  agent_recursion_limit: 15,
  agent_retry_count: 3,
  splitter_policy: {
    splitter_type: 'recursive',
    chunk_size: 512,
    chunk_overlap_ratio: 0.1,
    enable_cleaning: true,
  },
  splitter_manual: {
    splitter_type: 'recursive',
    chunk_size: 256,
    chunk_overlap_ratio: 0.1,
    enable_cleaning: true,
  },
  splitter_form: {
    splitter_type: 'recursive',
    chunk_size: 256,
    chunk_overlap_ratio: 0.0,
    enable_cleaning: false,
  },
};

export function configToForm(cfg: SystemConfig): FormState {
  const gs = cfg.splitter.chunk_size ?? 256;
  const go = cfg.splitter.chunk_overlap_ratio ?? 0.2;
  return {
    llm: {
      api_base_url: cfg.llm.api_base_url ?? '',
      api_key: '',
      model: cfg.llm.model ?? DEFAULT_FORM.llm.model,
    },
    fast_llm: {
      api_base_url: cfg.llm.fast_api_base_url ?? '',
      api_key: '',
      model: cfg.llm.fast_model ?? DEFAULT_FORM.fast_llm.model,
    },
    embedding: {
      api_base_url: cfg.embedding.api_base_url ?? '',
      api_key: '',
      model: cfg.embedding.model ?? DEFAULT_FORM.embedding.model,
    },
    reranker: {
      api_base_url: cfg.reranker.api_base_url ?? '',
      api_key: '',
      model: cfg.reranker.model ?? DEFAULT_FORM.reranker.model,
    },
    vector_top_k: cfg.retrieval.vector_top_k ?? DEFAULT_FORM.vector_top_k,
    bm25_top_k: cfg.retrieval.bm25_top_k ?? DEFAULT_FORM.bm25_top_k,
    hybrid_top_k: cfg.retrieval.hybrid_top_k ?? DEFAULT_FORM.hybrid_top_k,
    rrf_k: cfg.retrieval.rrf_k ?? DEFAULT_FORM.rrf_k,
    reranker_top_n: cfg.reranker.top_n ?? DEFAULT_FORM.reranker_top_n,
    max_reformulations: cfg.rag.max_reformulations ?? DEFAULT_FORM.max_reformulations,
    agent_recursion_limit: cfg.rag.agent_recursion_limit ?? DEFAULT_FORM.agent_recursion_limit,
    agent_retry_count: cfg.rag.agent_retry_count ?? DEFAULT_FORM.agent_retry_count,
    splitter_policy: {
      splitter_type: (cfg.splitter.policy?.type ?? 'recursive') as SplitterType,
      chunk_size: cfg.splitter.policy?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter.policy?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg.splitter.policy?.enable_cleaning ?? true,
    },
    splitter_manual: {
      splitter_type: (cfg.splitter.manual?.type ?? 'manual_step') as SplitterType,
      chunk_size: cfg.splitter.manual?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter.manual?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg.splitter.manual?.enable_cleaning ?? true,
    },
    splitter_form: {
      splitter_type: (cfg.splitter.form?.type ?? 'recursive') as SplitterType,
      chunk_size: cfg.splitter.form?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter.form?.chunk_overlap_ratio ?? 0.0,
      enable_cleaning: cfg.splitter.form?.enable_cleaning ?? false,
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/hooks/settingsForm.ts
git commit -m "feat(settings): expand FormState to 4 API groups"
```

---

### Task 12: Rewrite `useApiKeyManager.ts`

**Files:**
- Modify: `frontend/src/features/settings/hooks/useApiKeyManager.ts`

- [ ] **Step 1: Replace file contents**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../services/settingsService';
import { settingsKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import type { ApiGroup, TestConnectionResult } from '@shared/types/api';

const ALL_GROUPS: ApiGroup[] = ['llm', 'fast_llm', 'embedding', 'reranker'];

export function useApiKeyManager() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: apiInfo, isLoading: apiInfoLoading } = useQuery({
    queryKey: settingsKeys.apiInfo(),
    queryFn: settingsService.getApiInfo,
  });

  const testMutation = useMutation<TestConnectionResult>({
    mutationFn: settingsService.testConnection,
    onSuccess: (data) => {
      const failed = ALL_GROUPS.filter((g) => !data[g].ok);
      if (failed.length === 0) {
        showToast('全部 4 组连接成功', 'success');
      } else {
        showToast(`${failed.length} 组连接失败：${failed.join(', ')}`, 'error');
      }
    },
    onError: () => showToast('测试连接失败', 'error'),
  });

  return {
    apiInfo,
    apiInfoLoading,
    testMutation,
    /** Per-group model lists (only populated after testMutation succeeds). */
    perGroupModels: testMutation.data,
    /** Convenience: invalidate api-info after successful save (called by useSettings). */
    invalidateApiInfo: () => qc.invalidateQueries({ queryKey: settingsKeys.apiInfo() }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/hooks/useApiKeyManager.ts
git commit -m "feat(settings): rewrite useApiKeyManager for 4 groups + test-all"
```

---

### Task 13: Rewrite `useModelOptions.ts`

**Files:**
- Modify: `frontend/src/features/settings/hooks/useModelOptions.ts`

- [ ] **Step 1: Replace file contents**

```ts
import { useMemo } from 'react';
import type { ApiGroup, TestConnectionResult } from '@shared/types/api';

const LLM_CORE = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'deepseek-chat', 'deepseek-reasoner'];
const LLM_EXCLUDE = ['image', 'speech', 'audio', 'vl', 'math', 'mt', 'embedding', 'rerank'];
const EMBEDDING_CORE = ['text-embedding-v3', 'text-embedding-v2'];
const RERANKER_CORE = ['gte-rerank', 'gte-rerank-hybrid'];

export type ModelOption = { value: string; label: string; desc?: string };

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

function filterLlm(remote: string[] | undefined): ModelOption[] {
  const all = unique([...(remote ?? []), ...LLM_CORE]);
  return all
    .filter((m) => {
      if (LLM_CORE.includes(m)) return true;
      const lower = m.toLowerCase();
      return !LLM_EXCLUDE.some((p) => lower.includes(p));
    })
    .sort((a, b) => {
      const idxA = LLM_CORE.indexOf(a);
      const idxB = LLM_CORE.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    })
    .map((m) => ({ value: m, label: m }));
}

function filterEmbedding(remote: string[] | undefined): ModelOption[] {
  const all = unique([...(remote ?? []), ...EMBEDDING_CORE]);
  return all
    .filter((m) => m.toLowerCase().includes('embedding'))
    .map((m) => ({ value: m, label: m, desc: m === 'text-embedding-v3' ? '推荐：1024维高精度' : undefined }));
}

function filterReranker(remote: string[] | undefined): ModelOption[] {
  const all = unique([...(remote ?? []), ...RERANKER_CORE]);
  return all
    .filter((m) => m.toLowerCase().includes('rerank'))
    .map((m) => ({ value: m, label: m, desc: m === 'gte-rerank' ? '推荐：通用重排序' : undefined }));
}

export function useModelOptions(testResults: TestConnectionResult | undefined) {
  return useMemo<Record<ApiGroup, ModelOption[]>>(
    () => ({
      llm: filterLlm(testResults?.llm.models),
      fast_llm: filterLlm(testResults?.fast_llm.models),
      embedding: filterEmbedding(testResults?.embedding.models),
      reranker: filterReranker(testResults?.reranker.models),
    }),
    [testResults],
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/hooks/useModelOptions.ts
git commit -m "feat(settings): rewrite useModelOptions for per-group lists"
```

---

### Task 14: Rewire `useSettings.ts`

**Files:**
- Modify: `frontend/src/features/settings/hooks/useSettings.ts`

- [ ] **Step 1: Replace the save payload + the updater**

Replace the file contents with:

```ts
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../services/settingsService';
import { settingsKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';
import { DEFAULT_FORM, configToForm } from './settingsForm';
import type { FormState, ApiGroupForm } from './settingsForm';

export type { DocTypeSplitterForm, FormState, ApiGroupForm } from './settingsForm';
export { DEFAULT_FORM } from './settingsForm';

const GROUPS = ['llm', 'fast_llm', 'embedding', 'reranker'] as const;

export function useSettings() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const { data: cfg, isLoading } = useQuery({
    queryKey: settingsKeys.config(),
    queryFn: settingsService.get,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cfg) setForm(configToForm(cfg));
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        ...Object.fromEntries(GROUPS.map((g) => [g, form[g]])),
        vector_top_k: form.vector_top_k,
        bm25_top_k: form.bm25_top_k,
        hybrid_top_k: form.hybrid_top_k,
        rrf_k: form.rrf_k,
        reranker_top_n: form.reranker_top_n,
        max_reformulations: form.max_reformulations,
        agent_recursion_limit: form.agent_recursion_limit,
        agent_retry_count: form.agent_retry_count,
        splitter: {
          strategy: 'recursive',
          policy: {
            splitter_type: form.splitter_policy.splitter_type,
            chunk_size: form.splitter_policy.chunk_size,
            chunk_overlap_ratio: form.splitter_policy.chunk_overlap_ratio,
            enable_cleaning: form.splitter_policy.enable_cleaning,
          },
          manual: {
            splitter_type: form.splitter_manual.splitter_type,
            chunk_size: form.splitter_manual.chunk_size,
            chunk_overlap_ratio: form.splitter_manual.chunk_overlap_ratio,
            enable_cleaning: form.splitter_manual.enable_cleaning,
          },
          form: {
            splitter_type: form.splitter_form.splitter_type,
            chunk_size: form.splitter_form.chunk_size,
            chunk_overlap_ratio: form.splitter_form.chunk_overlap_ratio,
            enable_cleaning: form.splitter_form.enable_cleaning,
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.config() });
      qc.invalidateQueries({ queryKey: settingsKeys.apiInfo() });
      // Clear stored keys in form so subsequent saves don't resend them
      setForm((prev) => ({
        ...prev,
        llm: { ...prev.llm, api_key: '' },
        fast_llm: { ...prev.fast_llm, api_key: '' },
        embedding: { ...prev.embedding, api_key: '' },
        reranker: { ...prev.reranker, api_key: '' },
      }));
      showToast('配置已保存', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const updateConfig = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateGroup = (group: (typeof GROUPS)[number], patch: Partial<ApiGroupForm>) =>
    setForm((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }));

  return {
    config: form,
    isLoading,
    updateConfig,
    updateGroup,
    isSaving: saveMutation.isPending,
    save: () => saveMutation.mutate(),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/hooks/useSettings.ts
git commit -m "feat(settings): send 4-group credentials on save"
```

---

## Phase 7 — Frontend Components

### Task 15: Rewrite `ApiKeySection.tsx` (compact table)

**Files:**
- Modify: `frontend/src/features/settings/components/ApiKeySection.tsx`

This component now owns the API config AND the model selection (model dropdown moves inline).

- [ ] **Step 1: Replace file contents**

```tsx
import { CheckCircle, Key, Loader2, XCircle, Zap } from 'lucide-react';
import { Section } from './SettingsPrimitives';
import type { ApiGroup, GroupInfo } from '@shared/types/api';
import type { ApiGroupForm, FormState } from '../hooks/settingsForm';
import type { useApiKeyManager } from '../hooks/useApiKeyManager';
import type { ModelOption } from '../hooks/useModelOptions';

const GROUPS: { key: ApiGroup; label: string; hint: string }[] = [
  { key: 'llm', label: '推理型', hint: '逻辑路由、文档评估' },
  { key: 'fast_llm', label: '快速', hint: '最终回答生成' },
  { key: 'embedding', label: '向量', hint: '修改后需重新入库' },
  { key: 'reranker', label: '重排序', hint: '检索结果精排' },
];

interface ApiKeySectionProps {
  form: Pick<FormState, ApiGroup>;
  updateGroup: (group: ApiGroup, patch: Partial<ApiGroupForm>) => void;
  manager: ReturnType<typeof useApiKeyManager>;
  modelOptions: Record<ApiGroup, ModelOption[]>;
}

export function ApiKeySection({ form, updateGroup, manager, modelOptions }: ApiKeySectionProps) {
  const { apiInfo, testMutation } = manager;
  const testResults = testMutation.data;

  return (
    <Section icon={Key} title="API 平台配置">
      <div className="space-y-3">
        {/* Test bar */}
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-stone-200">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-800 text-white text-xs font-medium rounded-lg hover:bg-stone-900 disabled:opacity-50 transition-colors"
          >
            {testMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {testMutation.isPending ? '正在测试...' : '测试所有连接'}
          </button>

          {testResults && (
            <div className="flex flex-wrap gap-3 text-xs">
              {GROUPS.map(({ key, label }) => {
                const r = testResults[key];
                return (
                  <span
                    key={key}
                    className={`flex items-center gap-1 ${r.ok ? 'text-emerald-600' : 'text-red-500'}`}
                    title={r.message}
                  >
                    {r.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[88px_1.4fr_1fr_1fr] gap-2 text-[10px] uppercase tracking-wide text-stone-400 px-1">
          <span />
          <span>API 地址</span>
          <span>API Key</span>
          <span>模型</span>
        </div>

        {/* 4 rows */}
        {GROUPS.map(({ key, label, hint }) => (
          <Row
            key={key}
            group={key}
            label={label}
            hint={hint}
            form={form[key]}
            info={apiInfo?.[key]}
            options={modelOptions[key]}
            onChange={(patch) => updateGroup(key, patch)}
          />
        ))}
      </div>
    </Section>
  );
}

interface RowProps {
  group: ApiGroup;
  label: string;
  hint: string;
  form: ApiGroupForm;
  info: GroupInfo | undefined;
  options: ModelOption[];
  onChange: (patch: Partial<ApiGroupForm>) => void;
}

function Row({ label, hint, form, info, options, onChange }: RowProps) {
  const keyPlaceholder = info?.has_key ? info.masked_key : '请输入 API Key';

  return (
    <div className="grid grid-cols-[88px_1.4fr_1fr_1fr] gap-2 items-center">
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit bg-stone-800 text-white text-[10px] rounded px-1.5 py-0.5">
          {label}
        </span>
        <span className="text-[10px] text-stone-400 leading-tight">{hint}</span>
      </div>
      <input
        type="text"
        value={form.api_base_url}
        onChange={(e) => onChange({ api_base_url: e.target.value })}
        placeholder="https://..."
        className="border border-stone-200 bg-stone-50 rounded-md px-2.5 py-1.5 text-xs font-mono text-stone-700 outline-none focus:ring-2 focus:ring-stone-400"
      />
      <input
        type="password"
        value={form.api_key}
        onChange={(e) => onChange({ api_key: e.target.value })}
        placeholder={keyPlaceholder}
        className="border border-stone-200 bg-stone-50 rounded-md px-2.5 py-1.5 text-xs font-mono text-stone-700 outline-none focus:ring-2 focus:ring-stone-400"
      />
      <select
        value={form.model}
        onChange={(e) => onChange({ model: e.target.value })}
        className="border border-stone-200 bg-white rounded-md px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-stone-400"
      >
        {!options.some((o) => o.value === form.model) && form.model && (
          <option value={form.model}>{form.model}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/components/ApiKeySection.tsx
git commit -m "feat(settings): collapse API config + model picker into 4-row table"
```

---

### Task 16: Delete `ModelSettings.tsx` and update `SettingsRoot.tsx`

**Files:**
- Delete: `frontend/src/features/settings/components/ModelSettings.tsx`
- Modify: `frontend/src/features/settings/components/SettingsRoot.tsx`

- [ ] **Step 1: Delete `ModelSettings.tsx`**

```bash
git rm frontend/src/features/settings/components/ModelSettings.tsx
```

- [ ] **Step 2: Replace `SettingsRoot.tsx`**

```tsx
import { Loader2, Save } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { useModelOptions } from '../hooks/useModelOptions';
import { useApiKeyManager } from '../hooks/useApiKeyManager';
import { ApiKeySection } from './ApiKeySection';
import { RetrievalSettings } from './RetrievalSettings';
import { AgentSettings } from './AgentSettings';
import { SplitterSettings } from './SplitterSettings';

const settle = (d: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
});

export function SettingsRoot() {
  const { config, isLoading, updateConfig, updateGroup, isSaving, save } = useSettings();
  const apiKeyManager = useApiKeyManager();
  const modelOptions = useModelOptions(apiKeyManager.perGroupModels);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-stone-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        加载配置中...
      </div>
    );
  }

  return (
    <div className="p-6 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="flex items-center justify-between mb-6" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">系统配置</h1>
          <p className="mt-1 text-sm text-stone-500">管理模型、检索和 RAG 核心参数</p>
        </div>
        <button
          onClick={save}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-900 disabled:opacity-60 transition-colors shadow-sm"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存配置
        </button>
      </div>

      <div className="space-y-4">
        <div style={settle(80)}>
          <ApiKeySection
            form={config}
            updateGroup={updateGroup}
            manager={apiKeyManager}
            modelOptions={modelOptions}
          />
        </div>

        <div style={settle(160)}>
          <RetrievalSettings form={config} set={updateConfig} />
        </div>

        <div style={settle(240)}>
          <AgentSettings form={config} set={updateConfig} />
        </div>

        <div style={settle(320)}>
          <SplitterSettings form={config} set={updateConfig} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Build the frontend**

Run: `cd frontend && npm run build`
Expected: successful build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings/components/SettingsRoot.tsx
git commit -m "refactor(settings): drop ModelSettings; ApiKeySection owns models"
```

---

## Phase 8 — Verification

### Task 17: End-to-end smoke test

**Files:** (no edits)

- [ ] **Step 1: Start the backend**

In one terminal:
```bash
cd backend && poetry run dev
```
Wait for the server to listen on `:8000`.

- [ ] **Step 2: Start the frontend**

In another terminal:
```bash
cd frontend && npm run dev
```
Wait for Vite to print the URL (typically `http://localhost:5173`).

- [ ] **Step 3: Test the UI path in a browser**

Open `http://localhost:5173/admin/settings`. Log in as `admin / admin123` if prompted.

Verify each of the following manually:

1. The API 平台配置 section shows 4 rows: 推理型 / 快速 / 向量 / 重排序.
2. Each row shows the existing URL and a masked Key (or empty if never set).
3. Clicking the password input lets you replace the key.
4. Clicking **测试所有连接** triggers requests; per-group ✓/✗ indicators appear.
5. After a successful test, each row's 模型 dropdown is populated with the corresponding API's models.
6. Modifying URL / Key / model on any group, then clicking 保存配置, returns 200 and a "配置已保存" toast.
7. Reloading the page shows the saved URL and a masked Key for the modified groups; previously-saved keys for un-touched groups remain.

- [ ] **Step 4: Check the backend wrote the right rows**

Run:
```bash
docker exec -i $(docker ps -qf name=mysql) mysql -urag_user -prag_pass_123 rag_db -e \
  "SELECT \`key\`, LEFT(value, 16) AS preview FROM system_settings WHERE \`key\` LIKE '%_api_%';"
```

Expected rows: `llm_api_base_url`, `llm_api_key`, `fast_llm_api_base_url`, `fast_llm_api_key`, `embedding_api_base_url`, `embedding_api_key`, `reranker_api_base_url`, `reranker_api_key`. (Only the groups you actually modified will be present.)

- [ ] **Step 5: Confirm the agent still answers**

In the browser, go to `/admin` (or `/student`), open a chat, send "你好" and verify the assistant streams a reply. This confirms `llm_factory.get_llm()` correctly picks up the new credentials.

- [ ] **Step 6: Final commit (only if any cleanup needed)**

If verification revealed cosmetic tweaks, fix them and commit:
```bash
git add <files>
git commit -m "fix(settings): <whatever was off>"
```

Otherwise no commit needed — the feature is complete.
