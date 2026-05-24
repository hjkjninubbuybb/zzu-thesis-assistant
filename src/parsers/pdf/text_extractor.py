"""PDF 文本提取，封装 pymupdf4llm 逻辑。"""

import re
from pathlib import Path

import pymupdf4llm

from src.parsers.base import Chunk, ChunkType

# pymupdf4llm 默认写出图片时的引用格式：![](path/to/img.png)
# 归一化为：![IMG_<stem>](path/to/img.png)
_RAW_IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^\)]+\.(png|jpg|jpeg|webp))\)")


def _normalize_image_refs(text: str) -> str:
    """将 pymupdf4llm 生成的 ``![](path)`` 格式统一为 ``![IMG_<stem>](path)``。

    例如：``![](images/page1-img0.png)`` → ``![IMG_page1-img0](images/page1-img0.png)``
    """

    def _replace(m: re.Match) -> str:
        alt = m.group(1)
        path = m.group(2)
        if alt.startswith("IMG_"):
            return m.group(0)  # 已是正确格式，不变
        stem = Path(path).stem
        return f"![IMG_{stem}]({path})"

    return _RAW_IMG_RE.sub(_replace, text)


class PdfTextExtractor:
    """将整份 PDF 转为 Markdown 文本，包装为单一 TEXT Chunk。

    支持两种模式：
    - 纯文本模式（默认）：仅提取文字，图片忽略。
    - 图文模式：提取文字 + 图片引用，图片写入 ``image_dir``，
      文本中包含 ``![IMG_xxx](path)`` 占位符。
    """

    def extract(self, file_path: Path) -> list[Chunk]:
        """提取 PDF 文本（纯文本模式，图片忽略）。

        Args:
            file_path: .pdf 文件路径。

        Returns:
            包含一个 TEXT 类型 Chunk 的列表。
        """
        result = pymupdf4llm.to_markdown(str(file_path))
        markdown_text = (
            result
            if isinstance(result, str)
            else "\n\n".join(p.get("text", "") for p in result)
        )
        return [
            Chunk(
                content=markdown_text,
                chunk_type=ChunkType.TEXT,
                metadata={"source": "text_extractor"},
            )
        ]

    def extract_multimodal(self, file_path: Path, image_dir: Path) -> list[Chunk]:
        """提取 PDF 文本并将图片写入 image_dir（图文模式）。

        文本中图片引用格式归一化为 ``![IMG_<stem>](image_dir/stem.png)``，
        后续由 ``inject_image_descriptions`` 替换为 VLM 描述。

        Args:
            file_path: .pdf 文件路径。
            image_dir: 图片保存目录（不存在时自动创建）。

        Returns:
            包含一个 TEXT 类型 Chunk 的列表（含图片占位符）。
        """
        image_dir.mkdir(parents=True, exist_ok=True)
        result = pymupdf4llm.to_markdown(
            str(file_path),
            write_images=True,
            image_path=str(image_dir),
        )
        markdown_text = (
            result
            if isinstance(result, str)
            else "\n\n".join(p.get("text", "") for p in result)
        )
        markdown_text = _normalize_image_refs(markdown_text)
        return [
            Chunk(
                content=markdown_text,
                chunk_type=ChunkType.TEXT,
                metadata={
                    "source": "text_extractor_multimodal",
                    "image_dir": str(image_dir),
                },
            )
        ]
