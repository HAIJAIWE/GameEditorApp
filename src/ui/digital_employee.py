"""数字员工 — 桌面智能助手

提供两个类：
- DigitalPanel: 纯 UI 组件，可嵌入 MainWindow 使用
- DigitalEmployee: 独立窗口（含托盘/热键），通过 python -m ui.digital_employee 启动（在 src/ 目录下，或 PYTHONPATH=src）

DigitalPanel 的方法按职责拆分到 digital_panel_ui / _workspace / _tasks / _input /
_chat / _theme 六个 mixin（见 digital_panel_state.py 的共享状态声明）。
"""

from __future__ import annotations

import sys
from typing import Optional

from PyQt6.QtCore import (
    QEvent,
    QPoint,
    Qt,
    QTimer,
    pyqtSignal,
)
from PyQt6.QtGui import (
    QAction,
    QColor,
    QFont,
    QIcon,
    QKeySequence,
    QPainter,
    QPixmap,
    QShortcut,
)
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QMainWindow,
    QMenu,
    QSystemTrayIcon,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.logger import get_logger
from core.agent.workspace import get_workspace
from ui.chat_renderer import ChatRenderer
from ui.digital_employee_workers import AgentWorker
from ui.digital_panel_chat import DigitalPanelChatMixin
from ui.digital_panel_input import DigitalPanelInputMixin
from ui.digital_panel_tasks import DigitalPanelTaskMixin
from ui.digital_panel_theme import DigitalPanelThemeMixin
from ui.digital_panel_ui import DigitalPanelUIMixin
from ui.digital_panel_workspace import DigitalPanelWorkspaceMixin

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()

WINDOW_TITLE = "对话框"
WINDOW_WIDTH = 380
WINDOW_HEIGHT = 552


