"""LLM-as-judge evaluation for existing RAG batch reports.

This script reads JSON reports produced by ``evaluate_rag_dataset.py`` and
adds RAGAS-style generation-quality metrics without re-running the RAG system.

The implemented metrics are aligned with common RAGAS dimensions:

- faithfulness: whether the answer is supported by retrieved contexts.
- answer_relevancy: whether the answer addresses the user's question.
- answer_correctness: whether the answer matches the reference answer.
- context_precision: whether retrieved contexts are relevant to the question.
- context_recall: whether retrieved contexts cover the reference evidence.
- refusal_correctness: for unanswerable questions, whether the answer refuses
  rather than fabricating unsupported details.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "reports" / "evaluations"
DEFAULT_DATASET = PROJECT_ROOT.parent / "rag_test" / "data" / "queries" / "test_dataset_v2_selected_220.json"
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro"


def _load_dotenv() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "..."


def _json_from_text(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text, flags=re.I).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def _score(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, score))


def _nullable_score(value: Any) -> float | None:
    if value is None:
        return None
    return _score(value)


def _get_dashscope_llm(model: str | None = None):
    from langchain_openai import ChatOpenAI
    from src.config import get_config, get_api_key, get_api_base_url

    cfg = get_config()["llm"]
    return ChatOpenAI(
        model=model or cfg.get("fast_model") or cfg.get("model", "qwen-plus"),
        openai_api_key=get_api_key(),
        openai_api_base=get_api_base_url(),
        streaming=False,
        temperature=0,
    )


def _deepseek_api_key() -> str:
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def _deepseek_chat_completion(
    prompt: str,
    model: str,
    base_url: str,
    timeout: int,
) -> str:
    api_key = _deepseek_api_key()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is empty. Put it in .env or the shell environment.")

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        url=f"{_normalize_base_url(base_url)}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek HTTP {exc.code}: {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"DeepSeek request failed: {exc.reason}") from exc

    data = json.loads(raw)
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"DeepSeek response has no choices: {raw[:500]}")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if not content:
        raise RuntimeError(f"DeepSeek response has empty content: {raw[:500]}")
    return str(content)


@dataclass
class JudgeResult:
    metrics: dict[str, float | None]
    rationale: str
    raw: str
    reference_issue: bool = False


def select_judge_contexts(record: dict[str, Any], top_k: int) -> tuple[list[dict[str, Any]], str]:
    if record.get("rag_contexts"):
        raw_contexts = record.get("rag_contexts") or []
        context_source = "actual_agent_context"
        text_limit = 1200
    else:
        raw_contexts = record.get("post_top_results") or record.get("top_results") or []
        context_source = "diagnostic_retrieval_context"
        text_limit = 700

    contexts = []
    for item in raw_contexts:
        if len(contexts) >= top_k:
            break
        contexts.append(
            {
                "rank": item.get("rank"),
                "source_file": item.get("source_file"),
                "text": _clip(str(item.get("text", "")), text_limit),
            }
        )
    return contexts, context_source


def build_prompt(record: dict[str, Any], top_k: int) -> str:
    contexts, context_source = select_judge_contexts(record, top_k)

    payload = {
        "qid": record.get("qid"),
        "question": record.get("question"),
        "answerability": record.get("answerability"),
        "reference_answer": _clip(str(record.get("reference", "")), 1200),
        "reference_contexts": [_clip(str(x), 900) for x in record.get("reference_contexts", [])[:4]],
        "retrieved_contexts": contexts,
        "context_source": context_source,
        "system_answer": _clip(str(record.get("generation", "")), 1600),
    }

    has_reference_contexts = bool(payload["reference_contexts"])

    return (
        "你是RAG系统论文评测员。请基于给定问题、参考答案、参考证据、检索上下文和系统答案，"
        "给出RAGAS风格的0到1分评估。只输出JSON，不要输出Markdown。\n\n"
        "先判断样本类型：answerability=answerable 表示参考答案可由知识库回答；"
        "answerability=unanswerable 表示当前知识库资料不足，系统应拒答或说明无法确定。\n\n"
        "评分定义：\n"
        "1. faithfulness：系统答案中的事实是否被检索上下文支持；无依据编造应低分。"
        "如果题目不可回答且系统只说明资料不足、没有编造事实，faithfulness应给高分；"
        "如果题目不可回答但系统给出具体日期、流程、政策结论或确定性判断，且参考答案说明资料不足，则faithfulness必须低分。\n"
        "2. answer_relevancy：系统答案是否直接回应用户问题。"
        "如果题目不可回答，明确指出无法确定也属于回应问题；如果只发送文件、下载链接或泛泛建议而不回答问题，应低分。\n"
        "3. answer_correctness：系统答案与参考答案在关键事实、条件、时间、数量、流程上是否一致。"
        "如果题目不可回答，系统正确拒答且没有强行给结论，应给高分；强行给出具体结论必须低分。\n"
        "4. context_precision：检索上下文中排在前面的内容是否与问题相关。\n"
        "5. context_recall：检索上下文是否覆盖回答该问题所需的参考证据。"
        "如果没有reference_contexts，context_recall必须输出null。\n"
        "6. refusal_correctness：当answerability为unanswerable时必须输出0到1的数字；"
        "如果系统明确说明资料不足、不能确定且未编造，给高分；如果强行回答，给低分。"
        "answerable样本必须输出null。\n\n"
        "关键判分规则：\n"
        "- answerable样本：主要看答案是否答到参考答案中的关键事实；没有直接回答问题，即使上下文相关也不能给高correctness。\n"
        "- unanswerable样本：主要看是否正确拒答；给出具体截止日、开放时间、补选机会、纸质流程等确定性信息时，refusal_correctness应接近0。\n"
        "- 参考答案可能由LLM生成，若reference_answer的确定性结论明显不能由reference_contexts或retrieved_contexts直接推出，"
        "应以证据为准，并把reference_issue设为true；此时系统答案若更保守且忠实于证据，不应因不跟随参考答案外推而被判低分。\n"
        "- 不要因为答案看起来有帮助就奖励编造；也不要因为答案礼貌或格式好就提高事实正确性分数。\n\n"
        "输出格式必须是：\n"
        "{"
        "\"faithfulness\": 0.0,"
        "\"answer_relevancy\": 0.0,"
        "\"answer_correctness\": 0.0,"
        "\"context_precision\": 0.0,"
        f"\"context_recall\": {'0.0' if has_reference_contexts else 'null'},"
        "\"refusal_correctness\": null,"
        "\"reference_issue\": false,"
        "\"rationale\": \"一句话说明主要扣分原因\""
        "}\n\n"
        f"评测数据：\n{json.dumps(payload, ensure_ascii=False)}"
    )


def _call_judge_model(llm: Any, prompt: str, args: argparse.Namespace) -> str:
    if args.judge_provider == "deepseek":
        return _deepseek_chat_completion(
            prompt=prompt,
            model=args.model,
            base_url=args.base_url,
            timeout=args.timeout,
        )

    response = llm.invoke(prompt)
    return str(getattr(response, "content", response))


def judge_record(llm: Any, record: dict[str, Any], args: argparse.Namespace) -> JudgeResult:
    prompt = build_prompt(record, args.context_top_k)
    last_raw = ""
    for attempt in range(1, args.retries + 2):
        try:
            last_raw = _call_judge_model(llm, prompt, args)
            parsed = _json_from_text(last_raw)
            metrics = {
                "faithfulness": _nullable_score(parsed.get("faithfulness")),
                "answer_relevancy": _nullable_score(parsed.get("answer_relevancy")),
                "answer_correctness": _nullable_score(parsed.get("answer_correctness")),
                "context_precision": _nullable_score(parsed.get("context_precision")),
                "context_recall": _nullable_score(parsed.get("context_recall")),
                "refusal_correctness": None
                if parsed.get("refusal_correctness") is None
                else _score(parsed.get("refusal_correctness")),
            }
            return JudgeResult(
                metrics=metrics,
                rationale=str(parsed.get("rationale", "")),
                raw=last_raw,
                reference_issue=bool(parsed.get("reference_issue", False)),
            )
        except Exception as exc:  # noqa: BLE001 - keep batch progress.
            if attempt > args.retries:
                return JudgeResult(
                    metrics={
                        "faithfulness": None,
                        "answer_relevancy": None,
                        "answer_correctness": None,
                        "context_precision": None,
                        "context_recall": None,
                        "refusal_correctness": None,
                    },
                    rationale=f"judge_failed: {type(exc).__name__}: {exc}",
                    raw=last_raw,
                )
            time.sleep(min(2 ** (attempt - 1), 4))
    raise AssertionError("unreachable")


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    metric_names = [
        "faithfulness",
        "answer_relevancy",
        "answer_correctness",
        "context_precision",
        "context_recall",
    ]
    answerable_records = [r for r in records if r.get("answerability") != "unanswerable"]
    unanswerable_records = [r for r in records if r.get("answerability") == "unanswerable"]
    judge_failures = 0
    for record in records:
        if record.get("judge_error"):
            judge_failures += 1

    summary: dict[str, Any] = {
        "num_samples": len(records),
        "num_answerable": len(answerable_records),
        "num_unanswerable": len(unanswerable_records),
        "judge_failures": judge_failures,
        "reference_issue_count": sum(1 for record in records if record.get("llm_judge_reference_issue")),
        "context_sources": {},
        "metrics": {},
        "all_sample_metrics": {},
    }

    for record in records:
        source = str(record.get("llm_judge_context_source", "unknown"))
        summary["context_sources"][source] = summary["context_sources"].get(source, 0) + 1

    for metric in metric_names:
        vals = [
            r["llm_judge"][metric]
            for r in records
            if isinstance(r.get("llm_judge", {}).get(metric), (int, float))
        ]
        summary["all_sample_metrics"][metric] = mean(vals) if vals else None

    refusal_vals = [
        r["llm_judge"]["refusal_correctness"]
        for r in records
        if isinstance(r.get("llm_judge", {}).get("refusal_correctness"), (int, float))
    ]
    summary["all_sample_metrics"]["refusal_correctness"] = mean(refusal_vals) if refusal_vals else None

    if answerable_records:
        summary["answerable_metrics"] = {}
        for metric in metric_names:
            vals = [
                r["llm_judge"][metric]
                for r in answerable_records
                if isinstance(r.get("llm_judge", {}).get(metric), (int, float))
            ]
            summary["answerable_metrics"][metric] = mean(vals) if vals else None

    if unanswerable_records:
        summary["unanswerable_metrics"] = {}
        for metric in ("faithfulness", "answer_relevancy", "answer_correctness", "context_precision"):
            vals = [
                r["llm_judge"][metric]
                for r in unanswerable_records
                if isinstance(r.get("llm_judge", {}).get(metric), (int, float))
            ]
            summary["unanswerable_metrics"][metric] = mean(vals) if vals else None
        summary["unanswerable_metrics"]["refusal_correctness"] = mean(refusal_vals) if refusal_vals else None

    primary: dict[str, float | None] = {}
    answerable_metrics = summary.get("answerable_metrics", {})
    for metric in metric_names:
        primary[metric] = answerable_metrics.get(metric)
    primary["refusal_correctness"] = summary.get("unanswerable_metrics", {}).get("refusal_correctness")
    summary["metrics"] = primary

    return summary


def load_records(report_paths: list[Path], offset: int, limit: int | None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in report_paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        for rec in data.get("records", []):
            copied = dict(rec)
            copied["_source_report"] = str(path)
            records.append(copied)
    end = None if limit is None else offset + limit
    return records[offset:end]


def load_dataset_index(dataset_path: Path) -> dict[str, dict[str, Any]]:
    if not dataset_path.exists():
        return {}
    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return {}
    return {str(item.get("qid")): item for item in data if item.get("qid")}


def hydrate_references(records: list[dict[str, Any]], dataset_index: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    hydrated: list[dict[str, Any]] = []
    for record in records:
        copied = dict(record)
        sample = dataset_index.get(str(record.get("qid")), {})
        if sample:
            copied["reference"] = sample.get("reference", copied.get("reference", ""))
            copied["reference_contexts"] = sample.get("reference_contexts", copied.get("reference_contexts", []))
            copied["answerability"] = sample.get("answerability", copied.get("answerability"))
        else:
            copied.setdefault("reference_contexts", [])
        hydrated.append(copied)
    return hydrated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run RAGAS-style LLM judge on existing RAG reports.")
    parser.add_argument("reports", nargs="+", help="Existing evaluate_rag_dataset.py JSON reports.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET), help="Original test dataset for references.")
    parser.add_argument("--offset", type=int, default=0, help="Offset within concatenated records.")
    parser.add_argument("--limit", type=int, default=None, help="Number of records to judge.")
    parser.add_argument(
        "--judge-provider",
        choices=("deepseek", "dashscope"),
        default="deepseek",
        help="LLM provider used as the judge. Defaults to deepseek.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_DEEPSEEK_MODEL,
        help=f"Judge model. Defaults to {DEFAULT_DEEPSEEK_MODEL}.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_DEEPSEEK_BASE_URL,
        help=f"OpenAI-compatible base URL for DeepSeek. Defaults to {DEFAULT_DEEPSEEK_BASE_URL}.",
    )
    parser.add_argument("--context-top-k", type=int, default=5, help="Number of retrieved contexts for judge.")
    parser.add_argument("--retries", type=int, default=2, help="Retries per LLM judge call.")
    parser.add_argument("--timeout", type=int, default=120, help="Timeout seconds for each judge call.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for output report.")
    parser.add_argument("--output", default=None, help="Explicit output JSON path.")
    args = parser.parse_args()
    if args.judge_provider == "dashscope" and args.model == DEFAULT_DEEPSEEK_MODEL:
        args.model = None
    return args


def has_judge_error(record: dict[str, Any], metrics: dict[str, float | None]) -> bool:
    answerability = record.get("answerability")
    required = [
        "faithfulness",
        "answer_relevancy",
        "answer_correctness",
        "context_precision",
    ]
    if answerability != "unanswerable":
        required.append("context_recall")
    else:
        required.append("refusal_correctness")
    return any(metrics.get(key) is None for key in required)


def main() -> None:
    args = parse_args()
    _load_dotenv()
    report_paths = [Path(p).expanduser().resolve() for p in args.reports]
    records = load_records(report_paths, args.offset, args.limit)
    records = hydrate_references(records, load_dataset_index(Path(args.dataset).expanduser().resolve()))
    llm = None
    if args.judge_provider == "dashscope":
        llm = _get_dashscope_llm(args.model)
    elif not _deepseek_api_key():
        print("[warn] DEEPSEEK_API_KEY is empty; DeepSeek judge calls will fail.")

    judged_records: list[dict[str, Any]] = []
    for idx, record in enumerate(records, 1):
        print(f"[{idx}/{len(records)}] judge {record.get('qid')}: {str(record.get('question', ''))[:60]}", flush=True)
        judged = dict(record)
        _, context_source = select_judge_contexts(record, args.context_top_k)
        judged["llm_judge_context_source"] = context_source
        result = judge_record(llm, record, args)
        judged["llm_judge_provider"] = args.judge_provider
        judged["llm_judge_model"] = args.model or "dashscope_config_default"
        judged["llm_judge"] = result.metrics
        judged["llm_judge_rationale"] = result.rationale
        judged["llm_judge_reference_issue"] = result.reference_issue
        if has_judge_error(record, result.metrics):
            judged["judge_error"] = result.rationale
            judged["llm_judge_raw"] = result.raw
        judged_records.append(judged)

    output = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "judge": {
            "provider": args.judge_provider,
            "model": args.model or "dashscope_config_default",
            "base_url": args.base_url if args.judge_provider == "deepseek" else None,
            "json_mode": args.judge_provider == "deepseek",
        },
        "args": {
            **vars(args),
            "reports": [str(p) for p in report_paths],
            "judge_model": args.model or "dashscope_config_default",
            "json_mode": args.judge_provider == "deepseek",
            "base_url": args.base_url if args.judge_provider == "deepseek" else None,
        },
        "summary": summarize(judged_records),
        "records": judged_records,
    }

    output_path = Path(args.output).expanduser().resolve() if args.output else None
    if output_path is None:
        output_dir = Path(args.output_dir).expanduser().resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        limit_label = "all" if args.limit is None else str(args.limit)
        output_path = output_dir / f"ragas_like_judge_offset{args.offset}_limit{limit_label}_{stamp}.json"
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n=== RAGAS-like LLM Judge Summary ===")
    print(f"samples: {output['summary']['num_samples']}")
    print(f"answerable: {output['summary']['num_answerable']}")
    print(f"unanswerable: {output['summary']['num_unanswerable']}")
    print(f"judge_failures: {output['summary']['judge_failures']}")
    print(f"context_sources: {output['summary'].get('context_sources', {})}")
    for key, value in output["summary"]["metrics"].items():
        if value is not None:
            print(f"{key}: {value:.4f}")
        else:
            print(f"{key}: null")
    print(f"report: {output_path}")


if __name__ == "__main__":
    main()
