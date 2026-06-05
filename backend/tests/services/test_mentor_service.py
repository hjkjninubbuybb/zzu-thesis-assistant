"""MentorService 单测：mock 各 store，测业务编排与越权。"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest

from src.exceptions import PermissionDeniedError
from src.services.mentor_service import MentorService


@pytest.fixture
def mocks():
    return {
        "user": MagicMock(),
        "ticket": MagicMock(),
    }


@pytest.fixture
def svc(mocks):
    return MentorService(
        user_store=mocks["user"],
        ticket_store=mocks["ticket"],
    )


class TestGetOverview:
    def test_composes_all_fields(self, svc, mocks):
        mocks["ticket"].count_pending_by_mentor.return_value = 3
        mocks["user"].list_weekly_activity_for_mentor.return_value = [
            {"student_id": 10, "display_name": "S1", "count": 5},
        ]
        mocks["user"].list_silent_students_for_mentor.return_value = [
            {
                "id": 11,
                "display_name": "S2",
                "username": "s2",
                "last_active_at": None,
                "days_silent": 9999,
            },
        ]
        mocks["ticket"].list_recent_events_by_mentor.return_value = [
            {
                "event_type": "ticket_created",
                "student_id": 10,
                "student_name": "S1",
                "ticket_id": 1,
                "ticket_title": "Hello",
                "occurred_at": datetime(2026, 6, 4, 10, 0),
            },
        ]

        result = svc.get_overview(mentor_id=99)

        assert result["pending_tickets"] == 3
        assert len(result["weekly_activity"]) == 1
        assert len(result["silent_students"]) == 1
        assert len(result["recent_events"]) == 1

    def test_uses_constants(self, svc, mocks):
        mocks["ticket"].count_pending_by_mentor.return_value = 0
        mocks["user"].list_weekly_activity_for_mentor.return_value = []
        mocks["user"].list_silent_students_for_mentor.return_value = []
        mocks["ticket"].list_recent_events_by_mentor.return_value = []

        svc.get_overview(mentor_id=1)

        mocks["user"].list_silent_students_for_mentor.assert_called_once_with(
            1, days_threshold=MentorService.SILENT_DAYS_THRESHOLD
        )
        mocks["ticket"].list_recent_events_by_mentor.assert_called_once_with(
            1, limit=MentorService.RECENT_EVENTS_LIMIT
        )

    def test_empty_when_no_data(self, svc, mocks):
        mocks["ticket"].count_pending_by_mentor.return_value = 0
        mocks["user"].list_weekly_activity_for_mentor.return_value = []
        mocks["user"].list_silent_students_for_mentor.return_value = []
        mocks["ticket"].list_recent_events_by_mentor.return_value = []

        result = svc.get_overview(mentor_id=1)
        assert result == {
            "pending_tickets": 0,
            "weekly_activity": [],
            "silent_students": [],
            "recent_events": [],
        }


class TestListMyStudents:
    def test_delegates_to_user_store(self, svc, mocks):
        mocks["user"].list_mentor_students.return_value = [{"id": 1}, {"id": 2}]
        result = svc.list_my_students(mentor_id=99)
        mocks["user"].list_mentor_students.assert_called_once_with(99)
        assert result == [{"id": 1}, {"id": 2}]


class TestEnsureOwnsStudent:
    def test_raises_when_student_belongs_to_other_mentor(self, svc, mocks):
        mocks["user"].get_student_mentor.return_value = {"id": 999}
        with pytest.raises(PermissionDeniedError):
            svc.ensure_owns_student(mentor_id=1, student_id=42)

    def test_passes_when_student_is_owned(self, svc, mocks):
        mocks["user"].get_student_mentor.return_value = {"id": 7}
        svc.ensure_owns_student(mentor_id=7, student_id=42)  # should not raise

    def test_raises_when_student_has_no_mentor(self, svc, mocks):
        mocks["user"].get_student_mentor.return_value = None
        with pytest.raises(PermissionDeniedError):
            svc.ensure_owns_student(mentor_id=1, student_id=42)
