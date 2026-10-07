"""数据编辑标签页 - 包含列表和表单"""
import json

from PyQt6.QtCore import QSize, Qt, QTimer
from PyQt6.QtGui import QKeySequence, QShortcut
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QMenu,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QSplitter,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.i18n import get_i18n
from common.logger import get_logger
from common.lucide_icon import get_icon
from config.constants import DATA_TYPE_NAMES, DATA_TYPE_PLURALS
from config.settings import get_config
from ui.components import VirtualListWidget
from ui.themes import theme_color
from ui.widgets import DynamicFormWidget


class DataEditorTab(QWidget):
    """数据编辑标签页 - 包含列表和表单"""

    def __init__(self, data_type, data_manager, parent=None):
        """初始化标签页

        Args:
            data_type: 数据类型
            data_manager: 数据管理器
            parent: 父组件
        """
        super().__init__(parent)
        self.data_type = data_type
        self._data_type = data_type  # 供主窗口统一识别（三栏布局等）
        self.data_type_plural = DATA_TYPE_PLURALS.get(data_type, data_type + 's')
        self.data_manager = data_manager
        self.logger = get_logger()
        self.current_item = None
        self.selected_planning_doc = None  # 选中的策划文档
        self.selected_template = None  # 选中的模板信息 (仅技能类型使用)

        # 撤销/重做栈
        self._undo_stack = []
        self._redo_stack = []
        self._max_stack_size = 50
        self._pending_new_item = False
        self._pending_new_item_data = None
        self._auto_save_timer = QTimer()
        self._auto_save_timer.setSingleShot(True)
        self._auto_save_timer.setInterval(1500)
        self._auto_save_timer.timeout.connect(self._auto_save)
        self._auto_save_dirty = False

        self.setup_ui()
        self.refresh_list()
        self._show_first_or_placeholder()

    def setup_ui(self):
        """设置UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        left_panel = self._create_left_panel()
        right_panel = self._create_right_panel()

        # 左列（搜索 + 数据列表）必须有最小宽度：表单列的固有最小宽约 700px，
        # 在窄容器里（如策划书编辑器内嵌使用）若无此保护，列表会被压成几十像素的细条，
        # 既看不见数据也让空状态文案被截断
        left_panel.setMinimumWidth(200)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 2)
        splitter.setSizes([240, 720])

        layout.addWidget(splitter)

        # P4-16: 快捷键绑定
        self._setup_shortcuts()

    def _setup_shortcuts(self):
        """P4-16: 注册常用快捷键"""
        # Ctrl+N: 新建数据项（全局，组件内任意位置均可触发）
        sc_new = QShortcut(QKeySequence("Ctrl+N"), self)
        sc_new.activated.connect(self._on_new_clicked)
        # Ctrl+F: 聚焦搜索框
        sc_search = QShortcut(QKeySequence("Ctrl+F"), self)
        sc_search.activated.connect(self.search_edit.setFocus)
        # Delete: 删除当前选中项（仅在列表聚焦时触发，避免在输入框中误删）
        sc_del = QShortcut(QKeySequence("Delete"), self.list_widget)
        sc_del.setContext(Qt.ShortcutContext.WidgetShortcut)
        sc_del.activated.connect(self._on_delete_clicked)
        # F2: 重命名当前选中项（仅在列表聚焦时触发）
        sc_rename = QShortcut(QKeySequence("F2"), self.list_widget)
        sc_rename.setContext(Qt.ShortcutContext.WidgetShortcut)
        sc_rename.activated.connect(self._rename_selected)

    def _create_left_panel(self):
        """创建左侧面板

        Returns:
            面板组件
        """
        self.left_panel = QWidget()
        layout = QVBoxLayout(self.left_panel)
        layout.setContentsMargins(5, 5, 5, 5)

        search_label = QLabel(get_i18n().t("data.search") + ":")
        layout.addWidget(search_label)

        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("输入搜索关键词...")
        self.search_edit.textChanged.connect(self._on_search_changed)
        self.search_edit.setAccessibleName("数据搜索框")
        self.search_edit.setAccessibleDescription("输入关键词按名称过滤当前数据类型列表")
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.timeout.connect(self._do_search)
        layout.addWidget(self.search_edit)

        self.list_widget = VirtualListWidget()
        self.list_widget.set_display_function(self._get_item_display_text)
        self.list_widget.item_selected.connect(self._on_item_selected)
        self.list_widget.item_double_clicked.connect(self._on_item_double_clicked)
        self.list_widget.context_menu_requested.connect(self._on_context_menu)
        self.list_widget.items_reordered.connect(self._on_items_reordered)
        self.list_widget.rename_requested.connect(self._on_rename_item)
        # P4-13: 空状态提示
        self.list_widget.set_empty_text("暂无数据，点「新建」添加")
        layout.addWidget(self.list_widget)

        return self.left_panel

    def _create_right_panel(self):
        """创建右侧面板

        Returns:
            面板组件
        """
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(5, 5, 5, 5)

        self.form_widget = DynamicFormWidget(self.data_type, self.data_manager)
        self.form_widget.data_changed.connect(self._on_field_changed)
        self._connect_auto_save_signals()
        layout.addWidget(self.form_widget)

        button_layout = QHBoxLayout()

        self.new_btn = QPushButton(get_i18n().t("data.new"))
        self.new_btn.clicked.connect(self._on_new_clicked)
        self.new_btn.setAccessibleName("新建数据按钮")
        self.new_btn.setAccessibleDescription("点击创建一条新的数据项并加载到表单")
        button_layout.addWidget(self.new_btn)

        self.save_btn = QPushButton(get_i18n().t("data.save"))
        self.save_btn.clicked.connect(self._on_save_clicked)
        self.save_btn.setAccessibleName("保存数据按钮")
        self.save_btn.setAccessibleDescription("点击将当前表单内容保存到数据文件")
        button_layout.addWidget(self.save_btn)

        self.delete_btn = QPushButton(get_i18n().t("data.delete"))
        self.delete_btn.clicked.connect(self._on_delete_clicked)
        self.delete_btn.setAccessibleName("删除数据按钮")
        self.delete_btn.setAccessibleDescription("点击删除当前选中的数据项，删除前会弹出确认")
        button_layout.addWidget(self.delete_btn)

        self.copy_btn = QPushButton(get_i18n().t("data.copy"))
        self.copy_btn.clicked.connect(self._on_copy_clicked)
        button_layout.addWidget(self.copy_btn)

        # 数据类型编辑按钮（统一入口，替代旧的"字段配置"）
        self.type_edit_btn = QPushButton(" " + get_i18n().t("data.type_edit"))
        self.type_edit_btn.setIcon(get_icon("settings", "#666", 14))
        self.type_edit_btn.setIconSize(QSize(14, 14))
        self.type_edit_btn.setToolTip("编辑当前库的数据类型和字段结构")
        self.type_edit_btn.setStyleSheet("font-weight:bold;")
        self.type_edit_btn.clicked.connect(self._on_type_edit)
        button_layout.addWidget(self.type_edit_btn)

        # 添加模板/策划方案按钮
        if self.data_type == "skill":
            self.planning_btn = QPushButton(" " + get_i18n().t("data.reference_template"))
            self.planning_btn.setIcon(get_icon("clipboard", "#666", 14))
            self.planning_btn.setIconSize(QSize(14, 14))
            self.planning_btn.clicked.connect(self._on_select_template)
        else:
            self.planning_btn = QPushButton(" " + get_i18n().t("data.reference_planning"))
            self.planning_btn.setIcon(get_icon("clipboard", "#666", 14))
            self.planning_btn.setIconSize(QSize(14, 14))
            self.planning_btn.clicked.connect(self._on_select_planning)
        button_layout.addWidget(self.planning_btn)

        self.ai_btn = QPushButton(get_i18n().t("data.ai_generate"))
        self.ai_btn.clicked.connect(self._on_ai_generate)
        button_layout.addWidget(self.ai_btn)

        self.ref_btn = QPushButton(" " + get_i18n().t("data.reference"))
        self.ref_btn.setIcon(get_icon("link", "#666", 14))
        self.ref_btn.setIconSize(QSize(14, 14))
        self.ref_btn.setToolTip("查看此数据的引用关系")
        self.ref_btn.clicked.connect(self._on_show_references)

        # 低频操作（编辑类型 / 参考策划 / 关联）收进「更多」，避免一排 8 个按钮平铺
        more_btn = QPushButton(" 更多")
        more_btn.setIcon(get_icon("chevron-down", "#666", 14))
        more_btn.setIconSize(QSize(14, 14))
        more_btn.setToolTip("编辑类型 / 参考策划 / 关联")
        more_menu = QMenu(more_btn)
        self._type_edit_action = more_menu.addAction(
            get_icon("settings", "#666", 14), "编辑当前类型字段结构", self._on_type_edit)
        self._planning_action = more_menu.addAction(
            get_icon("clipboard", "#666", 14), "参考策划方案 / 模板", self.planning_btn.click)
        self._ref_action = more_menu.addAction(
            get_icon("link", "#666", 14), "查看此项的引用关系", self._on_show_references)
        more_btn.setMenu(more_menu)
        button_layout.addWidget(more_btn)

        # 这三个按钮保留对象（状态与文案仍被逻辑引用），只是不再占用按钮行
        for _btn in (self.type_edit_btn, self.planning_btn, self.ref_btn):
            _btn.hide()

        layout.addLayout(button_layout)

        return panel

    def _get_item_display_text(self, item):
        """获取项显示文本 — 从类型模式动态获取要显示的字段"""
        type_name = item.get('name', '')
        schema = self.data_manager.config.get_type_schema()
        if schema:
            type_def = schema.get_type(self.data_type)
            if type_def:
                display_parts = [f"ID:{item.get('id', '')}"]
                display_parts.append(type_name)
                for field in type_def.form_fields[1:]:
                    if field.name in ('id', 'name', 'desc', 'description', 'content',
                                      'image', 'image_desc', 'image_tags', 'template',
                                      'tags', 'condition', 'event', 'reward', 'options'):
                        continue
                    val = item.get(field.name, '')
                    if val:
                        display_parts.append(str(val))
                        if len(display_parts) >= 4:
                            break
                return ' | '.join(display_parts)
        return f"ID:{item.get('id', '')} | {type_name}"

    def _show_first_or_placeholder(self):
        """如果没有数据则显示第一个ID占位，有数据则选中第一条"""
        data = self.data_manager.data.get(self.data_type_plural, [])
        if data:
            self.list_widget.select_item_by_index(0)
        else:
            placeholder = {'id': self.data_manager.generate_id(self.data_type_plural)}
            self.current_item = placeholder
            self.form_widget.load_data(placeholder)

    def refresh_list(self):
        """刷新列表"""
        data = self.data_manager.data.get(self.data_type_plural, [])
        self.list_widget.set_data(data)

    def set_left_panel_visible(self, visible: bool):
        """三栏布局下隐藏/显示左侧列表（左栏统一接管列表显示）"""
        if hasattr(self, 'left_panel'):
            self.left_panel.setVisible(visible)

    def get_item_names(self) -> list:
        """获取所有数据项名称列表（供外部左栏显示）"""
        data = self.data_manager.data.get(self.data_type_plural, [])
        return [item.get('name', f'未命名{i+1}') for i, item in enumerate(data)]

    def get_item_count(self) -> int:
        """获取数据项数量"""
        return len(self.data_manager.data.get(self.data_type_plural, []))

    def external_select_item(self, index: int):
        """外部通过索引选择数据项（三栏布局下左栏调用）"""
        self.list_widget.select_item_by_index(index)

    def _on_search_changed(self, text):
        self._search_timer.start(150)

    def _do_search(self):
        self.list_widget.set_search_query(self.search_edit.text())
        # P4-13: 根据搜索状态更新空状态提示
        query = self.search_edit.text().strip()
        if query and self.list_widget.get_item_count() == 0:
            self.list_widget.set_empty_text(f"未找到匹配「{query}」的数据")
        else:
            self.list_widget.set_empty_text("暂无数据，点「新建」添加")

    def _on_item_selected(self, item):
        if self._pending_new_item and self.current_item:
            form_data = self.form_widget.get_data()
            has_content = any(v for k, v in form_data.items() if k != 'id' and v)
            if has_content:
                reply = QMessageBox.question(
                    self, get_i18n().t("data.unsaved_changes"),
                    "当前新建的数据尚未保存，是否放弃更改？",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                if reply == QMessageBox.StandardButton.No:
                    self.list_widget.blockSignals(True)
                    self.list_widget.clear_selection()
                    self.list_widget.blockSignals(False)
                    self.current_item = self._pending_new_item_data
                    return
            self._cleanup_pending_item()
            self.refresh_list()
        elif self.current_item and self._auto_save_dirty:
            self._auto_save()
        self.current_item = item
        self._auto_save_dirty = False
        self.form_widget.load_data(item)

    def _cleanup_pending_item(self):
        if self.current_item and self.current_item.get('id'):
            self.data_manager.delete_item(self.data_type_plural, self.current_item.get('id'))
        self._pending_new_item = False
        self._pending_new_item_data = None

    def _on_new_clicked(self):
        if not self._pending_new_item and self.current_item and self._auto_save_dirty:
            self._auto_save()
        if self._pending_new_item and self.current_item:
            form_data = self.form_widget.get_data()
            has_content = any(v for k, v in form_data.items() if k != 'id' and v)
            if has_content:
                reply = QMessageBox.question(
                    self, get_i18n().t("data.unsaved_changes"),
                    "当前新建的数据尚未保存，是否放弃并新建？",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                if reply == QMessageBox.StandardButton.No:
                    return
            self._cleanup_pending_item()

        # P5: 软约束检查 — 数量约束
        if not self._check_count_constraint():
            return  # 用户取消

        new_item = {}
        new_item['id'] = self.data_manager.generate_id(self.data_type_plural)
        self.current_item = new_item
        self._pending_new_item = True
        self._pending_new_item_data = new_item
        self.data_manager.add_item(self.data_type_plural, new_item)
        self.refresh_list()
        self._mark_main_window_changed()
        self.form_widget.load_data(new_item)

    def _check_count_constraint(self) -> bool:
        """P5: 检查数量约束 — 策划书规定了数据条目上限时，超出弹窗提醒

        Returns:
            True=允许创建, False=用户取消
        """
        try:
            # 向上找 MainWindow 获取策划书上下文
            parent = self.parentWidget()
            while parent and not hasattr(parent, 'ceshu_editor'):
                parent = parent.parentWidget()
            if not parent or not parent.ceshu_editor or not parent.ceshu_editor.model:  # type: ignore[attr-defined]  # ceshu_editor 由 MainWindow 在运行时注入
                return True  # 无策划书上下文，不约束

            model = parent.ceshu_editor.model  # type: ignore[attr-defined]  # ceshu_editor 由 MainWindow 在运行时注入
            # 找到当前 data_type 对应的游戏系统
            sys_cfg = None
            sys_key = None
            for k, v in model.systems.items():
                if isinstance(v, dict) and v.get("data_type") == self.data_type:
                    sys_cfg = v
                    sys_key = k
                    break
            if not sys_cfg:
                return True  # 策划书未配置此系统，不约束

            # 查找数量约束字段（如 race_count, skill_count 等）
            config = sys_cfg.get("config", {})
            count_limit = None
            for fname in ["count", f"{self.data_type}_count", "max_count", "total_count"]:
                if fname in config and isinstance(config[fname], (int, str)):
                    try:
                        count_limit = int(config[fname])
                        break
                    except (ValueError, TypeError):
                        continue

            if count_limit is None or count_limit <= 0:
                return True  # 无数量约束

            # 当前数据条目数
            current_count = len(self.data_manager.get_items(self.data_type_plural))
            if current_count < count_limit:
                return True  # 未超限

            # 超限 → 弹窗
            sys_name = sys_cfg.get("name", sys_key)
            from PyQt6.QtWidgets import QMessageBox
            reply = QMessageBox.question(
                self, "⚠️ 超出策划书限制",
                f"策划书「{sys_name}」规定数量上限为 {count_limit}，\n"
                f"当前已有 {current_count} 个，正在创建第 {current_count + 1} 个。\n\n"
                f"是否继续？\n"
                f"（选「Yes」继续创建，选「No」取消）",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            return reply == QMessageBox.StandardButton.Yes
        except Exception as e:
            # 约束检查失败不阻断主流程
            from common.logger import get_logger
            get_logger().debug(f"[P5] 数量约束检查失败: {e}")
            return True

    def _on_save_clicked(self):
        """保存按钮点击"""
        if not self.current_item:
            QMessageBox.warning(self, get_i18n().t("common.warning"), "请先选择或新建一个项目")
            return

        form_data = self.form_widget.get_data()
        merged = dict(self.current_item)
        merged.update(form_data)
        merged['id'] = self.current_item.get('id', form_data.get('id'))

        if self._pending_new_item:
            self._save_undo_state('add', merged['id'], merged)
        else:
            existing = self.data_manager.get_item(self.data_type_plural, merged['id'])
            if existing:
                self._save_undo_state('update', merged['id'], existing.copy())
            else:
                self._save_undo_state('add', merged['id'], merged)

        self.data_manager.update_item(self.data_type_plural, merged['id'], merged)

        self._mark_main_window_changed()
        self.current_item = merged
        self.refresh_list()
        self._pending_new_item = False
        self._pending_new_item_data = None
        self._auto_save_dirty = False
        self._show_toast("保存成功")
        self.logger.info(f"保存数据: {self.data_type}, ID: {merged['id']}")

    def _on_field_changed(self, _data=None):
        """表单字段变化 → 启动自动保存定时器"""
        if self.current_item:
            self._auto_save_dirty = True
            self._auto_save_timer.start()

    def _auto_save(self):
        if not self.current_item:
            return
        form_data = self.form_widget.get_data()
        merged = dict(self.current_item)
        merged.update(form_data)
        merged['id'] = self.current_item.get('id', form_data.get('id'))

        if not self._pending_new_item:
            existing = self.data_manager.get_item(self.data_type_plural, merged['id'])
            if existing and existing != merged:
                self._save_undo_state('update', merged['id'], existing.copy())

        self.data_manager.update_item(self.data_type_plural, merged['id'], merged)

        self.current_item = merged
        self._auto_save_dirty = False
        self.logger.debug(f"自动保存: {self.data_type}, ID: {merged['id']}")

    def _connect_auto_save_signals(self):
        if getattr(self, '_auto_save_signals_connected', False):
            return
        self._auto_save_signals_connected = True
        for name, widget in self.form_widget.widgets.items():
            if isinstance(widget, QLineEdit):
                widget.textChanged.connect(lambda _, n=name: self._on_field_changed())
            elif isinstance(widget, QComboBox):
                widget.currentTextChanged.connect(lambda _, n=name: self._on_field_changed())
            elif isinstance(widget, QSpinBox):
                widget.valueChanged.connect(lambda _, n=name: self._on_field_changed())
            elif isinstance(widget, QTextEdit):
                widget.textChanged.connect(lambda n=name: self._on_field_changed())

    def _on_delete_clicked(self):
        """删除按钮点击"""
        if not self.current_item:
            QMessageBox.warning(self, get_i18n().t("common.warning"), "请先选择一个项目")
            return

        reply = QMessageBox.question(
            self, get_i18n().t("common.confirm"), "确定要删除这个项目吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            item_id = self.current_item.get('id')
            # 保存当前状态用于撤销
            self._save_undo_state('delete', item_id, self.current_item.copy())

            if self.data_manager.delete_item(self.data_type_plural, item_id):
                self.current_item = None
                self.form_widget.clear()
                self.refresh_list()
                # 标记主窗口数据已变更
                self._mark_main_window_changed()
                self._show_toast("删除成功")
                self.logger.info(f"删除数据: {self.data_type}, ID: {item_id}")

    def _on_item_double_clicked(self, item):
        self._on_item_selected(item)

    def _on_context_menu(self, item, action):
        if action == "edit":
            self._on_item_selected(item)
        elif action == "copy":
            self.current_item = item
            self._on_copy_clicked()
        elif action == "delete":
            self.current_item = item
            self._on_delete_clicked()

    def _rename_selected(self):
        """P4-16: 快捷键 F2 触发重命名当前选中项"""
        item = self.list_widget.get_selected_item()
        if item:
            self._on_rename_item(item)

    def _on_rename_item(self, item):
        """右键菜单：重命名数据项"""
        old_name = item.get('name', '未命名')
        new_name, ok = QInputDialog.getText(
            self, get_i18n().t("data.rename"), "新名称：", text=old_name)
        if ok and new_name.strip():
            item_id = item.get('id')
            merged = dict(item)
            merged['name'] = new_name.strip()
            self.data_manager.update_item(self.data_type_plural, item_id, merged)
            self.current_item = merged
            self.refresh_list()
            self.form_widget.load_data(merged)
            self._mark_main_window_changed()

    def _on_items_reordered(self, ordered):
        items = self.data_manager.data.get(self.data_type_plural, [])
        if not items or len(ordered) != len(items):
            return
        items[:] = ordered
        self.refresh_list()
        self._mark_main_window_changed()

    def _on_copy_clicked(self):
        if not self.current_item:
            QMessageBox.warning(self, get_i18n().t("common.warning"), "请先选择一个项目")
            return

        if self._auto_save_dirty and self._pending_new_item:
            self._auto_save()

        new_item = self.current_item.copy()
        new_item['id'] = self.data_manager.generate_id(self.data_type_plural)
        self.data_manager.add_item(self.data_type_plural, new_item)
        self.current_item = new_item
        self._pending_new_item = True
        self._pending_new_item_data = new_item
        self.refresh_list()
        self._mark_main_window_changed()
        self.form_widget.load_data(new_item)

    def _on_field_config(self):
        """字段配置按钮点击 — 已统一到类型编辑器"""
        self._on_type_edit()

    def _on_type_edit(self):
        """打开类型编辑器 — 编辑当前库的数据类型和字段"""
        config = get_config()
        lm = config.library_manager
        schema = lm.prepare_active_schema()

        if not schema:
            QMessageBox.warning(self, get_i18n().t("common.info"), "当前没有活跃的库，或类型模式文件损坏")
            return

        from ui.dialogs.type_editor_dialog import TypeEditorDialog
        lib_name = lm.active_library_name or "默认"
        self.logger.debug(f"[类型编辑] 当前库：{lib_name}, 现有类型：{schema.type_ids}")

        if TypeEditorDialog.edit(schema, lib_name, self):
            self.logger.debug("[类型编辑] 用户点击保存，开始持久化...")
            try:
                schema_path = lm.get_schema_path()
                if schema_path:
                    schema.save(schema_path)
                    self.logger.debug(f"[类型编辑] 保存成功，类型数：{len(schema.types)}")
                    lm.reload_type_schema(lib_name)

                from config.constants import reload_from_type_schema
                reload_from_type_schema(
                    schema.plural_keys,
                    schema.type_names,
                    schema.type_plurals,
                    {t.id: t.color for t in schema.types}
                )
                self.logger.debug("[类型编辑] 常量已更新，发送 rebuild_needed...")

                EventBus().emit("rebuild_needed", deferred=True)
                self.logger.debug("[类型编辑] rebuild_needed 已发送")
            except Exception as e:
                import traceback
                self.logger.error(f"[类型编辑] 保存失败: {traceback.format_exc()}")
                # P4-14: 隐藏 Python traceback，使用 to_user_message 显示友好错误信息
                from common.exceptions import to_user_message
                QMessageBox.critical(
                    self, get_i18n().t("common.save_failed"),
                    to_user_message(e, "保存类型定义")
                )

    def _on_ai_generate(self):
        """AI生成按钮点击"""
        from common.logger import get_logger
        logger = get_logger()

        main_window = self.window()
        if hasattr(main_window, 'data_manager'):
            from features.ai import show_ai_generate_dialog

            # 如果选择了策划方案，先读取并传给AI（使用新的结构化格式）
            planning_context = ""
            if self.selected_planning_doc:
                doc_name = self.selected_planning_doc.get("name", "")

                # 构建结构化的策划案摘要
                parts = []
                if self.selected_planning_doc.get("game_concept", "").strip():
                    parts.append("【游戏理念】\n" + self.selected_planning_doc.get("game_concept"))
                if self.selected_planning_doc.get("worldview", "").strip():
                    parts.append("【世界观】\n" + self.selected_planning_doc.get("worldview"))
                if self.selected_planning_doc.get("gameplay", "").strip():
                    parts.append("【核心玩法】\n" + self.selected_planning_doc.get("gameplay"))
                if self.selected_planning_doc.get("systems", "").strip():
                    parts.append("【系统设计】\n" + self.selected_planning_doc.get("systems"))

                # 处理结构化数值设定（新v3格式）
                numeric = self.selected_planning_doc.get("numeric", {})
                if numeric:
                    numeric_parts = []
                    if numeric.get("level_min") and numeric.get("level_max"):
                        numeric_parts.append(f"- 等级范围：{numeric.get('level_min')} ~ {numeric.get('level_max')}")
                    if numeric.get("formula", "").strip():
                        numeric_parts.append(f"- 伤害公式：{numeric.get('formula')}")
                    if numeric.get("base_stats", "").strip():
                        numeric_parts.append(f"- 属性基线：\n{numeric.get('base_stats')}")
                    if numeric.get("other", "").strip():
                        numeric_parts.append(f"- 其他数值：\n{numeric.get('other')}")

                    if numeric_parts:
                        parts.append("【数值设定】\n" + "\n".join(numeric_parts))
                # 兼容旧格式
                elif self.selected_planning_doc.get("numerics", "").strip():
                    parts.append("【数值设定】\n" + self.selected_planning_doc.get("numerics"))

                if self.selected_planning_doc.get("story", "").strip():
                    parts.append("【剧情设定】\n" + self.selected_planning_doc.get("story"))
                if self.selected_planning_doc.get("art_style", "").strip():
                    parts.append("【美术风格】\n" + self.selected_planning_doc.get("art_style"))

                planning_summary = "\n\n".join(parts)

                planning_context = f"""【重要】请严格按照以下游戏策划案来生成数据！

