"""Unit tests for ConfigService — 4-group credentials."""

from unittest.mock import MagicMock, patch

import pytest

from src.services.config_service import GROUPS, ConfigService


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


def _patch_yaml_io(fake_cfg: dict):
    """Helper: build the patches needed for update_config()'s file IO."""
    mock_open_obj = MagicMock()
    mock_open_obj.return_value.__enter__ = MagicMock(return_value=MagicMock())
    mock_open_obj.return_value.__exit__ = MagicMock(return_value=False)
    return mock_open_obj


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
    # untouched groups should not appear
    assert "fast_llm_api_key" not in calls
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

        svc.update_config({"llm": {"api_base_url": "https://x.com/v1", "api_key": "", "model": "qwen-plus"}})

    keys = [c.args[0] for c in mock_settings_store.set_setting.call_args_list]
    assert "llm_api_key" not in keys  # empty key skipped
    assert "llm_api_base_url" in keys  # URL still persisted


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
    async def fake_fetch(url, key):
        return ["m1"]

    with (
        patch("src.services.config_service.get_llm_credentials", return_value=(None, "")),
        patch(
            "src.services.config_service.get_fast_llm_credentials",
            return_value=("https://x.com", "sk-x"),
        ),
        patch("src.services.config_service.get_embedding_credentials", return_value=(None, "")),
        patch("src.services.config_service.get_reranker_credentials", return_value=(None, "")),
        patch.object(ConfigService, "_fetch_remote_models", side_effect=fake_fetch),
    ):
        results = await svc.test_all_connections()

    assert results["llm"]["ok"] is False
    assert "未配置" in results["llm"]["message"]
    assert results["fast_llm"]["ok"] is True
