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
OFFICIAL_CACHE_TTL_DAYS = 120
KNOWLEDGE_BASE_CACHE_TTL_DAYS = 30
NEGATIVE_CACHE_TTL_DAYS = 1


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


def _cache_ttl_days(source: str) -> int:
    if source == "zzu_official":
        return OFFICIAL_CACHE_TTL_DAYS
    if source.startswith("knowledge_base:"):
        return KNOWLEDGE_BASE_CACHE_TTL_DAYS
    if source == "unavailable":
        return NEGATIVE_CACHE_TTL_DAYS
    return 0


def _is_cache_fresh(entry: dict) -> bool:
    fetched_at = entry.get("fetched_at")
    if not fetched_at:
        return False
    try:
        fetched = datetime.fromisoformat(str(fetched_at))
    except ValueError:
        return False
    source = str(entry.get("source", "zzu_official"))
    age_days = (datetime.now() - fetched).total_seconds() / 86400
    return age_days <= _cache_ttl_days(source)


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


def _extract_semester_start(cache_key: str, text: str) -> str | None:
    year = int(cache_key[:4])
    is_spring = "spring" in cache_key
    season = "春季" if is_spring else "秋季"
    patterns = [
        r"第[一1]周[^\d]{0,20}(20\d{2})[年\./-](\d{1,2})[月\./-](\d{1,2})日?",
        r"第[一1]周[^\d]{0,20}(\d{1,2})[月\./-](\d{1,2})日?",
        rf"{season}学期[^\d]{{0,30}}(20\d{{2}})[年\./-](\d{{1,2}})[月\./-](\d{{1,2}})日?",
        rf"{season}学期[^\d]{{0,30}}(\d{{1,2}})[月\./-](\d{{1,2}})日?",
        r"(20\d{2})[年\./-](\d{1,2})[月\./-](\d{1,2})日?[^\n]{0,20}(?:开学|报到|上课)",
        r"(\d{1,2})月(\d{1,2})日[^\n]{0,20}(?:开学|报到|上课)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if not m:
            continue
        groups = m.groups()
        if len(groups) == 3:
            y, month, day = int(groups[0]), int(groups[1]), int(groups[2])
        else:
            y, month, day = year, int(groups[0]), int(groups[1])
        return f"{y}-{month:02d}-{day:02d}"
    return None


def _candidate_kb_names() -> list[str]:
    names: list[str] = []
    for key in ("admin_kb", "active_kb"):
        try:
            name = _ds.get_setting(key)
        except Exception as e:
            logger.debug("[calendar] 读取知识库设置失败 %s: %s", key, e)
            continue
        if name and name not in names:
            names.append(name)
    return names


def _fetch_semester_start_from_kb(cache_key: str) -> tuple[str, str] | None:
    """从当前知识库文本片段中提取学期第一周起始日期。"""
    try:
        from src.core.retrieval import fetch_corpus
    except Exception as e:
        logger.debug("[calendar] 加载知识库语料接口失败: %s", e)
        return None

    keywords = ("校历", "学期", "第一周", "开学", "报到", "上课", "工作进度表")
    for kb_name in _candidate_kb_names():
        try:
            corpus = fetch_corpus(kb_name)
        except Exception as e:
            logger.warning("[calendar] 读取知识库 '%s' 语料失败: %s", kb_name, e)
            continue
        for node in corpus:
            text = str(node.get("text", ""))
            if not any(keyword in text for keyword in keywords):
                continue
            start = _extract_semester_start(cache_key, text)
            if start:
                source_file = str(node.get("file_name", ""))
                source = f"knowledge_base:{kb_name}:{source_file}"
                logger.info("[calendar] 从知识库命中校历日期: %s → %s", source, start)
                return start, source
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

    cache_entry = cache.get(cache_key)
    cache_source = str(cache_entry.get("source", "zzu_official")) if cache_entry else ""
    use_positive_cache = (
        cache_entry is not None
        and _is_cache_fresh(cache_entry)
        and cache_source != "unavailable"
        and bool(cache_entry.get("start"))
    )
    if use_positive_cache:
        data_source = cache_source
        start_str = str(cache_entry["start"])
        logger.debug("[calendar] 命中新鲜缓存: %s → %s (%s)", cache_key, start_str, data_source)
    else:
        if cache_source == "unavailable" and cache_entry and _is_cache_fresh(cache_entry):
            logger.debug("[calendar] 命中负缓存，仍先检查知识库: %s", cache_key)
            cache_entry = None
        if cache_entry:
            logger.info("[calendar] 缓存过期 %s，尝试刷新郑大校历...", cache_key)
        else:
            logger.info("[calendar] 缓存未命中 %s，先查询当前知识库...", cache_key)
        kb_result = _fetch_semester_start_from_kb(cache_key)
        if kb_result:
            start_str, kb_source = kb_result
            cache[cache_key] = {
                "start": start_str,
                "fetched_at": datetime.now().isoformat(),
                "source": kb_source,
            }
            _save_cache(cache)
            data_source = kb_source
            logger.info("[calendar] 知识库缓存已写入: %s → %s", cache_key, start_str)
        else:
            logger.info("[calendar] 知识库未命中 %s，开始爬取郑大校历...", cache_key)
            start_str = _fetch_semester_start(cache_key)
        if start_str:
            cache[cache_key] = {
                "start": start_str,
                "fetched_at": datetime.now().isoformat(),
                "source": data_source if data_source.startswith("knowledge_base:") else "zzu_official",
            }
            _save_cache(cache)
            logger.info("[calendar] 缓存已写入: %s → %s", cache_key, start_str)
        else:
            stale_source = str(cache_entry.get("source", "zzu_official")) if cache_entry else ""
            if cache_entry and cache_entry.get("start") and (
                stale_source == "zzu_official" or stale_source.startswith("knowledge_base:")
            ):
                start_str = str(cache_entry["start"])
                data_source = f"stale_{stale_source}"
                logger.warning("[calendar] 刷新失败，使用过期缓存: %s", start_str)
            else:
                cache[cache_key] = {
                    "start": None,
                    "fetched_at": datetime.now().isoformat(),
                    "source": "unavailable",
                    "error": "校历缓存不存在且官网抓取失败，无法计算当前教学周。",
                }
                _save_cache(cache)
                result = {
                    "today": today.isoformat(),
                    "weekday": weekday,
                    "semester": semester,
                    "semester_start": None,
                    "current_week": None,
                    "data_source": "unavailable",
                    "error": "校历缓存不存在且官网抓取失败，无法计算当前教学周。",
                }
                logger.warning("[calendar] 爬取失败且无可用缓存，无法计算教学周")
                return json.dumps(result, ensure_ascii=False, indent=2)

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
        仅当用户明确要求下载、获取、发送文件、模板、表格、报告或原文时调用本工具。
        普通知识问答中即使答案提到文件名，也不要仅因为提到文件名而调用本工具。
        调用后仍需先回答用户问题，文件链接只能作为补充。

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
            sent = []
            for d in ranked[:3]:
                file_events.append({
                    "file_name": d["file_name"],
                    "url": f"/api/document/{kb_name}/download/{d['id']}",
                    "size_kb": max(d["file_size"] // 1024, 1),
                })
                sent.append(d["file_name"])
            names = "、".join(f"《{n}》" for n in sent)
            return f"未找到与「{file_hint}」完全匹配的文件，已发送相关文件 {names}，文件已通过界面卡片展示给用户，请用纯文字告知用户供参考即可。"

        file_events.append({
            "file_name": best["file_name"],
            "url": f"/api/document/{kb_name}/download/{best['id']}",
            "size_kb": max(best["file_size"] // 1024, 1),
        })
        return f"已找到并发送文件《{best['file_name']}》，文件已通过界面卡片展示给用户，请用纯文字告知用户文件已准备好即可。"

    return get_document_link