策划案名称：{doc_name}

{planning_summary}

----------------

请根据上述策划案，生成完全符合策划案设定的{DATA_TYPE_NAMES.get(self.data_type, self.data_type)}数据！

要求：
1. 技能/角色/怪物等必须符合世界观和剧情设定
2. 数值严格符合策划案中给出的数值范围和公式
3. 风格符合美术风格要求
4. 所有设计紧扣核心玩法和系统设定"""

            # 调用AI生成，传入策划方案上下文或模板信息
            template_context = ""
            if self.data_type == "skill" and self.selected_template:
                tpl = self.selected_template
                detail = tpl.get("detail", {})
                from config.constants import _type_registry
                names = dict(_type_registry.names)
                names["planning"] = "通用"
                mode_name = names.get(tpl["mode"], "")

                if isinstance(detail, dict):
                    parts = [f"【重要】请严格按照以下{mode_name}模板来生成技能！"]
                    for k, v in detail.items():
                        if v and k not in ("image",):
                            parts.append(f"{k}: {v}")
                    template_context = "\n".join(parts)
                elif isinstance(detail, str) and len(detail) > 10:
                    template_context = f"【重要】请严格按照以下{mode_name}模板来生成技能！\n\n{detail}"
                else:
                    template_context = f"【重要】已选择{mode_name}模板「{tpl['name']}」，请基于此模板生成专属技能！"

            generated_data = show_ai_generate_dialog(
                main_window,
                self.data_type,
                initial_prompt=template_context or (planning_context if planning_context else "")
            )

            logger.info(f"AI生成结果: {type(generated_data)}, 内容: {str(generated_data)[:300]}")

            if generated_data:
                # 先获取现有数据的名字用于去重
                existing_names = set()
                existing_items = self.data_manager.data.get(self.data_type_plural, [])
                for item in existing_items:
                    if 'name' in item:
                        existing_names.add(item['name'].strip())

                # 检查是否是批量生成
                if 'items' in generated_data and isinstance(generated_data['items'], list):
                    # 批量导入
                    items = generated_data['items']
                    logger.info(f"批量导入 {len(items)} 条数据")
                    count = 0
                    skip_count = 0
                    first_valid_item = None

                    for item in items:
                        logger.info(f"处理数据: {item}")

                        # 1. 检查是否有名字
                        if 'name' not in item or not item['name']:
                            logger.warning("缺少name字段，跳过")
                            skip_count += 1
                            continue

                        item_name = item['name'].strip()

                        # 2. 检查名字是否重复
                        if item_name in existing_names:
                            logger.warning(f"名字[{item_name}]已存在，跳过")
                            skip_count += 1
                            continue

                        # 3. 生成ID（始终用自增，忽略AI给的）
                        item['id'] = self.data_manager.generate_id(self.data_type_plural)
                        logger.info(f"生成ID: {item['id']}")

                        # 4. 添加数据
                        self.data_manager.add_item(self.data_type_plural, item)
                        existing_names.add(item_name)
                        count += 1

                        if first_valid_item is None:
                            first_valid_item = item

                    self.refresh_list()

                    if count > 0 and first_valid_item:
                        # 加载第一个有效数据
                        self.current_item = first_valid_item
                        self.form_widget.load_data(self.current_item)

                    msg = f"成功导入 {count} 条数据！"
                    if skip_count > 0:
                        msg += f"\n跳过了 {skip_count} 条（重复或格式问题）"
                    self._show_toast(msg, 5000)
                else:
                    # 单个导入
                    logger.info("单个导入数据")

                    # 检查是否有名字
                    if 'name' not in generated_data or not generated_data['name']:
                        QMessageBox.warning(self, get_i18n().t("common.error"), "生成的数据缺少name字段！")
                        return

                    item_name = generated_data['name'].strip()

                    # 检查名字是否重复
                    if item_name in existing_names:
                        QMessageBox.warning(self, get_i18n().t("data.duplicate"), f"名字[{item_name}]已存在！")
                        return

                    generated_data['id'] = self.data_manager.generate_id(self.data_type_plural)
                    logger.info(f"生成ID: {generated_data['id']}")

                    self.data_manager.add_item(self.data_type_plural, generated_data)
                    self.refresh_list()

                    self.current_item = generated_data
                    self.form_widget.load_data(generated_data)

                    self._show_toast("AI生成内容已添加！", 4000)

    def _on_select_planning(self):
        """选择策划方案"""
        # 读取策划文档（优先v3格式）
        config = get_config()
        docs_file = config.config_dir / "planning_docs_v3.json"

        if not docs_file.exists():
            QMessageBox.information(self, get_i18n().t("common.info"), "还没有策划文档，先去第一个标签页创建吧！")
            return

        try:
            with open(docs_file, encoding='utf-8') as f:
                docs_data = json.load(f)
        except Exception as e:
            self.logger.error(f"读取策划文档失败: {e}")
            QMessageBox.warning(self, get_i18n().t("common.error"), "读取策划文档失败")
            return

        if not docs_data:
            QMessageBox.information(self, get_i18n().t("common.info"), "还没有策划文档")
            return

        # 显示选择对话框
        doc_names = [doc.get("name", "未命名") for doc in docs_data]
        doc_names.insert(0, "不参考策划方案")

        # 获取当前选择的索引
        current_index = 0
        if self.selected_planning_doc:
            for i, doc in enumerate(docs_data):
                if doc.get("name") == self.selected_planning_doc.get("name"):
                    current_index = i + 1
                    break

        doc_name, ok = QInputDialog.getItem(
            self, get_i18n().t("data.select_planning"),
            "选择要参考的策划方案：",
            doc_names, current_index, False
        )

        if ok:
            if doc_name == "不参考策划方案":
                self.selected_planning_doc = None
                self.planning_btn.setText(" " + get_i18n().t("data.reference_planning"))
                self._show_toast("已取消参考策划方案")
            else:
                # 找到选中的文档
                for doc in docs_data:
                    if doc.get("name") == doc_name:
                        self.selected_planning_doc = doc
                        self.planning_btn.setText(f"{doc_name}")

                        self._show_toast(f"已选择参考策划案：{doc_name}", 5000)
                        break

    def _on_select_template(self):
        """技能类型的模板选择（角色/怪物/装备/通用）"""
        from PyQt6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QVBoxLayout

        data = self.data_manager.data

        roles = data.get("roles", [])
        monsters = data.get("monsters", [])
        equips = data.get("equips", [])
        planning_data = data.get("planning", "")

        dialog = QDialog(self)
        dialog.setWindowTitle(get_i18n().t("data.select_reference_template"))
        dialog.setMinimumWidth(520)
        layout = QVBoxLayout(dialog)

        mode_label = QLabel(get_i18n().t("data.template_type"))
        mode_label.setStyleSheet("font-weight: bold; font-size: 13px;")
        layout.addWidget(mode_label)

        mode_combo = QComboBox()
        mode_combo.addItem("角色模板 - 选择一个角色作为技能归属", "role")
        mode_combo.addItem("怪物模板 - 选择一个怪物作为技能归属", "monster")
        mode_combo.addItem("装备模板 - 基于装备机制设计技能", "equip")
        mode_combo.addItem("通用模板 - 基于策划方案设计通用技能", "planning")
        layout.addWidget(mode_combo)

        template_label = QLabel(get_i18n().t("data.select_template_label"))
        template_label.setStyleSheet("font-weight: bold; font-size: 13px;")
        layout.addWidget(template_label)

        template_combo = QComboBox()
        template_combo.setMinimumWidth(480)
        layout.addWidget(template_combo)

        hint_label = QLabel()
        hint_label.setWordWrap(True)
        hint_label.setStyleSheet(
            f"color: {theme_color('hint')}; font-size: 11px; padding: 8px; background: transparent; border-radius: 4px;"
        )
        layout.addWidget(hint_label)

        def _refresh_templates():
            mode = mode_combo.currentData()
            template_combo.clear()

            if mode == "role":
                if roles:
                    for r in roles:
                        template_combo.addItem(
                            f"{r.get('name','?')} | {r.get('job','?')} | HP:{r.get('hp','?')} ATK:{r.get('atk','?')}",
                            ("role", r.get("name", ""), r)
                        )
                else:
                    template_combo.addItem("暂无角色数据，请先创建角色", None)
                hint_label.setText(
                    "提示：选择一个角色后，AI会根据该角色的职业定位\n"
                    "（坦克→防御技、法师→法术、刺客→暗杀等）生成专属技能。"
                )
            elif mode == "monster":
                if monsters:
                    for m in monsters:
                        template_combo.addItem(
                            f"{m.get('name','?')} | Lv{m.get('level','?')} | {m.get('category','?')}",
                            ("monster", m.get("name", ""), m)
                        )
                else:
                    template_combo.addItem("暂无怪物数据，请先创建怪物", None)
                hint_label.setText(
                    "提示：选择一个怪物后，AI会根据其行为模式\n"
                    "（攻击性→攻击技、防御性→护盾、召唤型→召唤随从）设计专属技能。"
                )
            elif mode == "equip":
                if equips:
                    for e in equips:
                        effect = (e.get("effect") or "")[:25]
                        template_combo.addItem(
                            f"{e.get('name','?')} | {e.get('rarity','?')} | {e.get('part','?')} | 效果:{effect}",
                            ("equip", e.get("name", ""), e)
                        )
                else:
                    template_combo.addItem("暂无装备数据，请先创建装备", None)
                hint_label.setText(
                    "提示：选择一件装备后，AI会把装备的被动效果\n"
                    "转化为可主动释放的技能（如冰霜减速→冰霜领域）。"
                )
            else:
                if planning_data and len(str(planning_data)) > 10:
                    preview = str(planning_data)[:60].replace("\n", " ")
                    if len(str(planning_data)) > 60:
                        preview += "..."
                    template_combo.addItem(f"策划方案: {preview}", ("planning", "planning", planning_data))
                else:
                    template_combo.addItem("暂无策划文档，请先创建或导入策划案", None)
                hint_label.setText(
                    "提示：基于策划文档的世界观和数值体系\n"
                    "设计不绑定特定角色/怪物的通用技能。"
                )

        mode_combo.currentIndexChanged.connect(_refresh_templates)
        _refresh_templates()

        btn_layout = QHBoxLayout()
        ok_btn = QPushButton(get_i18n().t("data.confirm_select"))
        cancel_btn = QPushButton(get_i18n().t("common.cancel"))
        clear_btn = QPushButton(get_i18n().t("data.clear_template"))
        btn_layout.addWidget(clear_btn)
        btn_layout.addStretch()
        btn_layout.addWidget(ok_btn)
        btn_layout.addWidget(cancel_btn)
        layout.addLayout(btn_layout)

        result = [None]

        def _on_ok():
            idx = template_combo.currentIndex()
            if idx >= 0:
                data_val = template_combo.currentData()
                if data_val:
                    result[0] = data_val
            dialog.accept()

        def _on_clear():
            result[0] = None
            dialog.accept()

        ok_btn.clicked.connect(_on_ok)
        cancel_btn.clicked.connect(dialog.reject)
        clear_btn.clicked.connect(_on_clear)

        def _on_template_accepted():
            tpl = result[0]
            if tpl is None:
                self.selected_template = None
                self.planning_btn.setText(" " + get_i18n().t("data.reference_template"))
            else:
                mode_type, name, detail = tpl
                from config.constants import _type_registry
                mode_names = dict(_type_registry.names)
                mode_names["planning"] = "通用"
                self.selected_template = {
                    "mode": mode_type,
                    "name": name,
                    "detail": detail,
                }
                self.planning_btn.setText(f"{mode_names.get(mode_type, mode_type)} {name}")
                self._show_toast(f"已选择模板「{name}」，AI生成时将以此为约束", 5000)

        dialog.accepted.connect(_on_template_accepted)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def _save_undo_state(self, action_type, item_id, item_data):
        """保存撤销状态

        Args:
            action_type: 操作类型 ('add', 'update', 'delete')
            item_id: 项目ID
            item_data: 项目数据
        """
        state = {
            'type': action_type,
            'id': item_id,
            'data': item_data.copy()
        }

        self._undo_stack.append(state)
        self._redo_stack.clear()  # 清空重做栈

        # 限制栈大小
        if len(self._undo_stack) > self._max_stack_size:
            self._undo_stack = self._undo_stack[-self._max_stack_size:]

        self.logger.debug(f"保存撤销状态: {action_type}, {item_id}")

    def _mark_main_window_changed(self):
        """标记主窗口数据已变更"""
        EventBus().emit("data_changed")

    def _show_toast(self, message, duration=3000):
        EventBus().emit("show_toast", message=message, duration=duration)

    def _on_show_references(self):
        if not self.current_item:
            QMessageBox.information(self, get_i18n().t("common.info"), "请先选择一个数据项")
            return
        form_data = self.form_widget.get_data()
        if form_data:
            form_data["id"] = self.current_item.get("id", form_data.get("id"))
            existing = self.data_manager.get_item(self.data_type_plural, form_data["id"])
            if existing:
                self.data_manager.update_item(self.data_type_plural, form_data["id"], form_data)
            else:
                self.data_manager.add_item(self.data_type_plural, form_data)
            self.current_item = form_data
            self._mark_main_window_changed()
            self.refresh_list()
        item_id = self.current_item.get("id")
        main_window = self.window()
        if hasattr(main_window, '_show_relation_graph'):
            main_window._show_relation_graph(self.data_type, item_id)

    def undo(self):
        """执行撤销操作"""
        if not self._undo_stack:
            self._show_toast("没有可撤销的操作")
            return

        state = self._undo_stack.pop()
        action_type = state['type']
        item_id = state['id']
        item_data = state['data']

        # 保存当前状态用于重做
        if action_type == 'delete':
            redo_state = {'type': 'delete', 'id': item_id, 'data': item_data}
            self._redo_stack.append(redo_state)
            self.data_manager.add_item(self.data_type_plural, item_data)
            self.current_item = item_data

        elif action_type == 'add':
            redo_state = {'type': 'add', 'id': item_id, 'data': item_data}
            self._redo_stack.append(redo_state)
            self.data_manager.delete_item(self.data_type_plural, item_id)
            self.current_item = None

        elif action_type == 'update':
            current_data = self.data_manager.get_item(self.data_type_plural, item_id)
            if current_data:
                redo_state = {'type': 'update', 'id': item_id, 'data': current_data.copy()}
                self._redo_stack.append(redo_state)
            self.data_manager.update_item(self.data_type_plural, item_id, item_data)
            self.current_item = item_data

        self._mark_main_window_changed()
        self.refresh_list()

        if self.current_item:
            self.form_widget.load_data(self.current_item)
        else:
            self.form_widget.clear()

        self._show_toast("撤销完成")
        self.logger.info(f"已撤销: {action_type}, {item_id}")

    def redo(self):
        """执行重做操作"""
        if not self._redo_stack:
            self._show_toast("没有可重做的操作")
            return

        state = self._redo_stack.pop()
        action_type = state['type']
        item_id = state['id']
        item_data = state['data']

        if action_type == 'delete':
            undo_state = {'type': 'delete', 'id': item_id, 'data': item_data}
            self._undo_stack.append(undo_state)
            self.data_manager.delete_item(self.data_type_plural, item_id)
            self.current_item = None

        elif action_type == 'add':
            undo_state = {'type': 'add', 'id': item_id, 'data': item_data}
            self._undo_stack.append(undo_state)
            self.data_manager.add_item(self.data_type_plural, item_data)
            self.current_item = item_data

        elif action_type == 'update':
            current_data = self.data_manager.get_item(self.data_type_plural, item_id)
            if current_data:
                undo_state = {'type': 'update', 'id': item_id, 'data': current_data.copy()}
                self._undo_stack.append(undo_state)
            self.data_manager.update_item(self.data_type_plural, item_id, item_data)
            self.current_item = item_data

        self._mark_main_window_changed()
        self.refresh_list()

        if self.current_item:
            self.form_widget.load_data(self.current_item)
        else:
            self.form_widget.clear()

        self._show_toast("重做完成")
        self.logger.info(f"已重做: {action_type}, {item_id}")
