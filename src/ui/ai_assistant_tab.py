"""智能体助手 - 交互式AI助手（支持工具调用控制编辑器）

架构说明：
  - AI大模型 = "大脑"：提供核心认知能力（理解、推理、生成）
  - 智能体(Agent) = "执行者"：负责调用具体工具、操作界面、执行任务
  - AgentManager 管理多个智能体，支持运行时切换，可扩展集成多种类型智能体
"""
from datetime import datetime
import html as html_mod
import json
import re
from typing import Optional

from PyQt6.QtCore import QObject, Qt, QThread, QTimer, pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSplitter,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.logger import get_logger
from config.constants import DATA_TYPE_NAMES, DATA_TYPE_PLURALS
from config.settings import get_config
from core.agent.agents.agent_manager import AgentManager
from core.agent.dispatcher import ToolDispatcher
from ui.themes import (
    get_chat_bubble_css,
    get_chat_css,
    get_theme_colors,
    is_dark_theme,
    theme_color,
)
from ui.widgets.agent_selector import AgentSelectorWidget

logger = get_logger()

_dispatcher = ToolDispatcher()
_dispatcher.discover_skills()


class ChatInput(QTextEdit):
    submitted = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._on_text_changed_cb = None
        self.setPlaceholderText("回车发送，Shift+回车换行...")
        self.setMaximumHeight(120)
        self.setMinimumHeight(24)
        self.setAcceptRichText(False)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setStyleSheet(f"""
            QTextEdit {{
                background: transparent;
                color: {theme_color('fg')};
                border: none;
                padding: 8px 4px;
                font-size: 15px;
                outline: none;
            }}
        """)
        self._doc_height = 0
        self.textChanged.connect(self._on_changed)

    def _on_changed(self):
        doc_h = self.document().size().height()
        if abs(doc_h - self._doc_height) > 2:
            self._doc_height = doc_h
            new_h = int(min(max(doc_h + 10, 24), 120))
            self.setFixedHeight(new_h)
        if self._on_text_changed_cb:
            self._on_text_changed_cb(bool(self.toPlainText().strip()))

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                super().keyPressEvent(event)
            else:
                self.submit()
        else:
            super().keyPressEvent(event)

    def submit(self):
        text = self.toPlainText().strip()
        if text:
            self.submitted.emit(text)
            self.clear()
            self.setFixedHeight(24)

    def focusInEvent(self, event):
        super().focusInEvent(event)
        p = self.parent()
        if p and isinstance(p, QFrame):
            from ui.themes import theme_color
            p.setStyleSheet(f"""
                QFrame#composeBar {{
                    background: {theme_color('input_bg')};
                    border: 1px solid {theme_color('accent')};
                    border-radius: 12px;
                }}
            """)

    def focusOutEvent(self, event):
        super().focusOutEvent(event)
        p = self.parent()
        if p and isinstance(p, QFrame):
            from ui.themes import theme_color
            p.setStyleSheet(f"""
                QFrame#composeBar {{
                    background: {theme_color('input_bg')};
                    border: 1px solid {theme_color('border')};
                    border-radius: 12px;
                }}
            """)

    def insertFromMimeData(self, source):
        if source.hasText():
            self.textCursor().insertText(source.text())
        else:
            super().insertFromMimeData(source)


class AIRequestThread(QThread):
    """AI请求线程"""
    finished = pyqtSignal(bool, str)

    def __init__(self, messages: list, system_prompt: str, parent: Optional[QObject] = None):
        super().__init__(parent)
        self.messages = messages
        self.system_prompt = system_prompt

    def run(self):
        try:
            config = get_config()
            if not config.enabled or not config.api_key:
                self.finished.emit(False, "请先在设置中启用API并配置API Key")
                return

            # 使用与AI生成功能相同的ai_client模块
            from common.ai_client import generate_text

            # 调用生成函数，传递完整的消息列表
            success, result = generate_text(config, "", self.system_prompt, self.messages)

            if success:
                self.finished.emit(True, result)
            else:
                self.finished.emit(False, f"请求失败: {result}")
        except Exception as e:
            self.finished.emit(False, f"请求失败: {str(e)}")


