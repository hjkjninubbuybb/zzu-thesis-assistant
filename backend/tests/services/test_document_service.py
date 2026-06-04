"""Unit tests for DocumentService."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.exceptions import DocumentNotFoundError, KnowledgeBaseNotFoundError
from src.services.document_service import DocumentService


@pytest.fixture
def svc(mock_kb_store, mock_vector_store):
    mock_doc_store = MagicMock()
    svc = DocumentService(
        doc_store=mock_doc_store,
        kb_store=mock_kb_store,
        vector_store=mock_vector_store,
    )
    svc._mock_doc_store = mock_doc_store
    return svc


@pytest.fixture
def mock_doc_store(svc):
    return svc._mock_doc_store


# ── list_documents ────────────────────────────────────────────────────


def test_list_documents_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.list_documents("missing")


def test_list_documents_success(svc, mock_kb_store, mock_doc_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_doc_store.list_documents.return_value = ([{"id": 1, "file_name": "doc.pdf"}], 1)

    items, total = svc.list_documents("kb1")

    mock_doc_store.list_documents.assert_called_once_with("kb1", page=1, page_size=20, doc_type=None)
    assert len(items) == 1
    assert total == 1


# ── get_document ──────────────────────────────────────────────────────


def test_get_document_not_found(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = None

    with pytest.raises(DocumentNotFoundError):
        svc.get_document(99, "kb1")


def test_get_document_wrong_kb(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = {"id": 1, "kb_name": "other_kb"}

    with pytest.raises(DocumentNotFoundError):
        svc.get_document(1, "kb1")


def test_get_document_success(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = {"id": 1, "kb_name": "kb1", "file_name": "a.pdf"}

    result = svc.get_document(1, "kb1")

    assert result["id"] == 1
    assert result["kb_name"] == "kb1"


# ── update_document ───────────────────────────────────────────────────


def test_update_document_not_found(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = None

    with pytest.raises(DocumentNotFoundError):
        svc.update_document(99, "kb1", summary="new summary")


def test_update_document_wrong_kb(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = {"id": 1, "kb_name": "other_kb"}

    with pytest.raises(DocumentNotFoundError):
        svc.update_document(1, "kb1", summary="new")


def test_update_document_success(svc, mock_doc_store):
    mock_doc_store.get_document.side_effect = [
        {"id": 1, "kb_name": "kb1", "file_name": "a.pdf"},
        {"id": 1, "kb_name": "kb1", "file_name": "a.pdf", "summary": "updated"},
    ]

    result = svc.update_document(1, "kb1", summary="updated")

    mock_doc_store.update_document.assert_called_once_with(1, summary="updated")
    assert result["summary"] == "updated"


# ── get_file_path ─────────────────────────────────────────────────────


def test_get_file_path_doc_not_found(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = None

    with pytest.raises(DocumentNotFoundError):
        svc.get_file_path(99, "kb1")


def test_get_file_path_wrong_kb(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = {"id": 1, "kb_name": "other_kb"}

    with pytest.raises(DocumentNotFoundError):
        svc.get_file_path(1, "kb1")


def test_get_file_path_file_not_found(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = {"id": 1, "kb_name": "kb1"}

    fake_dir = MagicMock(spec=Path)
    fake_dir.__truediv__ = MagicMock(return_value=fake_dir)
    fake_dir.glob.return_value = []

    with patch("src.services.document_service._query.UPLOADS_DIR", fake_dir), pytest.raises(DocumentNotFoundError):
        svc.get_file_path(1, "kb1")


def test_get_file_path_success(svc, mock_doc_store):
    mock_doc_store.get_document.return_value = {"id": 1, "kb_name": "kb1"}

    fake_file = Path("/data/uploads/kb1/1_doc.pdf")
    fake_dir = MagicMock(spec=Path)
    fake_subdir = MagicMock(spec=Path)
    fake_dir.__truediv__ = MagicMock(return_value=fake_subdir)
    fake_subdir.glob.return_value = [fake_file]

    with patch("src.services.document_service._query.UPLOADS_DIR", fake_dir):
        result = svc.get_file_path(1, "kb1")

    assert result == fake_file
