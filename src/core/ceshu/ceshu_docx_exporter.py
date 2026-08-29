"""策划书 docx 导出器 — 工业级 GDD 18 章结构 → Word 文档

特性:
- 18 章完整结构映射到 Word 标题样式 (Heading 1/2/3)
- 章节内容自动识别字段类型（文本/列表/字典）并格式化
- 含目录、版本信息、章节进度统计
- 支持中文友好字体（默认 SimSun 正文 / SimHei 标题）
- 章节间一致性检查报告附录
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, CeshuModel

# --- 字段类型识别与格式化 ---

def _format_field_value(value, indent: int = 0) -> str:
    """将字段值格式化为人类可读文本"""
    if value is None:
        return "—"
    if isinstance(value, str):
        return value if value.strip() else "—"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bool):
        return "是" if value else "否"
    if isinstance(value, list):
        if not value:
            return "—"
        lines = []
        prefix = "  " * indent + "- "
        for item in value:
            if isinstance(item, dict):
                # 字典项：展开为 "key: value" 形式
                parts = [f"{k}: {v}" for k, v in item.items() if v not in (None, "", [], {})]
                if parts:
                    lines.append(prefix + " | ".join(parts))
                else:
                    lines.append(prefix + "(空)")
            elif isinstance(item, str):
                lines.append(prefix + item)
            else:
                lines.append(prefix + str(item))
        return "\n".join(lines)
    if isinstance(value, dict):
        if not value:
            return "—"
        lines = []
        prefix = "  " * indent
        for k, v in value.items():
            if isinstance(v, (dict, list)):
                inner = _format_field_value(v, indent + 1)
                lines.append(f"{prefix}{k}:")
                lines.append(f"{prefix}  {inner}")
            else:
                lines.append(f"{prefix}{k}: {_format_field_value(v, indent)}")
        return "\n".join(lines)
    return str(value)


# --- 章节内容渲染 ---

def _render_chapter_content(doc, chapter_key: str, data: dict) -> None:
    """渲染单个章节的内容到 Word 文档"""

    if chapter_key == "systems":
        # 游戏系统章节特殊处理
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
            doc.add_heading("已启用的游戏系统", level=2)
            for sys_id, sys_data in enabled:
                sys_name = sys_data.get("name", sys_id)
                doc.add_heading(f"{sys_name} ({sys_id})", level=3)
                cfg = sys_data.get("config", {}) or {}
                if cfg:
                    for fname, fval in cfg.items():
                        p = doc.add_paragraph()
                        run_label = p.add_run(f"{fname}: ")
                        run_label.bold = True
                        p.add_run(_format_field_value(fval))
                else:
                    doc.add_paragraph("(无配置)")

        if disabled:
            doc.add_heading("未启用的游戏系统", level=2)
            for sys_id, sys_data in disabled:
                sys_name = sys_data.get("name", sys_id)
                p = doc.add_paragraph(f"{sys_name} ({sys_id}) — 未启用")

        if not enabled and not disabled:
            doc.add_paragraph("(未配置任何游戏系统)")
        return

    # 普通章节：按字段顺序渲染
    if not isinstance(data, dict) or not data:
        doc.add_paragraph("(本章暂无内容)")
        return

    # 必填字段优先
    required = CHAPTER_REQUIRED_FIELDS.get(chapter_key, [])
    optional_keys = [k for k in data.keys() if k not in required]
    ordered_keys = required + optional_keys

    for fname in ordered_keys:
        if fname not in data:
            continue
        fval = data[fname]
        # 字段标题作为 Heading 3
        doc.add_heading(fname, level=3)
        # 字段值
        formatted = _format_field_value(fval)
        if "\n" in formatted:
            for line in formatted.split("\n"):
                if line.strip():
                    doc.add_paragraph(line)
        else:
            doc.add_paragraph(formatted)


# --- 主导出函数 ---

def export_ceshu_to_docx(model: CeshuModel, output_path: str,
                         include_validation_report: bool = True) -> str:
    """导出策划书为工业级 Word 文档

    Args:
        model: CeshuModel 实例
        output_path: 输出路径（自动补 .docx 后缀）
        include_validation_report: 是否在文末附加校验报告

    Returns:
        实际输出的文件路径

    Raises:
        ImportError: python-docx 未安装时
        OSError: 输出路径不可写或磁盘空间不足
    """
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.shared import Pt, RGBColor
    except ImportError as e:
        raise ImportError(
            "Word 文档导出需要 python-docx 库。请运行：pip install python-docx"
        ) from e

    out = Path(output_path)
    if out.suffix.lower() != ".docx":
        out = out.with_suffix(".docx")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise OSError(f"无法创建输出目录 {out.parent}: {e}") from e

    doc = Document()

    # --- 全局样式：中文字体 ---
    style = doc.styles["Normal"]
    style.font.name = "SimSun"
    style.font.size = Pt(11)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "SimSun")

    # 标题样式字体
    for hs in ["Heading 1", "Heading 2", "Heading 3"]:
        try:
            s = doc.styles[hs]
            s.font.name = "SimHei"
            s.element.rPr.rFonts.set(qn("w:eastAsia"), "SimHei")
        except Exception:
            pass

    # --- 封面 ---
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_para.add_run(model.meta.get("game_name", "未命名策划书"))
    title_run.bold = True
    title_run.font.size = Pt(28)
    title_run.font.name = "SimHei"
    title_run.element.rPr.rFonts.set(qn("w:eastAsia"), "SimHei")

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = subtitle.add_run("游戏设计文档 (GDD) — 工业级 18 章结构")
    sub_run.font.size = Pt(14)
    sub_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    doc.add_paragraph()  # 空行

    # --- 版本信息 ---
    doc.add_heading("版本信息", level=1)
    info_table = doc.add_table(rows=0, cols=2)
    info_table.style = "Light Grid Accent 1"
    info_rows = [
        ("策划书 ID", model.ceshu_id),
        ("版本号", model.version),
        ("版本标签", model.version_label),
        ("版本类型", "主策划" if model.is_main_version else "子策划"),
        ("激活状态", "★ 激活" if model.is_active else "非激活"),
        ("父版本 ID", model.parent_id or "（无）"),
        ("版本说明", model.version_note or "—"),
        ("风格 (style)", model.style or "—"),
        ("模块类型 (module_type)", model.module_type or "—"),
        ("创建时间", model.created_at),
        ("更新时间", model.updated_at),
    ]
    for k, v in info_rows:
        row = info_table.add_row().cells
        row[0].text = k
        row[1].text = str(v)
        # 第一列加粗
        for p in row[0].paragraphs:
            for r in p.runs:
                r.bold = True

    doc.add_page_break()

    # --- 目录提示 ---
    doc.add_heading("目录", level=1)
    doc.add_paragraph("（在 Word 中按 Ctrl+Click 可点击跳转；或在 Word 中选择「引用 → 目录 → 自动目录」自动生成）")
    for key in CHAPTER_KEYS:
        title = CHAPTER_LABELS.get(key, key)
        doc.add_paragraph(title, style="List Number")
    doc.add_page_break()

    # --- 章节进度统计 ---
    doc.add_heading("章节完成度统计", level=1)
    progress = model.chapter_progress()
    progress_table = doc.add_table(rows=0, cols=3)
    progress_table.style = "Light Grid Accent 1"
    # 表头
    hdr = progress_table.add_row().cells
    hdr[0].text = "章节"
    hdr[1].text = "完成度"
    hdr[2].text = "状态"
    for p in hdr[0].paragraphs + hdr[1].paragraphs + hdr[2].paragraphs:
        for r in p.runs:
            r.bold = True
    for key in CHAPTER_KEYS:
        title = CHAPTER_LABELS.get(key, key)
        pct = progress.get(key, 0)
        # 转百分比
        pct_val = int(pct * 100) if isinstance(pct, (int, float)) else 0
        status = "✓ 完成" if pct_val >= 100 else ("◐ 进行中" if pct_val > 0 else "○ 未开始")
        row = progress_table.add_row().cells
        row[0].text = title
        row[1].text = f"{pct_val}%"
        row[2].text = status
    # 总进度
    total = progress.get("total", 0)
    total_val = int(total * 100) if isinstance(total, (int, float)) else 0
    row = progress_table.add_row().cells
    row[0].text = "总进度"
    row[1].text = f"{total_val}%"
    row[2].text = "—"
    for p in row[0].paragraphs + row[1].paragraphs + row[2].paragraphs:
        for r in p.runs:
            r.bold = True

    doc.add_page_break()

    # --- 18 章正文 ---
    for key in CHAPTER_KEYS:
        title = CHAPTER_LABELS.get(key, key)
        doc.add_heading(title, level=1)
        data = model.get_chapter(key)
        _render_chapter_content(doc, key, data)
        doc.add_paragraph()  # 章末空行

    # --- 校验报告附录 ---
    if include_validation_report:
        doc.add_page_break()
        doc.add_heading("附录：数据校验报告", level=1)
        errors = model.validate()
        if not errors:
            doc.add_paragraph("✓ 所有校验通过，未发现错误。")
        else:
            doc.add_paragraph(f"共发现 {len(errors)} 个问题：")
            for i, err in enumerate(errors, 1):
                doc.add_paragraph(f"{i}. {err}", style="List Number")

    # --- 文档元信息 ---
    cp = doc.core_properties
    cp.title = model.meta.get("game_name", "未命名策划书")
    cp.subject = "游戏设计文档 (GDD)"
    cp.author = model.meta.get("author", "GameEditorApp")
    cp.comments = f"Generated by GameEditorApp v5.0 at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    cp.created = datetime.now()
    cp.modified = datetime.now()

    try:
        doc.save(str(out))
    except PermissionError as e:
        raise PermissionError(
            f"无法写入文件 {out}：文件可能被其他程序占用，请关闭后重试"
        ) from e
    except OSError as e:
        raise OSError(f"保存 Word 文档失败: {e}") from e
    return str(out)
