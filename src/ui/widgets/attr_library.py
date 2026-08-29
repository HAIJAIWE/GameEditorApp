"""属性库管理面板 - 动态添加/删除/编辑属性"""
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QInputDialog,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from core.attr_system import AttributeSystem, AttrType
from ui.dialogs.auto_input_dialog import show_text_input_dialog
from ui.themes import theme_color


class AttrLibraryManager(QWidget):
    """
    属性库管理面板

    功能：
    1. 显示所有属性列表
    2. 添加/删除/重命名属性
    3. 编辑属性类型和约束
    4. 实时同步到其他组件
    """

    # 信号
    attr_added = pyqtSignal(str, AttrType)      # 属性名, 类型
    attr_removed = pyqtSignal(str)              # 属性名
    attr_renamed = pyqtSignal(str, str)         # 旧名, 新名
    attr_modified = pyqtSignal(str)             # 属性名（约束修改）

    def __init__(self, attr_system: AttributeSystem, parent=None):
        super().__init__(parent)
        self.attr_system = attr_system
        self._setup_ui()
        self._refresh_list()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 顶部工具栏
        toolbar = self._create_toolbar()
        layout.addWidget(toolbar)

        # 属性列表
        self.attr_list = QListWidget()
        self.attr_list.setStyleSheet(f"""
            QListWidget {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                font-size: 13px;
            }}
            QListWidget::item {{
                padding: 6px 8px;
                border-bottom: 1px solid {theme_color('border')};
            }}
            QListWidget::item:hover {{
                background-color: {theme_color('accent_bg')};
            }}
            QListWidget::item:selected {{
                background-color: {theme_color('accent')};
                color: white;
            }}
        """)
        self.attr_list.itemDoubleClicked.connect(self._on_edit_attr)
        layout.addWidget(self.attr_list)

        # 底部详情面板
        self.detail_frame = self._create_detail_frame()
        layout.addWidget(self.detail_frame)

    def _create_toolbar(self) -> QFrame:
        """创建工具栏"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(6)

        # 搜索框
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("🔍 搜索属性...")
        self.search_box.setFixedWidth(150)
        self.search_box.setStyleSheet(f"""
            QLineEdit {{
                background: white;
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                padding: 3px 8px;
            }}
        """)
        self.search_box.textChanged.connect(self._on_search)
        # P4-15: 统一搜索防抖（150ms，与 data_tab.py 一致）
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.timeout.connect(self._do_search)
        layout.addWidget(self.search_box)

        layout.addSpacing(10)

        # 添加按钮
        add_btn = QPushButton("+ 添加")
        add_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('accent')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 14px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {theme_color('accent_hover')};
            }}
        """)
        add_btn.clicked.connect(self._on_add_attr)
        layout.addWidget(add_btn)

        # 删除按钮
        del_btn = QPushButton("- 删除")
        del_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('danger')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 14px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {theme_color('danger_hover')};
            }}
        """)
        del_btn.clicked.connect(self._on_remove_attr)
        layout.addWidget(del_btn)

        # 编辑按钮
        edit_btn = QPushButton("✏️ 编辑")
        edit_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('accent')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 14px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {theme_color('accent_hover')};
            }}
        """)
        edit_btn.clicked.connect(self._on_edit_selected)
        layout.addWidget(edit_btn)

        layout.addStretch()
        return frame

    def _create_detail_frame(self) -> QFrame:
        """创建详情编辑面板"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        layout = QFormLayout(frame)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(6)

        # 属性类型
        self.detail_type = QComboBox()
        self.detail_type.addItems(["基础属性", "派生属性", "战斗属性"])
        self.detail_type.setStyleSheet(f"""
            QComboBox {{
                background: white;
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                padding: 3px 8px;
            }}
        """)
        self.detail_type.currentIndexChanged.connect(self._on_detail_changed)
        layout.addRow("属性类型:", self.detail_type)

        # 最小值
        self.detail_min = QDoubleSpinBox()
        self.detail_min.setRange(-9999, 9999)
        self.detail_min.setDecimals(1)
        self.detail_min.setStyleSheet(f"""
            QDoubleSpinBox {{
                background: white;
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                padding: 3px 8px;
            }}
        """)
        self.detail_min.valueChanged.connect(self._on_detail_changed)
        layout.addRow("最小值:", self.detail_min)

        # 最大值
        self.detail_max = QDoubleSpinBox()
        self.detail_max.setRange(-1000000000, 1000000000)
        self.detail_max.setDecimals(1)
        self.detail_max.setValue(1000000)
        self.detail_max.setStyleSheet(f"""
            QDoubleSpinBox {{
                background: white;
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                padding: 3px 8px;
            }}
        """)
        self.detail_max.valueChanged.connect(self._on_detail_changed)
        layout.addRow("最大值:", self.detail_max)

        # 默认值
        self.detail_default = QDoubleSpinBox()
        self.detail_default.setRange(-9999, 9999)
        self.detail_default.setDecimals(1)
        self.detail_default.setStyleSheet(f"""
            QDoubleSpinBox {{
                background: white;
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                padding: 3px 8px;
            }}
        """)
        self.detail_default.valueChanged.connect(self._on_detail_changed)
        layout.addRow("默认值:", self.detail_default)

        return frame

    def _refresh_list(self, filter_text: str = ""):
        """刷新属性列表"""
        self.attr_list.clear()

        # 按类型分组
        categories = {
            "基础属性": [],
            "派生属性": [],
            "战斗属性": [],
        }

        for name, attr in self.attr_system.attributes.items():
            if filter_text and filter_text.lower() not in name.lower():
                continue
            cat = attr.category or "基础属性"
            if cat in categories:
                categories[cat].append((name, attr))

        for cat_name, attrs in categories.items():
            if not attrs:
                continue

            # 分类标题
            cat_item = QListWidgetItem(f"── {cat_name} ──")
            cat_item.setForeground(QColor(theme_color('hint')))
            cat_font = cat_item.font()
            cat_font.setBold(True)
            cat_item.setFont(cat_font)
            cat_item.setData(Qt.ItemDataRole.UserRole, "header")
            cat_item.setFlags(cat_item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            self.attr_list.addItem(cat_item)

            for name, attr in attrs:
                item = QListWidgetItem(f"  {attr.display_name} ({name})")
                item.setData(Qt.ItemDataRole.UserRole, name)
                if attr.attr_type == AttrType.COMBAT:
                    item.setForeground(QColor(theme_color('accent')))
                elif attr.attr_type == AttrType.DERIVED:
                    item.setForeground(QColor(theme_color('accent_active')))
                else:
                    item.setForeground(QColor(theme_color('fg')))
                self.attr_list.addItem(item)

    def _get_selected_attr_name(self) -> str:
        """获取当前选中的属性名"""
        item = self.attr_list.currentItem()
        if item:
            return item.data(Qt.ItemDataRole.UserRole)
        return ""

    def _on_search(self, text: str):
        """P4-15: 搜索框文本变化时启动防抖定时器"""
        self._search_timer.start(150)

    def _do_search(self):
        """P4-15: 执行搜索过滤（防抖后触发）"""
        self._refresh_list(self.search_box.text())

    def _on_add_attr(self):
        """添加新属性"""
        name, ok = show_text_input_dialog(self, "添加属性", "请输入属性名称:")
        if ok and name.strip():
            new_name = name.strip()
            if new_name in self.attr_system.attributes:
                QMessageBox.warning(self, "提示", f"属性'{new_name}'已存在")
                return

            # 选择类型
            type_dialog = QInputDialog()
            type_dialog.setWindowTitle("选择属性类型")
            type_dialog.setLabelText("请选择属性类型:")
            type_dialog.setComboBoxItems(["基础属性", "派生属性", "战斗属性"])
            type_dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            type_dialog.accepted.connect(
                lambda td=type_dialog, nm=new_name: self._on_attr_type_selected(td, nm)
            )
            type_dialog.show()

    def _on_attr_type_selected(self, type_dialog, new_name):
        type_text = type_dialog.textValue()
        attr_type_map = {
            "基础属性": AttrType.BASE,
            "派生属性": AttrType.DERIVED,
            "战斗属性": AttrType.COMBAT,
        }
        attr_type = attr_type_map.get(type_text, AttrType.BASE)
        self.attr_system.add_attribute(new_name, attr_type, display_name=new_name)
        self.attr_added.emit(new_name, attr_type)
        self._refresh_list()

    def _on_remove_attr(self):
        """删除属性"""
        name = self._get_selected_attr_name()
        if not name:
            QMessageBox.information(self, "提示", "请先选中要删除的属性")
            return

        reply = QMessageBox.question(
            self, "确认删除",
            f"确定要删除属性'{name}'吗？\n\n注意：如果有其他属性依赖它，将无法删除。"
        )
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.attr_system.remove_attribute(name)
                self.attr_removed.emit(name)
                self._refresh_list()
            except ValueError as e:
                QMessageBox.warning(self, "无法删除", str(e))

    def _on_edit_selected(self):
        """编辑选中的属性"""
        name = self._get_selected_attr_name()
        if not name:
            QMessageBox.information(self, "提示", "请先选中要编辑的属性")
            return
        self._show_edit_dialog(name)

    def _on_edit_attr(self, item: QListWidgetItem):
        """双击编辑"""
        name = item.data(Qt.ItemDataRole.UserRole)
        if name and name != "header":
            self._show_edit_dialog(name)

    def _show_edit_dialog(self, name: str):
        """显示编辑对话框"""
        attr = self.attr_system.attributes.get(name)
        if not attr:
            return

        # 重命名
        new_name, ok = show_text_input_dialog(self, "重命名属性", "新名称:", default_text=name)
        if ok and new_name.strip() and new_name.strip() != name:
            try:
                self.attr_system.rename_attribute(name, new_name.strip())
                self.attr_renamed.emit(name, new_name.strip())
                self._refresh_list()
            except ValueError as e:
                QMessageBox.warning(self, "重命名失败", str(e))

    def _on_detail_changed(self):
        """详情修改"""
        name = self._get_selected_attr_name()
        if not name:
            return

        attr = self.attr_system.attributes.get(name)
        if not attr:
            return

        # 更新类型
        type_map = {0: AttrType.BASE, 1: AttrType.DERIVED, 2: AttrType.COMBAT}
        attr.attr_type = type_map.get(self.detail_type.currentIndex(), AttrType.BASE)

        # 更新约束
        attr.min_value = self.detail_min.value()
        attr.max_value = self.detail_max.value() if self.detail_max.value() < 99999999 else None
        attr.default_value = self.detail_default.value()

        self.attr_modified.emit(name)

    def select_attr(self, name: str):
        """选中指定属性"""
        for i in range(self.attr_list.count()):
            item = self.attr_list.item(i)
            if item.data(Qt.ItemDataRole.UserRole) == name:
                self.attr_list.setCurrentItem(item)
                break

    def load_detail(self, name: str):
        """加载属性详情到编辑面板"""
        attr = self.attr_system.attributes.get(name)
        if not attr:
            return

        type_map = {AttrType.BASE: 0, AttrType.DERIVED: 1, AttrType.COMBAT: 2}
        self.detail_type.blockSignals(True)
        self.detail_type.setCurrentIndex(type_map.get(attr.attr_type, 0))
        self.detail_type.blockSignals(False)

        self.detail_min.blockSignals(True)
        self.detail_min.setValue(attr.min_value or 0)
        self.detail_min.blockSignals(False)

        self.detail_max.blockSignals(True)
        self.detail_max.setValue(attr.max_value or 1000000)
        self.detail_max.blockSignals(False)

        self.detail_default.blockSignals(True)
        self.detail_default.setValue(attr.default_value)
        self.detail_default.blockSignals(False)