class AIAssistantTab(QWidget):
    """智能体助手标签页"""

    def __init__(self, data_manager):
        super().__init__()
        self.logger = get_logger()
        self.data_manager = data_manager
        self.conversation_history = []
        self.current_thread = None
        self._agent_manager = AgentManager()
        self.glow_widgets = []
        self._register_meta_skills()
        self.setup_ui()
        EventBus().on("theme_changed", self._on_theme_changed)

    def _on_theme_changed(self, theme=None, **kwargs):
        self._apply_chat_theme()

    def on_theme_changed(self):
        """主题切换时由 MainWindow 调用，重新应用主题化样式"""
        self._apply_chat_theme()

    def _register_meta_skills(self):
        try:
            from core.agent.skills.ask_user_skill import AskUserSkill
            AskUserSkill.register_callback(self._show_question_dialog)
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        try:
            from core.agent.skills.todo_skill import TodoWriteSkill
            TodoWriteSkill.register_callback(self._on_todos_changed)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _show_question_dialog(self, qid, questions):
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(0, lambda: self._safe_deferred(self._do_show_question, qid, questions))

    def _safe_deferred(self, fn, *args, **kwargs):
        """安全执行延迟调用，防止 Qt 事件循环中无声崩溃"""
        try:
            fn(*args, **kwargs)
        except Exception as e:
            get_logger().error(f"延迟调用失败: {e}", exc_info=True)

    def _build_question_frame(self, dialog, q: dict, qi: int):
        """构建单个问题的 UI 块，返回 (frame, 选项控件列表)。"""
        question_text = q.get("question", "")
        q_header = q.get("header", f"问题 {qi+1}")
        options = q.get("options", [])
        multi = q.get("multiSelect", False)

        frame = QFrame()
        frame.setFrameShape(QFrame.Shape.StyledPanel)
        frame.setStyleSheet(f"QFrame {{ background: {theme_color('input_bg')}; border-radius: 6px; padding: 8px; }}")
        f_layout = QVBoxLayout(frame)

        title_label = QLabel(f"<b>{q_header}</b>")
        title_label.setStyleSheet(f"color: {theme_color('fg')}; font-size: 14px;")
        f_layout.addWidget(title_label)

        q_label = QLabel(question_text)
        q_label.setWordWrap(True)
        q_label.setStyleSheet(f"color: {theme_color('fg')}; font-size: 15px; margin-bottom: 4px;")
        f_layout.addWidget(q_label)

        widgets = []
        if multi:
            for opt in options:
                label = opt.get("label", "")
                desc = opt.get("description", "")
                text = f"{label}" + (f" — {desc}" if desc else "")
                cb = QCheckBox(text)
                cb.setStyleSheet(f"color: {theme_color('hint')};")
                f_layout.addWidget(cb)
                widgets.append(cb)
        else:
            from PyQt6.QtWidgets import QButtonGroup, QRadioButton
            group = QButtonGroup(dialog)
            for oi, opt in enumerate(options):
                label = opt.get("label", "")
                desc = opt.get("description", "")
                text = f"{label}" + (f" — {desc}" if desc else "")
                rb = QRadioButton(text)
                rb.setStyleSheet(f"color: {theme_color('hint')};")
                if oi == 0:
                    rb.setChecked(True)
                group.addButton(rb)
                f_layout.addWidget(rb)
                widgets.append(rb)

        return frame, widgets


    def _make_answer_collector(self, qdata: dict, wlist, is_multi: bool):
        """生成答案收集闭包（多选返回所有勾选项，单选返回首个勾选项）。"""
        def collector():
            if is_multi:
                selected = [{"label": w.text().split(" — ")[0] if " — " in w.text() else w.text(),
                              "answer": w.text()}
                            for w in wlist if w.isChecked()]
            else:
                selected = []
                for w in wlist:
                    if w.isChecked():
                        text = w.text()
                        parts = text.split(" — ")
                        selected.append({"label": parts[0] if len(parts) > 1 else text,
                                          "answer": text,
                                          "answer_label": parts[0] if len(parts) > 1 else text})
                        break
            if not selected:
                selected = [{"answer": "skipped", "answer_label": "跳过"}]
            qdata["raw"] = selected
            return selected

        return collector


    def _build_answer_buttons(self, layout, qid, dialog):
        """构建跳过/确认按钮栏（跳过逻辑原样保留），返回确认按钮供主函数绑定提交。"""
        btn_layout = QHBoxLayout()
        cancel_btn = QPushButton("跳过")
        cancel_btn.setStyleSheet(f"color: {theme_color('hint')};")
        cancel_btn.clicked.connect(lambda: [
            AskUserSkill.answer(qid, [{"answer": "skipped", "answer_label": "用户跳过"}])
            for _ in [1] if not dialog.close() or True
        ])
        btn_layout.addWidget(cancel_btn)

        submit_btn = QPushButton("确认回答")
        submit_btn.setStyleSheet(
            f"background: {theme_color('accent')}; color: {theme_color('btn_text')}; "
            "padding: 6px 20px; border-radius: 4px;"
        )
        submit_btn.clicked.connect(lambda: None)
        btn_layout.addWidget(submit_btn)
        layout.addLayout(btn_layout)

        return submit_btn


    def _do_show_question(self, qid, questions):
        from PyQt6.QtWidgets import QDialog, QFrame, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

        from core.agent.skills.ask_user_skill import AskUserSkill

        dialog = QDialog(self)
        dialog.setWindowTitle("AI 向你提问")
        dialog.setMinimumWidth(480)

        layout = QVBoxLayout(dialog)
        layout.setSpacing(12)

        header_label = QLabel("AI 需要你的输入")
        header_label.setStyleSheet(f"font-size: 14px; font-weight: bold; color: {theme_color('fg')};")
        layout.addWidget(header_label)

        all_answers = []

        for qi, q in enumerate(questions):
            question_text = q.get("question", "")
            multi = q.get("multiSelect", False)

            frame, widgets = self._build_question_frame(dialog, q, qi)
            layout.addWidget(frame)

            all_answers.append({
                "question": question_text,
                "widgets": widgets,
                "multi": multi,
                "collector": self._make_answer_collector(
                    {"question": question_text}, widgets, multi
                ),
            })

        submit_btn = self._build_answer_buttons(layout, qid, dialog)

        def on_submit():
            from core.agent.skills.ask_user_skill import AskUserSkill
            answers = []
            for a in all_answers:
                selected = a["collector"]()
                if selected:
                    answers.append({
                        "question": a["question"],
                        "answer": selected[0]["answer"] if selected else "",
                        "answer_label": selected[0].get("answer_label", selected[0]["answer"]) if selected else "",
                    })
            AskUserSkill.answer(qid, answers)
            dialog.close()

        submit_btn.clicked.disconnect()
        submit_btn.clicked.connect(on_submit)
        dialog.finished.connect(lambda _: [
            AskUserSkill.answer(qid, [{"answer": "timeout", "answer_label": "用户关闭"}])
            for _ in [1]
        ])

        dialog.setLayout(layout)
        dialog.show()



    def _on_todos_changed(self, todos):
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(0, lambda: self._safe_deferred(self._update_todo_display, todos))

    def _update_todo_display(self, todos):
        if not hasattr(self, '_todo_label'):
            return
        if not todos:
            self._todo_label.hide()
            return
        lines = ["<b>任务计划</b><br>"]
        icons = {"pending": "-", "in_progress": "...", "completed": "✓"}
        for t in todos[:12]:
            icon = icons.get(t.get("status", "pending"), "-")
            priority_mark = {"high": "[高]", "medium": "[中]", "low": "[低]"}.get(t.get("priority", ""), "")
            lines.append(f"{icon} {priority_mark} {t.get('content', '')[:40]}")
        done = sum(1 for t in todos if t.get("status") == "completed")
        lines.append(f"<br><i>{done}/{len(todos)} 已完成</i>")
        self._todo_label.setText("".join(lines))
        self._todo_label.show()

    def setup_ui(self):
        """设置UI"""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        left_panel = self.create_left_panel()
        right_panel = self.create_chat_panel()

        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)

        layout.addWidget(splitter)

    def get_glow_widgets(self):
        """
        获取需要流光效果的文字组件列表
        
        Returns:
            list: [(widget, 'role_name'), ...]
        """
        return self.glow_widgets

    def create_left_panel(self):
        """创建左侧面板"""
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)

        # 智能体管理
        agent_group = QGroupBox("智能体管理")
        agent_layout = QVBoxLayout(agent_group)
        agent_layout.setSpacing(6)
        agent_layout.setContentsMargins(8, 20, 8, 8)

        # 智能体列表
        self.agent_combo = QComboBox()
        self.update_agent_list()
        self.agent_combo.currentTextChanged.connect(self.on_agent_changed)
        agent_layout.addWidget(self.agent_combo)

        # 智能体管理按钮
        agent_buttons_layout = QHBoxLayout()
        create_agent_btn = QPushButton("创建智能体")
        create_agent_btn.clicked.connect(self.create_agent)
        agent_buttons_layout.addWidget(create_agent_btn)

        edit_agent_btn = QPushButton("编辑智能体")
        edit_agent_btn.clicked.connect(self.edit_agent)
        agent_buttons_layout.addWidget(edit_agent_btn)

        delete_agent_btn = QPushButton("删除智能体")
        delete_agent_btn.clicked.connect(self.delete_agent)
        agent_buttons_layout.addWidget(delete_agent_btn)

        agent_layout.addLayout(agent_buttons_layout)

        left_layout.addWidget(agent_group)

        quick_group = QGroupBox("快捷指令")
        quick_layout = QVBoxLayout(quick_group)
        quick_layout.setSpacing(6)
        quick_layout.setContentsMargins(8, 20, 8, 8)

        quick_buttons = [
            ("分析当前数据", self.analyze_data),
            ("生成技能建议", self.suggest_skills),
            ("优化数值平衡", self.optimize_balance),
            ("检查策划完整性", self.check_plan),
            ("生成完整策划方案", self.generate_plan)
        ]

        for text, func in quick_buttons:
            btn = QPushButton(text)
            btn.clicked.connect(func)
            quick_layout.addWidget(btn)

        left_layout.addWidget(quick_group)

        history_group = QGroupBox("对话历史")
        history_layout = QVBoxLayout(history_group)
        history_layout.setSpacing(6)
        history_layout.setContentsMargins(8, 20, 8, 8)

        self.history_combo = QComboBox()
        self.history_combo.addItem("新建对话")
        history_layout.addWidget(self.history_combo)

        clear_history_btn = QPushButton("清空历史")
        clear_history_btn.clicked.connect(self.clear_conversation)
        history_layout.addWidget(clear_history_btn)

        left_layout.addWidget(history_group)
        left_layout.addStretch()

        return left_widget

    def create_chat_panel(self):
        right_widget = QWidget()
        right_widget.setStyleSheet(f"QWidget {{ background: {theme_color('bg')}; }}")
        right_layout = QVBoxLayout(right_widget)
        right_layout.setSpacing(4)
        right_layout.setContentsMargins(8, 6, 8, 6)

        header_row = QHBoxLayout()
        header_row.setSpacing(12)

        try:
            from config import AppConfig
            from ui.widgets.model_selector import ModelSelectorWidget
            app_config = AppConfig()
            self.model_selector = ModelSelectorWidget(app_config)
            self.model_selector.provider_changed.connect(self._on_provider_changed)
            self.model_selector.model_changed.connect(self._on_model_changed)
            header_row.addWidget(self.model_selector)
        except Exception:
            self.model_selector = None

        header_row.addStretch()
        right_layout.addLayout(header_row)

        self.chat_display = QTextEdit()
        self.chat_display.setReadOnly(True)
        self.chat_display.setPlaceholderText("助手将在这里回复你...")
        right_layout.addWidget(self.chat_display)
        self._apply_chat_theme()

        self._todo_label = QLabel()
        self._todo_label.setWordWrap(True)
        self._todo_label.setStyleSheet(
            f"background: {theme_color('input_bg')}; color: {theme_color('fg')}; padding: 8px; border-radius: 6px; "
            f"font-size: 13px; margin: 2px 0; border: 1px solid {theme_color('border')};"
        )
        self._todo_label.hide()
        right_layout.addWidget(self._todo_label)

        agent_row = QHBoxLayout()
        self.agent_selector = AgentSelectorWidget()
        self.agent_selector.agent_changed.connect(self._on_agent_switched)
        agent_row.addWidget(self.agent_selector)
        agent_row.addStretch()
        right_layout.addLayout(agent_row)

        input_container = QFrame()
        input_container.setStyleSheet(f"""
            QFrame#composeBar {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 12px;
                padding: 0px;
            }}
        """)
        input_container.setObjectName("composeBar")
        input_inner = QHBoxLayout(input_container)
        input_inner.setContentsMargins(6, 3, 3, 3)
        input_inner.setSpacing(2)

        self.user_input = ChatInput(input_container)
        self.user_input._on_text_changed_cb = self._update_send_state
        self.user_input.submitted.connect(self.send_message)
        self._compose_bar = input_container
        input_inner.addWidget(self.user_input, 1)

        self.send_btn = QPushButton("↑")
        self.send_btn.setFixedSize(32, 32)
        self.send_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.send_btn.setEnabled(False)
        self.send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('input_bg')};
                color: {theme_color('hint')};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {theme_color('border')};
            }}
            QPushButton:enabled {{
                background: {theme_color('accent')};
                color: {theme_color('btn_text')};
            }}
            QPushButton:enabled:hover {{
                background: {theme_color('accent_hover')};
            }}
            QPushButton:enabled:pressed {{
                background: {theme_color('accent_active')};
            }}
        """)
        self.send_btn.clicked.connect(lambda: self.user_input.submit())
        input_inner.addWidget(self.send_btn)

        right_layout.addWidget(input_container)

        info_label = QLabel("Enter 发送 · Shift+Enter 换行")
        self._info_label = info_label
        info_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 12px; padding-left: 8px; margin-top: 2px;")
        right_layout.addWidget(info_label)

        return right_widget

    def _apply_chat_theme(self):
        """应用主题感知的聊天显示样式"""
        if not hasattr(self, 'chat_display'):
            return
        try:
            colors = get_theme_colors()
            dark = is_dark_theme()
            bg = colors['bg']
            fg = colors['fg']
            border = colors['border']
            input_bg = colors['input_bg']
            accent = colors['accent']
            accent_hover = colors.get('accent_hover', accent)
            hint = colors['hint']

            # 聊天显示区 QSS
            self.chat_display.setStyleSheet(f"""
                QTextEdit {{
                    background: {bg};
                    color: {fg};
                    border: none;
                    font-size: 15px;
                    padding: 8px;
                }}
                QScrollBar:vertical {{
                    background: {bg};
                    width: 8px;
                    margin: 0;
                }}
                QScrollBar::handle:vertical {{
                    background: {border};
                    border-radius: 4px;
                    min-height: 30px;
                }}
                QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                    height: 0;
                }}
            """)
            self.chat_display.document().setDefaultStyleSheet(get_chat_css())

            # 输入框容器
            if hasattr(self, '_compose_bar'):
                self._compose_bar.setStyleSheet(f"""
                    QFrame#composeBar {{
                        background: {input_bg};
                        border: 1px solid {border};
                        border-radius: 12px;
                    }}
                """)

            # ChatInput 内部文字
            if hasattr(self, 'user_input'):
                self.user_input.setStyleSheet(f"""
                    QTextEdit {{
                        background: transparent;
                        color: {fg};
                        border: none;
                        padding: 8px 4px;
                        font-size: 15px;
                        outline: none;
                    }}
                """)

            # 发送按钮
            if hasattr(self, 'send_btn'):
                btn_bg = input_bg if dark else "#e2e8f0"
                btn_disabled = hint if dark else "#94a3b8"
                self.send_btn.setStyleSheet(f"""
                    QPushButton {{
                        background: {btn_bg};
                        color: {btn_disabled};
                        border: none;
                        border-radius: 16px;
                        font-size: 16px;
                        font-weight: bold;
                    }}
                    QPushButton:hover {{
                        background: {border};
                    }}
                    QPushButton:enabled {{
                        background: {accent};
                        color: {'white' if dark else 'white'};
                    }}
                    QPushButton:enabled:hover {{
                        background: {accent_hover};
                    }}
                """)

            # 提示标签
            if hasattr(self, '_info_label'):
                self._info_label.setStyleSheet(f"color: {hint}; font-size: 12px; padding-left: 8px; margin-top: 2px;")

            # 待办标签
            if hasattr(self, '_todo_label'):
                self._todo_label.setStyleSheet(f"""
                    background: {input_bg};
                    color: {fg};
                    padding: 8px;
                    border-radius: 6px;
                    font-size: 13px;
                    margin: 2px 0;
                    border: 1px solid {border};
                """)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _update_send_state(self, has_text):
        if hasattr(self, 'send_btn') and self.send_btn:
            self.send_btn.setEnabled(has_text)

    def get_system_prompt(self):
        """获取系统提示词（使用当前激活的智能体）"""
        agent = self._agent_manager.active_agent
        base_prompt = agent.system_prompt or "你是一位专业的游戏策划专家，帮助用户设计和完善游戏。"

        # ── 工具调用格式 ──
        tool_format = """

