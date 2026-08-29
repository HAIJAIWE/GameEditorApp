"""N12: HTML 导出器 — 把策划书导出为交互式独立 HTML 文档

特性:
- 左侧固定目录导航（18 章锚点跳转）
- 右侧内容区（章节标题 + 字段表格）
- 深色/浅色主题切换（JS + localStorage）
- 响应式布局（移动端目录折叠）
- 多行文本用 <pre> 包裹（代码高亮）
- systems 章节用样式化表格
- 顶部显示游戏名/版本/类型/进度条
- 末尾附校验报告
- 所有用户内容用 html.escape 转义防止 XSS
- 纯 Python 字符串拼接，不依赖 Jinja2
"""
from __future__ import annotations

from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any

from .ceshu_export_common import classify_systems, format_field_value
from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, CeshuModel

# === 常量 ===
HTML_BULLET = "• "


def _esc(value: Any) -> str:
    """转义 HTML 特殊字符，防止 XSS。"""
    if value is None:
        return ""
    return escape(str(value))


def _render_css() -> str:
    """生成内联 CSS 样式表。"""
    return """
:root {
  --bg: #ffffff; --fg: #1a1a1a; --muted: #666666; --accent: #4f8cf7;
  --border: #e5e7eb; --card-bg: #f9fafb; --code-bg: #f3f4f6;
  --table-head-bg: #f3f4f6; --success: #22c55e; --warning: #f59e0b; --danger: #ef4444;
}
[data-theme="dark"] {
  --bg: #1a1a2e; --fg: #e5e5e5; --muted: #a0a0a0; --accent: #4f8cf7;
  --border: #2d2d44; --card-bg: #25253d; --code-bg: #1e1e32;
  --table-head-bg: #2d2d44; --success: #22c55e; --warning: #f59e0b; --danger: #ef4444;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
  "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
.layout { display: flex; min-height: 100vh; }
.toc { width: 280px; position: fixed; top: 0; left: 0; bottom: 0;
  background: var(--card-bg); border-right: 1px solid var(--border);
  padding: 20px; overflow-y: auto; z-index: 100; }
.toc h2 { font-size: 16px; color: var(--accent); margin: 0 0 12px 0; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 2px 0; }
.toc a { color: var(--fg); text-decoration: none; font-size: 13px;
  display: block; padding: 6px 8px; border-radius: 4px; transition: background 0.2s; }
.toc a:hover { background: var(--accent); color: white; }
.content { margin-left: 280px; padding: 40px; flex: 1; max-width: 960px; }
.header-card { background: var(--card-bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 24px; margin-bottom: 32px; }
.header-card h1 { margin: 0 0 12px 0; color: var(--accent); font-size: 28px; }
.header-meta { color: var(--muted); font-size: 14px; margin: 4px 0; }
.progress-bar { background: var(--border); border-radius: 4px; height: 8px;
  margin-top: 12px; overflow: hidden; }
.progress-fill { background: var(--accent); height: 100%; border-radius: 4px; }
.chapter { margin-bottom: 40px; scroll-margin-top: 20px; }
.chapter h2 { color: var(--accent); border-bottom: 2px solid var(--accent);
  padding-bottom: 8px; margin-top: 0; }
.chapter h3 { color: var(--accent); margin-top: 24px; }
.chapter h4 { color: var(--fg); margin: 16px 0 8px 0; }
.field-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.field-table th, .field-table td { border: 1px solid var(--border);
  padding: 8px 12px; text-align: left; vertical-align: top; font-size: 14px; }
.field-table th { background: var(--table-head-bg); width: 30%; font-weight: 600; }
.field-value { white-space: pre-wrap; word-break: break-word; }
.field-value pre { background: var(--code-bg); padding: 8px; border-radius: 4px;
  overflow-x: auto; margin: 0; font-size: 13px; white-space: pre-wrap; }
.system-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.system-table th, .system-table td { border: 1px solid var(--border);
  padding: 8px 12px; font-size: 14px; }
.system-table th { background: var(--accent); color: white; }
.status-enabled { color: var(--success); font-weight: 600; }
.status-disabled { color: var(--muted); }
.theme-toggle { position: fixed; top: 16px; right: 16px; z-index: 200;
  background: var(--accent); color: white; border: none; border-radius: 20px;
  padding: 8px 16px; cursor: pointer; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.menu-toggle { display: none; position: fixed; top: 16px; left: 16px; z-index: 200;
  background: var(--accent); color: white; border: none; border-radius: 4px;
  padding: 8px 12px; cursor: pointer; }
.validation-report { background: var(--card-bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 20px; margin-top: 40px; }
.validation-report h2 { color: var(--warning); }
.error-item { background: var(--code-bg); padding: 8px 12px; margin: 6px 0;
  border-radius: 4px; border-left: 3px solid var(--danger); font-size: 14px; }
.success-msg { color: var(--success); font-weight: 600; }
@media (max-width: 768px) {
  .toc { transform: translateX(-100%); transition: transform 0.3s; }
  .toc.open { transform: translateX(0); }
  .content { margin-left: 0; padding: 60px 16px 20px; }
  .menu-toggle { display: block; }
}
"""


