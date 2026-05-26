import pytest

from src.storage.document_store import DocumentStore


@pytest.fixture()
def ds():
    return DocumentStore()


class TestKnowledgeBase:
    def test_create_kb(self, ds):
        kb = ds.create_kb("test_kb", "Test knowledge base")
        assert kb["name"] == "test_kb"
        assert kb["description"] == "Test knowledge base"
        assert kb["id"] is not None

    def test_create_kb_duplicate_raises(self, ds):
        ds.create_kb("dup_kb")
        with pytest.raises(Exception):  # noqa: B017
            ds.create_kb("dup_kb")

    def test_list_kbs_with_doc_count(self, ds):
        ds.create_kb("kb1")
        ds.create_kb("kb2")
        ds.add_document("kb1", "file1.pdf")
        ds.add_document("kb1", "file2.pdf")
        kbs = ds.list_kbs()
        kb_map = {k["name"]: k for k in kbs}
        assert kb_map["kb1"]["doc_count"] == 2
        assert kb_map["kb2"]["doc_count"] == 0

    def test_get_kb_found(self, ds):
        ds.create_kb("found_kb")
        assert ds.get_kb("found_kb") is not None

    def test_get_kb_not_found(self, ds):
        assert ds.get_kb("nonexistent") is None

    def test_delete_kb_cascades_documents(self, ds):
        ds.create_kb("del_kb")
        ds.add_document("del_kb", "file.pdf")
        ds.delete_kb("del_kb")
        assert ds.get_kb("del_kb") is None
        assert len(ds.list_documents("del_kb")) == 0


class TestDocument:
    @pytest.fixture(autouse=True)
    def _kb(self, ds):
        ds.create_kb("doc_test_kb")

    def test_add_document_defaults(self, ds):
        doc = ds.add_document("doc_test_kb", "report.pdf")
        assert doc["file_name"] == "report.pdf"
        assert doc["kb_name"] == "doc_test_kb"
        assert doc["status"] == "completed"
        assert doc["chunk_count"] == 0

    def test_add_document_all_fields(self, ds):
        doc = ds.add_document(
            "doc_test_kb",
            "big.pdf",
            file_size=1024,
            chunk_count=10,
            chunk_size=512,
            chunk_overlap_ratio=0.2,
            doc_type="policy",
            splitter_type="semantic",
            status="processing",
            summary="A summary",
            content="Full content here",
        )
        assert doc["file_size"] == 1024
        assert doc["chunk_count"] == 10
        assert doc["doc_type"] == "policy"
        assert doc["content"] == "Full content here"

    def test_list_documents_ordered_by_created_desc(self, ds):
        import time

        ds.add_document("doc_test_kb", "first.pdf")
        time.sleep(1.1)  # ensure different created_at (DATETIME has 1s resolution)
        ds.add_document("doc_test_kb", "second.pdf")
        docs = ds.list_documents("doc_test_kb")
        assert docs[0]["file_name"] == "second.pdf"
        assert docs[1]["file_name"] == "first.pdf"

    def test_get_document(self, ds):
        doc = ds.add_document("doc_test_kb", "get_me.pdf")
        fetched = ds.get_document(doc["id"])
        assert fetched["file_name"] == "get_me.pdf"

    def test_get_document_not_found(self, ds):
        assert ds.get_document(999999) is None

    def test_update_document_allowed_fields(self, ds):
        doc = ds.add_document("doc_test_kb", "upd.pdf", chunk_count=0)
        result = ds.update_document(doc["id"], chunk_count=42, summary="Updated")
        assert result is True
        updated = ds.get_document(doc["id"])
        assert updated["chunk_count"] == 42
        assert updated["summary"] == "Updated"

    def test_update_document_ignores_disallowed_fields(self, ds):
        doc = ds.add_document("doc_test_kb", "safe.pdf")
        result = ds.update_document(doc["id"], file_name="hacked.pdf")
        assert result is False

    def test_update_document_summary(self, ds):
        doc = ds.add_document("doc_test_kb", "sum.pdf")
        assert ds.update_document_summary(doc["id"], "New summary") is True
        assert ds.get_document(doc["id"])["summary"] == "New summary"

    def test_delete_document_returns_row(self, ds):
        doc = ds.add_document("doc_test_kb", "del.pdf")
        deleted = ds.delete_document(doc["id"])
        assert deleted["file_name"] == "del.pdf"
        assert ds.get_document(doc["id"]) is None

    def test_delete_document_not_found(self, ds):
        assert ds.delete_document(999999) is None
