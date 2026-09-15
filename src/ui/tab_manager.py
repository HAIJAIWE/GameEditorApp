"""标签页管理器 — 从 MainWindow 提取的标签页生命周期管理逻辑"""
from PyQt6.QtCore import QMetaObject, Qt, QTimer
from PyQt6.QtWidgets import QMessageBox

from common.event_bus import EventBus
from common.logger import get_logger

logger = get_logger()
from ui.ceshu import CeshuHomeView  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.data_tab import DataEditorTab  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.dialogs.startup_mode_dialog import StartupModeDialog  # noqa: E402  # 延迟导入：避免模块级循环导入
from ui.widgets.home_widget import HomeWidget  # noqa: E402  # 延迟导入：避免模块级循环导入


class TabManager:
    """管理所有数据标签页的创建、重建、延迟加载等"""

    def __init__(self, main_window):
        self._mw = main_window
        self.logger = get_logger()
        self._ceshu_type_filter: set[str] | None = None  # set of data_type IDs when ceshu is active

    # ---- 配置 ----

    def get_tab_configs(self):
        """从类型模式获取标签页配置（动态，带缓存）"""
        if self._mw._tab_configs is None:
            schema = self._mw.config.get_type_schema()
            if schema:
                configs = [(t.id, t.name) for t in schema.types]
            else:
                self.logger.warning("未找到类型模式，使用默认标签页配置")
                configs = [
                    ('job', '职业'), ('skill', '技能'), ('talent', '天赋'),
                    ('role', '角色'), ('monster', '怪物'), ('equip', '装备'),
                    ('item', '道具'), ('buff', 'Buff'),
                    ('achievement', '成就'), ('title', '称号')
                ]
            self._mw._tab_configs = configs
            self._mw._tab_config_map = {dt: name for dt, name in configs}
        return self._mw._tab_configs

    def invalidate_tab_configs(self):
        """清空标签页配置缓存"""
        self._mw._tab_configs = None
        self._mw._tab_config_map = {}
        configs = self.get_tab_configs()
        self._mw._tab_config_map = {dt: name for dt, name in configs}

    def get_data_plural_keys(self):
        """获取所有数据类型的复数键（用于数据统计）"""
        from config.constants import DATA_TYPES
        return DATA_TYPES

    # ---- 策划书上下文过滤 ----

    def set_ceshu_context(self, enabled_types: set[str]) -> None:
        """设置策划书上下文：只显示指定的数据类型

        当策划书打开时调用，filter 之外的标签页会被隐藏。
        """
        self._ceshu_type_filter = enabled_types
        self.logger.info(f"[上下文] 策划书上下文已设置: {enabled_types}")
        EventBus().emit("ceshu_context_changed")

    def clear_ceshu_context(self) -> None:
        """清除策划书上下文：恢复显示所有数据类型"""
        self._ceshu_type_filter = None
        self.logger.info("[上下文] 策划书上下文已清除")
        EventBus().emit("ceshu_context_changed")

    def is_type_allowed(self, data_type: str) -> bool:
        """检查指定数据类型在当前上下文中是否允许显示

        优先级：策划书上下文过滤 > 用户「显示类型」配置（visible_types，None=全部）
        """
        if self._ceshu_type_filter is not None:
            return data_type in self._ceshu_type_filter
        visible_types = getattr(self._mw.config, 'visible_types', None)
        if visible_types is not None:
            # None=显示全部；[]=全部隐藏；["a","b"]=只显示勾选
            return data_type in visible_types
        return True

    # ---- 生命周期 ----

    def create_tabs(self):
        """创建标签页（标记为延迟加载，不预创建所有Tab）"""
        self._mw.ceshu_home = None
        self._mw.ceshu_editor = None
        self._mw.home_widget = HomeWidget(self._mw.data_manager, parent=self._mw)
        self._mw.home_widget.action_triggered.connect(self._mw._on_home_action)

        for data_type, _tab_name in self.get_tab_configs():
            if not self.is_type_allowed(data_type):
                self.logger.debug(f"[创建] 跳过未显示类型: {data_type}")
                continue
            self._mw.tabs[data_type] = None

    def rebuild_all_tabs(self):
        """重建所有标签页（类型变更后完整销毁+重建），带防重入保护"""
        if self._mw._rebuilding:
            self.logger.debug("[重建] 已有重建在进行中，跳过重复调用")
            return
        self._mw._rebuilding = True
        self.logger.info("[重建] _rebuild_all_tabs 开始...")
        try:
            EventBus().emit("rebuild_started")
            self._mw._tab_configs = None
            self._mw.config.library_manager.reload_type_schema()
            self._mw.data_manager.rebuild_data_structure()

            try:
                if self._mw.ceshu_home is not None:
                    self._mw.ceshu_home.setParent(None)
            except (RuntimeError, AttributeError):
                if self._mw.startup_mode == StartupModeDialog.CESHU_EDITOR_MODE:
                    self._mw.ceshu_home = CeshuHomeView()
            if self._mw.ceshu_home is not None:
                # 确保信号连接（重建时可能丢失）
                try:
                    self._mw.ceshu_home.ceshu_opened.disconnect()
                except (TypeError, RuntimeError):
                    pass
                self._mw.ceshu_home.ceshu_opened.connect(self._mw._on_ceshu_opened)
                self._mw.ceshu_home._data_type = "ceshu"

            for data_type in list(self._mw.tabs.keys()):
                tab = self._mw.tabs[data_type]
                if tab is not None:
                    try:
                        tab.setParent(None)
                        tab.deleteLater()
                    except RuntimeError as e:
                        logger.debug(f"操作失败: {e}")

            self._mw.tabs.clear()

            configs = self.get_tab_configs()
            self.logger.debug(f"[重建] 标签页配置：{[(dt, name) for dt, name in configs]}")
            for data_type, tab_name in configs:
                if not self.is_type_allowed(data_type):
                    self.logger.debug(f"[重建] 跳过未显示类型: {data_type} ({tab_name})")
                    continue
                try:
                    tab = DataEditorTab(data_type, self._mw.data_manager)
                    self._mw.tabs[data_type] = tab
                    self.logger.debug(f"[重建] 创建标签页：{data_type} ({tab_name})")
                except Exception:
                    self.logger.error(f"创建标签页失败: {data_type}", exc_info=True)
        except Exception:
            self.logger.error("_rebuild_all_tabs 准备阶段异常，仍尝试重建布局", exc_info=True)
        finally:
            self.logger.debug("[重建] 调用 _apply_current_layout...")
            self._mw._apply_current_layout()
            self._mw._rebuilding = False
            self.logger.info("[重建] 完成")

    def reload_tabs_data(self):
        """库切换后销毁旧标签页并根据新库schema重建"""
        self.logger.debug("[重建] _reload_tabs_data → _rebuild_all_tabs")
        self.rebuild_all_tabs()

    def refresh_all_tabs(self):
        """刷新所有标签页"""
        for tab in self._mw.tabs.values():
            if tab is not None:
                tab.refresh_list()

        if self._mw.is_three_column_layout and hasattr(self._mw, 'data_type_combo'):
            data_type = self._mw.data_type_combo.currentData()
            if data_type:
                self._mw._update_project_list(data_type)

    def ensure_tab_loaded(self, data_type):
        """确保延迟加载的 Tab 已创建，返回 Tab 实例或 None"""
        if data_type not in self._mw.tabs:
            return None
        if self._mw.tabs[data_type] is not None:
            return self._mw.tabs[data_type]
        try:
            tab = DataEditorTab(data_type, self._mw.data_manager)
            self._mw.tabs[data_type] = tab
            return tab
        except Exception as e:
            self.logger.error(f"延迟创建Tab失败 [{data_type}]: {e}", exc_info=True)
            return None

    def _on_rebuild_needed(self):
        QMetaObject.invokeMethod(self._mw, "_deferred_rebuild", Qt.ConnectionType.QueuedConnection)

    def _deferred_rebuild(self):
        try:
            QTimer.singleShot(0, self._mw._rebuild_all_tabs)
        except Exception:
            self.logger.error("重建标签页失败，正在尝试恢复...", exc_info=True)
            QTimer.singleShot(500, self._mw._rebuild_all_tabs)

    # ---- 切换 ----

    def deferred_switch_tab(self, data_type: str):
        """延迟切换到指定数据类型的标签页"""
        if not data_type:
            return
        tab = self.ensure_tab_loaded(data_type)
        if tab and hasattr(self._mw, '_center_stack') and self._mw._center_stack.indexOf(tab) >= 0:
            self._mw._center_stack.setCurrentWidget(tab)
            self._mw.status_bar.showMessage(f"✅ AI 已切换到 {data_type} 标签页", 3000)
            self.logger.info(f"[UI] AI 切换标签页 -> {data_type}")
        else:
            self.logger.warning(f"[UI] AI 切换标签页失败：未找到 {data_type}")

    def deferred_switch_library(self, name: str):
        """延迟切换到指定库"""
        if not name:
            return
        lm = self._mw.config.library_manager
        if not lm or not lm.active_library:
            return
        if name in list(lm.libraries.keys()):
            lm.switch_library(name)
            self._mw._on_library_switched(name)

    # ---- 标签页下拉菜单 ----

    def _tab_dropdown_open_type_editor(self):
        """打开类型编辑器"""
        schema = self._mw.config.get_type_schema()
        if not schema:
            QMessageBox.warning(self._mw, "提示", "当前库的类型模式文件不存在")
            return
        from ui.dialogs.type_editor_dialog import TypeEditorDialog
        lm = self._mw.config.library_manager
        lib_name = lm.active_library_name if lm else ""
        if TypeEditorDialog.edit(schema, lib_name, self._mw):
            lm.reload_type_schema(lib_name)
            schema.save(lm.get_schema_path())
            from config.constants import reload_from_type_schema
            reload_from_type_schema(
                schema.plural_keys, schema.type_names,
                schema.type_plurals, {t.id: t.color for t in schema.types}
            )
            self.invalidate_tab_configs()
            EventBus().emit("schema_changed")
            self.rebuild_all_tabs()
