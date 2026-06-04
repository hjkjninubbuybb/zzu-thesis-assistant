# FAQ 混合搜索重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理端 FAQ 搜索从"LLM 改写 + 纯向量"重构为"向量 + MySQL 关键词并集"混合搜索，修复权限、状态过滤及前端体验问题。

**Architecture:** FAQStore 新增 `search_by_text()` 做 MySQL LIKE 查询；FAQService.search() 并行调用向量搜索与文本搜索，向量结果（含 score）排前，纯文本结果（score=None）去重追加；路由改为 `require_teacher_or_admin`，返回全部状态 FAQ。

**Tech Stack:** Python/FastAPI 后端，PyMySQL，Qdrant 向量库，DashScope Embedding，React 19 + TypeScript 前端，@tanstack/react-query。

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/storage/interfaces/faq_store.py` | 修改 | BaseFAQStore Protocol 新增 `search_by_text` |
| `src/storage/faq_store.py` | 修改 | 实现 `search_by_text` |
| `src/api/schemas/faq.py` | 修改 | 新增 `FAQSearchItem`，更新 `FAQSearchResponse` |
| `src/services/faq_service.py` | 修改 | 重写 `search()`，移除 LLM 改写 |
| `src/api/routes/faq.py` | 修改 | 改权限依赖，更新 schema 导入 |
| `tests/services/test_faq_service.py` | 修改 | 新增 search() 测试用例 |
| `frontend/src/shared/types/api.ts` | 修改 | 新增 `FAQSearchItem`，更新 `FAQSearchResponse` |
| `frontend/src/features/faq/components/FaqToolbar.tsx` | 修改 | 新增清空按钮 |
| `frontend/src/features/faq/components/FaqManagement.tsx` | 修改 | 修 ghost state，隐藏 FilterBar |
| `frontend/src/features/faq/components/FaqTable.tsx` | 修改 | score/关键词徽章 |

---

### Task 1: FAQStore — 接口 + 实现 `search_by_text`

**Files:**
- Modify: `src/storage/interfaces/faq_store.py`
- Modify: `src/storage/faq_store.py`

- [ ] **Step 1: 在 BaseFAQStore Protocol 末尾新增方法签名**

打开 `src/storage/interfaces/faq_store.py`，在 `delete_faq` 方法后追加：

```python
    def search_by_text(self, kb_name: str, query: str, limit: int = 20) -> list[dict]:
        """question 或 answer 包含 query 的 FAQ，不过滤 status/enabled。

        Args:
            kb_name: 知识库名称。
            query: 搜索关键词（做 LIKE %query% 匹配）。
            limit: 最多返回条数。

        Returns:
            匹配的 FAQ 行列表，按 sort_order ASC, id DESC 排序。
        """
        ...
