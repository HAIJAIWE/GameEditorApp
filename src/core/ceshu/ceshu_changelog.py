"""N15: 策划书变更日志生成 — 从版本对比自动生成 changelog

核心数据结构:
    ChangelogEntry — 单个版本的变更条目
    Changelog       — 完整变更日志（多个 entry）

主要函数:
    generate_changelog(versions, manager, library) -> Changelog
        从版本列表生成完整变更日志（按时间排序，逐对计算 diff）

    generate_changelog_between(old_model, new_model, ...) -> ChangelogEntry
        生成两个版本之间的变更条目（调用 compute_version_diff）

变更描述生成规则:
    - added:    "新增字段 {field}：{new_value}"
    - removed:  "删除字段 {field}（原值：{old_value}）"
    - modified: "修改字段 {field}：{old_value} → {new_value}"
    - systems 章节特殊处理:
        "启用系统 {sys_id}" / "禁用系统 {sys_id}" / "修改系统 {sys_id} 配置"

本模块纯 Python，不依赖 PyQt6；``compute_version_diff`` 通过懒导入获取，
PyQt6 缺失时调用方需自行 skip。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from core.ceshu.ceshu_manager import CeshuManager
    from core.ceshu.ceshu_model import CeshuModel

# systems 章节键
_SYSTEMS_CHAPTER_KEY: str = "systems"

# 变更类型常量（与 DiffType 枚举字符串值一致）
_DIFF_TYPE_ADDED: str = "added"
_DIFF_TYPE_REMOVED: str = "removed"
_DIFF_TYPE_MODIFIED: str = "modified"
_DIFF_TYPE_UNCHANGED: str = "unchanged"


@dataclass
class ChangelogEntry:
    """单个版本的变更条目

    Attributes:
        version: 版本标签（如 "v1.1"）
        date: 该版本日期（创建/更新时间）
        author: 作者（可选）
        summary: 一句话摘要（如 "新增 5 处变更"）
        changes: 变更明细列表，每项为
            ``{type, chapter, field, old, new, description}`` 字典
    """
    version: str
    date: str
    author: str = ""
    summary: str = ""
    changes: list[dict] = field(default_factory=list)

    @property
    def change_count(self) -> int:
        """变更条目数量。"""
        return len(self.changes)

    @property
    def is_empty(self) -> bool:
        """是否无变更。"""
        return not self.changes


@dataclass
class Changelog:
    """完整变更日志（多个版本条目）"""
    entries: list[ChangelogEntry] = field(default_factory=list)

    @property
    def total_changes(self) -> int:
        """全部变更总数。"""
        return sum(e.change_count for e in self.entries)

    @property
    def is_empty(self) -> bool:
        """是否无任何条目。"""
        return not self.entries

    def to_markdown(self) -> str:
        """渲染为 Markdown 格式。

        Returns:
            Markdown 字符串。
        """
        lines: list[str] = ["# 变更日志", ""]
        if self.is_empty:
            lines.append("（暂无变更记录）")
            return "\n".join(lines)
        lines.append(f"共 {len(self.entries)} 个版本，{self.total_changes} 处变更。")
        lines.append("")
        for entry in self.entries:
            lines.append(f"## {entry.version} — {entry.summary}")
            lines.append("")
            meta_parts: list[str] = []
            if entry.date:
                meta_parts.append(f"**日期**: {entry.date}")
            if entry.author:
                meta_parts.append(f"**作者**: {entry.author}")
            meta_parts.append(f"**变更数**: {entry.change_count}")
            lines.append(" | ".join(meta_parts))
            lines.append("")
            if entry.is_empty:
                lines.append("（无变更）")
                lines.append("")
                continue
            # 按章节分组
            by_chapter: dict[str, list[dict]] = {}
            for c in entry.changes:
                ck = c.get("chapter", "")
                by_chapter.setdefault(ck, []).append(c)
            for chapter, changes in by_chapter.items():
                lines.append(f"### {chapter}")
                lines.append("")
                for c in changes:
                    ctype = c.get("type", "")
                    desc = c.get("description", "")
                    lines.append(f"- [{ctype}] {desc}")
                lines.append("")
        return "\n".join(lines)

    def to_text(self) -> str:
        """渲染为纯文本格式。

        Returns:
            纯文本字符串。
        """
        lines: list[str] = ["变更日志", "=" * 40, ""]
        if self.is_empty:
            lines.append("（暂无变更记录）")
            return "\n".join(lines)
        lines.append(f"共 {len(self.entries)} 个版本，{self.total_changes} 处变更。")
        lines.append("")
        for entry in self.entries:
            lines.append(f"[{entry.version}] {entry.summary}")
            meta_parts: list[str] = []
            if entry.date:
                meta_parts.append(f"日期: {entry.date}")
            if entry.author:
                meta_parts.append(f"作者: {entry.author}")
            meta_parts.append(f"变更数: {entry.change_count}")
            lines.append("  " + " | ".join(meta_parts))
            if entry.is_empty:
                lines.append("  （无变更）")
                lines.append("")
                continue
            by_chapter: dict[str, list[dict]] = {}
            for c in entry.changes:
                ck = c.get("chapter", "")
                by_chapter.setdefault(ck, []).append(c)
            for chapter, changes in by_chapter.items():
                lines.append(f"  [{chapter}]")
                for c in changes:
                    ctype = c.get("type", "")
                    desc = c.get("description", "")
                    lines.append(f"    - ({ctype}) {desc}")
            lines.append("")
        return "\n".join(lines)

    def to_html(self) -> str:
        """渲染为 HTML 格式。

        Returns:
            HTML 字符串（含简单内联样式，无外部依赖）。
        """
        parts: list[str] = [
            "<!DOCTYPE html>",
            "<html lang='zh-CN'>",
            "<head><meta charset='UTF-8'>",
            "<style>",
            "body { font-family: 'Microsoft YaHei', sans-serif; padding: 20px; }",
            "h1 { color: #4f8cf7; }",
            "h2 { color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 4px; }",
            "h3 { color: #555; }",
            ".meta { color: #888; font-size: 12px; }",
            ".change { margin: 2px 0; }",
            ".type-added { color: #22C55E; font-weight: bold; }",
            ".type-removed { color: #EF4444; font-weight: bold; }",
            ".type-modified { color: #F59E0B; font-weight: bold; }",
            ".chapter { margin-top: 8px; font-weight: bold; color: #333; }",
            "</style>",
            "</head>",
            "<body>",
            "<h1>变更日志</h1>",
        ]
        if self.is_empty:
            parts.append("<p>（暂无变更记录）</p>")
        else:
            parts.append(
                f"<p>共 {len(self.entries)} 个版本，"
                f"{self.total_changes} 处变更。</p>"
            )
            for entry in self.entries:
                parts.append(f"<h2>{_esc(entry.version)} — {_esc(entry.summary)}</h2>")
                meta_parts: list[str] = []
                if entry.date:
                    meta_parts.append(f"日期: {_esc(entry.date)}")
                if entry.author:
                    meta_parts.append(f"作者: {_esc(entry.author)}")
                meta_parts.append(f"变更数: {entry.change_count}")
                parts.append(f"<p class='meta'>{' | '.join(meta_parts)}</p>")
                if entry.is_empty:
                    parts.append("<p>（无变更）</p>")
                    continue
                by_chapter: dict[str, list[dict]] = {}
                for c in entry.changes:
                    ck = c.get("chapter", "")
                    by_chapter.setdefault(ck, []).append(c)
                for chapter, changes in by_chapter.items():
                    parts.append(f"<div class='chapter'>[{_esc(chapter)}]</div>")
                    for c in changes:
                        ctype = c.get("type", "")
                        desc = c.get("description", "")
                        type_class = f"type-{_esc(ctype)}"
                        parts.append(
                            f"<div class='change'>"
                            f"<span class='{type_class}'>[{_esc(ctype)}]</span> "
                            f"{_esc(desc)}</div>"
                        )
        parts.append("</body></html>")
        return "\n".join(parts)


# ── 工具函数 ──

def _esc(text: Any) -> str:
    """转义 HTML 特殊字符。"""
    if text is None:
        return ""
    s = str(text)
    return (s.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;"))


def _format_value(v: Any, max_len: int = 80) -> str:
    """格式化字段值为可读字符串。"""
    if v is None:
        return "(空)"
    if isinstance(v, bool):
        return "是" if v else "否"
    if isinstance(v, (dict, list)):
        try:
            s = json.dumps(v, ensure_ascii=False)
        except Exception:
            s = str(v)
    else:
        s = str(v)
    if len(s) > max_len:
        return s[:max_len] + "..."
    return s


def _load_compute_diff():
    """懒导入 compute_version_diff，避免 PyQt6 缺失时模块加载失败。"""
    from ui.ceshu.version_diff_dialog import compute_version_diff
    return compute_version_diff


# ── 核心：变更描述生成 ──

def _build_change_description(diff_type: str, field_label: str,
                              old_value: Any, new_value: Any,
                              chapter_key: str) -> str:
    """根据 diff 类型生成人类可读的变更描述。

    Args:
        diff_type: 变更类型（added/removed/modified/unchanged）。
        field_label: 字段标签。
        old_value: 旧值。
        new_value: 新值。
        chapter_key: 所属章节键名（用于 systems 特殊处理）。

    Returns:
        变更描述字符串。
    """
    if chapter_key == _SYSTEMS_CHAPTER_KEY:
        # systems 章节：field_label 形如 "battle (enabled)"
        sys_id = field_label.split(" ", 1)[0] if " " in field_label else field_label
        if diff_type == _DIFF_TYPE_ADDED:
            return f"启用系统 {sys_id}"
        if diff_type == _DIFF_TYPE_REMOVED:
            return f"禁用系统 {sys_id}"
        if diff_type == _DIFF_TYPE_MODIFIED:
            return f"修改系统 {sys_id} 配置"
        return f"系统 {sys_id} 未变"

    old_text = _format_value(old_value)
    new_text = _format_value(new_value)
    if diff_type == _DIFF_TYPE_ADDED:
        return f"新增字段 {field_label}：{new_text}"
    if diff_type == _DIFF_TYPE_REMOVED:
        return f"删除字段 {field_label}（原值：{old_text}）"
    if diff_type == _DIFF_TYPE_MODIFIED:
        return f"修改字段 {field_label}：{old_text} → {new_text}"
    return f"字段 {field_label} 未变"


def _diff_type_str(diff_type: Any) -> str:
    """把 DiffType 枚举或字符串归一化为字符串。"""
    if hasattr(diff_type, "value"):
        return str(diff_type.value)
    return str(diff_type)


def _chapter_label(chapter_key: str) -> str:
    """获取章节中文标签；缺失时返回原 key。"""
    try:
        from core.ceshu.ceshu_model import CHAPTER_LABELS
        return CHAPTER_LABELS.get(chapter_key, chapter_key)
    except ImportError:
        return chapter_key


# ── 核心：生成函数 ──

def generate_changelog_between(old_model: CeshuModel,
                                new_model: CeshuModel,
                                version_label: str = "",
                                date: str = "",
                                author: str = "") -> ChangelogEntry:
    """生成两个版本之间的变更条目。

    调用 ``ui.ceshu.version_diff_dialog.compute_version_diff`` 计算 Diff，
    并把每个 FieldDiff 转换为人类可读的变更描述。

    Args:
        old_model: 旧版本 CeshuModel。
        new_model: 新版本 CeshuModel。
        version_label: 版本标签（如 "v1.1"）；为空时取 new_model.version_label。
        date: 日期字符串；为空时取 new_model.updated_at/created_at。
        author: 作者（可选）。

    Returns:
        ChangelogEntry 实例。
    """
    compute_version_diff = _load_compute_diff()
    diff = compute_version_diff(old_model, new_model)

    label = version_label or getattr(new_model, "version_label", "")
    if not date:
        date = (getattr(new_model, "updated_at", "")
                or getattr(new_model, "created_at", ""))

    changes: list[dict] = []
    added = removed = modified = 0
    for ch_diff in diff.chapter_diffs:
        chapter_key = ch_diff.chapter_key
        chapter_label = _chapter_label(chapter_key)
        for fd in ch_diff.field_diffs:
            dt = _diff_type_str(fd.diff_type)
            if dt == _DIFF_TYPE_UNCHANGED:
                continue
            desc = _build_change_description(
                dt, fd.field_label, fd.old_value, fd.new_value, chapter_key,
            )
            changes.append({
                "type": dt,
                "chapter": chapter_label,
                "field": fd.field_label,
                "old": _format_value(fd.old_value),
                "new": _format_value(fd.new_value),
                "description": desc,
            })
            if dt == _DIFF_TYPE_ADDED:
                added += 1
            elif dt == _DIFF_TYPE_REMOVED:
                removed += 1
            elif dt == _DIFF_TYPE_MODIFIED:
                modified += 1

    total = added + removed + modified
    summary = f"新增 {added} / 删除 {removed} / 修改 {modified}（共 {total} 处）"
    return ChangelogEntry(
        version=label,
        date=date,
        author=author,
        summary=summary,
        changes=changes,
    )


def generate_changelog(versions: list,
                        manager: CeshuManager,
                        library: str) -> Changelog:
    """从版本列表生成完整变更日志。

    Args:
        versions: 版本信息列表（来自 ``CeshuManager.list_versions``），
            每项含 ceshu_id / version_label / updated_at / name 等字段。
        manager: CeshuManager 实例，用于按 ID 加载模型。
        library: 库名。

    Returns:
        Changelog 实例。版本数 < 2 时返回空 Changelog。
    """
    if not versions or len(versions) < 2:
        return Changelog(entries=[])
    # 按 updated_at / created_at 升序排序
    def _sort_key(v: dict) -> str:
        return v.get("updated_at") or v.get("created_at") or ""
    sorted_versions = sorted(versions, key=_sort_key)

    entries: list[ChangelogEntry] = []
    for i in range(1, len(sorted_versions)):
        old_v = sorted_versions[i - 1]
        new_v = sorted_versions[i]
        old_id = old_v.get("ceshu_id", "")
        new_id = new_v.get("ceshu_id", "")
        if not old_id or not new_id or old_id == new_id:
            continue
        try:
            old_model = manager.get_ceshu(old_id, library)
            new_model = manager.get_ceshu(new_id, library)
        except Exception:
            continue
        entry = generate_changelog_between(
            old_model=old_model,
            new_model=new_model,
            version_label=new_v.get("version_label", ""),
            date=new_v.get("updated_at") or new_v.get("created_at", ""),
            author="",
        )
        entries.append(entry)
    return Changelog(entries=entries)
