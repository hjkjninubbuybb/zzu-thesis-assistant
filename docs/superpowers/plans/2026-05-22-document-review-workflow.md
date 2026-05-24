# Document Review Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert human review steps between cleaning→chunking and chunking→vectorization so admins can preview/edit cleaned text (Markdown split view) and preview chunks before confirming index.

**Architecture:** Split the monolithic `index_document` into three phases (parse+clean, split, embed+store), each triggered by a separate API endpoint. Frontend adds two new pages: a Markdown editor with live preview, and a read-only chunk list. Documents flow through `pending_review` → `pending_chunk_review` → `active` states.

**Tech Stack:** FastAPI (backend), React 19 + TypeScript + react-markdown + Tailwind CSS (frontend), MySQL (state/chunks storage), Qdrant (vectors)

---

## File Structure

### Backend — new/modified files

| File | Responsibility |
|------|---------------|
| `src/core/indexing.py` (modify) | Extract `parse_and_clean()`, `split_content()`, `embed_and_store_nodes()` from existing monolith |
| `src/api/routes/document.py` (modify) | Add 3 new endpoints, update upload to call `parse_and_clean` only |
| `src/api/schemas.py` (modify) | Add request/response models for the 3 new endpoints |
| `src/storage/document_store.py` (modify) | Add `chunks_preview` to allowed update fields |
| `sql/init.sql` (modify) | Add `chunks_preview TEXT` column to documents table |
| `frontend/src/types/api.ts` (modify) | Add new response types |
| `frontend/src/lib/api.ts` (modify) | Add 3 new API methods |
| `frontend/src/App.tsx` (modify) | Add 2 new routes |
| `frontend/src/pages/DocumentPage.tsx` (modify) | Update upload flow + status badges + list click behavior |
| `frontend/src/pages/DocumentCleanReviewPage.tsx` (create) | Markdown split-view editor page |
| `frontend/src/pages/DocumentChunkReviewPage.tsx` (create) | Read-only chunk preview page |
| `frontend/src/lib/uploadContext.tsx` (modify) | Upload returns doc_id + cleaned content, navigate to review page |

---

## Task 1: Database Schema — Add `chunks_preview` Column

**Files:**
- Modify: `sql/init.sql:83-96`
- Modify: `src/storage/document_store.py:95` (allowed fields set)

- [ ] **Step 1: Add `chunks_preview` column to DDL**

In `sql/init.sql`, add the column after the `summary` line (line 93):

```sql
chunks_preview LONGTEXT NULL COMMENT '分块预览 JSON（确认入库后清空）',
```

The full `documents` table DDL becomes:

```sql
CREATE TABLE IF NOT EXISTS documents (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kb_name     VARCHAR(100) NOT NULL                   COMMENT '所属知识库名',
    file_name   VARCHAR(255) NOT NULL                   COMMENT '文件名',
    file_size   INT UNSIGNED NOT NULL DEFAULT 0         COMMENT '文件字节数',
    chunk_count INT UNSIGNED NOT NULL DEFAULT 0         COMMENT '切块数量',
    chunk_size  INT UNSIGNED NOT NULL DEFAULT 256       COMMENT '切块大小',
    doc_type    VARCHAR(20)  NOT NULL DEFAULT 'plain_text' COMMENT '文档类型',
    status      VARCHAR(20)  NOT NULL DEFAULT 'processing' COMMENT '处理状态',
    summary     TEXT         NULL                          COMMENT 'LLM 生成的全局摘要',
    chunks_preview LONGTEXT NULL                           COMMENT '分块预览 JSON（确认入库后清空）',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_kb (kb_name),
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档表';
```

- [ ] **Step 2: Run ALTER TABLE on existing database**

```bash
cd /Users/gefeng/projects/rag1.0
# Connect to MySQL and add the column (skip if table is being recreated)
docker exec -i rag-mysql mysql -uroot -proot rag_db -e \
  "ALTER TABLE documents ADD COLUMN chunks_preview LONGTEXT NULL COMMENT '分块预览 JSON（确认入库后清空）' AFTER summary;"
```

Expected: `Query OK, N rows affected`

- [ ] **Step 3: Update allowed fields in `update_document()`**

In `src/storage/document_store.py:95`, add `"chunks_preview"` to the allowed set:

```python
allowed = {"summary", "content", "chunk_count", "status", "chunk_size",
           "chunk_overlap_ratio", "splitter_type", "chunks_preview"}
```

- [ ] **Step 4: Commit**

```bash
git add sql/init.sql src/storage/document_store.py
git commit -m "feat(db): add chunks_preview column to documents table"
```

---

## Task 2: Backend — Extract Phased Functions from `indexing.py`

