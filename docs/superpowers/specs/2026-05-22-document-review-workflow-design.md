# 文档清洗审核工作流设计

## 概述

在文档上传流程中，在清洗与分块之间、分块与向量化之间各插入一个人工审核环节，让管理员可以预览/编辑清洗结果、预览分块结果后再确认入库。

## 流程

```
上传文件 → 解析+清洗（同步 loading）
  → 【步骤1】Markdown 编辑预览页（左右分栏：源码编辑 + 实时渲染）
  → 管理员点击"确认并分块"
  → 分块（同步 loading）
  → 【步骤2】分块只读预览页（chunk 列表，序号+内容卡片）
  → 管理员点击"确认入库"或"返回编辑"
  → 向量化入库（同步 loading）
  → 完成，跳回文档列表
```

所有文档强制走此流程，无可选开关。

## 文档状态流转

新增两个中间状态：

```
(上传+清洗完成) → pending_review → (确认清洗+分块完成) → pending_chunk_review → (确认入库+向量化完成) → active
```

- `pending_review`：清洗已完成，等待管理员审核/编辑清洗文本
- `pending_chunk_review`：分块已完成，等待管理员确认分块结果
- `active`：已向量化入库，可用于检索

文档列表中展示状态标签，`pending_review` / `pending_chunk_review` 状态的文档可点击继续审核。

## 后端 API 改造

### 拆分原 `upload_document` 为三个接口

#### 1. POST `/api/document/upload-and-clean`

**职责**：接收文件 → 解析 → 清洗 → 保存清洗文本到 MySQL → 返回结果

**请求**：`multipart/form-data`，与当前 `upload_document` 相同参数（`file`, `kb_name`, `splitter_type`, `chunk_size`, `chunk_overlap_ratio`, `doc_type`）

**处理流程**：
1. 文件验证 + 临时保存（复用现有逻辑）
2. Word → PDF 转换（如需）
3. 调用 `get_parser()` 解析
4. 调用 `clean_text()` 清洗（或 `_clean_or_fallback()`）
5. 对 manual 类型：调用 `inject_image_descriptions()`
6. 保存到 MySQL `documents` 表：`content` 字段存清洗后文本，`status = 'pending_review'`
7. 持久化原始文件到 `data/uploads/`

**响应**：
```json
{
  "doc_id": 42,
  "file_name": "xxx.pdf",
  "cleaned_content": "清洗后的 Markdown 文本...",
  "doc_type": "policy",
  "splitter_type": "recursive",
  "chunk_size": 256,
  "chunk_overlap_ratio": 0.2
}
```

#### 2. POST `/api/document/{doc_id}/confirm-clean`

**职责**：接收管理员编辑后的文本 → 分块 → 返回 chunks 预览

**请求体**：
```json
{
  "content": "管理员编辑后的 Markdown 文本..."
}
```

**处理流程**：
1. 校验 `doc_id` 存在且 `status == 'pending_review'`
2. 更新 MySQL `documents.content` 为编辑后的文本
3. 调用 `_split_text()` 分块（使用上传时保存的 `splitter_type`, `chunk_size`, `chunk_overlap_ratio` 参数）
4. 将 chunks 临时保存（JSON 序列化存到 `documents` 表的新字段 `chunks_preview`，或 `system_settings`）
5. 更新 `status = 'pending_chunk_review'`

**响应**：
```json
{
  "doc_id": 42,
  "chunks": [
    {"index": 0, "content": "第一个 chunk 的文本..."},
    {"index": 1, "content": "第二个 chunk 的文本..."}
  ],
  "chunk_count": 15
}
```

#### 3. POST `/api/document/{doc_id}/confirm-index`

**职责**：确认分块 → 向量化入库

**请求体**：无（空 body 或 `{}`）

**处理流程**：
1. 校验 `doc_id` 存在且 `status == 'pending_chunk_review'`
2. 从 MySQL 读取已保存的 chunks（`chunks_preview` 字段）
3. 反序列化为 `list[TextNode]`
4. 调用 `_embed_and_store()` 执行向量化入库
5. 清空 `chunks_preview` 字段，更新 `status = 'active'`, `chunk_count`

**响应**：
```json
{
  "doc_id": 42,
  "status": "active",
  "chunk_count": 15
}
```

### 保留原接口兼容

原 `POST /api/document/upload` 接口保留但标记为废弃（或直接移除，视情况而定）。`reindex_document` 流程不变——它重新分块+向量化已有的 `content` 字段。

### 获取审核中文档内容的接口

