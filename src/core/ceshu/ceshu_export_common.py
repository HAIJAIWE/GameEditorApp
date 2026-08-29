"""导出器公用工具 — docx / pptx / pdf 共享的字段格式化与章节渲染辅助。

设计目标：
- 消除 ceshu_docx_exporter / ceshu_pptx_exporter / ceshu_pdf_exporter 之间的重复代码
- 提供统一的字段值格式化（列表前缀可配置）
- 提供统一的 systems 章节分类（启用 / 未启用）
"""
from __future__ import annotations

from typing import Any

# === 空值显示符 ===
EMPTY_PLACEHOLDER = "—"


def is_empty_value(value: Any) -> bool:
    """判断字段值是否视为"空"。

    视为空的情况：
        - None
        - 空字符串或纯空白字符串
        - 空列表 / 空字典

    注意：数值 0 / 布尔 False 不视为空（业务上可能是有效值）。
    """
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def format_field_value(value: Any, indent: int = 0, bullet: str = "- ") -> str:
    """将字段值格式化为人类可读的多行文本。

    Args:
        value: 任意字段值（None / str / int / float / bool / list / dict）。
        indent: 缩进层级，每层增加两个空格。
        bullet: 列表项前缀符号。docx 用 "- "，pptx 用 "• "。

    Returns:
        多行人类可读字符串；空值统一返回 ``EMPTY_PLACEHOLDER``。
    """
    if value is None:
        return EMPTY_PLACEHOLDER
    if isinstance(value, str):
        return value if value.strip() else EMPTY_PLACEHOLDER
    if isinstance(value, bool):
        return "是" if value else "否"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        if not value:
            return EMPTY_PLACEHOLDER
        prefix = "  " * indent + bullet
        lines: list[str] = []
        for item in value:
            if isinstance(item, dict):
                parts = [f"{k}: {v}" for k, v in item.items()
                         if not is_empty_value(v)]
                lines.append(prefix + (" | ".join(parts) if parts else "(空)"))
            elif isinstance(item, str):
                lines.append(prefix + item)
            else:
                lines.append(prefix + str(item))
        return "\n".join(lines)
    if isinstance(value, dict):
        if not value:
            return EMPTY_PLACEHOLDER
        prefix = "  " * indent
        lines = []
        for k, v in value.items():
            if isinstance(v, (dict, list)):
                inner = format_field_value(v, indent + 1, bullet)
                lines.append(f"{prefix}{k}:")
                lines.append(f"{prefix}  {inner}")
            else:
                lines.append(f"{prefix}{k}: {format_field_value(v, indent, bullet)}")
        return "\n".join(lines)
    return str(value)


def classify_systems(data: dict | None) -> tuple[list[tuple[str, dict]], list[tuple[str, dict]]]:
    """把 systems 章节数据分为 (已启用, 未启用) 两组。

    Args:
        data: systems 章节原始数据，可为 None。

    Returns:
        (enabled, disabled) 两个列表，每个元素为 (sys_id, sys_data)。
    """
    enabled: list[tuple[str, dict]] = []
    disabled: list[tuple[str, dict]] = []
    for sys_id, sys_data in (data or {}).items():
        if not isinstance(sys_data, dict):
            continue
        if sys_data.get("enabled"):
            enabled.append((sys_id, sys_data))
        else:
            disabled.append((sys_id, sys_data))
    return enabled, disabled