class DigitalPanel(
    DigitalPanelUIMixin,
    DigitalPanelWorkspaceMixin,
    DigitalPanelTaskMixin,
    DigitalPanelInputMixin,
    DigitalPanelChatMixin,
    DigitalPanelThemeMixin,
    QWidget,
):
    """数字员工面板 — 纯 UI 组件，可嵌入任意父窗口"""

    question_asked = pyqtSignal(str, list)  # 工作线程 → UI 线程弹窗

    def __init__(self, brain, parent: Optional[QWidget] = None, data_manager=None, **kwargs):
        super().__init__(parent)
        self._logger = get_logger()
        self._brain = brain
        # 初始化智能体团队管理器
        from core.agent.agents.agent_manager import AgentManager
        self._agent_manager = AgentManager()
        self.question_asked.connect(self._show_question_dialog)
        # 注册 ask_user 回调
        try:
            from core.agent.skills.ask_user_skill import AskUserSkill
            AskUserSkill.register_callback(self._on_asked_question)
            self._logger.info("[UI] ask_user 回调已注册")
        except Exception as e:
            self._logger.warning(f"[UI] ask_user 注册失败: {e}")
        self._worker: Optional[AgentWorker] = None
        self._extra: dict = {}
        if data_manager:
            self._extra["data_manager"] = data_manager
        self._cmd_popup_visible = False
        self._current_task_id: str | None = None
        self._current_conv_id: str = ""  # 当前 AI 回复的会话 ID（用于回滚）
        self._task_histories: dict[str, list[dict]] = {}
        self._general_history: list[dict] = []
        self._workspace_mgr = get_workspace()
        self._stream_buffer: list[str] = []
        self._step_id_counter = 0
        self._step_states: dict[int, bool] = {}  # step_id → expanded
        self._step_data: dict[int, dict] = {}    # step_id → {title, detail, error}

        self._renderer = ChatRenderer()

        self._setup_ui()
        self._apply_chat_theme()
        EventBus().on("theme_changed", self._on_theme_changed_panel)
        self._logger.info("DigitalPanel initialized")
        QTimer.singleShot(500, self._load_history)
    def _refresh_team_btn(self):
        """更新团队/模式按钮文字和样式"""
        mgr = self._agent_manager
        if mgr and mgr.is_team_mode():
            team = mgr.get_current_team()
            name = team.name if team else "团队"
            text = f"👥 {name} ▾"
            tip = f"团队模式 — {len(team.members) if team else 0} 名成员"
        else:
            text = "🤖 个人模式 ▾"
            tip = "个人模式 — 直接对话"
        self._team_btn.setText(text)
        self._team_btn.setToolTip(tip)
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            fg, border, accent = c['fg'], c['border'], c['accent']
        except Exception:
            fg, border, accent = '#c9d1d9', '#30363d', '#58a6ff'
        self._team_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {fg};
                border: 1px solid {border};
                border-radius: 8px;
                padding: 4px 12px;
                font-size: 13px;
            }}
            QPushButton:hover {{
                border-color: {accent}88;
                background: {accent}11;
            }}
        """)
    def _open_team_dialog(self):
        """打开团队管理对话框"""
        try:
            from ui.widgets.team_dialog import TeamDialog
            dlg = TeamDialog(self)
            if dlg.exec() == QDialog.DialogCode.Accepted:
                self._refresh_team_btn()
                mode = "team" if self._agent_manager.is_team_mode() else "solo"
                self._add_system_message(f"已切换到{'团队模式' if mode == 'team' else '个人模式'}")
        except Exception as e:
            self._add_error_message(f"团队管理出错: {e}")
            self._logger.exception("团队管理")
    def _refresh_model_btn(self):
        try:
            config = get_config()
            getattr(config, 'provider', 'OpenAI')
            model = getattr(config, 'model', 'gpt-3.5-turbo')
        except Exception:
            _provider, model = "OpenAI", "gpt-3.5-turbo"
        short_model = model[:20] + ("..." if len(model) > 20 else "")
        self._model_btn.setText(f"{short_model} ▾")
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            hint = c['hint']
            fg = c['fg']
            border = c['border']
            accent = c['accent']
            input_bg = c['input_bg']
        except Exception:
            hint, fg, border, accent, input_bg = '#8b949e', '#e8e8e8', '#30363d', '#58a6ff', '#1c2128'
        self._model_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {hint};
                border: 1px solid {border};
                border-radius: 8px;
                padding: 4px 8px;
                font-size: 14px;
            }}
            QPushButton:hover {{
                color: {fg};
                border-color: {accent};
                background: {input_bg};
            }}
        """)
    def _show_model_menu(self):
        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())
        models = [
            ("OpenAI", [
                ("gpt-3.5-turbo", "GPT-3.5 Turbo"),
                ("gpt-4", "GPT-4"),
                ("gpt-4-turbo", "GPT-4 Turbo"),
                ("gpt-4o", "GPT-4o"),
            ]),
            ("Qwen", [
                ("qwen-turbo", "Qwen Turbo"),
                ("qwen-plus", "Qwen Plus"),
                ("qwen-max", "Qwen Max"),
            ]),
            ("豆包", [
                ("ep-20240415173540-k8j54", "豆包"),
            ]),
        ]
        try:
            config = get_config()
            getattr(config, 'provider', 'OpenAI')
            current_model = getattr(config, 'model', 'gpt-3.5-turbo')
        except Exception:
            _current_provider, current_model = "OpenAI", "gpt-3.5-turbo"

        for provider_label, model_list in models:
            section = menu.addAction(provider_label)
            section.setEnabled(False)
            for model_id, model_name in model_list:
                prefix = "✓ " if (model_id == current_model) else "  "
                action = menu.addAction(f"{prefix}{model_name}")
                action.setData({"provider": provider_label.split(" ", 1)[1], "model": model_id})

                def make_handler(pid, mid):
                    return lambda: self._on_model_selected(pid, mid)
                action.triggered.connect(make_handler(
                    provider_label.split(" ", 1)[1], model_id
                ))

        pos = self._model_btn.mapToGlobal(self._model_btn.rect().bottomRight())
        pos.setX(pos.x() - menu.sizeHint().width() + self._model_btn.width())
        menu.exec(pos)
    def _on_model_selected(self, provider, model):
        try:
            config = get_config()
            if hasattr(config, '_save_api_config'):
                config.provider = provider
                config.model = model
                config._save_api_config()
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self._refresh_model_btn()
        self._add_system_message(f"已切换模型: {model}")


