# RAG 1.0 — 郑州大学毕业设计智能问答助手

基于 Agentic RAG 的毕业设计全流程问答系统，面向郑州大学计算机与人工智能学院/软件学院学生和教师。支持自然语言提问、文档智能检索、FAQ 快答、导师 Q&A 工单等功能。

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 后端框架 | FastAPI + Uvicorn |
| AI 编排 | LangGraph（手写 StateGraph）+ LangChain |
| LLM / Embedding / VLM | DashScope（qwen-plus / qwen-turbo / qwen-vl-plus） |
| 向量检索 | Qdrant + text-embedding-v3（1024 维） |
| 关键词检索 | BM25（bm25s + jieba 中文分词） |
| 重排序 | DashScope GTE-Rerank |
| 关系数据库 | MySQL 8.0 |
| 前端 | React 19 + TypeScript + Vite + TailwindCSS + TanStack Query |
| 运行时 | Python ≥ 3.10，Node ≥ 18 |
| 包管理 | Poetry（后端）/ npm（前端） |
| 容器化 | Docker Compose（Qdrant + MySQL） |

---

## 本地部署指南

> **关于配置**：本项目所有运行时配置（API Key、模型选择、检索参数等）均通过管理后台界面完成，**不需要手动编辑配置文件或创建 `.env` 文件**。

---

### 第一步：安装前置工具

根据你的操作系统选择对应命令：

#### macOS

```bash
# 安装 Homebrew（如果还没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Python、Node、Docker 运行时（Colima 轻量推荐）
brew install python@3.11 node colima docker docker-compose

# 安装 Poetry（Python 包管理）
pip3 install poetry
```

#### Windows

```powershell
# 以管理员身份打开 PowerShell
winget install Python.Python.3.11
winget install OpenJS.NodeJS.LTS
pip install poetry
# Docker Desktop 下载并安装后启动即可
# https://www.docker.com/products/docker-desktop/
```

> **Windows 建议**：推荐在 WSL2 + Ubuntu 下运行，避免路径和换行符问题。

#### Ubuntu / Debian Linux

```bash
sudo apt update && sudo apt install python3.11 python3-pip nodejs npm docker.io docker-compose -y
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # 免 sudo，需重新登录生效
pip3 install poetry
```

---

### 第二步：克隆项目

```bash
git clone https://github.com/hjkjninubbuybb/zzu-thesis-assistant.git
cd zzu-thesis-assistant
```

---

### 第三步：安装后端依赖

```bash
poetry install
```

Poetry 会自动创建虚拟环境并安装所有依赖（约 2-3 分钟）。

---

### 第四步：构建前端

> 仅生产模式（`poetry run start`）需要此步骤；开发模式（`poetry run dev`）会自动启动 Vite，跳过此步骤。

```bash
cd frontend
npm install
npm run build
cd ..
```

---

### 第五步：确保 Docker 运行时已启动

程序启动时会**自动执行** `docker compose up -d` 并等待 MySQL / Qdrant 就绪，无需手动操作。
但需要先确保 Docker daemon 本身在运行：

- **macOS（Colima）**：`colima start`
- **macOS / Windows（Docker Desktop）**：打开 Docker Desktop 应用，等待托盘图标变绿
- **Linux**：`sudo systemctl start docker`（或上一步已 enable，重登后自动启动）

---

### 第六步：启动服务

```bash
# 生产模式：前后端统一在 :8000
poetry run start

# 开发模式：前端 :5173（热重载）+ 后端 :8000（热重载）
poetry run dev
```

启动时程序会自动完成：
- 检测并启动 Colima（macOS）
- `docker compose up -d` 拉起 MySQL + Qdrant
- 等待数据库就绪（首次约 30 秒）
- 启动 FastAPI / Vite

---

### 第七步：在管理后台完成首次配置

打开浏览器，访问管理端：

| 模式 | 地址 |
|------|------|
| 生产模式 | http://localhost:8000/admin |
| 开发模式 | http://localhost:5173/admin |

**首次登录账号**：用户名 `admin`，密码 `admin123`

按以下顺序完成配置：

