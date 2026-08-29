"""数字员工 — 桌面智能助手

提供两个类：
- DigitalPanel: 纯 UI 组件，可嵌入 MainWindow 使用
- DigitalEmployee: 独立窗口（含托盘/热键），通过 python ui/digital_employee.py 启动
"""

from __future__ import annotations

from datetime import datetime
import html as html_mod
from pathlib import Path
import sys
from typing import Optional

from PyQt6.QtCore import (
    QEvent,
    QPoint,
    QSize,
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
    QComboBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPushButton,
    QSystemTrayIcon,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.logger import get_logger
from common.lucide_icon import get_icon
from core.agent.workspace import get_workspace
from ui.chat_renderer import ChatRenderer
from ui.digital_employee_workers import AgentWorker
from ui.widgets.collapsible_task_panel import CollapsibleTaskPanel
from ui.widgets.task_row import TaskRowWidget

try:
    from config.settings import get_config
    _APP_CONFIG = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()

WINDOW_TITLE = "对话框"
WINDOW_WIDTH = 380
WINDOW_HEIGHT = 552



class DigitalPanel(QWidget):
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
        self._current_task_id = None
        self._current_conv_id: str = ""  # 当前 AI 回复的会话 ID（用于回滚）
        self._task_histories = {}
        self._general_history = []
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

    def _load_history(self):
        """加载并显示历史对话"""
        if not self._brain or not hasattr(self._brain, 'memory'):
            return
        history = self._brain.memory.load_recent_conversations(10)
        if not history:
            return
        for entry in history:
            self._add_user_bubble(entry.get("user", ""))
            self._add_assistant_bubble(entry.get("assistant", ""))

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
        self._workspace_combo.view().viewport().installEventFilter(self)
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
        self.minimize_btn.clicked.connect(lambda: self.parent().hide() if self.parent() else self.hide())
        layout.addWidget(self.minimize_btn)
        root.addWidget(self._title_bar)

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

    def _refresh_workspace_list(self):
        """刷新工作区下拉列表"""
        self._workspace_combo.blockSignals(True)
        self._workspace_combo.clear()
        workspaces = self._workspace_mgr.list_workspaces()
        for ws in workspaces:
            label = f" {'● ' if ws['active'] else '  '}{ws['name']}"
            self._workspace_combo.addItem(label, ws['id'])
            if ws['active']:
                self._workspace_combo.setCurrentIndex(self._workspace_combo.count() - 1)
        # 分隔 + 新建工作区
        self._workspace_combo.insertSeparator(self._workspace_combo.count())
        self._workspace_combo.addItem("  新建工作区...", "__new__")
        self._workspace_combo.blockSignals(False)

    def reload_for_workspace(self):
        self._refresh_workspace_list()
        if self._brain and hasattr(self._brain, 'reload_workspace'):
            self._brain.reload_workspace()

    def _on_workspace_changed(self, index: int):
        """切换工作区"""
        if index < 0:
            return
        ws_id = self._workspace_combo.itemData(index)
        if ws_id == "__new__":
            name, ok = QInputDialog.getText(self, "新建工作区", "工作区名称（例：新项目）:")
            if ok and name.strip():
                self._workspace_mgr.create_workspace(name.strip(), persona=f"# {name.strip()}")
                self._refresh_workspace_list()
            else:
                self._refresh_workspace_list()  # 恢复到当前工作区
            return
        if not ws_id or ws_id == self._workspace_mgr.current:
            return
        self._workspace_mgr.switch_workspace(ws_id)
        # 通知 brain 重载新工作区的记忆和身份
        if self._brain and hasattr(self._brain, 'reload_workspace'):
            self._brain.reload_workspace()
            self._chat_display.clear()
            QTimer.singleShot(100, self._load_history)
            if self._brain and hasattr(self._brain, 'memory') and hasattr(self._brain.memory, 'clear_session'):
                self._brain.memory.clear_session()
        self._refresh_workspace_list()
        self._logger.info(f"工作区已切换至: {ws_id}")

    def _on_workspace_menu(self, pos):
        """右键菜单：删除工作区"""
        combo = self._workspace_combo
        # 获取下拉列表视图中当前鼠标下的项
        view = combo.view()
        index = view.indexAt(pos)
        if not index.isValid():
            return
        ws_id = combo.itemData(index.row())
        if not ws_id or ws_id in ("__new__",):
            return
        if ws_id == "default":
            return  # 默认工作区不可删

        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())
        delete_action = menu.addAction(f"删除「{combo.itemText(index.row()).strip()}」")
        action = menu.exec(view.mapToGlobal(pos))
        if action == delete_action:
            reply = QMessageBox.question(
                self, "确认删除",
                f"确定要删除工作区「{ws_id}」吗？\n所有对话记录和策划案将被永久删除。",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply == QMessageBox.StandardButton.Yes:
                # 如果要删的是当前工作区，先切到 default
                if ws_id == self._workspace_mgr.current:
                    self._workspace_mgr.switch_workspace("default")
                    if self._brain and hasattr(self._brain, 'reload_workspace'):
                        self._brain.reload_workspace()
                ok = self._workspace_mgr.delete_workspace(ws_id)
                if ok:
                    self._refresh_workspace_list()
                    self._logger.info(f"已删除工作区: {ws_id}")
                else:
                    QMessageBox.warning(self, "删除失败",
                        f"无法删除工作区「{ws_id}」。")

    def _open_popup(self):
        theme_name = "默认"
        p = self.parent()
        while p:
            if hasattr(p, 'current_theme'):
                theme_name = p.current_theme
                break
            p = p.parent()
        popup = DigitalEmployeePopup(self._brain, self.parent(), self._extra.get("data_manager"), theme_name)
        popup.show()

    def _show_clear_menu(self):
        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())

        new_action = menu.addAction("新建对话")
        new_action.triggered.connect(self._new_chat)

        menu.addSeparator()

        clear_action = menu.addAction("清空当前对话")
        clear_action.triggered.connect(self._clear_current_chat)

        clear_all = menu.addAction("删除全部聊天记录")
        clear_all.triggered.connect(self._clear_all_history)

        pos = self._clear_btn.mapToGlobal(self._clear_btn.rect().bottomLeft())
        menu.exec(pos)

    # ── P2: 草稿管理（保存/恢复对话）──

    def _show_draft_menu(self):
        """草稿管理菜单"""
        from PyQt6.QtWidgets import QMenu
        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())

        save_action = menu.addAction("💾 保存当前对话为草稿")
        save_action.triggered.connect(self._save_draft)

        load_action = menu.addAction("📂 从草稿恢复对话")
        load_action.triggered.connect(self._load_draft)

        menu.addSeparator()

        # 列出已有草稿（最多 5 个最近的）
        drafts = self._list_drafts()
        if drafts:
            recent_menu = menu.addMenu("最近草稿")
            for d in drafts[:5]:
                action = recent_menu.addAction(f"{d['name']} ({d['time']})")
                action.triggered.connect(lambda checked, p=d['path']: self._load_draft_from(p))

        pos = self._draft_btn.mapToGlobal(self._draft_btn.rect().bottomLeft())
        menu.exec(pos)

    def _draft_dir(self):
        """草稿保存目录"""
        d = Path(__file__).resolve().parent.parent.parent / "data" / "drafts"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _save_draft(self):
        """保存当前对话为草稿"""
        import datetime
        import json

        from PyQt6.QtWidgets import QInputDialog

        # 获取草稿名
        default_name = f"对话草稿_{datetime.datetime.now().strftime('%m%d_%H%M')}"
        name, ok = QInputDialog.getText(self, "保存草稿", "草稿名称:", text=default_name)
        if not ok or not name.strip():
            return
        name = name.strip()

        # 收集对话内容
        content = self._chat_display.toHtml()
        history = list(self._general_history) if hasattr(self, '_general_history') else []

        draft = {
            "name": name,
            "time": datetime.datetime.now().isoformat(),
            "content_html": content,
            "history": history,
        }

        path = self._draft_dir() / f"{name}.json"
        try:
            path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
            self._add_system_message(f"💾 草稿已保存: {name}")
        except Exception as e:
            self._add_system_message(f"❌ 保存草稿失败: {e}")

    def _load_draft(self):
        """从草稿恢复对话"""
        from PyQt6.QtWidgets import QFileDialog
        path, _ = QFileDialog.getOpenFileName(
            self, "选择草稿文件", str(self._draft_dir()), "草稿文件 (*.json)"
        )
        if path:
            self._load_draft_from(path)

    def _load_draft_from(self, path: str):
        """从指定路径加载草稿"""
        import json
        try:
            draft = json.loads(Path(path).read_text(encoding='utf-8'))
            self._chat_display.setHtml(draft.get("content_html", ""))
            if hasattr(self, '_general_history') and draft.get("history"):
                self._general_history = list(draft["history"])
            self._add_system_message(f"📂 已恢复草稿: {draft.get('name', '未命名')}")
        except Exception as e:
            self._add_system_message(f"❌ 恢复草稿失败: {e}")

    def _list_drafts(self) -> list:
        """列出所有草稿"""
        import json
        drafts = []
        for p in self._draft_dir().glob("*.json"):
            try:
                d = json.loads(p.read_text(encoding='utf-8'))
                time_str = d.get("time", "")[:16].replace("T", " ")
                drafts.append({
                    "name": d.get("name", p.stem),
                    "time": time_str,
                    "path": str(p),
                })
            except Exception:
                continue
        drafts.sort(key=lambda x: x["time"], reverse=True)
        return drafts

    def _autosave_draft(self):
        """自动保存当前对话（每次发送后调用，覆盖式）"""
        import datetime
        import json
        try:
            content = self._chat_display.toHtml()
            history = list(self._general_history) if hasattr(self, '_general_history') else []
            draft = {
                "name": "自动草稿",
                "time": datetime.datetime.now().isoformat(),
                "content_html": content,
                "history": history,
            }
            path = self._draft_dir() / "_autosave.json"
            path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception:
            pass  # 自动保存失败不影响主流程

    def _new_chat(self):
        if self._current_task_id is not None:
            self._switch_to_general()
        self._chat_display.clear()
        self._general_history.clear()
        self._add_system_message("🆕 新对话已开始")

    def _clear_current_chat(self):
        self._chat_display.clear()
        if self._current_task_id is None:
            self._general_history.clear()
        else:
            self._task_histories.pop(self._current_task_id, None)
        self._add_system_message("当前对话已清空")

    def _clear_all_history(self):
        reply = QMessageBox.question(
            self, "确认删除",
            "确定要删除所有聊天记录吗？\n此操作不可恢复。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        self._chat_display.clear()
        self._general_history.clear()
        self._task_histories.clear()
        self._current_task_id = None
        self._update_task_badge()
        try:
            import os
            log_file = self._workspace_mgr.memory_dir / "conversation_log.jsonl"
            if log_file.exists():
                os.remove(log_file)
        except OSError as e:
            logger.warning(f"操作失败: {e}")
        try:
            if self._brain and hasattr(self._brain, 'memory'):
                self._brain.memory.clear_session()
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self._add_system_message("所有聊天记录已清除")

    def _on_tasks_changed(self, tasks):
        QTimer.singleShot(0, lambda: self._safe_invoke(self._refresh_task_panel))
        if tasks:
            QTimer.singleShot(0, lambda: self._safe_invoke(self._task_panel.expand, animated=True))

    def _safe_invoke(self, fn, *args, **kwargs):
        """安全执行 UI 延迟调用，防止无声崩溃"""
        try:
            fn(*args, **kwargs)
        except Exception as e:
            get_logger().error(f"延迟 UI 调用失败: {e}", exc_info=True)

    def _on_asked_question(self, qid: str, questions: list):
        """AI 提问回调（工作线程）→ 发射信号切到 UI 线程弹窗"""
        self.question_asked.emit(qid, questions)

    def _show_question_dialog(self, qid: str, questions: list):
        """在 UI 线程弹窗提问"""
        if not questions:
            return
        answers = []
        for q in questions:
            question = q.get("question", "请选择")
            header = q.get("header", "问题")
            options = q.get("options", [])
            answer = {}
            if options:
                items = [o.get("label", o) if isinstance(o, dict) else str(o) for o in options]
                item, ok = QInputDialog.getItem(self, header, question, items, 0, False)
                answer = {"answer": item if ok else "", "answer_label": item if ok else ""}
            else:
                text, ok = QInputDialog.getText(self, header, question)
                answer = {"answer": text if ok else "", "answer_label": text if ok else ""}
            answers.append(answer)
        # 将回答提交回 AskUserSkill
        from core.agent.skills.ask_user_skill import AskUserSkill
        AskUserSkill.answer(qid, answers)

    def _refresh_task_panel(self):
        try:
            from core.agent.skills.todo_skill import TodoWriteSkill
            tasks = TodoWriteSkill.get_tasks()
        except (ImportError, AttributeError, RuntimeError):
            tasks = []

        task_layout = self._task_panel.content_layout
        child = task_layout.takeAt(0)
        while child:
            w = child.widget()
            if w:
                w.deleteLater()
            child = task_layout.takeAt(0)

        if not tasks:
            placeholder = QLabel("暂无任务 — 尝试对 AI 说：'帮我制定一个计划'")
            placeholder.setStyleSheet("color: palette(mid); font-size: 14px; padding: 8px;")
            placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
            task_layout.addWidget(placeholder)
            self._task_panel.set_summary("")
            return

        status_icons = {"pending": "-", "in_progress": "...", "completed": "✓"}
        priority_mark = {"high": "[高]", "medium": "[中]", "low": "[低]"}
        status_order = {"in_progress": 0, "pending": 1, "completed": 2}

        pending = in_prog = done = 0
        for t in tasks:
            s = t["status"]
            if s == "pending":
                pending += 1
            elif s == "in_progress":
                in_prog += 1
            elif s == "completed":
                done += 1

        # 更新折叠态摘要
        parts = [f"{len(tasks)}个任务"]
        if in_prog:
            parts.append(f"{in_prog}个进行中")
        if done:
            parts.append(f"{done}个已完成")
        self._task_panel.set_summary(" · ".join(parts))

        # ── 通用对话行 ──
        gen_row = QFrame()
        gen_row.setCursor(Qt.CursorShape.PointingHandCursor)
        gen_layout = QHBoxLayout(gen_row)
        gen_layout.setContentsMargins(8, 6, 8, 6)
        gen_layout.setSpacing(8)
        gen_icon = QLabel("*")
        gen_icon.setFixedWidth(20)
        gen_icon.setStyleSheet("font-size: 14px; font-weight: bold; color: palette(mid);")
        gen_layout.addWidget(gen_icon)
        gen_label = QLabel("通用对话")
        self._gen_label = gen_label
        gen_label.setStyleSheet("color: palette(text); font-size: 13px;")
        gen_layout.addWidget(gen_label, stretch=1)
        is_active = self._current_task_id is None
        try:
            from ui.themes import get_theme_colors
            _tc = get_theme_colors()
            _row_bg = _tc['input_bg']
            _row_active = _tc['accent'] + '22'
            _row_active_border = _tc['accent'] + '66'
        except Exception:
            _row_bg = '#161b22'
            _row_active = '#1a3a5c'
            _row_active_border = '#2a5298'
        gen_row.setStyleSheet(f"""
            QFrame {{
                background: {_row_active if is_active else _row_bg};
                border: {'1px solid ' + _row_active_border if is_active else '1px solid transparent'};
                border-radius: 6px;
            }}
            QFrame:hover {{
                background: {_row_bg if not is_active else _row_active};
                border: 1px solid {_row_active_border};
            }}
        """)
        gen_row.mousePressEvent = lambda e: self._switch_to_general() if e.button() == Qt.MouseButton.LeftButton else None
        task_layout.addWidget(gen_row)

        # ── 任务展开行 ──
        sorted_tasks = sorted(tasks, key=lambda x: (
            status_order.get(x["status"], 99),
            {"high": 0, "medium": 1, "low": 2}.get(x["priority"], 1),
        ))

        self._task_rows = []
        for t in sorted_tasks:
            is_active = self._current_task_id == t["id"]
            row = TaskRowWidget(t, is_active)
            row.mousePressEvent = lambda e, tid=t["id"]: self._switch_to_task(tid) if e.button() == Qt.MouseButton.LeftButton else None
            row.status_changed.connect(self._on_task_status_changed)
            row.task_deleted.connect(self._on_task_deleted)
            task_layout.addWidget(row)
            self._task_rows.append(row)

        self._update_task_panel_height()

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
        self._chat_display.viewport().installEventFilter(self)
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
            self._chat_display.document().setDefaultStyleSheet(css)
        except Exception:
            self._chat_display.document().setDefaultStyleSheet("")
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

    def _record_bubble(self, entry: dict):
        """记录气泡（格式化状态，非 HTML）"""
        if self._current_task_id is None:
            self._general_history.append(entry)
        else:
            hist = self._task_histories.setdefault(self._current_task_id, [])
            hist.append(entry)

    def _switch_to_task(self, task_id: str):
        if self._current_task_id == task_id:
            return
        self._current_task_id = task_id
        self._rebuild_chat()
        self._update_task_badge()

    def _switch_to_general(self):
        if self._current_task_id is None:
            return
        self._current_task_id = None
        self._rebuild_chat()
        self._update_task_badge()

    def _on_task_status_changed(self, task_id: str, new_status: str):
        """响应 TaskRowWidget 状态变更信号"""
        if not self._brain:
            return
        self._brain.execute_tool("system.todo", {
            "action": "update",
            "item_id": task_id,
            "item_status": new_status,
        })
        self._refresh_task_panel()

    def _on_task_deleted(self, task_id: str):
        """响应 TaskRowWidget 删除信号"""
        if not self._brain:
            return
        self._brain.execute_tool("system.todo", {
            "action": "delete",
            "item_id": task_id,
        })
        self._refresh_task_panel()

    def _update_task_badge(self):
        if self._current_task_id:
            try:
                from core.agent.skills.todo_skill import TodoWriteSkill
                tasks = TodoWriteSkill.get_tasks()
                for t in tasks:
                    if t["id"] == self._current_task_id:
                        self._task_badge.setText(f"当前任务: {t['content'][:30]}")
                        self._task_badge.setVisible(True)
                        return
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        self._task_badge.setVisible(False)

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
            provider = getattr(config, 'provider', 'OpenAI')
            model = getattr(config, 'model', 'gpt-3.5-turbo')
        except Exception:
            provider, model = "OpenAI", "gpt-3.5-turbo"
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
            current_provider = getattr(config, 'provider', 'OpenAI')
            current_model = getattr(config, 'model', 'gpt-3.5-turbo')
        except Exception:
            current_provider, current_model = "OpenAI", "gpt-3.5-turbo"

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

    def _on_input_changed(self, text: str):
        if text.startswith("/"):
            parts = text.split(" ")
            prefix = parts[0].lower() if len(parts) > 0 else text.lower()
            self._cmd_popup.clear()
            if hasattr(self, '_slash_commands'):
                matches = [(c, d) for c, d in self._slash_commands if c.lower().startswith(prefix)]
                if matches:
                    for cmd, desc in matches:
                        self._cmd_popup.addItem(f"{cmd}  —  {desc}")
                    self._cmd_popup.setVisible(True)
                    self._cmd_popup.setFixedHeight(min(len(matches) * 28 + 8, 160))
                    self._cmd_popup_visible = True
                else:
                    self._cmd_popup.setVisible(False)
                    self._cmd_popup_visible = False
            else:
                self._cmd_popup.setVisible(False)
                self._cmd_popup_visible = False
        else:
            self._cmd_popup.setVisible(False)
            self._cmd_popup_visible = False

    def _on_cmd_selected(self, item):
        cmd = item.text().split("  —")[0].strip()
        self._input_edit.setText(cmd + " ")
        self._input_edit.setFocus()
        self._cmd_popup.setVisible(False)
        self._cmd_popup_visible = False

    def _load_slash_commands(self):
        commands = [
            ("/create <类型> <名称>", "创建角色/怪物/技能等"),
            ("/update <字段> <值>", "修改当前条目属性"),
            ("/delete", "删除当前条目"),
            ("/search <关键词>", "搜索条目"),
            ("/switch <数据类型>", "切换标签页"),
            ("/check", "检查数据一致性"),
            ("/batch <操作>", "批量修改数据"),
            ("/export", "导出当前数据"),
            ("/help", "查看可用指令"),
            ("/write <文件>", "写文件"),
            ("/read <文件>", "读文件"),
            ("/code <描述>", "生成代码"),
            ("/shell <命令>", "执行命令"),
            ("/chat <内容>", "自由对话"),
        ]
        try:
            brain = self._brain
            registry = getattr(brain, 'registry', None)
            if registry and hasattr(registry, 'list_skills'):
                for s in registry.list_skills:
                    name = s.get("name", "")
                    desc = s.get("description", "")[:30]
                    if name:
                        commands.append((f"/{name}", desc))
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self._slash_commands = commands

    def _event_filter_cmd_popup(self, obj, event):
        if obj is self._input_edit and self._cmd_popup_visible and self._cmd_popup.count() > 0:
            if event.type() == QEvent.Type.KeyPress:
                key = event.key()
                if key == Qt.Key.Key_Down:
                    row = self._cmd_popup.currentRow()
                    row = (row + 1) % self._cmd_popup.count()
                    self._cmd_popup.setCurrentRow(row)
                    return True
                elif key == Qt.Key.Key_Up:
                    row = self._cmd_popup.currentRow()
                    row = (row - 1) % self._cmd_popup.count()
                    self._cmd_popup.setCurrentRow(row)
                    return True
                elif key == Qt.Key.Key_Return or key == Qt.Key.Key_Enter:
                    item = self._cmd_popup.currentItem()
                    if item:
                        self._on_cmd_selected(item)
                        return True
                elif key == Qt.Key.Key_Escape:
                    self._cmd_popup.setVisible(False)
                    self._cmd_popup_visible = False
                    return True
        return False

    def _gather_editor_context(self) -> dict:
        """收集当前编辑器上下文，让 AI 感知界面状态"""
        ctx = {"visible": True}
        mw = self._extra.get("main_window") if self._extra else None
        if not mw:
            return ctx

        # 布局模式
        if getattr(mw, 'is_three_column_layout', False):
            ctx["layout"] = "三栏布局（左列表|中编辑|右对话）"
        elif getattr(mw, 'tab_widget', None):
            ctx["layout"] = "标签页布局"

        # 当前活跃标签页
        if hasattr(mw, 'tab_widget') and mw.tab_widget:
            idx = mw.tab_widget.currentIndex()
            if idx >= 0:
                ctx["current_tab"] = mw.tab_widget.tabText(idx)

        # 可用数据类型
        if hasattr(mw, 'data_type_combo'):
            combo = mw.data_type_combo
            ctx["data_types"] = [combo.itemText(i) for i in range(min(combo.count(), 12))]

        # 三栏/左右栏模式下的项目列表
        if hasattr(mw, 'project_list') and mw.project_list:
            items = []
            for i in range(min(mw.project_list.count(), 10)):
                item = mw.project_list.item(i)
                if item:
                    items.append(item.text())
            if items:
                ctx["project_list"] = items

        # 当前编辑项
        if hasattr(mw, 'current_editor') and mw.current_editor:
            editor = mw.current_editor
            if hasattr(editor, 'current_item') and editor.current_item:
                item = editor.current_item
                ctx["current_item"] = {
                    "id": item.get("id", "?"),
                    "name": item.get("name", "?"),
                    "type": getattr(editor, 'data_type', '?'),
                }

        # 数据概览
        dm = self._extra.get("data_manager") if self._extra else None
        if dm and dm.data:
            stats = {k: len(v) for k, v in dm.data.items() if isinstance(v, list)}
            if stats:
                ctx["data_stats"] = stats

        return ctx

    def _send_message(self):
        self._cmd_popup.setVisible(False)
        self._cmd_popup_visible = False
        if self._worker and self._worker.isRunning():
            self._cancel_worker()
            return

        user_text = self._input_edit.text().strip()
        if not user_text:
            return
        self._input_edit.clear()
        self._input_edit.setEnabled(False)
        self._add_user_bubble(user_text)

        from ui.themes import theme_color
        self._send_btn.setText("■")
        self._send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('danger')};
                color: {theme_color('danger_hover')};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {theme_color('danger_hover')};
                color: {theme_color('btn_text')};
            }}
        """)
        self._add_thinking_indicator()

        extra = dict(self._extra) if self._extra else {}
        extra["editor_context"] = self._gather_editor_context()

        # 生成会话 ID，用于操作回滚
        import uuid
        self._current_conv_id = uuid.uuid4().hex[:12]
        extra["_conv_id"] = self._current_conv_id

        self._worker = AgentWorker(self._brain, user_text, extra=extra)
        self._worker.progress.connect(self._on_progress)
        self._worker.finished.connect(self._on_finished)
        self._worker.start()

    def _on_progress(self, event_type: str, data: dict):
        try:
            if event_type == "plan_ready":
                intent = data.get("intent", "")
                confidence = data.get("confidence", 0)
                steps = data.get("steps", 0)
                text = f"解析意图：「{intent}」（置信度 {confidence:.0%}，共 {steps} 步）"
                self._add_system_message(text)
                self._set_status("分析中...", f"共 {steps} 步", busy=True)

            elif event_type == "step_start":
                # 上一步若还有缓冲，先出面板
                if self._stream_buffer and len(self._stream_buffer) > 1:
                    self._flush_stream_step()
                tool = data.get("tool", "工具")
                order = data.get("order", 0)
                reason = data.get("reason", "")
                self._stream_buffer = [f"[{tool}]\n"]
                self._step_id_counter += 1
                step_info = f"步骤 {order}: {tool}"
                if reason:
                    step_info += f" — {reason[:40]}"
                self._set_status(step_info, busy=True)

            elif event_type == "stream_chunk":
                text = data.get("text", "")
                self._stream_buffer.append(text)
                self._set_status("LLM 生成中...", busy=True)

            elif event_type == "stream_done":
                if self._stream_buffer:
                    detail = "".join(self._stream_buffer)
                    self._add_collapsible_step("思考", detail, self._step_id_counter)
                    self._stream_buffer = []

            elif event_type == "step_done":
                tool = data.get("tool", "工具")
                result = data.get("result", "")
                detail = "".join(self._stream_buffer) if self._stream_buffer else ""
                if detail:
                    detail += f"\n\n→ {result}"
                else:
                    detail = f"→ {result}"
                self._add_collapsible_step(f"{tool}", detail, self._step_id_counter)
                self._stream_buffer = []
                self._set_status(f"✓ {tool} 完成", busy=False)

            elif event_type == "step_error":
                error = data.get("error", "未知错误")
                detail = "".join(self._stream_buffer) if self._stream_buffer else error
                self._add_collapsible_step("失败", detail, self._step_id_counter, error=True)
                self._stream_buffer = []
                self._set_status(f"✗ 出错: {error[:30]}", busy=False)
        except Exception as e:
            import traceback
            print(f"[_on_progress ERROR] {e}")
            traceback.print_exc()


    def _on_finished(self, result: dict):
        self._restore_send_button()
        self._remove_thinking_indicator()
        self._input_edit.setEnabled(True)
        self._input_edit.setFocus()
        self._set_status("就绪", busy=False)
        if result.get("success"):
            msg = self._format_results(result.get("results", {}))
            if msg:
                if result.get("has_plan"):
                    self._add_plan_bubble(msg)
                else:
                    self._add_assistant_bubble(msg)
        else:
            error = result.get("error", "未知错误")
            self._add_error_message(f"任务失败：{error}")
        # P2: AI 回复完成后自动保存草稿
        self._autosave_draft()

    def _add_plan_bubble(self, plan_text: str):
        """显示方案气泡，带执行按钮提示"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        import markdown
        md_html = markdown.markdown(plan_text, extensions=['fenced_code', 'nl2br', 'sane_lists'])
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            c = get_theme_colors()
            dark = is_dark_theme()
            plan_accent = '#f59e0b' if dark else '#d97706'
            plan_bg = c['input_bg']
            plan_hint = c['hint']
        except Exception:
            dark = True
            plan_accent = '#f59e0b'
            plan_bg = '#292524'
            plan_hint = '#888'
        full_html = f'''
        <div style="margin:8px 0;display:flex;justify-content:flex-start;">
            <div style="max-width:85%;">
                <div style="color:{plan_accent};font-weight:bold;font-size: 14px;">分析方案 ({timestamp})</div>
                <div style="background:{plan_bg};color:inherit;padding:12px 16px;border-radius:12px 12px 12px 4px;
                            border:2px solid {plan_accent};margin-top:4px;font-size: 14px;line-height:1.5;">
                    {md_html}
                </div>
                <div style="margin-top:8px;font-size: 14px;color:{plan_hint};">
                    回复「<b style="color:{plan_accent};">执行</b>」开始实施 | 回复「<b>修改xxx</b>」调整方案
                </div>
            </div>
        </div>'''
        self._chat_display.append(full_html)
        self._record_bubble(full_html)
        self._scroll_to_bottom()

    def _format_results(self, results: dict) -> str:
        """提取技能返回的可读消息，跳过空结果"""
        if not results:
            return ""
        for step_order in sorted(results.keys()):
            data = results[step_order]
            # 优先取 message 字段（技能返回的格式化文本）
            if isinstance(data, dict) and data.get("message"):
                msg = data["message"]
                # 去掉消息中的 "暂无数据" 之类空结果
                if msg == "暂无数据":
                    return "暂无匹配数据"
                return msg
            if isinstance(data, str):
                return data[:2000]
        return ""

    def _is_dark_mode(self) -> bool:
        """从聊天框背景判断当前是否为深色模式"""
        bg = self._chat_display.palette().window().color()
        return (bg.red() + bg.green() + bg.blue()) / 3 < 128

    def _add_user_bubble(self, text: str):
        ts = datetime.now().strftime("%H:%M:%S")
        html = self._renderer.render_user_bubble(text, ts)
        self._chat_display.append(html)
        self._record_bubble({"type": "user", "text": text, "timestamp": ts})
        self._scroll_to_bottom()

    def _add_assistant_bubble(self, text: str):
        ts = datetime.now().strftime("%H:%M:%S")
        html = self._renderer.render_assistant_bubble(text, ts, self._current_conv_id)
        self._chat_display.append(html)
        self._record_bubble({"type": "assistant", "text": text, "timestamp": ts,
                             "conv_id": self._current_conv_id})
        self._scroll_to_bottom()

    def _add_system_message(self, text: str):
        html = self._renderer.render_system_message(text)
        self._chat_display.append(html)
        self._record_bubble({"type": "system", "text": text})
        self._scroll_to_bottom()

    def _add_error_message(self, text: str):
        html = self._renderer.render_error_message(text)
        self._chat_display.append(html)
        self._record_bubble({"type": "error", "text": text})
        self._scroll_to_bottom()

    def _scroll_to_bottom(self):
        sb = self._chat_display.verticalScrollBar()
        if sb:
            try:
                QTimer.singleShot(60, lambda: sb.setValue(sb.maximum()))
            except RuntimeError as e:
                logger.debug(f"滚动条设置失败: {e}")

    def _add_collapsible_step(self, title: str, detail: str, step_id: int, error: bool = False):
        """添加可折叠步骤 — 用 <a> 锚点实现可靠点击展开/收起"""
        self._step_data[step_id] = {"title": title, "detail": detail, "error": error}
        is_expanded = self._step_states.get(step_id, False)
        html = self._renderer.render_collapsible_step(
            title, detail, step_id, is_expanded, error
        )
        self._chat_display.append(html)
        self._scroll_to_bottom()

    def _rebuild_chat(self):
        """重建聊天显示 — 用渲染器重新渲染所有气泡和步骤块"""
        if self._current_task_id:
            history = list(self._task_histories.get(self._current_task_id, []))
        else:
            history = list(self._general_history)

        self._chat_display.clear()

        for entry in history:
            html = self._renderer.render_entry(entry)
            self._chat_display.append(html)

        for step_id in sorted(self._step_data.keys()):
            data = self._step_data[step_id]
            is_expanded = self._step_states.get(step_id, False)
            html = self._renderer.render_collapsible_step(
                data["title"], data["detail"], step_id,
                is_expanded, error=data.get("error", False)
            )
            self._chat_display.append(html)

        self._scroll_to_bottom()

    def _flush_stream_step(self):
        """强制输出当前缓冲的步骤为折叠面板"""
        if not self._stream_buffer:
            return
        detail = "".join(self._stream_buffer)
        self._add_collapsible_step("执行", detail, self._step_id_counter)
        self._stream_buffer = []

    def _rollback_conversation(self, conv_id: str):
        """回滚指定会话的所有数据操作"""
        dm = self._extra.get("data_manager") if self._extra else None
        if not dm:
            self._add_system_message("回滚失败：无法获取数据管理器")
            return
        try:
            from core.operation_log import OperationLog
            count, errors = OperationLog.rollback_conversation(conv_id, dm)
            if count > 0:
                self._add_system_message(f"↩ 已回退 {count} 项操作（此对话的所有修改已撤销）")
                if errors:
                    self._add_error_message("部分回滚失败:\n" + "\n".join(errors))
                # 刷新编辑器
                mw = self._extra.get("main_window") if self._extra else None
                if mw and hasattr(mw, 'on_data_changed'):
                    mw.on_data_changed()
            else:
                self._add_system_message("此对话没有可回退的数据操作")
        except Exception as e:
            self._add_error_message(f"回滚失败: {e}")
            self._logger.exception("回滚异常")

    def _event_filter_chat_and_workspace(self, obj, event):
        # 聊天区视图点击：检测锚点（可折叠步骤 + 回滚链接）
        if hasattr(self, '_chat_display') and obj == self._chat_display.viewport():
            if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.LeftButton:
                cursor = self._chat_display.cursorForPosition(event.pos())
                fmt = cursor.charFormat()
                if fmt.isAnchor():
                    href = fmt.anchorHref()
                    # 可折叠步骤
                    if href.startswith("step://toggle/"):
                        try:
                            step_id = int(href.split("/")[-1])
                        except ValueError:
                            return False
                        current = self._step_states.get(step_id, False)
                        self._step_states[step_id] = not current
                        self._rebuild_chat()
                        return True
                    # 对话回滚
                    if href.startswith("conv://rollback/"):
                        conv_id = href.split("/")[-1]
                        self._rollback_conversation(conv_id)
                        return True
        # 工作区下拉列表右键
        if hasattr(self, '_workspace_combo') and obj == self._workspace_combo.view().viewport():
            if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.RightButton:
                self._on_workspace_menu(event.pos())
                return True
        return False

    def _cancel_worker(self):
        if self._worker and self._worker.isRunning():
            self._worker.terminate()
            self._worker.wait(2000)
        self._restore_send_button()
        self._remove_thinking_indicator()
        self._input_edit.setEnabled(True)
        self._input_edit.setFocus()
        self._add_system_message("已取消")

    def _restore_send_button(self):
        self._send_btn.setText("↑")
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            btn_bg = c['input_bg']
            hint = c['hint']
            border = c['border']
        except Exception:
            btn_bg, hint, border = '#21262d', '#484f58', '#30363d'
        self._send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {btn_bg};
                color: {hint};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {border};
            }}
        """)

    def _add_thinking_indicator(self):
        self._thinking_id = f"thinking_{datetime.now().timestamp()}"
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            c = get_theme_colors()
            dark = is_dark_theme()
            skel_bg = c['input_bg']
            skel_fg = c['border']
            skel_mid = c['bg']
            think_color = c.get('accent', '#7ee787')
        except Exception:
            dark = True
            skel_bg, skel_fg, skel_mid, think_color = '#161b22', '#30363d', '#21262d', '#7ee787'
        html = f'''
        <div id="{self._thinking_id}" style="margin:8px 0;display:flex;justify-content:flex-start;">
            <div style="max-width:82%;">
                <div style="color:{think_color};font-size: 14px;margin-bottom:4px;">思考中...</div>
                <div class="skeleton-block" style="background:{skel_bg};border:1px solid {skel_fg};
                    border-radius:16px 16px 16px 4px;padding:12px 16px;min-height:36px;">
                    <div class="skeleton-line" style="height:12px;margin:4px 0;
                        background:linear-gradient(90deg,{skel_mid} 25%,{skel_fg} 50%,{skel_mid} 75%);
                        border-radius:8px;background-size:200% 100%;
                        animation:skeleton-shimmer 1.5s ease-in-out infinite;"></div>
                    <div class="skeleton-line" style="height:12px;margin:4px 0;width:75%;
                        background:linear-gradient(90deg,{skel_mid} 25%,{skel_fg} 50%,{skel_mid} 75%);
                        border-radius:8px;background-size:200% 100%;
                        animation:skeleton-shimmer 1.5s ease-in-out 0.2s infinite;"></div>
                    <div class="skeleton-line" style="height:12px;margin:4px 0;width:50%;
                        background:linear-gradient(90deg,{skel_mid} 25%,{skel_fg} 50%,{skel_mid} 75%);
                        border-radius:8px;background-size:200% 100%;
                        animation:skeleton-shimmer 1.5s ease-in-out 0.4s infinite;"></div>
                </div>
            </div>
        </div>
        <style>
            @keyframes skeleton-shimmer {{
                0% {{ background-position: 200% 0; }}
                100% {{ background-position: -200% 0; }}
            }}
        </style>
        '''
        self._chat_display.append(html)
        self._scroll_to_bottom()

    def _remove_thinking_indicator(self):
        try:
            cursor = self._chat_display.textCursor()
            cursor.movePosition(cursor.MoveOperation.End)
            doc = self._chat_display.document()
            if doc:
                last_block = doc.findBlockByLineNumber(doc.blockCount() - 1)
                if last_block.isValid():
                    block_text = last_block.text()
                    if "思考中" in block_text or "skeleton" in block_text or "shimmer" in block_text:
                        cursor.movePosition(cursor.MoveOperation.StartOfBlock, cursor.MoveMode.KeepAnchor)
                        cursor.removeSelectedText()
                        cursor.deletePreviousChar()
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def show_memory_context(self):
        """在对话区顶部显示个性化记忆提示"""
        try:
            brain = self._brain
            memory = brain.memory
            learner = brain.learner
            hints = []

            try:
                from ui.themes import get_theme_colors
                c = get_theme_colors()
                _accent = c['accent']
                _hint = c['hint']
                _fg = c['fg']
                _success = c.get('success_color', '#a5d6a7')
                _info = c.get('info_color', _accent)
            except Exception:
                _accent = '#58a6ff'
                _hint = '#8b949e'
                _fg = '#c9d1d9'
                _success = '#a5d6a7'
                _info = '#a0b0f0'

            editor = memory.get_preference("code_editor")
            if editor:
                hints.append(
                    f'<span style="color:{_info};">我注意到你习惯用 </span>'
                    f'<b style="color:{_accent};">{html_mod.escape(editor)}</b>'
                    f'<span style="color:{_info};">，需要我帮你适配编辑器设置吗？</span>'
                )
            lang = memory.get_preference("language")
            if lang:
                hints.append(
                    f'<span style="color:{_info};">偏好语言：</span>'
                    f'<b style="color:{_accent};">{html_mod.escape(lang)}</b>'
                )
            archive = memory.get_preference("archive_dir")
            if archive:
                hints.append(
                    f'<span style="color:{_info};">常用目录：</span>'
                    f'<b style="color:{_success};">{html_mod.escape(archive)}</b>'
                )
            personalized = learner.get_personalized_prompt()
            if personalized:
                for line in personalized.split("\n"):
                    if line.strip():
                        hints.append(
                            f'<span style="color:{_hint};">{html_mod.escape(line.strip())}</span>'
                        )
            habits = learner.get_habits()
            if habits.get("frequent_actions"):
                actions = ", ".join(a["action"] for a in habits["frequent_actions"][:3])
                hints.append(
                    f'<span style="color:{_info};">常用操作：</span>'
                    f'<b style="color:{_accent};">{html_mod.escape(actions)}</b>'
                )
            last_result = memory.get_short_term("last_result")
            if last_result and isinstance(last_result, dict):
                intent_name = last_result.get("intent", "")
                if last_result.get("success"):
                    hints.append(
                        f'<span style="color:{_success};">上次任务「{html_mod.escape(str(intent_name))}」已成功完成。</span>'
                    )
            if hints:
                # 容器背景色跟随主题
                _container_bg = _accent + '14'   # accent @ 8% opacity
                _container_border = _accent + '33'  # accent @ 20% opacity
                html = (
                    f'<div style="margin:8px;padding:12px;'
                    f'background:{_container_bg};'
                    f'border:1px solid {_container_border};'
                    f'border-radius:8px;font-size: 14px;line-height:1.7;">'
                    + "<br>".join(hints)
                    + "</div>"
                )
                self._chat_display.append(html)
        except Exception as e:
            self._logger.warning(f"Failed to show memory context: {e}")

    def send_welcome(self):
        """显示欢迎消息 — 动态读取已注册技能"""
        self._add_system_message(f"对话框已启动 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

        # 从 AgentBrain 读取已注册的技能列表
        skill_descriptions = {
            "game_data": "🆕 创建/修改/删除游戏数据条目",
            "planning": "创建/编辑策划方案文档",
            "code": "生成/调试/解释代码",
            "shell": "执行命令行/终端操作",
            "file_ops": "读写文件、目录操作",
            "web_search": "联网搜索信息",
            "search": "搜索文件/查找内容",
            "clipboard": "剪贴板操作",
            "schedule": "定时任务/提醒",
            "data_analyze": "数据分析/统计",
        }

        try:
            brain = self._brain
            registry = getattr(brain, 'registry', None)
            if registry and hasattr(registry, 'list_skills'):
                skills = registry.list_skills
                if skills:
                    tips_lines = []
                    for s in skills:
                        name = s.get("name", "")
                        # 映射技能名到友好的描述
                        for key, desc in skill_descriptions.items():
                            if key in name:
                                tips_lines.append(f"{desc}")
                                break
                    tips = "\n".join(tips_lines[:8])
                    self._add_system_message(tips)
                    return
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        # 兜底：静态欢迎
        tips = (
            "🆕 创建数据：帮我创建一个火系法师\n"
            "修改数据：把攻击力改成200\n"
            "删除数据：删除这个条目\n"
            "写代码：帮我写个导出脚本\n"
            "执行命令：执行 python app.py\n"
            "读写文件：帮我看看 data 目录\n"
            "策划方案：创建一个仙侠策划案"
        )
        self._add_system_message(tips)

    def _theme_menu_qss(self) -> str:
        """返回跟随主题的菜单 QSS"""
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            bg = c.get('menu_bg', c['input_bg'])
            fg = c['fg']
            border = c['border']
            sel = c['input_bg']
            accent = c['accent']
        except Exception:
            bg, fg, border, sel, accent = '#fff', '#000', '#ccc', '#eee', '#5a6ef5'
        return f"""
            QMenu {{
                background: {bg};
                border: 1px solid {border};
                border-radius: 8px;
                padding: 4px;
            }}
            QMenu::item {{
                padding: 8px 16px;
                border-radius: 4px;
                color: {fg};
                font-size: 14px;
            }}
            QMenu::item:selected {{
                background: {sel};
                color: {accent};
            }}
            QMenu::separator {{
                height: 1px;
                background: {border};
                margin: 4px 8px;
            }}
        """

    def _apply_chat_theme(self):
        """应用主题感知的聊天显示 + 输入区 + workspace 样式

        拆分为 6 个子方法以提升可维护性：
        - _apply_chat_display_theme: 聊天显示区
        - _apply_workspace_combo_theme: 工作区下拉框
        - _apply_task_labels_theme: 任务面板标题/统计/placeholder
        - _apply_input_area_theme: 输入框容器/输入框/发送按钮/提示标签
        - _apply_task_panel_theme: 任务面板（CollapsibleTaskPanel 与普通分支）
        - _apply_misc_widgets_theme: 命令弹窗/任务标记/模型按钮
        """
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            colors = get_theme_colors()
            dark = is_dark_theme()
            self._apply_chat_display_theme(colors)
            self._apply_workspace_combo_theme(colors)
            self._apply_task_labels_theme(colors)
            self._apply_input_area_theme(colors, dark)
            self._apply_task_panel_theme(colors)
            self._apply_misc_widgets_theme(colors)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _apply_chat_display_theme(self, colors):
        """聊天显示区 QSS（QTextBrowser + 滚动条）"""
        from ui.themes import get_chat_css
        bg = colors['bg']
        fg = colors['fg']
        border = colors['border']
        self._chat_display.setStyleSheet(f"""
            QTextBrowser#chatDisplay {{
                background: {bg};
                color: {fg};
                border: none;
                font-size: 15px;
                padding: 4px;
            }}
            QScrollBar:vertical {{
                background: {bg};
                width: 8px;
                margin: 0;
            }}
            QScrollBar::handle:vertical {{
                background: {border};
                border-radius: 4px;
                min-height: 32px;
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                height: 0;
            }}
        """)
        self._chat_display.document().setDefaultStyleSheet(get_chat_css())

    def _apply_workspace_combo_theme(self, colors):
        """工作区下拉框 QSS"""
        if not hasattr(self, '_workspace_combo'):
            return
        input_bg = colors['input_bg']
        border = colors['border']
        fg = colors['fg']
        accent = colors['accent']
        menu_bg = colors.get('menu_bg', input_bg)
        self._workspace_combo.setStyleSheet(f"""
            QComboBox#workspaceCombo {{
                background: {input_bg};
                border: 1px solid {border};
                border-radius: 4px;
                color: {fg};
                font-size: 13px;
                padding: 2px 6px;
            }}
            QComboBox#workspaceCombo:hover {{
                border-color: {accent};
            }}
            QComboBox#workspaceCombo QAbstractItemView {{
                background: {menu_bg};
                border: 1px solid {border};
                color: {fg};
                font-size: 13px;
                selection-background-color: {accent}22;
            }}
        """)

    def _apply_task_labels_theme(self, colors):
        """任务面板标题 / 数据统计 / placeholder 样式"""
        fg = colors['fg']
        hint = colors['hint']
        if hasattr(self, '_task_title_label'):
            self._task_title_label.setStyleSheet(
                f"font-weight: bold; font-size: 14px; color: {fg};"
            )
        if hasattr(self, '_count_label'):
            self._count_label.setStyleSheet(f"color: {hint}; font-size: 14px;")
        if hasattr(self, '_task_placeholder'):
            self._task_placeholder.setStyleSheet(
                f"color: {hint}; font-size: 14px; padding: 8px;"
            )

    def _apply_input_area_theme(self, colors, dark):
        """输入区组件样式（容器/输入框/发送按钮/提示标签/生成中标签）"""
        fg = colors['fg']
        border = colors['border']
        input_bg = colors['input_bg']
        hint = colors['hint']

        if hasattr(self, '_compose'):
            self._compose.setStyleSheet(f"""
                QFrame#composeBar {{
                    background: {input_bg};
                    border: 1px solid {border};
                    border-radius: 12px;
                }}
            """)

        if hasattr(self, '_input_edit'):
            self._input_edit.setStyleSheet(f"""
                QLineEdit {{
                    background: transparent;
                    color: {fg};
                    border: none;
                    padding: 8px 4px;
                    font-size: 14px;
                    outline: none;
                }}
            """)

        if hasattr(self, '_send_btn'):
            btn_bg = input_bg if dark else '#e2e8f0'
            self._send_btn.setStyleSheet(f"""
                QPushButton {{
                    background: {btn_bg};
                    color: {hint};
                    border: none;
                    border-radius: 16px;
                    font-size: 16px;
                    font-weight: bold;
                }}
                QPushButton:hover {{
                    background: {border};
                }}
            """)

        if hasattr(self, '_info_label'):
            self._info_label.setStyleSheet(
                f"color: {hint}; font-size: 14px; padding-left: 8px; margin-top: 4px;"
            )

        if hasattr(self, '_gen_label'):
            self._gen_label.setStyleSheet(f"color: {hint}; font-size: 14px;")

    def _apply_task_panel_theme(self, colors):
        """任务面板 QSS（支持 CollapsibleTaskPanel 和普通两种分支）"""
        fg = colors['fg']
        border = colors['border']
        input_bg = colors['input_bg']
        hint = colors['hint']

        if hasattr(self, '_task_panel') and isinstance(self._task_panel, CollapsibleTaskPanel):
            self._task_panel.setStyleSheet(f"""
                QWidget#taskPanel {{
                    background: {input_bg};
                    border: 1px solid {border};
                    border-radius: 8px;
                }}
                QWidget#taskPanel QLabel {{
                    color: {fg};
                    background: transparent;
                }}
                QWidget#collapsibleHeader {{
                    background: transparent;
                    border: none;
                    border-bottom: 1px solid {border};
                }}
                QWidget#collapsibleContent {{
                    background: transparent;
                    border: none;
                }}
                QScrollArea#collapsibleScrollArea {{
                    background: transparent;
                    border: none;
                }}
                QWidget#collapsibleScrollContent {{
                    background: transparent;
                    border: none;
                }}
                QScrollBar:vertical {{
                    background: transparent;
                    width: 4px;
                    margin: 0;
                }}
                QScrollBar::handle:vertical {{
                    background: {border};
                    border-radius: 2px;
                    min-height: 20px;
                }}
                QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                    height: 0;
                }}
            """)
            self._task_panel.set_title_style(f"font-weight: bold; font-size: 14px; color: {fg};")
            self._task_panel.set_summary_style(f"color: {hint}; font-size: 12px;")
            self._task_panel.set_chevron_color(hint)
        elif hasattr(self, '_task_panel'):
            self._task_panel.setStyleSheet(f"""
                QFrame#taskPanel {{
                    background: {input_bg};
                    border: 1px solid {border};
                    border-radius: 8px;
                    padding: 8px;
                }}
                QFrame#taskPanel QLabel {{
                    color: {fg};
                    font-size: 14px;
                    background: transparent;
                }}
            """)

    def _apply_misc_widgets_theme(self, colors):
        """命令弹窗 / 任务标记 / 模型按钮样式"""
        fg = colors['fg']
        border = colors['border']
        input_bg = colors['input_bg']
        accent = colors['accent']
        hint = colors['hint']
        menu_bg = colors.get('menu_bg', input_bg)

        if hasattr(self, '_cmd_popup'):
            self._cmd_popup.setStyleSheet(f"""
                QListWidget#cmdPopup {{
                    background: {menu_bg};
                    border: 1px solid {border};
                    border-radius: 8px;
                    padding: 4px;
                    color: {fg};
                    font-size: 14px;
                    outline: none;
                }}
                QListWidget#cmdPopup::item {{
                    padding: 5px 10px;
                    border-radius: 4px;
                }}
                QListWidget#cmdPopup::item:selected {{
                    background: {input_bg};
                    color: {fg};
                }}
                QListWidget#cmdPopup::item:hover {{
                    background: {input_bg};
                }}
            """)

        if hasattr(self, '_task_badge'):
            self._task_badge.setStyleSheet(f"""
                QLabel {{
                    background: {input_bg};
                    color: {accent};
                    border: 1px solid {border};
                    border-radius: 4px;
                    padding: 3px 8px;
                    font-size: 13px;
                }}
            """)

        if hasattr(self, '_model_btn'):
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

    def _on_theme_changed_panel(self, theme=None, **kwargs):
        self._apply_chat_theme()
        if hasattr(self, '_refresh_team_btn'):
            self._refresh_team_btn()


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
