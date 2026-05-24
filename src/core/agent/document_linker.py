"""文件下载链接器：匹配用户想要的文件并生成下载卡片。

实现 BaseDocumentLinker 接口。
"""

import logging

from src.core.interfaces import BaseDocumentLinker
from src.storage.document_store import DocumentStore

logger = logging.getLogger(__name__)


class DocumentLinker(BaseDocumentLinker):
    """基于子串 + 字符重叠评分的文件匹配器。"""

    def __init__(self, doc_store: DocumentStore | None = None):
        self._ds = doc_store or DocumentStore()

    def link(self, file_hint: str, kb_name: str) -> list[dict]:
        logger.info("[Agent] 进入 document_linker, hint=%s", file_hint)
        hint = file_hint.strip().lower()
        if not hint:
            return []

        try:
            docs = self._ds.list_documents(kb_name)
        except Exception as e:
            logger.warning("[Agent] document_linker 查询文件列表失败: %s", e)
            return []

        if not docs:
            return []

        # 第一层：子串精确匹配
        exact = [d for d in docs if hint in d["file_name"].lower()]

        # 第二层：字符级重叠评分
        def _score(name: str) -> float:
            nl = name.lower()
            return sum(1 for ch in hint if ch in nl) / max(len(hint), 1)

        ranked = sorted(
            exact if exact else docs,
            key=lambda d: _score(d["file_name"]),
            reverse=True,
        )
        best = ranked[0]

        events = []
        if not exact and _score(best["file_name"]) < 0.3:
            for d in ranked[:2]:
                events.append(
                    {
                        "file_name": d["file_name"],
                        "url": f"/api/document/{kb_name}/download/{d['id']}",
                        "size_kb": max(d["file_size"] // 1024, 1),
                    }
                )
        else:
            events.append(
                {
                    "file_name": best["file_name"],
                    "url": f"/api/document/{kb_name}/download/{best['id']}",
                    "size_kb": max(best["file_size"] // 1024, 1),
                }
            )

        return events