1. **填入 API Key**：「系统设置」→「API 配置」→ 填入 DashScope API Key（格式 `sk-xxxx`）→ 点击「测试连接」验证
2. **创建知识库**：「知识库管理」→ 新建知识库（随意命名）
3. **分配知识库**：知识库列表 → 将刚创建的知识库「设为学生知识库」
4. **上传文档**：「文档管理」→ 选择知识库 → 上传你的文档（PDF / Word / TXT）
5. **等待索引**：文档列表中状态变为「已完成」后即可使用

完成后切换到学生端验证：http://localhost:8000/student（或 :5173/student）

---

### 访问地址汇总

| 端点 | 生产模式 | 开发模式 |
|------|---------|---------|
| 管理端 | http://localhost:8000/admin | http://localhost:5173/admin |
| 学生端 | http://localhost:8000/student | http://localhost:5173/student |
| API 文档 | http://localhost:8000/docs | http://localhost:8000/docs |

---

### 生产环境安全建议（可选）

默认配置适合本地开发。用于对外部署时建议修改以下值（在启动前设置 shell 环境变量，或直接编辑 `configs/config.yaml`）：

```bash
# JWT 签名密钥（默认值不安全）
export AUTH_SECRET_KEY=你的随机长字符串

# MySQL 密码（需与 docker-compose.yml 中保持一致）
export MYSQL_PASSWORD=你的数据库密码
```

> 注意：本项目**不加载** `.env` 文件，以上变量需在启动终端的 shell 中直接 `export`，或写入 `~/.bashrc` / `~/.zshrc`。

---

### 常见问题

| 问题 | 解决方法 |
|------|---------|
| `Cannot connect to the Docker daemon` | macOS：运行 `colima start`；Windows：启动 Docker Desktop |
| 启动时卡在"等待 MySQL + Qdrant 就绪" | 首次拉取镜像较慢，耐心等待；若超时请检查 Docker 是否正常运行 |
| `poetry: command not found` | 重新打开终端，或将 `~/.local/bin` 加入 PATH |
| 端口 8000 / 5173 被占用 | 程序会自动 kill 占用进程，也可手动 `lsof -i :8000 \| kill` |
| 提问无响应 / 报 API 错误 | 检查管理后台「系统设置」→「API 配置」中 Key 是否已填入并测试通过 |
| 上传文档后索引卡住 | 同上，API Key 未配置时索引会失败 |
| Windows 路径 / 权限问题 | 推荐使用 WSL2 + Ubuntu 环境 |

---

## 系统架构

### 双层问答架构

```
用户提问
   │
   ▼
┌─────────────────────────────────────────┐
│ 第一层：FAQ 防线（faq_match.py）          │
│  LLM 改写查询 → embed → Qdrant 语义搜索  │
│  命中（score ≥ 0.75）→ fast_model 快答   │
│  回答含 [FALLBACK] → 降级到第二层         │
└──────────────────┬──────────────────────┘
                   │ 未命中或降级
                   ▼
┌─────────────────────────────────────────┐
│ 第二层：RAG Core（rag_pipeline.py）       │
│  StateGraph 三条路由：                   │
│   hard_rag → CRAG 深度评估 + 重写         │
│   download → 文件卡片下发                │
│   direct   → 闲聊直接生成                │
│  混合检索（Vector + BM25 + RRF）          │
│  GTE-Rerank → LLM 流式生成              │
└─────────────────────────────────────────┘
```

### RAG Pipeline 三条路由

| 路由 | 触发条件 | 检索策略 |
|------|---------|---------|
| `hard_rag` | 所有毕设相关的实质性问题 | 检索 + 强能力模型 CRAG 评估 + 最多 3 次重写 |
| `download` | 明确要求下载/获取文件 | 跳过检索，直接匹配文件 |
| `direct` | 闲聊、非毕设相关 | 跳过检索，直接生成 |

### 文档入库流程

```
上传文件
   │
   ▼
解析（PDF/DOCX/TXT）
   │
   ├─ policy ──→ LLM 清洗（LangGraph）→ 递归切分 → Embedding → Qdrant
   │
   ├─ manual ──→ 多模态 PDF 解析 → LLM 清洗 → VLM 图片描述注入 → 切分 → Embedding → Qdrant
   │
   └─ form ───→ Evaluator-Optimizer（LangGraph）→ 按主题提取 sections → 直接向量化
```

### 查询处理流程