**Files:**
- Modify: `src/core/indexing.py:53-489`

Split `index_document` + `_index_*_document` + `_embed_and_store` into three reusable phase functions. Keep the original `index_document` working (it will be called by reindex, etc.) but extract the logic so the new endpoints can call each phase independently.

- [ ] **Step 1: Add `parse_and_clean()` function**

Add this function after the existing `_get_splitter_config()` (after line 263 in `indexing.py`). This function handles phases 1+2: parsing and cleaning, returning the cleaned text.

```python
def parse_and_clean(
    kb_name: str,
    file_path: Path,
    original_filename: str,
    doc_type: str = "policy",
    enable_cleaning: bool = True,
) -> str:
    """解析文件并清洗文本，返回清洗后的文本内容。

    Args:
        kb_name: 知识库名称。
        file_path: 文件路径。
        original_filename: 原始文件名。
        doc_type: 文档类型（policy/manual/form）。
        enable_cleaning: 是否启用 LLM 清洗。

    Returns:
        清洗后的文本。
    """
    ext = file_path.suffix.lower()
    parser = get_parser(ext)

    if doc_type == "manual" and ext == ".pdf":
        raw_text = _parse_multimodal_pdf_with_kb(kb_name, file_path, original_filename)
        if not raw_text.strip():
            raw_text = parser.parse(file_path).all_text()
    elif doc_type == "form":
        raw_text = parser.parse(file_path).all_text()
    else:
        raw_text = parser.parse(file_path).all_text()

    text = _clean_or_fallback(raw_text, kb_name, doc_type=doc_type, enable=enable_cleaning)

    if doc_type == "manual":
        cfg = get_config()
        image_dir = _get_image_dir(kb_name, original_filename)
        vlm_model = cfg.get("models", {}).get("vlm", "qwen-vl-plus")
        if image_dir.exists():
            from src.core.image_describer import inject_image_descriptions
            text = inject_image_descriptions(text, image_dir, vlm_model)

    return text
```

- [ ] **Step 2: Add `split_content()` function**

Add below `parse_and_clean()`:

```python
def split_content(
    text: str,
    file_name: str,
    kb_name: str,
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    doc_type: str = "policy",
) -> list:
    """对清洗后的文本执行分块，返回 TextNode 列表。

    Args:
        text: 清洗后的文本。
        file_name: 文件名。
        kb_name: 知识库名称。
        splitter_type: 分块策略。
        chunk_size: 分块大小。
        chunk_overlap_ratio: 分块重叠比例。
        doc_type: 文档类型。

    Returns:
        TextNode 列表。
    """
    if doc_type == "form":
        from src.core.form_extraction.graph import extract_form_sections
        sections = extract_form_sections(text, file_name)
        if sections and sections[0].get("extraction_status") != "PASS":
            from llama_index.core.schema import TextNode
            nodes = []
            for sec in sections:
                node = TextNode(
                    text=sec["text"],
                    metadata={
                        "file_name": file_name,
                        "kb_name": kb_name,
                        "doc_type": doc_type,
                        "section_topic": sec.get("section_topic", ""),
                    },
                )
                nodes.append(node)
            if nodes:
                return nodes
        # fallback to regular splitting
    return _split_text(text, file_name, kb_name, splitter_type, chunk_size, chunk_overlap_ratio, doc_type)
```

- [ ] **Step 3: Add `embed_and_store_nodes()` public wrapper**

Add below `split_content()`:

