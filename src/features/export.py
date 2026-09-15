"""数据导出/导入功能模块

包含 JSON / CSV / Excel 三种格式的导出与导入，以及批量导入、批量导出、批量编辑入口。
所有公开函数均接受 ``main_window`` 参数，由 ``ui/menus.py`` 以 ``lambda mw: xxx(mw)`` 方式调用，
签名（``def xxx(main_window) -> None``）不可更改，否则菜单将失效。
"""
import csv
import json
from pathlib import Path
from typing import Any

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import DATA_TYPE_NAMES, DATA_TYPE_PLURALS
from config.settings import get_config

logger = get_logger()


# ---------------------------------------------------------------------------
# 模块级常量（消除散落的魔法值）
# ---------------------------------------------------------------------------

# Excel 工作表标签 <-> 数据类型（复数键）的唯一映射来源。
# 新增数据类型时只需在此处加一行，导入/导出通过下方反向推导自动保持同步。
EXCEL_TYPE_LABELS: dict[str, str] = {
    'skills': '技能', 'roles': '角色', 'monsters': '怪物',
    'equips': '装备', 'items': '道具', 'talents': '天赋',
    'achievements': '成就', 'titles': '称号', 'buffs': 'Buff',
}
# 反向映射：中文工作表名 -> 数据类型（复数键），由 EXCEL_TYPE_LABELS 推导，避免两处硬编码不同步。
EXCEL_SHEET_TYPE_MAP: dict[str, str] = {label: key for key, label in EXCEL_TYPE_LABELS.items()}

# Excel 样式常量（集中管理，避免魔法色值散落各处）
EXCEL_HEADER_FILL = '4472C4'
EXCEL_BORDER_COLOR = 'D9D9D9'
EXCEL_ALT_ROW_FILL = 'F2F2F2'
EXCEL_MAX_CELL_LEN = 40          # 自动列宽时单元格内容截断长度
EXCEL_COLUMN_WIDTH_PAD = 4       # 列宽额外留白
EXCEL_VALUE_SPIN_RANGE = (-999999, 999999)  # 批量改数值 SpinBox 取值范围


# ---------------------------------------------------------------------------
# 内部辅助函数
# ---------------------------------------------------------------------------

def _theme_color(token: str) -> str:
    """延迟导入 theme_color，避免 features.export ↔ ui.menus 循环导入"""
    from ui.themes import theme_color
    return theme_color(token)


def _export_dir_path() -> Path:
    """返回导出/导入对话框的默认目录（来自全局配置）。"""
    return Path(get_config().export_dir)


def _finalize_import(main_window) -> None:
    """导入完成后统一重建索引与计数器、失效缓存并刷新 UI。

    所有导入路径（JSON / CSV / Excel / 批量）都走这里，确保不同格式导入后
    数据管理器处于一致状态——修复了此前 CSV / Excel 导入漏调
    ``_rebuild_index_and_counters`` / ``_invalidate_cache`` 导致的索引脱节问题。
    """
    dm = main_window.data_manager
    dm._rebuild_index_and_counters()
    for key in dm.data:
        dm._invalidate_cache(key)
    main_window._refresh_all_tabs()


def _export_data_as_json(main_window, dialog_title: str, success_title: str, success_text: str) -> None:
    """弹出保存对话框并将当前数据以 JSON 写出（export_json / batch_export 共用）。"""
    file_path, _ = QFileDialog.getSaveFileName(
        main_window, dialog_title, str(_export_dir_path()),
        "JSON文件 (*.json);;所有文件 (*.*)"
    )
    if not file_path:
        return

    try:
        from common.common import atomic_write_json
        atomic_write_json(file_path, main_window.data_manager.data,
                          ensure_ascii=False, indent=2)
        QMessageBox.information(main_window, success_title, success_text)
        logger.info(f"成功导出JSON文件: {file_path}")
    except Exception as e:
        logger.error(f"导出JSON失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", "导出失败，请查看日志了解详情。")


