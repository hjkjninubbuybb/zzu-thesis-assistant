"""文档索引流程包。

支持三种文档类型：
- ``policy``：政策文件，纯文本流程（默认）
- ``manual``：操作手册，图文混排流程，仅对 PDF 生效
- ``form``：填报模板/格式规范，Evaluator-Optimizer 工作流按主题提取 → 直接向量化

公开阶段函数按职责拆分到 _stage_*.py：
- ``_stage_parse.parse_and_clean``：解析 + 清洗
- ``_stage_split.split_content``：分块
- ``_stage_embed.embed_and_store_nodes``：向量化 + 入库
- ``_stage_lifecycle.delete_document`` / ``reindex_document``：删除 / 重索引
"""

from src.core.indexing._stage_embed import embed_and_store_nodes
from src.core.indexing._stage_lifecycle import delete_document, reindex_document
from src.core.indexing._stage_parse import parse_and_clean
from src.core.indexing._stage_split import split_content
from src.core.indexing.dispatcher import index_document

__all__ = [
    "delete_document",
    "embed_and_store_nodes",
    "index_document",
    "parse_and_clean",
    "reindex_document",
    "split_content",
]
