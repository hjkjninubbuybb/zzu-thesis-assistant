"""文档服务的共享常量。"""

from pathlib import Path

# 上传文件大小上限（10 MB）
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# 原始文件持久化目录：data/uploads/{kb_name}/{doc_id}_{filename}
UPLOADS_DIR = Path(__file__).parents[3] / "data" / "uploads"
