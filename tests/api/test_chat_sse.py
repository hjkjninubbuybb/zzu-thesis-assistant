"""Unit tests for the chat SSE endpoint in src/api/routes/chat.py."""

import json
from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from src.api.app import app
from src.api.auth import get_current_user


def _parse_sse(response) -> list[dict]:
    """Parse SSE response body into list of {event, data} dicts.

    Args:
        response: The HTTP response object with a .text attribute.

    Returns:
        A list of dicts with 'event' and 'data' keys.
    """
    events = []
    current_event = None
    for line in response.text.split("\n"):
        line = line.strip()
        if line.startswith("event:"):
            current_event = line[len("event:") :].strip()
        elif line.startswith("data:"):
            raw = line[len("data:") :].strip()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = raw
            events.append({"event": current_event, "data": data})
            current_event = None
    return events


def _make_valid_kb():
    """Return a mock KB object that looks like a valid knowledge base."""
    kb = MagicMock()
    kb.name = "test_kb"
    return kb


@pytest.fixture(autouse=True)
def _mock_auth():
    """Override auth dependency for all tests in this module."""
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "username": "admin",
        "role": "admin",
    }
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def client():
    """Return a TestClient for the FastAPI app."""
    return TestClient(app, raise_server_exceptions=False)


@patch("src.api.routes.chat._ds")
def test_no_kb_configured_returns_403(mock_ds, client):
    """When admin_kb setting is not configured, expect 403."""
    mock_ds.get_setting.return_value = None
    response = client.post("/api/chat", json={"query": "test", "history": []})
    assert response.status_code == 403


@patch("src.api.routes.chat._ds")
def test_kb_not_found_returns_404(mock_ds, client):
    """When the configured KB does not exist in the store, expect 404."""
    mock_ds.get_setting.return_value = "missing_kb"
    mock_ds.get_kb.return_value = None
    response = client.post("/api/chat", json={"query": "test", "history": []})
    assert response.status_code == 404


@patch("src.api.routes.chat.get_llm")
@patch("src.api.routes.chat.faq_generate")
@patch("src.api.routes.chat.try_faq_match")
@patch("src.api.routes.chat._ds")
def test_faq_hit_yields_correct_events(mock_ds, mock_try_faq, mock_faq_gen, mock_get_llm, client):
    """FAQ path: check all expected SSE events appear and answer text is correct."""
    mock_ds.get_setting.return_value = "test_kb"
    mock_ds.get_kb.return_value = _make_valid_kb()

    faq_results = [{"faq_id": 1, "question": "开题报告什么时候交？", "answer": "第一周", "score": 0.9}]
    mock_try_faq.return_value = faq_results
    mock_faq_gen.return_value = "FAQ Answer"

    # Mock LLM for suggestion generation
    mock_llm = MagicMock()
    mock_resp = MagicMock()
    mock_resp.content = "追问1\n追问2"
    mock_llm.invoke.return_value = mock_resp
    mock_get_llm.return_value = mock_llm

    response = client.post("/api/chat", json={"query": "开题什么时候", "history": []})
    assert response.status_code == 200

    events = _parse_sse(response)
    event_types = [e["event"] for e in events]

    assert "status" in event_types
    assert "token" in event_types
    assert "answer" in event_types
    assert "sources" in event_types
    assert "done" in event_types

    # Check status steps include faq_matching and faq_answering
    status_events = [e for e in events if e["event"] == "status"]
    steps = [e["data"].get("step") for e in status_events if isinstance(e["data"], dict)]
    assert "faq_matching" in steps
    assert "faq_answering" in steps

    # Check answer event has the correct text
    answer_events = [e for e in events if e["event"] == "answer"]
    assert len(answer_events) >= 1
    assert answer_events[0]["data"]["text"] == "FAQ Answer"


@patch("src.api.routes.chat.build_orchestrator")
@patch("src.api.routes.chat.faq_generate")
@patch("src.api.routes.chat.try_faq_match")
@patch("src.api.routes.chat._ds")
def test_faq_fallback_to_rag(mock_ds, mock_try_faq, mock_faq_gen, mock_build_orch, client):
    """When faq_generate returns None (FALLBACK), the RAG path should be triggered."""
    mock_ds.get_setting.return_value = "test_kb"
    mock_ds.get_kb.return_value = _make_valid_kb()

    faq_results = [{"faq_id": 1, "question": "Q?", "answer": "A", "score": 0.85}]
    mock_try_faq.return_value = faq_results
    mock_faq_gen.return_value = None  # triggers FALLBACK to RAG

    # Build a mock orchestrator that streams agent_action and token
    mock_orchestrator = MagicMock()
    mock_orchestrator.stream.return_value = iter(
        [
            {"type": "agent_action", "tool": "search_knowledge_base", "input": "query"},
            {"type": "token", "content": "RAG response"},
            {
                "type": "sources",
                "nodes": [{"node_id": "n1", "text": "some text", "source_file": "doc.pdf", "score": 0.8}],
            },
        ]
    )
    mock_build_orch.return_value = mock_orchestrator

    response = client.post("/api/chat", json={"query": "complex question", "history": []})
    assert response.status_code == 200

    events = _parse_sse(response)
    event_types = [e["event"] for e in events]

    # Should have gone through RAG path — expect agent_action and token
    assert "agent_action" in event_types
    assert "token" in event_types
    assert "done" in event_types

    # Verify agent_action tool name
    agent_events = [e for e in events if e["event"] == "agent_action"]
    assert agent_events[0]["data"]["tool"] == "search_knowledge_base"


