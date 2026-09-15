"""N16: Excel 导出器 — 把策划书导出为多 Sheet Excel 工作簿

特性:
- 8 个 Sheet：概览 / 系统配置 / 数值表 / 角色 / 里程碑 / 风险 / 竞品 / 校验报告
- 标题行加粗 + 背景色
- 列宽自适应
- 数值类型自动识别（int/float）
- 日期格式化
- 冻结首行
- openpyxl 未安装时给出明确错误提示
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from .ceshu_export_common import classify_systems, format_field_value
from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS

if TYPE_CHECKING:
    from .ceshu_model import CeshuModel


# === 样式常量 ===
_HEADER_FILL_COLOR = "4472C4"      # 标题行背景色（蓝）
_HEADER_FONT_COLOR = "FFFFFF"      # 标题行字体色（白）
_SUBHEADER_FILL_COLOR = "D9E1F2"   # 二级标题背景色（浅蓝）
_DATE_FORMAT = "YYYY-MM-DD"


class OpenpyxlNotInstalledError(ImportError):
    """openpyxl 未安装时抛出的异常"""


def _require_openpyxl():
    """延迟导入 openpyxl，未安装时抛出明确错误"""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter
    except ImportError as e:
        raise OpenpyxlNotInstalledError(
            "Excel 导出需要 openpyxl 库。请运行：pip install openpyxl"
        ) from e
    return Workbook, Font, PatternFill, Alignment, Border, Side, get_column_letter


def _make_header_style(Font, PatternFill):
    """创建标题行样式"""
    return {
        "font": Font(bold=True, color=_HEADER_FONT_COLOR, size=11),
        "fill": PatternFill(start_color=_HEADER_FILL_COLOR,
                            end_color=_HEADER_FILL_COLOR, fill_type="solid"),
    }


def _write_header_row(ws, headers: list[str], row_idx: int, header_style: dict) -> None:
    """写入标题行"""
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=header)
        cell.font = header_style["font"]
        cell.fill = header_style["fill"]


def _auto_column_width(ws, headers: list[str], rows: list[list], min_width: int = 8,
                       max_width: int = 60) -> None:
    """自适应列宽"""
    for col_idx, header in enumerate(headers, 1):
        max_len = len(str(header))
        for row in rows:
            if col_idx <= len(row):
                val = row[col_idx - 1]
                if val is not None:
                    # 多行文本取第一行长度
                    val_str = str(val).split("\n")[0]
                    max_len = max(max_len, len(val_str))
        width = min(max(max_len + 2, min_width), max_width)
        from openpyxl.utils import get_column_letter
        ws.column_dimensions[get_column_letter(col_idx)].width = width


def _coerce_numeric(value: Any) -> Any:
    """尝试把字符串数值转为 int/float，失败则原样返回"""
    if not isinstance(value, str) or not value:
        return value
    try:
        if "." in value:
            return float(value)
        return int(value)
    except (ValueError, TypeError):
        return value


def _flatten_dict_row(d: dict, keys: list[str]) -> list:
    """按指定 key 顺序从 dict 取值，缺失则空字符串"""
    return [d.get(k, "") if d.get(k) is not None else "" for k in keys]


def _write_overview_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 1: 概览 — 游戏名/类型/版本/18 章完成度"""
    ws = wb.create_sheet("概览")
    headers = ["项目", "值"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    progress = model.chapter_progress()
    rows: list[list] = [
        ["游戏名称", model.meta.get("game_name", "")],
        ["游戏类型", model.meta.get("game_type", "")],
        ["版本标签", model.version_label or "v1.0"],
        ["版本号", model.version],
        ["创建时间", model.created_at],
        ["更新时间", model.updated_at],
        ["风格", getattr(model, "style", "")],
        ["模块类型", getattr(model, "module_type", "")],
        ["总完成度", _coerce_numeric(f"{progress.get('total', 0)}")],
    ]
    # 18 章完成度
    for key in CHAPTER_KEYS:
        label = CHAPTER_LABELS.get(key, key)
        rows.append([label, _coerce_numeric(f"{progress.get(key, 0)}")])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_systems_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 2: 系统配置 — 所有启用系统的配置参数表格"""
    ws = wb.create_sheet("系统配置")
    enabled, disabled = classify_systems(model.systems)
    # 收集所有配置字段名（并集）
    all_fields: list[str] = []
    seen: set[str] = set()
    for _, sys_data in enabled + disabled:
        cfg = sys_data.get("config", {}) or {}
        for fname in cfg:
            if fname not in seen:
                seen.add(fname)
                all_fields.append(fname)
    headers = ["系统Key", "系统名称", "状态"] + all_fields
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    rows: list[list] = []
    for sys_id, sys_data in enabled + disabled:
        status = "启用" if sys_data.get("enabled") else "未启用"
        cfg = sys_data.get("config", {}) or {}
        row = [sys_id, sys_data.get("name", sys_id), status]
        for fname in all_fields:
            val = cfg.get(fname, "")
            row.append(format_field_value(val))
        rows.append(row)

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_numeric_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 3: 数值表 — numeric 章节的数值参数"""
    ws = wb.create_sheet("数值表")
    headers = ["参数名", "值"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    rows: list[list] = []
    numeric = model.numeric or {}
    for k, v in numeric.items():
        if isinstance(v, (list, dict)):
            v_str = format_field_value(v)
        else:
            v_str = v
        rows.append([k, _coerce_numeric(v_str) if isinstance(v_str, str) else v_str])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_characters_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 4: 角色 — characters 章节的角色列表"""
    ws = wb.create_sheet("角色")
    headers = ["序号", "名称", "角色类型", "位置", "性格", "任务钩子"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    rows: list[list] = []
    chars = model.characters or {}
    npc_list = chars.get("npc_list", []) or []
    for idx, npc in enumerate(npc_list, 1):
        if isinstance(npc, dict):
            rows.append([
                idx,
                npc.get("name", ""),
                npc.get("role", ""),
                npc.get("location", ""),
                npc.get("personality", ""),
                npc.get("quest_hook", ""),
            ])
        else:
            rows.append([idx, str(npc), "", "", "", ""])
    # 主角与反派信息
    if chars.get("protagonist"):
        rows.append(["", "主角", "", "", "", chars.get("protagonist", "")])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_milestones_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 5: 里程碑 — mvp 章节的里程碑时间线"""
    ws = wb.create_sheet("里程碑")
    headers = ["序号", "名称", "日期", "交付物", "验收标准"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    rows: list[list] = []
    mvp = model.mvp or {}
    milestones = mvp.get("milestones", []) or []
    for idx, ms in enumerate(milestones, 1):
        if isinstance(ms, dict):
            deliverables = ms.get("deliverables", "")
            if isinstance(deliverables, list):
                deliverables = ", ".join(str(d) for d in deliverables)
            rows.append([
                idx,
                ms.get("name", ""),
                ms.get("date", ""),
                deliverables,
                ms.get("acceptance", ""),
            ])
        else:
            rows.append([idx, str(ms), "", "", ""])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_risks_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 6: 风险 — risk_handling 章节的风险矩阵"""
    ws = wb.create_sheet("风险")
    headers = ["序号", "风险", "概率", "影响", "缓解措施", "负责人"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    rows: list[list] = []
    rh = model.risk_handling or {}
    risk_matrix = rh.get("risk_matrix", []) or []
    for idx, risk in enumerate(risk_matrix, 1):
        if isinstance(risk, dict):
            rows.append([
                idx,
                risk.get("risk", ""),
                risk.get("probability", ""),
                risk.get("impact", ""),
                risk.get("mitigation", ""),
                risk.get("owner", ""),
            ])
        else:
            rows.append([idx, str(risk), "", "", "", ""])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_competitors_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 7: 竞品 — market_analysis 章节的竞品对比"""
    ws = wb.create_sheet("竞品")
    headers = ["序号", "名称", "类型", "优势", "劣势", "市场份额"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    rows: list[list] = []
    ma = model.market_analysis or {}
    competitors = ma.get("competitors", []) or []
    for idx, comp in enumerate(competitors, 1):
        if isinstance(comp, dict):
            rows.append([
                idx,
                comp.get("name", ""),
                comp.get("type", ""),
                comp.get("strengths", ""),
                comp.get("weaknesses", ""),
                comp.get("market_share", ""),
            ])
        else:
            rows.append([idx, str(comp), "", "", "", ""])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def _write_validation_sheet(wb, model: CeshuModel, header_style: dict) -> None:
    """Sheet 8: 校验报告 — validate() 结果"""
    ws = wb.create_sheet("校验报告")
    headers = ["序号", "问题描述"]
    _write_header_row(ws, headers, 1, header_style)
    ws.freeze_panes = "A2"

    errors: list = []
    try:
        errors = model.validate() if hasattr(model, "validate") else []
    except Exception as e:
        errors = [f"校验过程异常: {e}"]

    rows: list[list] = []
    if not errors:
        rows.append([1, "✅ 所有校验通过，未发现错误"])
    else:
        for idx, err in enumerate(errors, 1):
            rows.append([idx, err])

    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            ws.cell(row=row_idx, column=col_idx, value=val)
    _auto_column_width(ws, headers, rows)


def export_ceshu_to_excel(model: CeshuModel, output_path: str) -> str:
    """导出策划书到 Excel（多 Sheet 工作簿）

    Sheet 结构:
        1. 概览 — 游戏名/类型/版本/18 章完成度
        2. 系统配置 — 所有启用系统的配置参数表格
        3. 数值表 — numeric 章节的数值参数
        4. 角色 — characters 章节的角色列表
        5. 里程碑 — mvp 章节的里程碑时间线
        6. 风险 — risk_handling 章节的风险矩阵
        7. 竞品 — market_analysis 章节的竞品对比
        8. 校验报告 — validate() 结果

    Args:
        model: CeshuModel 实例
        output_path: 输出路径（自动补 .xlsx 后缀）

    Returns:
        实际输出的文件路径

    Raises:
        OpenpyxlNotInstalledError: openpyxl 未安装时
        OSError: 输出路径不可写或磁盘空间不足
    """
    Workbook, Font, PatternFill, _, _, _, _ = _require_openpyxl()

    out = Path(output_path)
    if out.suffix.lower() != ".xlsx":
        out = out.with_suffix(".xlsx")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise OSError(f"无法创建输出目录 {out.parent}: {e}") from e

    wb = Workbook()
    # 删除默认 Sheet
    default_ws = wb.active
    if default_ws is not None:
        wb.remove(default_ws)

    header_style = _make_header_style(Font, PatternFill)

    _write_overview_sheet(wb, model, header_style)
    _write_systems_sheet(wb, model, header_style)
    _write_numeric_sheet(wb, model, header_style)
    _write_characters_sheet(wb, model, header_style)
    _write_milestones_sheet(wb, model, header_style)
    _write_risks_sheet(wb, model, header_style)
    _write_competitors_sheet(wb, model, header_style)
    _write_validation_sheet(wb, model, header_style)

    try:
        wb.save(str(out))
    except PermissionError as e:
        raise PermissionError(
            f"无法写入文件 {out}：文件可能被其他程序占用，请关闭后重试"
        ) from e
    except OSError as e:
        raise OSError(f"保存 Excel 文档失败: {e}") from e
    return str(out)
