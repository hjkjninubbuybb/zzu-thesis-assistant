"""FAQ CRUD 路由。"""

import asyncio
import io
import logging
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi import Query as QueryParam
from fastapi.responses import StreamingResponse
from openpyxl import load_workbook

from src.api.auth import get_current_user, require_teacher_or_admin
from src.api.schemas import (
    FAQCreate,
    FAQImportError,
    FAQImportResult,
    FAQItem,
    FAQSearchResponse,
    FAQUpdate,
    MessageResponse,
)
from src.core.faq_match import rewrite_query as _rewrite_query
from src.core.faq_service import (
    batch_embed_and_upsert,
    build_faq_workbook,
    make_xlsx_response,
    parse_faq_sheet,
    upsert_faq_vector,
)
from src.core.rag.embedding import get_embed_model
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faq", tags=["faq"])

_doc_store = DocumentStore()
_vec_store = VectorStore()


@router.get("/{kb_name}", response_model=list[FAQItem])
async def list_faqs(
    kb_name: str,
    status: str | None = QueryParam(None, pattern=r"^(draft|pending|approved|rejected)$"),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    # 学生只能看到已通过的
    effective_status = status
    if current_user["role"] == "student":
        effective_status = "approved"

    return _doc_store.list_faqs(kb_name, status=effective_status)


@router.post("/{kb_name}", response_model=FAQItem)
async def create_faq(
    kb_name: str,
    body: FAQCreate,
    current_user: dict = Depends(require_teacher_or_admin),
) -> dict:
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    # 教师提交默认为待审核，管理员提交默认为已通过
    status = "approved" if current_user["role"] == "admin" else "pending"

    # 先 write MySQL（无 vector_id）
    row = _doc_store.add_faq(
        kb_name=kb_name,
        question=body.question,
        answer=body.answer,
        category=body.category,
        sort_order=body.sort_order,
        author_id=current_user["id"],
        status=status,
    )
    faq_id = row["id"]

    # 只有已通过的才向量化
    if status == "approved":
        vector_id = str(uuid.uuid4())
        try:
            await asyncio.to_thread(
                upsert_faq_vector,
                kb_name,
                body.question,
                body.answer,
                faq_id,
                vector_id,
                _vec_store,
            )
            row = _doc_store.update_faq(faq_id, vector_id=vector_id)
        except Exception as e:
            logger.warning("[faq] embed/index 失败，FAQ 已保存但未向量化: %s", e)

    return row


@router.put("/{kb_name}/{faq_id}", response_model=FAQItem)
async def update_faq(
    kb_name: str,
    faq_id: int,
    body: FAQUpdate,
    current_user: dict = Depends(require_teacher_or_admin),
) -> dict:
    existing = _doc_store.get_faq(faq_id)
    if not existing or existing["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="FAQ 不存在")

    # 权限检查：教师只能修改自己提报的
    if current_user["role"] == "teacher" and existing["author_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改他人的 FAQ 申请")

    updates = body.model_dump(exclude_none=True)

    # 审核状态流转联动向量库
    becoming_approved = updates.get("status") == "approved" and existing.get("status") != "approved"
    becoming_unapproved = (
        updates.get("status") in ("pending", "rejected", "draft") and existing.get("status") == "approved"
    )

    current_status = updates.get("status") or existing["status"]

    # Q 或 A 改变时，或者是刚通过审核时，重新 embed
    if current_status == "approved" and ("question" in updates or "answer" in updates or becoming_approved):
        new_q = updates.get("question", existing["question"])
        new_a = updates.get("answer", existing["answer"])
        vector_id = existing.get("vector_id") or str(uuid.uuid4())
        try:
            await asyncio.to_thread(
                upsert_faq_vector,
                kb_name,
                new_q,
                new_a,
                faq_id,
                vector_id,
                _vec_store,
            )
            updates["vector_id"] = vector_id
        except Exception as e:
            logger.warning("[faq] re-embed 失败: %s", e)

    if becoming_unapproved:
        vid = existing.get("vector_id")
        if vid:
            try:
                await asyncio.to_thread(_vec_store.delete_by_ids, kb_name, [vid])
                updates["vector_id"] = None
            except Exception as e:
                logger.warning("[faq] 移除审核状态时删除向量失败: %s", e)

    # enabled 切换联动 Qdrant (仅限已通过的 FAQ)
    if "enabled" in updates and current_status == "approved":
        becoming_disabled = not updates["enabled"] and bool(existing.get("enabled"))
        becoming_enabled = updates["enabled"] and not bool(existing.get("enabled"))

        if becoming_disabled:
            # 禁用 → 从 Qdrant 删除，vector_id 保留在 MySQL 供恢复时使用
            vid = updates.get("vector_id") or existing.get("vector_id")
            if vid:
                try:
                    await asyncio.to_thread(_vec_store.delete_by_ids, kb_name, [vid])
                    logger.info("[faq] FAQ %d 已禁用，向量已从 Qdrant 删除", faq_id)
                except Exception as e:
                    logger.warning("[faq] 禁用时删除向量失败: %s", e)

        elif becoming_enabled:
            # 启用 → 重新 embed + upsert（用最新的 Q/A，复用原 vector_id 或新生成）
            q = updates.get("question", existing["question"])
            a = updates.get("answer", existing["answer"])
            vid = updates.get("vector_id") or existing.get("vector_id") or str(uuid.uuid4())
            try:
                await asyncio.to_thread(upsert_faq_vector, kb_name, q, a, faq_id, vid, _vec_store)
                updates["vector_id"] = vid
                logger.info("[faq] FAQ %d 已启用，向量已重新写入 Qdrant", faq_id)
            except Exception as e:
                logger.warning("[faq] 启用时 re-embed 失败: %s", e)

    row = _doc_store.update_faq(faq_id, **updates)
    if row is None:
        raise HTTPException(status_code=404, detail="FAQ 不存在")
    return row


@router.get("/{kb_name}/search", response_model=FAQSearchResponse)
async def search_faqs(
    kb_name: str,
    q: str = QueryParam(..., min_length=1, description="搜索词，LLM 改写后语义向量检索"),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """LLM 改写查询 + 语义向量检索 FAQ（仅返回已启用的条目）。"""
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    # 1. LLM 改写查询词
    rewritten = await asyncio.to_thread(_rewrite_query, q)

    # 2. Embed 改写后的查询
    try:
        embed_model = get_embed_model(text_type="query")
        vector: list[float] = await asyncio.to_thread(embed_model.get_text_embedding, rewritten)
    except Exception as e:
        logger.warning("[faq search] embed 失败: %s", e)
        raise HTTPException(status_code=500, detail="查询向量化失败，请稍后重试") from e

    # 3. Qdrant 语义搜索（只匹配 FAQ 向量）
    try:
        hits = await asyncio.to_thread(
            _vec_store.search,
            kb_name,
            vector,
            10,
            None,
            {"source_type": "faq"},
        )
    except Exception as e:
        logger.warning("[faq search] Qdrant 搜索失败: %s", e)
        raise HTTPException(status_code=500, detail="向量检索失败，请稍后重试") from e

    # 4. 按 faq_id 从 MySQL 取完整记录
    items: list[dict] = []
    seen: set[int] = set()
    for hit in hits:
        faq_id = hit.get("faq_id")
        if not isinstance(faq_id, int) or faq_id in seen:
            continue
        row = _doc_store.get_faq(faq_id)
        # 必须是已启用且审核通过的
        if row and row["kb_name"] == kb_name and row.get("enabled") and row.get("status") == "approved":
            items.append(row)
            seen.add(faq_id)

    return {"rewritten_query": rewritten, "items": items}


@router.delete("/{kb_name}/{faq_id}", response_model=MessageResponse)
async def delete_faq(kb_name: str, faq_id: int, current_user: dict = Depends(require_teacher_or_admin)) -> dict:
    existing = _doc_store.get_faq(faq_id)
    if not existing or existing["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="FAQ 不存在")

    vector_id = existing.get("vector_id")
    if vector_id:
        try:
            await asyncio.to_thread(_vec_store.delete_by_ids, kb_name, [vector_id])
        except Exception as e:
            logger.warning("[faq] 从 Qdrant 删除向量失败: %s", e)

    _doc_store.delete_faq(faq_id)
    logger.info("[faq] FAQ %d 已删除", faq_id)
    return {"message": f"FAQ {faq_id} 已删除"}


# ── Excel 导入/导出端点 ────────────────────────────────────


@router.get("/{kb_name}/template")
async def download_faq_template(
    kb_name: str, current_user: dict = Depends(require_teacher_or_admin)
) -> StreamingResponse:
    """下载 FAQ Excel 导入模板（含表头和示例行）。"""
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    wb = build_faq_workbook(faqs=None)
    return make_xlsx_response(wb, "FAQ_导入模板.xlsx")


@router.get("/{kb_name}/export")
async def export_faqs_excel(kb_name: str, current_user: dict = Depends(require_teacher_or_admin)) -> StreamingResponse:
    """导出知识库所有 FAQ 为 Excel 文件。"""
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    faqs = _doc_store.list_faqs(kb_name)
    wb = build_faq_workbook(faqs=faqs)
    filename = f"{kb_name}_FAQ_{date.today().strftime('%Y%m%d')}.xlsx"
    return make_xlsx_response(wb, filename)


@router.post("/{kb_name}/import", response_model=FAQImportResult)
async def import_faqs_excel(
    kb_name: str,
    file: UploadFile = File(...),
    skip_duplicates: bool = Form(default=True),
    current_user: dict = Depends(require_teacher_or_admin),
) -> dict:
    """从 Excel 文件批量导入 FAQ（含自动向量化）。"""
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    filename = file.filename or ""
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 格式的 Excel 文件")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件过大，请控制在 5MB 以内")

    try:
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel 文件解析失败：{e}") from e

    # 解析数据行
    valid_rows, raw_errors = parse_faq_sheet(ws)
    parse_errors = [FAQImportError(row=e["row"], question=e["question"], reason=e["reason"]) for e in raw_errors]
    total = len(valid_rows) + len(parse_errors)

    if total == 0:
        return {
            "total": 0,
            "success": 0,
            "skipped": 0,
            "failed": 0,
            "errors": [FAQImportError(row=0, question="", reason="文件中无有效数据行")],
        }

    all_errors: list[FAQImportError] = list(parse_errors)
    skipped_count = len(parse_errors)

    # 重复检测
    if skip_duplicates:
        existing_questions = {f["question"] for f in _doc_store.list_faqs(kb_name)}
        filtered: list[dict] = []
        for r in valid_rows:
            if r["question"] in existing_questions:
                all_errors.append(
                    FAQImportError(
                        row=0,
                        question=r["question"][:50],
                        reason="与现有 FAQ 问题重复，已跳过",
                    )
                )
                skipped_count += 1
            else:
                filtered.append(r)
        valid_rows = filtered

    # MySQL 批量插入
    faq_rows: list[dict] = []
    failed_count = 0
    for r in valid_rows:
        try:
            row = _doc_store.add_faq(
                kb_name=kb_name,
                question=r["question"],
                answer=r["answer"],
                category=r["category"],
                sort_order=r["sort_order"],
            )
            faq_rows.append(
                {
                    "question": r["question"],
                    "answer": r["answer"],
                    "faq_id": row["id"],
                    "vector_id": str(uuid.uuid4()),
                }
            )
        except Exception as e:
            logger.warning("[faq import] MySQL 插入失败: %s", e)
            all_errors.append(FAQImportError(row=0, question=r["question"][:50], reason=f"数据库写入失败：{e}"))
            failed_count += 1

    # 批量 embed + upsert
    success_count = 0
    if faq_rows:
        embed_results = await asyncio.to_thread(batch_embed_and_upsert, kb_name, faq_rows, _vec_store)
        for r in faq_rows:
            result = embed_results.get(r["faq_id"])
            if isinstance(result, Exception):
                all_errors.append(
                    FAQImportError(
                        row=0,
                        question=r["question"][:50],
                        reason="向量化失败，FAQ 已保存但未加入检索",
                    )
                )
                failed_count += 1
            else:
                try:
                    _doc_store.update_faq(r["faq_id"], vector_id=r["vector_id"])
                except Exception as e:
                    logger.warning("[faq import] 更新 vector_id 失败: %s", e)
                success_count += 1

    logger.info(
        "[faq import] kb=%s total=%d success=%d skipped=%d failed=%d",
        kb_name,
        total,
        success_count,
        skipped_count,
        failed_count,
    )
    return {
        "total": total,
        "success": success_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "errors": all_errors[:20],
    }
