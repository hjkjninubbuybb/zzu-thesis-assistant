"""mentor routes 集成测：用 dependency_overrides 替换 service。"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.api.auth import get_current_user
from src.api.deps import get_mentor_service


@pytest.fixture
def teacher_user():
    return {"id": 99, "role": "teacher", "is_active": True, "username": "t", "display_name": "T"}


@pytest.fixture
def admin_user():
    return {"id": 1, "role": "admin", "is_active": True, "username": "a", "display_name": "A"}


@pytest.fixture
def mock_svc():
    svc = MagicMock()
    svc.get_overview.return_value = {
        "pending_tickets": 3,
        "weekly_activity": [],
        "silent_students": [],
        "recent_events": [],
    }
    svc.list_my_students.return_value = []
    return svc


@pytest.fixture
def client(teacher_user, mock_svc):
    app.dependency_overrides[get_current_user] = lambda: teacher_user
    app.dependency_overrides[get_mentor_service] = lambda: mock_svc
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_overview_returns_200_for_teacher(client, mock_svc):
    r = client.get("/api/mentors/me/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["pending_tickets"] == 3
    mock_svc.get_overview.assert_called_once_with(99)


def test_overview_returns_403_for_admin(admin_user, mock_svc):
    app.dependency_overrides[get_current_user] = lambda: admin_user
    app.dependency_overrides[get_mentor_service] = lambda: mock_svc
    c = TestClient(app)
    r = c.get("/api/mentors/me/overview")
    assert r.status_code == 403
    app.dependency_overrides.clear()


def test_students_returns_200_for_teacher(client, mock_svc):
    mock_svc.list_my_students.return_value = [
        {
            "id": 10,
            "username": "s1",
            "display_name": "S1",
            "role": "student",
            "is_active": True,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "profile": None,
        }
    ]
    r = client.get("/api/mentors/me/students")
    assert r.status_code == 200
    assert len(r.json()) == 1
    mock_svc.list_my_students.assert_called_once_with(99)
