# 郑州大学本科毕业设计智能问答系统测试说明书

| 文档项 | 内容 |
|---|---|
| 项目名称 | 郑州大学本科毕业设计智能问答系统 |
| 项目代号 | `rag1.0` |
| 文档类型 | 软件测试说明书 |
| 适用阶段 | 系统测试、验收测试、论文实验评估 |
| 被测版本 | 以测试执行时 Git 版本为准 |
| 编写目的 | 规范测试范围、测试方法、测试用例、质量指标和验收标准 |

## 1. 引言

### 1.1 编写目的

本文档用于指导 `rag1.0` 系统的测试工作，明确测试对象、测试范围、测试环境、测试数据、测试方法、测试用例、评价指标和验收标准。系统属于面向高校毕业设计管理场景的智能问答系统，除普通 Web 系统功能外，还需要测试 RAG 检索质量、回答可信度、不可回答问题处理能力、FAQ 快答效果和 Agent 工具调用正确性。

本文档可作为论文中“系统测试”“实验设计”或“系统评价”章节的依据，也可作为后续测试执行和缺陷跟踪的参考文件。

### 1.2 被测系统简介

系统采用前后端分离架构，后端基于 FastAPI，前端基于 React。核心问答链路采用双层架构：

```text
用户问题
  -> FAQ 查询改写与语义匹配
  -> FAQ 快答或回退到 RAG
  -> 向量检索 + BM25 检索
  -> RRF 结果融合
  -> gte-rerank 重排序
  -> ReAct Agent 调用工具
  -> LLM 流式生成答案
  -> 返回答案、来源、文件和推荐追问
```

系统主要面向两类用户：管理端用户负责维护知识库、文档、FAQ、学生账号和统计信息；学生端用户通过对话界面咨询毕业设计相关问题。

### 1.3 术语说明

| 术语 | 说明 |
|---|---|
| RAG | Retrieval-Augmented Generation，检索增强生成 |
| FAQ 防线 | 系统第一层问答机制，通过 FAQ 向量匹配快速回答高频问题 |
| 混合检索 | 同时使用向量检索和 BM25 检索，再用 RRF 融合结果 |
| Rerank | 对初步检索结果进行重排序，提升相关片段排名 |
| ReAct Agent | 通过推理和工具调用完成复杂问答的 Agent 机制 |
| Evidence | 标准证据片段，即测试集中支撑标准答案的原文 |
| Faithfulness | 答案内容是否能被检索到的上下文支撑 |
| Refusal | 当知识库无答案时，系统明确说明无法回答而不是编造答案 |

## 2. 测试对象与范围

### 2.1 测试对象

本次测试覆盖以下模块：

| 模块 | 主要文件或接口 | 测试重点 |
|---|---|---|
| 用户认证 | `src/api/routes/auth.py` | 登录、刷新 token、权限校验 |
| 用户管理 | `src/api/routes/user.py` | 学生账号、教师账号、角色控制 |
| 知识库管理 | `src/api/routes/knowledge.py` | 知识库 CRUD、当前知识库设置 |
| 文档管理 | `src/api/routes/document.py` | 上传、解析、索引、下载、删除 |
| 文档处理 | `src/core/indexing.py` | 解析、清洗、切分、Embedding、入库 |
| FAQ 管理 | `src/api/routes/faq.py`、`src/core/faq_match.py` | FAQ CRUD、向量化、语义匹配、快答回退 |
| 检索模块 | `src/core/retrieval.py`、`src/core/reranker.py` | Vector、BM25、RRF、Rerank |
| Agent 问答 | `src/core/rag_pipeline.py`、`src/core/tools.py` | 工具调用、流式回答、来源返回 |
| 对话管理 | `src/api/routes/conversation.py` | 对话创建、消息保存、反馈记录 |
| 统计分析 | `src/api/routes/analytics.py` | 问答量、反馈、知识库和文档统计 |
| 前端页面 | `frontend/src/pages/` | 页面交互、角色隔离、状态展示 |

### 2.2 测试范围

本次测试包括：

- 功能测试：验证系统核心功能是否符合需求。
- 接口测试：验证后端 API 的请求参数、响应结构、异常处理和权限控制。
- 集成测试：验证文档入库、FAQ 快答、RAG 问答、对话保存等跨模块流程。
- RAG 离线评估：验证检索质量、回答正确性、答案忠实性和不可回答问题处理效果。
- 性能测试：验证 FAQ 快答、完整 RAG 问答、首 token 延迟、总响应时间和并发稳定性。
- 安全测试：验证登录鉴权、越权访问、输入边界和常见注入风险。
- 兼容性测试：验证主流浏览器下管理端和学生端页面可正常使用。

### 2.3 不在本次测试范围内的内容

以下内容不作为本次测试重点：

- DashScope、Qdrant、MySQL 等第三方服务本身的内部正确性。
- 大规模生产环境压测，例如百级以上并发用户长时间压测。
- 多学校、多院系、多租户隔离能力。
- 移动端专用 UI 适配。
- 外部网络搜索能力，当前系统文档中未启用独立联网搜索工具。

## 3. 需求追踪矩阵

