# Batch-1 测试记录

| 项目 | 内容 |
|---|---|
| 测试时间 | 2026-04-29 |
| 测试集 | `rag_test/data/queries/test_dataset_v2_selected_220.json` |
| 样本范围 | `offset=0, limit=30` |
| 知识库 | `毕业设计文档00` |
| 测试模式 | Retrieval |
| 指标报告 | `reports/evaluations/rag_eval_retrieval_offset0_limit30_20260429_080117.json` |
| 对照报告 | `reports/evaluations/rag_eval_retrieval_offset0_limit30_20260429_075605.json` |
| 诊断报告 | `reports/evaluations/rag_eval_retrieval_offset0_limit30_20260429_075835.json` |
| Top-8 诊断报告 | `reports/evaluations/rag_eval_retrieval_offset0_limit30_20260429_084632.json` |
| 候选保护诊断报告 | `reports/evaluations/rag_eval_retrieval_offset0_limit30_20260429_084758.json` |
| 阶段型查询增强+候选保护报告 | `reports/evaluations/rag_eval_retrieval_offset0_limit30_20260429_095307.json` |

## 样本构成

| 类别 | 数量 |
|---|---:|
| 总样本 | 30 |
| 可回答样本 | 24 |
| 不可回答样本 | 6 |
| Hard Negative | 3 |

## 检索指标

| 指标 | Rerank 前 | Rerank 后 |
|---|---:|---:|
| Hit@5 | 0.7500 | 0.7500 |
| Precision@5 | 0.1583 | 0.1667 |
| Recall@5 | 0.6944 | 0.6736 |
| MRR | 0.6036 | 0.6736 |
| NDCG@5 | 0.5966 | 0.6916 |

## 性能指标

| 指标 | 结果 |
|---|---:|
| 平均检索耗时 | 0.334s |
| 平均重排序耗时 | 0.385s |
| Reranker 批次失败 | 7 |
| Reranker 全量失败 | 0 |

## 初步结论

1. 初检索链路可用，但 Batch-1 的 Hit@5 为 0.75，尚未达到测试文档中 0.85 的目标。
2. Rerank 后 MRR 和 NDCG@5 有提升，说明排序对已召回证据有帮助。
3. Rerank 后 Recall@5 略降，说明部分样本中重排序会把某些证据片段挤出 Top-5。
4. 诊断报告中记录到 reranker batch failure，且同一批次重复运行指标波动明显；已将失败批次由“跳过”调整为“保留原始检索批次”，避免 API 局部失败直接丢失候选证据。
5. 优化后仍未命中的可回答样本为 Q004、Q011、Q012、Q015、Q025、Q099，集中在“师生双选时间安排”“指导教师提交材料”“参考文献格式依据”等问题，系统容易召回操作手册或模板文件，而不是政策/指导手册中的制度性依据。
6. 补充诊断显示，单纯扩大到 Top-8 并不能稳定改善 Batch-1；保护初检索第 1 条时 Hit@5 持平，但 MRR 有下降。因此候选保护不能直接作为默认策略，需要在 Batch-3 上继续验证。
7. 阶段型查询增强+候选保护在 Batch-1 上 Hit@5 仍为 0.7500，但 MRR 和 NDCG@5 低于默认策略，说明该增强不应对选题、师生双选、任务书前期等问题全局启用。

## 下一步优化方向

1. 继续保留 reranker 失败次数统计，作为稳定性指标的一部分写入论文实验记录。
2. 尝试查询改写或关键词增强，尤其针对时间节点和制度性问题。
3. 对比 `top_k=10/15` 与 `reranker.top_n=5/8`，观察证据是否被过早截断。
4. 在检索结果中增加文档类型或文件名先验，降低操作手册对政策类问题的干扰。
5. Batch-2 使用 `offset=30, limit=30`，验证问题是否具有普遍性。