```python
def embed_and_store_nodes(
    kb_name: str,
    file_name: str,
    file_size: int,
    chunk_size: int,
    doc_type: str,
    nodes: list,
    full_text: str = "",
    splitter_type: str = "recursive",
    chunk_overlap_ratio: float = 0.2,
    vector_store: VectorStore | None = None,
    doc_store: DocumentStore | None = None,
    doc_id: int | None = None,
) -> dict:
    """对已有的 TextNode 列表执行向量化并入库。

    当 doc_id 不为 None 时，更新已有文档记录而非创建新记录。

    Args:
        kb_name: 知识库名称。
        file_name: 文件名。
        file_size: 文件大小（字节）。
        chunk_size: 分块大小。
        doc_type: 文档类型。
        nodes: TextNode 列表。
        full_text: 完整清洗文本（用于摘要生成）。
        splitter_type: 分块策略。
        chunk_overlap_ratio: 重叠比例。
        vector_store: 向量库实例。
        doc_store: 文档库实例。
        doc_id: 已有文档 ID（审核流程用）。

    Returns:
        {"doc_id": int, "file_name": str, "chunk_count": int}
    """
    vs = vector_store or VectorStore()
    ds = doc_store or DocumentStore()

    summary = _generate_document_summary(file_name, full_text)

    if not nodes:
        if doc_id:
            ds.update_document(doc_id, chunk_count=0, status="active",
                               summary=summary, chunks_preview=None)
            return {"doc_id": doc_id, "file_name": file_name, "chunk_count": 0}
        doc_record = ds.add_document(
            kb_name=kb_name, file_name=file_name, file_size=file_size,
            chunk_count=0, chunk_size=chunk_size, doc_type=doc_type,
            splitter_type=splitter_type, status="active", summary=summary,
            content=full_text,
        )
        return {"doc_id": doc_record["id"], "file_name": file_name, "chunk_count": 0}

    from src.core.rag.embedding import get_embed_model
    embed_model = get_embed_model(text_type="document")
    texts = [n.get_content() for n in nodes]
    vectors = embed_model.get_text_embedding_batch(texts)

    if doc_id:
        ds.update_document(doc_id, chunk_count=len(nodes), status="active",
                           summary=summary, chunks_preview=None)
        doc_record = ds.get_document(doc_id)
    else:
        doc_record = ds.add_document(
            kb_name=kb_name, file_name=file_name, file_size=file_size,
            chunk_count=len(nodes), chunk_size=chunk_size, doc_type=doc_type,
            splitter_type=splitter_type, status="active", summary=summary,
            content=full_text, chunk_overlap_ratio=chunk_overlap_ratio,
        )

    actual_doc_id = doc_id or doc_record["id"]
    vs.create_collection(kb_name)
    payloads = []
    ids = []
    for node in nodes:
        payload = {"text": node.get_content(), "file_name": file_name,
                   "kb_name": kb_name, "node_id": node.node_id,
                   "doc_id": actual_doc_id}
        payload.update({k: v for k, v in node.metadata.items() if k not in payload})
        payloads.append(payload)
        ids.append(node.node_id)

    try:
        vs.add_vectors(kb_name, vectors, payloads, ids)
    except Exception:
        logger.exception("[embed_and_store_nodes] Qdrant 写入失败，回滚 MySQL")
        if not doc_id:
            ds.delete_document(actual_doc_id)
        raise

    return {"doc_id": actual_doc_id, "file_name": file_name, "chunk_count": len(nodes)}
```

- [ ] **Step 4: Verify existing `index_document` still works**

The original `index_document` and its `_index_*_document` helpers remain unchanged. The new functions extract duplicated logic but don't replace the old code path — `reindex_document` and any other callers continue to work as before.

```bash
cd /Users/gefeng/projects/rag1.0
poetry run python -c "from src.core.indexing import parse_and_clean, split_content, embed_and_store_nodes; print('imports OK')"
```

Expected: `imports OK`

- [ ] **Step 5: Commit**

```bash
git add src/core/indexing.py
git commit -m "feat(indexing): extract parse_and_clean, split_content, embed_and_store_nodes phase functions"
```

---

## Task 3: Backend — Add Pydantic Schemas

**Files:**
- Modify: `src/api/schemas.py:58-67`

- [ ] **Step 1: Add new schema classes**

Add after the existing `IndexRequest` class (after line 67):

```python
class CleanResult(BaseModel):
    """upload-and-clean 接口的响应。"""
    doc_id: int
    file_name: str
    cleaned_content: str
    doc_type: str
    splitter_type: str
    chunk_size: int
    chunk_overlap_ratio: float


class ConfirmCleanRequest(BaseModel):
    """confirm-clean 接口的请求体。"""
    content: str = Field(..., min_length=1, description="管理员编辑后的清洗文本")


class ChunkPreview(BaseModel):
    """单个 chunk 预览。"""
    index: int
    content: str


class ChunkPreviewResult(BaseModel):
    """confirm-clean 接口的响应。"""
    doc_id: int
    chunks: list[ChunkPreview]
    chunk_count: int


class ConfirmIndexResult(BaseModel):
    """confirm-index 接口的响应。"""
    doc_id: int
    status: str
    chunk_count: int


class ReviewDetail(BaseModel):
    """审核中文档的详情。"""
    doc_id: int
    file_name: str
    status: str
    cleaned_content: str | None = None
    chunks: list[ChunkPreview] | None = None
    doc_type: str
    splitter_type: str
    chunk_size: int
    chunk_overlap_ratio: float
```

- [ ] **Step 2: Commit**

```bash
git add src/api/schemas.py
git commit -m "feat(schemas): add review workflow request/response models"
```

---

## Task 4: Backend — Add Three Review API Endpoints

**Files:**
- Modify: `src/api/routes/document.py:1-254`

- [ ] **Step 1: Add imports for new schemas and functions**