| 需求编号 | 需求描述 | 对应测试项 |
|---|---|---|
| RQ-01 | 用户可登录系统并按角色访问不同页面 | AUTH-01 至 AUTH-06 |
| RQ-02 | 管理员或教师可维护知识库和文档 | KB-01 至 DOC-07 |
| RQ-03 | 系统可解析并索引毕业设计相关文档 | DOC-01 至 DOC-05、INT-01 |
| RQ-04 | 系统可维护 FAQ 并对高频问题快速回答 | FAQ-01 至 FAQ-08 |
| RQ-05 | 学生可通过对话获得毕业设计相关回答 | CHAT-01 至 CHAT-09 |
| RQ-06 | 系统回答应给出引用来源 | CHAT-06、RAG 指标 Citation Accuracy |
| RQ-07 | 知识库无答案时系统应拒答 | CHAT-04、Refusal Accuracy |
| RQ-08 | 时间类问题应使用校历工具 | CHAT-02、Calendar Tool Accuracy |
| RQ-09 | 文件请求类问题应返回下载链接 | CHAT-03、Document Link Accuracy |
| RQ-10 | 系统应保存对话、反馈并展示统计信息 | CONV-01 至 STAT-03 |
| RQ-11 | 系统应具有可接受的响应速度 | PERF-01 至 PERF-05 |
| RQ-12 | 系统应防止未授权访问和常见输入攻击 | SEC-01 至 SEC-08 |

## 4. 测试环境

### 4.1 软件环境

| 项目 | 配置 |
|---|---|
| 操作系统 | macOS 或 Linux |
| 后端框架 | FastAPI |
| 前端框架 | React 19 + TypeScript + Vite |
| 依赖管理 | Poetry、npm |
| 关系数据库 | MySQL 8.0 |
| 向量数据库 | Qdrant |
| Embedding 模型 | DashScope `text-embedding-v3` |
| 主模型 | DashScope `qwen-plus` |
| 快速模型 | DashScope `qwen-turbo` |
| 视觉模型 | DashScope `qwen-vl-plus` |
| Reranker | DashScope `gte-rerank` |

### 4.2 服务启动

```bash
docker-compose up -d
poetry install
poetry run dev
```

管理端地址：

```text
http://127.0.0.1:8000/admin
```

学生端地址：

```text
http://127.0.0.1:8000/student
```

API 文档地址：

```text
http://127.0.0.1:8000/docs
```

### 4.3 环境变量

| 变量名 | 用途 |
|---|---|
| `DASHSCOPE_API_KEY` | 调用通义千问、Embedding、Rerank、VLM |
| `MYSQL_HOST` | MySQL 地址 |
| `MYSQL_USER` | MySQL 用户名 |
| `MYSQL_PASSWORD` | MySQL 密码 |
| `AUTH_SECRET_KEY` | JWT 签名密钥 |

## 5. 测试数据设计

### 5.1 知识库文档数据

使用 `data/uploads/毕业设计文档00/` 中的毕业设计相关文档构建测试知识库。文档类型应覆盖：

| 文档类型 | 示例 | 测试目的 |
|---|---|---|
| 政策制度 | 毕业设计工作通知、指导手册、检测规则 | 测试政策类问答和规则阈值检索 |
| 系统手册 | 学生、指导教师、答辩组成员、评阅专家操作手册 | 测试系统操作类问答 |
| 模板表单 | 任务书、开题报告、中期检查、论文模板 | 测试文件获取和模板要求问答 |
| 校外毕设材料 | 校外毕业设计审批表 | 测试特殊流程问答 |

### 5.2 标准问答数据

标准问答数据建议从 `rag_test/data/queries/` 复用或转换，字段至少包括：

```json
{
  "qid": "Q001",
  "question": "用户问题",
  "reference": "标准答案",
  "reference_contexts": ["支撑答案的原文片段"],
  "answerability": "answerable",
  "question_style": "coverage",
  "role": "student",
  "evidence_scope": "single_span",
  "source_doc": ["来源文档名"]
}
```

测试集应覆盖以下类别：

| 类别 | 建议占比 | 说明 |
|---|---:|---|
| 可回答问题 | 70%-80% | 文档中存在明确答案 |
| 不可回答问题 | 20%-30% | 文档中没有明确答案，用于测试拒答能力 |
| 单证据问题 | 50%-60% | 一个片段即可回答 |
| 多证据问题 | 25%-35% | 需要多个片段共同回答 |
| 跨文档问题 | 10%-20% | 需要多个文档共同回答 |
| 时间类问题 | 10%-20% | 涉及日期、周次、截止时间 |
| 文件请求类问题 | 5%-10% | 需要返回模板或原文件 |

已生成的 LLM 测试集可按以下方式使用：

| 文件 | 数量 | 建议用途 |
|---|---:|---|
| `rag_test/data/queries/test_dataset_v2.json` | 791 | 全量样本池，用于抽样、扩展实验和错误分析 |
| `rag_test/data/queries/test_dataset_v2_selected_220.json` | 220 | 推荐作为论文主测试集，覆盖均衡且规模适中 |
| `rag_test/data/queries/test_dataset_overall_effect_220.json` | 220 | 推荐作为端到端效果对比集，真实问题比例更高 |
| `rag_test/data/queries/test_dataset_multimodal.json` | 182 | 用于操作手册、图片描述、步骤级检索等专项测试 |

