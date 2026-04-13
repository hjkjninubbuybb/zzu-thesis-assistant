"""Agentic RAG 工具集：供 ReAct Agent 调用的工具。"""

import json
import logging
import re
from datetime import date, datetime

from langchain_core.tools import tool

from src.config import get_config, ROOT_DIR
from src.storage.document_store import DocumentStore

logger = logging.getLogger(__name__)
_ds = DocumentStore()

# ── 校历缓存配置 ───────────────────────────────────────────

CACHE_PATH = ROOT_DIR / "data" / "calendar_cache.json"
ZZU_CALENDAR_URL = "https://www15.zzu.edu.cn/info/1284/86426.htm"
ZZU_CALENDAR_FALLBACK = "https://www.zzu.edu.cn/zdxl.htm"


def _current_semester_key(today: date) -> tuple[str, str]:
    """返回 (cache_key, semester_label)，如 ('2026-spring', '春季')。"""
    if today.month >= 9:
        return f"{today.year}-autumn", "秋季"
    elif today.month >= 2:
        return f"{today.year}-spring", "春季"
    else:
        return f"{today.year - 1}-autumn", "秋季（上一学年）"


def _load_cache() -> dict:
    try:
        if CACHE_PATH.exists():
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("[calendar] 读取缓存失败: %s", e)
    return {}


def _save_cache(cache: dict) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning("[calendar] 写入缓存失败: %s", e)


def _fetch_semester_start(cache_key: str) -> str | None:
    """爬取郑大校历页面，正则提取开学日期，返回 ISO 格式如 '2026-02-17'，失败返回 None。"""
    year = int(cache_key[:4])
    is_spring = "spring" in cache_key

    text: str | None = None
    for url in (ZZU_CALENDAR_URL, ZZU_CALENDAR_FALLBACK):
        try:
            import httpx
            resp = httpx.get(url, timeout=10, follow_redirects=True)
            resp.raise_for_status()
            text = resp.text
            break
        except Exception as e:
            logger.warning("[calendar] 爬取 %s 失败: %s", url, e)

    if not text:
        return None

    season = "春季" if is_spring else "秋季"
    patterns = [
        r"第[一1]周[^\d]{0,15}(\d{1,2})月(\d{1,2})日",
        rf"{season}学期[^\d]{{0,20}}(\d{{1,2}})月(\d{{1,2}})日",
        r"(\d{1,2})月(\d{1,2})日[^\d]{0,10}(?:开学|报到|上课)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            month, day = int(m.group(1)), int(m.group(2))
            logger.info("[calendar] 正则命中 pattern='%s'，解析到 %d月%d日", pat, month, day)
            return f"{year}-{month:02d}-{day:02d}"

    logger.warning("[calendar] 未匹配到开学日期，页面片段: %.300s", text)
    return None


# ── 1. 知识库文档列表 ──────────────────────────────────────

@tool
def list_kb_documents(kb_name: str) -> str:
    """列出指定知识库中所有已上传的文档名称和片段数量。
    在开始检索前调用，可了解知识库中有哪些参考资料，以便决定如何检索。

    Args:
        kb_name: 知识库名称
    """
    try:
        docs = _ds.list_documents(kb_name)
    except Exception as e:
        logger.warning("[list_kb_documents] 查询失败: %s", e)
        return "查询文档列表失败，请稍后重试。"

    if not docs:
        return f"知识库 '{kb_name}' 中暂无文档。"
    lines = [f"知识库 '{kb_name}' 共 {len(docs)} 个文档："]
    for d in docs:
        lines.append(f"- {d['file_name']}（{d['chunk_count']} 个片段）")
    return "\n".join(lines)


# ── 2. 学术日历 ───────────────────────────────────────────

@tool
def get_academic_calendar() -> str:
    """获取当前日期、星期几、本学期第几周。
    数据来源：郑州大学官方校历（首次调用自动抓取并缓存，同一学期后续直接读缓存）。
    回答"今天是第几周""距离某节点还有几天"等时间相关问题时必须先调用本工具。
    """
    today = date.today()
    cache_key, semester = _current_semester_key(today)
    weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][today.weekday()]

    cache = _load_cache()
    data_source = "zzu_official"

    if cache_key not in cache:
        logger.info("[calendar] 缓存未命中 %s，开始爬取郑大校历...", cache_key)
        start_str = _fetch_semester_start(cache_key)
        if start_str:
            cache[cache_key] = {"start": start_str, "fetched_at": datetime.now().isoformat()}
            _save_cache(cache)
            logger.info("[calendar] 缓存已写入: %s → %s", cache_key, start_str)
        else:
            # Fallback：读 config.yaml 或硬编码默认值
            cfg_academic = get_config().get("academic", {})
            year = int(cache_key[:4])
            md = cfg_academic.get("spring_start", "02-24") if "spring" in cache_key else cfg_academic.get("autumn_start", "09-01")
            start_str = f"{year}-{md}"
            data_source = "fallback"
            logger.warning("[calendar] 爬取失败，使用默认值: %s", start_str)
    else:
        start_str = cache[cache_key]["start"]

    sem_start = date.fromisoformat(start_str)
    week_num = (today - sem_start).days // 7 + 1

    result = {
        "today": today.isoformat(),
        "weekday": weekday,
        "semester": semester,
        "semester_start": start_str,
        "current_week": week_num,
        "data_source": data_source,
    }
    return json.dumps(result, ensure_ascii=False, indent=2)


# ── 3. 知识库检索（工厂函数，运行时绑定 retriever） ───────

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


# ── 4. 文件下载链接（工厂函数，运行时绑定 kb_name）───────────

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
        当用户提到想获取某个文件、模板、表格、报告，或需要下载某文档时，调用本工具。
        回答中提到具体文件时也应主动调用，以便用户直接获取原文件。

        Args:
            file_hint: 用户提到的文件名关键词，如"任务书"、"开题报告"、"论文模板"
        """
        try:
            docs = _ds.list_documents(kb_name)
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
            for d in ranked[:3]:
                file_events.append({
                    "file_name": d["file_name"],
                    "url": f"/api/document/{kb_name}/download/{d['id']}",
                    "size_kb": max(d["file_size"] // 1024, 1),
                })
            names = "、".join(fe["file_name"] for fe in file_events[-3:])
            return f'未找到与\u201c{file_hint}\u201d完全匹配的文件，已发送相关文件：{names}，供用户参考。'

        file_events.append({
            "file_name": best["file_name"],
            "url": f"/api/document/{kb_name}/download/{best['id']}",
            "size_kb": max(best["file_size"] // 1024, 1),
        })
        return f"已发送文件《{best['file_name']}》，用户可直接下载。"

    return get_document_link
