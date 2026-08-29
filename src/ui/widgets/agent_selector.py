"""智能体选择器 — SOLO 风格芯片式横向选择 UI 组件

横向排列所有智能体芯片，当前选中的高亮突出
"""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QWidget

from common.event_bus import EventBus
from core.agent.agents.agent_manager import AgentDefinition, AgentManager
from ui.themes import get_agent_color, theme_color


class AgentSelectorWidget(QWidget):
    agent_changed = pyqtSignal(str, AgentDefinition)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._manager = AgentManager()
        self._buttons = {}
        self.setup_ui()
        self._sync_with_manager()
        EventBus().on("theme_changed", self._on_theme_changed)

    def setup_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        label = QLabel("智能体")
        label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 12px;")
        layout.addWidget(label)

        self._chips_layout = QHBoxLayout()
        self._chips_layout.setSpacing(4)
        layout.addLayout(self._chips_layout)
        layout.addStretch()

        self._build_chips()

    def _build_chips(self):
        while self._chips_layout.count():
            item = self._chips_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self._buttons.clear()

        active_id = self._manager.active_agent_id

        for agent in self._manager.agents:
            btn = QPushButton(f"{agent.icon} {agent.name}")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setToolTip(agent.description or agent.name)
            is_active = (agent.id == active_id)
            color = get_agent_color(agent.id)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('input_bg') if not is_active else color + "22"};
                    color: {theme_color('fg') if is_active else theme_color('hint')};
                    border: 1px solid {color + "99" if is_active else theme_color('border')};
                    border-radius: 16px;
                    padding: 4px 12px;
                    font-size: 12px;
                    font-weight: {"bold" if is_active else "normal"};
                }}
                QPushButton:hover {{
                    background: {color}22;
                    border: 1px solid {color}88;
                    color: {theme_color('fg')};
                }}
            """)

            def make_handler(aid):
                return lambda: self._on_agent_selected(aid)
            btn.clicked.connect(make_handler(agent.id))
            self._buttons[agent.id] = btn
            self._chips_layout.addWidget(btn)

    def _on_agent_selected(self, agent_id: str):
        if agent_id == self._manager.active_agent_id:
            return
        self._manager.switch_agent(agent_id)
        self._build_chips()
        agent = self._manager.get_agent(agent_id)
        if agent:
            self.agent_changed.emit(agent_id, agent)

    def _sync_with_manager(self):
        self._build_chips()

    def get_active_agent(self) -> AgentDefinition:
        return self._manager.active_agent

    def refresh(self):
        self._sync_with_manager()

    def _on_theme_changed(self, theme=None, **kwargs):
        self._build_chips()