```
query → enhance_query（规则扩写）
      → HybridRetriever（Vector + BM25 + RRF）
      → protect_raw_candidates（保护原始 top-N）
      → GTE-Rerank
      → StateGraph 路由 → LLM 生成
      → _apply_answer_safety_guards（硬编码规则兜底）
      → SSE 流式输出
```

---

## 目录结构

```
rag1.0/
├── configs/
│   └── config.yaml              # 全局配置（模型/检索/DB/Auth 等所有参数）
├── sql/
│   └── init.sql                 # MySQL 建表 DDL + 预置数据
├── docker-compose.yml           # Qdrant + MySQL 容器
├── pyproject.toml               # Poetry 依赖 + scripts（start/dev）
├── .env                         # 环境变量（不提交 git）
├── data/
│   ├── images/                  # VLM 图片缓存（按 kb_name/md5 组织）
│   └── calendar_cache.json      # 学术日历缓存
├── scripts/
│   ├── seed_demo_data.py        # 初始化演示数据
│   ├── seed_doc00_faqs.py       # 批量导入 FAQ
│   ├── evaluate_rag_dataset.py  # RAG 评测（完整数据集）
│   ├── evaluate_ragas_like_judge.py  # RAGAS 风格裁判评测
│   └── test_form_extraction.py  # form 提取功能测试
├── src/
│   ├── main.py                  # 启动入口（run/dev，自动管理 Docker + Vite）
│   ├── config.py                # YAML + env 配置加载（LRU cached，支持 DB 覆盖）
│   ├── api/
│   │   ├── app.py               # FastAPI 实例、路由注册、静态托管、startup hook
│   │   ├── auth.py              # JWT 生成/验证、bcrypt、角色守卫、ensure_default_admin
│   │   ├── schemas.py           # 所有 Pydantic 请求/响应模型
│   │   └── routes/
│   │       ├── auth.py          # /api/auth/* (login/refresh/me/password)
│   │       ├── chat.py          # /api/chat  (SSE 流式，双层问答入口)
│   │       ├── knowledge.py     # /api/knowledge/* (KB CRUD + active 设置)
│   │       ├── document.py      # /api/document/* (上传/下载/重索引/删除)
│   │       ├── faq.py           # /api/faq/* (CRUD + 批量导入导出 + 语义搜索)
│   │       ├── conversation.py  # /api/conversation/* (对话/消息/反馈)
│   │       ├── user.py          # /api/users/* (用户管理 + 学生/教师批量导入 + 导师关系)
│   │       ├── ticket.py        # /api/tickets/* (学生求助工单 → 导师回答)
│   │       ├── config.py        # /api/config/* (系统配置 + API Key 管理)
│   │       └── analytics.py     # /api/analytics/summary
│   ├── core/
│   │   ├── faq_match.py         # FAQ 防线：改写 → embed → Qdrant → fast_model
│   │   ├── rag_pipeline.py      # 主 RAG：手写 StateGraph + CRAG + safety guards
│   │   ├── tools.py             # Agent 工具（4 个：日历/文档列表/检索/文件链接）
│   │   ├── retrieval.py         # 混合检索：VectorRetriever + BM25Retriever + HybridRetriever
│   │   ├── retrieval_strategy.py # enhance_query（规则扩写）+ protect_raw_candidates
│   │   ├── reranker.py          # DashScope GTE-Rerank（分批并行）
│   │   ├── embedding.py         # DashScope Embedding 工厂函数
│   │   ├── indexing.py          # 文档入库分发（policy/manual/form 三条流水线）
│   │   ├── splitter.py          # 5 种切分策略工厂
│   │   ├── splitter_manual.py   # 操作手册步骤级切分（规则解析 + LLM 语义提取）
│   │   ├── image_describer.py   # VLM 批量图片描述（qwen-vl-plus，batch=8，MD5 缓存）
│   │   ├── cleaning/            # LangGraph 文本清洗子图
│   │   │   ├── graph.py         # optimizer → placeholder_check → evaluator
│   │   │   ├── nodes.py         # 三个节点实现
│   │   │   ├── prompts.py       # 清洗 / 评估 LLM 提示词
│   │   │   └── state.py         # CleaningState TypedDict
│   │   └── form_extraction/     # LangGraph 表单提取子图（Evaluator-Optimizer）
│   │       ├── graph.py         # extractor → evaluator → 条件循环（最多 3 次）
│   │       ├── nodes.py         # extractor_node（强模型）+ evaluator_node（快速模型）
│   │       ├── prompts.py       # 提取 / 评估提示词
│   │       └── state.py         # FormExtractionState TypedDict
│   ├── storage/
│   │   ├── database.py          # PyMySQL + DBUtils 连接池（DictCursor）
│   │   ├── document_store.py    # MySQL CRUD：KB/文档/FAQ/对话/消息/反馈/工单/系统设置
│   │   ├── user_store.py        # MySQL CRUD：用户/学生档案/教师档案/登录日志/导师关系
│   │   └── vector_store.py      # Qdrant 封装：集合管理/向量 CRUD/payload 过滤
│   └── parsers/                 # 文档解析器（PDF/DOCX/TXT/MD）
│       ├── base.py
│       ├── registry.py
│       ├── converter.py         # Word → PDF 转换
│       ├── txt_parser.py
│       ├── docx_parser.py
│       └── pdf/
│           ├── pdf_parser.py
│           ├── text_extractor.py    # pymupdf4llm 多模态提取
│           ├── image_extractor.py
│           └── table_extractor.py
└── frontend/
    ├── vite.config.ts
    ├── package.json
    └── src/
        ├── main.tsx / App.tsx
        ├── lib/
        │   ├── api.ts           # Axios client（自动 refresh）+ 9 个 API 模块
        │   └── auth.ts          # token 存取
        ├── types/api.ts         # 所有接口 TypeScript 类型定义
        ├── hooks/useAuth.ts
        ├── components/          # AuthProvider / RouteGuard / Layout / 通用组件
        └── pages/
            ├── LoginPage.tsx
            ├── OverviewPage.tsx         # 总览仪表盘
            ├── KnowledgeBasePage.tsx    # 知识库管理
            ├── DocumentPage.tsx         # 文档管理（上传/重索引）
            ├── FaqPage.tsx              # FAQ 管理（CRUD + 批量）
            ├── ConversationsPage.tsx    # 对话历史（管理员视角）
            ├── StudentsPage.tsx         # 学生账号管理 + 导师绑定
            ├── TeachersPage.tsx         # 教师账号管理
            ├── TicketsPage.tsx          # 导师 Q&A 工单
            ├── SettingsPage.tsx         # 系统配置（模型/检索/API Key）
            ├── AnalyticsPage.tsx        # 使用统计
            └── student/
                ├── StudentHomePage.tsx  # 学生聊天主界面
                ├── StudentFaqPage.tsx   # FAQ 浏览
                ├── StudentProfilePage.tsx
                └── StudentTicketsPage.tsx  # 学生工单（求助导师）
```