def _render_js() -> str:
    """生成内联 JavaScript（主题切换 + 移动端目录折叠）。"""
    return """
function toggleTheme() {
  var body = document.body;
  var current = body.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  body.setAttribute('data-theme', next);
  try { localStorage.setItem('ceshu-theme', next); } catch(e) {}
}
function toggleMenu() {
  var toc = document.querySelector('.toc');
  if (toc) toc.classList.toggle('open');
}
(function() {
  try {
    var saved = localStorage.getItem('ceshu-theme');
    if (saved) document.body.setAttribute('data-theme', saved);
  } catch(e) {}
})();
"""


def _render_field_value_html(value: Any) -> str:
    """渲染字段值为 HTML（多行文本用 <pre> 包裹）。"""
    formatted = format_field_value(value, bullet=HTML_BULLET)
    if "\n" in formatted:
        return f'<pre class="field-value">{_esc(formatted)}</pre>'
    return f'<span class="field-value">{_esc(formatted)}</span>'


def _render_systems_html(data: dict | None) -> str:
    """渲染 systems 章节为样式化表格 + 配置详情。"""
    enabled, disabled = classify_systems(data)
    rows: list[str] = []
    for sys_id, sys_data in enabled:
        name = _esc(sys_data.get("name", sys_id))
        data_type = _esc(sys_data.get("data_type", sys_id))
        rows.append(
            f'<tr><td>{_esc(sys_id)}</td>'
            f'<td><span class="status-enabled">✅ 启用</span></td>'
            f'<td>{data_type}</td><td>{name}</td></tr>'
        )
    for sys_id, sys_data in disabled:
        name = _esc(sys_data.get("name", sys_id))
        data_type = _esc(sys_data.get("data_type", sys_id))
        rows.append(
            f'<tr><td>{_esc(sys_id)}</td>'
            f'<td><span class="status-disabled">⬜ 未启用</span></td>'
            f'<td>{data_type}</td><td>{name}</td></tr>'
        )
    if not rows:
        rows.append('<tr><td colspan="4">(未配置任何游戏系统)</td></tr>')
    body = "\n".join(rows)
    html = (
        '<table class="system-table">'
        '<thead><tr><th>系统</th><th>状态</th><th>数据类型</th><th>名称</th></tr></thead>'
        f'<tbody>{body}</tbody></table>'
    )
    if enabled:
        html += '<h3>已启用系统配置详情</h3>'
        for sys_id, sys_data in enabled:
            name = _esc(sys_data.get("name", sys_id))
            html += f'<h4>{name} ({_esc(sys_id)})</h4>'
            cfg = sys_data.get("config", {}) or {}
            if cfg:
                html += '<table class="field-table"><tbody>'
                for fname, fval in cfg.items():
                    html += (
                        f'<tr><th>{_esc(fname)}</th>'
                        f'<td>{_render_field_value_html(fval)}</td></tr>'
                    )
                html += '</tbody></table>'
            else:
                html += '<p>(无配置)</p>'
    return html


def _render_chapter_html(chapter_key: str, data: dict, index: int) -> str:
    """渲染单个章节为 HTML section。"""
    title = CHAPTER_LABELS.get(chapter_key, chapter_key)
    html = f'<section class="chapter" id="ch{index}">'
    html += f'<h2>{index}. {_esc(title)}</h2>'
    if chapter_key == "systems":
        html += _render_systems_html(data)
        html += '</section>'
        return html
    if not isinstance(data, dict) or not data:
        html += '<p>(本章暂无内容)</p>'
        html += '</section>'
        return html

    required = CHAPTER_REQUIRED_FIELDS.get(chapter_key, [])
    optional_keys = [k for k in data.keys() if k not in required]
    ordered_keys = required + optional_keys
    html += '<table class="field-table"><tbody>'
    for fname in ordered_keys:
        if fname not in data:
            continue
        fval = data[fname]
        html += (
            f'<tr><th>{_esc(fname)}</th>'
            f'<td>{_render_field_value_html(fval)}</td></tr>'
        )
    html += '</tbody></table>'
    html += '</section>'
    return html


