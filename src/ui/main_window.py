"""主窗口 - 墨白启动器"""
import os
from pathlib import Path

from PyQt6.QtCore import Q_ARG, QMetaObject, QSize, Qt, QTimer, pyqtSlot
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import MIN_WINDOW_SIZE, WINDOW_SIZE, WINDOW_TITLE
from config.settings import get_config
from core.data_manager import OptimizedDataManager

logger = get_logger()


def _safe_call(fn, *args, **kwargs):
    """安全执行回调，捕获并记录异常（用于 QTimer.singleShot 等不可观测的延迟调用）"""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        get_logger().error(f"延迟调用执行失败: {e}", exc_info=True)
        return None
from common.auto_updater import AutoUpdater  # noqa: E402  # 延迟导入：置于 _safe_call 之后，避免模块级循环导入
from common.event_bus import EventBus  # noqa: E402  # 延迟导入：避免模块级循环导入
from common.i18n import get_i18n  # noqa: E402  # 延迟导入：避免模块级循环导入
from common.logger import get_logger  # noqa: E402  # 延迟导入：避免模块级循环导入
from common.lucide_icon import get_icon  # noqa: E402  # 延迟导入：避免模块级循环导入
from core.attr_system import AttributeSystem  # noqa: E402  # 延迟导入：避免模块级循环导入
from features.backup import export_for_game  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.ai_bridge import AIBridge  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.ceshu_controller import CeshuController  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.components.toast import Toast  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.dialogs.startup_mode_dialog import StartupModeDialog  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.digital_employee import DigitalPanel  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.layout_builder import LayoutBuilder  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.library_controller import LibraryController  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.menus import setup_menubar  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.tab_manager import TabManager  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.theme_effects import ThemeEffectsManager  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.themes import THEMES, set_current_theme, theme_color  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.widgets.attr_system_editor import AttrSystemEditor  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.widgets.library_bar import LibraryBarWidget  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.window_state import WindowStateManager  # noqa: E402  # 延迟导入：避免模块级循环导入