At the top of `document.py`, update the schema imports (around line 8) to include the new types:

```python
from src.api.schemas import (
    DocInfo, DocDetail, DocUpdate, MessageResponse,
    CleanResult, ConfirmCleanRequest, ChunkPreview,
    ChunkPreviewResult, ConfirmIndexResult, ReviewDetail,
)
```

Add the new indexing imports (around line 14):

```python
from src.core.indexing import (
    index_document, reindex_document, delete_document,
    parse_and_clean, split_content, embed_and_store_nodes,
)
```

Also add `json` to stdlib imports:

```python
import json
```

- [ ] **Step 2: Add `POST /{kb_name}/upload-and-clean` endpoint**

Add this endpoint before the existing upload endpoint (before line 104). This replaces the upload flow for the review workflow:

```python
@router.post("/{kb_name}/upload-and-clean", response_model=CleanResult)
async def upload_and_clean(
    kb_name: str,
    file: UploadFile = File(...),
    splitter_type: str = Form(default="recursive"),
    chunk_size: int = Form(default=256, ge=64, le=1024),
    chunk_overlap_ratio: float = Form(default=0.2, ge=0.0, le=0.5),
    doc_type: str = Form(default="policy"),
    _: dict = Depends(require_teacher_or_admin),
):
    """上传文件 → 解析 → 清洗 → 返回清洗文本供审核。"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTS and ext not in CONVERTIBLE_EXTS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")

    tmp = _UPLOADS_DIR / kb_name / f"tmp_{file.filename}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    try:
        content_bytes = await file.read()
        if len(content_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "文件大小超过 10 MB 限制")
        tmp.write_bytes(content_bytes)

        file_path = tmp
        original_name = file.filename or tmp.name
        if ext in CONVERTIBLE_EXTS:
            from src.parsers import convert_to_pdf
            file_path = convert_to_pdf(tmp)
            original_name = Path(original_name).with_suffix(".pdf").name

        cleaned_text = await asyncio.to_thread(
            parse_and_clean,
            kb_name=kb_name,
            file_path=file_path,
            original_filename=original_name,
            doc_type=doc_type,
            enable_cleaning=True,
        )

        file_size = len(content_bytes)
        doc_record = _ds.add_document(
            kb_name=kb_name,
            file_name=original_name,
            file_size=file_size,
            chunk_count=0,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
            doc_type=doc_type,
            splitter_type=splitter_type,
            status="pending_review",
            content=cleaned_text,
        )

        # Persist original file
        dest = _UPLOADS_DIR / kb_name / f"{doc_record['id']}_{original_name}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if file_path != tmp:
            import shutil
            shutil.copy2(file_path, dest)
        else:
            tmp.rename(dest)

        return CleanResult(
            doc_id=doc_record["id"],
            file_name=original_name,
            cleaned_content=cleaned_text,
            doc_type=doc_type,
            splitter_type=splitter_type,
            chunk_size=chunk_size,
            chunk_overlap_ratio=chunk_overlap_ratio,
        )
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
```

- [ ] **Step 3: Add `POST /{kb_name}/{doc_id}/confirm-clean` endpoint**

Add after the `upload-and-clean` endpoint:

```python
@router.post("/{kb_name}/{doc_id}/confirm-clean", response_model=ChunkPreviewResult)
async def confirm_clean(
    kb_name: str,
    doc_id: int,
    body: ConfirmCleanRequest,
    _: dict = Depends(require_teacher_or_admin),
):
    """确认清洗文本 → 执行分块 → 返回分块预览。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(404, "文档不存在")
    if doc["status"] != "pending_review":
        raise HTTPException(400, f"文档状态不正确: {doc['status']}，需要 pending_review")

    _ds.update_document(doc_id, content=body.content)

    nodes = await asyncio.to_thread(
        split_content,
        text=body.content,
        file_name=doc["file_name"],
        kb_name=kb_name,
        splitter_type=doc.get("splitter_type", "recursive"),
        chunk_size=doc.get("chunk_size", 256),
        chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
        doc_type=doc.get("doc_type", "policy"),
    )

    # Serialize nodes for later retrieval
    chunks_data = []
    for i, node in enumerate(nodes):
        chunks_data.append({
            "index": i,
            "content": node.get_content(),
            "metadata": {k: v for k, v in node.metadata.items()},
            "node_id": node.node_id,
        })
    _ds.update_document(doc_id, chunks_preview=json.dumps(chunks_data, ensure_ascii=False),
                        status="pending_chunk_review")

    chunks = [ChunkPreview(index=c["index"], content=c["content"]) for c in chunks_data]
    return ChunkPreviewResult(doc_id=doc_id, chunks=chunks, chunk_count=len(chunks))
```

