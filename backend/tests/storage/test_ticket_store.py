"""Integration tests for TicketStore mentor-scoped aggregation methods."""

import pytest

# ── 导师工作台聚合查询 ─────────────────────────────────────


@pytest.mark.integration
class TestMentorAggregations:
    """新增导师工作台所需的聚合方法（依赖真实 MySQL）。"""

    def test_count_pending_returns_zero_when_no_tickets(self, ticket_store, mentor_with_student):
        mentor_id, _student_id, _conv_id, _msg_id = mentor_with_student
        assert ticket_store.count_pending_by_mentor(mentor_id) == 0

    def test_count_pending_counts_only_pending_status(self, ticket_store, mentor_with_student):
        mentor_id, student_id, conv_id, msg_id = mentor_with_student
        ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q1")
        t2 = ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q2")
        ticket_store.update_qa_request(t2["id"], "ans", status="replied")
        t3 = ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q3")
        ticket_store.update_qa_request(t3["id"], "ans", status="closed")

        assert ticket_store.count_pending_by_mentor(mentor_id) == 1

    def test_recent_events_returns_in_reverse_time_order(self, ticket_store, mentor_with_student):
        mentor_id, student_id, conv_id, msg_id = mentor_with_student
        ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q-A")
        b = ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q-B")
        ticket_store.update_qa_request(b["id"], "ans-B", status="replied")

        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=10)
        assert len(events) >= 2
        for i in range(len(events) - 1):
            assert events[i]["occurred_at"] >= events[i + 1]["occurred_at"]

    def test_recent_events_respects_limit(self, ticket_store, mentor_with_student):
        mentor_id, student_id, conv_id, msg_id = mentor_with_student
        for i in range(5):
            ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, f"Q-{i}")
        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=3)
        assert len(events) == 3

    def test_recent_events_only_own_mentor(self, ticket_store, two_mentors_with_students):
        m1, s1, c1, msg1, m2, s2, c2, msg2 = two_mentors_with_students
        ticket_store.create_qa_request(s1, m1, c1, msg1, "Q-from-mentor1-student")
        ticket_store.create_qa_request(s2, m2, c2, msg2, "Q-from-mentor2-student")

        m1_events = ticket_store.list_recent_events_by_mentor(m1, limit=10)
        assert all(e["student_id"] == s1 for e in m1_events)

    def test_recent_events_event_types(self, ticket_store, mentor_with_student):
        mentor_id, student_id, conv_id, msg_id = mentor_with_student
        t = ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q-event-type")
        ticket_store.update_qa_request(t["id"], "ans", status="replied")

        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=10)
        event_types = {e["event_type"] for e in events}
        assert "ticket_created" in event_types
        assert "ticket_replied" in event_types

    def test_recent_events_ticket_title_truncated(self, ticket_store, mentor_with_student):
        mentor_id, student_id, conv_id, msg_id = mentor_with_student
        long_question = "A" * 100
        ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, long_question)

        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=10)
        assert all(len(e["ticket_title"]) <= 60 for e in events)

    def test_recent_events_contains_student_name(self, ticket_store, mentor_with_student):
        mentor_id, student_id, conv_id, msg_id = mentor_with_student
        ticket_store.create_qa_request(student_id, mentor_id, conv_id, msg_id, "Q-name")

        events = ticket_store.list_recent_events_by_mentor(mentor_id, limit=10)
        assert len(events) >= 1
        assert events[0]["student_name"] == "测试学生"
