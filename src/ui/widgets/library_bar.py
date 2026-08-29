
from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMenu,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from common.lucide_icon import get_icon
from ui.themes import THEMES, get_current_theme, theme_color


class LibraryBarWidget(QWidget):
    library_switched = pyqtSignal(str)
    tabs_rebuild_needed = pyqtSignal()

    def __init__(self, config, data_manager, status_bar, parent=None):
        super().__init__(parent)
        self.config = config
        self.data_manager = data_manager
        self.status_bar = status_bar
        self.logger = get_logger()

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)

        layout.addWidget(QLabel("当前库:"))

        self.library_combo = QToolButton()
        self.library_combo.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self.library_combo.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)
        self.library_combo.setMinimumWidth(180)
        self.library_combo.setText("选择库...")
        self.library_combo.setStyleSheet(self._qss())
        layout.addWidget(self.library_combo)

        self.lib_count_label = QLabel("")
        self.lib_count_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 12px;")
        layout.addWidget(self.lib_count_label)

        layout.addStretch()

        self.refresh_library_list()

    @property
    def _lm(self):
        return self.config.library_manager

    def _data_plural_keys(self):
        from config.constants import DATA_TYPES
        return DATA_TYPES

    def _total_items(self):
        if not self.data_manager:
            return 0
        return sum(
            len(self.data_manager.data.get(k, []))
            for k in self._data_plural_keys()
        )

    def _qss(self):
        return f"""
            QToolButton {{
                text-align: left; padding: 4px 8px;
                border: 1px solid {theme_color('border')}; border-radius: 4px;
                background: {theme_color('bg')}; color: {theme_color('fg')};
            }}
            QToolButton:hover {{
                border-color: {theme_color('accent')};
            }}
            QToolButton::menu-indicator {{
                subcontrol-position: right center;
                right: 6px;
            }}
        """

    def refresh_theme(self):
        self.library_combo.setStyleSheet(self._qss())
        self.lib_count_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 12px;")

    def _apply_dialog_theme(self, dialog):
        theme_name = get_current_theme()
        if theme_name in THEMES:
            dialog.setStyleSheet(THEMES[theme_name])

    def refresh_library_list(self):
        libraries = self._lm.get_all_libraries()
        active_name = self._lm.active_library_name

        menu = QMenu(self.library_combo)

        for lib in libraries:
            display = lib.name
            if lib.description:
                display = f"{lib.name} — {lib.description}"
            if lib.is_initial:
                display = f"[锁] {display}"

            action = menu.addAction(f"  {display}")
            action.setCheckable(True)
            action.setChecked(lib.name == active_name)
            action.triggered.connect(
                lambda checked, name=lib.name: self._menu_select_library(name)
            )

        menu.addSeparator()

        new_action = menu.addAction("新建库...")
        new_action.triggered.connect(self._on_create_library)

        manage_action = menu.addAction("管理库...")
        manage_action.triggered.connect(self._on_manage_libraries)

        if active_name:
            active_lib = next((lib for lib in libraries if lib.name == active_name), None)
            if active_lib and not active_lib.is_initial and len(libraries) > 1:
                delete_action = menu.addAction(f"删除「{active_name}」")
                delete_action.triggered.connect(
                    lambda: self._menu_delete_library(active_name)
                )

        self.library_combo.setMenu(menu)
        self.library_combo.setText(f"  {active_name}" if active_name else "选择库...")

        self.lib_count_label.setText(
            f"({len(libraries)}个库 | {self._total_items()}条数据)"
        )

    def _menu_select_library(self, name: str):
        if self._lm.active_library_name == name:
            return
        if not self._lm.switch_library(name):
            return
        self.library_switched.emit(name)

    def _menu_delete_library(self, name: str):
        reply = QMessageBox.question(
            self, "确认删除",
            f"确定要删除库「{name}」吗？\n\n此操作将删除该库下的所有数据，不可恢复！",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            if self._lm.delete_library(name):
                self.library_switched.emit(self._lm.active_library_name or "")
                self.refresh_library_list()

    def _on_create_library(self):
        existing_names = [lib.name for lib in self._lm.get_all_libraries()]
        suggestions = [f"库{len(existing_names) + 1}", "新项目", "测试库"]
        default_name = next(
            (s for s in suggestions if s not in existing_names),
            f"库{len(existing_names) + 1}"
        )

        dialog = QDialog(self)
        dialog.setWindowTitle("新建游戏数据库")
        dialog.setWindowFlags(dialog.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)
        dialog.setMinimumWidth(280)
        self._apply_dialog_theme(dialog)

        dlg_layout = QVBoxLayout(dialog)
        dlg_layout.setSpacing(8)
        dlg_layout.setContentsMargins(16, 12, 16, 12)

        name_edit = QLineEdit()
        name_edit.setPlaceholderText(default_name)
        name_edit.setMinimumWidth(240)
        dlg_layout.addWidget(QLabel("库名称:"))
        dlg_layout.addWidget(name_edit)

        desc_edit = QTextEdit()
        desc_edit.setPlaceholderText("如：RPG基础策划库、测试数据、副本数据...")
        desc_edit.setMinimumHeight(28)
        desc_edit.setMaximumHeight(60)
        dlg_layout.addWidget(QLabel("描述（可选）:"))
        dlg_layout.addWidget(desc_edit)

        btn_layout = QHBoxLayout()
        btn_layout.addStretch()
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(dialog.reject)
        btn_layout.addWidget(cancel_btn)
        ok_btn = QPushButton("创建")
        ok_btn.setDefault(True)
        btn_layout.addWidget(ok_btn)
        dlg_layout.addLayout(btn_layout)

        dialog.adjustSize()
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)

        def on_accepted():
            name = name_edit.text().strip() or default_name
            desc = desc_edit.toPlainText().strip()
            if self._lm.create_library(name, desc):
                self._lm.switch_library(name)
                self.library_switched.emit(name)

        dialog.accepted.connect(on_accepted)
        ok_btn.clicked.connect(dialog.accept)
        dialog.show()

    def _on_manage_libraries(self):
        libraries = self._lm.get_all_libraries()
        if not libraries:
            return

        from ui.dialogs.auto_input_dialog import show_text_input_dialog

        dialog = QDialog(self)
        dialog.setWindowTitle("管理游戏数据库")
        dialog.setWindowFlags(dialog.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)
        dialog.setMinimumSize(320, 300)
        self._apply_dialog_theme(dialog)

        dlg_layout = QVBoxLayout(dialog)
        dlg_layout.setSpacing(8)
        dlg_layout.setContentsMargins(16, 12, 16, 12)

        list_widget = QListWidget()
        for lib in libraries:
            item_text = lib.name
            if lib.description:
                item_text = f"{lib.name} — {lib.description}"
            if lib.name == self._lm.active_library_name:
                item_text = f"⭐ {item_text}"
            if lib.is_initial:
                item_text = f"[锁] {item_text}"
            list_widget.addItem(item_text)
        dlg_layout.addWidget(list_widget)

        btn_layout = QHBoxLayout()

        rename_btn = QPushButton("重命名")
        def on_rename():
            row = list_widget.currentRow()
            if row < 0:
                return
            old_name = libraries[row].name
            new_name, ok = show_text_input_dialog(dialog, "重命名库", "新名称:", default_text=old_name)
            if ok and new_name and new_name != old_name:
                if self._lm.rename_library(old_name, new_name):
                    self.library_switched.emit(new_name)
                    dialog.accept()

        rename_btn.clicked.connect(on_rename)
        btn_layout.addWidget(rename_btn)

        delete_btn = QPushButton("删除")
        delete_btn.setStyleSheet(f"color: {theme_color('danger')};")
        def on_delete():
            row = list_widget.currentRow()
            if row < 0:
                return
            name = libraries[row].name

            if libraries[row].is_initial:
                QMessageBox.warning(dialog, "提示", f"「{name}」是初始库，不可删除！")
                return

            if len(libraries) <= 1:
                QMessageBox.warning(dialog, "提示", "至少保留一个库！")
                return
            reply = QMessageBox.question(
                dialog, "确认删除",
                f"确定要删除库「{name}」吗？\n\n此操作将删除该库下的所有数据，不可恢复！",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply == QMessageBox.StandardButton.Yes:
                if self._lm.delete_library(name):
                    self.library_switched.emit(
                        self._lm.active_library_name or ""
                    )
                    dialog.accept()

        delete_btn.clicked.connect(on_delete)
        btn_layout.addWidget(delete_btn)

        import_btn = QPushButton(" 导入数据")
        import_btn.setIcon(get_icon("download", "#666", 14))
        import_btn.setIconSize(QSize(14, 14))
        import_btn.setStyleSheet(f"color: {theme_color('accent')};")
        import_btn.setToolTip("从其他库复制游戏数据和策划方案到当前选中的库")
        def on_import():
            row = list_widget.currentRow()
            if row < 0:
                QMessageBox.warning(dialog, "提示", "请先选择一个目标库")
                return
            target_name = libraries[row].name
            other_libs = [lib for lib in libraries if lib.name != target_name]
            if not other_libs:
                QMessageBox.warning(dialog, "提示", "没有其他库可作为数据来源")
                return

            import_dialog = QDialog(dialog)
            import_dialog.setWindowTitle("选择数据来源库")
            import_dialog.setWindowFlags(
                import_dialog.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint
            )
            import_dialog.setMinimumWidth(300)
            self._apply_dialog_theme(import_dialog)
            ilayout = QVBoxLayout(import_dialog)
            ilayout.setSpacing(8)
            ilayout.setContentsMargins(16, 12, 16, 12)
            ilayout.addWidget(QLabel(f"目标库: {target_name}"))
            ilayout.addWidget(QLabel("从哪个库导入数据:"))

            source_list = QListWidget()
            for lib in other_libs:
                label = f"{lib.name}"
                if lib.description:
                    label += f" — {lib.description}"
                source_list.addItem(label)
            ilayout.addWidget(source_list)

            include_planning_cb = QCheckBox("同时导入策划方案")
            include_planning_cb.setChecked(True)
            ilayout.addWidget(include_planning_cb)

            ibtn_layout = QHBoxLayout()
            ibtn_layout.addStretch()
            cancel_ibtn = QPushButton("取消")
            cancel_ibtn.clicked.connect(import_dialog.reject)
            ibtn_layout.addWidget(cancel_ibtn)
            ok_ibtn = QPushButton("导入")
            ok_ibtn.setDefault(True)
            ok_ibtn.setStyleSheet(f"color: {theme_color('accent')}; font-weight: bold;")

            def do_import():
                sr = source_list.currentRow()
                if sr < 0:
                    QMessageBox.warning(import_dialog, "提示", "请选择来源库")
                    return
                source_name = other_libs[sr].name
                reply = QMessageBox.question(
                    import_dialog, "确认导入",
                    f"将把「{source_name}」的游戏数据"
                    + ("和策划方案" if include_planning_cb.isChecked() else "")
                    + f"\n追加到「{target_name}」中。\n\n"
                    "已存在的数据不会覆盖，只会追加新增项。\n确认导入？",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                if reply != QMessageBox.StandardButton.Yes:
                    return
                res = self._lm.copy_data_from_library(
                    source_name, target_name,
                    include_planning=include_planning_cb.isChecked()
                )
                if res.get("success"):
                    self.library_switched.emit(target_name)
                    QMessageBox.information(
                        import_dialog, "导入成功",
                        f"从「{source_name}」导入了 {res['data_count']} 条数据"
                        + (f"、{res['docs_count']} 个策划方案" if res.get('docs_count') else "")
                        + "。"
                    )
                    import_dialog.accept()
                    dialog.accept()
                else:
                    QMessageBox.warning(import_dialog, "导入失败", res.get("error", "未知错误"))

            ok_ibtn.clicked.connect(do_import)
            ibtn_layout.addWidget(ok_ibtn)
            ilayout.addLayout(ibtn_layout)
            import_dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            import_dialog.show()

        import_btn.clicked.connect(on_import)
        btn_layout.addWidget(import_btn)

        type_edit_btn = QPushButton(" 类型编辑")
        type_edit_btn.setIcon(get_icon("settings", "#666", 14))
        type_edit_btn.setIconSize(QSize(14, 14))
        type_edit_btn.setStyleSheet("font-weight:bold;")
        def on_type_edit():
            row = list_widget.currentRow()
            if row < 0:
                return
            lib_name = libraries[row].name
            schema = self._lm.prepare_active_schema()
            if not schema:
                QMessageBox.warning(dialog, "提示", f"库「{lib_name}」的类型模式文件损坏或不存在")
                return
            from ui.dialogs.type_editor_dialog import TypeEditorDialog
            if TypeEditorDialog.edit(schema, lib_name, dialog):
                self._lm.reload_type_schema(lib_name)
                schema.save(self._lm.get_schema_path())
                from config.constants import reload_from_type_schema
                reload_from_type_schema(
                    schema.plural_keys, schema.type_names,
                    schema.type_plurals, {t.id: t.color for t in schema.types}
                )
                self.tabs_rebuild_needed.emit()
                from common.event_bus import EventBus
                EventBus().emit("schema_changed")
                dialog.accept()

        type_edit_btn.clicked.connect(on_type_edit)
        btn_layout.addWidget(type_edit_btn)

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(dialog.accept)
        btn_layout.addWidget(close_btn)

        dlg_layout.addLayout(btn_layout)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.finished.connect(lambda: self.refresh_library_list())
        dialog.show()