## 工具调用
需要操作编辑器数据、执行命令或生成内容时，用 ```tool 代码块调用工具：
```tool
{"name": "<tool_name>", "params": {<参数>}}
```

支持的工具有：
- `system.game_data` — 游戏数据增删改查（创建/查询/修改/删除/排序/复制）
- `system.batch_data` — 批量数据操作（导入/导出/批量更新）
- `system.schema_edit` — 数据类型和字段结构管理
- `system.diagnosis` — 诊断、修复、回滚、翻译错误
  - action=diagnose 数据健康诊断
  - action=health 系统健康报告
  - action=fix_data 自动修复数据问题
  - action=rollback 回滚数据快照
  - action=translate 把技术报错翻译成人话
  - action=fix_code 代码自愈
  - action=fix_config 配置修复
  - action=references 查数据引用关系
  - action=backup 备份管理
- `system.editor_layout` — 编辑器布局切换
- `system.shell` — 执行命令行
- `system.code` — 代码文件读写编辑
- `system.ceshu` — 策划书编辑
- `system.web_search` / `system.web_fetch` — 网络搜索
- `system.browser` — 浏览器操作
- `system.git` — Git 版本控制
- `tool.image` — 图片生成/分析/截图/OCR
- `tool.audio` — 语音合成/输入
- `tool.export_doc` — 文档导出
- `tool.game_balance` — 数值平衡计算
- `tool.ask_user` — 向用户提问
- `tool.ui_preview` — UI 预览

## 自愈能力
操作过程中如果遇到错误，不要慌张，你有以下方式处理：
1. 数据异常 → `system.diagnosis action=diagnose` 诊断 → `action=fix_data` 修复
2. 代码报错 → `system.diagnosis action=fix_code traceback=...` 自动分析修复
3. 看不懂错误 → `system.diagnosis action=translate` 翻译成人话
4. 改崩了 → `system.diagnosis action=rollback` 回滚
5. 工具执行失败会自动重试，你继续完成目标即可
"""

        base_prompt += tool_format

        ctx = self._get_library_context()
        base_prompt += f"\n【当前工作环境】\n{ctx}"

        tools_desc = self._agent_manager.get_tools_description()
        if tools_desc:
            base_prompt += "\n" + tools_desc

        return base_prompt

    def get_game_data_summary(self):
        """获取游戏数据概况"""

        summary = []
        for data_type, plural in DATA_TYPE_PLURALS.items():
            items = self.data_manager.data.get(plural, [])
            if items:
                type_name = DATA_TYPE_NAMES.get(data_type, data_type)
                summary.append(f"- {type_name}: {len(items)}个")

        if summary:
            return "\n".join(summary)
        return "暂无数据"

    def _get_library_context(self) -> str:
        """获取当前库上下文信息（含当前标签页、选中条目、字段结构）"""

        config = get_config()
        lm = config.library_manager
        parts = [f"当前库：{lm.active_library_name or '默认库'}"]

        total = sum(len(self.data_manager.data.get(k, [])) for k in self.data_manager.data)
        parts.append(f"数据总量：{total}条")

        # ─── 当前编辑器状态 ───
        mw = self._get_main_window()
        if mw:
            current_tab_info = self._get_current_tab_info(mw)
            if current_tab_info:
                parts.append(current_tab_info)

            selected_info = self._get_selected_item_info(mw)
            if selected_info:
                parts.append(selected_info)

        # ─── 各数据类型的字段结构 ───
        schema_info = self._get_schema_hints()
        if schema_info:
            parts.append(schema_info)

        # ─── 策划方案摘要 ───
        try:
            planning_items = self.data_manager.data.get("planning", [])
            if isinstance(planning_items, list) and planning_items:
                latest = planning_items[-1]
                preview = (latest.get("description", "") or "")[:200]
                parts.append(f"策划方案：{latest.get('name','?')} — {preview}")
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        return "\n".join(parts)

    def _get_current_tab_info(self, mw) -> str:
        """获取当前打开的标签页信息"""
        if not hasattr(mw, 'tab_widget') or not mw.tab_widget:
            return ""
        idx = mw.tab_widget.currentIndex()
        if idx < 0:
            return ""
        widget = mw.tab_widget.widget(idx)
        data_type = getattr(widget, '_data_type', None)
        if data_type:
            from config.constants import DATA_TYPE_NAMES
            type_name = DATA_TYPE_NAMES.get(data_type, data_type)
            return f"当前标签页：{type_name} ({data_type})"
        return ""

    def _get_selected_item_info(self, mw) -> str:
        """获取当前选中的数据条目信息"""
        editor = getattr(mw, 'current_editor', None)
        if not editor or not hasattr(editor, 'current_item') or not editor.current_item:
            return ""
        item = editor.current_item
        data_type = getattr(editor, 'data_type', None) or editor.current_context.get("data_type", "?")
        type_name = DATA_TYPE_NAMES.get(data_type, data_type)

        lines = [f"当前选中：{item.get('name','?')} (id:{item.get('id','?')}) [{type_name}]"]

        # 列出关键字段值
        skip_keys = {"id", "name", "description"}
        fields = [(k, v) for k, v in item.items() if k not in skip_keys and v not in (None, "", [])]
        if fields:
            field_strs = [f"  {k}={v}" for k, v in fields[:12]]
            if len(fields) > 12:
                field_strs.append(f"  ... 还有 {len(fields)-12} 个字段")
            lines.append("  字段:\n" + "\n".join(field_strs))

        return "\n".join(lines)

    def _get_schema_hints(self) -> str:
        """从 type_schema.json 动态获取类型结构提示"""

        schema_path = None
        try:
            config = get_config()
            lib_dir = config.library_manager.libraries_dir / config.library_manager.active_library_name
            sf = lib_dir / "type_schema.json"
            if sf.exists():
                schema_path = sf
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        if not schema_path:
            return ""

        import json
        try:
            schema = json.loads(schema_path.read_text(encoding='utf-8'))
            types = schema.get("data_types", [])
            if not types:
                return ""
            lines = ["数据类型结构（动态加载）："]
            for t in types:
                tid = t.get("id", "?")
                tname = t.get("name", tid)
                fields = t.get("fields", [])
                field_strs = []
                for f in fields:
                    fn = f.get("name", "?")
                    fl = f.get("label", "")
                    ft = f.get("type", "string")
                    field_strs.append(f"{fn}:{ft}")
                lines.append(f"  {tname}({tid}): {', '.join(field_strs[:12])}")
            return "\n".join(lines)
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return ""

    def update_agent_list(self):
        """更新智能体列表"""
        config = get_config()
        agents = config.agents
        current_text = self.agent_combo.currentText()
        self.agent_combo.clear()

        # 为默认智能体添加 (默认) 标记
        for name, agent in agents.items():
            display_name = name
            if agent.get("is_default", False):
                display_name = f"{name} (默认)"
            self.agent_combo.addItem(display_name)

        # 找到当前智能体的显示名称
        if current_text:
            for i in range(self.agent_combo.count()):
                if current_text in self.agent_combo.itemText(i):
                    self.agent_combo.setCurrentIndex(i)
                    break
        else:
            self.agent_combo.setCurrentIndex(0)

    def on_agent_changed(self, agent_name):
        """智能体切换（同步左栏下拉到 AgentManager）"""
        actual_agent_name = agent_name.replace(" (默认)", "")
        # 尝试在 AgentManager 中查找匹配的智能体
        for agent in self._agent_manager.agents:
            if agent.name == actual_agent_name or agent.id == actual_agent_name:
                self._agent_manager.switch_agent(agent.id)
                self.agent_selector.refresh()
                break
        self.clear_conversation()
        agent = self._agent_manager.active_agent
        self.add_system_message(f"已切换为「{agent.display_name}」智能体：{agent.description}")
        self.logger.info(f"切换到智能体: {agent.name}")

    def _on_agent_switched(self, agent_id, agent_def):
        self.clear_conversation()
        self.add_system_message(f"已切换为「{agent_def.display_name}」智能体")
        self.add_system_message(f"{agent_def.description}")
        self.logger.info(f"智能体切换: {agent_id} ({agent_def.name})")

    def _on_provider_changed(self, provider):
        self.add_system_message(f"已切换平台: {provider}")
        self.logger.info(f"AI平台切换: {provider}")

    def _on_model_changed(self, model):
        self.add_system_message(f"已切换模型: {model}")
        self.logger.info(f"AI模型切换: {model}")

    def create_agent(self):
        """创建智能体"""
        from PyQt6.QtWidgets import QDialog, QHBoxLayout, QLabel, QPushButton, QTextEdit, QVBoxLayout

        dialog = QDialog(self)
        dialog.setWindowTitle("创建智能体")
        dialog.resize(500, 400)

        layout = QVBoxLayout(dialog)

        # 名称
        name_layout = QHBoxLayout()
        name_label = QLabel("智能体名称:")
        name_input = QLineEdit()
        name_input.setPlaceholderText("请输入智能体名称")
        name_layout.addWidget(name_label)
        name_layout.addWidget(name_input)
        layout.addLayout(name_layout)

        # 描述
        desc_layout = QHBoxLayout()
        desc_label = QLabel("描述:")
        desc_input = QTextEdit()
        desc_input.setPlaceholderText("请输入智能体描述")
        desc_input.setFixedHeight(80)
        desc_layout.addWidget(desc_label)
        desc_layout.addWidget(desc_input)
        layout.addLayout(desc_layout)

        # 系统提示词
        prompt_layout = QHBoxLayout()
        prompt_label = QLabel("系统提示词:")
        prompt_input = QTextEdit()
        prompt_input.setPlaceholderText("请输入系统提示词")
        prompt_input.setFixedHeight(150)
        prompt_layout.addWidget(prompt_label)
        prompt_layout.addWidget(prompt_input)
        layout.addLayout(prompt_layout)

        # 按钮
        button_layout = QHBoxLayout()
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(dialog.reject)
        button_layout.addWidget(cancel_btn)

        ok_btn = QPushButton("确定")
        ok_btn.clicked.connect(dialog.accept)
        button_layout.addWidget(ok_btn)
        layout.addLayout(button_layout)

        def _on_create_agent_accepted():
            name = name_input.text().strip()
            description = desc_input.toPlainText().strip()
            system_prompt = prompt_input.toPlainText().strip()

            if name:
                config = get_config()
                config.add_agent(name, description, system_prompt)
                self.update_agent_list()
                self.add_system_message(f"已创建智能体「{name}」")
                self.logger.info(f"创建智能体: {name}")

        dialog.accepted.connect(_on_create_agent_accepted)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def edit_agent(self):
        """编辑智能体"""
        current_agent = self.agent_combo.currentText()
        if not current_agent:
            return

        # 提取实际智能体名称（去除 (默认) 标记）
        actual_agent_name = current_agent.replace(" (默认)", "")

        # 检查是否为默认智能体
        from PyQt6.QtWidgets import QMessageBox
        config = get_config()
        agent = config.get_agent(actual_agent_name)

        if agent.get("is_default", False):
            QMessageBox.information(
                self, "提示", "默认智能体为系统内置，不允许编辑。请创建自定义智能体进行修改。"
            )
            return

        from PyQt6.QtWidgets import QDialog, QHBoxLayout, QLabel, QPushButton, QTextEdit, QVBoxLayout

        dialog = QDialog(self)
        dialog.setWindowTitle("编辑智能体")
        dialog.resize(500, 400)

        layout = QVBoxLayout(dialog)

        # 名称
        name_layout = QHBoxLayout()
        name_label = QLabel("智能体名称:")
        name_input = QLineEdit(agent.get("name", ""))
        name_layout.addWidget(name_label)
        name_layout.addWidget(name_input)
        layout.addLayout(name_layout)

        # 描述
        desc_layout = QHBoxLayout()
        desc_label = QLabel("描述:")
        desc_input = QTextEdit(agent.get("description", ""))
        desc_input.setFixedHeight(80)
        desc_layout.addWidget(desc_label)
        desc_layout.addWidget(desc_input)
        layout.addLayout(desc_layout)

        # 系统提示词
        prompt_layout = QHBoxLayout()
        prompt_label = QLabel("系统提示词:")
        prompt_input = QTextEdit(agent.get("system_prompt", ""))
        prompt_input.setFixedHeight(150)
        prompt_layout.addWidget(prompt_label)
        prompt_layout.addWidget(prompt_input)
        layout.addLayout(prompt_layout)

        # 按钮
        button_layout = QHBoxLayout()
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(dialog.reject)
        button_layout.addWidget(cancel_btn)

        ok_btn = QPushButton("确定")
        ok_btn.clicked.connect(dialog.accept)
        button_layout.addWidget(ok_btn)
        layout.addLayout(button_layout)

        def _on_edit_agent_accepted():
            name = name_input.text().strip()
            description = desc_input.toPlainText().strip()
            system_prompt = prompt_input.toPlainText().strip()

            if name:
                # 直接更新智能体配置，不需要删除再添加
                config.agents[name] = {
                    "name": name,
                    "description": description,
                    "system_prompt": system_prompt
                }
                # 保存配置
                config._save_agents()
                self.update_agent_list()
                self.add_system_message(f"已更新智能体「{name}」")
                self.logger.info(f"更新智能体: {name}")

        dialog.accepted.connect(_on_edit_agent_accepted)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def delete_agent(self):
        """删除智能体"""
        current_agent = self.agent_combo.currentText()
        if not current_agent:
            return

        # 提取实际智能体名称（去除 (默认) 标记）
        actual_agent_name = current_agent.replace(" (默认)", "")

        # 检查是否为默认智能体
        from PyQt6.QtWidgets import QMessageBox
        config = get_config()
        agent = config.get_agent(actual_agent_name)

        if agent.get("is_default", False):
            QMessageBox.information(
                self, "提示", "默认智能体为系统内置，不允许删除。"
            )
            return

        reply = QMessageBox.question(
            self, "确认", f"确定要删除智能体「{current_agent}」吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            config.remove_agent(actual_agent_name)
            self.update_agent_list()
            self.add_system_message(f"已删除智能体「{current_agent}」")
            self.logger.info(f"删除智能体: {actual_agent_name}")

    def send_message(self, user_text: str = ""):
        if not user_text:
            user_text = self.user_input.toPlainText().strip()
        if not user_text:
            return

        self.add_user_message(user_text)
        self._update_send_state(False)
        self.generate_response(user_text)

    def generate_response(self, user_text: str):
        """生成回复"""
        if self.current_thread and self.current_thread.isRunning():
            self.current_thread.quit()
            if not self.current_thread.wait(3000):
                self.current_thread.terminate()
                self.current_thread.wait()

        self._last_user_text = user_text

        self.send_btn.setText("■")
        self.send_btn.setEnabled(True)
        self.send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('input_bg')};
                color: {theme_color('hint')};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {theme_color('border')};
            }}
            QPushButton:enabled {{
                background: {theme_color('danger')};
                color: {theme_color('danger_hover')};
            }}
            QPushButton:enabled:hover {{
                background: {theme_color('danger_hover')};
            }}
            QPushButton:enabled:pressed {{
                background: {theme_color('danger')};
            }}
        """)
        try:
            old_handler = self.send_btn.clicked
            self.send_btn.clicked.disconnect()
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self.send_btn.clicked.connect(self._cancel_thinking)
        self.add_thinking_indicator()

        self.conversation_history.append({
            "role": "user",
            "content": user_text
        })

        self.current_thread = AIRequestThread(
            self.conversation_history,
            self.get_system_prompt()
        )
        self.current_thread.finished.connect(self.on_response_finished)
        self.current_thread.start()

    def on_response_finished(self, success: bool, result: str):
        self._restore_send_button()
        self.remove_thinking_indicator()

        if success:
            self.add_assistant_message(result)
            self.conversation_history.append({
                "role": "assistant",
                "content": result
            })
            tool_result = self._parse_and_execute_tools(result)
            if tool_result:
                self.conversation_history.append({"role": "user", "content": f"[工具执行结果]\n{tool_result}"})
                self.generate_response("请继续，以上是工具执行的结果。")
            elif self._should_have_tool_call(self._last_user_text):
                self.conversation_history.append({
                    "role": "user",
                    "content": "【强制工具调用】你刚才只是口头回应了但没有实际操作！请重新输出回复，这次**必须**在回复末尾包含 tool 代码块来真实执行操作：\n```tool\n{\"name\": \"工具名\", \"params\": {...}}\n```\n注意：不能只说「已添加」「创建成功」之类的空话，必须输出真实的 tool 代码块。"
                })
                self.add_system_message("AI 未输出工具调用，正在重新请求...")
                self.generate_response("请重新回复，按规则输出工具调用。")
        else:
            healed_msg = self._apply_healing_message(result)
            self.add_error_message(healed_msg)
            if "重试" not in healed_msg and "熔断" not in healed_msg:
                QMessageBox.warning(self, "错误", healed_msg)

    def _apply_healing_message(self, msg: str) -> str:
        fatal_keywords = ("crash", "fatal", "corrupt", "segmentation", "内存不足", "崩溃")
        if any(k in msg.lower() for k in fatal_keywords):
            return f"[致命错误] {msg}\n请联系开发者"

        retry_keywords = ("timeout", "timed out", "connection", "network",
                         "refused", "超时", "连接", "网络", "rate limit", "429")
        if any(k in msg.lower() for k in retry_keywords):
            return f"[网络问题] {msg}\n系统正在自动重试，请稍等..."

        param_keywords = ("missing", "required", "缺少", "参数", "参数", "invalid")
        if any(k in msg.lower() for k in param_keywords):
            return f"[参数问题] {msg}\nAI 将尝试修正参数后重试"

        return f"{msg}"

    def _cancel_thinking(self):
        if self.current_thread and self.current_thread.isRunning():
            self.current_thread.terminate()
            self.current_thread.wait(2000)
        self._restore_send_button()
        self.remove_thinking_indicator()
        self.add_system_message("已取消")

    def _restore_send_button(self):
        self.send_btn.setText("↑")
        self.send_btn.setEnabled(False)
        self.send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('input_bg')};
                color: {theme_color('hint')};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {theme_color('border')};
            }}
            QPushButton:enabled {{
                background: {theme_color('accent')};
                color: {theme_color('btn_text')};
            }}
            QPushButton:enabled:hover {{
                background: {theme_color('accent_hover')};
            }}
            QPushButton:enabled:pressed {{
                background: {theme_color('accent_active')};
            }}
        """)
        try:
            self.send_btn.clicked.disconnect()
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self.send_btn.clicked.connect(lambda: self.user_input.submit())

    _ACTION_KEYWORDS = [
        "创建", "添加", "新增", "生成", "建立一个", "来个",
        "修改", "调整", "更改", "更新", "编辑", "改一下",
        "删除", "移除", "去掉", "干掉", "清除",
        "切换到", "跳转到", "搜索", "查找",
        "create", "add", "new", "make", "update", "edit", "delete", "remove",
    ]

    def _should_have_tool_call(self, user_text: str) -> bool:
        agent = self._agent_manager.active_agent
        if not agent.tools:
            return False
        lower = user_text.lower()
        for kw in self._ACTION_KEYWORDS:
            if kw.lower() in lower:
                return True
        return False

    def _parse_and_execute_tools(self, text: str):
        pattern = r'```tool\s*\n(.*?)\n?```'
        matches = re.findall(pattern, text, re.DOTALL)
        if not matches:
            return None
        results = []
        for match in matches:
            try:
                call = json.loads(match.strip())
                name = call.get("name", "")
                params = call.get("params", {})
                param_str = ", ".join(f"{k}={v}" for k, v in params.items())
                self.add_system_message(f"执行工具: {name}({param_str})")
                result = self._execute_tool(name, params)
                self.add_system_message(f"{result}")
                results.append(f"工具「{name}」执行结果: {result}")
            except Exception as e:
                self.add_system_message(f"工具执行失败: {e}")
                results.append(f"工具调用解析失败: {e}")
        return "\n".join(results)

    def _execute_tool(self, name: str, params: dict):
        mw = self._get_main_window()
        dm = getattr(mw, 'data_manager', None) if mw else None
        result = _dispatcher.execute(name, params, {"main_window": mw, "data_manager": dm})
        if isinstance(result, dict):
            return result.get("message", str(result))
        return str(result)

    def _get_main_window(self):
        parent = self.parent()
        while parent:
            if hasattr(parent, 'data_manager') and hasattr(parent, 'tab_widget'):
                return parent
            parent = parent.parent()
        return None

    def add_user_message(self, text: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        safe_text = html_mod.escape(text).replace("\n", "<br>")
        b = get_chat_bubble_css()
        fg = theme_color('fg')
        html = f'''
        <div style="margin: 12px 0; display: flex; justify-content: flex-end;">
            <div style="max-width: 82%;">
                <div style="color: {b['user_name_color']}; font-size: 13px; margin-bottom: 2px; text-align: right;">
                    你 · {timestamp}
                </div>
                <div style="background: {b['user_bubble_bg']}; color: {fg};
                    padding: 10px 16px; border-radius: 14px 14px 4px 14px; font-size: 15px;
                    border: 1px solid {b['user_bubble_border']}; line-height: 1.55;">
                    {safe_text}
                </div>
            </div>
        </div>
        '''
        self.chat_display.append(html)
        self.scroll_to_bottom()

    def _md_to_html(self, text: str) -> str:
        try:
            import markdown
            return markdown.markdown(
                text,
                extensions=['fenced_code', 'nl2br', 'sane_lists', 'tables'],
            )
        except Exception:
            return text.replace("\n", "<br>")

    def add_assistant_message(self, text: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        agent_name = getattr(self._agent_manager, 'active_agent', None)
        agent_name = agent_name.display_name if agent_name else "小墨"
        md_html = self._md_to_html(text)
        b = get_chat_bubble_css()
        fg = theme_color('fg')
        full_html = f'''
        <div style="margin: 12px 0; display: flex; justify-content: flex-start;">
            <div style="max-width: 82%;">
                <div style="color: {b['assistant_name_color']}; font-size: 13px; margin-bottom: 2px;">
                    {agent_name} · {timestamp}
                </div>
                <div style="background: {b['assistant_bubble_bg']}; color: {fg};
                    padding: 10px 16px; border-radius: 14px 14px 14px 4px; font-size: 15px;
                    border: 1px solid {b['assistant_bubble_border']}; line-height: 1.55;">
                    {md_html}
                </div>
            </div>
        </div>
        '''
        self.chat_display.append(full_html)
        self.scroll_to_bottom()

    def add_tool_result(self, tool_name: str, result: str = "", success: bool = True):
        short_name = tool_name.replace("system.", "").replace("tool.", "")
        icon = "✓" if success else "✗"
        b = get_chat_bubble_css()
        fg = theme_color('fg')
        hint = theme_color('hint')
        accent = theme_color('accent')
        if success:
            status_color = "#2d7d2d" if not is_dark_theme() else "#7ee787"
            border_color = "#238636"
        else:
            status_color = b.get('error_color', '#da3633')
            border_color = b.get('error_bubble_border', '#da3633')
        display = html_mod.escape(str(result)[:300]) if result else "执行完成"
        display = display.replace("\n", "<br>")
        html = f'''
        <div style="margin: 8px 0; display: flex; justify-content: center;">
            <div style="max-width: 90%; width: 100%;">
                <div style="background: {b['system_bubble_bg']}; border: 1px solid {border_color};
                    border-radius: 8px; padding: 6px 12px; font-size: 13px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: {hint};"><code style="color: {status_color};">{short_name}</code></span>
                        <span style="color: {status_color};">{icon}</span>
                    </div>
                    <div style="color: {fg}; margin-top: 4px; font-size: 13px; line-height: 1.4;">
                        {display}
                    </div>
                </div>
            </div>
        </div>
        '''
        self.chat_display.append(html)
        self.scroll_to_bottom()

    def add_system_message(self, text: str):
        hint = theme_color('hint')
        input_bg = theme_color('input_bg')
        border = theme_color('border')
        safe_text = html_mod.escape(text).replace("\n", "<br>")
        html = f'''
        <div style="margin: 10px 0; text-align: center;">
            <div style="display: inline-block; background: {input_bg}; color: {hint};
                padding: 4px 16px; border-radius: 12px; font-size: 13px; font-style: italic;
                border: 1px solid {border};">
                {safe_text}
            </div>
        </div>
        '''
        self.chat_display.append(html)
        self.scroll_to_bottom()

    def add_error_message(self, text: str):
        b = get_chat_bubble_css()
        safe_text = html_mod.escape(text).replace("\n", "<br>")
        html = f'''
        <div style="margin: 10px 0; text-align: center;">
            <div style="display: inline-block; background: {b['error_bubble_bg']}; color: {b['error_color']};
                padding: 6px 18px; border-radius: 8px; font-size: 14px;
                border: 1px solid {b['error_bubble_border']}; max-width: 80%;">
                {safe_text}
            </div>
        </div>
        '''
        self.chat_display.append(html)
        self.scroll_to_bottom()

    def add_thinking_indicator(self):
        b = get_chat_bubble_css()
        fg = theme_color('fg')
        input_bg = theme_color('input_bg')
        border = theme_color('border')
        shimmer_dark = input_bg if is_dark_theme() else "#e2e8f0"
        shimmer_light = border if is_dark_theme() else "#cbd5e1"
        self._thinking_id = f"thinking_{datetime.now().timestamp()}"
        html = f'''
        <div id="{self._thinking_id}" style="margin: 10px 0; display: flex; justify-content: flex-start;">
            <div style="max-width: 82%;">
                <div style="color: {b['assistant_name_color']}; font-size: 13px; margin-bottom: 2px;">思考中...</div>
                <div class="skeleton-block" style="background: {input_bg}; border: 1px solid {border};
                    border-radius: 14px 14px 14px 4px; padding: 12px 16px; font-size: 15px;
                    line-height: 1.55; min-height: 36px;">
                    <div class="skeleton-line" style="height: 12px; margin: 4px 0;
                        background: linear-gradient(90deg, {shimmer_dark} 25%, {shimmer_light} 50%, {shimmer_dark} 75%);
                        border-radius: 6px; background-size: 200% 100%;
                        animation: skeleton-shimmer 1.5s ease-in-out infinite;"></div>
                    <div class="skeleton-line" style="height: 12px; margin: 4px 0; width: 75%;
                        background: linear-gradient(90deg, {shimmer_dark} 25%, {shimmer_light} 50%, {shimmer_dark} 75%);
                        border-radius: 6px; background-size: 200% 100%;
                        animation: skeleton-shimmer 1.5s ease-in-out 0.2s infinite;"></div>
                    <div class="skeleton-line" style="height: 12px; margin: 4px 0; width: 50%;
                        background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
                        border-radius: 6px; background-size: 200% 100%;
                        animation: skeleton-shimmer 1.5s ease-in-out 0.4s infinite;"></div>
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
        self.chat_display.append(html)
        self.scroll_to_bottom()

    def remove_thinking_indicator(self):
        try:
            cursor = self.chat_display.textCursor()
            cursor.movePosition(cursor.MoveOperation.End)
            doc = self.chat_display.document()
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

    def scroll_to_bottom(self):
        if self.chat_display and self.chat_display.verticalScrollBar():
            try:
                QTimer.singleShot(50, lambda:
                    self.chat_display.verticalScrollBar().setValue(
                        self.chat_display.verticalScrollBar().maximum()
                    )
                )
            except RuntimeError as e:
                logger.debug(f"操作失败: {e}")

    def analyze_data(self):
        """分析数据"""
        ctx = self._get_library_context()
        prompt = f"""【上下文】
{ctx}

