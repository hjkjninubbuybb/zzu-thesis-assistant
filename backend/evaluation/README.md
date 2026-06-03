# RAG 评测套件

> 与 `tests/` 平级但**性质不同**：tests 是质量门禁（过/不过），evaluation 是研究报告（分数/对比）。

## 结构

```
evaluation/
├── runners/
│   ├── dataset_runner.py     # 基于自建数据集的批量评测
│   └── ragas_runner.py       # RAGAS-like 评测（faithfulness / context-precision / 等）
├── datasets/                  # 评测数据集（JSON / JSONL，按需添加）
└── reports/                   # 评测输出（gitignore，按时间戳归档）
```

## 运行方式

```bash
cd backend

# 自建数据集评测
poetry run python evaluation/runners/dataset_runner.py --dataset eval_v1

# RAGAS-like 评测
poetry run python evaluation/runners/ragas_runner.py
```

## 与 tests 的区分

| 维度 | `tests/` | `evaluation/` |
|------|---------|---------------|
| 性质 | 质量门禁 | 质量度量 |
| 输出 | pass / fail | 分数 + 报告 |
| 频率 | 每次提交 | 按需 / 周期性 |
| 框架 | pytest | 独立 runner |
| CI 拦截 | 是 | 否 |