其中，`test_dataset_v2_selected_220.json` 的结构如下：

| 维度 | 分布 |
|---|---|
| 可回答性 | answerable 180，unanswerable 40 |
| 问题风格 | coverage 144，realistic 36，unanswerable 40 |
| 证据范围 | single_span 150，same_doc_multi_span 48，cross_doc 22 |
| 文档范围 | single_doc 198，cross_doc 22 |
| 角色 | student 130，teacher 79，off_campus_student 11 |
| 难度 | easy 40，medium 170，hard 10 |

该测试集中不存在空问题、空参考答案、重复 qid 或重复问题；所有可回答样本均包含 `reference_contexts`。需要注意的是，不可回答样本中包含两类负样本：

| 负样本类型 | 判定方式 | 说明 |
|---|---|---|
| Pure Unanswerable | `answerability=unanswerable` 且 `reference_contexts` 为空 | 文档中基本没有相关依据 |
| Hard Negative | `answerability=unanswerable` 且 `reference_contexts` 非空 | 文档中有相近资料，但不足以支持问题中的具体结论 |

Hard Negative 样本应单独统计，因为这类问题最能检验系统是否会把相近资料过度推断为确定答案。

### 5.3 FAQ 测试数据

FAQ 测试数据应包含三类：

| 类型 | 示例 | 预期路径 |
|---|---|---|
| 高频明确问题 | “论文查重率要求是多少？” | FAQ 快答 |
| 相似但信息不足问题 | “查重没过后能不能延期？” | FAQ 命中后回退 RAG |
| 非 FAQ 复杂问题 | “评阅和答辩成绩如何共同影响总评？” | 进入 RAG |

### 5.4 分批测试策略

为降低一次性测试成本，并便于定位问题，测试集按批次逐步执行：

| 批次 | 样本范围 | 样本数 | 测试目标 | 后续动作 |
|---|---|---:|---|---|
| Batch-1 | `offset=0, limit=30` | 30 | 快速检查检索链路、知识库配置、样本格式和基础指标 | 根据失败样本调整匹配阈值、知识库、chunk 或评估脚本 |
| Batch-2 | `offset=30, limit=30` | 30 | 验证第一批优化是否稳定，补充不同问题类型 | 对比 Batch-1 指标变化 |
| Batch-3 | `offset=60, limit=50` | 50 | 扩大样本量，观察跨类别表现 | 分析低分问题类别 |
| Batch-4 | `limit=220` | 220 | 论文主测试集完整评估 | 形成论文实验结果 |
| Batch-5 | `test_dataset_multimodal.json` | 182 | 操作手册、图片描述、步骤级检索专项评估 | 单独形成多模态/手册测试结果 |

第一阶段优先执行检索层评估，确认知识库和检索链路正常后，再开启端到端 RAG 问答测试：

```bash
# 第一批：仅检索评估，默认前 30 条
python scripts/evaluate_rag_dataset.py --limit 30

# 第一批：端到端 RAG 评估，会调用 LLM 生成答案
python scripts/evaluate_rag_dataset.py --limit 30 --mode rag

# 第二批
python scripts/evaluate_rag_dataset.py --offset 30 --limit 30

# Top-8 诊断：用于观察证据是否被默认 Top-5 过早截断
python scripts/evaluate_rag_dataset.py --offset 30 --limit 30 --k 8 --reranker-top-n 8

# 候选保护诊断：用于观察保留初检索高置信候选是否能缓解 rerank 误排
python scripts/evaluate_rag_dataset.py --offset 30 --limit 30 --protect-raw-top-n 1

# 查询增强诊断：用于观察自然语言问题扩展为文档制度词后的召回变化
python scripts/evaluate_rag_dataset.py --offset 60 --limit 50 --query-enhance

# 组合诊断：查询增强 + 候选保护
python scripts/evaluate_rag_dataset.py --offset 60 --limit 50 --query-enhance --protect-raw-top-n 1

# 文档类型先验诊断：用于观察问题意图与文档类型路由是否有收益
python scripts/evaluate_rag_dataset.py --offset 60 --limit 50 --query-enhance --protect-raw-top-n 1 --source-prior

# 完整 220 条主测试集
python scripts/evaluate_rag_dataset.py --limit 220

# 完整 220 条主测试集：阶段型查询增强 + 初检索 Top-1 候选保护
python scripts/evaluate_rag_dataset.py --limit 220 --query-enhance --protect-raw-top-n 1
```

每批结果保存到 `reports/evaluations/`，用于后续错误分析和论文结果汇总。评估报告应保留 rerank 前后的 Top-k 结果、相关性标记、reranker 失败次数，以及 `rerank_lost_hit`、`rerank_gained_hit` 等诊断字段，便于区分“初检索未召回”和“重排序后被截断”两类问题。

截至 2026-04-29，主测试集 `test_dataset_v2_selected_220.json` 已完成完整评估，结果记录于 `reports/evaluations/batch_004_summary.md`。默认策略 Rerank 后 Hit@5 为 0.7278，阶段型查询增强与初检索 Top-1 候选保护组合后 Hit@5 提升至 0.8333，Recall@5 提升至 0.7532，`rerank_lost_hit` 从 21 降至 6。因此，该组合策略可进入系统本体作为默认检索策略，同时保留配置项用于回滚和对照实验。