class MainWindow(QMainWindow):
    """PyQt6版本的主窗口"""

    @property
    def _has_unsaved_changes(self):
        return self._state.has_unsaved_changes if self._state else False

    @_has_unsaved_changes.setter
    def _has_unsaved_changes(self, value):
        if self._state:
            self._state._has_unsaved_changes = value

    @property
    def _data_hash(self):
        return self._state._data_hash if self._state else None

    @_data_hash.setter
    def _data_hash(self, value):
        if self._state:
            self._state._data_hash = value

    @property
    def auto_save_enabled(self):
        return self._state.auto_save_enabled if self._state else True

    @auto_save_enabled.setter
    def auto_save_enabled(self, value):
        if self._state:
            self._state.auto_save_enabled = value

    @property
    def auto_save_interval(self):
        return self._state.auto_save_interval if self._state else 300000

    @auto_save_interval.setter
    def auto_save_interval(self, value):
        if self._state:
            self._state.auto_save_interval = value

    def __init__(self):
        """初始化主窗口"""
        super().__init__()
        self.config = get_config()
        self.logger = get_logger()
        self.library_ctrl = LibraryController(self)
        self.ceshu_ctrl = CeshuController(self)
        self.tab_mgr = TabManager(self)
        self.layout_builder = LayoutBuilder(self)
        self.ai_bridge = AIBridge(self)
        self.tabs = {}
        self._tab_configs = None
        self._tab_config_map = {}
        self._rebuilding = False  # 防重入锁
        self.data_manager = None
        self.is_three_column_layout = True
        self.current_theme = "默认"
        self.startup_mode = StartupModeDialog.CESHU_EDITOR_MODE

        self.effects_manager = ThemeEffectsManager(self)
        self.glow_widgets = []

        self._toast = Toast(self)

        self._last_tab_index = 0

        self.setup_status_bar()
        self.setup_ui()
        self.setup_menu()
        self.setup_shortcuts()

        self.status_bar.showMessage("正在加载数据...")
        self.data_manager = OptimizedDataManager(self._update_progress)
        self._state = WindowStateManager(
            self, self.config.config_dir / "window_state.json",
            self.config, self.data_manager, self.logger
        )
        self.library_bar_widget = LibraryBarWidget(
            self.config, self.data_manager, self.status_bar, parent=self
        )
        self.library_bar_widget.library_switched.connect(self._on_library_switched)
        self.library_bar_widget.tabs_rebuild_needed.connect(
            lambda: QTimer.singleShot(0, lambda: _safe_call(self.tab_mgr.rebuild_all_tabs))
        )
        # 该容器自身没有布局归属：只有 library_combo / lib_count_label 被放入顶部工具条，
        # 容器与残留的「当前库:」标签会作为游离控件停靠在窗口左上角并拦截菜单栏点击
        self.library_bar_widget.hide()
        self._setup_corner_widget()
        self.tab_mgr.create_tabs()
        self._state.restore_ui_state()
        self.layout_builder.apply_current_layout()

        # ---- 共享 AI 大脑 + 数字员工面板（延迟加载，避免卡 UI）----
        self.agent_brain = None
        # 复用 layout_builder 已创建的 digital_panel；若尚未创建则补建（parent=self 避免独立窗口）
        if not getattr(self, 'digital_panel', None):
            # 仅在 layout_builder 未创建时才补建，且用 self 作为 parent（非 None）
            self.digital_panel = DigitalPanel(None, self, data_manager=self.data_manager)
            self.digital_panel.setParent(self)
            self.digital_panel.setVisible(False)
        # 如果 layout_builder 已创建并 show 了 digital_panel，不要重复 hide
        QTimer.singleShot(200, self.ai_bridge.init_agent_brain)

        self._compute_data_hash()
        self.start_auto_save()

        self.setStyleSheet(THEMES[self.current_theme])
        set_current_theme(self.current_theme)
        QTimer.singleShot(100, self._apply_effects)
        self.status_bar.showMessage(f"已加载主题: {self.current_theme}", 2000)
        self._setup_event_bus()
        EventBus().emit("theme_changed", theme=self.current_theme)

        self._check_startup_mode()

        # 延迟检查更新（不阻塞 UI 启动）
        QTimer.singleShot(5000, self._check_update)

        self.logger.info("应用程序启动成功")

    def setup_ui(self):
        """设置UI"""
        self.setWindowTitle(WINDOW_TITLE)
        self.resize(WINDOW_SIZE[0], WINDOW_SIZE[1])
        self.setMinimumSize(MIN_WINDOW_SIZE[0], MIN_WINDOW_SIZE[1])
        self.setAccessibleName("墨白可视化编辑器主窗口")
        self.setAccessibleDescription("游戏数据编辑与策划书管理主窗口")

        # 设置一个好看的图标
        from PyQt6.QtWidgets import QStyle
        style = self.style()
        icon = style.standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
        self.setWindowIcon(icon)

    def _create_library_bar(self):
        return self.library_bar_widget

    def _get_tab_configs(self):
        return self.tab_mgr.get_tab_configs()

    def _get_data_plural_keys(self):
        return self.tab_mgr.get_data_plural_keys()

    def _refresh_library_list(self):
        self.library_ctrl.refresh_library_list()

    def _on_library_switched(self, name: str):
        self.library_ctrl.on_library_switched(name)

    def _reload_tabs_data(self):
        self.tab_mgr.reload_tabs_data()

    def _rebuild_all_tabs(self):
        self.tab_mgr.rebuild_all_tabs()

    def _check_startup_mode(self):
        """检查并应用启动模式配置"""
        saved_mode = getattr(self.config, 'startup_mode', getattr(self.config, '启动模式', None))
        if saved_mode == StartupModeDialog.EDITOR_ONLY_MODE:
            self.startup_mode = StartupModeDialog.EDITOR_ONLY_MODE
        else:
            self.startup_mode = StartupModeDialog.CESHU_EDITOR_MODE

    def _check_update(self):
        """检查更新（延迟启动，不阻塞 UI）"""
        try:
            updater = AutoUpdater(
                owner="mobai",
                repo="game-editor-app",
                current_version="4.0.0"
            )
            result = updater.check_update()
            if result:
                version = result["version"]
                self.show_toast(f"发现新版本 v{version}，可前往 GitHub 下载", duration=8000, success=True)
                self.logger.info(f"新版本 v{version} 可用: {result['url']}")
        except Exception:
            self.logger.debug("更新检查失败（可能无网络连接）")

    def _handle_mode_selection(self, mode, remember):
        """处理启动模式选择回调"""
        self.startup_mode = mode
        if remember:
            self.config.startup_mode = mode
            try:
                import json
                config_file = self.config.data_dir / "app_config.json"
                config_data = {}
                if config_file.exists():
                    with open(config_file, encoding='utf-8') as f:
                        config_data = json.load(f)
                config_data['启动模式'] = mode
                with open(config_file, 'w', encoding='utf-8') as f:
                    json.dump(config_data, f, ensure_ascii=False, indent=2)
            except Exception:
                self.logger.error("保存启动配置失败", exc_info=True)

    def _setup_event_bus(self):
        bus = EventBus()
        bus.on("rebuild_needed", self._on_rebuild_needed)
        bus.on("data_changed", self._on_event_data_changed)
        bus.on("show_toast", self._on_show_toast)

    def _on_rebuild_needed(self, **_):
        self.tab_mgr._on_rebuild_needed()

    @pyqtSlot()
    def _deferred_rebuild(self):
        self.tab_mgr._deferred_rebuild()

    def _on_show_toast(self, **kw):
        QMetaObject.invokeMethod(self, "_deferred_toast", Qt.ConnectionType.QueuedConnection,
                                 Q_ARG(str, kw.get('message', '')), Q_ARG(int, kw.get('duration', 3000)))

    @pyqtSlot(str, int)
    def _deferred_toast(self, message: str, duration: int):
        if hasattr(self, 'show_toast'):
            self.show_toast(message, duration)

    @pyqtSlot(str)
    def _deferred_switch_tab(self, data_type: str):
        self.tab_mgr.deferred_switch_tab(data_type)

    @pyqtSlot(str)
    def _deferred_switch_library(self, name: str):
        self.tab_mgr.deferred_switch_library(name)

    @pyqtSlot(str)
    def _deferred_set_layout(self, mode: str):
        self.layout_builder.set_layout("three_column")

    @pyqtSlot()
    def _deferred_toggle_digital_panel(self):
        if hasattr(self, 'digital_panel') and self.digital_panel is not None:
            self.ai_bridge.toggle_digital_panel()

    @pyqtSlot()
    def _deferred_toggle_ai_popup(self):
        self.ai_bridge.open_ai_popup()

    def _on_event_data_changed(self, **_):
        QMetaObject.invokeMethod(self, "_deferred_data_changed", Qt.ConnectionType.QueuedConnection)

    @pyqtSlot()
    def _deferred_data_changed(self):
        if hasattr(self, 'mark_data_changed'):
            self.mark_data_changed()
        if hasattr(self, 'project_list') and self.project_list is not None:
            QTimer.singleShot(50, self._refresh_project_list_now)

    def _refresh_project_list_now(self):
        if not hasattr(self, 'data_type_combo') or not hasattr(self, 'project_list'):
            return
        try:
            data_type = self.data_type_combo.currentData()
            if data_type:
                self._update_project_list(data_type)
        except Exception:
            self.logger.error("刷新项目列表失败", exc_info=True)

    def _apply_current_layout(self):
        self.layout_builder.apply_current_layout()

    def _do_apply_current_layout(self):
        self.layout_builder._do_apply_current_layout()

    def _build_three_column(self, layout):
        self.layout_builder._build_three_column(layout)

    def _build_three_column_safe(self, layout):
        self.layout_builder._build_three_column_safe(layout)

    def _apply_splitter_ratio(self, splitter):
        self.layout_builder._apply_splitter_ratio(splitter)

    def _get_saved_splitter_ratio(self):
        return self.layout_builder._get_saved_splitter_ratio()

    def _save_splitter_ratio(self):
        self.layout_builder.save_splitter_ratio()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.layout_builder.handle_resize(event)

    def _ensure_tab_loaded(self, data_type):
        return self.tab_mgr.ensure_tab_loaded(data_type)

    def _update_project_list(self, data_type):
        """更新项目列表（兼容旧调用，优先使用 _update_editor_project_list）"""
        self._update_editor_project_list(data_type)

    def _update_editor_project_list(self, data_type):
        """三栏布局下：从 DataEditorTab 获取数据项名填充左栏列表"""
        if not hasattr(self, 'project_list'):
            return
        self.project_list.clear()

        editor = self.tabs.get(data_type)
        if editor is None:
            return
        try:
            editor.objectName()
        except RuntimeError:
            return

        names = editor.get_item_names()
        for idx, name in enumerate(names):
            list_item = QListWidgetItem(f"{idx + 1}. {name}")
            self.project_list.addItem(list_item)

        if self.project_list.count() > 0:
            self.project_list.setCurrentRow(0)

    def _update_ceshu_project_list(self):
        """三栏布局下：从 CeshuHomeView 获取策划书名填充左栏列表"""
        self.ceshu_ctrl.update_ceshu_project_list()

    def _hide_project_list_buttons(self):
        """隐藏左栏操作按钮区"""
        if hasattr(self, '_project_list_btn_widget'):
            self._project_list_btn_widget.setVisible(False)

    def _show_project_list_buttons(self, mode: str = "data"):
        """显示左栏操作按钮区（mode: data | ceshu）"""
        # 如果还没创建按钮区，先创建
        if not hasattr(self, '_project_list_btn_widget'):
            return
        self._project_list_btn_widget.setVisible(True)
        # 根据模式显示不同按钮
        if hasattr(self, '_new_data_btn'):
            self._new_data_btn.setVisible(mode == "data")
        if hasattr(self, '_new_ceshu_btn'):
            self._new_ceshu_btn.setVisible(mode == "ceshu")
        if hasattr(self, '_ai_ceshu_btn'):
            self._ai_ceshu_btn.setVisible(mode == "ceshu")
        if hasattr(self, '_export_ceshu_btn'):
            self._export_ceshu_btn.setVisible(mode == "ceshu")

    def _on_project_list_new_ceshu(self):
        """左栏按钮：新建策划书"""
        self.ceshu_ctrl.on_project_list_new_ceshu()

    def _on_project_list_ai_ceshu(self):
        """左栏按钮：AI生成策划书"""
        self.ceshu_ctrl.on_project_list_ai_ceshu()

    def _on_project_list_export_ceshu(self):
        """左栏按钮：导出策划书"""
        self.ceshu_ctrl.on_project_list_export_ceshu()

    def _on_ceshu_opened(self, ceshu_id: str, library: str):
        """策划书卡片点击 → 路由到控制器"""
        print(f"[DIAG] _on_ceshu_opened: id={ceshu_id}, lib={library}")
        self.ceshu_ctrl.on_ceshu_opened(ceshu_id, library)

    def _on_ceshu_back(self):
        """编辑器返回 → 切回策划书首页"""
        self.ceshu_ctrl.on_ceshu_back()

    def _on_ceshu_ai_context(self, chapter: str) -> None:
        """章节切换 → 注入策划书上下文到 AI 面板"""
        self.ceshu_ctrl.on_ceshu_ai_context(chapter)

    def _send_ceshu_ai_context(self, model, chapter: str) -> None:
        """注入策划书上下文到 DigitalPanel"""
        self.ceshu_ctrl.send_ceshu_ai_context(model, chapter)

    def _on_project_list_context_menu(self, pos):
        self.ceshu_ctrl.on_project_list_context_menu(pos)

    def _ceshu_context_rename(self, row: int):
        self.ceshu_ctrl._ceshu_context_rename(row)

    def _ceshu_context_delete(self, row: int, name: str):
        self.ceshu_ctrl._ceshu_context_delete(row, name)

    def _show_recovery_layout(self):
        """当布局构建失败时显示恢复界面"""
        self.layout_builder._show_recovery_layout()

    def _tab_dropdown_do_add(self, data_type: str, tab_name: str):
        self.tab_mgr._tab_dropdown_do_add(data_type, tab_name)

    def _tab_dropdown_open_type_editor(self):
        self.tab_mgr._tab_dropdown_open_type_editor()

    def _invalidate_tab_configs(self):
        self.tab_mgr.invalidate_tab_configs()

    def _setup_corner_widget(self):
        corner = QWidget()
        layout = QHBoxLayout(corner)
        layout.setContentsMargins(4, 0, 8, 0)
        layout.setSpacing(6)

        layout.addWidget(QLabel(get_i18n().t("app.current_library")))
        self.library_bar_widget.library_combo.setMinimumWidth(140)
        layout.addWidget(self.library_bar_widget.library_combo)
        layout.addWidget(self.library_bar_widget.lib_count_label)

        layout.addSpacing(12)

        self._settings_btn = QPushButton(" " + get_i18n().t("app.settings"))
        self._settings_btn.setIcon(get_icon("settings", theme_color('btn_text') or 'white', 14))
        self._settings_btn.setIconSize(QSize(14, 14))
        self._settings_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('accent')}; color: {theme_color('btn_text') or 'white'};
                border: none; border-radius: 4px;
                padding: 3px 10px; font-size: 12px; font-weight: bold;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
        self._settings_btn.clicked.connect(self.open_settings)
        self._settings_btn.setAccessibleName("设置按钮")
        self._settings_btn.setAccessibleDescription("点击打开应用程序设置对话框")
        layout.addWidget(self._settings_btn)

        self._agent_edit_btn = QPushButton(" " + get_i18n().t("app.agent"))
        self._agent_edit_btn.setIcon(get_icon("brain", theme_color('btn_text') or 'white', 14))
        self._agent_edit_btn.setIconSize(QSize(14, 14))
        self._agent_edit_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('accent')}; color: {theme_color('btn_text') or 'white'};
                border: none; border-radius: 4px;
                padding: 3px 10px; font-size: 12px; font-weight: bold;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
        self._agent_edit_btn.clicked.connect(self._open_agent_editor)
        self._agent_edit_btn.setAccessibleName("智能体按钮")
        self._agent_edit_btn.setAccessibleDescription("点击打开智能体编辑器管理 Agent 配置")
        layout.addWidget(self._agent_edit_btn)

        self._ai_popup_btn = QPushButton(" AI")
        self._ai_popup_btn.setIcon(get_icon("bot", theme_color('btn_text') or 'white', 14))
        self._ai_popup_btn.setIconSize(QSize(14, 14))
        self._ai_popup_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('accent')}; color: {theme_color('btn_text') or 'white'};
                border: none; border-radius: 4px;
                padding: 3px 10px; font-size: 12px; font-weight: bold;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
        self._ai_popup_btn.clicked.connect(self._open_ai_popup)
        self._ai_popup_btn.setAccessibleName("AI助手按钮")
        self._ai_popup_btn.setAccessibleDescription("点击打开 AI 助手浮窗进行智能对话")
        layout.addWidget(self._ai_popup_btn)

        self.menuBar().setCornerWidget(corner, Qt.Corner.TopRightCorner)

    def _update_corner_widget_theme(self):
        """主题切换时更新角落组件的硬编码颜色"""
        if hasattr(self, 'library_bar_widget'):
            self.library_bar_widget.refresh_theme()
        btn_color = theme_color('btn_text') or 'white'
        if hasattr(self, '_settings_btn'):
            self._settings_btn.setIcon(get_icon("settings", btn_color, 14))
            self._settings_btn.setIconSize(QSize(14, 14))
            self._settings_btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('accent')}; color: {btn_color};
                    border: none; border-radius: 4px;
                    padding: 3px 10px; font-size: 12px; font-weight: bold;
                }}
                QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
            """)
        if hasattr(self, '_agent_edit_btn'):
            self._agent_edit_btn.setIcon(get_icon("brain", btn_color, 14))
            self._agent_edit_btn.setIconSize(QSize(14, 14))
            self._agent_edit_btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('accent')}; color: {btn_color};
                    border: none; border-radius: 4px;
                    padding: 3px 10px; font-size: 12px; font-weight: bold;
                }}
                QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
            """)
        if hasattr(self, '_ai_popup_btn'):
            self._ai_popup_btn.setIcon(get_icon("bot", btn_color, 14))
            self._ai_popup_btn.setIconSize(QSize(14, 14))
            self._ai_popup_btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('accent')}; color: {btn_color};
                    border: none; border-radius: 4px;
                    padding: 3px 10px; font-size: 12px; font-weight: bold;
                }}
                QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
            """)

    def setup_menu(self):
        """构建菜单栏（通过 ui.menus 模块）"""
        setup_menubar(self)

    def setup_status_bar(self):
        """设置状态栏"""
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)

        self.progress_bar = QProgressBar()
        self.progress_bar.setMaximumWidth(200)
        self.progress_bar.setVisible(False)
        self.status_bar.addPermanentWidget(self.progress_bar)

        # 快捷键提示标签
        shortcut_label = QLabel(get_i18n().t("app.shortcut_hint"))
        shortcut_label.setStyleSheet(f"padding: 0 10px; color: {theme_color('hint')}; font-size: 11px;")
        self.status_bar.addPermanentWidget(shortcut_label)

        self.status_bar.showMessage("就绪")

    def setup_shortcuts(self):
        """设置键盘快捷键"""
        from PyQt6.QtGui import QKeySequence, QShortcut

        # 保存 (Ctrl+S)
        self.save_shortcut = QShortcut(QKeySequence.StandardKey.Save, self)
        self.save_shortcut.activated.connect(self.save_file)

        # 打开 (Ctrl+O)
        self.open_shortcut = QShortcut(QKeySequence.StandardKey.Open, self)
        self.open_shortcut.activated.connect(self.open_file)

        # 撤销 (Ctrl+Z)
        self.undo_shortcut = QShortcut(QKeySequence.StandardKey.Undo, self)
        self.undo_shortcut.activated.connect(self._do_undo)

        # 重做 (Ctrl+Y / Ctrl+Shift+Z)
        self.redo_shortcut = QShortcut(QKeySequence.StandardKey.Redo, self)
        self.redo_shortcut.activated.connect(self._do_redo)

        self.logger.info("键盘快捷键已设置")

    def _do_undo(self):
        """执行撤销操作"""
        if hasattr(self, 'current_editor') and self.current_editor:
            if hasattr(self.current_editor, 'undo'):
                self.current_editor.undo()
                return
        self.show_toast("当前标签页不支持撤销操作", duration=2000)

    def _do_redo(self):
        """执行重做操作"""
        if hasattr(self, 'current_editor') and self.current_editor:
            if hasattr(self.current_editor, 'redo'):
                self.current_editor.redo()
                return
        self.show_toast("当前标签页不支持重做操作", duration=2000)

    def _compute_data_hash(self):
        self._state.compute_data_hash()

    def _invalidate_cached_hash(self):
        self._state.invalidate_cached_hash()

    def _check_data_changed(self):
        return self._state.check_data_changed()

    def _update_window_title(self):
        """更新窗口标题（显示是否有未保存的更改）"""
        self._state._update_window_title()

    def mark_data_changed(self):
        """标记数据已变更（其他组件可调用此函数）"""
        self._state.mark_data_changed()

    def show_toast(self, message, duration=3000, success=False, error=False):
        """显示 Toast 非阻塞通知

        Args:
            message: 提示消息
            duration: 显示持续时间（毫秒）
            success: 是否为成功提示（绿色）
            error: 是否为错误提示（红色）
        """
        try:
            self._toast.show_message(message, duration, success=success, error=error)
        except Exception:
            self.logger.error("显示 Toast 提示失败", exc_info=True)

    def _check_unsaved_changes(self):
        """检查是否有未保存的更改

        Returns:
            bool: 是否继续操作（True=继续，False=取消）
        """
        # 检查数据是否变更
        self._check_data_changed()

        if not self._has_unsaved_changes:
            return True

        reply = QMessageBox.question(
            self,
            get_i18n().t("app.unsaved_changes"),
            "您有未保存的更改。是否保存？",
            QMessageBox.StandardButton.Yes |
            QMessageBox.StandardButton.No |
            QMessageBox.StandardButton.Cancel
        )

        if reply == QMessageBox.StandardButton.Yes:
            self.save_file()
            # 保存后再次检查是否还有未保存更改
            self._check_data_changed()
            return True
        elif reply == QMessageBox.StandardButton.No:
            return True
        else:  # Cancel
            return False

    def _update_progress(self, message, percent):
        """更新进度

        Args:
            message: 消息
            percent: 百分比 (0-100)
        """
        self.status_bar.showMessage(message)

        if 0 < percent < 100:
            self.progress_bar.setVisible(True)
            self.progress_bar.setValue(int(percent))
            self.progress_bar.setFormat(f"%p% - {message}")
            self.progress_bar.setMaximumWidth(400)
        elif percent >= 100:
            self.progress_bar.setValue(100)
            self.progress_bar.setFormat("完成 ✓")
            self.progress_bar.setMaximumWidth(200)
            QTimer.singleShot(1500, lambda: self._safe_hide_progress())
        else:
            self.progress_bar.setVisible(False)

    def _safe_hide_progress(self):
        """安全隐藏进度条"""
        try:
            self.progress_bar.setVisible(False)
            self.progress_bar.setMaximumWidth(200)
            self._safe_show_message("就绪")
        except RuntimeError:
            pass

    def _safe_show_message(self, message: str):
        try:
            self.status_bar.showMessage(message)
        except RuntimeError as e:
            logger.debug(f"操作失败: {e}")

    def open_file(self):
        """打开文件"""
        file_path, _ = QFileDialog.getOpenFileName(
            self, get_i18n().t("app.open_file"), str(self.config.data_dir), "JSON文件 (*.json);;所有文件 (*.*)"
        )

        if file_path:
            self._update_progress(f"正在加载: {os.path.basename(file_path)}...", 10)

            def on_loaded(success):
                if success:
                    self._refresh_all_tabs()
                    self._update_progress("加载完成", 100)
                    self.show_toast("文件已打开")
                else:
                    self._update_progress("加载失败", 100)
                    QMessageBox.warning(self, get_i18n().t("common.error"), "无法打开文件")

            self.data_manager.open_file_async(file_path, on_loaded)

    def save_file(self):
        """保存文件"""
        if not self.data_manager.current_file:
            file_path, _ = QFileDialog.getSaveFileName(
                self, get_i18n().t("app.save_file"), str(self.config.data_dir), "JSON文件 (*.json)"
            )
            if not file_path:
                return
        else:
            file_path = self.data_manager.current_file

        self._update_progress("正在保存...", 10)

        def on_saved(success):
            def _update_ui():
                if success:
                    self._update_progress("保存完成", 100)
                    self._compute_data_hash()
                    self.status_bar.showMessage("保存成功")
                    self.show_toast("文件已保存")
                else:
                    self._update_progress("保存失败", 100)
                    QMessageBox.warning(self, get_i18n().t("common.error"), "无法保存文件")
            QTimer.singleShot(0, _update_ui)

        self.data_manager.save_file_async(file_path, on_saved)

    def clear_all_data(self):
        """清空所有数据"""
        reply = QMessageBox.question(
            self, get_i18n().t("common.confirm"), "确定要清空所有数据吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            if self.data_manager.clear_all():
                self._refresh_all_tabs()
                self.show_toast("数据已清空")

    def _refresh_all_tabs(self):
        """刷新所有标签页"""
        self.tab_mgr.refresh_all_tabs()

    def set_layout(self, mode):
        """设置界面布局（始终使用三栏布局）"""
        self.layout_builder.set_layout(mode)

    def export_game_data(self):
        """导出游戏数据"""
        file_path, _ = QFileDialog.getSaveFileName(
            self, get_i18n().t("app.export_game_data"), "", "JSON Files (*.json);;All Files (*)"
        )

        if file_path:
            if export_for_game(self.data_manager, file_path):
                self.show_toast("游戏数据导出成功！", 5000)
            else:
                QMessageBox.warning(self, get_i18n().t("app.failed"), "游戏数据导出失败")

    def change_theme(self, theme_name):
        """切换主题

        Args:
            theme_name: 主题名称
        """
        self.current_theme = theme_name
        if theme_name in THEMES:
            set_current_theme(theme_name)
            self.setStyleSheet(THEMES[theme_name])
            # 更新角落按钮等硬编码颜色组件
            self._update_corner_widget_theme()
            self.status_bar.showMessage(f"已切换到 {theme_name}")
            EventBus().emit("theme_changed", theme=theme_name)

            # 延迟应用主题特效（确保控件已渲染）
            QTimer.singleShot(100, self._apply_effects)

    def _apply_effects(self):
        """收集并应用所有特效"""
        # 收集所有文字流光组件
        all_text_widgets = []

        # 主界面的文字组件（如果有）
        all_text_widgets.extend(self.glow_widgets)

        # 应用特效
        self.effects_manager.apply_theme_effects(self.current_theme, all_text_widgets)

    def start_auto_save(self):
        """开始自动保存"""
        if self.auto_save_enabled:
            self.auto_save_timer = QTimer()
            self.auto_save_timer.timeout.connect(self.auto_save)
            self.auto_save_timer.start(self.auto_save_interval)

    def auto_save(self):
        """自动保存"""
        if self._state.should_auto_save() and self.data_manager.current_file:
            self.status_bar.showMessage("正在自动保存...")
            self.data_manager.save_file_async()
            self._state.reset_auto_save_timer()
            QTimer.singleShot(2000, lambda: self._safe_show_message("自动保存完成"))

    def toggle_auto_save(self):
        """切换自动保存"""
        self.auto_save_enabled = not self.auto_save_enabled
        if self.auto_save_enabled:
            self.start_auto_save()
            self.show_toast("自动保存已开启", success=True)
        else:
            if hasattr(self, 'auto_save_timer'):
                self.auto_save_timer.stop()
            self.show_toast("自动保存已关闭")

    def open_settings(self):
        """打开统一设置对话框"""
        from ui.dialogs.settings_dialog import SettingsDialog
        dialog = SettingsDialog(self, config=self.config)
        if dialog.exec() == SettingsDialog.DialogCode.Accepted:
            self.status_bar.showMessage("设置已更新", 3000)

    def _save_ui_state(self):
        """持久化 UI 状态到 JSON 文件"""
        self._state.save_ui_state()

    def _restore_ui_state(self):
        """从 JSON 文件恢复 UI 状态"""
        self._state.restore_ui_state()

    def closeEvent(self, event):
        if not self._check_unsaved_changes():
            event.ignore()
            return

        self._save_ui_state()
        self._save_splitter_ratio()

        if hasattr(self, 'auto_save_timer'):
            self.auto_save_timer.stop()

        all_timers = ('auto_save_timer', '_glow_timer', '_theme_timer', '_typing_timer')
        for timer_name in all_timers:
            if hasattr(self, timer_name):
                timer = getattr(self, timer_name)
                if hasattr(timer, 'stop'):
                    try:
                        timer.stop()
                    except Exception:
                        self.logger.error("定时器关闭异常", exc_info=True)

        if hasattr(self, 'effects_manager'):
            try:
                self.effects_manager.clear_effects()
            except Exception:
                self.logger.error("特效清理异常", exc_info=True)

        self.tabs.clear()

        try:
            self.data_manager.shutdown()
        except Exception as e:
            self.logger.error(f"数据管理器关闭异常: {e}")

        try:
            from ui.components.image_loader import LazyImageLoader
            LazyImageLoader.shutdown_all()
        except Exception as e:
            self.logger.error(f"图片加载器关闭异常: {e}")

        self.logger.info("应用程序关闭")
        event.accept()

    def hot_reload_template(self):
        """模板热加载（无需重启程序）

        重新创建所有数据标签页以应用新的字段配置，并自动升级schema
        """
        self.logger.info("开始热加载模板...")
        self.status_bar.showMessage("正在热加载模板...")

        try:
            # 1. 重新加载配置
            self.config = get_config()

            # 2. 升级所有库的schema到最新版本（关键！）
            lm = self.config.library_manager
            upgrade_results = lm.force_upgrade_all_schemas()
            upgraded_count = sum(1 for v in upgrade_results.values() if v)
            if upgraded_count > 0:
                self.logger.info(f"热加载时已升级 {upgraded_count} 个库的schema")
                # 刷新库列表以反映变化
                self._refresh_library_list()

            # 3. 重新创建所有数据标签页
            self.tabs = {}

            for data_type, _tab_name in self._get_tab_configs():
                self.tabs[data_type] = None

            # 4. 重新应用布局
            self._apply_current_layout()

            self.logger.info("模板热加载完成！")
            self.status_bar.showMessage("模板热加载完成！")
            self.show_toast("模板热加载完成！界面已更新！", 5000)

        except Exception as e:
            self.logger.error(f"模板热加载失败: {e}", exc_info=True)
            QMessageBox.warning(self, get_i18n().t("common.error"), "模板热加载失败，建议重启程序获得最佳效果！")

    def _init_agent_brain(self):
        self.ai_bridge.init_agent_brain()

    def _toggle_digital_panel(self):
        self.ai_bridge.toggle_digital_panel()

    def open_attr_system_editor(self):
        """打开属性系统编辑器"""

        config = get_config()
        lm = config.library_manager

        # 从活跃库的 attr_system.json 加载配置
        attr_system = AttributeSystem()
        try:
            if lm.active_library:
                attr_file = Path(lm.active_library.path) / "attr_system.json"
                if attr_file.exists():
                    attr_system = AttributeSystem.from_json_file(attr_file)
                    self.logger.info(f"从 {attr_file} 加载属性系统")
                else:
                    self.logger.info("使用默认属性系统（库级别配置文件不存在）")
            else:
                self.logger.warning("没有活跃库，使用默认属性系统")
        except Exception as e:
            self.logger.warning(f"加载属性系统失败，使用默认系统: {e}")
            attr_system = AttributeSystem()

        # 打开编辑器
        editor = AttrSystemEditor(attr_system, self)
        editor.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        editor.accepted.connect(lambda e=editor, lm=lm: self._on_attr_editor_accepted(e, lm))
        editor.show()

    def _on_attr_editor_accepted(self, editor, lm):
        new_attr_system = editor.get_attr_system()
        try:
            if lm.active_library:
                attr_file = Path(lm.active_library.path) / "attr_system.json"
                new_attr_system.to_json_file(attr_file)
                self.status_bar.showMessage(f"属性系统已保存到「{lm.active_library_name}」库", 3000)
                self.logger.info(f"属性系统配置已保存到 {attr_file}")
            else:
                QMessageBox.warning(self, get_i18n().t("common.warning"), "没有活跃库，无法保存属性系统配置")
        except Exception as e:
            QMessageBox.warning(self, get_i18n().t("common.warning"), "保存属性系统失败，请检查数据格式或日志。")
            self.logger.error(f"保存属性系统失败: {e}", exc_info=True)

    def _show_quick_create(self):
        from ui.dialogs.quick_create import QuickCreateDialog
        dialog = QuickCreateDialog(self.data_manager, self)
        dialog.data_created.connect(self._on_quick_create_data)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    # ---- 帮助菜单 ----

    def _show_onboarding(self):
        """帮助 → 快速入门：重置引导区并在独立窗口中显示

        HomeWidget（快速入门 + 数据概览 + 快捷创建）属于已移除的旧三栏布局，
        主窗口内没有它的布局位置；直接显示会作为游离控件漂浮覆盖在主界面上，
        因此统一装载进一个窗口展示，关闭后重新隐藏。
        """
        home = getattr(self, 'home_widget', None)
        if home is None:
            return
        guide = home.get_guide() if hasattr(home, 'get_guide') else None
        if guide:
            guide.reset()
        dialog = getattr(self, '_onboarding_dialog', None)
        if dialog is None:
            from PyQt6.QtWidgets import QScrollArea
            dialog = QDialog(self)
            dialog.setObjectName("onboardingDialog")
            dialog.setWindowTitle("快速入门")
            screen = self.screen()
            if screen is not None:
                avail = screen.availableGeometry()
                dialog.resize(min(1060, int(avail.width() * 0.8)), min(760, int(avail.height() * 0.85)))
            else:
                dialog.resize(1060, 760)
            dialog_layout = QVBoxLayout(dialog)
            dialog_layout.setContentsMargins(0, 0, 0, 0)
            # 用滚动容器承载：内容较窄时自适应铺满，较宽时出现滚动条而不是把窗口撑爆
            scroll = QScrollArea(dialog)
            scroll.setWidgetResizable(True)
            scroll.setFrameShape(QScrollArea.Shape.NoFrame)
            scroll.setWidget(home)
            dialog_layout.addWidget(scroll)
            self._onboarding_dialog = dialog
        home.show()
        dialog.show()
        dialog.raise_()
        dialog.activateWindow()

    def _show_shortcut_reference(self):
        """帮助 → 快捷键参考"""
        from ui.shortcuts_dialog import ShortcutsDialog
        dialog = ShortcutsDialog(self)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def _show_about(self):
        """帮助 → 关于"""
        from PyQt6.QtWidgets import QMessageBox
        QMessageBox.about(self, get_i18n().t("app.about_full"),
            "<h3>墨白可视化编辑器</h3>"
            "<p>版本 1.0.0</p>"
            "<p>面向游戏开发者的数据配置与策划工具平台</p>"
            "<hr>"
            "<p style='font-size:11px; color:#888;'>"
            "内置 Agent 系统 · 属性计算引擎 · 策划书编辑器<br>"
            "支持 Unity / Unreal / Godot / Cocos2d 引擎导出</p>")

    # ---- 工具菜单 ----

    def _show_data_diff(self):
        """工具 → 数据对比"""
        from ui.dialogs.data_diff_dialog import DataDiffDialog
        dialog = DataDiffDialog(self.data_manager, self)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def _open_agent_editor(self):
        self.ai_bridge.open_agent_editor()

    def _on_team_dialog_closed(self):
        self.ai_bridge._on_team_dialog_closed()

    def _open_ai_popup(self):
        self.ai_bridge.open_ai_popup()

    def _on_quick_create_data(self, data_type, item_data):
        try:
            from config.constants import DATA_TYPE_PLURALS
            plural_key = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
            schema = self.data_manager.config.get_type_schema()
            if schema:
                for t in schema.types:
                    if t.id == data_type:
                        plural_key = t.plural_key
                        break
            self.data_manager.add_item(plural_key, item_data)
            tab = self._ensure_tab_loaded(data_type)
            if tab:
                tab.refresh_list()
                tab.current_item = item_data
                tab.form_widget.load_data(item_data)
                if hasattr(self, '_center_stack') and self._center_stack.indexOf(tab) >= 0:
                    self._center_stack.setCurrentWidget(tab)
            self.mark_data_changed()
            self.status_bar.showMessage(f"已创建: {item_data.get('name', '新数据')}", 3000)
        except Exception:
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, get_i18n().t("app.create_failed"), "创建数据时出错，请查看日志了解详情。")

    def _show_batch_edit(self):
        schema = self.data_manager.config.get_type_schema()
        if not schema or not schema.types:
            self.show_toast("当前没有可操作的数据类型", duration=2500)
            return

        type_names = [(t.id, t.name) for t in schema.types]
        items = [name for _, name in type_names]
        item, ok = QInputDialog.getItem(self, get_i18n().t("data.batch_operation"), "选择数据类型:", items, 0, False)
        if not ok:
            return
        data_type = type_names[items.index(item)][0]

        from ui.dialogs.batch_edit import BatchEditDialog
        dialog = BatchEditDialog(self.data_manager, data_type, self)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.accepted.connect(lambda dt=data_type: self._on_batch_edit_accepted(dt))
        dialog.show()

    def _on_batch_edit_accepted(self, data_type):
        tab = self._ensure_tab_loaded(data_type)
        if tab:
            tab.refresh_list()
        self.mark_data_changed()

    def _show_reference_panel(self):
        schema = self.data_manager.config.get_type_schema()
        if not schema or not schema.types:
            self.show_toast("当前没有数据", duration=2500)
            return

        type_names = [(t.id, t.name) for t in schema.types]
        items = [name for _, name in type_names]
        item, ok = QInputDialog.getItem(self, get_i18n().t("data.reference_preview"), "选择数据类型:", items, 0, False)
        if not ok:
            return
        data_type = type_names[items.index(item)][0]

        plural_key = data_type + "s"
        if schema:
            for t in schema.types:
                if t.id == data_type:
                    plural_key = t.plural_key
                    break
        data = self.data_manager.data.get(plural_key, [])
        if not data:
            self.show_toast("该类型暂无数据", duration=2500)
            return

        names = [d.get("name", "未命名") for d in data]
        name, ok = QInputDialog.getItem(self, get_i18n().t("data.reference_preview"), "选择数据项:", names, 0, False)
        if not ok:
            return
        item_id = data[names.index(name)].get("id")

        from ui.dialogs.reference_panel import ReferencePanel
        dialog = ReferencePanel(self.data_manager, data_type, item_id, self)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def _show_relation_graph(self, initial_type=None, initial_id=None):
        try:
            from ui.widgets.relation_graph import RelationTablePanel
            panel = RelationTablePanel(self.data_manager, initial_type, initial_id)
            d = QDialog(self)
            d.setFont(QFont("Microsoft YaHei", 10))
            d.setWindowTitle(get_i18n().t("data.relation_graph"))
            d.setMinimumSize(850, 650)
            layout = QVBoxLayout(d)
            layout.addWidget(panel)
            panel.jump_requested.connect(self._on_relation_jump)
            d.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            d.show()
        except Exception:
            import traceback
            traceback.print_exc()
            QMessageBox.warning(self, get_i18n().t("common.error"), "无法打开关系图，请查看日志了解详情。")

    def _on_relation_jump(self, data_type, item_id):
        """关系表中双击节点 → 跳转到对应编辑器"""
        from config.constants import DATA_TYPE_PLURALS
        plural_key = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        schema = self.data_manager.config.get_type_schema()
        if schema:
            for t in schema.types:
                if t.id == data_type:
                    plural_key = t.plural_key
                    break
        tab = self._ensure_tab_loaded(data_type)
        if tab:
            tab.refresh_list()
            tab.current_item = tab.data_manager.get_item(plural_key, item_id)
            if tab.current_item:
                tab.form_widget.load_data(tab.current_item)
                if hasattr(self, '_center_stack') and self._center_stack.indexOf(tab) >= 0:
                    self._center_stack.setCurrentWidget(tab)

    def _on_home_action(self, action_id, data_type):
        if action_id.startswith("create_") and data_type:
            self._show_quick_create_for_type(data_type)
        elif action_id == "batch_create":
            self._show_quick_create()
        elif action_id == "view_relations":
            self._show_relation_graph()
        elif action_id == "onboarding_library":
            QTimer.singleShot(50, lambda: self.tab_mgr.deferred_switch_library())
        elif action_id == "onboarding_types":
            self.tab_mgr.deferred_switch_library()
            QTimer.singleShot(200, self._tab_dropdown_open_type_editor)
        elif action_id == "onboarding_data":
            self.tab_mgr.deferred_switch_tab(0)
        elif action_id == "onboarding_ceshu":
            self.tab_mgr.deferred_switch_tab(1)
        elif action_id == "onboarding_ai":
            QTimer.singleShot(50, self.ai_bridge.toggle_digital_panel)

    def _show_quick_create_for_type(self, data_type):
        from ui.dialogs.quick_create import QuickCreateDialog
        dialog = QuickCreateDialog(self.data_manager, self)
        idx = dialog.type_combo.findData(data_type)
        if idx >= 0:
            dialog.type_combo.setCurrentIndex(idx)
        dialog.data_created.connect(self._on_quick_create_data)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()