- [ ] **Step 4: Add `POST /{kb_name}/{doc_id}/confirm-index` endpoint**

Add after `confirm-clean`:

```python
@router.post("/{kb_name}/{doc_id}/confirm-index", response_model=ConfirmIndexResult)
async def confirm_index(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
):
    """确认分块结果 → 向量化入库。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(404, "文档不存在")
    if doc["status"] != "pending_chunk_review":
        raise HTTPException(400, f"文档状态不正确: {doc['status']}，需要 pending_chunk_review")

    chunks_json = doc.get("chunks_preview")
    if not chunks_json:
        raise HTTPException(400, "分块预览数据丢失")

    chunks_data = json.loads(chunks_json)

    # Reconstruct TextNode list
    from llama_index.core.schema import TextNode
    nodes = []
    for c in chunks_data:
        node = TextNode(
            text=c["content"],
            metadata=c.get("metadata", {}),
            id_=c.get("node_id", ""),
        )
        nodes.append(node)

    result = await asyncio.to_thread(
        embed_and_store_nodes,
        kb_name=kb_name,
        file_name=doc["file_name"],
        file_size=doc.get("file_size", 0),
        chunk_size=doc.get("chunk_size", 256),
        doc_type=doc.get("doc_type", "policy"),
        nodes=nodes,
        full_text=doc.get("content", ""),
        splitter_type=doc.get("splitter_type", "recursive"),
        chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
        vector_store=_vs,
        doc_store=_ds,
        doc_id=doc_id,
    )

    return ConfirmIndexResult(
        doc_id=doc_id,
        status="active",
        chunk_count=result["chunk_count"],
    )
```

- [ ] **Step 5: Add `GET /{kb_name}/{doc_id}/review` endpoint**

Add after `confirm-index` — this lets the frontend fetch review details for resuming an interrupted review:

```python
@router.get("/{kb_name}/{doc_id}/review", response_model=ReviewDetail)
async def get_review_detail(
    kb_name: str,
    doc_id: int,
    _: dict = Depends(require_teacher_or_admin),
):
    """获取审核中文档的详情（清洗文本 + 分块预览）。"""
    doc = _ds.get_document(doc_id)
    if not doc or doc["kb_name"] != kb_name:
        raise HTTPException(404, "文档不存在")
    if doc["status"] not in ("pending_review", "pending_chunk_review"):
        raise HTTPException(400, f"文档不在审核状态: {doc['status']}")

    chunks = None
    if doc["status"] == "pending_chunk_review" and doc.get("chunks_preview"):
        chunks_data = json.loads(doc["chunks_preview"])
        chunks = [ChunkPreview(index=c["index"], content=c["content"]) for c in chunks_data]

    return ReviewDetail(
        doc_id=doc_id,
        file_name=doc["file_name"],
        status=doc["status"],
        cleaned_content=doc.get("content"),
        chunks=chunks,
        doc_type=doc.get("doc_type", "policy"),
        splitter_type=doc.get("splitter_type", "recursive"),
        chunk_size=doc.get("chunk_size", 256),
        chunk_overlap_ratio=doc.get("chunk_overlap_ratio", 0.2),
    )
```

- [ ] **Step 6: Verify server starts**

```bash
cd /Users/gefeng/projects/rag1.0
poetry run python -c "from src.api.routes.document import router; print('router OK, routes:', [r.path for r in router.routes])"
```

Expected: should include the 4 new paths among the routes.

- [ ] **Step 7: Commit**

```bash
git add src/api/routes/document.py
git commit -m "feat(api): add upload-and-clean, confirm-clean, confirm-index, review endpoints"
```

---

## Task 5: Frontend — Add TypeScript Types and API Methods

**Files:**
- Modify: `frontend/src/types/api.ts:50-61`
- Modify: `frontend/src/lib/api.ts:277-326`

- [ ] **Step 1: Add new types to `api.ts`**

Add after `UploadParams` (after line 61 of `types/api.ts`):

```typescript
export interface CleanResult {
  doc_id: number;
  file_name: string;
  cleaned_content: string;
  doc_type: string;
  splitter_type: string;
  chunk_size: number;
  chunk_overlap_ratio: number;
}

export interface ChunkPreview {
  index: number;
  content: string;
}

export interface ChunkPreviewResult {
  doc_id: number;
  chunks: ChunkPreview[];
  chunk_count: number;
}

export interface ConfirmIndexResult {
  doc_id: number;
  status: string;
  chunk_count: number;
}

export interface ReviewDetail {
  doc_id: number;
  file_name: string;
  status: string;
  cleaned_content: string | null;
  chunks: ChunkPreview[] | null;
  doc_type: string;
  splitter_type: string;
  chunk_size: number;
  chunk_overlap_ratio: number;
}
```

