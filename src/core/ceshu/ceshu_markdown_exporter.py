"""N9: Markdown 导出器 — 把策划书导出为人类可读的 Markdown 文档

特性:
- 18 章完整结构，含目录跳转锚点
- 字段值复用 ceshu_export_common.format_field_value（bullet="- "）
- systems 章节用表格展示
- 末尾附校验报告附录
- 适合 Git 版本控制
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .ceshu_export_common import classify_systems, format_field_value
from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, CeshuModel

# === 常量 ===
MD_BULLET = "- "
MD_SEPARATOR = "\n\n---\n\n"


def _anchor_for(index: int) -> str:
    """生成章节锚点 ID。"""
    return f"ch{index}"


def _render_header(model: CeshuModel, today: str) -> list[str]:
    """渲染文档头部：标题 + 元信息引用块。"""
    game_name = model.meta.get("game_name", "未命名策划书")
    version_label = model.version_label or "v1.0"
    game_type = model.meta.get("game_type", "—") or "—"
    positioning = model.meta.get("positioning", "—") or "—"
    return [
        f"# {game_name}",
        "",
        f"> 版本: {version_label} | 类型: {game_type} | 日期: {today}",
        f"> 定位: {positioning}",
        "",
    ]


def _render_toc() -> list[str]:
    """渲染目录（带锚点链接）。"""
    lines = ["## 目录", ""]
    for i, key in enumerate(CHAPTER_KEYS, 1):
        title = CHAPTER_LABELS.get(key, key)
        lines.append(f"{i}. [{title}](#{_anchor_for(i)})")
    return lines


def _render_systems_table(data: dict | None) -> list[str]:
    """渲染 systems 章节为 Markdown 表格 + 配置详情。"""
    enabled, disabled = classify_systems(data)
    lines = [
        "| 系统 | 状态 | 数据类型 | 名称 |",
        "|------|------|----------|------|",
    ]
    for sys_id, sys_data in enabled:
        name = sys_data.get("name", sys_id)
        data_type = sys_data.get("data_type", sys_id)
        lines.append(f"| {sys_id} | ✅ 启用 | {data_type} | {name} |")
    for sys_id, sys_data in disabled:
        name = sys_data.get("name", sys_id)
        data_type = sys_data.get("data_type", sys_id)
        lines.append(f"| {sys_id} | ⬜ 未启用 | {data_type} | {name} |")
    if not enabled and not disabled:
        lines.append("| (未配置任何游戏系统) | — | — | — |")

    if enabled:
        lines.append("")
        lines.append("### 已启用系统配置详情")
        for sys_id, sys_data in enabled:
            name = sys_data.get("name", sys_id)
            lines.append("")
            lines.append(f"#### {name} ({sys_id})")
            cfg = sys_data.get("config", {}) or {}
            if cfg:
                for fname, fval in cfg.items():
                    lines.append(
                        f"- **{fname}**: {format_field_value(fval, bullet=MD_BULLET)}"
                    )
            else:
                lines.append("- (无配置)")
    return lines


def _render_chapter(chapter_key: str, data: dict, index: int) -> list[str]:
    """渲染单个章节为 Markdown 行列表。"""
    title = CHAPTER_LABELS.get(chapter_key, chapter_key)
    lines = [f'<a id="{_anchor_for(index)}"></a>', f"## {index}. {title}", ""]
    if chapter_key == "systems":
        lines.extend(_render_systems_table(data))
        return lines
    if not isinstance(data, dict) or not data:
        lines.append("(本章暂无内容)")
        return lines

    required = CHAPTER_REQUIRED_FIELDS.get(chapter_key, [])
    optional_keys = [k for k in data.keys() if k not in required]
    ordered_keys = required + optional_keys
    for fname in ordered_keys:
        if fname not in data:
            continue
        fval = data[fname]
        formatted = format_field_value(fval, bullet=MD_BULLET)
        if "\n" in formatted:
            lines.append(f"**{fname}**:")
            for line in formatted.split("\n"):
                if line.strip():
                    lines.append(line)
        else:
            lines.append(f"**{fname}**: {formatted}")
    return lines


def _render_validation_report(model: CeshuModel) -> list[str]:
    """渲染校验报告附录。"""
    lines = ["## 附录：数据校验报告", ""]
    errors = model.validate() if hasattr(model, "validate") else []
    if not errors:
        lines.append("✅ 所有校验通过，未发现错误。")
        return lines
    lines.append(f"共发现 {len(errors)} 个问题：")
    lines.append("")
    for i, err in enumerate(errors, 1):
        lines.append(f"{i}. {err}")
    return lines


def export_ceshu_to_markdown(model: CeshuModel, output_path: str,
                             include_validation_report: bool = True) -> str:
    """N9: 导出策划书为 Markdown 文档。

    Args:
        model: CeshuModel 实例。
        output_path: 输出路径（自动补 .md 后缀）。
        include_validation_report: 是否在末尾附加校验报告。

    Returns:
        实际输出的文件路径。

    Raises:
        OSError: 输出路径不可写或磁盘空间不足。
    """
    out = Path(output_path)
    if out.suffix.lower() != ".md":
        out = out.with_suffix(".md")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise OSError(f"无法创建输出目录 {out.parent}: {e}") from e

    today = datetime.now().strftime("%Y-%m-%d")
    blocks: list[str] = []
    blocks.append("\n".join(_render_header(model, today)))
    blocks.append("\n".join(_render_toc()))

    for i, key in enumerate(CHAPTER_KEYS, 1):
        chapter_md = "\n".join(_render_chapter(key, model.get_chapter(key), i))
        blocks.append(chapter_md)

    if include_validation_report:
        blocks.append("\n".join(_render_validation_report(model)))

    content = MD_SEPARATOR.join(blocks) + "\n"
    try:
        out.write_text(content, encoding="utf-8")
    except PermissionError as e:
        raise PermissionError(
            f"无法写入文件 {out}：文件可能被其他程序占用，请关闭后重试"
        ) from e
    except OSError as e:
        raise OSError(f"保存 Markdown 文档失败: {e}") from e
    return str(out)
