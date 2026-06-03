# 多平台 API 配置设计

**日期**：2026-06-03  
**状态**：待实现

## 1. 背景与目标

当前系统只有一套全局 API 平台配置（URL + Key），四种模型（推理型 LLM、快速 LLM、向量、重排序）全部共用同一个平台。

目标：让每种模型类型可以来自不同的 API 平台，例如 LLM 用 DashScope、向量模型用 SiliconFlow、快速模型用 Groq。

## 2. 设计决策

- **4 组独立配置**：推理型 LLM、快速 LLM、向量模型、重排序模型各自持有独立的 `api_base_url` + `api_key`
- **无兼容层**：项目未上线，直接替换旧的单组配置，不保留 `api_key` / `api_base_url` 旧键
- **统一测试按钮**：页面顶部一个「测试所有连接」按钮，并发测 4 组，行内显示各组结果
- **模型下拉框**：保留下拉选择，测试后从各组自己的 API 动态拉取可选模型列表
- **统一保存**：4 组 URL/Key 纳入页面顶部现有「保存配置」按钮统一提交，不单独保存

## 3. 前端变更

### 3.1 UI 布局

原「API 平台配置」`Section` 内部改为紧凑表格，4 行 × 4 列，沿用现有设计语言（暖米色背景、`rounded-2xl` 卡片、石灰色 `SettingsPrimitives`）：

```
[ 测试所有连接 ]  ✓推理型  ✓快速  ✗向量 401  ✓重排序

标签     | API 地址 input      | API Key input(pwd) | 模型 select
推理型   | dashscope.com/…    | sk-x••••           | qwen-plus ▾
快速     | dashscope.com/…    | sk-x••••           | qwen-turbo ▾
向量     | siliconflow.cn/…   | sk-y••••           | text-embedding-v3 ▾
重排序   | dashscope.com/…    | sk-x••••           | gte-rerank ▾
```

- 所有输入框直接可编辑，无「修改」按钮
- Key 字段 `type="password"`，点进去直接改
- 模型 `select` 初始显示已保存值；点「测试所有连接」后刷新各组的选项列表

### 3.2 文件改动

| 文件 | 改动 |
|------|------|
| `features/settings/components/ApiKeySection.tsx` | 重写为 4 行紧凑表格 + 顶部测试按钮 |
| `features/settings/components/ModelSettings.tsx` | 删除（模型 select 并入 ApiKeySection 表格） |
| `features/settings/hooks/useApiKeyManager.ts` | 重写，管理 4 组 URL/Key 状态及测试逻辑 |
| `features/settings/hooks/useModelOptions.ts` | 改为接收 4 组各自的模型列表 |
| `features/settings/hooks/settingsForm.ts` | `FormState` 新增 8 个字段（4×URL + 4×Key），删除单独的 `llm_model` / `llm_fast_model` / `embedding_model` / `reranker_model`（移入各组） |
| `shared/services/configSharedService.ts` | 更新 API 调用签名 |
| `shared/types/api.ts` | 更新 `SystemConfig` / API 请求响应类型 |

### 3.3 FormState 新结构（示意）

```ts
type ApiGroupForm = {
  api_base_url: string;
  api_key: string;       // 提交时空字符串 = 不修改
  model: string;
};

type FormState = {
  llm: ApiGroupForm;
  fast_llm: ApiGroupForm;
  embedding: ApiGroupForm;
  reranker: ApiGroupForm;
  // 检索 / splitter / rag 参数不变
  vector_top_k: number;
  // …
};
```

## 4. 后端变更

### 4.1 `src/config.py`

删除 `get_api_key()` / `get_api_base_url()`，替换为 4 个 getter，每个返回 `(url, key)` 元组：

```python
def get_llm_credentials() -> tuple[str | None, str]
def get_fast_llm_credentials() -> tuple[str | None, str]
def get_embedding_credentials() -> tuple[str | None, str]
def get_reranker_credentials() -> tuple[str | None, str]
```