- [ ] **Step 2: Add API methods to `documentApi`**

In `frontend/src/lib/api.ts`, add these methods inside the `documentApi` object (after the existing `getDownloadToken` method, around line 325):

```typescript
  uploadAndClean: (
    kbName: string,
    file: File,
    params: UploadParams,
    onProgress?: (pct: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('splitter_type', params.splitter_type);
    form.append('chunk_size', String(params.chunk_size));
    form.append('chunk_overlap_ratio', String(params.chunk_overlap_ratio));
    form.append('doc_type', params.doc_type);
    return client
      .post<CleanResult>(`/document/${kbName}/upload-and-clean`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      })
      .then((r) => r.data);
  },

  confirmClean: (kbName: string, docId: number, content: string) =>
    client.post<ChunkPreviewResult>(`/document/${kbName}/${docId}/confirm-clean`, { content }),

  confirmIndex: (kbName: string, docId: number) =>
    client.post<ConfirmIndexResult>(`/document/${kbName}/${docId}/confirm-index`),

  getReview: (kbName: string, docId: number) =>
    client.get<ReviewDetail>(`/document/${kbName}/${docId}/review`),
```

Also add the new type imports at the top of `api.ts`:

```typescript
import type {
  DocType, UploadParams, CleanResult, ChunkPreviewResult, ConfirmIndexResult, ReviewDetail,
} from '@/types/api';
```

- [ ] **Step 3: Commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
git add src/types/api.ts src/lib/api.ts
git commit -m "feat(frontend): add review workflow types and API methods"
```

---

## Task 6: Frontend — Upload Context Refactor

**Files:**
- Modify: `frontend/src/lib/uploadContext.tsx:1-141`

The upload context needs to call `uploadAndClean` instead of `upload`, and provide the `CleanResult` so the page can navigate to the review page.

- [ ] **Step 1: Update UploadItem type and upload call**

In `uploadContext.tsx`, update the `UploadItem` interface to store the clean result:

```typescript
export interface UploadItem {
  id: string;
  file: File;
  kbName: string;
  docType: DocType;
  params: UploadParams;
  status: UploadStatus;
  progress: number;
  chunkCount?: number;
  errorMsg?: string;
  cleanResult?: CleanResult;
}
```

Add the import:

```typescript
import type { DocType, UploadParams, CleanResult } from '@/types/api';
```

- [ ] **Step 2: Change `startLoop` to call `uploadAndClean`**

Replace the `documentApi.upload(...)` call (line 60) with `documentApi.uploadAndClean(...)`:

```typescript
const doc = await documentApi.uploadAndClean(
  pending.kbName,
  pending.file,
  pending.params,
  (pct) =>
    updateQueue((prev) =>
      prev.map((q) => (q.id === pending.id ? { ...q, progress: pct } : q)),
    ),
);
updateQueue((prev) =>
  prev.map((q) =>
    q.id === pending.id
      ? { ...q, status: 'done' as const, progress: 100, cleanResult: doc }
      : q,
  ),
);
```

Remove the old `chunkCount: doc.chunk_count` line — it's replaced by `cleanResult: doc`.

- [ ] **Step 3: Commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
git add src/lib/uploadContext.tsx
git commit -m "feat(upload): switch to uploadAndClean, store CleanResult for review navigation"
```

---

## Task 7: Frontend — Document Clean Review Page (Markdown Split View)

**Files:**
- Create: `frontend/src/pages/DocumentCleanReviewPage.tsx`

- [ ] **Step 1: Create the page component**