---

## 核心模块详解

### faq_match.py — FAQ 防线

```
raw_query
  → rewrite_query()     # fast_model 改写为标准问题形式
  → embed()             # DashScope text-embedding-v3
  → VectorStore.search(payload_filter={"source_type": "faq"}, threshold=0.75)
  → 回查 MySQL 确认 enabled=True & status='approved'
  → faq_generate()      # fast_model 生成回答
  → 若回答含 [FALLBACK] → 返回 None（降级到 RAG）
```

### rag_pipeline.py — 主 RAG 引擎

核心是一个**手写 StateGraph**（非 create_react_agent），包含以下节点：

| 节点 | 模型 | 职责 |
|------|------|------|
| `router_node` | fast_model | 意图分类（3 路由）+ 任务拆解 + 文件 hint 提取 |
| `retrieve_node` | — | 占位节点，实际检索由调用方注入 |
| `grade_documents_node` | 强能力模型 | CRAG 深度评估（hard_rag 触发） |
| `rewrite_query_node` | fast_model | 检索失败时改写查询词 |
| `document_link_node` | — | 文件模糊匹配，生成下载卡片 |
| `generate_node` | 强能力模型 | 最终回答生成（含 safety guards 拦截） |

**Safety Guards**：`_apply_answer_safety_guards()` 内置 20+ 条针对高频错误答案的硬编码规则（如查重率标准、开题时间、指导人数上限等），在 LLM 生成后直接替换，避免模型幻觉。

**两个公共函数**：
- `run_rag(query, retriever_fn, kb_name, history)` — 同步版，用于非流式场景
- `stream_rag(query, retriever_fn, kb_name, history)` — 流式 Generator，每步 yield 事件字典

### tools.py — Agent 工具

