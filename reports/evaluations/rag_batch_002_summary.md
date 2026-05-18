# RAG Batch-2 端到端测试记录

## 基本信息

| 项目 | 内容 |
|---|---|
| 测试集 | `rag_test/data/queries/test_dataset_v2_selected_220.json` |
| 样本范围 | `offset=30, limit=30` |
| 模式 | `--mode rag --query-enhance --protect-raw-top-n 1` |
| 样本数 | 30 |
| 可回答样本 | 23 |
| 不可回答样本 | 7 |
| Hard Negative | 3 |
| 有效报告 | `reports/evaluations/rag_eval_rag_offset30_limit30_20260429_171108.json` |
| 受网络影响的诊断报告 | `reports/evaluations/rag_eval_rag_offset30_limit30_20260429_162140.json` |

## 最终批次指标

| 指标 | 结果 |
|---|---:|
| Retrieval Hit@5 | 0.8696 |
| Retrieval Precision@5 | 0.2000 |
| Retrieval Recall@5 | 0.8261 |
| Retrieval MRR | 0.7681 |
| Retrieval NDCG@5 | 0.7940 |
| Refusal Accuracy | 1.0000 |
| Hard Negative Refusal Accuracy | 1.0000 |
| Pure Unanswerable Refusal Accuracy | 1.0000 |
| RAG Avg Latency | 16.304 秒 |
| RAG P95 Latency | 34.249 秒 |
| reranker_batch_failures | 1 |
| Agent Error | 0 |

## 对比说明

第一次 Batch-2 运行中出现 DashScope SSL/Proxy 断连，导致多条样本返回“服务暂时不可用”，该报告仅作为外部服务稳定性诊断，不作为正式指标。随后加入 Agent 整轮重试，并修正校历工具为“知识库优先、官网备用、不可用负缓存”，重跑得到有效报告。

## 慢样本

| QID | 耗时 | 类型 | 说明 |
|---|---:|---|---|
| Q128 | 60.44 秒 | answerable | 第十九周日期范围，Agent 多次检索确认时间节点 |
| Q211 | 34.39 秒 | answerable | 任务书时间节点对应公历日期 |
| Q120 | 34.08 秒 | unanswerable | 离校时间是否明确，需拒绝过度推断 |
| Q123 | 32.37 秒 | answerable | 周末含义与日期边界 |
| Q229 | 26.89 秒 | answerable | 开题报告第一周末与系统关闭问题 |

## 结论

1. Batch-2 在检索层达到 Hit@5 0.8696，超过 0.85 的阶段目标。
2. 不可回答问题、Hard Negative 和 Pure Unanswerable 的拒答准确率均为 1.0000，说明资料不足约束在任务书类问题上稳定。
3. P95 延迟仍高于 20 秒，瓶颈来自 Agent 多轮检索确认时间节点和边界规则，而不是校历抓取失败。
4. 后续应记录工具调用次数，并考虑对时间节点问题加入更直接的日期计算/进度表解析工具，减少 ReAct 多轮检索。
