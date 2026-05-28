"""用户管理路由（管理员/教师用）：学生账号 CRUD、档案管理。"""

import logging
import urllib.parse
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from src.api.auth import get_current_user, hash_password, require_admin, require_teacher_or_admin
from src.api.deps import get_user_service
from src.api.schemas import (
    MentorRelationRequest,
    MessageResponse,
    PaginatedUsers,
    ResetPasswordRequest,
    UpdateProfileRequest,
    UserCreate,
    UserInfo,
    UserUpdate,
)
from src.exceptions import UserNotFoundError
from src.services.user_import import (
    build_relations_template_workbook,
    build_student_workbook,
    build_teacher_workbook,
    random_password,
    workbook_to_bytes,
)
from src.services.user_service import UserService

router = APIRouter(prefix="/api/users", tags=["users"])
logger = logging.getLogger(__name__)


_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_response(wb: object, filename: str) -> Response:
    encoded = urllib.parse.quote(filename)
    return Response(
        content=workbook_to_bytes(wb),  # type: ignore[arg-type]
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


def _to_user_info(user: dict, profile: dict | None = None) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "is_active": bool(user["is_active"]),
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
        "profile": profile,
    }


@router.get("", response_model=PaginatedUsers)
def list_users(
    role: str | None = Query(default=None, pattern=r"^(admin|teacher|student)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(require_teacher_or_admin),
    svc: UserService = Depends(get_user_service),
):
    """列出用户（分页）。教师只能看学生；管理员看所有。"""
    effective_role = role
    if current_user["role"] == "teacher":
        if role not in (None, "student"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="教师只能查看学生账号")
        effective_role = "student"

    items, total = svc.list_users(role=effective_role, page=page, page_size=page_size)
    return {
        "items": [_to_user_info(u, svc.get_profile(u)) for u in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """创建用户（管理员专用）。"""
    if svc.get_user_by_username(body.username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"用户名 '{body.username}' 已存在")
    user = svc.create_user(
        username=body.username,
        hashed_pwd=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
    )
    return _to_user_info(user)


@router.get("/{user_id}", response_model=UserInfo)
def get_user(
    user_id: int,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: UserService = Depends(get_user_service),
):
    """获取用户详情（含档案）。"""
    try:
        user = svc.get_user(user_id)
    except UserNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _to_user_info(user, svc.get_profile(user))


@router.put("/{user_id}", response_model=UserInfo)
def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """更新用户基本信息（管理员专用）。"""
    updates = body.model_dump(exclude_none=True)
    try:
        user = svc.update_user(user_id, **updates) if updates else svc.get_user(user_id)
    except UserNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _to_user_info(user, svc.get_profile(user))


@router.put("/{user_id}/profile")
def update_profile(
    user_id: int,
    body: UpdateProfileRequest,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: UserService = Depends(get_user_service),
):
    """更新用户档案（学生档案或教师档案）。"""
    try:
        user = svc.get_user(user_id)
    except UserNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    if user["role"] == "student" and body.student_profile:
        sp = body.student_profile
        profile = svc.upsert_student_profile(user_id, sp.student_id, sp.grade, sp.major, sp.class_name)
        return {"message": "学生档案更新成功", "profile": profile}

    if user["role"] in ("teacher", "admin") and body.teacher_profile:
        tp = body.teacher_profile
        profile = svc.upsert_teacher_profile(user_id, tp.employee_id, tp.department, tp.title)
        return {"message": "教师档案更新成功", "profile": profile}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="档案类型与用户角色不匹配")


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """删除用户（管理员专用，不能删除自己）。"""
    if user_id == current_user["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除自己的账号")
    try:
        user = svc.get_user(user_id)
        svc.delete_user(user_id)
    except UserNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return {"message": f"用户 '{user['username']}' 已删除"}


@router.put("/{user_id}/reset-password", response_model=MessageResponse)
def reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """重置用户密码（管理员专用）。"""
    try:
        svc.update_user(user_id, hashed_pwd=hash_password(body.new_password))
    except UserNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return {"message": "密码重置成功"}


# ── Excel 导入/导出 ───────────────────────────────────────────


@router.get("/students/template")
def download_student_template(current_user: dict = Depends(require_teacher_or_admin)):
    """下载学生批量导入模板。"""
    wb = build_student_workbook(rows=None)
    return _xlsx_response(wb, "学生账号导入模板.xlsx")


@router.get("/students/export")
def export_students_excel(
    current_user: dict = Depends(require_teacher_or_admin),
    svc: UserService = Depends(get_user_service),
):
    """导出所有学生账号为 Excel。"""
    rows = svc.export_students()
    filename = f"学生账号_{date.today().strftime('%Y%m%d')}.xlsx"
    return _xlsx_response(build_student_workbook(rows), filename)


@router.post("/students/import")
async def import_students_excel(
    file: UploadFile = File(...),
    default_password: str = Form(default=""),
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
) -> dict:
    """从 Excel 批量导入学生账号（管理员专用）。

    - 用户名或学号已存在的行自动跳过
    - 密码列留空时使用 default_password 参数，仍为空则随机生成 10 位
    """
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 格式")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件过大，请控制在 5MB 以内")
    try:
        return svc.import_students_from_xlsx(content, default_password, hash_password, random_password)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.get("/mentors/relations/template")
def download_relations_template(current_user: dict = Depends(require_teacher_or_admin)):
    """下载师生关系批量导入模板。"""
    wb = build_relations_template_workbook()
    return _xlsx_response(wb, "师生关系导入模板.xlsx")


@router.post("/mentors/relations/import")
async def import_mentor_relations(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
) -> dict:
    """从 Excel 批量导入师生关系（管理员专用）。"""
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 格式")
    content = await file.read()
    try:
        return svc.import_mentor_relations_from_xlsx(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


# ── 教师账号 Excel 导入/导出 ──────────────────────────────────


@router.get("/teachers/template")
def download_teacher_template(current_user: dict = Depends(require_admin)):
    """下载教师批量导入模板。"""
    wb = build_teacher_workbook(rows=None)
    return _xlsx_response(wb, "教师账号导入模板.xlsx")


@router.get("/teachers/export")
def export_teachers_excel(
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """导出所有教师账号。"""
    rows = svc.export_teachers()
    filename = f"教师账号_{date.today().strftime('%Y%m%d')}.xlsx"
    return _xlsx_response(build_teacher_workbook(rows), filename)


@router.post("/teachers/import")
async def import_teachers_excel(
    file: UploadFile = File(...),
    default_password: str = Form(default=""),
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
) -> dict:
    """从 Excel 批量导入教师账号（管理员专用）。"""
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 格式")
    content = await file.read()
    try:
        return svc.import_teachers_from_xlsx(content, default_password, hash_password, random_password)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


# ── 师生关系管理 ──────────────────────────────────────────────


@router.get("/mentors/{mentor_id}/students", response_model=list[UserInfo])
def list_mentor_students(
    mentor_id: int,
    current_user: dict = Depends(require_teacher_or_admin),
    svc: UserService = Depends(get_user_service),
):
    """列出指定导师名下的学生。"""
    if current_user["role"] == "teacher" and current_user["id"] != mentor_id:
        raise HTTPException(status_code=403, detail="无权查看其他导师的学生")
    students = svc.list_mentor_students(mentor_id)
    return [
        _to_user_info(
            u,
            {
                "student_id": u["student_id"],
                "grade": u["grade"],
                "major": u["major"],
                "class_name": u["class_name"],
            },
        )
        for u in students
    ]


@router.post("/mentors/relations", response_model=MessageResponse)
def add_mentor_relations(
    body: MentorRelationRequest,
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """批量绑定师生关系（管理员专用）。"""
    try:
        mentor_user = svc.get_user(body.mentor_id)
    except UserNotFoundError:
        raise HTTPException(status_code=400, detail="指定导师不存在")
    if mentor_user["role"] != "teacher":
        raise HTTPException(status_code=400, detail="指定的导师 ID 无效或非教师角色")
    for sid in body.student_ids:
        svc.add_mentor_relation(body.mentor_id, sid)
    return {"message": f"成功为导师 {mentor_user['display_name']} 绑定 {len(body.student_ids)} 名学生"}


@router.delete("/mentors/{mentor_id}/students/{student_id}", response_model=MessageResponse)
def remove_mentor_relation(
    mentor_id: int,
    student_id: int,
    current_user: dict = Depends(require_admin),
    svc: UserService = Depends(get_user_service),
):
    """解除师生关系（管理员专用）。"""
    svc.remove_mentor_relation(mentor_id, student_id)
    return {"message": "解绑成功"}


@router.get("/me/mentor", response_model=UserInfo)
def get_my_mentor(
    current_user: dict = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
):
    """获取我的指导教师（学生专用）。"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=400, detail="该接口仅供学生使用")
    mentor = svc.get_student_mentor(current_user["id"])
    if not mentor:
        raise HTTPException(status_code=404, detail="您尚未分配指导教师")
    return _to_user_info(
        mentor,
        {
            "employee_id": mentor["employee_id"],
            "department": mentor["department"],
            "title": mentor["title"],
        },
    )
