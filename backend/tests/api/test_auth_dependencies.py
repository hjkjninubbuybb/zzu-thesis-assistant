"""auth 依赖单测：require_teacher。"""

import pytest
from fastapi import HTTPException

from src.api.auth import require_teacher


def test_require_teacher_passes_for_teacher():
    user = {"id": 1, "role": "teacher", "is_active": True}
    result = require_teacher(current_user=user)
    assert result is user


def test_require_teacher_rejects_admin():
    user = {"id": 1, "role": "admin", "is_active": True}
    with pytest.raises(HTTPException) as exc:
        require_teacher(current_user=user)
    assert exc.value.status_code == 403


def test_require_teacher_rejects_student():
    user = {"id": 1, "role": "student", "is_active": True}
    with pytest.raises(HTTPException) as exc:
        require_teacher(current_user=user)
    assert exc.value.status_code == 403
