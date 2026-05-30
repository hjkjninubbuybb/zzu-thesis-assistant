"""Unit tests for FAQService."""

from unittest.mock import patch

import pytest

from src.exceptions import FAQNotFoundError, KnowledgeBaseNotFoundError
from src.services.faq_service import FAQService


@pytest.fixture
def svc(mock_faq_store, mock_kb_store, mock_vector_store):
    return FAQService(
        faq_store=mock_faq_store,
        kb_store=mock_kb_store,
        vector_store=mock_vector_store,
    )


# ── list_faqs ─────────────────────────────────────────────────────────


def test_list_faqs_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.list_faqs("missing", status=None, role="admin")


def test_list_faqs_student_forces_approved(svc, mock_kb_store, mock_faq_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.list_faqs.return_value = []

    svc.list_faqs("kb1", status="pending", role="student")

    mock_faq_store.list_faqs.assert_called_once_with("kb1", status="approved")


def test_list_faqs_admin_uses_original_status(svc, mock_kb_store, mock_faq_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.list_faqs.return_value = []

    svc.list_faqs("kb1", status="pending", role="admin")

    mock_faq_store.list_faqs.assert_called_once_with("kb1", status="pending")


def test_list_faqs_none_status_passes_through(svc, mock_kb_store, mock_faq_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.list_faqs.return_value = [{"id": 1}]

    result = svc.list_faqs("kb1", status=None, role="teacher")

    mock_faq_store.list_faqs.assert_called_once_with("kb1", status=None)
    assert len(result) == 1


# ── create ────────────────────────────────────────────────────────────


def test_create_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.create("missing", "q", "a", "cat", 0, 1, "admin")


def test_create_admin_status_approved_and_vectors(svc, mock_kb_store, mock_faq_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.add_faq.return_value = {"id": 5, "status": "approved"}
    mock_faq_store.update_faq.return_value = {"id": 5, "status": "approved", "vector_id": "vec-1"}

    with patch("src.services.faq_service.upsert_faq_vector") as mock_upsert:
        result = svc.create("kb1", "q", "a", "cat", 0, 1, "admin")

    mock_upsert.assert_called_once()
    mock_faq_store.update_faq.assert_called_once()
    assert result is not None


def test_create_teacher_status_pending_no_vector(svc, mock_kb_store, mock_faq_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.add_faq.return_value = {"id": 6, "status": "pending"}

    with patch("src.services.faq_service.upsert_faq_vector") as mock_upsert:
        result = svc.create("kb1", "q", "a", "cat", 0, 2, "teacher")

    mock_upsert.assert_not_called()
    assert result["status"] == "pending"


def test_create_vector_error_does_not_raise(svc, mock_kb_store, mock_faq_store):
    from src.storage.vector_store import VectorStoreError

    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.add_faq.return_value = {"id": 7, "status": "approved"}

    with patch("src.services.faq_service.upsert_faq_vector", side_effect=VectorStoreError("qdrant down")):
        # Should NOT raise
        result = svc.create("kb1", "q", "a", "cat", 0, 1, "admin")

    assert result["id"] == 7


# ── delete ────────────────────────────────────────────────────────────


def test_delete_faq_not_found(svc, mock_faq_store):
    mock_faq_store.get_faq.return_value = None

    with pytest.raises(FAQNotFoundError):
        svc.delete("kb1", 99)


def test_delete_faq_wrong_kb(svc, mock_faq_store):
    mock_faq_store.get_faq.return_value = {"id": 1, "kb_name": "other_kb"}

    with pytest.raises(FAQNotFoundError):
        svc.delete("kb1", 1)


def test_delete_faq_with_vector_id(svc, mock_faq_store, mock_vector_store):
    mock_faq_store.get_faq.return_value = {"id": 1, "kb_name": "kb1", "vector_id": "v-abc"}

    result = svc.delete("kb1", 1)

    mock_vector_store.delete_by_ids.assert_called_once_with("kb1", ["v-abc"])
    mock_faq_store.delete_faq.assert_called_once_with(1)
    assert result == {"message": "FAQ 1 已删除"}


def test_delete_faq_without_vector_id(svc, mock_faq_store, mock_vector_store):
    mock_faq_store.get_faq.return_value = {"id": 2, "kb_name": "kb1", "vector_id": None}

    result = svc.delete("kb1", 2)

    mock_vector_store.delete_by_ids.assert_not_called()
    mock_faq_store.delete_faq.assert_called_once_with(2)
    assert "已删除" in result["message"]


# ── export_to_xlsx ────────────────────────────────────────────────────


def test_export_to_xlsx_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.export_to_xlsx("missing")


def test_export_to_xlsx_returns_bytes_and_filename(svc, mock_kb_store, mock_faq_store):
    from openpyxl import Workbook

    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_faq_store.list_faqs.return_value = [{"id": 1, "question": "q", "answer": "a"}]

    fake_wb = Workbook()
    with patch("src.services.faq_service.build_faq_workbook", return_value=fake_wb):
        data, filename = svc.export_to_xlsx("kb1")

    assert isinstance(data, bytes)
    assert len(data) > 0
    assert "kb1" in filename
    assert filename.endswith(".xlsx")


# ── get_template ──────────────────────────────────────────────────────


def test_get_template_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.get_template("missing")


def test_get_template_returns_bytes_and_fixed_filename(svc, mock_kb_store):
    from openpyxl import Workbook

    mock_kb_store.get_kb.return_value = {"name": "kb1"}

    fake_wb = Workbook()
    with patch("src.services.faq_service.build_faq_workbook", return_value=fake_wb):
        data, filename = svc.get_template("kb1")

    assert isinstance(data, bytes)
    assert filename == "FAQ_导入模板.xlsx"


# ── search ────────────────────────────────────────────────────────────


def _faq_row(faq_id: int, kb: str = "kb1", status: str = "approved") -> dict:
    """构造测试用 FAQ 行 dict。"""
    import datetime

    return {
        "id": faq_id,
        "kb_name": kb,
        "question": f"Q{faq_id}",
        "answer": f"A{faq_id}",
        "category": "",
        "sort_order": 0,
        "enabled": True,
        "status": status,
        "author_id": None,
        "created_at": datetime.datetime(2024, 1, 1),
        "updated_at": datetime.datetime(2024, 1, 1),
    }


def test_search_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.search("missing", "query")


def test_search_embed_failure(svc, mock_kb_store):
    from dashscope.common.error import DashScopeException

    mock_kb_store.get_kb.return_value = {"name": "kb1"}

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.side_effect = DashScopeException("err")
        with pytest.raises(RuntimeError, match="向量化失败"):
            svc.search("kb1", "query")


def test_search_vector_store_failure(svc, mock_kb_store, mock_vector_store):
    from src.storage.vector_store import VectorStoreError

    mock_kb_store.get_kb.return_value = {"name": "kb1"}

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        mock_vector_store.search.side_effect = VectorStoreError("qdrant down")
        with pytest.raises(RuntimeError, match="向量检索失败"):
            svc.search("kb1", "query")


def test_search_passes_score_threshold(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = []
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        svc.search("kb1", "query")

    call_args = mock_vector_store.search.call_args[0]
    assert call_args[3] == 0.4  # score_threshold 第 4 个位置参数


def test_search_vector_result_has_score(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.92}]
    mock_faq_store.get_faq.return_value = _faq_row(1)
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    assert result["items"][0]["score"] == 0.92


def test_search_text_result_has_null_score(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = []
    mock_faq_store.search_by_text.return_value = [_faq_row(2)]

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    assert result["items"][0]["score"] is None


def test_search_deduplicates_by_faq_id(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.8}]
    mock_faq_store.get_faq.return_value = _faq_row(1)
    # FAQ 1 同时出现在文本搜索结果中
    mock_faq_store.search_by_text.return_value = [_faq_row(1), _faq_row(2)]

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    ids = [item["id"] for item in result["items"]]
    assert ids.count(1) == 1  # 不重复
    assert 2 in ids


def test_search_vector_results_before_text(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.8}]
    mock_faq_store.get_faq.return_value = _faq_row(1)
    mock_faq_store.search_by_text.return_value = [_faq_row(2)]

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    items = result["items"]
    assert items[0]["id"] == 1 and items[0]["score"] == 0.8
    assert items[1]["id"] == 2 and items[1]["score"] is None


def test_search_returns_all_statuses(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.9}]
    mock_faq_store.get_faq.return_value = _faq_row(1, status="draft")
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    assert len(result["items"]) == 1
    assert result["items"][0]["status"] == "draft"


def test_search_no_rewrite_query_called(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = []
    mock_faq_store.search_by_text.return_value = []

    with (
        patch("src.core.rag.embedding.get_embed_model") as mock_embed,
        patch("src.core.faq_match.rewrite_query") as mock_rewrite,
    ):
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        svc.search("kb1", "query")

    mock_rewrite.assert_not_called()