def _create_tray_icon_pixmap() -> QPixmap:
    pixmap = QPixmap(64, 64)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setBrush(QColor("#5a6ef5"))
    painter.setPen(Qt.PenStyle.NoPen)
    painter.drawRoundedRect(4, 4, 56, 56, 12, 12)
    painter.setPen(QColor("#ffffff"))
    font = QFont("Microsoft YaHei", 24, QFont.Weight.Bold)
    painter.setFont(font)
    painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, "AI")
    painter.end()
    return pixmap


class DigitalEmployee(QWidget):
    """数字员工独立窗口 — 带系统托盘和全局热键"""

    def __init__(self, brain=None, app: Optional[QApplication] = None):
        super().__init__()
        self._logger = get_logger()
        self._app = app

        if brain is not None:
            self._brain = brain
        else:
            from core.agent.brain import AgentBrain
            self._brain = AgentBrain(config=_APP_CONFIG)
            self._brain.boot()

        self._drag_active = False
        self._drag_click_pos: Optional[QPoint] = None
        self._drag_widget_pos: Optional[QPoint] = None

        self.setWindowTitle(WINDOW_TITLE)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.setFixedSize(WINDOW_WIDTH, WINDOW_HEIGHT)

        self.setObjectName("digitalEmployee")
        try:
            from ui.themes import get_theme_colors
            _emp_bg = get_theme_colors()['bg']
            _emp_accent = get_theme_colors()['accent']
        except Exception:
            _emp_bg = '#1e1e2e'
            _emp_accent = '#5a6ef5'
        self.setStyleSheet(f"""
            #digitalEmployee {{
                background: {_emp_bg};
                border: 2px solid {_emp_accent};
                border-radius: 12px;
            }}
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        self.panel = DigitalPanel(self._brain, self)
        self.panel.title_bar.installEventFilter(self)
        layout.addWidget(self.panel)
        self._setup_tray()
        self._position_at_bottom_right()
        self._setup_hotkey()

        self._logger.info("DigitalEmployee window initialized")

    def _setup_tray(self):
        self._tray_icon = QSystemTrayIcon(self)
        pixmap = _create_tray_icon_pixmap()
        self._tray_icon.setIcon(QIcon(pixmap))
        self._tray_icon.setToolTip(f"{WINDOW_TITLE} — 数字员工")
        self._tray_icon.activated.connect(self._on_tray_activated)
        tray_menu = QMenu()
        show_action = QAction("显示窗口", self)
        show_action.triggered.connect(self._show_from_tray)
        tray_menu.addAction(show_action)
        tray_menu.addSeparator()
        quit_action = QAction("退出", self)
        quit_action.triggered.connect(self._quit_app)
        tray_menu.addAction(quit_action)
        self._tray_icon.setContextMenu(tray_menu)
        self._tray_icon.show()

    def _on_tray_activated(self, reason: QSystemTrayIcon.ActivationReason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self._show_from_tray()

    def _minimize_to_tray(self):
        self.hide()
        self._tray_icon.showMessage(
            WINDOW_TITLE,
            "我已最小化到系统托盘，双击图标可重新打开",
            QSystemTrayIcon.MessageIcon.Information,
            2000,
        )

    def _show_from_tray(self):
        self.show()
        self.raise_()
        self.activateWindow()
        self._position_at_bottom_right()

    def _quit_app(self):
        if hasattr(self, 'panel') and hasattr(self.panel, '_worker') and self.panel._worker and self.panel._worker.isRunning():
            self.panel._worker.quit()
            self.panel._worker.wait(2000)
        self._tray_icon.hide()
        QApplication.instance().quit()

    def _setup_hotkey(self):
        try:
            import keyboard
            keyboard.add_hotkey("ctrl+shift+m", self._toggle_visibility)
            self._logger.info("Global hotkey Ctrl+Shift+M registered via keyboard library")
            self._using_keyboard_lib = True
            return
        except ImportError:
            self._logger.info("keyboard library not found, falling back to QShortcut")
            self._using_keyboard_lib = False
        self._hotkey = QShortcut(QKeySequence("Ctrl+Shift+M"), self)
        self._hotkey.setContext(Qt.ShortcutContext.ApplicationShortcut)
        self._hotkey.activated.connect(self._toggle_visibility)

    def _toggle_visibility(self):
        if self.isVisible():
            self._minimize_to_tray()
        else:
            self._show_from_tray()

    def _position_at_bottom_right(self):
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = geo.right() - WINDOW_WIDTH - 20
            y = geo.bottom() - WINDOW_HEIGHT - 20
            self.move(x, y)

    def eventFilter(self, obj, event):
        if self._event_filter_cmd_popup(obj, event):
            return True
        if self._event_filter_chat_and_workspace(obj, event):
            return True
        panel = getattr(self, 'panel', None)
        if panel and obj is panel.title_bar:
            if event.type() == QEvent.Type.MouseButtonPress:
                if event.button() == Qt.MouseButton.LeftButton:
                    self._drag_active = True
                    self._drag_click_pos = event.globalPosition().toPoint()
                    self._drag_widget_pos = self.pos()
                    return True
            elif event.type() == QEvent.Type.MouseMove:
                if self._drag_active and self._drag_click_pos is not None:
                    delta = event.globalPosition().toPoint() - self._drag_click_pos
                    if delta.manhattanLength() > 5:
                        self.move(self._drag_widget_pos + delta)
                    return True
            elif event.type() == QEvent.Type.MouseButtonRelease:
                self._drag_active = False
                self._drag_click_pos = None
                self._drag_widget_pos = None
                return True
        return super().eventFilter(obj, event)

    def closeEvent(self, event):
        event.ignore()
        self._minimize_to_tray()


class DigitalEmployeePopup(QMainWindow):
    """AI 助手独立浮窗 — 从主面板 ↗ 弹出，拥有完整的 600px+ 宽度，主题与主窗口同步"""

    def __init__(self, brain, parent=None, data_manager=None, theme_name="默认"):
        super().__init__(parent)
        self._theme_name = theme_name
        self.setWindowTitle("AI 助手")
        self.setMinimumSize(600, 648)
        self.resize(648, 752)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, False)

        self._apply_theme()

        self.panel = DigitalPanel(brain, self, data_manager=data_manager)
        self.setCentralWidget(self.panel)

        QTimer.singleShot(100, self._show_task_panel_on_open)

    def _show_task_panel_on_open(self):
        if hasattr(self.panel, '_task_panel'):
            self.panel._task_panel.expand(animated=False)
            self.panel._refresh_task_panel()

        EventBus().on("theme_changed", self._on_theme_changed)

    def _apply_theme(self):
        try:
            from ui.themes.themes import THEMES
            qss = THEMES.get(self._theme_name, "")
            if qss:
                self.setStyleSheet(qss)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _on_theme_changed(self, theme=None, **kwargs):
        if theme and theme != self._theme_name:
            self._theme_name = theme
            self._apply_theme()
            if hasattr(self.panel, '_refresh_team_btn'):
                self.panel._refresh_team_btn()


def main():
    """数字员工独立启动入口"""
    app = QApplication(sys.argv)
    app.setApplicationName(WINDOW_TITLE)
    app.setQuitOnLastWindowClosed(False)
    icon_pixmap = _create_tray_icon_pixmap()
    app.setWindowIcon(QIcon(icon_pixmap))

    window = DigitalEmployee(app=app)
    window.show()
    window.panel.send_welcome()
    window.panel.show_memory_context()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
