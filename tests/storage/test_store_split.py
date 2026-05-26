"""Integration tests verifying each specialized store works independently."""

from src.storage.kb_store import KBStore
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


class TestKBStore:
    def test_create_and_get_kb(self):
        store = KBStore()
        kb = store.create_kb("_split_test_kb", "test desc")
        assert kb["name"] == "_split_test_kb"
        assert kb["description"] == "test desc"
        fetched = store.get_kb("_split_test_kb")
        assert fetched is not None
        store.delete_kb("_split_test_kb")

    def test_list_kbs_includes_new(self):
        store = KBStore()
        store.create_kb("_split_list_kb")
        names = [kb["name"] for kb in store.list_kbs()]
        assert "_split_list_kb" in names
        store.delete_kb("_split_list_kb")

    def test_get_nonexistent_kb_returns_none(self):
        store = KBStore()
        assert store.get_kb("__no_such_kb__") is None

    def test_delete_kb(self):
        store = KBStore()
        store.create_kb("_split_del_kb")
        store.delete_kb("_split_del_kb")
        assert store.get_kb("_split_del_kb") is None
