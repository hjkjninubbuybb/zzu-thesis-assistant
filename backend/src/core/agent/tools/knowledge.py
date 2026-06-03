"""知识库工具：文档列表、知识库检索、文件下载链接。"""

import logging

from langchain_core.tools import tool

from src.core.interfaces.storage import BaseDocumentStore

logger = logging.getLogger(__name__)

# 模块级 doc_store 单例，由 agent/factory.py 在启动时通过 set_doc_store() 注入。
_ds: BaseDocumentStore | None = None


def set_doc_store(doc_store: BaseDocumentStore) -> None:
    """注入文档存储实例。由 agent/factory.py 调用，幂等。"""
    global _ds
    _ds = doc_store


def _require_ds() -> BaseDocumentStore:
    if _ds is None:
        raise RuntimeError("knowledge tool 未初始化，请调用 set_doc_store(...)")
    return _ds


@tool
def list_kb_documents(kb_name: str) -> str:
    """列出指定知识库中所有已上传的文档名称和片段数量。
    在开始检索前调用，可了解知识库中有哪些参考资料，以便决定如何检索。

    Args:
        kb_name: 知识库名称
    """
    try:
        docs, _ = _require_ds().list_documents(kb_name, page_size=10000)
    except Exception as e:
        logger.warning("[list_kb_documents] 查询失败: %s", e)
        return "查询文档列表失败，请稍后重试。"

    if not docs:
        return f"知识库 '{kb_name}' 中暂无文档。"
    lines = [f"知识库 '{kb_name}' 共 {len(docs)} 个文档："]
    for d in docs:
        lines.append(f"- {d['file_name']}（{d['chunk_count']} 个片段）")
    return "\n".join(lines)


def make_search_kb_tool(retriever_fn, captured_nodes: list):
    """创建 search_knowledge_base 工具，绑定检索函数和节点捕获列表。

    Args:
        retriever_fn   : (query: str) -> list[dict]，混合检索 + rerank 的函数
        captured_nodes : 可变列表，工具每次检索到的节点会追加进去（用于来源展示）
    """

    @tool
    def search_knowledge_base(query: str) -> str:
        """在知识库中检索与查询最相关的文档片段（向量+BM25混合检索 + Reranking）。
        这是回答毕设相关问题的主要工具，大多数问题都应先调用本工具。
        可以用不同的查询词多次调用以获取更全面的信息。

        Args:
            query: 检索查询词（可以是用户原问题或更精炼的关键词）
        """
        if not query.strip():
            return "查询词不能为空。"
        try:
            nodes = retriever_fn(query)
        except Exception as e:
            logger.warning("[search_knowledge_base] 检索失败: %s", e)
            return "知识库检索失败，请稍后重试。"

        if not nodes:
            return "知识库中未检索到相关内容，可以尝试换个关键词再次检索。"

        # 追加到捕获列表（按 node_id 去重）
        existing_ids = {n["node_id"] for n in captured_nodes}
        for n in nodes:
            if n["node_id"] not in existing_ids:
                captured_nodes.append(n)
                existing_ids.add(n["node_id"])

        parts = []
        for i, n in enumerate(nodes, 1):
            src = n.get("source_file", "")
            src_line = f"\n来源：{src}" if src else ""
            parts.append(f"[片段{i}]{src_line}\n{n['text']}")
        return "\n\n".join(parts)

    return search_knowledge_base


def make_get_document_link_tool(kb_name: str, file_events: list):
    """创建 get_document_link 工具，绑定知识库名称和文件事件列表。

    找到匹配文件后，将文件信息追加到 file_events（供 stream_rag 转发给前端渲染文件卡片），
    并向 LLM 返回简短的确认文本。

    Args:
        kb_name    : 知识库名称（从 stream_rag 调用方传入）
        file_events: 可变列表，工具找到文件后会 append {"file_name", "url", "size_kb"}
    """

    @tool
    def get_document_link(file_hint: str) -> str:
        """根据用户提到的文件名关键词，查找知识库中匹配的文件并发送给用户。
        仅当用户明确要求下载、获取、发送文件、模板、表格、报告或原文时调用本工具。
        普通知识问答中即使答案提到文件名，也不要仅因为提到文件名而调用本工具。
        调用后仍需先回答用户问题，文件链接只能作为补充。

        Args:
            file_hint: 用户提到的文件名关键词，如"任务书"、"开题报告"、"论文模板"
        """
        try:
            docs, _ = _require_ds().list_documents(kb_name, page_size=10000)
        except Exception as e:
            logger.warning("[get_document_link] 查询失败: %s", e)
            return "查询文件列表失败，请稍后重试。"

        if not docs:
            return f"知识库 '{kb_name}' 中暂无文档，请先上传文件。"

        hint = file_hint.strip().lower()

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

        if not exact and _score(best["file_name"]) < 0.3:
            # 相关度太低，发送前3个文件供用户选择
            sent = []
            for d in ranked[:3]:
                file_events.append(
                    {
                        "file_name": d["file_name"],
                        "url": f"/api/document/{kb_name}/download/{d['id']}",
                        "size_kb": max(d["file_size"] // 1024, 1),
                    }
                )
                sent.append(d["file_name"])
            names = "、".join(f"《{n}》" for n in sent)
            return f"未找到与「{file_hint}」完全匹配的文件，已发送相关文件 {names}，文件已通过界面卡片展示给用户，请用纯文字告知用户供参考即可。"

        file_events.append(
            {
                "file_name": best["file_name"],
                "url": f"/api/document/{kb_name}/download/{best['id']}",
                "size_kb": max(best["file_size"] // 1024, 1),
            }
        )
        return f"已找到并发送文件《{best['file_name']}》，文件已通过界面卡片展示给用户，请用纯文字告知用户文件已准备好即可。"

    return get_document_link