def _parse_cell_value(value: Any) -> Any:
    """若单元格文本是 JSON 数组/对象（以 [ 或 { 开头），尝试解析为 Python 对象；否则原样返回。"""
    if isinstance(value, str) and value[:1] in ('[', '{'):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            logger.debug(f"单元格 JSON 解析失败，保留原值: {value[:50]}")
    return value


def _serialize_cell(value: Any) -> Any:
    """将列表/字典等复杂类型序列化为 JSON 字符串，便于写入单元格。"""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


# ---------------------------------------------------------------------------
# 公开函数：JSON
# ---------------------------------------------------------------------------

def export_json(main_window) -> None:
    """导出为 JSON 文件"""
    _export_data_as_json(main_window, "导出JSON", "成功", "JSON文件已导出")


def import_json(main_window) -> None:
    """导入 JSON 文件（按数据类型键合并到现有数据）"""
    file_path, _ = QFileDialog.getOpenFileName(
        main_window, "导入JSON", str(_export_dir_path()),
        "JSON文件 (*.json);;所有文件 (*.*)"
    )
    if not file_path:
        return

    try:
        with open(file_path, encoding='utf-8') as f:
            imported_data = json.load(f)

        # 批量扩展数据，然后一次性重建索引与计数器（避免逐条 add_item 的开销）
        dm = main_window.data_manager
        for key in dm.data:
            if key in imported_data and isinstance(imported_data[key], list):
                dm.data[key].extend(imported_data[key])

        _finalize_import(main_window)
        QMessageBox.information(main_window, "成功", "JSON文件已导入")
        logger.info(f"成功导入JSON文件: {file_path}")
    except json.JSONDecodeError as e:
        logger.error(f"JSON格式错误: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", "文件格式不正确")
    except Exception as e:
        logger.error(f"导入JSON失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", f"导入失败: {e}")


# ---------------------------------------------------------------------------
# 公开函数：批量导入 / 批量导出
# ---------------------------------------------------------------------------

def batch_import(main_window) -> None:
    """批量导入 JSON 数据（为每条数据重新生成 ID 后追加）"""
    file_path, _ = QFileDialog.getOpenFileName(
        main_window, "批量导入", str(_export_dir_path()),
        "JSON文件 (*.json);;所有文件 (*.*)"
    )
    if not file_path:
        return

    try:
        with open(file_path, encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, dict):
            QMessageBox.warning(main_window, "错误", "文件格式不正确")
            return

        dm = main_window.data_manager
        imported_count = 0
        for key in data:
            if key in dm.data:
                for item in data[key]:
                    item['id'] = dm.generate_id(key)
                    dm.data[key].append(item)
                    imported_count += 1

        if imported_count > 0:
            _finalize_import(main_window)
            QMessageBox.information(main_window, "成功", f"成功导入 {imported_count} 条数据")
            logger.info(f"批量导入成功: {imported_count} 条数据")
        else:
            QMessageBox.information(main_window, "提示", "没有数据被导入")

    except Exception as e:
        logger.error(f"批量导入失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", f"批量导入失败: {e}")


def batch_export(main_window) -> None:
    """批量导出全部数据为 JSON 文件"""
    _export_data_as_json(main_window, "批量导出", "成功", "批量导出成功")


# ---------------------------------------------------------------------------
# 公开函数：CSV
# ---------------------------------------------------------------------------

def export_csv(main_window) -> None:
    """将每种数据类型导出为独立的 CSV 文件（按数据类型分文件）"""
    directory = QFileDialog.getExistingDirectory(
        main_window, "选择导出目录", str(_export_dir_path())
    )
    if not directory:
        return

    try:
        data = main_window.data_manager.data
        export_dir = Path(directory)
        exported_files = []

        for data_type, items in data.items():
            if not items:
                continue

            file_path = export_dir / f"{data_type}.csv"
            with open(file_path, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=items[0].keys())
                writer.writeheader()
                for item in items:
                    writer.writerow(item)

            exported_files.append(str(file_path))

        if exported_files:
            QMessageBox.information(
                main_window, "成功",
                f"成功导出 {len(exported_files)} 个CSV文件到{directory}"
            )
            logger.info(f"成功导出CSV文件: {exported_files}")
        else:
            QMessageBox.information(main_window, "提示", "没有数据可导出")

    except Exception as e:
        logger.error(f"导出CSV失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", f"导出失败: {e}")


