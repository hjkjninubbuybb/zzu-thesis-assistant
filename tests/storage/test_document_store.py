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


class TestFAQ:
    @pytest.fixture(autouse=True)
    def _kb(self, ds):
        ds.create_kb("faq_kb")

    def test_add_faq_defaults(self, ds):
        faq = ds.add_faq("faq_kb", "What is X?", "X is Y.")
        assert faq["question"] == "What is X?"
        assert faq["answer"] == "X is Y."
        assert faq["enabled"] == 1
        assert faq["status"] == "approved"

    def test_add_faq_with_author(self, ds):
        from src.storage.user_store import UserStore

        us = UserStore()
        user = us.create_user("faq_author", "hash", role="teacher")
        faq = ds.add_faq("faq_kb", "Q?", "A.", author_id=user["id"], status="pending")
        assert faq["author_id"] == user["id"]
        assert faq["status"] == "pending"

    def test_list_faqs_enabled_only(self, ds):
        ds.add_faq("faq_kb", "Q1", "A1")
        faq2 = ds.add_faq("faq_kb", "Q2", "A2")
        ds.update_faq(faq2["id"], enabled=0)
        enabled = ds.list_faqs("faq_kb", enabled_only=True)
        assert len(enabled) == 1
        assert enabled[0]["question"] == "Q1"

    def test_list_faqs_by_status(self, ds):
        ds.add_faq("faq_kb", "Q1", "A1", status="approved")
        ds.add_faq("faq_kb", "Q2", "A2", status="draft")
        approved = ds.list_faqs("faq_kb", status="approved")
        assert len(approved) == 1

    def test_get_faq(self, ds):
        faq = ds.add_faq("faq_kb", "Q?", "A.")
        assert ds.get_faq(faq["id"])["question"] == "Q?"

    def test_update_faq(self, ds):
        faq = ds.add_faq("faq_kb", "Old Q", "Old A")
        updated = ds.update_faq(faq["id"], question="New Q", answer="New A")
        assert updated["question"] == "New Q"
        assert updated["answer"] == "New A"

    def test_update_faq_no_valid_keys(self, ds):
        faq = ds.add_faq("faq_kb", "Q?", "A.")
        result = ds.update_faq(faq["id"], invalid_key="value")
        assert result["question"] == "Q?"

    def test_delete_faq(self, ds):
        faq = ds.add_faq("faq_kb", "Del Q", "Del A")
        deleted = ds.delete_faq(faq["id"])
        assert deleted["question"] == "Del Q"
        assert ds.get_faq(faq["id"]) is None

    def test_delete_faq_not_found(self, ds):
        assert ds.delete_faq(999999) is None

    def test_list_faqs_order_by_sort_order(self, ds):
        ds.add_faq("faq_kb", "Q2", "A2", sort_order=2)
        ds.add_faq("faq_kb", "Q1", "A1", sort_order=1)
        faqs = ds.list_faqs("faq_kb")
        assert faqs[0]["question"] == "Q1"
        assert faqs[1]["question"] == "Q2"


class TestSettings:
    def test_set_and_get_setting(self, ds):
        ds.set_setting("test_key", "test_value")
        assert ds.get_setting("test_key") == "test_value"

    def test_get_setting_not_found(self, ds):
        assert ds.get_setting("nonexistent") is None

    def test_set_setting_upsert(self, ds):
        ds.set_setting("upsert_key", "v1")
        ds.set_setting("upsert_key", "v2")
        assert ds.get_setting("upsert_key") == "v2"

    def test_delete_setting(self, ds):
        ds.set_setting("del_key", "val")
        ds.delete_setting("del_key")
        assert ds.get_setting("del_key") is None


class TestConversation:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore

        us = UserStore()
        self.user = us.create_user("conv_user", "hash", role="student")
        ds.create_kb("conv_kb")

    def test_create_conversation(self, ds):
        conv = ds.create_conversation("conv_kb", user_id=self.user["id"])
        assert conv["title"] == "新对话"
        assert conv["kb_name"] == "conv_kb"

    def test_list_conversations_pagination(self, ds):
        for i in range(5):
            ds.create_conversation("conv_kb", title=f"Conv {i}", user_id=self.user["id"])
        result = ds.list_conversations(kb_name="conv_kb", limit=3)
        assert len(result["items"]) == 3
        assert result["has_more"] is True
        assert result["next_cursor"] is not None

    def test_list_conversations_filter_by_user(self, ds):
        from src.storage.user_store import UserStore

        us = UserStore()
        other = us.create_user("other_user", "hash", role="student")
        ds.create_conversation("conv_kb", user_id=self.user["id"])
        ds.create_conversation("conv_kb", user_id=other["id"])
        result = ds.list_conversations(user_id=self.user["id"])
        assert len(result["items"]) == 1

    def test_update_conversation_title(self, ds):
        conv = ds.create_conversation("conv_kb", user_id=self.user["id"])
        updated = ds.update_conversation_title(conv["id"], "New Title")
        assert updated["title"] == "New Title"

    def test_delete_conversation_cascades(self, ds):
        conv = ds.create_conversation("conv_kb", user_id=self.user["id"])
        ds.add_message(conv["id"], "user", "Hello")
        ds.delete_conversation(conv["id"])
        assert ds.get_conversation(conv["id"]) is None
        assert ds.list_messages(conv["id"]) == []


