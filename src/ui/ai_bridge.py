"""AI 桥接器 — 从 MainWindow 提取的 AI 大脑初始化与面板控制逻辑"""

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QMessageBox

from common.logger import get_logger


class AIBridge:
    """管理 AgentBrain 初始化、数字员工面板、AI 弹窗等"""

    def __init__(self, main_window):
        self._mw = main_window
        self.logger = get_logger()

    def init_agent_brain(self):
        """延迟初始化 AgentBrain（避免卡 UI 主线程）"""
        get_logger().enable_agent_trace()

        try:
            from core.agent.brain import AgentBrain
            from core.agent.frontend_snapshot import FrontendSnapshot
            # 构造 FrontendSnapshot 作为 brain 与 MainWindow 的解耦层
            snapshot = FrontendSnapshot(
                main_window=self._mw,
                data_manager=self._mw.data_manager,
                config=self._mw.config,
            )
            self._mw.agent_brain = AgentBrain(
                config=self._mw.config,
                main_window=self._mw,  # 向后兼容（内部自动包装为 snapshot）
                frontend_snapshot=snapshot,
            )
            self._mw.agent_brain.boot()
        except Exception as e:
            self._mw.status_bar.showMessage(f"AI 大脑初始化失败: {e}", 5000)
            import traceback
            get_logger().error(f"AgentBrain init failed: {traceback.format_exc()}")
            self._mw.agent_brain = None
            return

        if self._mw.digital_panel is not None:
            self._mw.digital_panel._brain = self._mw.agent_brain
            QTimer.singleShot(300, self._safe_load_history)
        self._mw.digital_panel._extra = {
            "main_window": self._mw,
            "data_manager": self._mw.data_manager
        }

    def _safe_load_history(self):
        """安全加载面板历史（窗口可能在延迟定时器触发前被销毁）"""
        try:
            panel = self._mw.digital_panel
            if panel is not None:
                panel._load_history()
        except (RuntimeError, AttributeError):
            pass

    def toggle_digital_panel(self):
        """切换数字员工面板显示"""
        if self._mw.digital_panel is None or not self._mw.agent_brain:
            self._mw.status_bar.showMessage("AI 大脑正在加载中，请稍候...", 2000)
            return
        if self._mw.digital_panel.isVisible():
            self._mw.digital_panel.setVisible(False)
        else:
            mw_geo = self._mw.geometry()
            panel_w = 380
            panel_h = 550
            x = mw_geo.right() - panel_w - 10
            y = mw_geo.top() + 60
            self._mw.digital_panel.setGeometry(x, y, panel_w, panel_h)
            self._mw.digital_panel.setVisible(True)
            self._mw.digital_panel.raise_()
            self._mw.digital_panel.show_memory_context()

    def open_ai_popup(self):
        """打开 AI 助手独立浮窗"""
        if hasattr(self._mw, '_ai_popup') and self._mw._ai_popup is not None:
            try:
                self._mw._ai_popup.raise_()
                self._mw._ai_popup.activateWindow()
                return
            except RuntimeError:
                self._mw._ai_popup = None
        from ui.digital_employee import DigitalEmployeePopup
        theme = getattr(self._mw, 'current_theme', '默认')
        self._mw._ai_popup = DigitalEmployeePopup(
            self._mw.agent_brain, self._mw, self._mw.data_manager, theme
        )
        self._mw._ai_popup.show()

    def open_agent_editor(self):
        """打开团队&智能体管理对话框（非模态）"""
        from ui.widgets.team_dialog import TeamDialog
        try:
            if hasattr(self._mw, '_team_dialog') and self._mw._team_dialog is not None:
                try:
                    self._mw._team_dialog.raise_()
                    self._mw._team_dialog.activateWindow()
                    return
                except RuntimeError:
                    self._mw._team_dialog = None
            self._mw._team_dialog = TeamDialog(self._mw)
            self._mw._team_dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, False)
            self._mw._team_dialog.finished.connect(self._on_team_dialog_closed)
            self._mw._team_dialog.show()
        except Exception as e:
            self.logger.error("打开团队&智能体管理对话框失败", exc_info=True)
            QMessageBox.critical(self._mw, "错误", f"无法打开管理对话框：\n{e}")

    def _on_team_dialog_closed(self):
        """团队对话框关闭回调"""
        self._mw._team_dialog = None
        if hasattr(self._mw, '_ai_digital_employee') and self._mw._ai_digital_employee is not None:
            self._mw._ai_digital_employee._refresh_team_btn()