def import_csv(main_window) -> None:
    """从 CSV 文件导入（文件名作为数据类型）"""
    file_path, _ = QFileDialog.getOpenFileName(
        main_window, "导入CSV", str(_export_dir_path()),
        "CSV文件 (*.csv);;所有文件 (*.*)"
    )
    if not file_path:
        return

    try:
        data_type = Path(file_path).stem
        dm = main_window.data_manager

        with open(file_path, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            imported_count = 0
            for row in reader:
                row['id'] = dm.generate_id(data_type)
                dm.data[data_type].append(row)
                imported_count += 1

        if imported_count > 0:
            # 此前 CSV 导入仅调 update_id_counters，漏掉索引重建与缓存失效；
            # 改用 _finalize_import 与其他导入路径保持一致。
            _finalize_import(main_window)
            QMessageBox.information(main_window, "成功", f"成功导入 {imported_count} 条数据")
            logger.info(f"成功导入CSV文件: {file_path}, 数据数: {imported_count}")
        else:
            QMessageBox.information(main_window, "提示", "没有数据被导入")

    except Exception as e:
        logger.error(f"导入CSV失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", f"导入失败: {e}")


# ---------------------------------------------------------------------------
# 公开函数：Excel
# ---------------------------------------------------------------------------

def export_excel(main_window) -> None:
    """将所有数据类型导出为带样式的 Excel 工作簿（每种类型一个工作表）"""
    config = get_config()

    try:
        import openpyxl
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    except ImportError:
        QMessageBox.warning(main_window, "缺少依赖", "请先安装 openpyxl: pip install openpyxl")
        return

    export_dir = QFileDialog.getExistingDirectory(main_window, "选择导出目录", str(config.export_dir))
    if not export_dir:
        return

    try:
        data = main_window.data_manager.data
        if not data:
            QMessageBox.information(main_window, "提示", "没有数据可导出")
            return

        export_path = Path(export_dir)
        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        header_font = Font(name='Microsoft YaHei', bold=True, color='FFFFFF', size=11)
        header_fill = PatternFill(start_color=EXCEL_HEADER_FILL, end_color=EXCEL_HEADER_FILL, fill_type='solid')
        header_align = Alignment(horizontal='center', vertical='center')
        cell_align = Alignment(horizontal='left', vertical='center', wrap_text=True)
        thin_border = Border(
            left=Side(style='thin', color=EXCEL_BORDER_COLOR),
            right=Side(style='thin', color=EXCEL_BORDER_COLOR),
            top=Side(style='thin', color=EXCEL_BORDER_COLOR),
            bottom=Side(style='thin', color=EXCEL_BORDER_COLOR)
        )
        alt_fill = PatternFill(start_color=EXCEL_ALT_ROW_FILL, end_color=EXCEL_ALT_ROW_FILL, fill_type='solid')

        for data_type, items in data.items():
            if not items:
                continue

            sheet_name = EXCEL_TYPE_LABELS.get(data_type, data_type)
            ws = wb.create_sheet(title=sheet_name)

            headers = list(items[0].keys())
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_align
                cell.border = thin_border

            for row_idx, item in enumerate(items, 2):
                for col_idx, key in enumerate(headers, 1):
                    cell = ws.cell(row=row_idx, column=col_idx, value=_serialize_cell(item.get(key, '')))
                    cell.alignment = cell_align
                    cell.border = thin_border
                    if row_idx % 2 == 0:
                        cell.fill = alt_fill

            for col_idx, header in enumerate(headers, 1):
                max_len = len(str(header))
                for row in ws.iter_rows(min_row=2, min_col=col_idx, max_col=col_idx, values_only=True):
                    cell_val = str(row[0]) if row[0] else ''
                    max_len = max(max_len, min(len(cell_val), EXCEL_MAX_CELL_LEN))
                ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = max_len + EXCEL_COLUMN_WIDTH_PAD

            ws.auto_filter.ref = ws.dimensions
            ws.freeze_panes = 'A2'

        file_path = export_path / "game_data.xlsx"
        wb.save(str(file_path))

        total = sum(len(v) for v in data.values() if isinstance(v, list))
        QMessageBox.information(
            main_window, "导出成功",
            f"已导出到:\n{file_path}\n\n共 {total} 条数据"
        )
        logger.info(f"成功导出Excel文件: {file_path}")

    except Exception as e:
        logger.error(f"导出Excel失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", f"导出失败: {e}")


def import_excel(main_window) -> None:
    """从 Excel 工作簿导入（工作表名映射到数据类型）"""
    config = get_config()

    try:
        import openpyxl
    except ImportError:
        QMessageBox.warning(main_window, "缺少依赖", "请先安装 openpyxl: pip install openpyxl")
        return

    file_path, _ = QFileDialog.getOpenFileName(
        main_window, "导入Excel", str(config.export_dir),
        "Excel文件 (*.xlsx);;所有文件 (*.*)"
    )
    if not file_path:
        return

    try:
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        dm = main_window.data_manager

        total_imported = 0
        imported_sheets = []

        for ws in wb.worksheets:
            data_type = EXCEL_SHEET_TYPE_MAP.get(ws.title, ws.title.lower())

            rows = list(ws.iter_rows(values_only=True))
            if len(rows) < 2:
                continue

            headers = [str(h) if h else '' for h in rows[0]]
            imported_count = 0

            for row in rows[1:]:
                if not any(row):
                    continue

                item = {header: _parse_cell_value(row[col_idx])
                        for col_idx, header in enumerate(headers)
                        if col_idx < len(row) and header}

                if 'id' not in item or not item['id']:
                    item['id'] = dm.generate_id(data_type)

                if data_type in dm.data:
                    dm.data[data_type].append(item)
                    imported_count += 1

            if imported_count > 0:
                total_imported += imported_count
                imported_sheets.append(f"{ws.title}: {imported_count}条")

        wb.close()

        if total_imported > 0:
            # 与其他导入路径保持一致：重建索引 + 失效缓存 + 刷新
            _finalize_import(main_window)
            detail = '\n'.join(imported_sheets)
            QMessageBox.information(
                main_window, "导入成功",
                f"共导入 {total_imported} 条数据:\n\n{detail}"
            )
            logger.info(f"成功导入Excel文件: {file_path}, 数据数: {total_imported}")
        else:
            QMessageBox.information(main_window, "提示", "没有数据被导入")

    except Exception as e:
        logger.error(f"导入Excel失败: {e}", exc_info=True)
        QMessageBox.warning(main_window, "错误", f"导入失败: {e}")


# ---------------------------------------------------------------------------
# 公开函数：批量编辑
# ---------------------------------------------------------------------------

def batch_edit(main_window) -> None:
    """批量编辑数据对话框（修改数值 / 添加标签 / 删除 / 修改名称）"""
    # 批量编辑对话框
    dialog = QDialog(main_window)
    dialog.setWindowTitle("批量编辑数据")
    dialog.resize(800, 600)

    layout = QVBoxLayout(dialog)

    # 选择数据类型
    type_layout = QHBoxLayout()
    type_layout.addWidget(QLabel("数据类型:"))
    type_combo = QComboBox()
    for data_type, display_name in DATA_TYPE_NAMES.items():
        type_combo.addItem(display_name, data_type)
    type_layout.addWidget(type_combo)
    layout.addLayout(type_layout)

    # 批量操作选项
    op_layout = QHBoxLayout()
    op_layout.addWidget(QLabel("操作类型:"))
    op_combo = QComboBox()
    op_combo.addItems(["批量修改数值", "批量添加标签", "批量删除", "批量修改名称"])
    op_layout.addWidget(op_combo)
    layout.addLayout(op_layout)

    # 列表显示当前数据
    list_label = QLabel("选择要编辑的数据项 (按住Ctrl多选):")
    layout.addWidget(list_label)

    item_list = QListWidget()
    item_list.setSelectionMode(QListWidget.SelectionMode.MultiSelection)
    layout.addWidget(item_list)

    # 更新列表回调
    def update_item_list():
        data_type = type_combo.currentData()
        if not data_type:
            return

        plural_type = DATA_TYPE_PLURALS.get(data_type, data_type + 's')
        data = main_window.data_manager.data.get(plural_type, [])

        item_list.clear()
        for idx, item in enumerate(data):
            name = item.get('name', f'未命名{idx + 1}')
            list_item = QListWidgetItem(f"{idx + 1}. {name}")
            list_item.setData(Qt.ItemDataRole.UserRole, item)
            item_list.addItem(list_item)

    type_combo.currentIndexChanged.connect(update_item_list)
    update_item_list()

    # 操作选项（根据选择显示）
    settings_widget = QWidget()
    settings_layout = QVBoxLayout(settings_widget)
    settings_layout.setContentsMargins(0, 0, 0, 0)
    layout.addWidget(settings_widget)

    # 动态生成的操作控件引用（避免按布局位置取控件这种脆弱写法）
    op_widgets: dict[str, QWidget] = {}

    def update_op_settings():
        # 清空现有设置
        for i in range(settings_layout.count()):
            widget = settings_layout.itemAt(i).widget()
            if widget:
                widget.deleteLater()
        op_widgets.clear()

        op_type = op_combo.currentText()

        if op_type == "批量修改数值":
            field_label = QLabel("要修改的字段:")
            field_combo = QComboBox()
            field_combo.addItems(["value", "hp", "mp", "atk", "def"])
            op_widgets['field'] = field_combo

            value_label = QLabel("修改方式:")
            value_mode_combo = QComboBox()
            value_mode_combo.addItems(["设置为固定值", "增加", "减少", "百分比调整"])
            op_widgets['value_mode'] = value_mode_combo

            value_input = QSpinBox()
            value_input.setRange(*EXCEL_VALUE_SPIN_RANGE)
            value_input.setValue(0)
            op_widgets['value'] = value_input

            settings_layout.addWidget(field_label)
            settings_layout.addWidget(field_combo)
            settings_layout.addWidget(value_label)
            settings_layout.addWidget(value_mode_combo)
            settings_layout.addWidget(QLabel("数值:"))
            settings_layout.addWidget(value_input)

        elif op_type == "批量添加标签":
            tag_label = QLabel("要添加的标签 (逗号分隔):")
            tag_input = QLineEdit()
            tag_input.setPlaceholderText("标签1,标签2,标签3")
            op_widgets['tag'] = tag_input

            settings_layout.addWidget(tag_label)
            settings_layout.addWidget(tag_input)

        elif op_type == "批量修改名称":
            prefix_label = QLabel("名称前缀:")
            prefix_input = QLineEdit()
            op_widgets['prefix'] = prefix_input

            suffix_label = QLabel("名称后缀:")
            suffix_input = QLineEdit()
            op_widgets['suffix'] = suffix_input

            settings_layout.addWidget(prefix_label)
            settings_layout.addWidget(prefix_input)
            settings_layout.addWidget(suffix_label)
            settings_layout.addWidget(suffix_input)

    op_combo.currentIndexChanged.connect(update_op_settings)
    update_op_settings()

    # 操作按钮
    button_layout = QHBoxLayout()

    execute_btn = QPushButton("执行编辑")
    execute_btn.setStyleSheet(
        f"background-color: {_theme_color('accent')}; "
        f"color: {_theme_color('btn_text')}; "
        f"padding: 8px 24px; font-weight: bold;"
    )

    close_btn = QPushButton("关闭")

    button_layout.addStretch()
    button_layout.addWidget(execute_btn)
    button_layout.addWidget(close_btn)
    layout.addLayout(button_layout)

    def execute_edit():
        data_type = type_combo.currentData()
        op_type = op_combo.currentText()
        selected_items = item_list.selectedItems()

        if not selected_items:
            QMessageBox.warning(dialog, "提示", "请至少选择一个要编辑的数据项!")
            return

        plural_type = DATA_TYPE_PLURALS.get(data_type, data_type + 's')

        confirm = QMessageBox.question(
            dialog,
            "确认执行",
            f"确定要对 {len(selected_items)} 个数据项执行「{op_type}」操作吗?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if confirm != QMessageBox.StandardButton.Yes:
            return

        edited_count = 0
        skipped_count = 0
        try:
            for list_item in selected_items:
                item = list_item.data(Qt.ItemDataRole.UserRole)
                if not item:
                    continue

                if op_type == "批量添加标签":
                    tag_input = op_widgets.get('tag')
                    tag_text = tag_input.text() if tag_input else ''
                    if tag_text:
                        new_tags = [t.strip() for t in tag_text.split(',') if t.strip()]

                        old_tags = item.get('tags', [])
                        if isinstance(old_tags, str):
                            old_tags = [old_tags]

                        # 合并标签，去重
                        item['tags'] = list(set(old_tags + new_tags))
                        main_window.data_manager.update_item(data_type, item['id'], item)
                        edited_count += 1

                elif op_type == "批量删除":
                    main_window.data_manager.delete_item(plural_type, item['id'])
                    edited_count += 1

                elif op_type == "批量修改数值":
                    field_combo = op_widgets.get('field')
                    value_mode = op_widgets.get('value_mode')
                    value_input = op_widgets.get('value')
                    if not field_combo or not value_mode or not value_input:
                        return
                    field_name = field_combo.currentText()
                    mode = value_mode.currentText()
                    delta = value_input.value()

                    current = item.get(field_name)
                    if not isinstance(current, (int, float)):
                        # 字段缺失或非数值类型，跳过该项并在最后汇总提示
                        skipped_count += 1
                        continue
                    if mode == "设置为固定值":
                        new_value = delta
                    elif mode == "增加":
                        new_value = current + delta
                    elif mode == "减少":
                        new_value = current - delta
                    elif mode == "百分比调整":
                        new_value = current * (1 + delta / 100.0)
                    else:
                        continue
                    # 保持原字段数值类型：int 字段四舍五入取整，float 保留小数
                    if isinstance(current, int):
                        new_value = int(round(new_value))
                    else:
                        new_value = float(new_value)
                    item[field_name] = new_value
                    main_window.data_manager.update_item(data_type, item['id'], item)
                    edited_count += 1

                elif op_type == "批量修改名称":
                    prefix_input = op_widgets.get('prefix')
                    suffix_input = op_widgets.get('suffix')
                    prefix = prefix_input.text().strip() if prefix_input else ''
                    suffix = suffix_input.text().strip() if suffix_input else ''
                    old_name = item.get('name')
                    if not old_name:
                        skipped_count += 1
                        continue
                    item['name'] = f"{prefix}{old_name}{suffix}"
                    main_window.data_manager.update_item(data_type, item['id'], item)
                    edited_count += 1

            if edited_count > 0:
                main_window._refresh_all_tabs()
                main_window.mark_data_changed()
                message = f"成功编辑了 {edited_count} 个数据项!"
                if skipped_count:
                    message += f" 跳过 {skipped_count} 个无法处理的数据项。"
                QMessageBox.information(dialog, "成功", message)
                dialog.accept()
                logger.info(f"批量编辑成功: {op_type} 操作 {edited_count} 项")

        except Exception as e:
            logger.error(f"批量编辑失败: {e}", exc_info=True)
            QMessageBox.warning(dialog, "错误", f"操作失败: {e}")

    execute_btn.clicked.connect(execute_edit)
    close_btn.clicked.connect(dialog.reject)

    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()
