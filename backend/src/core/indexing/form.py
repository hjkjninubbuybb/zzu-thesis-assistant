"""填报模板流水线（form）：Evaluator-Optimizer 按主题提取 → 直接向量化。"""

import logging
from pathlib import Path

from llama_index.core.schema import TextNode

from src.core.form_extraction import extract_form_sections
from src.core.indexing._helpers import _embed_and_store, _split_text
from src.core.interfaces.storage import BaseDocumentStore, BaseVectorStore
from src.parsers import get_parser

logger = logging.getLogger(__name__)


def _index_form_document(
    kb_name: str,
    file_path: Path,
    file_name: str,
    file_size: int,
    splitter_type: str,
    chunk_size: int,
    chunk_overlap_ratio: float,
    enable_cleaning: bool,
    vs: BaseVectorStore,
    ds: BaseDocumentStore,
) -> dict:
    """填报模板/格式规范入库流程：Evaluator-Optimizer 按主题提取 → 直接向量化。

    1. 解析出全部文本
    2. 调用 extract_form_sections() 按主题提取信息（强模型提取 + 快速模型评估，最多重试 3 次）
    3. 提取成功：每个 section → TextNode（带 section_topic 元数据），直接向量化
    4. 提取失败（空列表）：fallback 到 recursive 切分
    """
    logger.info("[%s] form 类型：Evaluator-Optimizer 主题提取...", kb_name)

    # 1. 解析
    parser = get_parser(file_path.suffix.lower())
    parsed = parser.parse(file_path)
    raw_text = parsed.all_text()

    # 2. LLM 按主题提取
    extraction = extract_form_sections(raw_text, file_name)
    sections = extraction["sections"]
    extraction_status = extraction["status"]

    if sections:
        # 有实质内容：每个 section 直接作为一个 TextNode
        logger.info("[%s] 提取到 %d 个 sections，构建 TextNode...", kb_name, len(sections))
        nodes = [
            TextNode(
                text=s["content"],
                metadata={
                    "file_name": file_name,
                    "kb_name": kb_name,
                    "section_topic": s["topic"],
                },
            )
            for s in sections
        ]
        full_text = "\n\n".join(s["content"] for s in sections)
    elif extraction_status == "PASS":
        # 主动判断无实质内容（空白表单等）：不存 chunk，不 fallback
        logger.info("[%s] form 文档无实质内容，跳过向量化", kb_name)
        nodes = []
        full_text = raw_text
    else:
        # 提取失败（LLM 异常或重试耗尽）：fallback 到 recursive 切分
        logger.warning("[%s] form 提取失败，fallback 到 recursive 切分", kb_name)
        nodes = _split_text(
            raw_text,
            file_name,
            kb_name,
            splitter_type,
            chunk_size,
            chunk_overlap_ratio,
            doc_type="form",
        )
        full_text = raw_text

    return _embed_and_store(
        kb_name,
        file_name,
        file_size,
        chunk_size,
        "form",
        nodes,
        vs,
        ds,
        full_text=full_text,
        splitter_type=splitter_type,
        chunk_overlap_ratio=chunk_overlap_ratio,
    )