【任务】
作为游戏数值策划专家，对当前库中的游戏数据进行全面分析：

1. 数据完整性评估 — 缺少哪些关键数据类型？各类型数量是否合理？
2. 数值平衡性诊断 — 是否有过高/过低的数值？同类数据间差异是否合理？
3. 内容多样性检查 — 是否存在同质化（多个条目名称/效果趋同）？
4. 关联完整性检查 — 技能是否绑定到角色/怪物？任务是否关联对话？
5. 优化优先级排序 — 最急需调整的3个问题，给出具体方案

请给出具体、可执行的优化方案，指出具体的条目名称和数值。"""
        self.user_input.setText(prompt)
        self.send_message()

    def suggest_skills(self):
        """技能建议"""
        ctx = self._get_library_context()
        roles_context = ""
        monsters_context = ""
        try:
            roles = self.data_manager.data.get("roles", [])
            monsters = self.data_manager.data.get("monsters", [])
            if roles:
                roles_context = "\n现有角色：\n"
                for r in roles[:10]:
                    roles_context += f"  {r.get('name', '?')} [{r.get('job', '?')}] HP:{r.get('hp', '?')} ATK:{r.get('atk', '?')}\n"
            if monsters:
                monsters_context = "\n现有怪物：\n"
                for m in monsters[:10]:
                    monsters_context += f"  {m.get('name', '?')} Lv{m.get('level', '?')} [{m.get('category', '?')}]\n"
        except Exception:
            self.logger.exception("怪物数据解析失败")

        prompt = f"""【上下文】
{ctx}
{roles_context}{monsters_context}

