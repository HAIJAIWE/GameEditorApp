"""N5: 章节模板库 — 18 章预置范例文本，一键插入

每章 3-5 个高质量范例（按游戏类型/风格分类），用户可在 TemplatePickerDialog 中
搜索、预览、一键应用到当前章节。模板字段对齐 CeshuModel 的章节字段结构。

模板结构:
    CHAPTER_TEMPLATES = {
        "meta": [
            {
                "name": "仙侠 RPG 通用模板",
                "description": "...",
                "tags": ["仙侠", "RPG", "国产"],
                "data": {字段: 值, ...}  # 与 CeshuModel.get_chapter(key) 字段对齐
            },
            ...
        ],
        ...
    }
"""
from __future__ import annotations

from typing import Any, TypedDict

from data.chapter_templates_data import CHAPTER_TEMPLATES

# 避免循环引用，直接从 model 取常量；fallback 用于 core.ceshu.ceshu_model
# 在测试或独立使用场景下尚未加载时仍能保留 18 章骨架
try:
    from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
except ImportError:  # pragma: no cover
    CHAPTER_KEYS = [
        "meta", "vision", "worldview", "gameplay",
        "systems", "numeric", "art", "tech", "resources",
        "market_analysis", "characters", "combat", "economy",
        "monetization", "mvp", "risk_handling", "audio", "accessibility",
    ]
    CHAPTER_LABELS = {k: k for k in CHAPTER_KEYS}


class ChapterTemplate(TypedDict):
    """章节模板的结构契约。

    每个模板描述一种可一键应用到 CeshuModel 章节字段的可选预设内容。
    部分章节模板（如 systems）会附带额外 note 字段说明占位用途，
    该字段不参与合并流程，仅作展示提示。
    """

    # 模板名称（用于列表展示与搜索匹配）
    name: str
    # 模板描述（用于提示与搜索匹配）
    description: str
    # 标签列表（用于搜索匹配）
    tags: list[str]
    # 与 CeshuModel.get_chapter(key) 字段对齐的实际数据
    data: dict[str, Any]


# === 工具函数 ===

def list_templates(chapter_key: str) -> list[ChapterTemplate]:
    """获取指定章节的所有模板。

    Args:
        chapter_key: 章节标识（对应 CHAPTER_KEYS 中的元素）。

    Returns:
        该章节下的模板列表；若章节不存在则返回空列表（不抛异常）。
    """
    return CHAPTER_TEMPLATES.get(chapter_key, [])


def search_templates(keyword: str = "") -> list[tuple[str, ChapterTemplate]]:
    """跨章节搜索模板。

    关键词大小写不敏感，会与模板的 name / description / tags 字段做子串匹配。
    若 keyword 为空字符串则返回所有章节的全部模板。

    Args:
        keyword: 关键词（匹配模板名/描述/标签）；为空时返回全部模板。

    Returns:
        形如 [(chapter_key, template), ...] 的列表，顺序按 CHAPTER_TEMPLATES
        的章节顺序与每章模板顺序。无匹配时返回空列表。
    """
    if not keyword:
        return [(k, t) for k, ts in CHAPTER_TEMPLATES.items() for t in ts]
    # 缓存 keyword 的小写形式，避免在循环内重复调用 .lower()
    kw = keyword.lower()
    results = []
    for chapter_key, templates in CHAPTER_TEMPLATES.items():
        for t in templates:
            name = t.get("name", "").lower()
            desc = t.get("description", "").lower()
            tags = " ".join(t.get("tags", [])).lower()
            if kw in name or kw in desc or kw in tags:
                results.append((chapter_key, t))
    return results


def get_template_by_name(chapter_key: str, name: str) -> ChapterTemplate | None:
    """按名称获取模板。

    Args:
        chapter_key: 章节标识。
        name: 模板名称（必须完全匹配 t["name"]）。

    Returns:
        匹配到的模板对象；若章节不存在或无同名模板则返回 None。
    """
    for t in CHAPTER_TEMPLATES.get(chapter_key, []):
        if t.get("name") == name:
            return t
    return None


def template_summary() -> dict[str, int]:
    """统计模板库中每章的模板数量。

    Returns:
        形如 {chapter_key: count} 的字典，键顺序与 CHAPTER_TEMPLATES 一致。
    """
    return {k: len(v) for k, v in CHAPTER_TEMPLATES.items()}


def _is_empty_field(value: Any) -> bool:
    """判断字段值是否视为"空"，仅填充空字段模式下使用。

    数值 0 / False 不视为空，因为它们是有意义的有效值；
    只有 None / 空字符串 / 空列表 / 空字典才视为空，可被模板覆盖。

    Args:
        value: 待判断的字段值。

    Returns:
        True 表示字段为空，可被模板内容覆盖；False 表示字段已有有效值。
    """
    return value in (None, "", [], {})


def merge_template_to_chapter(chapter_data: dict[str, Any], template_data: dict[str, Any],
                               overwrite: bool = False) -> dict[str, Any]:
    """N5: 把模板数据合并到章节数据。

    合并策略:
        - overwrite=True: 模板字段直接覆盖现有同名字段。
        - overwrite=False: 仅当现有字段为空（参见 _is_empty_field）时才填入
          模板值，已有有效值（含 0 / False）保留不变。

    Args:
        chapter_data: 现有章节数据；若类型不是 dict 会被视为空 dict。
        template_data: 模板数据；若类型不是 dict 则原样返回章节数据副本。
        overwrite: True=覆盖现有字段；False=仅填充空字段。

    Returns:
        合并后的章节数据（新对象，不修改原数据）。
    """
    if not isinstance(chapter_data, dict):
        chapter_data = {}
    if not isinstance(template_data, dict):
        return dict(chapter_data)

    result = dict(chapter_data)
    for k, v in template_data.items():
        if overwrite:
            result[k] = v
        else:
            # 仅填充空字段（0 / False 视为有效值，不会被覆盖）
            if _is_empty_field(result.get(k)):
                result[k] = v
    return result
