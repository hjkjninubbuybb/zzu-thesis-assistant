# RAG Batch-1 端到端测试记录

## 基本信息

| 项目 | 内容 |
|---|---|
| 测试集 | `rag_test/data/queries/test_dataset_v2_selected_220.json` |
| 样本范围 | `offset=0, limit=30` |
| 模式 | `--mode rag --query-enhance --protect-raw-top-n 1` |
| 样本数 | 30 |
| 可回答样本 | 24 |
| 不可回答样本 | 6 |
| Hard Negative | 3 |

## 关键测试记录

| 阶段 | 报告 | 主要结果 |
|---|---|---|
| 初始端到端评估 | `reports/evaluations/rag_eval_rag_offset0_limit30_20260429_124146.json` | Refusal Accuracy 0.1667；存在 `Sorry, need more steps` 与 `list index out of range` |
| 收紧拒答提示 + 递归上限 10 + 非流式离线 invoke | `reports/evaluations/rag_eval_rag_offset0_limit30_20260429_125537.json` | Refusal Accuracy 0.8333；Agent 异常消失；Q079 仍因递归步数不足停步 |
| 递归上限 15 | `reports/evaluations/rag_eval_rag_offset0_limit30_20260429_130220.json` | Refusal Accuracy 1.0000；Hard Negative 与 Pure Unanswerable 均为 1.0000；无 Agent 错误 |
| Q008 边界复测 | `reports/evaluations/rag_eval_rag_offset4_limit1_20260429_130323.json` | 修正“相近时间节点替代双选截止”的过度推断，单条拒答通过 |
| Q007-Q009 回放 | `reports/evaluations/rag_eval_rag_offset3_limit3_20260429_130525.json` | 双选开放、截止、补选三个不可回答样本拒答均通过 |

## 最终批次指标

最终 30 条批量报告采用 `rag_eval_rag_offset0_limit30_20260429_130220.json`：

| 指标 | 结果 |
|---|---:|
| Retrieval Hit@5 | 0.7500 |
| Retrieval Recall@5 | 0.6944 |
| Retrieval MRR | 0.6493 |
| Retrieval NDCG@5 | 0.6754 |
| Refusal Accuracy | 1.0000 |
| Hard Negative Refusal Accuracy | 1.0000 |
| Pure Unanswerable Refusal Accuracy | 1.0000 |
| RAG Avg Latency | 10.715 秒 |
| RAG P95 Latency | 16.954 秒 |
| Agent Error | 0 |

## 问题与修正

1. 初始版本对不可回答问题过度推断，例如将往届节点、相近流程或任务书提交节点当作当前问题答案。已在系统提示中加入“资料不足规则”，要求事项名称完全对应。
2. 离线评估中的 `run_rag` 原先复用 streaming LLM，ChatTongyi 在工具调用增量处理中会触发 `list index out of range`。已将离线 `run_rag` 改为 `streaming=False`，前端 `stream_rag` 保持流式。
3. Q079 等复杂 hard negative 会触发多轮检索，递归上限 10 时可能停步。已将 `agent_recursion_limit` 提升至 15，但后续仍应优化工具调用冗余。
4. Q008 人工复核发现启发式指标会高估拒答质量；已补充“时间节点事项名称必须完全对应”的提示约束，并回放 Q007-Q009 三个双选类不可回答样本。
5. 自动拒答指标只能判断是否出现拒答语义，不能完全判断是否夹带了不当推断；因此论文实验中不可回答问题除自动统计外，应抽样进行人工判定。

## 后续建议

1. 进入 RAG Batch-2：执行 `offset=30, limit=30` 的端到端评估，观察拒答提示是否稳定。
2. 为端到端答案质量加入人工或 LLM-as-judge 评分，覆盖 Answer Correctness、Faithfulness、Completeness。
3. 单独优化 `get_academic_calendar` 的校历抓取和缓存，减少时间类问题的降级日志。