【任务】
为当前库设计5个奇幻RPG技能，要求：
1. 覆盖不同定位（攻击/防御/治疗/控制/增益各至少1个）
2. 如果已有角色/怪物数据，为其中2-3个设计专属技能
3. 每个技能有创新的机制设计（不是简单的"造成X点伤害"）
4. 技能之间有潜在的组合连招关系
5. 数值参考现有角色/怪物的属性范围设定
6. 附带技能名称、类型、效果描述和推荐数值"""
        self.user_input.setText(prompt)
        self.send_message()

    def optimize_balance(self):
        """优化平衡"""
        ctx = self._get_library_context()
        prompt = f"""【上下文】
{ctx}

【任务】
对当前库中的游戏数据进行平衡性诊断和优化：

1. 找出数据异常项（数值过高/过低的条目，指出具体名称和数值）
2. 每个异常项给出调整建议（当前值→建议值+调整理由）
3. 评估整体数值梯度是否合理（如低等级→高等级怪物的属性递增是否平滑）
4. 如果有多个同类数据，分析差异化是否足够
5. 给出一个简短的整体平衡性评分（1-10分）

输出格式：先列出问题清单，然后逐项给出调整方案，最后给出总评。"""
        self.user_input.setText(prompt)
        self.send_message()

    def check_plan(self):
        """检查策划"""
        ctx = self._get_library_context()
        prompt = f"""【上下文】
{ctx}

