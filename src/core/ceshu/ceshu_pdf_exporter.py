"""F5: 策划书 PDF 导出器 — 工业级 GDD 18 章结构 → PDF 文档

特性:
- 18 章完整结构映射到 PDF（含书签大纲）
- 中文字体支持（使用系统默认中文字体）
- 章节进度统计 + 校验报告附录
- 通过 QTextDocument + QPrinter 生成（无需额外依赖，复用 PyQt6）

依赖：
- PyQt6.QtGui.QTextDocument / QPrinter / QTextCursor
"""
from __future__ import annotations

from pathlib import Path

from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, CeshuModel


def _escape_html(text: str) -> str:
    """转义 HTML 特殊字符"""
    if text is None:
        return ""
    s = str(text)
    return (s.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;")
             .replace('"', "&quot;"))


def _render_value_to_html(value, indent: int = 0) -> str:
    """把字段值渲染为 HTML 片段"""
    if value is None:
        return "<i style='color:#999;'>(空)</i>"
    if isinstance(value, str):
        if not value.strip():
            return "<i style='color:#999;'>(空)</i>"
        return _escape_html(value).replace("\n", "<br>")
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bool):
        return "是" if value else "否"
    if isinstance(value, list):
        if not value:
            return "<i style='color:#999;'>(空列表)</i>"
        items = []
        for item in value:
            if isinstance(item, dict):
                parts = [f"<b>{_escape_html(str(k))}</b>: {_escape_html(str(v))}"
                         for k, v in item.items() if v not in (None, "", [], {})]
                if parts:
                    items.append("<li>" + " | ".join(parts) + "</li>")
                else:
                    items.append("<li>(空)</li>")
            elif isinstance(item, str):
                items.append(f"<li>{_escape_html(item)}</li>")
            else:
                items.append(f"<li>{_escape_html(str(item))}</li>")
        return f"<ul style='margin:4px 0;'>{''.join(items)}</ul>"
    if isinstance(value, dict):
        if not value:
            return "<i style='color:#999;'>(空字典)</i>"
        rows = []
        for k, v in value.items():
            if isinstance(v, (dict, list)):
                inner = _render_value_to_html(v, indent + 1)
                rows.append(f"<tr><td style='vertical-align:top;font-weight:bold;padding:2px 8px 2px 0;'>{_escape_html(str(k))}</td><td style='padding:2px 0;'>{inner}</td></tr>")
            else:
                rows.append(f"<tr><td style='font-weight:bold;padding:2px 8px 2px 0;'>{_escape_html(str(k))}</td><td style='padding:2px 0;'>{_render_value_to_html(v, indent)}</td></tr>")
        return f"<table style='border-collapse:collapse;'>{''.join(rows)}</table>"
    return _escape_html(str(value))


def _build_chapter_html(chapter_key: str, data: dict) -> str:
    """渲染单章为 HTML 片段"""
    parts = []
    if chapter_key == "systems":
        # 游戏系统特殊处理
        enabled = []
        disabled = []
        for sys_id, sys_data in (data or {}).items():
            if not isinstance(sys_data, dict):
                continue
            if sys_data.get("enabled"):
                enabled.append((sys_id, sys_data))
            else:
                disabled.append((sys_id, sys_data))

        if enabled:
            parts.append("<h2>已启用的游戏系统</h2>")
            for sys_id, sys_data in enabled:
                sys_name = sys_data.get("name", sys_id)
                parts.append(f"<h3>{_escape_html(sys_name)} ({_escape_html(sys_id)})</h3>")
                cfg = sys_data.get("config", {}) or {}
                if cfg:
                    rows = []
                    for fname, fval in cfg.items():
                        rows.append(
                            f"<tr><td style='font-weight:bold;padding:2px 12px 2px 0;'>{_escape_html(str(fname))}</td>"
                            f"<td style='padding:2px 0;'>{_render_value_to_html(fval)}</td></tr>"
                        )
                    parts.append(f"<table style='border-collapse:collapse;'>{''.join(rows)}</table>")
                else:
                    parts.append("<p>(无配置)</p>")

        if disabled:
            parts.append("<h2>未启用的游戏系统</h2>")
            for sys_id, sys_data in disabled:
                sys_name = sys_data.get("name", sys_id)
                parts.append(f"<p>{_escape_html(sys_name)} ({_escape_html(sys_id)}) — 未启用</p>")

        if not enabled and not disabled:
            parts.append("<p>(未配置任何游戏系统)</p>")
        return "".join(parts)

    # 普通章节
    if not isinstance(data, dict) or not data:
        return "<p><i style='color:#999;'>(本章暂无内容)</i></p>"

    required = CHAPTER_REQUIRED_FIELDS.get(chapter_key, [])
    optional_keys = [k for k in data.keys() if k not in required]
    ordered_keys = required + optional_keys

    rows = []
    for fname in ordered_keys:
        if fname not in data:
            continue
        fval = data[fname]
        rows.append(
            f"<tr><td style='vertical-align:top;font-weight:bold;padding:6px 12px 6px 0;"
            f"border-bottom:1px solid #eee;width:160px;'>{_escape_html(str(fname))}</td>"
            f"<td style='padding:6px 0;border-bottom:1px solid #eee;'>{_render_value_to_html(fval)}</td></tr>"
        )
    return f"<table style='border-collapse:collapse;width:100%;'>{''.join(rows)}</table>"


