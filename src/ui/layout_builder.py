"""布局构建器 — 从 MainWindow 提取的布局构建与恢复逻辑"""
import json
import logging
from pathlib import Path

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QLabel, QSplitter, QStackedWidget, QVBoxLayout, QWidget

_diag_logger = logging.getLogger("CESHU_DIAG")
from common.logger import get_logger
from ui.ceshu import CeshuHomeView
from ui.digital_employee import DigitalPanel
from ui.themes import theme_color

logger = get_logger()


class LayoutBuilder:
    """管理主窗口的布局构建、切换、恢复"""

    def __init__(self, main_window):
        self._mw = main_window
        self.logger = get_logger()

    def apply_current_layout(self):
        """应用当前布局，带重试和恢复机制"""
        try:
            self._do_apply_current_layout()
        except Exception as e:
            self._log_crash("布局构建失败")
            self.logger.error(f"布局构建失败，尝试恢复... {e}")
            try:
                self._do_apply_current_layout()
            except Exception as e2:
                self._log_crash("布局构建再次失败")
                self.logger.error(f"布局构建再次失败，显示恢复界面 {e2}")
                self._show_recovery_layout()

    def _log_crash(self, msg: str):
        try:
            import datetime
            import traceback
            crash_path = Path("logs/crash.log")
            crash_path.parent.mkdir(exist_ok=True)
            with open(crash_path, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*60}\n{datetime.datetime.now()} - {msg}\n")
                f.write(traceback.format_exc())
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _do_apply_current_layout(self):
        """执行当前布局应用（内部方法）"""
        central_widget = self._mw.centralWidget()
        if central_widget:
            central_widget.setParent(None)
            central_widget.deleteLater()

        new_central = QWidget()
        self._mw.setCentralWidget(new_central)
        layout = QVBoxLayout(new_central)
        layout.setContentsMargins(0, 0, 0, 0)

        for tab in list(self._mw.tabs.values()):
            if tab is not None:
                tab.setParent(None)

        if hasattr(self._mw, 'ceshu_home') and self._mw.ceshu_home is not None:
            try:
                self._mw.ceshu_home.setParent(None)
            except RuntimeError as e:
                logger.debug(f"操作失败: {e}")

        if hasattr(self._mw, 'digital_panel') and self._mw.digital_panel is not None:
            try:
                self._mw.digital_panel.setParent(self._mw)
            except RuntimeError:
                self._mw.digital_panel = DigitalPanel(
                    self._mw.agent_brain, self._mw, data_manager=self._mw.data_manager
                )

        # 三栏布局：延迟到下一个事件循环，确保所有组件已初始化
        from ui.main_window import _safe_call
        QTimer.singleShot(0, lambda l=layout: _safe_call(self._build_three_column_safe, l))

        for data_type, tab in self._mw.tabs.items():
            if tab is not None:
                try:
                    tab.refresh_list()
                except RuntimeError as e:
                    logger.debug(f"操作失败: {e}")  # tab 已被 deleteLater，跳过

    def _build_three_column(self, layout):
        """两栏布局：中间(策划书全屏) | 右(AI对话框) — 老式三栏已移除"""
        _diag_logger.error(f"[DIAG===] _build_three_column: ceshu_home={self._mw.ceshu_home is not None}, digital_panel={hasattr(self._mw, 'digital_panel')}")
        outer = QSplitter(Qt.Orientation.Horizontal)
        outer.setObjectName("mainSplitter")
        outer.setChildrenCollapsible(False)
        outer.setHandleWidth(3)

        # === 中栏：策划书 QStackedWidget（首页 / 编辑器） ===
        self._mw._center_stack = QStackedWidget()
        self._mw._center_stack.setMinimumWidth(400)

        if self._mw.ceshu_home is not None:
            try:
                self._mw.ceshu_home.parent()
            except RuntimeError:
                self._mw.ceshu_home = CeshuHomeView()
        else:
            self._mw.ceshu_home = CeshuHomeView()
        try:
            self._mw.ceshu_home.ceshu_opened.disconnect()
        except (TypeError, RuntimeError):
            pass
        self._mw.ceshu_home.ceshu_opened.connect(self._mw._on_ceshu_opened)
        self._mw._center_stack.addWidget(self._mw.ceshu_home)

        import os as _os
        lib_root = _os.path.join(_os.path.dirname(__file__), "..", "..", "data", "libraries")
        library = self._mw.data_manager.get_active_library_name()
        self._mw.ceshu_home._library_root = lib_root
        self._mw.ceshu_home.load_ceshu_list(library)
        self._mw._center_stack.setCurrentWidget(self._mw.ceshu_home)

        # === 右栏：AI 对话框 ===
        right_panel = QWidget()
        right_panel.setMinimumWidth(300)
        # P3-12: 移除 setMaximumWidth(520) 硬上限，改为 QSplitter 自由调整
        # 初始比例由 _apply_splitter_ratio 控制（默认 75:25），用户可自由拖动调整
        self._mw._right_layout = QVBoxLayout(right_panel)
        self._mw._right_layout.setContentsMargins(6, 8, 8, 8)
        try:
            self._mw.digital_panel.setParent(right_panel)
        except RuntimeError:
            self._mw.digital_panel = DigitalPanel(
                self._mw.agent_brain, self._mw, data_manager=self._mw.data_manager
            )
            self._mw.digital_panel.setParent(right_panel)
        self._mw._right_layout.addWidget(self._mw.digital_panel)
        self._mw.digital_panel.setVisible(True)
        self._mw.digital_panel.show()
        if self._mw.agent_brain:
            self._mw.digital_panel._brain = self._mw.agent_brain
            self._mw.digital_panel.reload_for_workspace()
            self._mw.digital_panel.show_memory_context()

        outer.addWidget(self._mw._center_stack)
        outer.addWidget(right_panel)
        outer.setStretchFactor(0, 3)
        outer.setStretchFactor(1, 1)
        self._apply_splitter_ratio(outer)

        layout.addWidget(outer)

    def _build_three_column_safe(self, layout):
        """安全包装 _build_three_column，处理初始化顺序问题"""
        _diag_logger.error("[DIAG===] _build_three_column_safe called!")
        try:
            if not hasattr(self._mw, 'digital_panel') or self._mw.digital_panel is None:
                self._mw.digital_panel = DigitalPanel(
                    self._mw.agent_brain, self._mw, data_manager=self._mw.data_manager
                )
            self._build_three_column(layout)
        except Exception as e:
            self.logger.error(f"_build_three_column_safe 失败: {e}")

    def _apply_splitter_ratio(self, splitter: QSplitter):
        """根据持久化比例或默认 3:1 设置 Splitter 初始大小"""
        total_w = max(self._mw.width(), 900)
        ratio = self._get_saved_splitter_ratio()
        if ratio is not None:
            left_w = int(total_w * ratio)
            right_w = total_w - left_w
        else:
            left_w = int(total_w * 0.75)
            right_w = total_w - left_w
        splitter.setSizes([left_w, right_w])

    def _get_saved_splitter_ratio(self):
        """从 window_state.json 读取持久化的 Splitter 比例"""
        try:
            state_file = self._mw.config.config_dir / "window_state.json"
            if state_file.exists():
                state = json.loads(state_file.read_text(encoding='utf-8'))
                ratio = state.get('splitter_ratio')
                if ratio and 0.3 <= ratio <= 0.9:
                    return ratio
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return None

    def save_splitter_ratio(self):
        """保存当前 Splitter 比例到 window_state.json"""
        try:
            splitter = self._mw.findChild(QSplitter, "mainSplitter")
            if not splitter:
                return
            sizes = splitter.sizes()
            total = sum(sizes)
            if total > 0:
                ratio = sizes[0] / total
                state_file = self._mw.config.config_dir / "window_state.json"
                state = {}
                if state_file.exists():
                    state = json.loads(state_file.read_text(encoding='utf-8'))
                state['splitter_ratio'] = round(ratio, 4)
                state_file.parent.mkdir(parents=True, exist_ok=True)
                state_file.write_text(
                    json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8'
                )
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def handle_resize(self, event):
        """窗口缩放时保持 Splitter 比例稳定"""
        splitter = self._mw.findChild(QSplitter, "mainSplitter")
        if splitter and splitter.count() >= 2:
            splitter.setStretchFactor(0, 3)
            splitter.setStretchFactor(1, 1)

    def _show_recovery_layout(self):
        """当布局构建失败时显示恢复界面"""
        recovery = QWidget()
        layout = QVBoxLayout(recovery)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        msg = QLabel("界面加载异常，请重启应用\n\n您可以尝试点击「设置」→「界面设置」重新选择布局")
        msg.setStyleSheet(f"font-size:14px; color:{theme_color('danger')}; padding:40px;")
        msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        msg.setWordWrap(True)
        layout.addWidget(msg)
        self._mw.setCentralWidget(recovery)

    def set_layout(self, mode):
        """设置界面布局（始终使用三栏布局）"""
        self._mw.is_three_column_layout = True
        try:
            self.apply_current_layout()
            self._mw.status_bar.showMessage("已切换至三栏界面")
        except Exception as e:
            import traceback
            error_msg = f"布局切换失败 [{mode}]: {e}\n{traceback.format_exc()}"
            self.logger.critical(error_msg)
            self._mw.is_three_column_layout = True
            self.apply_current_layout()
            self._mw.status_bar.showMessage("布局切换失败，已恢复三栏")