端到端 RAG 第一批 30 条测试记录于 `reports/evaluations/rag_batch_001_summary.md`。初始版本 Refusal Accuracy 为 0.1667，主要问题是不可回答问题过度推断、Agent 递归停步以及离线流式工具调用异常。优化后，30 条批量报告 `rag_eval_rag_offset0_limit30_20260429_130220.json` 的 Refusal Accuracy、Hard Negative Refusal Accuracy 和 Pure Unanswerable Refusal Accuracy 均达到 1.0000，RAG P95 延迟为 16.954 秒。人工复核发现 Q008 曾出现“相近时间节点替代双选截止”的边界问题，已通过更严格的时间节点匹配提示修正，并回放 Q007-Q009 三个双选类不可回答样本。

## 6. 测试准入与准出标准

### 6.1 测试准入标准

开始系统测试前应满足：

- 后端服务可正常启动，API 文档可访问。
- Qdrant 与 MySQL 容器运行正常。
- `DASHSCOPE_API_KEY` 已配置且可调用模型服务。
- 至少一个知识库完成文档入库。
- 默认管理员账号可登录。
- 前端构建产物可由后端静态托管。

### 6.2 测试准出标准

测试完成并允许验收的条件：

- 核心功能测试用例通过率不低于 95%。
- P0、P1 缺陷全部关闭。
- P2 缺陷有明确处理结论，不影响主要业务流程。
- RAG 核心指标达到本文档第 13 节验收标准。
- 性能指标满足 FAQ 快答和完整 RAG 的基本响应要求。
- 安全测试未发现未授权访问、严重注入或脚本执行问题。

## 7. 测试策略与方法

| 测试类型 | 方法 | 工具或数据 |
|---|---|---|
| 单元测试 | 对核心函数构造输入输出断言 | Pytest 或脚本 |
| 接口测试 | 调用 API 并检查状态码和响应体 | FastAPI docs、curl、Postman |
| 集成测试 | 按真实用户流程串联多个模块 | 浏览器、接口脚本 |
| RAG 离线评估 | 用标准问答集批量计算指标 | `rag_test` 评估脚本或自建脚本 |
| 性能测试 | 统计首 token、总耗时、错误率 | 日志、SSE 事件时间戳 |
| 安全测试 | 构造越权、长文本、注入、XSS 输入 | 手工测试和接口脚本 |
| 兼容性测试 | 在不同浏览器访问主要页面 | Chrome、Edge、Safari |

测试执行顺序建议为：

```text
环境检查
  -> 单模块功能测试
  -> 接口测试
  -> 端到端流程测试
  -> RAG 离线指标评估
  -> 性能与安全测试
  -> 缺陷修复回归
  -> 测试报告汇总
```

## 8. 功能测试用例

### 8.1 用户认证与权限

| 编号 | 测试项 | 前置条件 | 操作 | 预期结果 |
|---|---|---|---|---|
| AUTH-01 | 管理员登录 | 默认管理员已创建 | 使用管理员账号登录 | 登录成功，进入管理端 |
| AUTH-02 | 学生登录 | 已创建学生账号 | 使用学生账号登录 | 登录成功，进入学生端 |
| AUTH-03 | 密码错误 | 用户存在 | 输入错误密码登录 | 登录失败，返回明确错误信息 |
| AUTH-04 | Token 刷新 | 已登录 | 使用 refresh token 请求刷新 | 返回新的 access token |
| AUTH-05 | 未登录访问 | 无 token | 请求 `/api/knowledge` 等受保护接口 | 返回 401 |
| AUTH-06 | 学生越权访问 | 学生已登录 | 请求管理端知识库或用户管理接口 | 返回 403 |

### 8.2 知识库与文档管理

| 编号 | 测试项 | 前置条件 | 操作 | 预期结果 |
|---|---|---|---|---|
| KB-01 | 创建知识库 | 管理员已登录 | 输入合法名称和描述 | 创建成功，列表显示新知识库 |
| KB-02 | 重复名称校验 | 已存在同名知识库 | 再次创建同名知识库 | 创建失败，返回重复提示 |
| KB-03 | 设置学生知识库 | 已存在知识库 | 设置 `active_kb` | 学生端问答使用该知识库 |
| KB-04 | 设置管理端知识库 | 已存在知识库 | 设置 `admin_kb` | 管理端问答使用该知识库 |
| DOC-01 | 上传政策文件 | 知识库存在 | 上传政策 PDF | 文档状态为 completed，产生 chunk |
| DOC-02 | 上传操作手册 | 知识库存在 | 上传学生或教师操作手册 PDF | 按 manual 流程完成解析、图片描述和索引 |
| DOC-03 | 上传模板文件 | 知识库存在 | 上传任务书或开题报告模板 | 按 form 流程完成索引 |
| DOC-04 | 删除文档 | 文档已入库 | 删除该文档 | MySQL 记录和 Qdrant 向量同步删除 |
| DOC-05 | 下载文档 | 文档已入库 | 点击下载链接 | 成功下载原文件 |
| DOC-06 | 不支持格式 | 知识库存在 | 上传不支持的文件类型 | 返回格式错误提示 |
| DOC-07 | 空文件上传 | 知识库存在 | 上传空文件 | 上传失败或处理失败，返回明确错误 |