```

- [ ] **Step 2: 在 FAQStore 末尾实现该方法**

打开 `src/storage/faq_store.py`，在 `delete_faq` 方法后追加：

```python
    def search_by_text(self, kb_name: str, query: str, limit: int = 20) -> list[dict]:
        """question 或 answer 包含 query 的 FAQ，不过滤 status/enabled。

        Args:
            kb_name: 知识库名称。
            query: 搜索关键词（做 LIKE %query% 匹配）。
            limit: 最多返回条数。

        Returns:
            匹配的 FAQ 行列表，按 sort_order ASC, id DESC 排序。
        """
        like = f"%{query}%"
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT * FROM faqs
                   WHERE kb_name = %s
                     AND (question LIKE %s OR answer LIKE %s)
                   ORDER BY sort_order ASC, id DESC
                   LIMIT %s""",
                (kb_name, like, like, limit),
            )
            return cur.fetchall()
```

- [ ] **Step 3: 验证语法无误**

```bash
poetry run python -c "from src.storage.faq_store import FAQStore; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/storage/interfaces/faq_store.py src/storage/faq_store.py
git commit -m "feat(storage): add FAQStore.search_by_text for hybrid search"
```

---

### Task 2: Schema — FAQSearchItem + FAQSearchResponse

**Files:**
- Modify: `src/api/schemas/faq.py`

- [ ] **Step 1: 写失败测试**

打开 `tests/services/test_faq_service.py`，在文件顶部导入区域已有的 import 下方，在第一个测试前插入：

```python
# ── schema smoke test ──────────────────────────────────────────────────


def test_faq_search_item_has_score_field():
    from src.api.schemas.faq import FAQSearchItem
    import datetime

    item = FAQSearchItem(
        id=1,
        kb_name="kb1",
        question="Q",
        answer="A",
        category="",
        sort_order=0,
        enabled=True,
        status="approved",
        created_at=datetime.datetime(2024, 1, 1),
        updated_at=datetime.datetime(2024, 1, 1),
        score=0.85,
    )
    assert item.score == 0.85


def test_faq_search_item_score_nullable():
    from src.api.schemas.faq import FAQSearchItem
    import datetime

    item = FAQSearchItem(
        id=2,
        kb_name="kb1",
        question="Q",
        answer="A",
        category="",
        sort_order=0,
        enabled=True,
        status="draft",
        created_at=datetime.datetime(2024, 1, 1),
        updated_at=datetime.datetime(2024, 1, 1),
        score=None,
    )
    assert item.score is None


def test_faq_search_response_has_no_rewritten_query():
    from src.api.schemas.faq import FAQSearchResponse, FAQSearchItem
    import datetime

    resp = FAQSearchResponse(items=[])
    assert not hasattr(resp, "rewritten_query")
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
poetry run pytest tests/services/test_faq_service.py::test_faq_search_item_has_score_field -v
```

Expected: FAIL — `ImportError: cannot import name 'FAQSearchItem'`

- [ ] **Step 3: 修改 `src/api/schemas/faq.py`**

将原有的：

```python
class FAQSearchResponse(BaseModel):
    rewritten_query: str
    items: list[FAQItem]
```

替换为：

```python
class FAQSearchItem(FAQItem):
    """FAQItem + 相关性分数（向量命中有值，纯文本命中为 None）。"""

    score: float | None = None


class FAQSearchResponse(BaseModel):
    items: list[FAQSearchItem]
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
poetry run pytest tests/services/test_faq_service.py::test_faq_search_item_has_score_field tests/services/test_faq_service.py::test_faq_search_item_score_nullable tests/services/test_faq_service.py::test_faq_search_response_has_no_rewritten_query -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/api/schemas/faq.py tests/services/test_faq_service.py
git commit -m "feat(schema): add FAQSearchItem with score field, drop rewritten_query"
```

---

### Task 3: FAQService — 重写 `search()` + 完整测试

**Files:**
- Modify: `src/services/faq_service.py`
- Modify: `tests/services/test_faq_service.py`

- [ ] **Step 1: 写所有失败测试**

在 `tests/services/test_faq_service.py` 末尾追加以下内容（保留文件已有内容）：

```python
# ── search ────────────────────────────────────────────────────────────


def _faq_row(faq_id: int, kb: str = "kb1", status: str = "approved") -> dict:
    """构造测试用 FAQ 行 dict。"""
    import datetime
    return {
        "id": faq_id,
        "kb_name": kb,
        "question": f"Q{faq_id}",
        "answer": f"A{faq_id}",
        "category": "",
        "sort_order": 0,
        "enabled": True,
        "status": status,
        "author_id": None,
        "created_at": datetime.datetime(2024, 1, 1),
        "updated_at": datetime.datetime(2024, 1, 1),
    }


def test_search_kb_not_found(svc, mock_kb_store):
    mock_kb_store.get_kb.return_value = None

    with pytest.raises(KnowledgeBaseNotFoundError):
        svc.search("missing", "query")


def test_search_embed_failure(svc, mock_kb_store):
    from dashscope.common.error import DashScopeException

    mock_kb_store.get_kb.return_value = {"name": "kb1"}

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.side_effect = DashScopeException("err")
        with pytest.raises(RuntimeError, match="向量化失败"):
            svc.search("kb1", "query")


def test_search_vector_store_failure(svc, mock_kb_store, mock_vector_store):
    from src.storage.vector_store import VectorStoreError

    mock_kb_store.get_kb.return_value = {"name": "kb1"}

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        mock_vector_store.search.side_effect = VectorStoreError("qdrant down")
        with pytest.raises(RuntimeError, match="向量检索失败"):
            svc.search("kb1", "query")


def test_search_passes_score_threshold(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = []
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        svc.search("kb1", "query")

    call_args = mock_vector_store.search.call_args[0]
    assert call_args[3] == 0.4  # score_threshold 第 4 个位置参数


def test_search_vector_result_has_score(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.92}]
    mock_faq_store.get_faq.return_value = _faq_row(1)
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    assert result["items"][0]["score"] == 0.92


def test_search_text_result_has_null_score(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = []
    mock_faq_store.search_by_text.return_value = [_faq_row(2)]

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    assert result["items"][0]["score"] is None


def test_search_deduplicates_by_faq_id(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.8}]
    mock_faq_store.get_faq.return_value = _faq_row(1)
    # FAQ 1 同时出现在文本搜索结果中
    mock_faq_store.search_by_text.return_value = [_faq_row(1), _faq_row(2)]

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    ids = [item["id"] for item in result["items"]]
    assert ids.count(1) == 1  # 不重复
    assert 2 in ids


def test_search_vector_results_before_text(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.8}]
    mock_faq_store.get_faq.return_value = _faq_row(1)
    mock_faq_store.search_by_text.return_value = [_faq_row(2)]

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    items = result["items"]
    assert items[0]["id"] == 1 and items[0]["score"] == 0.8
    assert items[1]["id"] == 2 and items[1]["score"] is None


def test_search_returns_all_statuses(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = [{"faq_id": 1, "score": 0.9}]
    mock_faq_store.get_faq.return_value = _faq_row(1, status="draft")
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        result = svc.search("kb1", "query")

    assert len(result["items"]) == 1
    assert result["items"][0]["status"] == "draft"


def test_search_no_rewrite_query_called(svc, mock_kb_store, mock_faq_store, mock_vector_store):
    mock_kb_store.get_kb.return_value = {"name": "kb1"}
    mock_vector_store.search.return_value = []
    mock_faq_store.search_by_text.return_value = []

    with patch("src.core.rag.embedding.get_embed_model") as mock_embed, \
         patch("src.core.faq_match.rewrite_query") as mock_rewrite:
        mock_embed.return_value.get_text_embedding.return_value = [0.1] * 10
        svc.search("kb1", "query")

    mock_rewrite.assert_not_called()
```

- [ ] **Step 2: 运行测试，确认全部失败**

```bash
poetry run pytest tests/services/test_faq_service.py -k "search" -v 2>&1 | tail -20
```

Expected: 多个 FAIL（方法签名或逻辑不匹配）

- [ ] **Step 3: 重写 `src/services/faq_service.py` 的 `search()` 方法**

首先，移除第 17 行的 LLM 改写导入：

```python
# 删除这一行：
from src.core.faq_match import rewrite_query as _rewrite_query
```

然后将 `search()` 方法（当前第 387~438 行）完整替换为：

```python
    def search(self, kb_name: str, query: str, top_k: int = 10, score_threshold: float = 0.4) -> dict:
        """混合搜索：向量相似度 + MySQL 关键词并集，结果去重后合并。

        向量命中（score >= score_threshold）排前，纯关键词命中排后。
        不过滤 status / enabled，管理端可见全部状态。

        Args:
            kb_name: 知识库名称。
            query: 搜索词，直接 embed，不经 LLM 改写。
            top_k: 向量搜索最多返回候选数。
            score_threshold: 向量相关性门槛（默认 0.4）。

        Returns:
            {"items": [...向量结果(score 有值), ...纯文本结果(score=None)]}

        Raises:
            KnowledgeBaseNotFoundError: 知识库不存在。
            RuntimeError: 向量化或向量检索失败。
        """
        self._require_kb(kb_name)

        from src.core.rag.embedding import get_embed_model  # late import

        try:
            embed_model = get_embed_model(text_type="query")
            vector: list[float] = embed_model.get_text_embedding(query)
        except (ValueError, RuntimeError, DashScopeException) as e:
            self.logger.warning("[FAQService] search embed 失败: %s", e)
            raise RuntimeError("查询向量化失败，请稍后重试") from e

        try:
            hits = self._vector_store.search(
                kb_name, vector, top_k, score_threshold, {"source_type": "faq"}
            )
        except VectorStoreError as e:
            self.logger.warning("[FAQService] search Qdrant 失败: %s", e)
            raise RuntimeError("向量检索失败，请稍后重试") from e

        # 向量结果：回查 MySQL 获取完整行，不过滤 status/enabled
        vector_items: list[dict] = []
        vector_ids: set[int] = set()
        for hit in hits:
            faq_id = hit.get("faq_id")
            if not isinstance(faq_id, int) or faq_id in vector_ids:
                continue
            row = self._faq_store.get_faq(faq_id)
            if row and row["kb_name"] == kb_name:
                vector_items.append({**row, "score": hit["score"]})
                vector_ids.add(faq_id)

        # 文本结果：去掉已在向量结果中的，score=None
        text_rows = self._faq_store.search_by_text(kb_name, query)
        text_items = [
            {**row, "score": None}
            for row in text_rows
            if row["id"] not in vector_ids
        ]

        return {"items": vector_items + text_items}
```

- [ ] **Step 4: 运行所有 search 测试，确认通过**

```bash
poetry run pytest tests/services/test_faq_service.py -k "search" -v
```

Expected: 全部 PASS（包含 Task 2 写的 schema 测试）

- [ ] **Step 5: 运行全套测试，确认无回归**

```bash
poetry run pytest tests/services/test_faq_service.py -v
```

Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/faq_service.py tests/services/test_faq_service.py
git commit -m "feat(service): rewrite FAQService.search as vector+text hybrid, remove LLM rewrite"
```

---

### Task 4: Route — 权限 + Schema 导入更新

**Files:**
- Modify: `src/api/routes/faq.py`

- [ ] **Step 1: 确认 `FAQSearchItem` 已在 schemas `__init__.py` 导出**

打开 `src/api/schemas/__init__.py`，找到 `FAQSearchResponse` 所在的导出块，在同一位置加入 `FAQSearchItem`：

```python
from src.api.schemas.faq import (
    FAQCreate,
    FAQImportError,
    FAQImportResult,
    FAQItem,
    FAQSearchItem,   # 新增
    FAQSearchResponse,
    FAQUpdate,
)
```

同时在 `__all__` 列表中加入 `"FAQSearchItem"`（如果有 `__all__` 的话）。

- [ ] **Step 3: 修改 `search_faqs` 路由权限依赖**

找到以下路由（第 88 行附近）：

```python
@router.get("/{kb_name}/search", response_model=FAQSearchResponse)
async def search_faqs(
    kb_name: str,
    q: str = QueryParam(..., min_length=1, description="搜索词，LLM 改写后语义向量检索"),
    current_user: dict = Depends(get_current_user),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    """LLM 改写查询 + 语义向量检索 FAQ（仅返回已启用的条目）。"""
    try:
        return await asyncio.to_thread(svc.search, kb_name, q)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
```

替换为：

```python
@router.get("/{kb_name}/search", response_model=FAQSearchResponse)
async def search_faqs(
    kb_name: str,
    q: str = QueryParam(..., min_length=1, description="搜索词，向量 + 关键词混合检索"),
    current_user: dict = Depends(require_teacher_or_admin),
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    """向量语义 + MySQL 关键词混合搜索 FAQ，返回全部状态（含草稿/待审核）。"""
    try:
        return await asyncio.to_thread(svc.search, kb_name, q)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
```

- [ ] **Step 4: 验证 FastAPI 启动无报错**

```bash
poetry run python -c "from src.api.app import app; print('routes OK')"
```

Expected: `routes OK`

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/faq.py src/api/schemas/__init__.py src/api/schemas/faq.py
git commit -m "feat(route): restrict FAQ search to teacher/admin, use hybrid search"
```

---

### Task 5: 前端 — 类型更新

**Files:**
- Modify: `frontend/src/shared/types/api.ts`

- [ ] **Step 1: 在 `FAQSearchResponse` 前新增 `FAQSearchItem`，并更新 Response**

打开 `frontend/src/shared/types/api.ts`，找到：

```typescript
export interface FAQSearchResponse {
  rewritten_query: string;
  items: FAQItem[];
}
```

替换为：

```typescript
export interface FAQSearchItem extends FAQItem {
  score: number | null;
}

export interface FAQSearchResponse {
  items: FAQSearchItem[];
}
```

- [ ] **Step 2: 验证 TypeScript 编译无报错**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 无输出（0 errors）或只有与本次无关的已有错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/types/api.ts
git commit -m "feat(types): add FAQSearchItem with score, drop rewritten_query from FAQSearchResponse"
```

---

### Task 6: 前端 — FaqToolbar 清空按钮

**Files:**
- Modify: `frontend/src/features/faq/components/FaqToolbar.tsx`

- [ ] **Step 1: 在 `FaqToolbarProps` 中新增 `onClearSearch` prop**

打开 `frontend/src/features/faq/components/FaqToolbar.tsx`，找到：

```typescript
interface FaqToolbarProps {
  kbs: KBInfo[] | undefined;
  selectedKb: string;
  onKbChange: (val: string) => void;
  searchText: string;
  onSearchChange: (val: string) => void;
  isSearching: boolean;
  isAiSearch: boolean;
  totalCount: number;
  approvedCount: number;
  isAdmin: boolean;
  onImportClick: () => void;
  onCreateClick: () => void;
  onExportExcel: () => void;
  onDownloadTemplate: () => void;
}
```

替换为（新增 `onClearSearch`）：

```typescript
interface FaqToolbarProps {
  kbs: KBInfo[] | undefined;
  selectedKb: string;
  onKbChange: (val: string) => void;
  searchText: string;
  onSearchChange: (val: string) => void;
  onClearSearch: () => void;
  isSearching: boolean;
  isAiSearch: boolean;
  totalCount: number;
  approvedCount: number;
  isAdmin: boolean;
  onImportClick: () => void;
  onCreateClick: () => void;
  onExportExcel: () => void;
  onDownloadTemplate: () => void;
}
```

- [ ] **Step 2: 在函数参数解构中加入 `onClearSearch`**

找到：

```typescript
export function FaqToolbar({
  kbs,
  selectedKb,
  onKbChange,
  searchText,
  onSearchChange,
  isSearching,
  isAiSearch,
```

替换为：

```typescript
export function FaqToolbar({
  kbs,
  selectedKb,
  onKbChange,
  searchText,
  onSearchChange,
  onClearSearch,
  isSearching,
  isAiSearch,
```

- [ ] **Step 3: 在 imports 中加入 `X` 图标**

找到：

```typescript
import {
  Plus,
  Search,
  Loader2,
  Sparkles,
  Download,
  FileText,
  Upload,
  ChevronDown,
} from "lucide-react";
```

替换为：

```typescript
import {
  Plus,
  Search,
  Loader2,
  Sparkles,
  X,
  Download,
  FileText,
  Upload,
  ChevronDown,
} from "lucide-react";
```

- [ ] **Step 4: 将搜索框右侧的 AI 徽章替换为条件渲染（有内容时显示 ✕，无内容时显示 AI 徽章）**

找到：

```tsx
            <div
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${isAiSearch ? "bg-violet-100 text-violet-600" : "bg-[#F2EFE9] text-[#8A8A8A]"}`}
            >
              <Sparkles size={10} />
              AI
            </div>
```

替换为：

```tsx
            {searchText ? (
              <button
                onClick={onClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#8A8A8A] hover:text-[#334155] hover:bg-[#F2EFE9] transition-colors"
                aria-label="清空搜索"
              >
                <X size={12} />
              </button>
            ) : (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F2EFE9] text-[#8A8A8A]">
                <Sparkles size={10} />
                AI
              </div>
            )}
```

- [ ] **Step 5: 验证 TypeScript 编译无报错**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 无新增 error（FaqManagement 会报 onClearSearch 缺失，下一个 Task 修复）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/faq/components/FaqToolbar.tsx
git commit -m "feat(toolbar): add clear search button, replace AI badge when search active"
```

---

### Task 7: 前端 — FaqManagement 修 ghost state + FilterBar 隐藏

**Files:**
- Modify: `frontend/src/features/faq/components/FaqManagement.tsx`

- [ ] **Step 1: 修复 ghost state — searchText 清空时立即清 debouncedSearch**

打开 `frontend/src/features/faq/components/FaqManagement.tsx`，找到：

```typescript
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 500);
    return () => clearTimeout(timer);
  }, [searchText]);
```

替换为：

```typescript
  useEffect(() => {
    if (!searchText) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 500);
    return () => clearTimeout(timer);
  }, [searchText]);
```

- [ ] **Step 2: 新增 `handleClearSearch` 处理器**

在 `handleKbChange` 函数后插入：

```typescript
  const handleClearSearch = () => {
    setSearchText("");
    setDebouncedSearch("");
    setCategoryFilter("全部");
  };
```

- [ ] **Step 3: 将 `onClearSearch` 传给 FaqToolbar**

找到 `<FaqToolbar` 的调用，在 `onSearchChange` prop 后加入：

```tsx
          onClearSearch={handleClearSearch}
```

- [ ] **Step 4: 搜索模式下隐藏 FilterBar**

找到：

```tsx
      {selectedKb && (
        <div style={settle(50)}>
          <FaqFilterBar
```

替换为：

```tsx
      {selectedKb && !isAiSearch && (
        <div style={settle(50)}>
          <FaqFilterBar
```

- [ ] **Step 5: 验证 TypeScript 编译无报错**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 无新增 error

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/faq/components/FaqManagement.tsx
git commit -m "fix(faq): fix ghost state on clear, hide FilterBar during search mode"
```

---

### Task 8: 前端 — FaqTable / FaqCard 搜索结果徽章

**Files:**
- Modify: `frontend/src/features/faq/components/FaqTable.tsx`

- [ ] **Step 1: 给 `FaqCardProps` 新增 `score` 和 `searchMode` 可选 props**

打开 `frontend/src/features/faq/components/FaqTable.tsx`，找到：

```typescript
interface FaqCardProps {
  faq: FAQItem;
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onUpdate: (id: number, payload: FAQUpdate) => void;
}
```

替换为：

```typescript
interface FaqCardProps {
  faq: FAQItem;
  score?: number | null;
  searchMode?: boolean;
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onUpdate: (id: number, payload: FAQUpdate) => void;
}
```

- [ ] **Step 2: 在 `FaqCard` 函数参数中解构新 props**

找到：

```typescript
function FaqCard({ faq, onEdit, onDelete, onUpdate }: FaqCardProps) {
```

替换为：

```typescript
function FaqCard({ faq, score, searchMode, onEdit, onDelete, onUpdate }: FaqCardProps) {
```

- [ ] **Step 3: 在问题文字右侧、`canManage` 操作按钮左侧插入徽章**

找到（问题文字和分类标签之间的区域）：

```tsx
        <p className="text-sm text-[#334155] font-medium truncate flex-1 min-w-0">
          {faq.question}
        </p>
        {faq.category && (
```

替换为：

```tsx
        <p className="text-sm text-[#334155] font-medium truncate flex-1 min-w-0">
          {faq.question}
        </p>
        {searchMode && score != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium shrink-0">
            {Math.round(score * 100)}%
          </span>
        )}
        {searchMode && score == null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F2EFE9] text-[#8A8A8A] font-medium shrink-0">
            关键词
          </span>
        )}
        {faq.category && (
```

- [ ] **Step 4: 给 `FaqTableProps` 新增 `searchMode` prop**

找到：

```typescript
interface FaqTableProps {
  faqs: FAQItem[];
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onUpdate: (id: number, payload: FAQUpdate) => void;
}
```

替换为：

```typescript
interface FaqTableProps {
  faqs: FAQItem[];
  searchMode?: boolean;
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onUpdate: (id: number, payload: FAQUpdate) => void;
}
```

- [ ] **Step 5: 在 `FaqTable` 函数中传递 `searchMode` 和 `score` 给 `FaqCard`**

找到：

```typescript
export function FaqTable({ faqs, onEdit, onDelete, onUpdate }: FaqTableProps) {
```

替换为：

```typescript
export function FaqTable({ faqs, searchMode, onEdit, onDelete, onUpdate }: FaqTableProps) {
```

找到 `.map()` 中的 `<FaqCard`：

```tsx
        <div
          key={faq.id}
          style={{
            animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both`,
          }}
        >
          <FaqCard
            faq={faq}
            onEdit={onEdit}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        </div>
```

替换为：

```tsx
        <div
          key={faq.id}
          style={{
            animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both`,
          }}
        >
          <FaqCard
            faq={faq}
            score={"score" in faq ? (faq as { score: number | null }).score : undefined}
            searchMode={searchMode}
            onEdit={onEdit}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        </div>
```

- [ ] **Step 6: 在 FaqManagement 中给 FaqTable 传入 `searchMode`**

打开 `frontend/src/features/faq/components/FaqManagement.tsx`，找到：

```tsx
          <FaqTable
            faqs={displayFaqs}
            onEdit={setEditTarget}
            onDelete={handleDeleteClick}
            onUpdate={handleUpdate}
          />
```

替换为：

```tsx
          <FaqTable
            faqs={displayFaqs}
            searchMode={isAiSearch}
            onEdit={setEditTarget}
            onDelete={handleDeleteClick}
            onUpdate={handleUpdate}
          />
```

- [ ] **Step 7: 验证 TypeScript 编译全量无报错**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: 无新增 error

- [ ] **Step 8: 运行后端全套测试，确认无回归**

```bash
poetry run pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: 全部 PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/faq/components/FaqTable.tsx frontend/src/features/faq/components/FaqManagement.tsx
git commit -m "feat(faq): show score/keyword badges in search results"
```
