"""系统配置接口（4 组 API 凭据 + 其他参数）。"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import require_admin
from src.api.deps import get_config_service
from src.api.schemas.config import (
    ApiInfoResponse,
    ConfigUpdate,
    TestConnectionResponse,
)
from src.services.config_service import ConfigService

router = APIRouter(prefix="/api/config", tags=["config"])
logger = logging.getLogger(__name__)


@router.get("/api-info", response_model=ApiInfoResponse)
def get_api_info(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return svc.get_api_info()


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return await svc.test_all_connections()


@router.get("")
def read_config(
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    return svc.read_config()


@router.post("")
def update_config(
    body: ConfigUpdate,
    _current_user: dict = Depends(require_admin),
    svc: ConfigService = Depends(get_config_service),
) -> dict:
    try:
        return svc.update_config(body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
