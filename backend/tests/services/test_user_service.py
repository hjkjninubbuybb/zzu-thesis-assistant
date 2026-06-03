import pytest

from src.exceptions import UserNotFoundError
from src.services.user_service import UserService


@pytest.fixture
def svc(mock_user_store):
    return UserService(user_store=mock_user_store)


def test_get_user_not_found(svc, mock_user_store):
    mock_user_store.get_user_by_id.return_value = None

    with pytest.raises(UserNotFoundError):
        svc.get_user(99)


def test_get_user_success(svc, mock_user_store):
    mock_user_store.get_user_by_id.return_value = {"id": 1, "username": "alice"}

    result = svc.get_user(1)

    assert result["username"] == "alice"


def test_update_user_not_found(svc, mock_user_store):
    mock_user_store.get_user_by_id.return_value = None

    with pytest.raises(UserNotFoundError):
        svc.update_user(99, display_name="X")


def test_update_user_success(svc, mock_user_store):
    original = {"id": 1, "display_name": "old"}
    updated = {"id": 1, "display_name": "new"}
    mock_user_store.get_user_by_id.return_value = original
    mock_user_store.update_user.return_value = updated

    result = svc.update_user(1, display_name="new")

    mock_user_store.update_user.assert_called_once_with(1, display_name="new")
    assert result["display_name"] == "new"


def test_delete_user_not_found(svc, mock_user_store):
    mock_user_store.get_user_by_id.return_value = None

    with pytest.raises(UserNotFoundError):
        svc.delete_user(99)


def test_delete_user_success(svc, mock_user_store):
    mock_user_store.get_user_by_id.return_value = {"id": 2}

    svc.delete_user(2)

    mock_user_store.delete_user.assert_called_once_with(2)


def test_add_login_log_success(svc, mock_user_store):
    svc.add_login_log(1, ip_addr="127.0.0.1", user_agent="Mozilla")

    mock_user_store.add_login_log.assert_called_once_with(1, "127.0.0.1", "Mozilla")


def test_add_login_log_silences_exception(svc, mock_user_store):
    mock_user_store.add_login_log.side_effect = RuntimeError("db down")

    svc.add_login_log(1)


def test_get_profile_student(svc, mock_user_store):
    mock_user_store.get_student_profile.return_value = {"student_id": "s001"}

    result = svc.get_profile({"id": 5, "role": "student"})

    mock_user_store.get_student_profile.assert_called_once_with(5)
    assert result["student_id"] == "s001"


def test_get_profile_teacher(svc, mock_user_store):
    mock_user_store.get_teacher_profile.return_value = {"employee_id": "t001"}

    result = svc.get_profile({"id": 6, "role": "teacher"})

    mock_user_store.get_teacher_profile.assert_called_once_with(6)
    assert result["employee_id"] == "t001"


def test_get_profile_unknown_role(svc, mock_user_store):
    result = svc.get_profile({"id": 7, "role": "guest"})

    assert result is None
    mock_user_store.get_student_profile.assert_not_called()
    mock_user_store.get_teacher_profile.assert_not_called()
