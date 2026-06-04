"""用户相关请求/响应模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=6, max_length=64)
    display_name: str = Field(default="", max_length=64)
    role: Literal["admin", "teacher", "student"] = "student"


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    profile: dict | None = None


class PaginatedUsers(BaseModel):
    items: list[UserInfo]
    total: int
    page: int
    page_size: int


class MentorRelationRequest(BaseModel):
    mentor_id: int
    student_ids: list[int]


class StudentProfileCreate(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=20)
    grade: str = Field(default="", max_length=10)
    major: str = Field(default="", max_length=64)
    class_name: str = Field(default="", max_length=32)


class TeacherProfileCreate(BaseModel):
    employee_id: str = Field(..., min_length=1, max_length=20)
    department: str = Field(default="", max_length=64)
    title: str = Field(default="", max_length=32)


class UpdateProfileRequest(BaseModel):
    student_profile: StudentProfileCreate | None = None
    teacher_profile: TeacherProfileCreate | None = None
