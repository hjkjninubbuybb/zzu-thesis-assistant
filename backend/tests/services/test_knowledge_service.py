import pytest

from src.exceptions import KnowledgeBaseNotFoundError
from src.services.knowledge_service import KnowledgeBaseAlreadyExistsError, KnowledgeService
from src.storage.vector_store import VectorStoreError


@pytest.fixture
def svc(mock_kb_store, mock_settings_store, mock_vector_store):
    return KnowledgeService(
        kb_store=mock_kb_store,
        settings_store=mock_settings_store,
        vector_store=mock_vector_store,
    )


def test_list_kbs_attaches_active_flags(svc, mock_kb_store, mock_settings_store):
    mock_kb_store.list_kbs.return_value = [
        {"name": "kb_a", "doc_count": 3},
        {"name": "kb_b", "doc_count": 1},
    ]
    mock_settings_store.get_setting.side_effect = lambda key: "kb_a" if key == "active_kb" else "kb_b"

    result = svc.list_kbs()

    assert result[0]["is_active"] is True
    assert result[0]["is_admin_active"] is False
    assert result[1]["is_active"] is False
    assert result[1]["is_admin_active"] is True


def test_create_kb_success(svc, mock_kb_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = None
    mock_kb_store.create_kb.return_value = {"id": 1, "name": "new_kb", "description": ""}

    result = svc.create_kb("new_kb", "desc")

    mock_vector_store.create_collection.assert_called_once_with("new_kb")
    mock_kb_store.create_kb.assert_called_once_with("new_kb", "desc")
    assert result["name"] == "new_kb"


def test_create_kb_already_exists(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = {"name": "existing"}

    with pytest.raises(KnowledgeBaseAlreadyExistsError):
        svc.create_kb("existing")


def test_delete_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.delete_kb("missing")


def test_delete_kb_success(svc, mock_kb_store, mock_vector_store, mock_settings_store):
    mock_kb_store.get_kb.return_value = {"name": "kb_x"}
    mock_settings_store.get_setting.return_value = "other_kb"

    svc.delete_kb("kb_x")

    mock_vector_store.delete_collection.assert_called_once_with("kb_x")
    mock_kb_store.delete_kb.assert_called_once_with("kb_x")


def test_delete_kb_clears_active_setting(svc, mock_kb_store, mock_vector_store, mock_settings_store):
    mock_kb_store.get_kb.return_value = {"name": "kb_active"}
    mock_settings_store.get_setting.side_effect = lambda key: "kb_active" if key == "active_kb" else None

    svc.delete_kb("kb_active")

    mock_settings_store.delete_setting.assert_called_once_with("active_kb")


def test_delete_kb_vector_store_error_is_ignored(svc, mock_kb_store, mock_vector_store, mock_settings_store):
    mock_kb_store.get_kb.return_value = {"name": "kb_y"}
    mock_vector_store.delete_collection.side_effect = VectorStoreError("qdrant down")
    mock_settings_store.get_setting.return_value = None

    svc.delete_kb("kb_y")

    mock_kb_store.delete_kb.assert_called_once_with("kb_y")


def test_get_active_kb_not_configured(svc, mock_settings_store):
    mock_settings_store.get_setting.return_value = None

    result = svc.get_active_kb()

    assert result is None


def test_set_active_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.set_active_kb("nonexistent")


def test_set_active_kb_success(svc, mock_kb_store, mock_settings_store):
    mock_kb_store.get_kb.return_value = {"name": "kb_z", "description": "desc"}
    mock_kb_store.list_kbs.return_value = [{"name": "kb_z", "doc_count": 5}]
    mock_settings_store.get_setting.return_value = "kb_z"

    result = svc.set_active_kb("kb_z")

    mock_settings_store.set_setting.assert_called_once_with("active_kb", "kb_z")
    assert result["kb_name"] == "kb_z"
    assert result["doc_count"] == 5
