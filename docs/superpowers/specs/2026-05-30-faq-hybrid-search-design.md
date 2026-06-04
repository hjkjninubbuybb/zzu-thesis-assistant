# FAQ 混合搜索重构设计文档

## 目标

重构管理端 FAQ 语义搜索：移除无效的 LLM 查询改写，加入 MySQL 关键词搜索，合并为向量+文本混合搜索，修复权限和状态过滤逻辑，补全前端体验缺陷。

## 背景与现有问题

| 问题 | 现状 | 影响 |
|------|------|------|
| LLM 改写 | 每次搜索调用快速模型改写查询词 | 增加 1~2s 延迟，管理员关键词搜索不需要 |
| status 过滤错误 | 只返回 `approved` 状态 | 草稿/待审核/已驳回 FAQ 无法被找到 |
| score_threshold=None | Qdrant 不过滤相关性 | 返回大量不相关结果 |
| score 丢失 | 返回值不含相关性分数 | 前端无法展示结果质量 |
| 纯向量无关键词 | 精确关键词可能向量距离较远 | 管理员按关键词查找效率低 |
| 权限过松 | `get_current_user`，student 可调用 | 管理端功能对 student 暴露 |
| 前端 ghost state | 清空搜索后 500ms 仍显示旧结果 | 体验割裂 |
| FilterBar 假激活 | 搜索模式下 FilterBar 显示但无效 | 误导用户 |

## 架构

### 数据流

```
Admin 输入关键词
  ↓ 500ms debounce（前端）
  ↓ GET /faq/{kb_name}/search?q=...  [require_teacher_or_admin]
  ↓
FAQService.search(kb_name, query)
  ├── 向量搜索：embed(query) → Qdrant
  │     score_threshold=0.4，top_k=10
  │     filter: source_type=faq
  │     → [{faq_id, score}, ...]
  │     → 回查 MySQL 获取完整 row（不过滤 status/enabled）
  │
  ├── 文本搜索：FAQStore.search_by_text(kb_name, query, limit=20)
  │     SQL: question LIKE %q% OR answer LIKE %q%
  │     所有状态，不过滤 enabled
  │     → [{id, question, answer, status, ...}, ...]
  │
  └── 合并
        向量结果（带 score，按 score 降序）
        + 纯文本结果（score=None，按 sort_order/id 排序，去掉已在向量结果里的）
        → {"items": [...]}
```

### 层职责

| 层 | 职责 |
|----|------|
| `FAQStore.search_by_text()` | MySQL LIKE 查询，纯数据访问 |
| `FAQService.search()` | 编排向量+文本搜索，合并去重 |
| Route `search_faqs` | 权限守卫（require_teacher_or_admin），参数传递 |
| Frontend `FaqToolbar` | 搜索框 UI，清空按钮 |
| Frontend `FaqManagement` | 搜索模式状态管理，FilterBar 控制 |
| Frontend `FaqTable/FaqCard` | 结果渲染，score/关键词徽章展示 |

## 后端详细设计

### 1. `src/storage/interfaces/faq_store.py`

新增抽象方法：

```python
@abstractmethod
def search_by_text(self, kb_name: str, query: str, limit: int = 20) -> list[dict]:
    """question 或 answer 包含 query 的 FAQ，不过滤 status/enabled，按 sort_order ASC, id DESC 排序。"""
```

### 2. `src/storage/faq_store.py`

实现 `search_by_text()`：

```python
def search_by_text(self, kb_name: str, query: str, limit: int = 20) -> list[dict]:
    like = f"%{query}%"
    sql = """
        SELECT * FROM faqs
        WHERE kb_name = %s
          AND (question LIKE %s OR answer LIKE %s)
        ORDER BY sort_order ASC, id DESC
        LIMIT %s
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (kb_name, like, like, limit))
            return cur.fetchall()
    finally:
        conn.close()
```

### 3. `src/api/schemas/faq.py`

新增 `FAQSearchItem`，继承 `FAQItem` 加 `score` 字段：

```python
class FAQSearchItem(FAQItem):
    score: float | None = None

class FAQSearchResponse(BaseModel):
    items: list[FAQSearchItem]
```

移除旧的 `rewritten_query` 字段。

### 4. `src/services/faq_service.py` — `search()` 重写

```python
def search(self, kb_name: str, query: str, top_k: int = 10, score_threshold: float = 0.4) -> dict:
    self._require_kb(kb_name)

    # 向量搜索
    try:
        embed_model = get_embed_model(text_type="query")
        vector = embed_model.get_text_embedding(query)
    except (ValueError, RuntimeError, DashScopeException) as e:
        raise RuntimeError("查询向量化失败，请稍后重试") from e

    try:
        hits = self._vector_store.search(kb_name, vector, top_k, score_threshold, {"source_type": "faq"})
    except VectorStoreError as e:
        raise RuntimeError("向量检索失败，请稍后重试") from e

    # 向量结果回查 MySQL，不过滤 status/enabled
    vector_items: list[dict] = []
    vector_faq_ids: set[int] = set()
    for hit in hits:
        faq_id = hit.get("faq_id")
        if not isinstance(faq_id, int) or faq_id in vector_faq_ids:
            continue
        row = self._faq_store.get_faq(faq_id)
        if row and row["kb_name"] == kb_name:
            vector_items.append({**row, "score": hit["score"]})
            vector_faq_ids.add(faq_id)

    # 文本搜索
    text_rows = self._faq_store.search_by_text(kb_name, query)
    text_items = [
        {**row, "score": None}
        for row in text_rows
        if row["id"] not in vector_faq_ids
    ]

    return {"items": vector_items + text_items}
```

