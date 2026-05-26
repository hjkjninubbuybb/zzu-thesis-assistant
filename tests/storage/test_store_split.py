"""Integration tests verifying each specialized store works independently."""

from src.storage.settings_store import SettingsStore


class TestSettingsStore:
    def test_set_and_get_setting(self):
        s = SettingsStore()
        s.set_setting("_test_key", "hello")
        assert s.get_setting("_test_key") == "hello"

    def test_get_missing_setting_returns_none(self):
        s = SettingsStore()
        assert s.get_setting("__nonexistent__") is None

    def test_delete_setting(self):
        s = SettingsStore()
        s.set_setting("_del_key", "val")
        s.delete_setting("_del_key")
        assert s.get_setting("_del_key") is None