```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { documentApi } from '@/lib/api';
import type { ReviewDetail } from '@/types/api';

export default function DocumentCleanReviewPage() {
  const { kbName, docId } = useParams<{ kbName: string; docId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If navigating from upload, initial content is passed via state; otherwise fetch from API
  const initialContent = searchParams.get('initial') ? null : undefined;

  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Fetch review detail (for resume scenario — navigating from doc list)
  const { data: review } = useQuery({
    queryKey: ['review', kbName, docId],
    queryFn: () => documentApi.getReview(kbName!, Number(docId!)).then((r) => r.data),
    enabled: !!kbName && !!docId,
  });

  useEffect(() => {
    if (review && !loaded) {
      setContent(review.cleaned_content || '');
      setLoaded(true);
    }
  }, [review, loaded]);

  // Accept content from navigation state (upload just completed)
  useEffect(() => {
    const state = window.history.state?.usr as { cleanedContent?: string } | undefined;
    if (state?.cleanedContent && !loaded) {
      setContent(state.cleanedContent);
      setLoaded(true);
    }
  }, [loaded]);

  const confirmMutation = useMutation({
    mutationFn: () => documentApi.confirmClean(kbName!, Number(docId!), content).then((r) => r.data),
    onSuccess: (result) => {
      navigate(`/admin/document/${kbName}/${docId}/chunks`, {
        state: { chunks: result.chunks, chunkCount: result.chunk_count },
      });
    },
  });

  const handleDiscard = () => {
    if (window.confirm('确定放弃此文档？将删除已上传的文件。')) {
      documentApi.delete(kbName!, Number(docId!));
      navigate('/admin/documents?kb=' + kbName);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">审核清洗结果</h2>
          <p className="text-sm text-gray-500">{review?.file_name || '文档'} — 编辑后点击确认进入分块预览</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDiscard}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            放弃
          </button>
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending || !content.trim()}
            className="px-4 py-2 text-sm text-white bg-black rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {confirmMutation.isPending ? '分块中...' : '确认并分块'}
          </button>
        </div>
      </div>

      {/* Error display */}
      {confirmMutation.isError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
          分块失败：{(confirmMutation.error as Error).message}
        </div>
      )}

      {/* Split pane: editor + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Markdown source editor */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
            Markdown 源码
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 p-4 font-mono text-sm leading-relaxed resize-none outline-none bg-white"
            placeholder="清洗后的文本..."
            spellCheck={false}
          />
        </div>

        {/* Right: Markdown rendered preview */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
            渲染预览
          </div>
          <div className="flex-1 p-4 overflow-y-auto prose prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
git add src/pages/DocumentCleanReviewPage.tsx
git commit -m "feat(frontend): add DocumentCleanReviewPage with Markdown split-view editor"
```

---

## Task 8: Frontend — Document Chunk Review Page

**Files:**
- Create: `frontend/src/pages/DocumentChunkReviewPage.tsx`

- [ ] **Step 1: Create the page component**

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { documentApi } from '@/lib/api';
import type { ChunkPreview } from '@/types/api';

export default function DocumentChunkReviewPage() {
  const { kbName, docId } = useParams<{ kbName: string; docId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Accept chunks from navigation state (confirm-clean just completed)
  useEffect(() => {
    const state = location.state as { chunks?: ChunkPreview[]; chunkCount?: number } | null;
    if (state?.chunks && !loaded) {
      setChunks(state.chunks);
      setLoaded(true);
    }
  }, [location.state, loaded]);

  // Fallback: fetch from API if no navigation state (resume scenario)
  const { data: review } = useQuery({
    queryKey: ['review', kbName, docId],
    queryFn: () => documentApi.getReview(kbName!, Number(docId!)).then((r) => r.data),
    enabled: !!kbName && !!docId && !loaded,
  });

  useEffect(() => {
    if (review?.chunks && !loaded) {
      setChunks(review.chunks);
      setLoaded(true);
    }
  }, [review, loaded]);

  const confirmMutation = useMutation({
    mutationFn: () => documentApi.confirmIndex(kbName!, Number(docId!)).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', kbName] });
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] });
      navigate('/admin/documents?kb=' + kbName);
    },
  });

  const handleBack = () => {
    navigate(`/admin/document/${kbName}/${docId}/review`);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">分块预览</h2>
          <p className="text-sm text-gray-500">共 {chunks.length} 个分块 — 确认后将向量化入库</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            返回编辑
          </button>
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-black rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {confirmMutation.isPending ? '入库中...' : '确认入库'}
          </button>
        </div>
      </div>

      {/* Error display */}
      {confirmMutation.isError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
          入库失败：{(confirmMutation.error as Error).message}
        </div>
      )}

      {/* Chunk list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chunks.map((chunk) => (
          <div
            key={chunk.index}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <span className="text-xs font-mono font-medium text-gray-500">
                #{chunk.index + 1}
              </span>
              <span className="text-xs text-gray-400">
                {chunk.content.length} 字符
              </span>
            </div>
            <div className="p-3 prose prose-sm max-w-none text-sm">
              <ReactMarkdown>{chunk.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
git add src/pages/DocumentChunkReviewPage.tsx
git commit -m "feat(frontend): add DocumentChunkReviewPage with read-only chunk cards"
```

---

## Task 9: Frontend — Add Routes and Update Document List

**Files:**
- Modify: `frontend/src/App.tsx:53-58`
- Modify: `frontend/src/pages/DocumentPage.tsx`

- [ ] **Step 1: Add routes in `App.tsx`**

Import the two new pages at the top of `App.tsx`:

```typescript
import DocumentCleanReviewPage from '@/pages/DocumentCleanReviewPage';
import DocumentChunkReviewPage from '@/pages/DocumentChunkReviewPage';
```

Add the two routes inside the admin route group (after the `/admin/documents` route, around line 55):

```typescript
<Route path="document/:kbName/:docId/review" element={<DocumentCleanReviewPage />} />
<Route path="document/:kbName/:docId/chunks" element={<DocumentChunkReviewPage />} />
```

- [ ] **Step 2: Update upload flow in `DocumentPage.tsx`**

The upload flow currently calls `addFiles()` and the upload context handles everything. After the refactor, when an upload completes with `cleanResult`, the user needs to be navigated to the review page.

In `DocumentPage.tsx`, find where the upload queue items with `status === 'done'` are rendered and add navigation logic. Add a `useEffect` that watches the queue for completed items and navigates:

```typescript
import { useNavigate } from 'react-router-dom';

// Inside DocumentPage component:
const navigate = useNavigate();
const { queue } = useUpload();

// Watch for completed uploads and navigate to review
useEffect(() => {
  const justDone = queue.find(
    (q) => q.status === 'done' && q.cleanResult && q.kbName === selectedKb,
  );
  if (justDone?.cleanResult) {
    const { doc_id } = justDone.cleanResult;
    navigate(`/admin/document/${selectedKb}/${doc_id}/review`, {
      state: { cleanedContent: justDone.cleanResult.cleaned_content },
    });
  }
}, [queue, selectedKb, navigate]);
```

- [ ] **Step 3: Add status badges and click-to-resume in document list**

In the document list table in `DocumentPage.tsx` (around line 563-633), add status badge rendering and click behavior:

Replace the existing status display (or add one if not present) with:

```typescript
{/* Status badge */}
<td className="px-3 py-2">
  {doc.status === 'pending_review' && (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 cursor-pointer hover:bg-amber-200"
      onClick={() => navigate(`/admin/document/${selectedKb}/${doc.id}/review`)}
    >
      待审核
    </span>
  )}
  {doc.status === 'pending_chunk_review' && (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
      onClick={() => navigate(`/admin/document/${selectedKb}/${doc.id}/chunks`)}
    >
      待确认分块
    </span>
  )}
  {doc.status === 'active' && (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      已入库
    </span>
  )}
  {doc.status === 'completed' && (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      已入库
    </span>
  )}
