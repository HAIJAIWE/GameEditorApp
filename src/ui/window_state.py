from common.logger import get_logger

logger = get_logger()

import json  # noqa: E402  # 延迟导入：保持 logger 初始化后的导入顺序
from pathlib import Path  # noqa: E402  # 延迟导入：保持 logger 初始化后的导入顺序

from PyQt6.QtCore import QTime  # noqa: E402  # 延迟导入：避免模块级循环导入

from config.constants import WINDOW_TITLE  # noqa: E402  # 延迟导入：避免模块级循环导入


class WindowStateManager:

    def __init__(self, main_window, state_file: Path, config, data_manager, logger):
        self._mw = main_window
        self._state_file = state_file
        self._config = config
        self._data_manager = data_manager
        self._logger = logger

        self._has_unsaved_changes = False
        self._data_hash = None
        self._auto_save_enabled = True
        self._auto_save_interval = 300000
        self._last_save_time = QTime.currentTime()

    @property
    def has_unsaved_changes(self) -> bool:
        return self._has_unsaved_changes

    @property
    def auto_save_enabled(self) -> bool:
        return self._auto_save_enabled

    @auto_save_enabled.setter
    def auto_save_enabled(self, value: bool):
        self._auto_save_enabled = value

    @property
    def auto_save_interval(self) -> int:
        return self._auto_save_interval

    @auto_save_interval.setter
    def auto_save_interval(self, value: int):
        self._auto_save_interval = value

    def compute_data_hash(self):
        self._data_hash = self._data_manager._saved_version
        self._has_unsaved_changes = False
        self._update_window_title()

    def invalidate_cached_hash(self):
        self._data_hash = None
        self._has_unsaved_changes = False
        self._update_window_title()

    def check_data_changed(self) -> bool:
        if self._data_hash is None:
            self._data_hash = self._data_manager._saved_version
        if self._data_manager._data_version != self._data_hash:
            self._has_unsaved_changes = True
            self._update_window_title()
            return True
        self._has_unsaved_changes = False
        self._update_window_title()
        return False

    def mark_data_changed(self):
        self._has_unsaved_changes = True
        self._update_window_title()
        try:
            self._mw.status_bar.showMessage("有未保存的更改")
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _update_window_title(self):
        if self._has_unsaved_changes:
            self._mw.setWindowTitle(f"{WINDOW_TITLE} [*] 有未保存的更改")
        else:
            self._mw.setWindowTitle(WINDOW_TITLE)

    def _get_splitter_ratio(self) -> float:
        """获取当前 Splitter 中栏占比"""
        try:
            from PyQt6.QtWidgets import QSplitter
            splitter = self._mw.findChild(QSplitter, "mainSplitter")
            if splitter and splitter.count() >= 2:
                sizes = splitter.sizes()
                total = sum(sizes)
                if total > 0:
                    return round(sizes[0] / total, 4)
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return 0.75

    def should_auto_save(self) -> bool:
        if not self._auto_save_enabled:
            return False
        elapsed = self._last_save_time.msecsTo(QTime.currentTime())
        return elapsed >= self._auto_save_interval

    def reset_auto_save_timer(self):
        self._last_save_time = QTime.currentTime()

    def save_ui_state(self):
        try:
            geometry = self._mw.geometry()
            layout_mode = "three_column"
            state = {
                'window_x': geometry.x(),
                'window_y': geometry.y(),
                'window_w': geometry.width(),
                'window_h': geometry.height(),
                'is_maximized': self._mw.isMaximized(),
                'theme': getattr(self._mw, 'current_theme', "默认"),
                'layout_mode': layout_mode,
                'last_tab_index': getattr(self._mw, '_last_tab_index', 0),
                'auto_save_enabled': self._auto_save_enabled,
                'auto_save_interval': self._auto_save_interval,
                'splitter_ratio': self._get_splitter_ratio(),
            }
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception as e:
            self._logger.warning(f"保存UI状态失败: {e}")

    def restore_ui_state(self):
        if not self._state_file.exists():
            return
        try:
            state = json.loads(self._state_file.read_text(encoding='utf-8'))
            x = state.get('window_x', 100)
            y = state.get('window_y', 50)
            w = state.get('window_w', 1200)
            h = state.get('window_h', 800)
            was_max = state.get('is_maximized', False)
            if was_max:
                self._mw.showMaximized()
            else:
                self._mw.setGeometry(x, y, w, h)

            saved_theme = state.get('theme', '默认')
            from ui.themes import THEMES
            if saved_theme in THEMES:
                self._mw.current_theme = saved_theme

            self._mw.is_three_column_layout = True
            if hasattr(self._mw, '_last_tab_index'):
                self._mw._last_tab_index = state.get('last_tab_index', 0)
            self._auto_save_enabled = state.get('auto_save_enabled', True)
            self._auto_save_interval = state.get('auto_save_interval', 300000)
        except Exception as e:
            self._logger.warning(f"恢复UI状态失败: {e}")