【任务】
作为资深游戏策划，对当前库的游戏方案进行全面审查：

1. 世界观完整性 — 背景设定是否自洽？有无逻辑漏洞？
2. 玩法丰富度 — 核心循环是否吸引人？系统深度是否足够？
3. 内容缺口 — 当前还缺少哪些关键的9类数据？
4. 数据关联性 — 角色→技能、任务→对话、故事→场景的关联是否紧密？
5. 玩家体验 — 新手引导/成长节奏/长期留存的合理性评估
6. 创意亮点 — 当前方案最独特的卖点是什么？如何进一步强化？

逐条分析并给出具体改进建议。"""
        self.user_input.setText(prompt)
        self.send_message()

    def generate_plan(self):
        """生成策划"""
        ctx = self._get_library_context()
        prompt = f"""【上下文】
{ctx}

【任务】
为当前库生成一份完整的奇幻RPG游戏策划方案，必须包含：

1. 核心理念（一句话总结 + 300字详细阐述）
2. 世界观设定（世界历史、地理环境、主要势力）
3. 职业体系（至少5个职业，各自定位、特色、核心技能方向）
4. 战斗系统（回合制/即时制选择，核心机制说明）
5. 成长体系（等级、属性、装备、技能树的进阶路径）
6. 经济系统（货币、交易、产出的基本设计）
7. 数值规范（HP/ATK/DEF的数值区间定义，等级对应的属性增长公式）
8. AI生成规范（定义每种数据类型的生成规则、命名风格、数值约束）

要求：文档结构化、专业可落地、所有数值要有明确定义和公式。"""
        self.user_input.setText(prompt)
        self.send_message()

    def clear_conversation(self):
        """清空对话"""
        reply = QMessageBox.question(
            self, "确认", "确定要清空对话历史吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            self.conversation_history = []
            self.chat_display.clear()
            self.add_system_message("对话已清空，开始新的对话！")
