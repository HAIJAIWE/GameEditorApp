"""面板界面构建（头部/任务面板/状态栏/对话区/输入区） —— DigitalPanel 的 DigitalPanelUIMixin 部分

自 digital_employee.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore import (
    QSize,
    Qt,
)
from PyQt6.QtGui import (
    QTextDocument,
)
from PyQt6.QtWidgets import (
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from common.lucide_icon import get_icon
from ui.chat_renderer import ChatRenderer
from ui.digital_panel_state import DigitalPanelState
from ui.widgets.collapsible_task_panel import CollapsibleTaskPanel

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None




class DigitalPanelUIMixin(DigitalPanelState):
    """面板界面构建（头部/任务面板/状态栏/对话区/输入区）"""

    def _setup_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(4)
        self._build_header_row(root)
        self._build_status_bar(root)
        self._build_task_panel(root)
        self._build_chat_area(root)
        self._build_input_area(root)
        self._load_slash_commands()
        self._connect_task_watcher()
    def _build_header_row(self, root: QVBoxLayout):
        self._title_bar = QFrame()
        self._title_bar.setObjectName("titleBar")
        self._title_bar.setFixedHeight(28)
        self.title_bar = self._title_bar
        layout = QHBoxLayout(self._title_bar)
        layout.setContentsMargins(4, 0, 4, 0)
        layout.setSpacing(4)

        # 工作区下拉框
        ws_label = QLabel()
        try:
            from ui.themes import get_theme_colors
            _icon_hint = get_theme_colors()['hint']
        except Exception:
            _icon_hint = '#888'
        ws_label.setPixmap(get_icon("folder", _icon_hint, 16).pixmap(16, 16))
        ws_label.setFixedWidth(18)
        layout.addWidget(ws_label)

        self._workspace_combo = QComboBox()
        self._workspace_combo.setObjectName("workspaceCombo")
        self._workspace_combo.setFixedHeight(22)
        self._workspace_combo.setMinimumWidth(80)
        self._workspace_combo.setMaxVisibleItems(12)
        self._workspace_combo.setCursor(Qt.CursorShape.PointingHandCursor)
        self._workspace_combo.setToolTip("切换项目工作区 — 不同项目独立记忆和 AI 人格")
        self._workspace_combo.setStyleSheet("""
            QComboBox#workspaceCombo {
                background: palette(window);
                border: 1px solid palette(mid);
                border-radius: 4px;
                color: palette(text);
                font-size: 13px;
                padding: 2px 6px;
            }
            QComboBox#workspaceCombo:hover {
                border-color: palette(highlight);
            }
            QComboBox#workspaceCombo QAbstractItemView {
                background: palette(window);
                border: 1px solid palette(mid);
                color: palette(text);
                font-size: 13px;
                selection-background-color: palette(highlight);
            }
        """)
        self._refresh_workspace_list()
        self._workspace_combo.currentIndexChanged.connect(self._on_workspace_changed)
        # 右击列表项时弹出删除菜单（eventFilter 拦截，避免被 combo 当成左键选中）
        _view = self._workspace_combo.view()
        if _view is not None:
            _viewport = _view.viewport()
            if isinstance(_viewport, QWidget):
                _viewport.installEventFilter(self)
        layout.addWidget(self._workspace_combo)

        # 分隔
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.VLine)
        sep.setStyleSheet("color: palette(mid);")
        sep.setFixedWidth(1)
        layout.addWidget(sep)

        layout.addStretch()

        self._popout_btn = QPushButton("↗")
        self._popout_btn.setObjectName("titleBtn")
        self._popout_btn.setFixedSize(28, 28)
        self._popout_btn.setToolTip("弹出独立窗口")
        self._popout_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._popout_btn.clicked.connect(self._open_popup)
        layout.addWidget(self._popout_btn)

        self._clear_btn = QPushButton()
        try:
            from ui.themes import get_theme_colors
            _icon_hint = get_theme_colors()['hint']
        except Exception:
            _icon_hint = '#888'
        self._clear_btn.setIcon(get_icon("trash", _icon_hint, 16))
        self._clear_btn.setIconSize(QSize(16, 16))
        self._clear_btn.setFixedSize(28, 28)
        self._clear_btn.setFlat(True)
        self._clear_btn.setObjectName("titleBtn")
        self._clear_btn.setFixedSize(28, 28)
        self._clear_btn.setToolTip("清空当前对话")
        self._clear_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._clear_btn.clicked.connect(self._show_clear_menu)
        layout.addWidget(self._clear_btn)

        # 草稿保存按钮（P2：草稿保存/恢复机制）
        self._draft_btn = QPushButton()
        self._draft_btn.setIcon(get_icon("save", _icon_hint, 16))
        self._draft_btn.setIconSize(QSize(16, 16))
        self._draft_btn.setFixedSize(28, 28)
        self._draft_btn.setFlat(True)
        self._draft_btn.setObjectName("titleBtn")
        self._draft_btn.setToolTip("草稿管理（保存/恢复对话）")
        self._draft_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._draft_btn.clicked.connect(self._show_draft_menu)
        layout.addWidget(self._draft_btn)

        self.minimize_btn = QPushButton("─")
        self.minimize_btn.setObjectName("titleBtn")
        self.minimize_btn.setFixedSize(28, 28)
        self.minimize_btn.clicked.connect(self._minimize_window)
        layout.addWidget(self.minimize_btn)
        root.addWidget(self._title_bar)
    def _minimize_window(self):
        parent = self.parent()
        if isinstance(parent, QWidget):
            parent.hide()
        else:
            self.hide()
    def _build_task_panel(self, root: QVBoxLayout):
        """创建可折叠任务面板（带平滑过渡动画）"""
        self._task_panel = CollapsibleTaskPanel("任务工作区")
        self._task_panel.setObjectName("taskPanel")
        self._task_panel.setStyleSheet("""
            QWidget#taskPanel {
                background: palette(window);
                border: 1px solid palette(mid);
                border-radius: 8px;
            }
            QWidget#taskPanel QLabel {
                color: palette(text);
                background: transparent;
            }
            QWidget#collapsibleHeader {
                background: transparent;
                border: none;
                border-bottom: 1px solid palette(mid);
            }
            QWidget#collapsibleContent {
                background: transparent;
                border: none;
            }
            QScrollArea#collapsibleScrollArea {
                background: transparent;
                border: none;
            }
            QWidget#collapsibleScrollContent {
                background: transparent;
                border: none;
            }
            QScrollBar:vertical {
                background: transparent;
                width: 4px;
                margin: 0;
            }
            QScrollBar::handle:vertical {
                background: palette(mid);
                border-radius: 2px;
                min-height: 20px;
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0;
            }
        """)
        self._task_title_label = self._task_panel._title_label
        self._task_panel.set_content_height(300)

        # 初始占位
        placeholder = QLabel("暂无任务 — 尝试对 AI 说：'帮我制定一个计划'")
        self._task_placeholder = placeholder
        placeholder.setObjectName("taskPlaceholder")
        placeholder.setStyleSheet("color: palette(mid); font-size: 14px; padding: 8px;")
        placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._task_panel.content_layout.addWidget(placeholder)

        root.addWidget(self._task_panel)

        # 首次刷新
        self._refresh_task_panel()
    def _connect_task_watcher(self):
        try:
            from core.agent.skills.todo_skill import TodoWriteSkill
            TodoWriteSkill.register_callback(self._on_tasks_changed)
            from core.agent.skills.ask_user_skill import AskUserSkill
            AskUserSkill.register_callback(self._on_asked_question)
            self._logger.info("[UI] ask_user 回调已注册")
        except Exception as e:
            self._logger.warning(f"[UI] ask_user 回调注册失败: {e}")
    def _toggle_task_panel(self):
        self._task_panel.toggle()
        if self._task_panel.is_expanded:
            self._refresh_task_panel()
    def _update_task_panel_height(self):
        """根据任务数量动态更新可折叠面板的展开高度"""
        try:
            from core.agent.skills.todo_skill import TodoWriteSkill
            tasks = TodoWriteSkill.get_tasks()
        except (ImportError, AttributeError, RuntimeError):
            tasks = []
        count = max(len(tasks), 1)
        # 每行约 48px（通用对话行 + 任务行），上限 500px
        h = min(count * 48 + 60, 500)
        self._task_panel.set_content_height(h)
    def _build_status_bar(self, root: QVBoxLayout):
        """状态栏 — 显示 AI 当前活动状态"""
        self._status_bar = QFrame()
        self._status_bar.setObjectName("aiStatusBar")
        self._status_bar.setFixedHeight(0)  # 默认隐藏
        self._status_bar.setStyleSheet("""
            QFrame#aiStatusBar {
                background: transparent;
                border: none;
            }
        """)
        bar_layout = QHBoxLayout(self._status_bar)
        bar_layout.setContentsMargins(8, 0, 8, 2)
        bar_layout.setSpacing(6)

        from ui.themes import theme_color
        self._status_dot = QLabel("●")
        self._status_dot.setStyleSheet(f"font-size: 8px; color: {theme_color('accent')}; border: none; background: transparent;")
        bar_layout.addWidget(self._status_dot)

        self._status_text = QLabel("就绪")
        self._status_text.setObjectName("statusText")
        self._status_text.setStyleSheet("font-size: 11px; border: none; background: transparent;")
        bar_layout.addWidget(self._status_text)

        self._status_progress = QLabel("")
        self._status_progress.setObjectName("statusProgress")
        self._status_progress.setStyleSheet("font-size: 11px; border: none; background: transparent;")
        bar_layout.addWidget(self._status_progress)
        bar_layout.addStretch()

        root.addWidget(self._status_bar)
    def _set_status(self, text: str, progress: str = "", busy: bool = False):
        """更新状态栏显示"""
        self._status_text.setText(text)
        self._status_progress.setText(progress)
        from ui.themes import theme_color
        hint = theme_color('hint')
        accent = theme_color('accent')
        if busy:
            self._status_dot.setStyleSheet(f"font-size: 8px; color: {accent}; border: none; background: transparent;")
            self._status_text.setStyleSheet(f"font-size: 11px; color: {accent}; font-weight: 600; border: none; background: transparent;")
            self._status_progress.setStyleSheet(f"font-size: 11px; color: {hint}; border: none; background: transparent;")
            self._status_bar.setFixedHeight(22)
        else:
            self._status_dot.setStyleSheet(f"font-size: 8px; color: {accent}; border: none; background: transparent;")
            self._status_text.setStyleSheet(f"font-size: 11px; color: {hint}; border: none; background: transparent;")
            self._status_progress.setStyleSheet(f"font-size: 11px; color: {hint}; border: none; background: transparent;")
            self._status_bar.setFixedHeight(0)
    def _build_chat_area(self, root: QVBoxLayout):
        self._chat_display = QTextBrowser()
        self._chat_display.setReadOnly(True)
        self._chat_display.setOpenLinks(False)
        self._chat_display.setObjectName("chatDisplay")
        _viewport = self._chat_display.viewport()
        if isinstance(_viewport, QWidget):
            _viewport.installEventFilter(self)
        self._chat_display.setPlaceholderText("对话框已就绪 — 随时帮你处理游戏数据")
        self._chat_display.setStyleSheet("""
            QTextBrowser#chatDisplay {
                background: transparent;
                border: none;
                font-size: 15px;
                padding: 4px;
            }
            QScrollBar:vertical {
                width: 8px;
                margin: 0;
            }
            QScrollBar::handle:vertical {
                border-radius: 4px;
                min-height: 32px;
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0;
            }
        """)
        try:
            from ui.themes import get_chat_css
            css = get_chat_css()
            # 追加 Pygments 代码高亮样式
            pygments_css = ChatRenderer.get_pygments_css()
            if pygments_css:
                css += "\n" + pygments_css
            _doc = self._chat_display.document()
            if isinstance(_doc, QTextDocument):
                _doc.setDefaultStyleSheet(css)
        except Exception:
            _doc = self._chat_display.document()
            if isinstance(_doc, QTextDocument):
                _doc.setDefaultStyleSheet("")
        root.addWidget(self._chat_display, stretch=1)

        self._task_badge = QLabel()
        self._task_badge.setVisible(False)
        self._task_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._task_badge.setStyleSheet("""
            QLabel {
                background: palette(window);
                color: palette(highlight);
                border: 1px solid palette(mid);
                border-radius: 4px;
                padding: 3px 8px;
                font-size: 13px;
            }
        """)
        root.addWidget(self._task_badge)
    def _build_input_area(self, root: QVBoxLayout):
        self._cmd_popup = QListWidget()
        self._cmd_popup.setObjectName("cmdPopup")
        self._cmd_popup.setFixedHeight(160)
        self._cmd_popup.setVisible(False)
        self._cmd_popup.itemClicked.connect(self._on_cmd_selected)
        self._cmd_popup.setStyleSheet("""
            QListWidget#cmdPopup {
                background: palette(window);
                border: 1px solid palette(mid);
                border-radius: 8px;
                padding: 4px;
                color: palette(text);
                font-size: 14px;
                outline: none;
            }
            QListWidget#cmdPopup::item {
                padding: 5px 10px;
                border-radius: 4px;
            }
            QListWidget#cmdPopup::item:selected {
                background: palette(highlight);
                color: palette(highlighted-text);
            }
            QListWidget#cmdPopup::item:hover {
                background: palette(midlight);
            }
        """)
        root.addWidget(self._cmd_popup)

        compose = QFrame()
        compose.setObjectName("composeBar")
        self._compose = compose
        compose.setStyleSheet("""
            QFrame#composeBar {
                background: palette(window);
                border: 1px solid palette(mid);
                border-radius: 12px;
            }
        """)
        outer = QVBoxLayout(compose)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        top_row = QHBoxLayout()
        top_row.setContentsMargins(10, 6, 8, 2)
        top_row.setSpacing(8)

        # ── 团队/模式切换按钮 ──
        self._team_btn = QPushButton()
        self._team_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._team_btn.clicked.connect(self._open_team_dialog)
        self._refresh_team_btn()
        top_row.addWidget(self._team_btn)
        top_row.addStretch()
        outer.addLayout(top_row)

        bottom_row = QHBoxLayout()
        bottom_row.setContentsMargins(8, 4, 4, 8)
        bottom_row.setSpacing(8)

        self._input_edit = QLineEdit()
        self._input_edit.setObjectName("inputEdit")
        self._input_edit.setPlaceholderText("输入 / 查看技能... 回车发送")
        self._input_edit.setStyleSheet("""
            QLineEdit {
                background: transparent;
                color: palette(text);
                border: none;
                padding: 8px 4px;
                font-size: 14px;
                outline: none;
            }
        """)
        self._input_edit.returnPressed.connect(self._send_message)
        self._input_edit.textChanged.connect(self._on_input_changed)
        self._input_edit.installEventFilter(self)
        bottom_row.addWidget(self._input_edit, stretch=1)

        self._model_btn = QPushButton()
        self._model_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._model_btn.setToolTip("切换模型")
        self._model_btn.clicked.connect(self._show_model_menu)
        self._refresh_model_btn()
        bottom_row.addWidget(self._model_btn)

        self._send_btn = QPushButton("↑")
        self._send_btn.setFixedSize(32, 32)
        self._send_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._send_btn.setStyleSheet("""
            QPushButton {
                background: palette(window);
                color: palette(mid);
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: palette(midlight);
            }
        """)
        self._send_btn.clicked.connect(self._send_message)
        bottom_row.addWidget(self._send_btn)
        outer.addLayout(bottom_row)
        root.addWidget(compose)

        info_label = QLabel("/ 查看技能 · Enter 发送 · ■ 取消")
        self._info_label = info_label
        info_label.setStyleSheet("color: palette(mid); font-size: 14px; padding-left: 8px; margin-top: 4px;")
        root.addWidget(info_label)
    def _setup_style(self):
        """样式由父窗口 QSS 统一管理"""
        pass
    def set_embedded_mode(self, embedded: bool = True):
        """嵌入模式：样式由父窗口 QSS 统一管理"""
        pass
