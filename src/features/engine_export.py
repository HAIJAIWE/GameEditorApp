"""游戏引擎导出功能模块"""
import json

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QDialog, QHBoxLayout, QMessageBox, QPushButton, QTextEdit, QVBoxLayout


def export_to_unity(main_window) -> None:
    """导出为Unity格式"""
    from ui.dialogs import GameEngineExportDialog
    dialog = GameEngineExportDialog(main_window, 'unity', main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def export_to_unreal(main_window) -> None:
    from ui.dialogs import GameEngineExportDialog
    dialog = GameEngineExportDialog(main_window, 'unreal', main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def export_to_godot(main_window) -> None:
    from ui.dialogs import GameEngineExportDialog
    dialog = GameEngineExportDialog(main_window, 'godot', main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def export_to_cocos2d(main_window) -> None:
    from ui.dialogs import GameEngineExportDialog
    dialog = GameEngineExportDialog(main_window, 'cocos2d', main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_game_data_preview(main_window) -> None:
    """显示游戏数据预览 — 以 JSON 树形展示当前数据"""
    data = getattr(main_window, 'data_manager', None)
    if not data:
        QMessageBox.warning(main_window, "提示", "数据管理器不可用")
        return
    raw = getattr(data, 'data', None)
    if not raw:
        QMessageBox.information(main_window, "提示", "当前没有可预览的数据")
        return

    dialog = QDialog(main_window)
    dialog.setWindowTitle("游戏数据预览")
    dialog.setMinimumSize(600, 500)
    layout = QVBoxLayout(dialog)

    preview = QTextEdit()
    preview.setReadOnly(True)
    preview.setFont(QFont("Cascadia Code, Consolas", 9))
    try:
        text = json.dumps(raw, ensure_ascii=False, indent=2, default=str)
        preview.setPlainText(text[:50000])
        if len(text) > 50000:
            preview.append(f"\n\n...(数据过长，仅显示前 50000 字符，共 {len(text)} 字符)")
    except Exception as ex:
        preview.setPlainText(f"序列化失败: {ex}")

    layout.addWidget(preview)

    btn = QPushButton("关闭")
    btn.clicked.connect(dialog.accept)
    row = QHBoxLayout()
    row.addStretch()
    row.addWidget(btn)
    layout.addLayout(row)

    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()
