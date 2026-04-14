"""FAQ CRUD 路由。"""

import asyncio
import io
import logging
import os
import urllib.parse
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query as QueryParam, UploadFile
from fastapi.responses import StreamingResponse

from src.api.auth import get_current_user, require_teacher_or_admin
from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import HumanMessage, SystemMessage
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from src.api.schemas import FAQCreate, FAQImportError, FAQImportResult, FAQItem, FAQSearchResponse, FAQUpdate, MessageResponse
from src.config import get_config
from src.core.embedding import get_embed_model
from src.storage.document_store import DocumentStore
from src.storage.vector_store import VectorStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faq", tags=["faq"])

_doc_store = DocumentStore()
_vec_store = VectorStore()


def _embed_faq_text(question: str, answer: str) -> tuple[list[float], str]:
    """将 Q+A 合并后 embed，返回 (vector, vector_id)。"""
    text = f"Q: {question}\nA: {answer}"
    embed_model = get_embed_model(text_type="document")
    vector = embed_model.get_text_embedding(text)
    return vector, text


def _upsert_faq_vector(
    kb_name: str,
    question: str,
    answer: str,
    faq_id: int,
    vector_id: str,
) -> None:
    """同步：embed 并 upsert 到 Qdrant（供 asyncio.to_thread 调用）。"""
    vector, text = _embed_faq_text(question, answer)
    _vec_store.add_vectors(
        collection_name=kb_name,
        vectors=[vector],
        payloads=[{
            "text": text,
            "source_type": "faq",
            "faq_id": faq_id,
            "source_file": "FAQ",
            "kb_name": kb_name,
        }],
        ids=[vector_id],
    )


@router.get("/{kb_name}", response_model=list[FAQItem])
async def list_faqs(kb_name: str, current_user: dict = Depends(get_current_user)) -> list[dict]:
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    return _doc_store.list_faqs(kb_name)


@router.post("/{kb_name}", response_model=FAQItem)
async def create_faq(kb_name: str, body: FAQCreate, current_user: dict = Depends(require_teacher_or_admin)) -> dict:
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")

    # 先写 SQLite（无 vector_id）
    row = _doc_store.add_faq(
        kb_name=kb_name,
        question=body.question,
        answer=body.answer,
        category=body.category,
        sort_order=body.sort_order,
    )
    faq_id = row["id"]
    vector_id = str(uuid.uuid4())

    # 异步 embed + upsert Qdrant
    try:
        await asyncio.to_thread(
            _upsert_faq_vector,
            kb_name, body.question, body.answer, faq_id, vector_id,
        )
        row = _doc_store.update_faq(faq_id, vector_id=vector_id)
    except Exception as e:
        logger.warning("[faq] embed/index 失败，FAQ 已保存但未向量化: %s", e)

    return row


@router.put("/{kb_name}/{faq_id}", response_model=FAQItem)
async def update_faq(kb_name: str, faq_id: int, body: FAQUpdate, current_user: dict = Depends(require_teacher_or_admin)) -> dict:
    existing = _doc_store.get_faq(faq_id)
    if not existing or existing["kb_name"] != kb_name:
        raise HTTPException(status_code=404, detail="FAQ 不存在")

    updates = body.model_dump(exclude_none=True)

    # Q 或 A 改变时重新 embed（复用同一 vector_id，触发 upsert 覆盖）
    if "question" in updates or "answer" in updates:
        new_q = updates.get("question", existing["question"])
        new_a = updates.get("answer", existing["answer"])
        vector_id = existing.get("vector_id") or str(uuid.uuid4())
        try:
            await asyncio.to_thread(
                _upsert_faq_vector,
                kb_name, new_q, new_a, faq_id, vector_id,
            )
            updates["vector_id"] = vector_id
        except Exception as e:
            logger.warning("[faq] re-embed 失败: %s", e)

    # enabled 切换联动 Qdrant
    if "enabled" in updates:
        becoming_disabled = not updates["enabled"] and bool(existing.get("enabled"))
        becoming_enabled = updates["enabled"] and not bool(existing.get("enabled"))

        if becoming_disabled:
            # 禁用 → 从 Qdrant 删除，vector_id 保留在 SQLite 供恢复时使用
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
                await asyncio.to_thread(_upsert_faq_vector, kb_name, q, a, faq_id, vid)
                updates["vector_id"] = vid
                logger.info("[faq] FAQ %d 已启用，向量已重新写入 Qdrant", faq_id)
            except Exception as e:
                logger.warning("[faq] 启用时 re-embed 失败: %s", e)

    row = _doc_store.update_faq(faq_id, **updates)
    if row is None:
        raise HTTPException(status_code=404, detail="FAQ 不存在")
    return row