def _render_validation_report_html(model: CeshuModel) -> str:
    """渲染校验报告 HTML。"""
    errors = model.validate() if hasattr(model, "validate") else []
    html = '<section class="validation-report" id="validation">'
    html += '<h2>附录：数据校验报告</h2>'
    if not errors:
        html += '<p class="success-msg">✅ 所有校验通过，未发现错误。</p>'
        html += '</section>'
        return html
    html += f'<p>共发现 {len(errors)} 个问题：</p>'
    for i, err in enumerate(errors, 1):
        html += f'<div class="error-item">{i}. {_esc(err)}</div>'
    html += '</section>'
    return html


def _render_toc_html() -> str:
    """渲染左侧固定目录导航。"""
    items: list[str] = []
    for i, key in enumerate(CHAPTER_KEYS, 1):
        title = CHAPTER_LABELS.get(key, key)
        items.append(f'<li><a href="#ch{i}">{i}. {_esc(title)}</a></li>')
    items.append('<li><a href="#validation">附录：校验报告</a></li>')
    return (
        '<nav class="toc">'
        '<h2>📑 目录</h2>'
        '<ol>' + "".join(items) + '</ol>'
        '</nav>'
    )


def _render_header_card_html(model: CeshuModel, today: str) -> str:
    """渲染顶部信息卡片（含进度条）。"""
    game_name = _esc(model.meta.get("game_name", "未命名策划书"))
    version_label = _esc(model.version_label or "v1.0")
    game_type = _esc(model.meta.get("game_type", "—") or "—")
    progress = model.chapter_progress() if hasattr(model, "chapter_progress") else {}
    total = progress.get("total", 0)
    total_val = int(total * 100) if isinstance(total, (int, float)) else 0
    return (
        '<div class="header-card">'
        f'<h1>{game_name}</h1>'
        f'<p class="header-meta">版本: {version_label} | 类型: {game_type} | 日期: {today}</p>'
        f'<p class="header-meta">总进度: {total_val}%</p>'
        f'<div class="progress-bar"><div class="progress-fill" style="width:{total_val}%"></div></div>'
        '</div>'
    )


def export_ceshu_to_html(model: CeshuModel, output_path: str,
                        include_validation_report: bool = True) -> str:
    """N12: 导出策划书为交互式 HTML 文档。

    Args:
        model: CeshuModel 实例。
        output_path: 输出路径（自动补 .html 后缀）。
        include_validation_report: 是否在末尾附加校验报告。

    Returns:
        实际输出的文件路径。

    Raises:
        OSError: 输出路径不可写或磁盘空间不足。
    """
    out = Path(output_path)
    if out.suffix.lower() != ".html":
        out = out.with_suffix(".html")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise OSError(f"无法创建输出目录 {out.parent}: {e}") from e

    today = datetime.now().strftime("%Y-%m-%d")
    game_name = _esc(model.meta.get("game_name", "未命名策划书"))
    parts = [
        '<!DOCTYPE html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        f'<title>{game_name}</title>',
        f'<style>{_render_css()}</style>',
        '</head>',
        '<body data-theme="light">',
        '<button class="theme-toggle" onclick="toggleTheme()">🌓 主题</button>',
        '<button class="menu-toggle" onclick="toggleMenu()">☰ 目录</button>',
        '<div class="layout">',
        _render_toc_html(),
        '<main class="content">',
        _render_header_card_html(model, today),
    ]
    for i, key in enumerate(CHAPTER_KEYS, 1):
        parts.append(_render_chapter_html(key, model.get_chapter(key), i))
    if include_validation_report:
        parts.append(_render_validation_report_html(model))
    parts.append('</main>')
    parts.append('</div>')
    parts.append(f'<script>{_render_js()}</script>')
    parts.append('</body>')
    parts.append('</html>')
    try:
        out.write_text("\n".join(parts), encoding="utf-8")
    except PermissionError as e:
        raise PermissionError(
            f"无法写入文件 {out}：文件可能被其他程序占用，请关闭后重试"
        ) from e
    except OSError as e:
        raise OSError(f"保存 HTML 文档失败: {e}") from e
    return str(out)