### 8.3 FAQ 管理与快答

| 编号 | 测试项 | 前置条件 | 操作 | 预期结果 |
|---|---|---|---|---|
| FAQ-01 | 新增 FAQ | 知识库存在 | 输入问题、答案、分类 | FAQ 保存成功，并写入向量库 |
| FAQ-02 | 修改 FAQ | FAQ 存在 | 修改问题或答案 | MySQL 和向量库同步更新 |
| FAQ-03 | 禁用 FAQ | FAQ 已启用 | 点击禁用 | FAQ 不再参与语义匹配 |
| FAQ-04 | 启用 FAQ | FAQ 已禁用 | 点击启用 | FAQ 重新写入向量库 |
| FAQ-05 | Excel 导入 | 下载过模板 | 上传合法 FAQ Excel | 合法数据导入成功，重复项跳过 |
| FAQ-06 | Excel 导出 | FAQ 存在 | 点击导出 | 导出文件内容完整 |
| FAQ-07 | FAQ 快答命中 | FAQ 数据存在 | 提问与 FAQ 高度相似的问题 | 直接返回 FAQ 快答，不进入完整 RAG |
| FAQ-08 | FAQ 回退 RAG | FAQ 相似但不足以回答 | 提问复杂问题 | fast model 返回 fallback，系统进入 RAG |

### 8.4 智能问答

| 编号 | 测试项 | 前置条件 | 操作 | 预期结果 |
|---|---|---|---|---|
| CHAT-01 | 普通知识问答 | 知识库已构建 | 提问“论文复制比要求是多少？” | 返回正确答案和引用来源 |
| CHAT-02 | 时间类问题 | 校历工具可用 | 提问“今天第几周？” | 调用 `get_academic_calendar`，返回日期和周次 |
| CHAT-03 | 文件下载问题 | 模板文档已上传 | 提问“给我任务书模板” | 调用 `get_document_link`，返回正确文件 |
| CHAT-04 | 不可回答问题 | 测试问题无文档依据 | 提问文档未说明的问题 | 明确说明暂无相关信息，不编造事实 |
| CHAT-05 | 多轮追问 | 已完成第一轮问答 | 追问“截止时间呢？” | 能结合历史上下文检索完整主题 |
| CHAT-06 | 来源展示 | 完成一次 RAG 问答 | 查看 sources | 来源含 node_id、片段、文件名和分数 |
| CHAT-07 | 流式输出 | 后端服务正常 | 发起问答请求 | 依次收到 status、agent_action、token、sources、done |
| CHAT-08 | 推荐追问 | 完成一次问答 | 查看建议问题 | 返回 2-3 个相关追问 |
| CHAT-09 | 服务异常兜底 | 模拟模型或检索失败 | 发起问答 | 返回友好错误，不暴露内部异常 |

### 8.5 对话、反馈与统计

| 编号 | 测试项 | 前置条件 | 操作 | 预期结果 |
|---|---|---|---|---|
| CONV-01 | 创建对话 | 用户已登录 | 新建对话 | 数据库新增 conversation |
| CONV-02 | 保存消息 | 对话存在 | 发送用户消息和助手消息 | 消息内容、来源和文件被保存 |
| CONV-03 | 查看历史 | 对话存在 | 打开历史对话 | 正确显示历史消息、来源和反馈 |
| CONV-04 | 自动标题 | 首轮问答完成 | 调用标题总结 | 生成简短、准确的中文标题 |
| CONV-05 | 用户反馈 | 助手消息存在 | 点赞或点踩 | `message_feedback` 表写入记录 |
| STAT-01 | 统计总览 | 存在问答数据 | 打开统计页面 | 显示提问量、对话量、反馈、文档和 FAQ 数 |
| STAT-02 | 近 7 天趋势 | 存在多日数据 | 查看趋势图 | 日期和数量统计正确 |
| STAT-03 | 最近提问 | 存在历史问题 | 查看最近提问 | 展示最近 10 条用户提问 |

## 9. 集成测试场景

| 编号 | 场景 | 测试流程 | 通过标准 |
|---|---|---|---|
| INT-01 | 文档入库到问答 | 创建知识库 -> 上传文档 -> 完成索引 -> 设置 active_kb -> 学生提问 | 能正确回答并返回来源 |
| INT-02 | FAQ 快答闭环 | 新增 FAQ -> 提问相似问题 -> 返回快答 -> 保存对话 | 走 FAQ 路径，耗时显著低于 RAG |
| INT-03 | FAQ 回退 RAG | 新增相似但不完整 FAQ -> 提问复杂问题 | FAQ 不误答，能够进入 RAG |
| INT-04 | 文件请求闭环 | 上传模板文件 -> 提问索要模板 -> 返回文件卡片 | 文件名和下载链接正确 |
| INT-05 | 权限闭环 | 学生登录 -> 尝试访问管理接口 -> 管理员登录访问同接口 | 学生被拒绝，管理员成功 |
| INT-06 | 对话闭环 | 学生提问 -> 保存消息 -> 点赞 -> 管理端查看统计 | 历史、反馈和统计同步正确 |