_REWRITE_SYSTEM = (
    "你是一个搜索查询优化助手，专门为郑州大学本科毕业设计问答系统优化用户的搜索词。"
    "将用户输入改写为语义更清晰、更适合向量检索的标准问题形式。"
    "规则：展开口语缩写、补全省略主语、替换非正式用语为规范术语。"
    "只输出改写后的查询词，不要任何解释或标点以外的内容。"
)


def _rewrite_query(raw: str) -> str:
    """调用快速 LLM 改写查询词，失败时回退原始输入。"""
    try:
        cfg = get_config()["llm"]
        llm = ChatTongyi(
            model=cfg["fast_model"],
            api_key=os.environ.get("DASHSCOPE_API_KEY"),
        )
        resp = llm.invoke([SystemMessage(content=_REWRITE_SYSTEM), HumanMessage(content=raw)])
        rewritten = resp.content.strip()
        logger.info("[faq search] 查询改写: %r → %r", raw, rewritten)
        return rewritten if rewritten else raw
    except Exception as e:
        logger.warning("[faq search] 查询改写失败，使用原始输入: %s", e)
        return raw


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

    # 4. 按 faq_id 从 SQLite 取完整记录
    items: list[dict] = []
    seen: set[int] = set()
    for hit in hits:
        faq_id = hit.get("faq_id")
        if not isinstance(faq_id, int) or faq_id in seen:
            continue
        row = _doc_store.get_faq(faq_id)
        if row and row["kb_name"] == kb_name and row.get("enabled"):
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


# ── Excel 导入/导出辅助函数 ────────────────────────────────

