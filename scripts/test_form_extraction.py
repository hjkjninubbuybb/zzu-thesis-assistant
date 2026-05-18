"""验证 Form 文档提取效果：读取测试文档 → 提取 → 保存 JSON 结果。

用法：
    poetry run python scripts/test_form_extraction.py
"""

import json
import sys
from pathlib import Path

# 确保项目根在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.form_extraction.graph import _graph
from src.core.form_extraction.state import FormExtractionState

OUTPUT_DIR = PROJECT_ROOT / "data" / "form_extraction_results"

# 测试文档（各取一个代表）
TEST_DATA_DIR = Path("/Users/gefeng/projects/rag_test/data/parsed/cleaned")
TEST_FILES = [
    "5-1 任务书模板.md",                          # 空白表单代表
    "5-4 郑大毕业论文（设计）模板-V2.md",          # 格式规范代表
]


def run_extraction(file_path: Path) -> dict:
    """对单个文档执行提取，返回完整结果（含每轮中间状态 + 最终向量化片段）。"""
    text = file_path.read_text(encoding="utf-8")
    file_name = file_path.name

    initial_state: FormExtractionState = {
        "original_text": text,
        "file_name": file_name,
        "sections": [],
        "no_extraction_reason": "",
        "attempts": [],
        "feedback_history": [],
        "retry_count": 0,
        "status": "FAIL",
    }

    try:
        final_state = _graph.invoke(initial_state)
    except Exception as e:
        print(f"  ❌ 提取异常: {e}")
        return {
            "file_name": file_name,
            "original_length": len(text),
            "retry_count": 0,
            "status": "ERROR",
            "error": str(e),
            "loop_history": [],
            "final_vectors": [],
        }

    attempts = final_state.get("attempts") or []
    feedback_history = final_state.get("feedback_history") or []
    final_sections = final_state.get("sections") or []
    no_extraction_reason = final_state.get("no_extraction_reason", "")

    # 每轮循环数据：第 i 轮的提取结果 + evaluator 反馈
    loop_history = []
    for i, attempt_sections in enumerate(attempts):
        feedback = feedback_history[i] if i < len(feedback_history) else None
        loop_history.append({
            "round": i + 1,
            "sections": attempt_sections,
            "evaluator_feedback": feedback,
        })

    # 最终向量化片段：实际存入 Qdrant 的数据结构
    final_vectors = [
        {
            "text": s["content"],
            "metadata": {
                "file_name": file_name,
                "section_topic": s["topic"],
            },
        }
        for s in final_sections
    ]

    return {
        "file_name": file_name,
        "original_length": len(text),
        "retry_count": final_state["retry_count"],
        "status": final_state["status"],
        "no_extraction_reason": no_extraction_reason,
        "loop_history": loop_history,
        "final_vectors": final_vectors,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for fname in TEST_FILES:
        fpath = TEST_DATA_DIR / fname
        if not fpath.exists():
            print(f"⚠️  文件不存在，跳过: {fpath}")
            continue

        print(f"\n{'='*60}")
        print(f"📄 {fname}")
        print(f"{'='*60}")

        result = run_extraction(fpath)

        # 保存 JSON
        safe_name = fpath.stem + ".json"
        out_path = OUTPUT_DIR / safe_name
        out_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # 终端摘要
        print(f"  原文长度: {result['original_length']} 字符")
        print(f"  状态: {result['status']}")
        print(f"  重试次数: {result['retry_count']}")
        print(f"  循环轮次: {len(result['loop_history'])}")
        for r in result["loop_history"]:
            n = len(r["sections"])
            fb = r["evaluator_feedback"] or "-"
            print(f"    第{r['round']}轮: {n} sections | 反馈: {fb[:60]}{'...' if len(fb) > 60 else ''}")
        print(f"  最终向量化片段: {len(result['final_vectors'])} 个")
        for i, v in enumerate(result["final_vectors"], 1):
            print(f"    [{i}] [{v['metadata']['section_topic']}] {len(v['text'])} 字符")
        print(f"  结果已保存: {out_path}")


if __name__ == "__main__":
    main()