## 10. RAG 离线评估指标

### 10.1 基本符号

对第 `i` 个测试样本定义：

```text
q_i: 用户问题
a_i: 系统生成答案
y_i: 标准答案
G_i: 标准证据片段集合 reference_contexts
R_i^k: 系统返回的 Top-k 检索片段
```

检索相关性定义为：

```text
rel(r, G_i) = 1, 当 r 与任一标准证据片段匹配
            = 0, 否则
```

匹配规则：

1. 标准证据是检索片段的子串，判为相关。
2. 检索片段是标准证据的子串，判为相关。
3. 文本相似度大于等于阈值，建议阈值取 0.6，判为相关。
4. 对操作手册类样本，如果存在稳定 step_id，优先使用 step_id 精确匹配。

### 10.2 检索质量指标

| 指标 | 公式 | 含义 |
|---|---|---|
| Hit@5 | `1[Top-5 中存在 rel=1]` | 正确证据是否进入最终上下文 |
| Precision@5 | `Top-5 相关片段数 / 5` | 最终上下文噪声比例 |
| Recall@5 | `Top-5 覆盖的标准证据数 / 标准证据总数` | 证据覆盖程度 |
| MRR | `1 / 第一个相关片段的排名` | 首个正确证据是否靠前 |
| NDCG@5 | `DCG@5 / IDCG@5` | 排序质量 |

其中：

```text
DCG@5 = sum(rel_j / log2(j + 1)), j 从 1 开始
```

由于系统默认 `reranker.top_n = 5`，论文主实验建议使用 `@5` 指标。若某批样本中出现 Rerank 后 Hit@5 下降，应补充 `@8` 或 `@10` 诊断实验，用于判断问题是否来自 Top-k 截断；也可补充候选保护实验，将初检索 Top-1 或 Top-2 保留在最终上下文中，用于判断问题是否来自 reranker 误排。诊断结果不替代主指标，但可作为系统优化依据。

对审核与权限、格式规范、时间节点等自然语言问题，可补充查询增强诊断。查询增强的目标不是改变标准答案，而是将“谁审核”“能不能改”“第几周”“格式要求”等用户表达扩展为文档中更稳定的制度词、流程词和模板词，从而观察召回改善幅度。若查询增强提升初检索但 Rerank 后下降，应与候选保护联合分析，避免增强带来的正确候选再次被排序截断。

在系统本体中，查询增强与候选保护应作为检索策略而非生成策略实现：先使用增强后的检索词召回候选，再用同一检索词进行 Rerank，最后将初检索 Top-1 保护进最终 Top-5。该实现不改变标准答案，也不向 LLM 注入额外事实，只改变候选证据集合。

### 10.3 上下文质量指标

| 指标 | 计算方式 | 说明 |
|---|---|---|
| Context Precision | LLM 判断 Top-5 中有用上下文的比例 | 衡量检索结果是否干净 |
| Context Recall | 标准答案事实中可由检索上下文支持的比例 | 衡量答案所需信息是否完整 |
| Entity Recall | 命中的标准实体数 / 标准实体总数 | 衡量日期、周次、阈值、文件名等关键实体覆盖 |

实体类型包括日期、周次、百分比阈值、表格名称、文件名称、角色名称、系统页面、按钮和状态字段。

### 10.4 生成答案质量指标

| 指标 | 计算方式 | 评分口径 |
|---|---|---|
| Answer Correctness | 与标准答案事实一致程度 | 0、0.5、1 |
| Faithfulness | 被来源支持的答案事实数 / 答案中全部事实数 | 0-1 |
| Completeness | 命中的标准答案要点数 / 标准答案要点总数 | 0-1 |
| Answer Relevance | 是否围绕用户问题回答 | 0、0.5、1 |
| Citation Accuracy | 可支撑答案的来源数 / 返回来源总数 | 0-1 |

建议评分规则：

```text
1.0 = 完全正确或完全满足
0.5 = 部分正确，但存在遗漏、轻微偏差或表达不完整
0.0 = 错误、无依据、答非所问或严重遗漏
```

### 10.5 不可回答问题指标

| 指标 | 公式 | 说明 |
|---|---|---|
| Refusal Accuracy | `正确拒答数量 / 不可回答问题总数` | 系统是否知道“不知道” |
| Hallucination Rate | `编造答案数量 / 不可回答问题总数` | 不可回答场景下的幻觉风险 |
| Hard Negative Refusal Accuracy | `Hard Negative 中正确拒答数量 / Hard Negative 总数` | 相近资料干扰下的拒答能力 |
| Pure Unanswerable Refusal Accuracy | `Pure Unanswerable 中正确拒答数量 / Pure Unanswerable 总数` | 完全缺少依据时的拒答能力 |

正确拒答应满足：

- 明确说明知识库暂无相关信息。
- 未编造日期、流程、规则、文件、按钮或负责部门。
- 可以给出合理建议，如咨询指导教师或教务部门。

