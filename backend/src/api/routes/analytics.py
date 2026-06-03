"""使用统计接口（仅 admin / teacher 可访问）。"""

from fastapi import APIRouter, Depends

from src.api.auth import require_teacher_or_admin
from src.api.deps import get_analytics_service
from src.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
def get_summary(
    _current_user: dict = Depends(require_teacher_or_admin),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    """返回系统使用统计汇总。"""
    return analytics_service.get_summary()
