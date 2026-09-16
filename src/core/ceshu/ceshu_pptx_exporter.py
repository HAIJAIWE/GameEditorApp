"""N3: PPT 导出器 — 把策划书转成 PowerPoint 演示文稿

特性:
- 18 章一键转为 PPT，每章一张幻灯片
- 含封面、目录、章节内容、附录（校验报告）
- 使用 python-pptx 库（项目已安装）
- 16:9 宽屏布局，专业深色主题
- 字段值自动格式化（列表/字典展开）
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

from .ceshu_export_common import classify_systems
from .ceshu_export_common import format_field_value as _format_field_value
from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, CeshuModel

# === pptx 可选依赖（测试环境可能未安装，提供占位以允许模块加载） ===
# TYPE_CHECKING 分支仅供类型检查使用：占位定义与真实导入同名，若被 mypy 同时分析
# 会报 assignment/no-redef 冲突（且结果随环境是否安装 python-pptx 而变）。
if TYPE_CHECKING:
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    _PPTX_AVAILABLE: bool
else:
    try:
        from pptx.dml.color import RGBColor
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.enum.text import PP_ALIGN
        from pptx.util import Inches, Pt
    except ImportError:  # pragma: no cover - 测试环境无 pptx 时走此分支
        _PPTX_AVAILABLE = False

        class RGBColor:
            """占位 RGBColor，仅用于模块加载阶段的常量定义。"""

            def __init__(self, r: int, g: int, b: int) -> None:
                self.r, self.g, self.b = r, g, b

        class _DummyAlign:
            LEFT = "LEFT"
            CENTER = "CENTER"
            RIGHT = "RIGHT"

        PP_ALIGN = _DummyAlign()  # 占位实例，替代 PP_ALIGN 枚举

        class MSO_SHAPE:
            RECTANGLE = "RECTANGLE"

        def Inches(value: Any) -> Any:
            return value

        def Pt(value: Any) -> Any:
            return value
    else:
        _PPTX_AVAILABLE = True


class PptxTheme:
    """PPT 深色主题颜色。"""

    BG_DARK = RGBColor(0x1A, 0x1A, 0x2E)        # 深色背景
    BG_LIGHT = RGBColor(0x25, 0x25, 0x3D)       # 次级背景
    ACCENT = RGBColor(0x4F, 0x8C, 0xF7)         # 主题色
    TEXT_PRIMARY = RGBColor(0xFF, 0xFF, 0xFF)   # 主文字
    TEXT_SECONDARY = RGBColor(0xCC, 0xCC, 0xCC) # 次文字
    TEXT_HINT = RGBColor(0x88, 0x88, 0x88)      # 提示文字
    SUCCESS = RGBColor(0x22, 0xC5, 0x5E)
    WARNING = RGBColor(0xF5, 0x9E, 0x0B)
    DANGER = RGBColor(0xEF, 0x44, 0x44)


class PptxFont:
    """字号常量（Pt）。"""

    TITLE_HERO = 44
    TITLE_SLIDE = 32
    CHAPTER = 28
    SUBTITLE = 20
    BODY = 14
    FIELD_NAME = 13
    FIELD_VALUE = 12
    LIST_ITEM = 11


# === 渲染上限常量 ===
MAX_SLIDE_CHARS = 800
MAX_VALIDATION_ERRORS_DISPLAY = 25
MAX_SYSTEM_CONFIG_FIELDS = 5
MAX_DISABLED_SYSTEMS_DISPLAY = 10


def _truncate_for_slide(text: str, max_chars: int = MAX_SLIDE_CHARS) -> str:
    """截断文本，避免单张幻灯片内容溢出。

    Args:
        text: 原始文本。
        max_chars: 单张幻灯片允许的最大字符数。

    Returns:
        截断后的文本；超出时尾部追加提示。
    """
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n...(内容已截断，完整内容请查看 docx/pdf)"


def _add_bg(slide: Any, color: RGBColor) -> None:
    """设置幻灯片背景色。

    Args:
        slide: pptx Slide 对象。
        color: 背景色 RGBColor。
    """
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _add_text_box(slide: Any, left: Any, top: Any, width: Any, height: Any,
                  text: str, font_size: int = PptxFont.BODY,
                  color: Optional[RGBColor] = None, bold: bool = False,
                  alignment: Any = PP_ALIGN.LEFT) -> Any:
    """添加文本框并设置字体属性。

    Args:
        slide: 目标幻灯片。
        left, top, width, height: 文本框位置与尺寸（EMU 或 Inches）。
        text: 文本内容。
        font_size: 字号（Pt）。
        color: 字体颜色；为 None 时使用主文字色。
        bold: 是否加粗。
        alignment: 段落对齐方式（PP_ALIGN）。

    Returns:
        创建的 textbox shape。
    """
    if color is None:
        color = PptxTheme.TEXT_PRIMARY
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.alignment = alignment
    return txBox


def _new_slide(prs: Any, layout: Any, bg_color: RGBColor) -> Any:
    """创建一张带背景色的空白幻灯片。

    Args:
        prs: Presentation 对象。
        layout: 幻灯片布局。
        bg_color: 背景色。

    Returns:
        新建的 Slide 对象。
    """
    slide = prs.slides.add_slide(layout)
    _add_bg(slide, bg_color)
    return slide


def _init_presentation(output_path: str) -> tuple[Any, Any, Path]:
    """初始化演示文稿，设置 16:9 尺寸与输出路径。

    Args:
        output_path: 用户指定的输出路径；非 .pptx 后缀会被自动修正。

    Returns:
        (prs, blank_layout, out) 三元组：Presentation 对象、空白布局、最终路径。
    """
    from pptx import Presentation  # 延迟导入，错误信息更明确

    out = Path(output_path)
    if out.suffix.lower() != ".pptx":
        out = out.with_suffix(".pptx")
    out.parent.mkdir(parents=True, exist_ok=True)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]  # 空白布局
    return prs, blank_layout, out


def _add_cover_slide(prs: Any, layout: Any, model: CeshuModel,
                     now: datetime) -> None:
    """添加封面幻灯片：装饰条 + 主标题 + 副标题 + 元信息。"""
    slide = _new_slide(prs, layout, PptxTheme.BG_DARK)

    # 顶部装饰条
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0), prs.slide_width, Inches(0.15))
    shape.fill.solid()
    shape.fill.fore_color.rgb = PptxTheme.ACCENT
    shape.line.fill.background()

    game_name = model.meta.get("game_name", "未命名策划书")
    _add_text_box(slide, Inches(1), Inches(2.5), Inches(11.3), Inches(1.5),
                  game_name, font_size=PptxFont.TITLE_HERO,
                  color=PptxTheme.TEXT_PRIMARY, bold=True,
                  alignment=PP_ALIGN.CENTER)
    _add_text_box(slide, Inches(1), Inches(4.0), Inches(11.3), Inches(0.6),
                  "游戏设计文档 (GDD) — 工业级 18 章结构",
                  font_size=PptxFont.SUBTITLE,
                  color=PptxTheme.TEXT_SECONDARY,
                  alignment=PP_ALIGN.CENTER)

    meta_text = (f"游戏类型: {model.meta.get('game_type', '—')}    "
                 f"版本: {model.version_label}    "
                 f"日期: {now.strftime('%Y-%m-%d')}")
    _add_text_box(slide, Inches(1), Inches(5.0), Inches(11.3), Inches(0.5),
                  meta_text, font_size=PptxFont.BODY,
                  color=PptxTheme.TEXT_HINT, alignment=PP_ALIGN.CENTER)


def _add_toc_slide(prs: Any, layout: Any) -> None:
    """添加目录幻灯片（两列展示 18 章标题）。"""
    slide = _new_slide(prs, layout, PptxTheme.BG_DARK)
    _add_text_box(slide, Inches(0.5), Inches(0.3), Inches(12), Inches(0.8),
                  "目录", font_size=PptxFont.TITLE_SLIDE,
                  color=PptxTheme.ACCENT, bold=True)

    toc_items = [f"{i+1}. {CHAPTER_LABELS.get(key, key)}"
                 for i, key in enumerate(CHAPTER_KEYS)]
    col1 = "\n".join(toc_items[:9])
    col2 = "\n".join(toc_items[9:])
    _add_text_box(slide, Inches(0.8), Inches(1.4), Inches(5.8), Inches(5.5),
                  col1, font_size=16, color=PptxTheme.TEXT_PRIMARY)
    _add_text_box(slide, Inches(7.0), Inches(1.4), Inches(5.8), Inches(5.5),
                  col2, font_size=16, color=PptxTheme.TEXT_PRIMARY)


def _add_progress_slide(prs: Any, layout: Any, model: CeshuModel) -> None:
    """添加章节完成度统计幻灯片（含进度条与总进度）。"""
    slide = _new_slide(prs, layout, PptxTheme.BG_DARK)
    _add_text_box(slide, Inches(0.5), Inches(0.3), Inches(12), Inches(0.8),
                  "章节完成度统计", font_size=PptxFont.TITLE_SLIDE,
                  color=PptxTheme.ACCENT, bold=True)

    progress = model.chapter_progress() if hasattr(model, 'chapter_progress') else {}
    progress_lines = []
    for key in CHAPTER_KEYS:
        label = CHAPTER_LABELS.get(key, key)
        pct = progress.get(key, 0)
        pct_val = int(pct * 100) if isinstance(pct, (int, float)) else 0
        bar = "█" * (pct_val // 5) + "░" * (20 - pct_val // 5)
        progress_lines.append(f"{label[:8]:<10} {bar} {pct_val}%")
    total = progress.get("total", 0)
    total_val = int(total * 100) if isinstance(total, (int, float)) else 0
    progress_lines.append("")
    progress_lines.append(f"总进度: {total_val}%")

    _add_text_box(slide, Inches(0.8), Inches(1.4), Inches(11.5), Inches(5.5),
                  "\n".join(progress_lines), font_size=PptxFont.FIELD_VALUE,
                  color=PptxTheme.TEXT_PRIMARY)


def _add_chapter_slide(prs: Any, layout: Any, key: str,
                       data: dict) -> None:
    """添加单章节内容幻灯片：左侧装饰条 + 标题 + 多段落正文。"""
    slide = _new_slide(prs, layout, PptxTheme.BG_DARK)

    # 左侧装饰条
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0), Inches(0.15), prs.slide_height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = PptxTheme.ACCENT
    shape.line.fill.background()

    title = CHAPTER_LABELS.get(key, key)
    _add_text_box(slide, Inches(0.5), Inches(0.3), Inches(12), Inches(0.8),
                  title, font_size=PptxFont.CHAPTER,
                  color=PptxTheme.ACCENT, bold=True)

    content_text = _render_chapter_content_for_pptx(key, data)
    content_text = _truncate_for_slide(content_text, max_chars=MAX_SLIDE_CHARS)

    txBox = slide.shapes.add_textbox(
        Inches(0.5), Inches(1.3), Inches(12.3), Inches(5.8))
    tf = txBox.text_frame
    tf.word_wrap = True

    # 多段落渲染：字段名加粗，列表项/缩进行用次文字色
    lines = content_text.split("\n") if content_text else ["(本章暂无内容)"]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = line
        if line and not line.startswith(" ") and not line.startswith("•") and ":" in line:
            p.font.bold = True
            p.font.color.rgb = PptxTheme.TEXT_PRIMARY
            p.font.size = Pt(PptxFont.FIELD_NAME)
        elif line.startswith("•") or line.startswith("  "):
            p.font.color.rgb = PptxTheme.TEXT_SECONDARY
            p.font.size = Pt(PptxFont.LIST_ITEM)
        else:
            p.font.color.rgb = PptxTheme.TEXT_PRIMARY
            p.font.size = Pt(PptxFont.FIELD_VALUE)


def _add_validation_slide(prs: Any, layout: Any,
                          model: CeshuModel) -> None:
    """添加校验报告附录幻灯片：通过则显示成功提示，否则列出错误清单。"""
    slide = _new_slide(prs, layout, PptxTheme.BG_DARK)
    _add_text_box(slide, Inches(0.5), Inches(0.3), Inches(12), Inches(0.8),
                  "附录：数据校验报告", font_size=PptxFont.CHAPTER,
                  color=PptxTheme.ACCENT, bold=True)

    errors = model.validate() if hasattr(model, 'validate') else []
    if not errors:
        _add_text_box(slide, Inches(0.5), Inches(1.4), Inches(12), Inches(1),
                      "✓ 所有校验通过，未发现错误。",
                      font_size=18, color=PptxTheme.SUCCESS)
        return

    err_lines = [f"共发现 {len(errors)} 个问题：", ""]
    for i, err in enumerate(errors, 1):
        err_lines.append(f"{i}. {err}")
        if len(err_lines) > MAX_VALIDATION_ERRORS_DISPLAY:
            err_lines.append(f"...(共 {len(errors)} 个问题，已截断)")
            break
    _add_text_box(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(5.5),
                  "\n".join(err_lines), font_size=PptxFont.LIST_ITEM,
                  color=PptxTheme.WARNING)


def _add_end_slide(prs: Any, layout: Any, now: datetime) -> None:
    """添加结尾幻灯片：居中 END 标题与生成时间戳。"""
    slide = _new_slide(prs, layout, PptxTheme.BG_DARK)
    _add_text_box(slide, Inches(1), Inches(2.8), Inches(11.3), Inches(1),
                  "— END —", font_size=36, color=PptxTheme.ACCENT, bold=True,
                  alignment=PP_ALIGN.CENTER)
    _add_text_box(slide, Inches(1), Inches(4.0), Inches(11.3), Inches(0.6),
                  f"Generated by GameEditorApp v5.0 at "
                  f"{now.strftime('%Y-%m-%d %H:%M:%S')}",
                  font_size=PptxFont.FIELD_VALUE,
                  color=PptxTheme.TEXT_HINT, alignment=PP_ALIGN.CENTER)


def _write_core_properties(prs: Any, model: CeshuModel,
                           now: datetime) -> None:
    """写入文档元信息（标题/作者/时间戳等）。

    Args:
        prs: Presentation 对象。
        model: CeshuModel 实例，从中读取 game_name / author。
        now: 统一使用的时间戳，避免一张 PPT 内时间不一致。
    """
    cp = prs.core_properties
    cp.title = model.meta.get("game_name", "未命名策划书")
    cp.subject = "游戏设计文档 (GDD)"
    cp.author = model.meta.get("author", "GameEditorApp")
    cp.comments = (f"Generated by GameEditorApp v5.0 at "
                   f"{now.strftime('%Y-%m-%d %H:%M:%S')}")
    cp.created = now
    cp.modified = now


def export_ceshu_to_pptx(model: CeshuModel, output_path: str,
                          include_validation_report: bool = True) -> str:
    """N3: 导出策划书为 PowerPoint 演示文稿。

    Args:
        model: CeshuModel 实例。
        output_path: 输出路径（自动补 .pptx 后缀）。
        include_validation_report: 是否在末尾附加校验报告。

    Returns:
        实际输出的文件路径。

    Side effects:
        会创建/覆盖 output_path 指向的 .pptx 文件。

    Raises:
        ImportError: python-pptx 未安装时
        OSError: 输出路径不可写或磁盘空间不足
    """
    if not _PPTX_AVAILABLE:
        raise ImportError(
            "PowerPoint 导出需要 python-pptx 库。请运行：pip install python-pptx"
        )

    now = datetime.now()
    prs, blank_layout, out = _init_presentation(output_path)

    _add_cover_slide(prs, blank_layout, model, now)
    _add_toc_slide(prs, blank_layout)
    _add_progress_slide(prs, blank_layout, model)
    for key in CHAPTER_KEYS:
        _add_chapter_slide(prs, blank_layout, key, model.get_chapter(key))
    if include_validation_report:
        _add_validation_slide(prs, blank_layout, model)
    _add_end_slide(prs, blank_layout, now)

    _write_core_properties(prs, model, now)
    try:
        prs.save(str(out))
    except PermissionError as e:
        raise PermissionError(
            f"无法写入文件 {out}：文件可能被其他程序占用，请关闭后重试"
        ) from e
    except OSError as e:
        raise OSError(f"保存 PowerPoint 文档失败: {e}") from e
    return str(out)


def _render_chapter_content_for_pptx(chapter_key: str, data: dict) -> str:
    """渲染章节内容为 PPTX 友好的多行文本。

    Args:
        chapter_key: 章节键（如 "systems" / "vision" 等）。
        data: 章节原始数据，可为 None 或非 dict（视为空）。

    Returns:
        多行字符串；空章节返回占位文本。
    """
    if chapter_key == "systems":
        # 游戏系统章节特殊处理：复用公用分类逻辑
        enabled, disabled = classify_systems(data)

        lines: list[str] = []
        if enabled:
            lines.append("已启用的游戏系统:")
            for sys_id, sys_data in enabled:
                sys_name = sys_data.get("name", sys_id)
                lines.append(f"  • {sys_name} ({sys_id})")
                cfg = sys_data.get("config", {}) or {}
                if cfg:
                    for fname, fval in list(cfg.items())[:MAX_SYSTEM_CONFIG_FIELDS]:
                        lines.append(f"    - {fname}: {_format_field_value(fval, bullet='• ')}")

        if disabled:
            if lines:
                lines.append("")
            lines.append("未启用的游戏系统:")
            for sys_id, sys_data in disabled[:MAX_DISABLED_SYSTEMS_DISPLAY]:
                sys_name = sys_data.get("name", sys_id)
                lines.append(f"  • {sys_name} ({sys_id})")

        if not enabled and not disabled:
            lines.append("(未配置任何游戏系统)")
        return "\n".join(lines)

    # 普通章节
    if not isinstance(data, dict) or not data:
        return "(本章暂无内容)"

    required = CHAPTER_REQUIRED_FIELDS.get(chapter_key, [])
    optional_keys = [k for k in data.keys() if k not in required]
    ordered_keys = required + optional_keys

    lines = []
    for fname in ordered_keys:
        if fname not in data:
            continue
        fval = data[fname]
        lines.append(f"{fname}:")
        formatted = _format_field_value(fval, bullet="• ")
        if "\n" in formatted:
            for line in formatted.split("\n"):
                if line.strip():
                    lines.append(f"  {line}")
        else:
            lines.append(f"  {formatted}")
        lines.append("")
    return "\n".join(lines).strip()
