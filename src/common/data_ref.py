"""数据引用引擎 — 策划书 ↔ 数据表的双向引用解析与实时值渲染

引用语法: @data[type_key.field_name]  或  @data[type_key.id.field_name]

示例:
  "角色基础攻击力为 @data[role.atk]，暴击率为 @data[role.crit_rate]%"
  "查看具体角色: @data[role.hero_01.name]"

该模块提供:
  1. parse_data_refs(text) → [Ref]  解析引用
  2. resolve_ref(ref, data_manager) → str  解析实际值
  3. render_refs(text, data_manager) → str  替换为带值的 HTML
  4. extract_all_refs(ceshu_model) → [Ref]  从整本策划书提取
"""

import re
from typing import Any, NamedTuple, Optional

from common.logger import get_logger

logger = get_logger()

# @data[type_key.field]  或  @data[type_key.id.field]
REF_PATTERN = re.compile(r'@data\[([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)\]')


class DataRef(NamedTuple):
    """一个数据引用的完整信息"""
    raw: str          # 原始文本，如 "@data[role.atk]"
    type_key: str     # 数据类型键，如 "role"
    item_id: str      # 条目ID，如 "" 或 "hero_01"
    field: str        # 字段名，如 "atk"
    full_path: str    # 完整路径，如 "role.atk" 或 "role.hero_01.atk"

    def __str__(self):
        return self.raw


def parse_data_refs(text: str) -> list[DataRef]:
    """从文本中解析所有数据引用

    Args:
        text: 包含 @data[...] 的文本

    Returns:
        DataRef 列表
    """
    refs = []
    for match in REF_PATTERN.finditer(text):
        full_path = match.group(1)
        parts = full_path.split(".")
        if len(parts) == 2:
            type_key, field = parts
            item_id = ""
        elif len(parts) == 3:
            type_key, item_id, field = parts
        else:
            continue  # 不支持的格式

        refs.append(DataRef(
            raw=match.group(0),
            type_key=type_key,
            item_id=item_id,
            field=field,
            full_path=full_path,
        ))
    return refs


def resolve_value(data_manager: Any, type_key: str, item_id: str, field: str) -> Optional[Any]:
    """从 data_manager 中解析一个引用的实际值

    Args:
        data_manager: MainWindow 的 data_manager 实例
        type_key: 数据类型键 ("role", "skill", …)
        item_id: 条目ID ("" 表示取第一条)
        field: 字段名

    Returns:
        解析到的值，或 None
    """
    if not data_manager:
        return None

    raw = getattr(data_manager, "data", None)
    if not raw:
        return None

    items = raw.get(type_key, [])
    if not isinstance(items, list) or not items:
        return None

    if item_id:
        target = next((i for i in items if isinstance(i, dict) and i.get("id") == item_id), None)
    else:
        target = items[0] if isinstance(items[0], dict) else None

    if not target or not isinstance(target, dict):
        return None

    return target.get(field)


def resolve_ref(ref: DataRef, data_manager: Any) -> Optional[Any]:
    """解析一个 DataRef 的实际值"""
    return resolve_value(data_manager, ref.type_key, ref.item_id, ref.field)


def render_refs_to_html(text: str, data_manager: Any) -> str:
    """将文本中的引用替换为实际值的 HTML

    对每个 @data[...]:
      - 值存在 → 显示为 <a> 链接，含当前值
      - 值不存在 → 显示为灰色 <span>

    Args:
        text: 原始文本
        data_manager: 数据管理器

    Returns:
        HTML 字符串（带样式，可直接用于 QTextEdit）
    """
    refs = parse_data_refs(text)
    if not refs:
        # 纯文本转 HTML
        import html
        return html.escape(text).replace("\n", "<br>")

    result = text
    for ref in refs:
        value = resolve_ref(ref, data_manager)
        import html
        escaped_path = html.escape(ref.full_path)

        if value is not None:
            display_value = html.escape(str(value)[:60])
            link = (
                f'<a href="data-ref://{ref.type_key}/{escaped_path}" '
                f'style="color: var(--accent, #4f8cf7); '
                f'text-decoration: underline; '
                f'text-decoration-style: dotted; '
                f'border-bottom: 1px dotted var(--accent, #4f8cf7); '
                f'cursor: pointer;" '
                f'title="点击跳转到数据表">{escaped_path}=<b>{display_value}</b></a>'
            )
        else:
            link = (
                f'<span style="color: var(--hint, #888); '
                f'font-style: italic;" '
                f'title="数据未找到">{escaped_path} <i>(无数据)</i></span>'
            )
        result = result.replace(ref.raw, link, 1)

    # 剩余纯文本转义
    import html
    # 但 link 中已经有 HTML 了，所以需要逐段处理
    parts = re.split(r'(<(?:a|span)[^>]*>.*?</(?:a|span)>)', result)
    result = ""
    for part in parts:
        if part.startswith("<"):
            result += part
        else:
            result += html.escape(part).replace("\n", "<br>")
    return result


def extract_all_refs(ceshu_model) -> list[DataRef]:
    """从整本策划书中提取所有引用

    Args:
        ceshu_model: CeshuModel 实例

    Returns:
        所有策划书中出现的 DataRef（去重）
    """
    from core.ceshu.ceshu_model import CHAPTER_KEYS
    seen = set()
    all_refs = []

    for key in CHAPTER_KEYS:
        chapter = getattr(ceshu_model, key, None)
        if not chapter or not isinstance(chapter, dict):
            continue
        for _field_name, field_value in chapter.items():
            if isinstance(field_value, str):
                refs = parse_data_refs(field_value)
                for ref in refs:
                    if ref.full_path not in seen:
                        seen.add(ref.full_path)
                        all_refs.append(ref)
            elif isinstance(field_value, dict):
                # 嵌套字典
                for _, v in field_value.items():
                    if isinstance(v, str):
                        refs = parse_data_refs(v)
                        for ref in refs:
                            if ref.full_path not in seen:
                                seen.add(ref.full_path)
                                all_refs.append(ref)
            elif isinstance(field_value, list):
                for item in field_value:
                    if isinstance(item, str):
                        refs = parse_data_refs(item)
                        for ref in refs:
                            if ref.full_path not in seen:
                                seen.add(ref.full_path)
                                all_refs.append(ref)

    return all_refs
