"""文档索引流程包。

支持三种文档类型：
- ``policy``：政策文件，纯文本流程（默认）
- ``manual``：操作手册，图文混排流程，仅对 PDF 生效
- ``form``：填报模板/格式规范，Evaluator-Optimizer 工作流按主题提取 → 直接向量化
"""

from src.core.indexing.dispatcher import index_document
from src.core.indexing.operations import (
    delete_document,
    embed_and_store_nodes,
    parse_and_clean,
    reindex_document,
    split_content,
)

__all__ = [
    "delete_document",
    "embed_and_store_nodes",
    "index_document",
    "parse_and_clean",
    "reindex_document",
    "split_content",
]
