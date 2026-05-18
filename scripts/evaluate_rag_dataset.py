"""Batch evaluation for the rag1.0 thesis QA system.

The script reads the LLM-generated JSON test set from rag_test, evaluates the
rag1.0 retrieval pipeline in small batches, and optionally runs the full RAG
agent for end-to-end answer/refusal checks.

Example:
    python scripts/evaluate_rag_dataset.py --limit 30
    python scripts/evaluate_rag_dataset.py --limit 30 --mode rag
"""

from __future__ import annotations

import argparse
import difflib
import json
import logging
import math
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.retrieval_strategy import enhance_query, protect_raw_candidates


DEFAULT_DATASET = PROJECT_ROOT.parent / "rag_test" / "data" / "queries" / "test_dataset_v2_selected_220.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "reports" / "evaluations"

REFUSAL_KEYWORDS = (
    "暂无",
    "未找到",
    "没有找到",
    "未明确",
    "无法确定",
    "不能确定",
    "不足以",
    "无法从",
    "未提及",
    "建议咨询",
)


class RerankerWarningCounter(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.batch_failures = 0
        self.full_failures = 0

    def emit(self, record: logging.LogRecord) -> None:
        msg = record.getMessage()
        if "[reranker] 批次 rerank 失败" in msg:
            self.batch_failures += 1
        if "[reranker] Rerank 失败" in msg or "[reranker] 所有批次均失败" in msg:
            self.full_failures += 1


def _load_dotenv() -> None:
    """Tiny .env loader to avoid adding a runtime dependency."""
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def normalize_ref_contexts(ref_contexts: list[Any]) -> list[str]:
    out: list[str] = []
    for item in ref_contexts:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict) and item.get("type") == "text":
            out.append(str(item.get("content", "")))
    return [x for x in out if x.strip()]