对 Hard Negative 样本，合格回答可以引用相近资料，但必须明确指出资料不足以支持问题中的具体结论。例如文档只说明“第十九周末提交任务书”，但未说明“系统周日 24 点是否自动关闭”，系统应回答“文档未明确系统关闭时间”，不能推断为“周日 24 点前均可提交”。

### 10.6 FAQ 防线指标

| 指标 | 公式 | 说明 |
|---|---|---|
| FAQ Hit Rate | `FAQ 应答样本中命中 FAQ 的数量 / FAQ 应答样本总数` | 语义匹配能力 |
| FAQ Answer Success Rate | `FAQ 命中后直接回答成功数量 / FAQ 命中数量` | 快答可用性 |
| False FAQ Interception Rate | `非 FAQ 问题被 FAQ 错误拦截数量 / 非 FAQ 问题总数` | 误拦截风险 |
| Fallback Accuracy | `FAQ 内容不足时成功回退 RAG 数量 / FAQ 不足样本数` | 双层架构可靠性 |
| FAQ Latency Reduction | `1 - 平均 FAQ 耗时 / 平均完整 RAG 耗时` | FAQ 加速效果 |

### 10.7 Agent 工具调用指标

| 指标 | 公式 | 说明 |
|---|---|---|
| Search Tool Recall | `需要检索的问题中调用 search_knowledge_base 的数量 / 需要检索的问题总数` | 是否按规则检索知识库 |
| Calendar Tool Accuracy | `时间类问题中正确调用并使用日历工具的数量 / 时间类问题总数` | 时间问题处理能力 |
| Document Link Accuracy | `文件请求类问题中返回正确文件的数量 / 文件请求类问题总数` | 文件工具能力 |
| Tool Redundancy | `不必要工具调用次数 / 总工具调用次数` | 工具调用效率 |
| Agent Completion Rate | `成功在递归限制内完成回答的数量 / 总问题数` | Agent 稳定性 |

工具调用可通过 SSE 中的 `agent_action` 事件采集。

## 11. 性能测试

### 11.1 性能指标

| 指标 | 计算方式 | 建议阈值 |
|---|---|---|
| First Token Latency | 请求开始到第一个 `token` 事件的时间 | P95 不超过 5 秒 |
| Total Latency | 请求开始到 `done` 事件的时间 | P95 不超过 20 秒 |
| Retrieval Latency | 构建检索器、混合检索和 rerank 的耗时 | 平均不超过 6 秒 |
| FAQ Latency | FAQ 命中后返回答案的耗时 | 平均不超过 3 秒 |
| Error Rate | 失败请求数 / 总请求数 | 不超过 1% |
| Reranker Batch Failure Rate | reranker 批次失败次数 / reranker 批次数 | 记录并分析，优化后不应造成候选证据丢失 |
| Concurrent Stability | 并发提问时服务是否保持可用 | 20 并发无服务崩溃 |

FAQ 快答和完整 RAG 应分开统计，避免不同路径的延迟混合后掩盖问题。外部模型服务存在偶发失败时，需同时记录失败次数和降级策略是否生效；例如 reranker 单批失败时应保留原始检索候选，避免局部 API 异常直接降低 Hit@5。

### 11.2 性能测试场景

| 编号 | 场景 | 并发数 | 样本量 | 关注指标 |
|---|---|---:|---:|---|
| PERF-01 | FAQ 高频问题 | 5 | 50 | FAQ Latency、Error Rate |
| PERF-02 | 普通 RAG 问答 | 5 | 50 | First Token、Total Latency |
| PERF-03 | 文件请求问题 | 5 | 30 | Document Link Accuracy、Total Latency |
| PERF-04 | 时间类问题 | 5 | 30 | Calendar Tool Accuracy、Total Latency |
| PERF-05 | 混合问题并发 | 20 | 100 | Error Rate、P95 Total Latency |

## 12. 安全与边界测试

| 编号 | 测试项 | 输入或操作 | 预期结果 |
|---|---|---|---|
| SEC-01 | SQL 注入 | 登录、搜索、知识库名称中输入 SQL 片段 | 不执行非法 SQL，返回安全错误或正常空结果 |
| SEC-02 | XSS 输入 | FAQ、问题、标题中输入 `<script>` | 前端不执行脚本 |
| SEC-03 | 越权访问对话 | 学生访问其他用户对话 ID | 返回 403 |
| SEC-04 | 越权访问管理接口 | 学生请求用户管理、文档删除接口 | 返回 403 |
| SEC-05 | 长文本输入 | 输入超过字段限制的问题或 FAQ | 返回参数校验错误 |
| SEC-06 | 空知识库问答 | 未配置 active_kb 时学生提问 | 返回“管理员尚未分配知识库” |
| SEC-07 | 外部 API 失败 | 模拟 DashScope、Qdrant、MySQL 不可用 | 返回友好错误，系统不崩溃 |
| SEC-08 | 文件名异常 | 上传含特殊字符的文件名 | 文件可安全保存、展示和下载 |

## 13. 验收标准

系统满足以下条件时，可认为测试通过：

