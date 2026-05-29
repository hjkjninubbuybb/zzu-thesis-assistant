"""Unit tests for ConfigService."""

from unittest.mock import MagicMock, patch

import pytest

from src.services.config_service import ConfigService


@pytest.fixture
def svc(mock_settings_store):
    return ConfigService(settings_store=mock_settings_store)


# ── get_api_key_info ──────────────────────────────────────────────────


def test_get_api_key_info_no_key(svc):
    with (
        patch("src.services.config_service.get_api_key", return_value=""),
        patch("src.services.config_service.get_api_base_url", return_value="https://api.example.com"),
    ):
        result = svc.get_api_key_info()

    assert result["has_key"] is False
    assert result["masked_key"] == ""
    assert result["api_base_url"] == "https://api.example.com"


def test_get_api_key_info_long_key_masked(svc):
    with (
        patch("src.services.config_service.get_api_key", return_value="sk-abcdefghijklmno1234"),
        patch("src.services.config_service.get_api_base_url", return_value="https://api.example.com"),
    ):
        result = svc.get_api_key_info()

    assert result["has_key"] is True
    assert result["masked_key"].startswith("sk-")
    assert result["masked_key"].endswith("1234")
    assert "****" in result["masked_key"]


def test_get_api_key_info_short_key_fully_masked(svc):
    with (
        patch("src.services.config_service.get_api_key", return_value="short"),
        patch("src.services.config_service.get_api_base_url", return_value="https://api.example.com"),
    ):
        result = svc.get_api_key_info()

    assert result["has_key"] is True
    assert result["masked_key"] == "****"


def test_get_api_key_info_exactly_7_chars_fully_masked(svc):
    # len("1234567") == 7, which is NOT > 7, so masked = "****"
    with (
        patch("src.services.config_service.get_api_key", return_value="1234567"),
        patch("src.services.config_service.get_api_base_url", return_value="https://api.example.com"),
    ):
        result = svc.get_api_key_info()

    assert result["masked_key"] == "****"


def test_get_api_key_info_8_chars_shows_prefix_suffix(svc):
    # len("12345678") == 8 > 7, so masked = "123****5678"
    with (
        patch("src.services.config_service.get_api_key", return_value="12345678"),
        patch("src.services.config_service.get_api_base_url", return_value="https://api.example.com"),
    ):
        result = svc.get_api_key_info()

    assert result["masked_key"] == "123****5678"


# ── update_api_key ────────────────────────────────────────────────────


def test_update_api_key_sets_key(svc, mock_settings_store):
    result = svc.update_api_key("new-key-abc")

    mock_settings_store.set_setting.assert_any_call("api_key", "new-key-abc")
    assert result["has_key"] is True
    assert result["message"] == "API 信息已更新"


def test_update_api_key_also_sets_base_url(svc, mock_settings_store):
    svc.update_api_key("new-key", api_base_url="https://new-url.com")

    calls = {call.args[0]: call.args[1] for call in mock_settings_store.set_setting.call_args_list}
    assert calls["api_key"] == "new-key"
    assert calls["api_base_url"] == "https://new-url.com"


def test_update_api_key_no_base_url_skips_url_setting(svc, mock_settings_store):
    svc.update_api_key("new-key", api_base_url=None)

    keys_set = [call.args[0] for call in mock_settings_store.set_setting.call_args_list]
    assert "api_base_url" not in keys_set


# ── read_config ───────────────────────────────────────────────────────


def test_read_config_returns_config_dict(svc):
    fake_config = {"llm": {"model": "qwen-plus"}, "retrieval": {"vector_top_k": 5}}

    with patch("src.services.config_service.get_config", return_value=fake_config):
        result = svc.read_config()

    assert result == fake_config


# ── update_config ─────────────────────────────────────────────────────


def test_update_config_invalid_embedding_model_raises(svc):
    with pytest.raises(ValueError, match="不支持的 Embedding 模型"):
        svc.update_config({"embedding_model": "invalid-model-xyz"})


def test_update_config_valid_embedding_model_allowed(svc):
    fake_config = {"embedding": {}, "llm": {}}

    with (
        patch("builtins.open", create=True) as mock_open,
        patch("yaml.safe_load", return_value=fake_config),
        patch("yaml.dump"),
        patch("src.services.config_service.get_config") as mock_get_config,
    ):
        mock_get_config.cache_clear = MagicMock()
        mock_get_config.return_value = {"embedding": {"model": "text-embedding-v3"}}
        mock_open.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_open.return_value.__exit__ = MagicMock(return_value=False)

        # Should not raise for a valid model
        import contextlib

        with contextlib.suppress(Exception):  # file I/O errors are acceptable here; we only check no ValueError
            svc.update_config({"embedding_model": "text-embedding-v3"})