def normalize_for_match(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = text.replace("–", "-").replace("—", "-")
    return "".join(re.findall(r"[\w\u4e00-\u9fff]+", text))


def split_evidence_clauses(text: str) -> list[str]:
    clauses = re.split(r"[\n。；;！!？?，,：:、\-\s]+", text)
    return [c.strip() for c in clauses if len(normalize_for_match(c)) >= 10]


def is_relevant(chunk_text: str, reference_contexts: list[str], fuzzy_threshold: float = 0.6) -> bool:
    if not chunk_text.strip():
        return False
    chunk_norm = normalize_for_match(chunk_text)
    for ref in reference_contexts:
        if not ref.strip():
            continue
        ref_norm = normalize_for_match(ref)
        if not ref_norm:
            continue
        if ref_norm in chunk_norm or chunk_norm in ref_norm:
            return True
        for clause in split_evidence_clauses(ref):
            clause_norm = normalize_for_match(clause)
            if clause_norm and clause_norm in chunk_norm:
                return True
        longest = difflib.SequenceMatcher(None, ref_norm, chunk_norm).find_longest_match(
            0, len(ref_norm), 0, len(chunk_norm)
        )
        if longest.size / max(len(ref_norm), 1) >= fuzzy_threshold:
            return True
        if ref in chunk_text or chunk_text in ref:
            return True
        ratio = difflib.SequenceMatcher(None, chunk_text, ref).ratio()
        if ratio >= fuzzy_threshold:
            return True
    return False


def build_relevance_vector(
    retrieved: list[dict[str, Any]],
    reference_contexts: list[str],
    fuzzy_threshold: float,
) -> list[int]:
    return [
        1 if is_relevant(str(r.get("text", "")), reference_contexts, fuzzy_threshold) else 0
        for r in retrieved
    ]


def count_covered_references(
    retrieved: list[dict[str, Any]],
    reference_contexts: list[str],
    fuzzy_threshold: float,
    k: int,
) -> int:
    covered: set[int] = set()
    for r in retrieved[:k]:
        text = str(r.get("text", ""))
        for idx, ref in enumerate(reference_contexts):
            if is_relevant(text, [ref], fuzzy_threshold):
                covered.add(idx)
    return len(covered)


def reciprocal_rank(rel_vec: list[int]) -> float:
    for idx, rel in enumerate(rel_vec):
        if rel:
            return 1.0 / (idx + 1)
    return 0.0


def ndcg_at_k(rel_vec: list[int], k: int) -> float:
    top_k = rel_vec[:k]
    dcg = sum(rel / math.log2(idx + 2) for idx, rel in enumerate(top_k))
    ideal_len = min(sum(rel_vec), k)
    idcg = sum(1.0 / math.log2(idx + 2) for idx in range(ideal_len))
    return dcg / idcg if idcg > 0 else 0.0


def compute_retrieval_metrics(
    retrieved: list[dict[str, Any]],
    reference_contexts: list[str],
    k: int,
    fuzzy_threshold: float,
) -> dict[str, float]:
    rel_vec = build_relevance_vector(retrieved, reference_contexts, fuzzy_threshold)
    total_relevant = len(reference_contexts)
    covered = count_covered_references(retrieved, reference_contexts, fuzzy_threshold, k)
    return {
        f"hit@{k}": 1.0 if any(rel_vec[:k]) else 0.0,
        f"precision@{k}": sum(rel_vec[:k]) / k if k > 0 else 0.0,
        f"recall@{k}": covered / total_relevant if total_relevant else 0.0,
        "mrr": reciprocal_rank(rel_vec),
        f"ndcg@{k}": ndcg_at_k(rel_vec, k),
    }


def is_correct_refusal(answer: str) -> bool:
    return any(keyword in answer for keyword in REFUSAL_KEYWORDS)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = (len(ordered) - 1) * p
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def avg_dict(metrics: list[dict[str, float]]) -> dict[str, float]:
    if not metrics:
        return {}
    keys = metrics[0].keys()
    return {key: mean(m[key] for m in metrics) for key in keys}


def call_with_retries(label: str, attempts: int, fn):
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - evaluator should preserve batch progress.
            last_error = exc
            if attempt < attempts:
                wait_sec = min(2 ** (attempt - 1), 4)
                print(f"[warn] {label} failed (attempt {attempt}/{attempts}): {exc}; retry in {wait_sec}s")
                time.sleep(wait_sec)
    raise last_error or RuntimeError(f"{label} failed")


@dataclass
class RuntimeDeps:
    kb_name: str
    retriever: Any
    reranker: Any


def build_runtime(kb_name: str | None, reranker_top_n: int | None = None) -> RuntimeDeps:
    from src.config import get_config, get_api_key
    from src.core.retrieval import HybridRetriever, fetch_corpus
    from src.core.reranker import Reranker
    from src.storage.document_store import DocumentStore
    from src.storage.vector_store import VectorStore

    ds = DocumentStore()
    resolved_kb = kb_name or ds.get_setting("active_kb") or ds.get_setting("admin_kb")
    if not resolved_kb:
        raise RuntimeError("No kb_name provided and no active_kb/admin_kb is configured.")

    if not get_api_key():
        print("[warn] DashScope API key is empty; embedding/rerank/LLM calls may fail.")

    cfg = get_config()
    ret_cfg = cfg["retrieval"]
    rer_cfg = cfg["reranker"]
    vs = VectorStore()
    corpus = fetch_corpus(resolved_kb, vs)
    retriever = HybridRetriever(
        kb_name=resolved_kb,
        corpus_nodes=corpus,
        k_vector=ret_cfg["vector_top_k"],
        k_bm25=ret_cfg["bm25_top_k"],
        k_total=ret_cfg["hybrid_top_k"],
        rrf_k=ret_cfg["rrf_k"],
        vector_store=vs,
    )
    reranker = Reranker(model=rer_cfg["model"], top_n=reranker_top_n or rer_cfg["top_n"])
    return RuntimeDeps(kb_name=resolved_kb, retriever=retriever, reranker=reranker)


def load_samples(dataset_path: Path, offset: int, limit: int | None, qids: list[str] | None = None) -> list[dict[str, Any]]:
    with dataset_path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Dataset must be a JSON list: {dataset_path}")
    if qids:
        wanted = {qid.strip() for qid in qids if qid.strip()}
        selected = [sample for sample in data if str(sample.get("qid", "")).strip() in wanted]
        found = {str(sample.get("qid", "")).strip() for sample in selected}
        missing = sorted(wanted - found)
        if missing:
            raise ValueError(f"QIDs not found in dataset: {', '.join(missing)}")
        return selected
    end = None if limit is None else offset + limit
    return data[offset:end]


def serialize_nodes(
    nodes: list[dict[str, Any]],
    limit: int,
    reference_contexts: list[str],
    fuzzy_threshold: float,
    text_limit: int = 300,
) -> list[dict[str, Any]]:
    return [
        {
            "rank": idx,
            "node_id": n.get("node_id"),
            "source_file": n.get("source_file"),
            "score": n.get("score"),
            "is_relevant": is_relevant(str(n.get("text", "")), reference_contexts, fuzzy_threshold)
            if reference_contexts
            else None,
            "text": str(n.get("text", ""))[:text_limit],
        }
        for idx, n in enumerate(nodes[:limit], 1)
    ]


def serialize_rag_contexts(
    nodes: list[dict[str, Any]],
    reference_contexts: list[str],
    fuzzy_threshold: float,
    text_limit: int,
) -> list[dict[str, Any]]:
    return serialize_nodes(
        nodes,
        limit=len(nodes),
        reference_contexts=reference_contexts,
        fuzzy_threshold=fuzzy_threshold,
        text_limit=text_limit,
    )


def source_prior_score(question: str, source_file: str) -> float:
    source_file = source_file or ""
    score = 0.0

    wants_policy = any(
        term in question
        for term in (
            "依据",
            "规定",
            "要求",
            "谁",
            "是否",
            "必须",
            "第几周",
            "时间",
            "最晚",
            "截止",
            "领导小组",
        )
    )
    wants_operation = any(
        term in question
        for term in ("系统", "入口", "按钮", "状态", "上传", "提交后", "退回", "二级审核", "学院审核")
    )
    wants_format = any(
        term in question
        for term in ("格式", "模板", "摘要", "缩略语", "参考文献", "著录", "图表", "公式")
    )

    if wants_policy and ("指导手册" in source_file or "通知" in source_file):
        score += 0.08
    if wants_operation and "操作手册" in source_file:
        score += 0.08
    if wants_format and ("模板" in source_file or "模版" in source_file or "学报" in source_file):
        score += 0.10
    if wants_format and "郑大毕业论文（设计）模板" in source_file:
        score += 0.08
    if wants_policy and not wants_operation and "操作手册" in source_file:
        score -= 0.03

    return score


def apply_source_prior(question: str, nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = []
    for idx, node in enumerate(nodes):
        base_score = float(node.get("score") or 0.0)
        prior = source_prior_score(question, str(node.get("source_file", "")))
        adjusted = base_score + prior
        copied = dict(node)
        copied["source_prior"] = prior
        copied["adjusted_score"] = adjusted
        ranked.append((adjusted, -idx, copied))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in ranked]


def evaluate(args: argparse.Namespace) -> dict[str, Any]:
    _load_dotenv()

    dataset_path = Path(args.dataset).expanduser().resolve()
    qids = [qid.strip() for qid in args.qids.split(",")] if args.qids else None
    samples = load_samples(dataset_path, args.offset, args.limit, qids=qids)
    runtime = build_runtime(args.kb, args.reranker_top_n)
    reranker_counter = RerankerWarningCounter()
    reranker_logger = logging.getLogger("src.core.reranker")
    reranker_logger.addHandler(reranker_counter)

    from src.core.rag_pipeline import run_rag

    answerable_pre_metrics: list[dict[str, float]] = []
    answerable_post_metrics: list[dict[str, float]] = []
    retrieval_latencies: list[float] = []
    rerank_latencies: list[float] = []
    rag_latencies: list[float] = []
    records: list[dict[str, Any]] = []
    refusal_total = 0
    refusal_correct = 0
    hard_total = 0
    hard_correct = 0
    pure_total = 0
    pure_correct = 0
    rerank_lost_hit = 0
    rerank_gained_hit = 0

    def retriever_fn(query: str) -> list[dict[str, Any]]:
        effective_query = enhance_query(query) if args.query_enhance else query
        raw_nodes = runtime.retriever.retrieve(effective_query)
        nodes = runtime.reranker.rerank(effective_query, raw_nodes)
        if args.protect_raw_top_n:
            nodes = protect_raw_candidates(
                raw_nodes,
                nodes,
                protect_n=args.protect_raw_top_n,
                final_n=max(args.k, len(nodes)),
            )
        if args.source_prior:
            nodes = apply_source_prior(query, nodes)
        return nodes

    for idx, sample in enumerate(samples, 1):
        qid = sample.get("qid", f"row-{idx}")
        question = str(sample.get("question", ""))
        search_query = enhance_query(question) if args.query_enhance else question
        answerability = str(sample.get("answerability", "answerable"))
        ref_contexts = normalize_ref_contexts(sample.get("reference_contexts", []))
        is_unanswerable = answerability == "unanswerable"
        is_hard_negative = is_unanswerable and bool(ref_contexts)

        print(f"[{idx}/{len(samples)}] {qid} {answerability}: {question[:60]}", flush=True)

        item: dict[str, Any] = {
            "qid": qid,
            "question": question,
            "search_query": search_query if search_query != question else None,
            "answerability": answerability,
            "question_style": sample.get("question_style"),
            "primary_category": sample.get("primary_category"),
            "secondary_tag": sample.get("secondary_tag"),
            "evidence_scope": sample.get("evidence_scope"),
            "source_doc": sample.get("source_doc", []),
            "reference": sample.get("reference", ""),
            "reference_contexts_count": len(ref_contexts),
            "hard_negative": is_hard_negative,
        }

        raw_started = time.perf_counter()
        try:
            raw_nodes = call_with_retries(
                label=f"{qid} retrieve",
                attempts=args.api_retries + 1,
                fn=lambda: runtime.retriever.retrieve(search_query),
            )
        except Exception as exc:  # noqa: BLE001 - keep batch report.
            item["error"] = f"retrieve_failed: {type(exc).__name__}: {exc}"
            item["retrieval_latency_sec"] = time.perf_counter() - raw_started
            records.append(item)
            print(f"[error] {qid} retrieve failed: {exc}", flush=True)
            continue
        retrieval_latency = time.perf_counter() - raw_started
        retrieval_latencies.append(retrieval_latency)

        rerank_started = time.perf_counter()
        try:
            reranked_nodes = call_with_retries(
                label=f"{qid} rerank",
                attempts=args.api_retries + 1,
                fn=lambda: runtime.reranker.rerank(search_query, raw_nodes),
            )
        except Exception as exc:  # noqa: BLE001 - Reranker usually falls back internally.
            item["rerank_error"] = f"{type(exc).__name__}: {exc}"
            reranked_nodes = raw_nodes[: args.k]
        if args.protect_raw_top_n:
            reranked_nodes = protect_raw_candidates(
                raw_nodes,
                reranked_nodes,
                protect_n=args.protect_raw_top_n,
                final_n=max(args.k, len(reranked_nodes)),
            )
        if args.source_prior:
            reranked_nodes = apply_source_prior(question, reranked_nodes)
        rerank_latency = time.perf_counter() - rerank_started
        rerank_latencies.append(rerank_latency)

        item.update(
            {
                "retrieval_latency_sec": retrieval_latency,
                "rerank_latency_sec": rerank_latency,
                "pre_top_results": serialize_nodes(
                    raw_nodes,
                    args.k,
                    ref_contexts,
                    args.fuzzy_threshold,
                ),
                "post_top_results": serialize_nodes(
                    reranked_nodes,
                    args.k,
                    ref_contexts,
                    args.fuzzy_threshold,
                ),
                "top_results": serialize_nodes(
                    reranked_nodes,
                    args.k,
                    ref_contexts,
                    args.fuzzy_threshold,
                ),
            }
        )

        if not is_unanswerable:
            pre_metrics = compute_retrieval_metrics(
                raw_nodes,
                ref_contexts,
                k=args.k,
                fuzzy_threshold=args.fuzzy_threshold,
            )
            post_metrics = compute_retrieval_metrics(
                reranked_nodes,
                ref_contexts,
                k=args.k,
                fuzzy_threshold=args.fuzzy_threshold,
            )
            answerable_pre_metrics.append(pre_metrics)
            answerable_post_metrics.append(post_metrics)
            item["pre_rerank_metrics"] = pre_metrics
            item["post_rerank_metrics"] = post_metrics
            item["retrieval_metrics"] = post_metrics
            pre_hit = pre_metrics.get(f"hit@{args.k}", 0.0)
            post_hit = post_metrics.get(f"hit@{args.k}", 0.0)
            if pre_hit and not post_hit:
                rerank_lost_hit += 1
                item["rerank_effect"] = "lost_hit"
            elif post_hit and not pre_hit:
                rerank_gained_hit += 1
                item["rerank_effect"] = "gained_hit"
            else:
                item["rerank_effect"] = "unchanged"
        elif ref_contexts:
            rel_vec = build_relevance_vector(reranked_nodes, ref_contexts, args.fuzzy_threshold)
            item[f"distractor_hit@{args.k}"] = 1.0 if any(rel_vec[: args.k]) else 0.0

        if args.mode in ("rag", "both"):
            rag_started = time.perf_counter()
            rag_result = run_rag(
                query=question,
                retriever_fn=retriever_fn,
                kb_name=runtime.kb_name,
                history=None,
            )
            rag_latency = time.perf_counter() - rag_started
            rag_latencies.append(rag_latency)
            generation = str(rag_result.get("generation", ""))
            rag_nodes = rag_result.get("graded_nodes", [])
            item["rag_latency_sec"] = rag_latency
            item["generation"] = generation
            item["rag_sources_count"] = len(rag_nodes)
            item["rag_contexts"] = serialize_rag_contexts(
                rag_nodes,
                ref_contexts,
                args.fuzzy_threshold,
                args.rag_context_text_limit,
            )
            item["rag_attempts"] = rag_result.get("attempts", 1)
            item["safety_guards"] = rag_result.get("safety_guards", [])

            if is_unanswerable:
                refusal_total += 1
                correct = is_correct_refusal(generation)
                refusal_correct += 1 if correct else 0
                item["correct_refusal_heuristic"] = correct
                if is_hard_negative:
                    hard_total += 1
                    hard_correct += 1 if correct else 0
                else:
                    pure_total += 1
                    pure_correct += 1 if correct else 0

        records.append(item)

    pre_retrieval_summary = avg_dict(answerable_pre_metrics)
    post_retrieval_summary = avg_dict(answerable_post_metrics)
    summary: dict[str, Any] = {
        "dataset": str(dataset_path),
        "kb_name": runtime.kb_name,
        "mode": args.mode,
        "offset": args.offset,
        "limit": args.limit,
        "num_samples": len(samples),
        "num_answerable_for_retrieval": len(answerable_post_metrics),
        "num_unanswerable": sum(1 for s in samples if s.get("answerability") == "unanswerable"),
        "num_hard_negative": sum(
            1
            for s in samples
            if s.get("answerability") == "unanswerable" and normalize_ref_contexts(s.get("reference_contexts", []))
        ),
        "pre_rerank_retrieval": pre_retrieval_summary,
        "post_rerank_retrieval": post_retrieval_summary,
        "retrieval": post_retrieval_summary,
        "latency": {
            "retrieval_avg_sec": mean(retrieval_latencies) if retrieval_latencies else 0.0,
            "rerank_avg_sec": mean(rerank_latencies) if rerank_latencies else 0.0,
            "rag_avg_sec": mean(rag_latencies) if rag_latencies else 0.0,
            "rag_p95_sec": percentile(rag_latencies, 0.95) if rag_latencies else 0.0,
        },
        "reranker_warnings": {
            "batch_failures": reranker_counter.batch_failures,
            "full_failures": reranker_counter.full_failures,
        },
        "rerank_effect": {
            "lost_hit": rerank_lost_hit,
            "gained_hit": rerank_gained_hit,
        },
    }
    if args.mode in ("rag", "both"):
        summary["refusal"] = {
            "total": refusal_total,
            "correct": refusal_correct,
            "accuracy": refusal_correct / refusal_total if refusal_total else None,
            "hard_total": hard_total,
            "hard_correct": hard_correct,
            "hard_accuracy": hard_correct / hard_total if hard_total else None,
            "pure_total": pure_total,
            "pure_correct": pure_correct,
            "pure_accuracy": pure_correct / pure_total if pure_total else None,
        }

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "args": vars(args),
        "summary": summary,
        "records": records,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate rag1.0 on an LLM-generated test set.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET), help="Path to JSON test set.")
    parser.add_argument("--kb", default=None, help="Knowledge base name. Defaults to active_kb/admin_kb.")
    parser.add_argument("--offset", type=int, default=0, help="Start offset in dataset.")
    parser.add_argument("--limit", type=int, default=30, help="Number of samples to evaluate.")
    parser.add_argument("--qids", default=None, help="Comma-separated QIDs to evaluate; overrides offset/limit.")
    parser.add_argument("--k", type=int, default=5, help="Top-k for retrieval metrics.")
    parser.add_argument("--reranker-top-n", type=int, default=None, help="Override reranker top_n.")
    parser.add_argument(
        "--protect-raw-top-n",
        type=int,
        default=0,
        help="Keep the first N raw retrieval candidates in the final reranked list for diagnostics.",
    )
    parser.add_argument(
        "--query-enhance",
        action="store_true",
        help="Enable rule-based query expansion for diagnostic experiments.",
    )
    parser.add_argument(
        "--source-prior",
        action="store_true",
        help="Enable source-file type prior for diagnostic reranking.",
    )
    parser.add_argument("--fuzzy-threshold", type=float, default=0.6, help="Fuzzy matching threshold.")
    parser.add_argument("--api-retries", type=int, default=2, help="Retries per sample for API-backed steps.")
    parser.add_argument(
        "--rag-context-text-limit",
        type=int,
        default=1200,
        help="Characters to keep for each actual Agent RAG context in reports.",
    )
    parser.add_argument(
        "--mode",
        choices=("retrieval", "rag", "both"),
        default="retrieval",
        help="retrieval: retrieval metrics only; rag: retrieval plus end-to-end RAG.",
    )
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for JSON reports.")
    parser.add_argument("--output", default=None, help="Explicit output JSON path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = evaluate(args)

    output_path = Path(args.output).expanduser().resolve() if args.output else None
    if output_path is None:
        output_dir = Path(args.output_dir).expanduser().resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if args.qids:
            qid_count = len([qid for qid in args.qids.split(",") if qid.strip()])
            output_path = output_dir / f"rag_eval_{args.mode}_qids{qid_count}_{stamp}.json"
        else:
            output_path = output_dir / f"rag_eval_{args.mode}_offset{args.offset}_limit{args.limit}_{stamp}.json"
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)

    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = result["summary"]
    print("\n=== Evaluation Summary ===")
    print(f"dataset: {summary['dataset']}")
    print(f"kb_name: {summary['kb_name']}")
    print(f"mode: {summary['mode']}")
    print(f"samples: {summary['num_samples']}")
    print(f"answerable_for_retrieval: {summary['num_answerable_for_retrieval']}")
    print(f"unanswerable: {summary['num_unanswerable']}")
    print(f"hard_negative: {summary['num_hard_negative']}")
    if summary["pre_rerank_retrieval"]:
        print("-- pre_rerank --")
        for key, value in summary["pre_rerank_retrieval"].items():
            print(f"{key}: {value:.4f}")
    if summary["post_rerank_retrieval"]:
        print("-- post_rerank --")
        for key, value in summary["post_rerank_retrieval"].items():
            print(f"{key}: {value:.4f}")
    if "refusal" in summary:
        print(f"refusal_accuracy: {summary['refusal']['accuracy']}")
        print(f"hard_negative_refusal_accuracy: {summary['refusal']['hard_accuracy']}")
        print(f"pure_unanswerable_refusal_accuracy: {summary['refusal']['pure_accuracy']}")
    print(f"retrieval_avg_sec: {summary['latency']['retrieval_avg_sec']:.3f}")
    print(f"rerank_avg_sec: {summary['latency']['rerank_avg_sec']:.3f}")
    if "reranker_warnings" in summary:
        print(f"reranker_batch_failures: {summary['reranker_warnings']['batch_failures']}")
        print(f"reranker_full_failures: {summary['reranker_warnings']['full_failures']}")
    if "rerank_effect" in summary:
        print(f"rerank_lost_hit: {summary['rerank_effect']['lost_hit']}")
        print(f"rerank_gained_hit: {summary['rerank_effect']['gained_hit']}")
    if summary["latency"]["rag_avg_sec"]:
        print(f"rag_avg_sec: {summary['latency']['rag_avg_sec']:.3f}")
        print(f"rag_p95_sec: {summary['latency']['rag_p95_sec']:.3f}")
    print(f"report: {output_path}")


if __name__ == "__main__":
    main()
