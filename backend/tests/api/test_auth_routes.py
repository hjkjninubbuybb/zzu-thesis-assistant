"""认证路由集成测试。"""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from src.api.app import app
from src.api.auth import get_current_user
from src.api.deps import get_user_service


def test_put_me_updates_display_name():
    user = {"id": 5, "role": "teacher", "is_active": True, "username": "t", "display_name": "Old"}
    svc = MagicMock()
    svc.update_self_profile.return_value = {
        "id": 5,
        "username": "t",
        "display_name": "New",
        "role": "teacher",
        "is_active": True,
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
    }
    svc.get_profile.return_value = None
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_user_service] = lambda: svc
    try:
        c = TestClient(app)
        r = c.put("/api/auth/me", json={"display_name": "New"})
        assert r.status_code == 200
        assert r.json()["display_name"] == "New"
        svc.update_self_profile.assert_called_once_with(5, "New")
    finally:
        app.dependency_overrides.clear()