</td>
```

Add "状态" to the table headers.

- [ ] **Step 4: Commit**

```bash
cd /Users/gefeng/projects/rag1.0/frontend
git add src/App.tsx src/pages/DocumentPage.tsx
git commit -m "feat(frontend): add review routes, upload-to-review navigation, status badges"
```

---

## Task 10: End-to-End Smoke Test

**Files:** No file changes — manual verification.

- [ ] **Step 1: Start the dev environment**

```bash
cd /Users/gefeng/projects/rag1.0
poetry run dev
```

Wait for both backend (`:8000`) and frontend (`:5173`) to be ready.

- [ ] **Step 2: Test the upload-and-clean flow**

1. Open `http://localhost:5173/admin/documents`
2. Select a knowledge base
3. Upload a small PDF or TXT file
4. Verify the loading state shows "正在解析和清洗..."
5. Verify you are redirected to the clean review page (`/admin/document/{kb}/{id}/review`)
6. Verify the left pane shows editable Markdown source
7. Verify the right pane shows rendered Markdown preview
8. Make an edit in the left pane, confirm the right pane updates in real-time

- [ ] **Step 3: Test the confirm-clean flow**

1. Click "确认并分块"
2. Verify loading state shows
3. Verify you are redirected to the chunk preview page (`/admin/document/{kb}/{id}/chunks`)
4. Verify chunk cards are displayed with index numbers and content

- [ ] **Step 4: Test the confirm-index flow**

1. Click "确认入库"
2. Verify loading state shows
3. Verify you are redirected back to the document list
4. Verify the document now shows "已入库" status badge

- [ ] **Step 5: Test the resume flow**

1. Upload another document
2. On the clean review page, navigate away (e.g., click sidebar)
3. Go back to document list — verify the document shows "待审核" badge
4. Click the badge — verify you return to the clean review page with content intact

- [ ] **Step 6: Test the "返回编辑" flow**

1. Complete clean review, reach chunk preview page
2. Click "返回编辑"
3. Verify you return to the clean review page
4. Make an edit, re-confirm — verify new chunks are generated

- [ ] **Step 7: Test the "放弃" flow**

1. Upload a document, reach clean review page
2. Click "放弃", confirm the dialog
3. Verify you return to the document list
4. Verify the document is deleted from the list