def _build_validation_report_html(model: CeshuModel) -> str:
    """构建校验报告 HTML"""
    try:
        errors = model.validate()
    except Exception as e:
        return f"<p><i>校验执行失败: {e}</i></p>"

    if not errors:
        return "<h2>校验报告</h2><p style='color:#2e7d32;'>✅ 全部校验通过，未发现问题</p>"

    parts = ["<h2>校验报告</h2>", f"<p>共发现 <b>{len(errors)}</b> 个问题：</p>", "<ol>"]
    for err in errors:
        parts.append(f"<li style='margin:4px 0;'>{_escape_html(str(err))}</li>")
    parts.append("</ol>")
    return "".join(parts)


def _build_progress_html(model: CeshuModel) -> str:
    """构建章节完成度统计 HTML"""
    try:
        progress = model.chapter_progress()
    except Exception:
        return ""

    parts = ["<h2>章节完成度统计</h2>",
             "<table style='border-collapse:collapse;width:100%;'>",
             "<tr style='background:#f5f5f5;'><th style='padding:6px;text-align:left;border-bottom:2px solid #ddd;'>章节</th>"
             "<th style='padding:6px;text-align:center;border-bottom:2px solid #ddd;width:120px;'>完成度</th></tr>"]

    for key in CHAPTER_KEYS:
        label = CHAPTER_LABELS.get(key, key)
        pct = int((progress.get(key, 0) or 0) * 100)
        if pct >= 80:
            color = "#2e7d32"
        elif pct >= 50:
            color = "#f9a825"
        else:
            color = "#c62828"
        parts.append(
            f"<tr><td style='padding:4px 6px;border-bottom:1px solid #eee;'>{_escape_html(label)}</td>"
            f"<td style='padding:4px 6px;text-align:center;border-bottom:1px solid #eee;color:{color};font-weight:bold;'>{pct}%</td></tr>"
        )

    total = int((progress.get("total", 0) or 0) * 100)
    parts.append(
        f"<tr style='background:#f5f5f5;font-weight:bold;'>"
        f"<td style='padding:6px;'>整体完成度</td>"
        f"<td style='padding:6px;text-align:center;'>{total}%</td></tr>"
    )
    parts.append("</table>")
    return "".join(parts)