| 工具 | 类型 | 职责 |
|------|------|------|
| `list_kb_documents(kb_name)` | 直接工具 | 列出知识库文档和 chunk 数 |
| `get_academic_calendar()` | 直接工具 | 今日日期/星期/教学周（三级缓存） |
| `make_search_kb_tool(retriever_fn, captured_nodes)` | 工厂函数 | 运行时绑定检索器，返回 `search_knowledge_base` 工具 |
| `make_get_document_link_tool(kb_name, file_events)` | 工厂函数 | 运行时绑定 kb_name，返回 `get_document_link` 工具 |

**学术日历三级缓存**（`get_academic_calendar` 内部）：
1. 知识库语料（从 Qdrant 全量语料中提取开学日期，TTL=30 天）
2. 郑大官网爬取（TTL=120 天）
3. 过期缓存兜底 / 负缓存（失败时 TTL=1 天防止频繁重试）

### retrieval.py — 混合检索

```python
HybridRetriever(kb_name).retrieve(query)
  ├─ VectorRetriever    → Qdrant 语义搜索，top_k=10
  ├─ BM25Retriever      → jieba + bm25s，top_k=10（语料 LRU 缓存）
  └─ RRF 融合           → score = 1/(rrf_k + rank + 1)，合并排序，top_k=15
```

### retrieval_strategy.py — 检索增强策略

- `enhance_query(question)` — 基于规则的查询扩写（针对毕设特定关键词，如"开题""任务书""查重"等），召回率补充
- `protect_raw_candidates(raw, reranked, protect_n, final_n)` — 保证 Rerank 截断时不丢失原始 top-N 结果

### reranker.py — 重排序

- 模型：DashScope `gte-rerank`
- 批次大小：5，多批次用 ThreadPoolExecutor 并行执行
- 返回：全局按 score 排序后的 top_n 结果（默认 5）

### indexing.py — 文档入库（三条流水线）

| doc_type | 流程 |
|----------|------|
| `policy` | 解析 → `clean_text()` → 递归切分 → Embedding → Qdrant |
| `manual` | 多模态 PDF 解析（pymupdf4llm）→ 清洗 → VLM 描述注入 → 切分 → Embedding → Qdrant |
| `form` | 解析 → `extract_form_sections()`（LangGraph）→ TextNode per section → Embedding → Qdrant |

`_embed_and_store()` 是共享的写入函数，含 MySQL 先写再 Qdrant、失败时回滚的保护机制。

### form_extraction/ — 表单提取子图

```
START
  └─ extractor_node（强模型，structured_output=FormExtraction）
       └─ evaluator_node（fast_model，JSON 输出 PASS/FAIL + feedback）
            └─ _should_continue：PASS 或 retry ≥ 3 → END；否则 → extractor
```

- 成功（PASS + sections 非空）：sections 向量化
- 主动判空（PASS + sections 空）：不向量化，不 fallback
- 失败（FAIL）：`indexing.py` fallback 到递归切分

### cleaning/ — 文本清洗子图

```
START → optimizer_node（强模型清洗）
      → placeholder_check_node（programmatic：检查图片占位符是否丢失）
      → evaluator_node（fast_model：PASS/FAIL）
      → END（MAX_RETRIES=3）
```

### splitter.py — 5 种切分策略

| 策略 | 说明 |
|------|------|
| `recursive`（默认） | LangChain RecursiveCharacterTextSplitter，中文 Markdown 分隔符 |
| `token` | LlamaIndex TokenTextSplitter，按 token 数切分 |
| `sentence` | LlamaIndex SentenceSplitter + 中文句子边界 |
| `semantic` | 基于 Embedding 相似度的自适应切分 |
| `manual_step` | 操作手册步骤级切分（规则解析层次结构 + LLM 语义提取） |

---

## 存储层

### MySQL 表清单（13 张）

| 表名 | 用途 |
|------|------|
| `users` | 用户账号（admin/teacher/student） |
| `student_profiles` | 学生档案（学号/年级/专业/班级） |
| `teacher_profiles` | 教师档案（工号/部门/职称） |
| `user_login_logs` | 登录日志（按月分区） |
| `mentor_student_relations` | 导师-学生绑定关系 |
| `knowledge_bases` | 知识库元数据 |
| `documents` | 文档元数据（含 summary/content/chunk 参数） |
| `faqs` | FAQ 条目（含 Qdrant vector_id） |
| `conversations` | 对话会话 |
| `conversation_messages` | 对话消息（sources/files 存 JSON TEXT） |
| `message_feedback` | 消息反馈（thumbs up/down） |
| `qa_requests` | 学生求助工单（→ 导师回答） |
| `graduation_milestones` | 毕设进度节点（选题/开题/中期/定稿/答辩） |
| `system_settings` | key-value 系统配置 |