需要一个接口让前端获取 `pending_review` / `pending_chunk_review` 状态文档的内容：

#### GET `/api/document/{doc_id}/review`

**响应**：
```json
{
  "doc_id": 42,
  "file_name": "xxx.pdf",
  "status": "pending_review",
  "cleaned_content": "...",
  "chunks": [...],
  "doc_type": "policy",
  "splitter_type": "recursive",
  "chunk_size": 256,
  "chunk_overlap_ratio": 0.2
}
```

- `status == 'pending_review'` 时返回 `cleaned_content`，`chunks` 为 null
- `status == 'pending_chunk_review'` 时返回 `cleaned_content` + `chunks`

## 数据库改造

### documents 表变更

1. **`status` 字段**：当前可能没有或只有简单状态。新增枚举值：`pending_review`, `pending_chunk_review`, `active`, `failed`
2. **`chunks_preview` 字段**：新增 `TEXT` 类型字段，存放分块预览的 JSON（`confirm-index` 后清空）

```sql
ALTER TABLE documents
  ADD COLUMN chunks_preview TEXT DEFAULT NULL AFTER content;
-- status 字段如已存在，确保支持新枚举值
```

## 前端改造

### 新增页面/组件

#### 1. 文档清洗编辑页 `DocumentCleanReviewPage.tsx`

- **路由**：`/admin/document/:docId/review`
- **布局**：左右分栏
  - 左侧：Markdown 源码编辑器（`<textarea>` 或集成 CodeMirror/Monaco）
  - 右侧：实时 Markdown 渲染预览（使用 `react-markdown` 或类似库）
- **底部操作栏**：
  - "确认并分块"按钮 → 调用 `confirm-clean` API
  - "放弃"按钮 → 删除文档，回到列表

#### 2. 分块预览页 `DocumentChunkReviewPage.tsx`

- **路由**：`/admin/document/:docId/chunks`
- **布局**：垂直列表，每个 chunk 是一个只读卡片
  - 卡片头部：`# chunk 序号`
  - 卡片内容：chunk 文本（Markdown 渲染）
- **底部操作栏**：
  - "确认入库"按钮 → 调用 `confirm-index` API
  - "返回编辑"按钮 → 跳回清洗编辑页

#### 3. 上传流程改造

修改现有上传组件/逻辑：
- 上传接口改为调用 `upload-and-clean`
- 上传完成后携带 `doc_id` 跳转到清洗编辑页
- Loading 状态显示"正在解析和清洗..."

#### 4. 文档列表改造

- 状态标签：`pending_review` 显示黄色"待审核"、`pending_chunk_review` 显示蓝色"待确认分块"、`active` 显示绿色"已入库"
- 点击 `pending_review` 文档 → 跳转清洗编辑页
- 点击 `pending_chunk_review` 文档 → 跳转分块预览页

### 前端依赖

- Markdown 渲染：`react-markdown` + `remark-gfm`（如项目中没有需新增）
- 编辑器：原生 `<textarea>` 即可（简单方案），或 CodeMirror 6（更好的体验）

## 后端代码改造范围

| 文件 | 改动 |
|------|------|
| `src/api/routes/document.py` | 新增 3 个接口，修改上传逻辑 |
| `src/core/indexing.py` | 拆分 `index_document` 为 `parse_and_clean`（返回清洗文本）+ `split_content`（返回 chunks）+ `embed_and_store_chunks`（向量化） |
| `src/storage/document_store.py` | 新增 `chunks_preview` 字段读写，状态更新方法 |
| `src/api/schemas.py` | 新增请求/响应 Pydantic 模型 |
| `sql/init.sql` | `documents` 表添加 `chunks_preview` 字段 |

## 前端代码改造范围

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/DocumentCleanReviewPage.tsx` | 新增：Markdown 编辑预览页 |
| `frontend/src/pages/DocumentChunkReviewPage.tsx` | 新增：分块只读预览页 |
| `frontend/src/pages/DocumentPage.tsx` | 修改：上传流程、状态标签、列表点击行为 |
| `frontend/src/lib/api.ts` | 新增：3 个 API 方法 |
| `frontend/src/types/api.ts` | 新增：响应类型定义 |
| `frontend/src/App.tsx` | 新增：两个路由 |

## 不变的部分

- 清洗逻辑本身（`cleaning/graph.py`）不变
- 分块逻辑（`splitter.py`）不变
- 向量化逻辑（`_embed_and_store` 核心）不变
- 重索引流程不变
- FAQ、对话、工单等其他功能不受影响
