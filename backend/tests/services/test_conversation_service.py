"""Unit tests for ConversationService."""

from unittest.mock import MagicMock, patch

import pytest

from src.services.conversation_service import (
    ConversationNotFoundError,
    ConversationService,
    KnowledgeBaseNotFoundError,
)


@pytest.fixture
def svc(mock_conv_store, mock_kb_store):
    return ConversationService(conv_store=mock_conv_store, kb_store=mock_kb_store)


# ── create_conversation ────────────────────────────────────────────────


def test_create_conversation_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.create_conversation("missing_kb", "title", user_id=1)


def test_create_conversation_success(svc, mock_kb_store, mock_conv_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_conv_store.create_conversation.return_value = {"id": 10, "title": "title", "kb_name": "kb1"}

    result = svc.create_conversation("kb1", "title", user_id=5)

    mock_conv_store.create_conversation.assert_called_once_with("kb1", "title", 5)
    assert result["id"] == 10


# ── get_conversation ───────────────────────────────────────────────────


def test_get_conversation_not_found(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = None

    with pytest.raises(ConversationNotFoundError):
        svc.get_conversation(99)


def test_get_conversation_success(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1, "title": "t"}

    result = svc.get_conversation(1)

    assert result["id"] == 1


# ── update_title ───────────────────────────────────────────────────────


def test_update_title_not_found(svc, mock_conv_store):
    mock_conv_store.update_conversation_title.return_value = None

    with pytest.raises(ConversationNotFoundError):
        svc.update_title(99, "new")


def test_update_title_success(svc, mock_conv_store):
    mock_conv_store.update_conversation_title.return_value = {"id": 1, "title": "new"}

    result = svc.update_title(1, "new")

    assert result["title"] == "new"


# ── delete_conversation ────────────────────────────────────────────────


def test_delete_conversation_not_found(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = None

    with pytest.raises(ConversationNotFoundError):
        svc.delete_conversation(99)


def test_delete_conversation_success(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1}

    svc.delete_conversation(1)

    mock_conv_store.delete_conversation.assert_called_once_with(1)


# ── list_messages ──────────────────────────────────────────────────────


def test_list_messages_attaches_feedback_rating(svc, mock_conv_store):
    mock_conv_store.list_messages.return_value = [
        {"id": 10, "role": "user", "content": "hello"},
        {"id": 11, "role": "assistant", "content": "world"},
    ]
    mock_conv_store.get_message_feedback.side_effect = lambda mid: {"rating": "up"} if mid == 11 else None

    result = svc.list_messages(1)

    assert result[0]["feedback"] is None
    assert result[1]["feedback"] == "up"


def test_list_messages_no_feedback(svc, mock_conv_store):
    mock_conv_store.list_messages.return_value = [{"id": 5, "role": "user", "content": "hi"}]
    mock_conv_store.get_message_feedback.return_value = None

    result = svc.list_messages(1)

    assert result[0]["feedback"] is None


# ── add_message ────────────────────────────────────────────────────────


def test_add_message_sources_and_files_kept(svc, mock_conv_store):
    sources = [{"text": "chunk1"}]
    files = [{"url": "/doc.pdf"}]
    mock_conv_store.add_message.return_value = {"id": 7, "role": "user", "content": "q"}

    result = svc.add_message(1, "user", "q", sources=sources, files=files)

    assert result["sources"] == sources
    assert result["files"] == files
    assert result["feedback"] is None


def test_add_message_none_sources(svc, mock_conv_store):
    mock_conv_store.add_message.return_value = {"id": 8, "role": "assistant", "content": "a"}

    result = svc.add_message(1, "assistant", "a", sources=None, files=None)

    call_args = mock_conv_store.add_message.call_args
    assert call_args.args[3] is None  # sources_json
    assert call_args.args[4] is None  # files_json
    assert result["sources"] is None
    assert result["files"] is None


# ── set_feedback ───────────────────────────────────────────────────────


def test_set_feedback_delegates(svc, mock_conv_store):
    mock_conv_store.set_message_feedback.return_value = {"id": 1, "rating": "down"}

    result = svc.set_feedback(1, "down")

    mock_conv_store.set_message_feedback.assert_called_once_with(1, "down")
    assert result["rating"] == "down"


# ── generate_title ─────────────────────────────────────────────────────


def test_generate_title_no_conversation(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = None

    with pytest.raises(ConversationNotFoundError):
        svc.generate_title(1)


def test_generate_title_no_messages(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1}
    mock_conv_store.list_messages.return_value = []

    with pytest.raises(ConversationNotFoundError):
        svc.generate_title(1)


def test_generate_title_no_user_message(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1}
    mock_conv_store.list_messages.return_value = [{"id": 2, "role": "assistant", "content": "Hello"}]

    with pytest.raises(ConversationNotFoundError):
        svc.generate_title(1)


def test_generate_title_llm_success(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1}
    mock_conv_store.list_messages.return_value = [
        {"id": 2, "role": "user", "content": "如何提交开题报告"},
        {"id": 3, "role": "assistant", "content": "请登录系统..."},
    ]
    mock_conv_store.update_conversation_title.return_value = {"id": 1, "title": "开题报告提交流程"}

    mock_llm = MagicMock()
    mock_resp = MagicMock()
    mock_resp.content = "开题报告提交流程"
    mock_llm.invoke.return_value = mock_resp

    with patch("src.services.conversation_service.get_llm", return_value=mock_llm):
        result = svc.generate_title(1)

    assert result["title"] == "开题报告提交流程"


def test_generate_title_llm_failure_fallback(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1}
    mock_conv_store.list_messages.return_value = [
        {"id": 2, "role": "user", "content": "毕业论文格式"},
    ]
    mock_conv_store.update_conversation_title.return_value = {"id": 1, "title": "毕业论文格式"}

    with patch("src.services.conversation_service.get_llm", side_effect=RuntimeError("API error")):
        result = svc.generate_title(1)

    # Falls back to user text prefix
    assert result is not None


def test_generate_title_update_returns_none_raises(svc, mock_conv_store):
    mock_conv_store.get_conversation.return_value = {"id": 1}
    mock_conv_store.list_messages.return_value = [
        {"id": 2, "role": "user", "content": "问题"},
    ]
    mock_conv_store.update_conversation_title.return_value = None

    mock_llm = MagicMock()
    mock_resp = MagicMock()
    mock_resp.content = "问题标题"
    mock_llm.invoke.return_value = mock_resp

    with (
        patch("src.services.conversation_service.get_llm", return_value=mock_llm),
        pytest.raises(ConversationNotFoundError),
    ):
        svc.generate_title(1)