class TestMessage:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore

        us = UserStore()
        self.user = us.create_user("msg_user", "hash", role="student")
        ds.create_kb("msg_kb")
        self.conv = ds.create_conversation("msg_kb", user_id=self.user["id"])

    def test_add_message_plain(self, ds):
        msg = ds.add_message(self.conv["id"], "user", "Hello!")
        assert msg["role"] == "user"
        assert msg["content"] == "Hello!"
        assert msg["sources"] is None

    def test_add_message_with_sources_json(self, ds):
        import json

        sources = [{"node_id": "n1", "text": "chunk", "score": 0.9}]
        msg = ds.add_message(self.conv["id"], "assistant", "Answer", sources_json=json.dumps(sources))
        assert isinstance(msg["sources"], list)
        assert msg["sources"][0]["node_id"] == "n1"

    def test_list_messages_order_asc(self, ds):
        ds.add_message(self.conv["id"], "user", "First")
        ds.add_message(self.conv["id"], "assistant", "Second")
        msgs = ds.list_messages(self.conv["id"])
        assert msgs[0]["content"] == "First"
        assert msgs[1]["content"] == "Second"

    def test_add_message_updates_conversation_updated_at(self, ds):
        import time

        before = ds.get_conversation(self.conv["id"])["updated_at"]
        time.sleep(1.1)
        ds.add_message(self.conv["id"], "user", "New msg")
        after = ds.get_conversation(self.conv["id"])["updated_at"]
        assert after > before


class TestFeedback:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore

        us = UserStore()
        user = us.create_user("fb_user", "hash", role="student")
        ds.create_kb("fb_kb")
        conv = ds.create_conversation("fb_kb", user_id=user["id"])
        self.msg = ds.add_message(conv["id"], "assistant", "Answer")

    def test_set_and_get_feedback(self, ds):
        fb = ds.set_message_feedback(self.msg["id"], "thumbs_up")
        assert fb["rating"] == "thumbs_up"
        assert ds.get_message_feedback(self.msg["id"])["rating"] == "thumbs_up"

    def test_update_feedback_upsert(self, ds):
        ds.set_message_feedback(self.msg["id"], "thumbs_up")
        ds.set_message_feedback(self.msg["id"], "thumbs_down")
        assert ds.get_message_feedback(self.msg["id"])["rating"] == "thumbs_down"

    def test_get_feedback_not_found(self, ds):
        assert ds.get_message_feedback(999999) is None


class TestQARequest:
    @pytest.fixture(autouse=True)
    def _setup(self, ds):
        from src.storage.user_store import UserStore

        us = UserStore()
        self.student = us.create_user("qa_student", "hash", role="student")
        self.mentor = us.create_user("qa_mentor", "hash", role="teacher")
        ds.create_kb("qa_kb")
        self.conv = ds.create_conversation("qa_kb", user_id=self.student["id"])
        self.msg = ds.add_message(self.conv["id"], "user", "Help me!")

    def test_create_qa_request(self, ds):
        req = ds.create_qa_request(
            self.student["id"],
            self.mentor["id"],
            self.conv["id"],
            self.msg["id"],
            "Help me!",
        )
        assert req["status"] == "pending"
        assert req["answer"] is None

    def test_update_qa_request(self, ds):
        req = ds.create_qa_request(
            self.student["id"],
            self.mentor["id"],
            self.conv["id"],
            self.msg["id"],
            "Help!",
        )
        updated = ds.update_qa_request(req["id"], "Here is help.", status="replied")
        assert updated["answer"] == "Here is help."
        assert updated["status"] == "replied"
        assert updated["replied_at"] is not None

    def test_list_qa_requests_by_mentor(self, ds):
        ds.create_qa_request(
            self.student["id"],
            self.mentor["id"],
            self.conv["id"],
            self.msg["id"],
            "Q1",
        )
        results = ds.list_qa_requests(mentor_id=self.mentor["id"])
        assert len(results) == 1

    def test_list_qa_requests_by_status(self, ds):
        req = ds.create_qa_request(
            self.student["id"],
            self.mentor["id"],
            self.conv["id"],
            self.msg["id"],
            "Q1",
        )
        pending = ds.list_qa_requests(status="pending")
        assert len(pending) == 1
        ds.update_qa_request(req["id"], "A1", status="replied")
        pending_after = ds.list_qa_requests(status="pending")
        assert len(pending_after) == 0

    def test_get_qa_request(self, ds):
        req = ds.create_qa_request(
            self.student["id"],
            self.mentor["id"],
            self.conv["id"],
            self.msg["id"],
            "Q?",
        )
        fetched = ds.get_qa_request(req["id"])
        assert fetched["question"] == "Q?"
