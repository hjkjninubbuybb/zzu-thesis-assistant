"""向后兼容 shim — 实现已移至 src.services.user_import。"""

from src.services.user_import import (  # noqa: F401
    build_relations_template_workbook,
    build_student_workbook,
    build_teacher_workbook,
    random_password,
    workbook_to_bytes,
)
