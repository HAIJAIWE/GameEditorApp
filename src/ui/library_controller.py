"""库管理控制器 — 从 MainWindow 中提取的库切换逻辑"""
from common.logger import get_logger

logger = get_logger()


class LibraryController:
    """管理库切换、库列表刷新等逻辑"""

    def __init__(self, main_window):
        self._mw = main_window
        self.logger = get_logger()

    def on_library_switched(self, name: str):
        """库切换回调"""
        self.logger.info(f"[库切换] 切换到: {name}")
        if not name:
            self.logger.warning("[库切换] 名称为空，跳过")
            return

        self._mw.data_manager.reload_from_library()
        self.logger.debug("[库切换] reload_from_library 完成")
        self._mw.data_manager.update_id_counters()
        self.logger.debug("[库切换] update_id_counters 完成")
        self._mw._invalidate_cached_hash()
        self.logger.debug("[库切换] _invalidate_cached_hash 完成, 调用 _reload_tabs_data...")
        self._mw._reload_tabs_data()

        if self._mw.agent_brain:
            self._mw.agent_brain._workspace.switch_workspace(name)
            self._mw.agent_brain.reload_workspace()
            try:
                if hasattr(self._mw, 'digital_panel') and self._mw.digital_panel:
                    self._mw.digital_panel.reload_for_workspace()
            except RuntimeError as e:
                logger.debug(f"操作失败: {e}")
            try:
                if hasattr(self._mw, '_ai_popup') and self._mw._ai_popup:
                    self._mw._ai_popup.panel.reload_for_workspace()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

        self._mw.library_bar_widget.refresh_library_list()
        self._mw.status_bar.showMessage(f"已切换到库「{name}」", 3000)
        self.logger.info(f"切换到库: {name}")

    def refresh_library_list(self):
        self._mw.library_bar_widget.refresh_library_list()
