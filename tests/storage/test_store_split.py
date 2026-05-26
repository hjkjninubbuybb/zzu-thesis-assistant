"""Integration tests verifying each specialized store works independently."""

from src.storage.doc_store import DocStore
from src.storage.faq_store import FAQStore
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


class TestDocStore:
    def test_add_and_get_document(self):
        KBStore().create_kb("_doc_split_kb")
        store = DocStore()
        doc = store.add_document("_doc_split_kb", "test.txt", file_size=100)
        assert doc["file_name"] == "test.txt"
        fetched = store.get_document(doc["id"])
        assert fetched["id"] == doc["id"]
        KBStore().delete_kb("_doc_split_kb")

    def test_list_documents(self):
        KBStore().create_kb("_doc_list_kb")
        store = DocStore()
        store.add_document("_doc_list_kb", "a.txt")
        store.add_document("_doc_list_kb", "b.txt")
        docs = store.list_documents("_doc_list_kb")
        names = [d["file_name"] for d in docs]
        assert "a.txt" in names and "b.txt" in names
        KBStore().delete_kb("_doc_list_kb")

    def test_update_document_summary(self):
        KBStore().create_kb("_doc_upd_kb")
        store = DocStore()
        doc = store.add_document("_doc_upd_kb", "upd.txt")
        ok = store.update_document_summary(doc["id"], "new summary")
        assert ok is True
        fetched = store.get_document(doc["id"])
        assert fetched["summary"] == "new summary"
        KBStore().delete_kb("_doc_upd_kb")

    def test_delete_document(self):
        KBStore().create_kb("_doc_del_kb")
        store = DocStore()
        doc = store.add_document("_doc_del_kb", "del.txt")
        deleted = store.delete_document(doc["id"])
        assert deleted["id"] == doc["id"]
        assert store.get_document(doc["id"]) is None
        KBStore().delete_kb("_doc_del_kb")


class TestFAQStore:
    def test_add_and_get_faq(self):
        KBStore().create_kb("_faq_split_kb")
        store = FAQStore()
        faq = store.add_faq("_faq_split_kb", "Q?", "A.")
        assert faq["question"] == "Q?"
        fetched = store.get_faq(faq["id"])
        assert fetched["answer"] == "A."
        KBStore().delete_kb("_faq_split_kb")

    def test_list_faqs(self):
        KBStore().create_kb("_faq_list_kb")
        store = FAQStore()
        store.add_faq("_faq_list_kb", "Q1?", "A1.")
        store.add_faq("_faq_list_kb", "Q2?", "A2.")
        faqs = store.list_faqs("_faq_list_kb")
        assert len(faqs) == 2
        KBStore().delete_kb("_faq_list_kb")

    def test_update_faq(self):
        KBStore().create_kb("_faq_upd_kb")
        store = FAQStore()
        faq = store.add_faq("_faq_upd_kb", "Q?", "A.")
        updated = store.update_faq(faq["id"], answer="New A.")
        assert updated["answer"] == "New A."
        KBStore().delete_kb("_faq_upd_kb")

    def test_delete_faq(self):
        KBStore().create_kb("_faq_del_kb")
        store = FAQStore()
        faq = store.add_faq("_faq_del_kb", "Q?", "A.")
        deleted = store.delete_faq(faq["id"])
        assert deleted["id"] == faq["id"]
        assert store.get_faq(faq["id"]) is None
        KBStore().delete_kb("_faq_del_kb")