读取优先级：`system_settings` DB → 环境变量 → `config.yaml`。

环境变量映射：

| 组 | URL 环境变量 | Key 环境变量 |
|----|-------------|-------------|
| llm | `LLM_API_BASE_URL` | `LLM_API_KEY` |
| fast_llm | `FAST_LLM_API_BASE_URL` | `FAST_LLM_API_KEY` |
| embedding | `EMBEDDING_API_BASE_URL` | `EMBEDDING_API_KEY` |
| reranker | `RERANKER_API_BASE_URL` | `RERANKER_API_KEY` |

`config.yaml` 对应结构调整：

```yaml
llm:
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: qwen-plus
  fast_model: qwen-turbo
  fast_api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
embedding:
  model: text-embedding-v3
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
reranker:
  model: gte-rerank
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
```

### 4.2 `system_settings` 新键

替换旧的 `api_key` / `api_base_url`：

```
llm_api_base_url        llm_api_key
fast_llm_api_base_url   fast_llm_api_key
embedding_api_base_url  embedding_api_key
reranker_api_base_url   reranker_api_key
```

### 4.3 `src/services/config_service.py`

| 旧方法 | 新方法 |
|--------|--------|
| `get_api_key_info()` | `get_api_credentials_info()` → 返回 4 组脱敏信息 |
| `update_api_key(key, url)` | 删除，改由 `update_config()` 统一处理（4 组 URL/Key 作为 ConfigUpdate 字段） |
| `test_api_connection()` | `test_all_connections()` → 并发测 4 组，返回各组 `{ok, message, models}` |
| `list_available_models()` | `list_models_for_group(group)` → 按组拉取 |

### 4.4 `src/api/routes/config.py` + `src/api/schemas/`

`GET /config/api-info` 响应结构：

```json
{
  "llm":      { "api_base_url": "...", "masked_key": "sk-x••••1234", "has_key": true },
  "fast_llm": { "api_base_url": "...", "masked_key": "sk-x••••1234", "has_key": true },
  "embedding":{ "api_base_url": "...", "masked_key": "sk-y••••5678", "has_key": true },
  "reranker": { "api_base_url": "...", "masked_key": "sk-x••••1234", "has_key": true }
}
```

`POST /config/test-connection` 响应结构：

```json
{
  "llm":      { "ok": true,  "message": "连接成功，发现 12 个模型", "models": [...] },
  "fast_llm": { "ok": true,  "message": "连接成功，发现 12 个模型", "models": [...] },
  "embedding":{ "ok": false, "message": "连接失败: 401 Unauthorized", "models": [] },
  "reranker": { "ok": true,  "message": "连接成功，发现 3 个模型",  "models": [...] }
}
```

`ConfigUpdate` schema 新增 8 个字段对应 4 组 URL/Key，`update_config()` 统一落库。

### 4.5 核心层调用点替换

以下文件中所有 `get_api_key()` / `get_api_base_url()` 调用替换为对应的新 getter：

- `src/core/agent/factory.py` → `get_llm_credentials()` / `get_fast_llm_credentials()`
- `src/core/indexing/` 各文件（embedding 相关）→ `get_embedding_credentials()`
- `src/core/agent/tools/` 等其他使用 LLM 的位置 → 按实际用途选对应 getter

## 5. 数据流

```
用户改字段 → FormState(llm/fast_llm/embedding/reranker) 
  → 点「保存配置」→ POST /config/update (含 4 组 URL/Key + 其他参数)
  → ConfigService.update_config() → system_settings DB + config.yaml

用户点「测试所有连接」→ POST /config/test-connection
  → ConfigService.test_all_connections() 并发 4 个 _fetch_remote_models()
  → 前端更新各组 models 列表 + 显示 ✓/✗ 状态
```

## 6. 不在本次范围内

- VLM（`vlm.model`）暂不纳入，它没有独立配置入口
- 环境变量 `.env.example` 更新（单独执行）
