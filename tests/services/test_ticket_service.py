import pytest

from src.exceptions import DocumentNotFoundError, PermissionDeniedError
from src.services.ticket_service import TicketService


@pytest.fixture
def svc(mock_ticket_store, mock_user_store):
    return TicketService(ticket_store=mock_ticket_store, user_store=mock_user_store)


def test_create_no_mentor_raises(svc, mock_user_store):
    mock_user_store.get_student_mentor.return_value = None

    with pytest.raises(PermissionDeniedError):
        svc.create(student_id=1, conversation_id=10, message_id=100, question="help")


def test_create_success(svc, mock_ticket_store, mock_user_store):
    mock_user_store.get_student_mentor.return_value = {"id": 42}
    mock_ticket_store.create_qa_request.return_value = {"id": 7, "student_id": 1, "mentor_id": 42}

    result = svc.create(student_id=1, conversation_id=10, message_id=100, question="help")

    mock_ticket_store.create_qa_request.assert_called_once_with(
        student_id=1,
        mentor_id=42,
        conversation_id=10,
        message_id=100,
        question="help",
    )
    assert result["mentor_id"] == 42


def test_list_tickets_student(svc, mock_ticket_store):
    mock_ticket_store.list_qa_requests.return_value = []

    svc.list_tickets(role="student", user_id=5)

    mock_ticket_store.list_qa_requests.assert_called_once_with(student_id=5)


def test_list_tickets_teacher(svc, mock_ticket_store):
    mock_ticket_store.list_qa_requests.return_value = []

    svc.list_tickets(role="teacher", user_id=9)

    mock_ticket_store.list_qa_requests.assert_called_once_with(mentor_id=9)


def test_list_tickets_admin(svc, mock_ticket_store):
    mock_ticket_store.list_qa_requests.return_value = []

    svc.list_tickets(role="admin", user_id=1)

    mock_ticket_store.list_qa_requests.assert_called_once_with()


def test_get_not_found(svc, mock_ticket_store):
    mock_ticket_store.get_qa_request.return_value = None

    with pytest.raises(DocumentNotFoundError):
        svc.get(ticket_id=99, role="admin", user_id=1)


def test_get_student_access_other_ticket(svc, mock_ticket_store):
    mock_ticket_store.get_qa_request.return_value = {"id": 1, "student_id": 2, "mentor_id": 10}

    with pytest.raises(PermissionDeniedError):
        svc.get(ticket_id=1, role="student", user_id=99)


def test_get_teacher_access_other_ticket(svc, mock_ticket_store):
    mock_ticket_store.get_qa_request.return_value = {"id": 1, "student_id": 2, "mentor_id": 10}

    with pytest.raises(PermissionDeniedError):
        svc.get(ticket_id=1, role="teacher", user_id=99)


def test_reply_not_found(svc, mock_ticket_store):
    mock_ticket_store.get_qa_request.return_value = None

    with pytest.raises(DocumentNotFoundError):
        svc.reply(ticket_id=99, answer="ans", user_id=1, role="admin")


def test_reply_teacher_wrong_ticket(svc, mock_ticket_store):
    mock_ticket_store.get_qa_request.return_value = {"id": 1, "student_id": 3, "mentor_id": 10}

    with pytest.raises(PermissionDeniedError):
        svc.reply(ticket_id=1, answer="ans", user_id=99, role="teacher")


def test_reply_success(svc, mock_ticket_store):
    ticket = {"id": 1, "student_id": 3, "mentor_id": 10}
    updated = {**ticket, "answer": "ok", "status": "replied"}
    mock_ticket_store.get_qa_request.return_value = ticket
    mock_ticket_store.update_qa_request.return_value = updated

    result = svc.reply(ticket_id=1, answer="ok", user_id=10, role="teacher")

    mock_ticket_store.update_qa_request.assert_called_once_with(1, answer="ok", status="replied")
    assert result["status"] == "replied"


def test_close_not_found(svc, mock_ticket_store):
    mock_ticket_store.get_qa_request.return_value = None

    with pytest.raises(DocumentNotFoundError):
        svc.close(ticket_id=99, role="student", user_id=1)


def test_close_success(svc, mock_ticket_store):
    ticket = {"id": 1, "student_id": 5, "mentor_id": 10, "answer": "prev"}
    updated = {**ticket, "status": "closed"}
    mock_ticket_store.get_qa_request.return_value = ticket
    mock_ticket_store.update_qa_request.return_value = updated

    result = svc.close(ticket_id=1, role="student", user_id=5)

    mock_ticket_store.update_qa_request.assert_called_once_with(1, answer="prev", status="closed")
    assert result["status"] == "closed"
