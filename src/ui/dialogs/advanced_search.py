"""高级搜索对话框"""
from typing import Any, Optional

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFormLayout,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)

from common.logger import get_logger


class AdvancedSearchDialog(QDialog):
    """高级搜索对话框"""

    def __init__(self, main_window, parent=None):
        """初始化搜索对话框

        Args:
            main_window: 主窗口实例
            parent: 父窗口
        """
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.main_window = main_window
        self.logger = get_logger()
        self.search_results: list[dict[str, Any]] = []
        self.search_data_type: Optional[str] = None
        self.setup_ui()

    def setup_ui(self):
        """设置UI"""
        self.setWindowTitle("高级搜索")
        self.setMinimumSize(600, 500)

        layout = QVBoxLayout(self)

        form_layout = QFormLayout()

        self.type_combo = QComboBox()
        self.type_combo.addItems(["技能", "角色", "怪物", "装备", "道具", "任务", "对话", "成就"])
        form_layout.addRow("搜索类型:", self.type_combo)

        self.field_combo = QComboBox()
        self.field_combo.addItems(["名称", "ID", "类型", "描述"])
        form_layout.addRow("搜索字段:", self.field_combo)

        self.keyword_edit = QLineEdit()
        self.keyword_edit.setPlaceholderText("输入搜索关键词...")
        form_layout.addRow("搜索关键词:", self.keyword_edit)

        layout.addLayout(form_layout)

        search_btn = QPushButton("搜索")
        search_btn.clicked.connect(self.perform_search)
        layout.addWidget(search_btn)

        self.result_list = QListWidget()
        self.result_list.itemDoubleClicked.connect(self.open_result)
        layout.addWidget(self.result_list)

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.accept)
        layout.addWidget(close_btn)

    def perform_search(self):
        """执行搜索"""
        keyword = self.keyword_edit.text().lower()
        if not keyword:
            QMessageBox.information(self, "提示", "请输入搜索关键词")
            return

        type_map = {
            "技能": "skills",
            "角色": "roles",
            "怪物": "monsters",
            "装备": "equips",
            "道具": "items",
            "任务": "tasks",
            "对话": "dialogs",
            "成就": "achievements"
        }

        field_map = {
            "名称": "name",
            "ID": "id",
            "类型": "type",
            "描述": "desc"
        }

        data_type = type_map.get(self.type_combo.currentText())
        field = field_map.get(self.field_combo.currentText())

        data = self.main_window.data_manager.data.get(data_type, [])
        results: list[dict[str, Any]] = []

        for item in data:
            if field in item and keyword in str(item[field]).lower():
                results.append(item)

        self.result_list.clear()

        if not results:
            self.result_list.addItem("没有找到匹配的结果")
        else:
            display_format_map = {
                "skills": lambda item: f"ID:{item.get('id', '')} | {item.get('name', '')} | {item.get('type', '')}",
                "roles": lambda item: f"ID:{item.get('id', '')} | {item.get('name', '')} | {item.get('job', '')}",
                "monsters": lambda item: f"ID:{item.get('id', '')} | {item.get('name', '')} | Lv:{item.get('level', '')}",
                "equips": lambda item: f"ID:{item.get('id', '')} | {item.get('name', '')} | {item.get('part', '')}",
                "items": lambda item: f"ID:{item.get('id', '')} | {item.get('name', '')} | {item.get('type', '')}",
            }

            for i, item in enumerate(results):
                display_func = display_format_map.get(data_type, str)
                self.result_list.addItem(display_func(item))
                list_item_widget = self.result_list.item(self.result_list.count() - 1)
                list_item_widget.setData(Qt.ItemDataRole.UserRole, i)

        self.search_results = results
        self.search_data_type = data_type
        self.logger.info(f"搜索完成: 找到 {len(results)} 条结果")

    def open_result(self, list_item):
        """打开搜索结果

        Args:
            list_item: 列表项
        """
        if not self.search_results:
            return

        index = list_item.data(Qt.ItemDataRole.UserRole)
        if index is None or index >= len(self.search_results):
            return

        self.accept()

        type_map_rev = {
            "skills": "skill",
            "roles": "role",
            "monsters": "monster",
            "equips": "equip",
            "items": "item",
            "tasks": "task",
            "dialogs": "dialog",
            "achievements": "achievement"
        }

        data_type_short = type_map_rev.get(self.search_data_type)
        if data_type_short and data_type_short in self.main_window.tabs:
            tab = self.main_window.tabs[data_type_short]
            target_id = self.search_results[index].get('id')

            if hasattr(tab, 'list_widget'):
                model = tab.list_widget.model()
                if model:
                    for i in range(model.rowCount()):
                        item_text = str(model.data(model.index(i, 0)) or '')
                        if target_id and f"ID:{target_id}" in item_text:
                            tab.list_widget.setCurrentIndex(model.index(i, 0))
                            break

            QMessageBox.information(self.main_window, "搜索结果",
                f"已找到目标: {self.search_results[index].get('name', '未知')}\n(ID: {target_id})")