### system_settings 常用 key

| key | 说明 |
|-----|------|
| `active_kb` | 学生端当前知识库名称 |
| `admin_kb` | 管理端当前知识库名称 |
| `api_key` / `dashscope_api_key` | LLM API Key（优先级高于 env） |
| `api_base_url` | LLM API Base URL（可选覆盖） |

### Qdrant 向量 payload 字段

| 字段 | 说明 |
|------|------|
| `text` | 原始文本内容 |
| `file_name` | 来源文件名 |
| `kb_name` | 知识库名称 |
| `node_id` | 唯一节点 ID |
| `doc_id` | MySQL documents.id（用于精准删除） |
| `source_type` | `"document"` 或 `"faq"` |
| `faq_id` | FAQ 条目 ID（source_type=faq 时） |
| `section_topic` | form 类型文档的主题名称 |

---

## API 路由总览

| 路由文件 | 前缀 | 主要端点 |
|----------|------|---------|
| `auth.py` | `/api/auth` | POST /login, POST /refresh, GET /me, PUT /me/password |
| `chat.py` | `/api/chat` | POST /（SSE 流式问答） |
| `knowledge.py` | `/api/knowledge` | GET/POST/, DELETE/{name}, GET/PUT/DELETE /active, /admin-active |
| `document.py` | `/api/document` | GET/POST /{kb_name}, GET/PUT/DELETE /{kb_name}/{id}, POST /upload, /reindex, /download-token/{id}, GET /download/{id} |
| `faq.py` | `/api/faq` | GET/POST /{kb_name}, PUT/DELETE /{kb_name}/{id}, GET /search, GET/POST /template, /export, /import |
| `conversation.py` | `/api/conversation` | GET/POST /, GET/PUT/DELETE /{id}, POST /{id}/messages, POST /{id}/summarize-title, POST /messages/{id}/feedback |
| `user.py` | `/api/users` | GET/POST /, GET/PUT/DELETE /{id}, POST /students/import, GET /students/export, POST /teachers/import, GET /teachers/export, POST /mentors/relations/import, GET/POST /mentors/{id}/students, DELETE /mentors/{mid}/students/{sid}, GET /me/mentor |
| `ticket.py` | `/api/tickets` | GET/POST /, GET /{id}, POST /{id}/reply, POST /{id}/close |
| `config.py` | `/api/config` | GET/POST /, GET/PUT /api-key, POST /api-key/test, GET /models |
| `analytics.py` | `/api/analytics` | GET /summary |

---

## 前端架构

### 技术栈

- **React 19** + TypeScript，**Vite 8** 构建
- **TanStack Query v5**：服务端状态管理（所有 API 请求走 Query/Mutation，禁止 useEffect 手动 fetch）
- **Axios**：HTTP client，含 JWT 自动刷新拦截器
- **TailwindCSS v4** + **Lucide React**：样式 + 图标
- **React Markdown**：Markdown 渲染

### JWT 自动刷新拦截器（lib/api.ts）

响应拦截器捕获 401 错误后：
1. 无 refresh token → 清除 auth，跳转 login
2. 正在刷新 → 请求入队，等待新 token
3. 未在刷新 → 调用 `/api/auth/refresh`，更新 token，重试原请求，清空队列

### API 模块（lib/api.ts）

`authApi` / `userApi` / `knowledgeApi` / `documentApi` / `faqApi` / `conversationApi` / `configApi` / `analyticsApi` / `ticketApi`

### 设计语言

- 外层背景：`hsl(38 22% 91%)` 暖米色，白色 `rounded-2xl` 卡片
- 侧边栏：`w-16` 图标栏，激活态黑色填充，hover `scale-110`
- 动画：`fadeSlideUp`（入场）、`hover-lift`（悬浮），定义在 `index.css`
- 深色对比卡（`#1A1A1A`）用于系统状态、统计场景

---