def _build_faq_workbook(faqs: list[dict] | None = None) -> Workbook:
    """
    构建 FAQ Excel 工作簿。
    faqs=None → 模板（含示例行）；faqs=[...] → 导出（含数据）。
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "FAQ"

    is_export = faqs is not None
    base_headers = ["问题 (必填)", "答案 (必填)", "分类", "排序号"]
    extra_headers = ["ID", "是否启用", "创建时间"]
    headers = base_headers + (extra_headers if is_export else [])

    header_fill = PatternFill(start_color="1A1A1A", end_color="1A1A1A", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    center_align = Alignment(horizontal="center", vertical="center")
    wrap_align = Alignment(wrap_text=True, vertical="top")

    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    ws.row_dimensions[1].height = 24

    col_widths = [40, 60, 15, 10] + ([8, 8, 20] if is_export else [])
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    sample_fill = PatternFill(start_color="F8F6F2", end_color="F8F6F2", fill_type="solid")

    if is_export and faqs:
        for row_idx, faq in enumerate(faqs, 2):
            values = [
                faq["question"],
                faq["answer"],
                faq.get("category", ""),
                faq.get("sort_order", 0),
                faq["id"],
                "是" if faq.get("enabled") else "否",
                (faq["created_at"][:10] if faq.get("created_at") else ""),
            ]
            for col_idx, val in enumerate(values, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=val)
                if col_idx == 2:
                    cell.alignment = wrap_align
                    ws.row_dimensions[row_idx].height = 60
    elif not is_export:
        # 示例行
        sample = [
            "郑州大学毕业答辩的时间安排是什么？",
            "郑州大学本科毕业论文答辩通常安排在每年6月初，具体时间由各学院通知，请关注学院官网。",
            "毕业答辩",
            0,
        ]
        for col_idx, val in enumerate(sample, 1):
            cell = ws.cell(row=2, column=col_idx, value=val)
            cell.fill = sample_fill
            if col_idx == 2:
                cell.alignment = wrap_align

    return wb


def _parse_faq_sheet(ws) -> tuple[list[dict], list[FAQImportError]]:
    """
    解析 FAQ 工作表，返回 (valid_rows, errors)。
    valid_rows: [{"question", "answer", "category", "sort_order"}, ...]
    """
    valid_rows: list[dict] = []
    errors: list[FAQImportError] = []

    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        # 跳过全空行
        if all(v is None or str(v).strip() == "" for v in (row[:4] if len(row) >= 4 else row)):
            continue

        question = str(row[0]).strip() if row[0] is not None else ""
        answer   = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
        category = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
        sort_raw = row[3] if len(row) > 3 else None

        err: str | None = None
        sort_order = 0
        if not question:
            err = "问题不能为空"
        elif len(question) > 500:
            err = "问题超过 500 字符限制"
        elif not answer:
            err = "答案不能为空"
        elif len(answer) > 2000:
            err = "答案超过 2000 字符限制"
        elif category and len(category) > 64:
            err = "分类超过 64 字符限制"
        else:
            if sort_raw is not None and str(sort_raw).strip() != "":
                try:
                    sort_order = int(sort_raw)
                    if sort_order < 0:
                        err = "排序号不能为负数"
                except (ValueError, TypeError):
                    err = f"排序号 '{sort_raw}' 不是有效整数"

        if err:
            errors.append(FAQImportError(row=row_idx, question=question[:50], reason=err))
        else:
            valid_rows.append({
                "question": question,
                "answer": answer,
                "category": category,
                "sort_order": sort_order,
            })

    return valid_rows, errors


def _batch_embed_and_upsert(
    kb_name: str,
    rows: list[dict],
) -> dict[int, str | Exception]:
    """
    批量 embed 并 upsert 到 Qdrant。
    rows 每项包含: question, answer, faq_id, vector_id。
    返回 {faq_id: vector_id} 或 {faq_id: Exception}。
    """
    cfg = get_config()
    batch_size: int = cfg.get("embedding", {}).get("embed_batch_size", 10)
    embed_model = get_embed_model(text_type="document")
    results: dict[int, str | Exception] = {}

    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        texts = [f"Q: {r['question']}\nA: {r['answer']}" for r in batch]
        try:
            vectors = embed_model.get_text_embedding_batch(texts)
            payloads = [
                {
                    "text": texts[j],
                    "source_type": "faq",
                    "faq_id": batch[j]["faq_id"],
                    "source_file": "FAQ",
                    "kb_name": kb_name,
                }
                for j in range(len(batch))
            ]
            _vec_store.add_vectors(
                collection_name=kb_name,
                vectors=vectors,
                payloads=payloads,
                ids=[r["vector_id"] for r in batch],
            )
            for r in batch:
                results[r["faq_id"]] = r["vector_id"]
        except Exception as e:
            logger.warning("[faq import] batch %d embed/upsert 失败: %s", i // batch_size, e)
            for r in batch:
                results[r["faq_id"]] = e

    return results


def _make_xlsx_response(wb: Workbook, filename: str) -> StreamingResponse:
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    encoded = urllib.parse.quote(filename)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


# ── Excel 导入/导出端点 ────────────────────────────────────

@router.get("/{kb_name}/template")
async def download_faq_template(kb_name: str, current_user: dict = Depends(require_teacher_or_admin)) -> StreamingResponse:
    """下载 FAQ Excel 导入模板（含表头和示例行）。"""
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    wb = _build_faq_workbook(faqs=None)
    return _make_xlsx_response(wb, "FAQ_导入模板.xlsx")


@router.get("/{kb_name}/export")
async def export_faqs_excel(kb_name: str, current_user: dict = Depends(require_teacher_or_admin)) -> StreamingResponse:
    """导出知识库所有 FAQ 为 Excel 文件。"""
    if not _doc_store.get_kb(kb_name):
        raise HTTPException(status_code=404, detail=f"知识库 '{kb_name}' 不存在")
    faqs = _doc_store.list_faqs(kb_name)
    wb = _build_faq_workbook(faqs=faqs)
    filename = f"{kb_name}_FAQ_{date.today().strftime('%Y%m%d')}.xlsx"
    return _make_xlsx_response(wb, filename)


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
    valid_rows, parse_errors = _parse_faq_sheet(ws)
    total = len(valid_rows) + len(parse_errors)

    if total == 0:
        return {
            "total": 0, "success": 0, "skipped": 0, "failed": 0,
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
                all_errors.append(FAQImportError(
                    row=0, question=r["question"][:50], reason="与现有 FAQ 问题重复，已跳过"
                ))
                skipped_count += 1
            else:
                filtered.append(r)
        valid_rows = filtered

    # SQLite 批量插入
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
            faq_rows.append({
                "question": r["question"],
                "answer": r["answer"],
                "faq_id": row["id"],
                "vector_id": str(uuid.uuid4()),
            })
        except Exception as e:
            logger.warning("[faq import] SQLite 插入失败: %s", e)
            all_errors.append(FAQImportError(row=0, question=r["question"][:50], reason=f"数据库写入失败：{e}"))
            failed_count += 1

    # 批量 embed + upsert
    success_count = 0
    if faq_rows:
        embed_results = await asyncio.to_thread(_batch_embed_and_upsert, kb_name, faq_rows)
        for r in faq_rows:
            result = embed_results.get(r["faq_id"])
            if isinstance(result, Exception):
                all_errors.append(FAQImportError(
                    row=0, question=r["question"][:50], reason="向量化失败，FAQ 已保存但未加入检索"
                ))
                failed_count += 1
            else:
                try:
                    _doc_store.update_faq(r["faq_id"], vector_id=r["vector_id"])
                except Exception as e:
                    logger.warning("[faq import] 更新 vector_id 失败: %s", e)
                success_count += 1

    logger.info(
        "[faq import] kb=%s total=%d success=%d skipped=%d failed=%d",
        kb_name, total, success_count, skipped_count, failed_count,
    )
    return {
        "total": total,
        "success": success_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "errors": all_errors[:20],
    }
