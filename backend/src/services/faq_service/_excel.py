"""FAQ Excel 导入导出 Mixin：模板下载 / 批量导入 / 导出。

混入到 ``FAQService`` 后通过 ``self`` 访问存储与 logger。
"""

import io
import logging
import uuid
import zipfile
from datetime import date

import pymysql
from openpyxl import Workbook, load_workbook

from src.services._faq_helpers import (
    batch_embed_and_upsert,
    build_faq_workbook,
    parse_faq_sheet,
    workbook_to_bytes,
)
from src.storage.faq_store import FAQStore
from src.storage.kb_store import KBStore
from src.storage.vector_store import VectorStore


class ExcelMixin:
    """FAQ Excel 导入导出方法集合。"""

    # 由 FAQService 提供的属性
    _faq_store: FAQStore
    _kb_store: KBStore
    _vector_store: VectorStore
    logger: logging.Logger

    def _require_kb(self, kb_name: str) -> None: ...  # 由 FAQService 实现

    # ── Excel 导入 ────────────────────────────────────────────

    def import_from_xlsx(self, kb_name: str, file_bytes: bytes, author_id: int) -> dict:
        """从 Excel 字节流批量导入 FAQ（含自动向量化）。

        Args:
            kb_name: 目标知识库名称。
            file_bytes: .xlsx 文件的原始字节内容。
            author_id: 导入操作人用户 ID。

        Returns:
            包含 total/success/skipped/failed/errors 的统计 dict。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            ValueError: Excel 文件无法解析。
        """
        self._require_kb(kb_name)

        try:
            wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
            ws = wb.active
        except (ValueError, OSError, zipfile.BadZipFile) as e:
            raise ValueError(f"Excel 文件解析失败：{e}") from e

        valid_rows, raw_errors = parse_faq_sheet(ws)
        parse_errors = [{"row": e["row"], "question": e["question"], "reason": e["reason"]} for e in raw_errors]
        total = len(valid_rows) + len(parse_errors)

        if total == 0:
            return {
                "total": 0,
                "success": 0,
                "skipped": 0,
                "failed": 0,
                "errors": [{"row": 0, "question": "", "reason": "文件中无有效数据行"}],
            }

        all_errors: list[dict] = list(parse_errors)
        skipped_count = len(parse_errors)

        # 重复检测
        all_faqs, _ = self._faq_store.list_faqs(kb_name, page_size=100000)
        existing_questions = {f["question"] for f in all_faqs}
        filtered: list[dict] = []
        for r in valid_rows:
            if r["question"] in existing_questions:
                all_errors.append({"row": 0, "question": r["question"][:50], "reason": "与现有 FAQ 问题重复，已跳过"})
                skipped_count += 1
            else:
                filtered.append(r)
        valid_rows = filtered

        # MySQL 批量插入
        faq_rows: list[dict] = []
        failed_count = 0
        for r in valid_rows:
            try:
                row = self._faq_store.add_faq(
                    kb_name=kb_name,
                    question=r["question"],
                    answer=r["answer"],
                    category=r["category"],
                    sort_order=r["sort_order"],
                    author_id=author_id,
                )
                faq_rows.append(
                    {
                        "question": r["question"],
                        "answer": r["answer"],
                        "faq_id": row["id"],
                        "vector_id": str(uuid.uuid4()),
                    }
                )
            except pymysql.Error as e:
                self.logger.warning("[FAQService] import MySQL 插入失败: %s", e)
                all_errors.append({"row": 0, "question": r["question"][:50], "reason": f"数据库写入失败：{e}"})
                failed_count += 1

        # 批量 embed + upsert
        success_count = 0
        if faq_rows:
            embed_results = batch_embed_and_upsert(kb_name, faq_rows, self._vector_store)
            for r in faq_rows:
                result = embed_results.get(r["faq_id"])
                if isinstance(result, Exception):
                    all_errors.append(
                        {"row": 0, "question": r["question"][:50], "reason": "向量化失败，FAQ 已保存但未加入检索"}
                    )
                    failed_count += 1
                else:
                    try:
                        self._faq_store.update_faq(r["faq_id"], vector_id=r["vector_id"])
                    except pymysql.Error as e:
                        self.logger.warning("[FAQService] 更新 vector_id 失败: %s", e)
                    success_count += 1

        self.logger.info(
            "[FAQService] import kb=%s total=%d success=%d skipped=%d failed=%d",
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

    # ── Excel 导出 ────────────────────────────────────────────

    def export_to_xlsx(self, kb_name: str) -> tuple[bytes, str]:
        """导出知识库所有 FAQ 为 Excel 文件字节。

        Args:
            kb_name: 知识库名称。

        Returns:
            (文件字节, 文件名) 元组。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        faqs, _ = self._faq_store.list_faqs(kb_name, page_size=100000)
        wb: Workbook = build_faq_workbook(faqs=faqs)
        filename = f"{kb_name}_FAQ_{date.today().strftime('%Y%m%d')}.xlsx"
        return workbook_to_bytes(wb), filename

    def get_template(self, kb_name: str) -> tuple[bytes, str]:
        """下载 FAQ Excel 导入模板（含表头和示例行）字节。

        Args:
            kb_name: 知识库名称（用于存在性校验）。

        Returns:
            (文件字节, 文件名) 元组。

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
        """
        self._require_kb(kb_name)
        wb: Workbook = build_faq_workbook(faqs=None)
        return workbook_to_bytes(wb), "FAQ_导入模板.xlsx"