## 配置参考（configs/config.yaml）

所有字符串值支持 `${VAR_NAME:-default}` 语法从环境变量读取。

```yaml
qdrant:
  url: http://localhost:6333    # Qdrant HTTP 地址
  timeout: 30                   # 查询超时（秒）

embedding:
  model: text-embedding-v3      # DashScope 嵌入模型
  dimension: 1024               # 向量维度
  embed_batch_size: 10          # 批次大小

llm:
  api_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: qwen-plus              # 强能力模型（路由/评估/生成）
  fast_model: qwen-turbo        # 快速模型（简单分类/FAQ 快答）

vlm:
  model: qwen-vl-plus           # 图片描述 VLM

splitter:
  chunk_size: 256               # 默认 chunk 大小
  chunk_overlap_ratio: 0.2      # 默认重叠比例
  policy:                       # policy 类型文档
    type: recursive
    chunk_size: 512
    chunk_overlap_ratio: 0.1
  manual:                       # manual 类型文档
    type: manual_step
    use_llm: true
    chunk_size: 256
  form:                         # form 类型文档（由 form_extraction 接管，此处仅 fallback）
    type: recursive
    chunk_size: 256
    enable_cleaning: false
  semantic:
    buffer_size: 2
    breakpoint_percentile_threshold: 90

faq:
  score_threshold: 0.75         # FAQ 命中阈值

retrieval:
  vector_top_k: 10
  bm25_top_k: 10
  hybrid_top_k: 15              # RRF 后保留数量
  rrf_k: 60                     # RRF k 参数
  query_enhance: true           # 启用 enhance_query 规则扩写
  protect_raw_top_n: 1          # 保护原始 top-N 不被 rerank 截断

reranker:
  model: gte-rerank
  top_n: 5                      # Rerank 后保留数量

rag:
  agent_retry_count: 3          # CRAG 最大重试次数

server:
  api_host: 0.0.0.0
  api_port: 8000

database:
  host: ${MYSQL_HOST:-localhost}
  port: 3306
  user: ${MYSQL_USER:-rag_user}
  password: ${MYSQL_PASSWORD:-rag_pass_123}
  database: rag_db
  pool_size: 5
  pool_recycle: 3600

auth:
  secret_key: ${AUTH_SECRET_KEY:-change-me-in-production-please}
  algorithm: HS256
  access_token_expire_minutes: 480    # 8 小时
  refresh_token_expire_days: 30
  default_admin_username: admin
  default_admin_password: admin123
```

---

## 环境变量

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|---------|-------|------|
| `DASHSCOPE_API_KEY` | **必填** | — | DashScope API Key（也可通过管理界面写入 DB） |
| `MYSQL_HOST` | 可选 | `localhost` | MySQL 主机 |
| `MYSQL_USER` | 可选 | `rag_user` | MySQL 用户名 |
| `MYSQL_PASSWORD` | 可选 | `rag_pass_123` | MySQL 密码 |
| `MYSQL_ROOT_PASSWORD` | 可选 | `rag_root_123` | MySQL root 密码（docker-compose 用） |
| `AUTH_SECRET_KEY` | 建议修改 | `change-me-in-production-please` | JWT 签名密钥 |
| `LLM_API_KEY` | 可选 | — | `DASHSCOPE_API_KEY` 的别名 |
| `LLM_API_BASE_URL` | 可选 | — | 覆盖 config.yaml 中的 api_base_url |

> **优先级**：DB `system_settings` > 环境变量 > `config.yaml` 默认值

---

## 数据库 Schema（精简版）

```sql
-- 用户系统
users(id, username, hashed_pwd, display_name, role[admin|teacher|student], is_active, created_at)
student_profiles(user_id→users, student_id, grade, major, class_name)
teacher_profiles(user_id→users, employee_id, department, title)
mentor_student_relations(mentor_id→users, student_id→users)
user_login_logs(user_id→users, ip_addr, user_agent, created_at) -- 按月分区

-- 知识库
knowledge_bases(id, name UNIQUE, description, owner_id→users)
documents(id, kb_name→knowledge_bases, file_name, file_size, chunk_count,
          chunk_size, chunk_overlap_ratio, splitter_type, doc_type, status,
          summary, content, created_at)
faqs(id, kb_name→knowledge_bases, question, answer, category, enabled,
     vector_id, author_id→users, status[draft|pending|approved|rejected])

-- 对话
conversations(id, user_id→users, kb_name→knowledge_bases, title, updated_at)
conversation_messages(id, conversation_id→conversations, role[user|assistant],
                      content, sources JSON, files JSON)
message_feedback(message_id→conversation_messages, rating[up|down])

-- 工单 & 进度
qa_requests(id, student_id→users, mentor_id→users,
            conversation_id→conversations, message_id→conversation_messages,
            question, answer, status[pending|replied|closed])
graduation_milestones(id, name, deadline DATE, description, sort_order)

-- 配置
system_settings(key PK, value TEXT)
```