**关键变化：**
- 无 `_rewrite_query` 调用
- `score_threshold=0.4`（有意义的相关性门槛）
- 向量回查不过滤 `status`/`enabled`
- 合并：向量结果在前，纯文本结果去重追加，score=None

### 5. `src/api/routes/faq.py` — `search_faqs`

```python
@router.get("/{kb_name}/search", response_model=FAQSearchResponse)
async def search_faqs(
    kb_name: str,
    q: str = QueryParam(..., min_length=1),
    current_user: dict = Depends(require_teacher_or_admin),  # 改这里
    svc: FAQService = Depends(get_faq_service),
) -> dict:
    try:
        return await asyncio.to_thread(svc.search, kb_name, q)
    except KnowledgeBaseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
```

## 前端详细设计

### 1. `frontend/src/shared/types/api.ts`

```typescript
export interface FAQSearchItem extends FAQItem {
  score: number | null;
}

export interface FAQSearchResponse {
  items: FAQSearchItem[];   // 去掉 rewritten_query
}
```

### 2. `frontend/src/features/faq/components/FaqToolbar.tsx`

新增 `onClearSearch: () => void` prop。

搜索框内容非空时，右侧 `AI` 徽章替换为 ✕ 按钮：
```tsx
{searchText ? (
  <button
    onClick={onClearSearch}
    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#8A8A8A] hover:text-[#334155] hover:bg-[#F2EFE9] transition-colors"
  >
    <X size={12} />
  </button>
) : (
  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F2EFE9] text-[#8A8A8A]">
    <Sparkles size={10} /> AI
  </div>
)}
```

### 3. `frontend/src/features/faq/components/FaqManagement.tsx`

**修 ghost state**：searchText 变为空时立即清 debouncedSearch：
```tsx
useEffect(() => {
  if (!searchText) {
    setDebouncedSearch("");
    return;
  }
  const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 500);
  return () => clearTimeout(timer);
}, [searchText]);
```

**清空处理器**：
```tsx
const handleClearSearch = () => {
  setSearchText("");
  setDebouncedSearch("");
};
```

**FilterBar 在搜索模式下隐藏**：
```tsx
{selectedKb && !isAiSearch && (
  <div style={settle(50)}>
    <FaqFilterBar ... />
  </div>
)}
```

**FaqToolbar 传入 `onClearSearch`**：
```tsx
<FaqToolbar
  ...
  onClearSearch={handleClearSearch}
/>
```

### 4. `frontend/src/features/faq/components/FaqTable.tsx`

`FaqTable` 接受 `searchMode?: boolean`，并把每个 item 的 `score` 作为独立 prop 传给 `FaqCard`（避免 `FAQItem` 类型上无 `score` 字段的 TypeScript 报错）：

```tsx
// FaqTable props
interface FaqTableProps {
  faqs: FAQItem[];
  searchMode?: boolean;
  onEdit: ...;
  onDelete: ...;
  onUpdate: ...;
}

// map 时取 score（FAQSearchItem 扩展了 FAQItem，score 在运行时存在）
{faqs.map((faq, i) => (
  <div key={faq.id} style={{ animation: ... }}>
    <FaqCard
      faq={faq}
      score={"score" in faq ? (faq as { score: number | null }).score : undefined}
      searchMode={searchMode}
      onEdit={onEdit}
      onDelete={onDelete}
      onUpdate={onUpdate}
    />
  </div>
))}
```

`FaqCard` 新增 props：
```tsx
interface FaqCardProps {
  faq: FAQItem;
  score?: number | null;      // 新增
  searchMode?: boolean;       // 新增
  onEdit: ...;
  onDelete: ...;
  onUpdate: ...;
}
```

徽章渲染在问题文字右侧（`canManage` 按钮左侧）：
```tsx
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
```

`FaqManagement` 传入 `searchMode={isAiSearch}`。

## 测试计划

### 后端（`tests/services/test_faq_service.py`）

新增测试覆盖 `search()` 的以下场景：

| 测试 | 断言 |
|------|------|
| KB 不存在 | 抛 `KnowledgeBaseNotFoundError` |
| embed 失败 | 抛 `RuntimeError` |
| 向量搜索失败 | 抛 `RuntimeError` |
| score_threshold=0.4 传给向量存储 | `mock_vector_store.search` 第4参数 == 0.4 |
| 向量命中含 score | items[0]["score"] == hit["score"] |
| 文本命中 score=None | 纯文本结果 score is None |
| 向量+文本去重 | 同一 faq_id 不重复出现 |
| 向量结果排前面 | 有 score 的 items 在 score=None 的前面 |
| 不过滤 status | draft/pending/rejected 均出现在结果 |
| LLM 改写不调用 | `_rewrite_query` 未被调用 |

新增测试覆盖 `FAQStore.search_by_text()`（`tests/storage/test_document_store.py` 或新建 `tests/storage/test_faq_store.py`）：

| 测试 | 断言 |
|------|------|
| 命中 question | 返回包含该 FAQ |
| 命中 answer | 返回包含该 FAQ |
| 跨 kb_name 隔离 | 其他 kb 的 FAQ 不出现 |
| 不过滤 status | draft 状态也返回 |

## 不在本次范围内

- 学生端 FAQ 浏览器（`StudentFaqBrowser`）的搜索逻辑不变，继续使用旧的语义匹配防线（`faq_match.py`）
- FAQ 聊天防线（`faq_match.py` / `try_faq_match()`）不改动
- BM25 检索器（RAG 流程）不涉及