| 类别 | 验收标准 |
|---|---|
| 功能完整性 | 核心功能测试用例通过率不低于 95% |
| 检索质量 | Hit@5 不低于 0.85，MRR 不低于 0.75，Context Recall 不低于 0.75 |
| 回答质量 | Answer Correctness 不低于 0.80，Faithfulness 不低于 0.85 |
| 完整性 | Completeness 不低于 0.80 |
| 抗幻觉能力 | Refusal Accuracy 不低于 0.85，Hallucination Rate 不高于 0.10 |
| FAQ 快答 | FAQ Hit Rate 不低于 0.80，False FAQ Interception Rate 不高于 0.10 |
| 工具调用 | Calendar Tool Accuracy 和 Document Link Accuracy 均不低于 0.85 |
| 性能表现 | FAQ 平均响应不超过 3 秒，完整 RAG P95 总延迟不超过 20 秒 |
| 稳定性 | 主要接口错误率不高于 1%，20 并发下无服务崩溃，reranker 局部失败不应导致整批候选证据丢失 |
| 安全性 | 未发现未授权访问、严重注入、脚本执行等高危问题 |

## 14. 缺陷管理

| 等级 | 定义 | 示例 |
|---|---|---|
| P0 致命 | 系统不可用或数据严重损坏 | 无法登录、数据库损坏、核心问答完全不可用 |
| P1 严重 | 核心功能错误或严重安全问题 | 学生越权访问管理接口、RAG 大量编造答案 |
| P2 一般 | 主要功能可用但存在明显缺陷 | 来源展示不完整、FAQ 偶发误拦截、统计不准确 |
| P3 轻微 | 不影响主流程的体验问题 | 文案不统一、页面样式轻微错位 |

缺陷记录建议包含：

| 字段 | 说明 |
|---|---|
| 缺陷编号 | 唯一编号 |
| 发现版本 | 对应 Git commit 或测试版本 |
| 缺陷等级 | P0-P3 |
| 所属模块 | 认证、文档、FAQ、RAG、前端等 |
| 复现步骤 | 清晰列出操作步骤 |
| 实际结果 | 系统实际表现 |
| 预期结果 | 应有表现 |
| 附件 | 截图、日志、接口响应、测试样本 |
| 状态 | 新建、处理中、已修复、已关闭、暂缓 |

## 15. 测试记录模板

### 15.1 测试执行汇总

| 项目 | 结果 |
|---|---|
| 测试版本 |  |
| Git commit |  |
| 测试时间 |  |
| 测试环境 |  |
| 测试人员 |  |
| 用例总数 |  |
| 通过数 |  |
| 失败数 |  |
| 阻塞数 |  |
| 通过率 |  |
| P0/P1 缺陷数 |  |
| 是否达到验收标准 |  |

### 15.2 RAG 指标记录

| 指标 | 结果 | 是否达标 |
|---|---:|---|
| Hit@5 |  |  |
| MRR |  |  |
| NDCG@5 |  |  |
| Context Precision |  |  |
| Context Recall |  |  |
| Entity Recall |  |  |
| Answer Correctness |  |  |
| Faithfulness |  |  |
| Completeness |  |  |
| Refusal Accuracy |  |  |
| Hard Negative Refusal Accuracy |  |  |
| Pure Unanswerable Refusal Accuracy |  |  |
| Hallucination Rate |  |  |
| P95 Total Latency |  |  |

### 15.3 问题分组记录

| 分组 | 样本数 | Answer Correctness | Faithfulness | Refusal Accuracy | 备注 |
|---|---:|---:|---:|---:|---|
| 可回答问题 |  |  |  | N/A |  |
| 不可回答问题 |  | N/A | N/A |  |  |
| Pure Unanswerable |  | N/A | N/A |  | `reference_contexts` 为空 |
| Hard Negative |  | N/A | N/A |  | `reference_contexts` 非空但不足以回答 |
| 时间类问题 |  |  |  |  |  |
| 文件请求类问题 |  |  |  |  |  |
| 学生角色问题 |  |  |  |  |  |
| 教师角色问题 |  |  |  |  |  |

## 16. 论文实验建议

论文中建议将测试与实验设计拆成四组：

1. 检索消融实验：比较不同切分策略、chunk size、overlap、是否 BM25、是否 rerank。
2. 双层架构实验：比较 `FAQ + RAG` 与 `仅 RAG` 的准确率和响应时间。
3. Agent 工具实验：验证校历工具、文件下载工具和知识库检索工具对复杂问题的提升。
4. 端到端问答实验：按问题类型、角色、难度、可回答性分组统计回答质量。

论文主表建议报告：

```text
Hit@5
MRR
NDCG@5
Context Precision
Context Recall
Answer Correctness
Faithfulness
Completeness
Refusal Accuracy
P95 Total Latency
```

如果需要给出综合评分，可作为辅助分析使用：

```text
RetrievalScore =
0.30 * Hit@5
+ 0.20 * MRR
+ 0.20 * NDCG@5
+ 0.20 * ContextRecall
+ 0.10 * ContextPrecision

AnswerScore =
0.30 * AnswerCorrectness
+ 0.25 * Faithfulness
+ 0.20 * Completeness
+ 0.15 * AnswerRelevance
+ 0.10 * RefusalAccuracy
```