---

## 开发工作流

### 添加新 API 路由

1. 在 `src/api/routes/` 新建路由文件
2. 在 `src/api/schemas.py` 添加 Pydantic 模型
3. 在 `src/api/app.py` 注册 `app.include_router()`（必须在 SPA fallback 之前）
4. 所有路由添加认证依赖：`Depends(get_current_user)` 或更高权限

### 添加新 Agent 工具

1. 在 `src/core/tools.py` 添加 `@tool` 函数（或工厂函数）
2. 工具必须返回 `str`，内部异常必须捕获
3. docstring 写清楚"何时调用、参数含义"（LLM 会读）
4. 在 `src/api/routes/chat.py` 的工具列表里追加（不改其他地方）

### 添加新文档类型

1. 在 `src/core/indexing.py` 的 `index_document()` 分发逻辑中添加新分支
2. 实现对应的 `_index_xxx_document()` 函数
3. 在 `src/api/routes/document.py` 的上传参数中允许新 doc_type 值
4. 前端 `DocumentPage.tsx` 中的下拉选项同步更新

### 前端构建

```bash
# 开发模式不需要构建，Vite dev server 自动热重载（端口 5173）
# 前端改动要在生产模式生效时，必须重新构建：
cd frontend && npm run build    # 输出到 dist/
```

---

## 工具脚本（scripts/）

| 脚本 | 用途 |
|------|------|
| `seed_demo_data.py` | 初始化演示用户/知识库/文档数据 |
| `seed_doc00_faqs.py` | 从文件批量导入 FAQ 到指定知识库 |
| `evaluate_rag_dataset.py` | 全量数据集评测（准确率/召回率指标） |
| `evaluate_ragas_like_judge.py` | RAGAS 风格 LLM-as-judge 评测 |
| `test_form_extraction.py` | 测试 form 文档提取效果，输出 JSON 结果 |

---

## 已知注意事项

### API Key 读取优先级

API Key 优先从 MySQL `system_settings` 读取（`api_key` / `dashscope_api_key` key），其次才是环境变量 `DASHSCOPE_API_KEY`。通过管理界面修改后无需重启即可生效。

### 登录支持多种 ID

`authenticate_user()` 同时支持：`username`、`student_id`（学生学号）、`employee_id`（教师工号）三种登录方式。

### BM25 语料库缓存

`retrieval.py` 中的 BM25 语料库使用 LRU 缓存，**文档上传/删除后需调用 `invalidate_bm25_cache(kb_name)` 使缓存失效**，否则新文档不会被 BM25 检索到。`indexing.py` 在入库和删除后已自动调用。

### Safety Guards 硬编码规则

`rag_pipeline.py` 中的 `_apply_answer_safety_guards()` 包含 20+ 条针对特定问题的硬编码答案（如查重率、开题时间、指导教师人数上限等）。这些规则优先于 LLM 生成结果，**修改时需谨慎测试，避免引入新的错误答案**。

### 前端端口说明

- **开发模式**：前端 Vite dev server 运行在 `:5173`，后端 API 在 `:8000`，两者分离
- **生产模式**：`poetry run start` 仅启动后端，前端由 FastAPI 从 `dist/` 静态托管在同一 `:8000`

### retrieve_node 占位

`rag_pipeline.py` 中的 `retrieve_node` 是空的占位节点，实际检索逻辑通过 `retriever_fn` 注入，在 `run_rag()` / `stream_rag()` 函数中的循环里执行，不在图节点内部。

### 多模态 PDF 图片路径

VLM 图片缓存按 `data/images/{kb_name}/{md5(file_name)[:16]}/` 组织，使用 MD5 hash 避免中文文件名导致的路径问题。