@patch("src.api.routes.chat.build_orchestrator")
@patch("src.api.routes.chat.try_faq_match")
@patch("src.api.routes.chat._ds")
def test_rag_path_no_faq(mock_ds, mock_try_faq, mock_build_orch, client):
    """When FAQ returns no match, go straight to RAG and check token + answer events."""
    mock_ds.get_setting.return_value = "test_kb"
    mock_ds.get_kb.return_value = _make_valid_kb()
    mock_try_faq.return_value = None  # no FAQ match

    mock_orchestrator = MagicMock()
    mock_orchestrator.stream.return_value = iter(
        [
            {"type": "token", "content": "Hello"},
            {"type": "token", "content": " World"},
            {"type": "sources", "nodes": []},
        ]
    )
    mock_build_orch.return_value = mock_orchestrator

    response = client.post("/api/chat", json={"query": "what is rag", "history": []})
    assert response.status_code == 200

    events = _parse_sse(response)

    # Should have building_retriever and running_rag status events
    status_events = [e for e in events if e["event"] == "status"]
    steps = [e["data"].get("step") for e in status_events if isinstance(e["data"], dict)]
    assert "building_retriever" in steps
    assert "running_rag" in steps

    # Check token events
    token_events = [e for e in events if e["event"] == "token"]
    assert len(token_events) == 2
    assert token_events[0]["data"]["text"] == "Hello"
    assert token_events[1]["data"]["text"] == " World"

    # Check answer is concatenated tokens
    answer_events = [e for e in events if e["event"] == "answer"]
    assert len(answer_events) >= 1
    assert answer_events[0]["data"]["text"] == "Hello World"


@patch("src.api.routes.chat.build_orchestrator")
@patch("src.api.routes.chat.try_faq_match")
@patch("src.api.routes.chat._ds")
def test_file_event_cleans_markdown_links(mock_ds, mock_try_faq, mock_build_orch, client):
    """When file events are present, markdown links in answer text should be stripped."""
    mock_ds.get_setting.return_value = "test_kb"
    mock_ds.get_kb.return_value = _make_valid_kb()
    mock_try_faq.return_value = None

    mock_orchestrator = MagicMock()
    mock_orchestrator.stream.return_value = iter(
        [
            {"type": "token", "content": "下载 [开题报告模板](http://example.com/file.docx) 使用"},
            {"type": "file", "file_name": "开题报告模板.docx", "url": "http://example.com/file.docx", "size_kb": 50},
            {"type": "sources", "nodes": []},
        ]
    )
    mock_build_orch.return_value = mock_orchestrator

    response = client.post("/api/chat", json={"query": "下载开题报告", "history": []})
    assert response.status_code == 200

    events = _parse_sse(response)

    # Check file event was emitted
    file_events = [e for e in events if e["event"] == "file"]
    assert len(file_events) == 1
    assert file_events[0]["data"]["file_name"] == "开题报告模板.docx"

    # Check answer text has markdown link cleaned: [text](url) → text
    answer_events = [e for e in events if e["event"] == "answer"]
    assert len(answer_events) >= 1
    answer_text = answer_events[0]["data"]["text"]
    # The markdown link should be removed, leaving just the link text
    assert "[" not in answer_text
    assert "](http://example.com/file.docx)" not in answer_text
    assert "开题报告模板" in answer_text


@patch("src.api.routes.chat.build_orchestrator")
@patch("src.api.routes.chat.try_faq_match")
@patch("src.api.routes.chat._ds")
def test_orchestrator_error_event(mock_ds, mock_try_faq, mock_build_orch, client):
    """When orchestrator streams an error item, SSE should emit an error event."""
    mock_ds.get_setting.return_value = "test_kb"
    mock_ds.get_kb.return_value = _make_valid_kb()
    mock_try_faq.return_value = None

    mock_orchestrator = MagicMock()
    mock_orchestrator.stream.return_value = iter(
        [
            {"type": "error", "message": "检索失败，请稍后重试"},
        ]
    )
    mock_build_orch.return_value = mock_orchestrator

    response = client.post("/api/chat", json={"query": "some question", "history": []})
    assert response.status_code == 200

    events = _parse_sse(response)
    event_types = [e["event"] for e in events]

    assert "error" in event_types
    error_events = [e for e in events if e["event"] == "error"]
    assert error_events[0]["data"]["message"] == "检索失败，请稍后重试"