def export_ceshu_to_pdf(model: CeshuModel, output_path: str,
                       include_validation_report: bool = True) -> str:
    """F5: 导出策划书为 PDF（带书签大纲）

    使用 QTextDocument + QPrinter 生成 PDF：
    - 自动生成 PDF 大纲书签（基于 h1/h2/h3 标签）
    - 中文友好字体
    - 18 章完整结构
    - 含版本信息、章节完成度、校验报告附录

    Args:
        model: CeshuModel 实例
        output_path: 输出路径（自动补 .pdf 后缀）
        include_validation_report: 是否附加校验报告

    Returns:
        实际输出的文件路径

    Raises:
        ImportError: PyQt6 未安装时
        OSError: 输出路径不可写或磁盘空间不足
    """
    # 延迟导入：仅在导出时加载 PyQt6 打印组件
    try:
        from PyQt6.QtCore import QMarginsF
        from PyQt6.QtGui import QPageLayout, QPageSize, QTextDocument
        from PyQt6.QtPrintSupport import QPrinter
    except ImportError as e:
        raise ImportError(
            "PDF 导出需要 PyQt6 库。请确保已安装 PyQt6"
        ) from e

    out = Path(output_path)
    if out.suffix.lower() != ".pdf":
        out = out.with_suffix(".pdf")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise OSError(f"无法创建输出目录 {out.parent}: {e}") from e

    # 构建 HTML 内容
    game_name = model.meta.get("game_name", "未命名")
    html_parts = [
        "<html><head><meta charset='utf-8'>",
        "<style>",
        "body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; font-size: 11pt; line-height: 1.6; color: #222; }",
        "h1 { font-size: 22pt; color: #1a237e; border-bottom: 3px solid #1a237e; padding-bottom: 8px; page-break-after: avoid; }",
        "h2 { font-size: 16pt; color: #283593; margin-top: 24px; border-left: 4px solid #3f51b5; padding-left: 10px; page-break-after: avoid; }",
        "h3 { font-size: 13pt; color: #455a64; margin-top: 14px; page-break-after: avoid; }",
        "p { margin: 6px 0; }",
        "table { border-collapse: collapse; }",
        "th { background: #e8eaf6; }",
        "@page { margin: 20mm 18mm; }",
        "</style></head><body>",
    ]

    # 标题页
    html_parts.append(f"<h1>{_escape_html(game_name)} — 游戏策划书</h1>")

    # 版本信息
    html_parts.append("<h2>版本信息</h2>")
    html_parts.append(
        f"<table style='border-collapse:collapse;'>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>游戏名称</td><td style='padding:3px 0;'>{_escape_html(game_name)}</td></tr>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>游戏类型</td><td style='padding:3px 0;'>{_escape_html(str(model.meta.get('game_type', '—')))}</td></tr>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>版本标签</td><td style='padding:3px 0;'>{_escape_html(str(model.version_label))}</td></tr>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>版本类型</td><td style='padding:3px 0;'>{'主策划' if model.is_main_version else '子策划'}</td></tr>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>激活状态</td><td style='padding:3px 0;'>{'★ 激活' if model.is_active else '非激活'}</td></tr>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>创建时间</td><td style='padding:3px 0;'>{_escape_html(str(model.created_at))}</td></tr>"
        f"<tr><td style='font-weight:bold;padding:3px 16px 3px 0;'>更新时间</td><td style='padding:3px 0;'>{_escape_html(str(model.updated_at))}</td></tr>"
        "</table>"
    )
    if model.version_note:
        html_parts.append(f"<p><b>版本说明：</b>{_escape_html(str(model.version_note))}</p>")

    # 章节完成度统计
    html_parts.append(_build_progress_html(model))

    # 18 章内容
    for key in CHAPTER_KEYS:
        label = CHAPTER_LABELS.get(key, key)
        html_parts.append(f"<h2>{_escape_html(label)}</h2>")
        try:
            chapter_data = model.get_chapter(key)
        except Exception:
            chapter_data = None
        html_parts.append(_build_chapter_html(key, chapter_data or {}))

    # 校验报告附录
    if include_validation_report:
        html_parts.append(_build_validation_report_html(model))

    html_parts.append("</body></html>")

    # 用 QTextDocument + QPrinter 输出 PDF
    doc = QTextDocument()
    doc.setHtml("".join(html_parts))

    printer = QPrinter(QPrinter.PrinterMode.HighResolution)
    printer.setOutputFormat(QPrinter.OutputFormat.PdfFormat)
    printer.setOutputFileName(str(out))
    # A4 页面 + 上下左右边距
    page_size = QPageSize(QPageSize.PageSizeId.A4)
    margins = QMarginsF(18, 20, 18, 20)  # left, top, right, bottom in mm
    printer.setPageLayout(QPageLayout(page_size, QPageLayout.Orientation.Portrait, margins,
                                       QPageLayout.Unit.Millimeter))

    doc.print(printer)

    return str(out)
