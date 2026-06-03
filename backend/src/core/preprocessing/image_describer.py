"""VLM 批量图片描述注入。

将文本中的 ``![IMG_xxx](path)`` 格式占位符替换为 VLM 生成的中文描述。

核心特性：
- 批量调用（batch_size=8），比逐张快约 3 倍
- MD5 缓存：重建索引时跳过已描述的图片
- 失败降级：VLM 调用失败时保留空描述，不中断流程
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
from pathlib import Path

from src.config import get_api_key

logger = logging.getLogger(__name__)

_MIME_MAP = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}

_MD_IMG_RE = re.compile(r"!\[IMG_([^\]]+)\]\(([^\)]+)\)")

# 实测最优批量大小：8张/次，成功率100%，每张图 0.78s（比逐张快3.2倍）
_VLM_BATCH_SIZE = 8

# VLM 描述缓存（按图片内容 MD5，跨索引复用）
_VLM_CACHE_FILE = Path(__file__).parents[3] / "data" / "vlm_desc_cache.json"


def _load_vlm_cache() -> dict[str, str]:
    if _VLM_CACHE_FILE.exists():
        try:
            return json.loads(_VLM_CACHE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.debug("[image_describer] 加载 VLM 缓存失败，跳过: %s", e)
    return {}


def _save_vlm_cache(cache: dict[str, str]) -> None:
    _VLM_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _VLM_CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def _img_md5(img_path: Path) -> str:
    return hashlib.md5(img_path.read_bytes()).hexdigest()


def _find_image_path(image_base_dir: Path, img_ref: str) -> Path | None:
    """根据 img_ref 在 image_base_dir 下查找图片文件。"""
    for ext in ("png", "jpg", "jpeg", "webp"):
        candidate = image_base_dir / f"{img_ref}.{ext}"
        if candidate.exists():
            return candidate
    return None


def _describe_images_batch(
    refs: list[tuple[str, Path]],
    vlm_model: str,
) -> dict[str, str]:
    """批量调用 VLM 描述多张图片，返回 {img_ref: description}。
    失败时返回空 dict，由调用方降级处理。
    """
    try:
        from dashscope import MultiModalConversation  # type: ignore[import]
    except ImportError:
        logger.warning("[image_describer] dashscope 未安装，跳过 VLM 描述")
        return {}

    content: list[dict] = []
    for _, img_path in refs:
        ext = img_path.suffix.lstrip(".").lower()
        mime = _MIME_MAP.get(ext, "image/png")
        try:
            img_b64 = base64.b64encode(img_path.read_bytes()).decode()
        except OSError as e:
            logger.warning("[image_describer] 读取图片失败 %s: %s", img_path.name, e)
            return {}
        content.append({"image": f"data:{mime};base64,{img_b64}"})

    ref_names = "、".join(f"图{i + 1}" for i in range(len(refs)))
    content.append(
        {
            "text": (
                f"以上 {len(refs)} 张图片，按顺序编号为 {ref_names}。"
                "请对每张图片用一句中文描述其主要内容（包含页面名称、图表类型、关键数据等），"
                '严格按 JSON 数组返回，顺序与图片一致，例如：["描述1", "描述2"]'
            )
        }
    )

    try:
        resp = MultiModalConversation.call(
            model=vlm_model,
            messages=[{"role": "user", "content": content}],
            api_key=get_api_key(),
        )
        if resp.status_code != 200:
            logger.warning("[image_describer] VLM 批量描述失败 HTTP %s", resp.status_code)
            return {}

        raw = resp.output.choices[0].message.content[0]["text"].strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)

        descs = json.loads(raw)
        if not isinstance(descs, list):
            logger.warning("[image_describer] VLM 返回不是数组: %s", raw[:100])
            return {}

        return {ref: descs[i] for i, (ref, _) in enumerate(refs) if i < len(descs) and descs[i]}
    except json.JSONDecodeError as e:
        logger.warning("[image_describer] JSON 解析失败: %s", e)
        return {}
    except Exception as e:
        logger.warning("[image_describer] VLM 批量描述异常: %s", e)
        return {}


def inject_image_descriptions(
    text: str,
    image_base_dir: Path,
    vlm_model: str = "qwen-vl-plus",
) -> str:
    """将文本中的 ``![IMG_xxx](path)`` 占位符替换为 VLM 生成的中文描述。

    替换格式：``[图片(img_ref)：<description>]``
    描述失败时保留空描述（不中断流程）。

    批量调用 VLM（每批 _VLM_BATCH_SIZE 张），比逐张调用快约 3 倍。

    Args:
        text:           含 ``![IMG_xxx](path)`` 占位符的原始文本。
        image_base_dir: 图片文件根目录。
        vlm_model:      VLM 模型名（默认 qwen-vl-plus）。

    Returns:
        替换图片占位符后的完整文本。
    """
    matches = list(_MD_IMG_RE.finditer(text))
    if not matches:
        return text

    cache = _load_vlm_cache()
    desc_map: dict[str, str] = {}
    to_fetch: list[tuple[str, Path]] = []

    for m in matches:
        img_ref = m.group(1)
        img_path = _find_image_path(image_base_dir, img_ref)
        if not img_path:
            logger.debug("[image_describer] 图片文件未找到: %s", img_ref)
            continue
        key = _img_md5(img_path)
        if key in cache:
            desc_map[img_ref] = cache[key]
        else:
            to_fetch.append((img_ref, img_path))

    logger.info(
        "[image_describer] %d 张命中缓存，%d 张需调 VLM",
        len(desc_map),
        len(to_fetch),
    )

    for i in range(0, len(to_fetch), _VLM_BATCH_SIZE):
        batch = to_fetch[i : i + _VLM_BATCH_SIZE]
        batch_descs = _describe_images_batch(batch, vlm_model)
        for img_ref, img_path in batch:
            desc = batch_descs.get(img_ref, "")
            desc_map[img_ref] = desc
            if desc:
                cache[_img_md5(img_path)] = desc
        logger.info(
            "[image_describer] 批次 %d/%d 完成，本批 %d 张，成功 %d 张",
            i // _VLM_BATCH_SIZE + 1,
            -(-len(to_fetch) // _VLM_BATCH_SIZE),
            len(batch),
            len(batch_descs),
        )

    _save_vlm_cache(cache)

    def _replace(m: re.Match) -> str:
        img_ref = m.group(1)
        desc = desc_map.get(img_ref, "")
        return f"[图片({img_ref})：{desc}]"

    return _MD_IMG_RE.sub(_replace, text)
