"""Unit tests for the chat SSE endpoint in src/api/routes/chat.py."""

import json
from unittest.mock import MagicMock

import pytest
from starlette.testclient import TestClient

from src.api.app import app
from src.api.auth import get_current_user
from src.api.deps import get_chat_service
from src.exceptions import KnowledgeBaseNotFoundError


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


def _make_mock_service(kb_name: str | None = "test_kb", stream_events: list | None = None):
    """Create a mock ChatService with configurable behavior.

    Args:
        kb_name: Return value of resolve_kb_name (None raises KnowledgeBaseNotFoundError).
        stream_events: List of event dicts yielded by stream_response.

    Returns:
        Mock ChatService instance.
    """
    svc = MagicMock()
    if kb_name is None:
        svc.resolve_kb_name.side_effect = KnowledgeBaseNotFoundError("知识库未配置")
    else:
        svc.resolve_kb_name.return_value = kb_name

    async def _fake_stream(**_kwargs):
        for ev in stream_events or []:
            # 与真实 _evt() 保持一致：data 序列化为 JSON 字符串
            data = ev.get("data", {})
            yield {
                "event": ev["event"],
                "data": json.dumps(data, ensure_ascii=False) if isinstance(data, (dict, list)) else data,
            }

    svc.stream_response = _fake_stream
    return svc


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
    return TestClient(app)


def test_no_kb_configured_returns_404(client):
    """When KB is not configured, resolve_kb_name raises → expect 404."""
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(kb_name=None)
    try:
        response = client.post("/api/chat", json={"query": "test", "history": []})
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_chat_service, None)


def test_stream_events_passed_through(client):
    """SSE events yielded by ChatService.stream_response are forwarded to client."""
    events_to_yield = [
        {"event": "status", "data": {"step": "faq_matching"}},
        {"event": "token", "data": {"text": "Hello"}},
        {"event": "answer", "data": {"text": "Hello"}},
        {"event": "sources", "data": []},
        {"event": "done", "data": {}},
    ]
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(stream_events=events_to_yield)
    try:
        response = client.post("/api/chat", json={"query": "test", "history": []})
        assert response.status_code == 200

        parsed = _parse_sse(response)
        event_types = [e["event"] for e in parsed]
        assert "status" in event_types
        assert "token" in event_types
        assert "answer" in event_types
        assert "done" in event_types
    finally:
        app.dependency_overrides.pop(get_chat_service, None)


def test_faq_status_events(client):
    """FAQ path: status steps include faq_matching and faq_answering."""
    events_to_yield = [
        {"event": "status", "data": {"step": "faq_matching"}},
        {"event": "status", "data": {"step": "faq_answering"}},
        {"event": "token", "data": {"text": "FAQ Answer"}},
        {"event": "answer", "data": {"text": "FAQ Answer"}},
        {"event": "sources", "data": []},
        {"event": "done", "data": {}},
    ]
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(stream_events=events_to_yield)
    try:
        response = client.post("/api/chat", json={"query": "开题什么时候", "history": []})
        assert response.status_code == 200

        parsed = _parse_sse(response)
        status_events = [e for e in parsed if e["event"] == "status"]
        steps = [e["data"].get("step") for e in status_events if isinstance(e["data"], dict)]
        assert "faq_matching" in steps
        assert "faq_answering" in steps

        answer_events = [e for e in parsed if e["event"] == "answer"]
        assert len(answer_events) >= 1
        assert answer_events[0]["data"]["text"] == "FAQ Answer"
    finally:
        app.dependency_overrides.pop(get_chat_service, None)


def test_rag_token_events(client):
    """RAG path: token events are streamed and answer is concatenated."""
    events_to_yield = [
        {"event": "status", "data": {"step": "building_retriever"}},
        {"event": "status", "data": {"step": "running_rag"}},
        {"event": "token", "data": {"text": "Hello"}},
        {"event": "token", "data": {"text": " World"}},
        {"event": "sources", "data": []},
        {"event": "answer", "data": {"text": "Hello World"}},
        {"event": "done", "data": {}},
    ]
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(stream_events=events_to_yield)
    try:
        response = client.post("/api/chat", json={"query": "what is rag", "history": []})
        assert response.status_code == 200

        parsed = _parse_sse(response)
        status_events = [e for e in parsed if e["event"] == "status"]
        steps = [e["data"].get("step") for e in status_events if isinstance(e["data"], dict)]
        assert "building_retriever" in steps
        assert "running_rag" in steps

        token_events = [e for e in parsed if e["event"] == "token"]
        assert len(token_events) == 2
        assert token_events[0]["data"]["text"] == "Hello"
        assert token_events[1]["data"]["text"] == " World"

        answer_events = [e for e in parsed if e["event"] == "answer"]
        assert answer_events[0]["data"]["text"] == "Hello World"
    finally:
        app.dependency_overrides.pop(get_chat_service, None)


def test_agent_action_event(client):
    """agent_action events are forwarded from ChatService to SSE stream."""
    events_to_yield = [
        {"event": "agent_action", "data": {"tool": "search_knowledge_base", "input": "query"}},
        {"event": "token", "data": {"text": "RAG response"}},
        {"event": "sources", "data": []},
        {"event": "answer", "data": {"text": "RAG response"}},
        {"event": "done", "data": {}},
    ]
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(stream_events=events_to_yield)
    try:
        response = client.post("/api/chat", json={"query": "complex question", "history": []})
        assert response.status_code == 200

        parsed = _parse_sse(response)
        agent_events = [e for e in parsed if e["event"] == "agent_action"]
        assert len(agent_events) >= 1
        assert agent_events[0]["data"]["tool"] == "search_knowledge_base"
    finally:
        app.dependency_overrides.pop(get_chat_service, None)


def test_file_event_forwarded(client):
    """File events yielded by ChatService are forwarded to the SSE stream."""
    events_to_yield = [
        {"event": "token", "data": {"text": "下载开题报告模板使用"}},
        {
            "event": "file",
            "data": {"file_name": "开题报告模板.docx", "url": "http://example.com/file.docx", "size_kb": 50},
        },
        {"event": "sources", "data": []},
        {"event": "answer", "data": {"text": "下载开题报告模板使用"}},
        {"event": "done", "data": {}},
    ]
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(stream_events=events_to_yield)
    try:
        response = client.post("/api/chat", json={"query": "下载开题报告", "history": []})
        assert response.status_code == 200

        parsed = _parse_sse(response)
        file_events = [e for e in parsed if e["event"] == "file"]
        assert len(file_events) == 1
        assert file_events[0]["data"]["file_name"] == "开题报告模板.docx"
    finally:
        app.dependency_overrides.pop(get_chat_service, None)


def test_error_event_forwarded(client):
    """Error events yielded by ChatService are forwarded to the SSE stream."""
    events_to_yield = [
        {"event": "error", "data": {"message": "检索失败，请稍后重试"}},
    ]
    app.dependency_overrides[get_chat_service] = lambda: _make_mock_service(stream_events=events_to_yield)
    try:
        response = client.post("/api/chat", json={"query": "some question", "history": []})
        assert response.status_code == 200

        parsed = _parse_sse(response)
        error_events = [e for e in parsed if e["event"] == "error"]
        assert len(error_events) >= 1
        assert error_events[0]["data"]["message"] == "检索失败，请稍后重试"
    finally:
        app.dependency_overrides.pop(get_chat_service, None)
