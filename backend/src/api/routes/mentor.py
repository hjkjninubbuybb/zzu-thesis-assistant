"""导师工作台路由 — 仅 teacher 角色可访问。"""

import asyncio
import logging

from fastapi import APIRouter, Depends

from src.api.auth import require_teacher
from src.api.deps import get_mentor_service
from src.api.schemas import MentorOverviewResponse, UserInfo
from src.services.mentor_service import MentorService

router = APIRouter(prefix="/api/mentors", tags=["mentor"])
logger = logging.getLogger(__name__)


@router.get("/me/overview", response_model=MentorOverviewResponse)
async def get_my_overview(
    current_user: dict = Depends(require_teacher),
    svc: MentorService = Depends(get_mentor_service),
):
    """导师首页聚合接口。"""
    return await asyncio.to_thread(svc.get_overview, current_user["id"])


@router.get("/me/students", response_model=list[UserInfo])
async def list_my_students(
    current_user: dict = Depends(require_teacher),
    svc: MentorService = Depends(get_mentor_service),
):
    """当前导师名下的学生列表。"""
    return await asyncio.to_thread(svc.list_my_students, current_user["id"])
