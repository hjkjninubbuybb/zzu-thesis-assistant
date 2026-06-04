"""索引阶段 2：分块。"""

import logging

from llama_index.core.schema import TextNode

from src.core.form_extraction import extract_form_sections
from src.core.indexing._helpers import _split_text

logger = logging.getLogger(__name__)


def split_content(
    text: str,
    file_name: str,
    kb_name: str,
    splitter_type: str = "recursive",
    chunk_size: int = 256,
    chunk_overlap_ratio: float = 0.2,
    doc_type: str = "policy",
) -> list:
    """对清洗后的文本执行分块，返回 TextNode 列表。

    Args:
        text: 清洗后的文本。
        file_name: 文件名。
        kb_name: 知识库名称。
        splitter_type: 分块策略。
        chunk_size: 分块大小。
        chunk_overlap_ratio: 分块重叠比例。
        doc_type: 文档类型。

    Returns:
        TextNode 列表。
    """
    if doc_type == "form":
        sections_result = extract_form_sections(text, file_name)
        sections = sections_result.get("sections", [])
        extraction_status = sections_result.get("status", "")
        if sections and extraction_status != "PASS":
            nodes = [
                TextNode(
                    text=s["content"],
                    metadata={
                        "file_name": file_name,
                        "kb_name": kb_name,
                        "doc_type": doc_type,
                        "section_topic": s.get("topic", ""),
                    },
                )
                for s in sections
            ]
            if nodes:
                return nodes
        # fallback to regular splitting

    return _split_text(
        text,
        file_name,
        kb_name,
        splitter_type,
        chunk_size,
        chunk_overlap_ratio,
        doc_type,
    )
