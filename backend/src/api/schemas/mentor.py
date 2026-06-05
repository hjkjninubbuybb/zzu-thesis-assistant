"""导师工作台响应模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class WeeklyActivityBucket(BaseModel):
    student_id: int
    display_name: str
    count: int


class SilentStudentItem(BaseModel):
    id: int
    display_name: str
    username: str
    last_active_at: datetime | None
    days_silent: int


class MentorRecentEventItem(BaseModel):
    event_type: Literal["ticket_created", "ticket_replied", "ticket_closed"]
    student_id: int
    student_name: str
    ticket_id: int
    ticket_title: str
    occurred_at: datetime


class MentorOverviewResponse(BaseModel):
    pending_tickets: int
    weekly_activity: list[WeeklyActivityBucket]
    silent_students: list[SilentStudentItem]
    recent_events: list[MentorRecentEventItem]
