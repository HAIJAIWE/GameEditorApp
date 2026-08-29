"""AI 智能体对话面板 — 右侧下半区常驻面板，接入8主题 + agent brain"""
from __future__ import annotations

import logging

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.agent.skills.ceshu_skill import AgentRouter

from .ceshu_theme import (
    ceshu_ai_agent_label_qss,
    ceshu_ai_chat_qss,
    ceshu_ai_input_qss,
    ceshu_ai_min_btn_qss,
    ceshu_ai_send_btn_qss,
    ceshu_ai_sep_qss,
    ceshu_ai_status_qss,
    theme_color,
)

logger = logging.getLogger(__name__)

# AI 调用耗时告警阈值（毫秒）：超过则记录 warning 日志
_AI_CALL_TIMEOUT_MS = 30_000
# AI 调用最大重试次数（除首次外的额外尝试次数）
_AI_MAX_RETRIES = 1


class AIChatPanel(QWidget):
    """常驻 AI 智能体对话面板"""

    message_sent = pyqtSignal(str)  # 用户输入的消息

    def __init__(self, parent=None):
        super().__init__(parent)
        self._current_chapter = "meta"
        self._minimized = False
        self._brain = None  # AgentBrain 引用，由外部 set_brain() 注入
        self._ceshu_model = None  # 当前策划书 model
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # 顶部：智能体名称 + 最小化按钮
        top = QHBoxLayout()

        self._agent_label = QLabel("通用策划助手")
        self._agent_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        self._agent_label.setAccessibleName("当前 AI 智能体名称")
        top.addWidget(self._agent_label)

        self._status_label = QLabel("在线")
        self._status_label.setAccessibleName("AI 在线状态")
        top.addWidget(self._status_label)

        top.addStretch()

        self._btn_min = QPushButton("—")
        self._btn_min.setFixedSize(28, 28)
        self._btn_min.clicked.connect(self._toggle_minimize)
        self._btn_min.setAccessibleName("最小化或展开 AI 面板")
        self._btn_min.setAccessibleDescription("点击切换 AI 对话面板的显示与隐藏")
        self._btn_min.setShortcut("Alt+M")
        self._btn_min.setToolTip("最小化/展开 (Alt+M)")
        top.addWidget(self._btn_min)

        layout.addLayout(top)

        # 分隔线
        self._sep = QFrame()
        self._sep.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(self._sep)

        # 对话历史
        self._chat = QTextEdit()
        self._chat.setReadOnly(True)
        self._chat.setPlaceholderText("AI 助手已就绪，随时可以对话...")
        self._chat.setAccessibleName("AI 对话历史记录")
        self._chat.setAccessibleDescription("显示用户与 AI 智能体的历史对话内容")
        layout.addWidget(self._chat)

        # 输入区域
        input_row = QHBoxLayout()
        self._input = QLineEdit()
        self._input.setPlaceholderText("输入问题或指令...")
        self._input.returnPressed.connect(self._on_send)
        self._input.setAccessibleName("AI 对话输入框")
        self._input.setAccessibleDescription("输入要发送给 AI 智能体的问题或指令，按回车发送")
        input_row.addWidget(self._input)

        self._btn_send = QPushButton("发送")
        self._btn_send.clicked.connect(self._on_send)
        self._btn_send.setAccessibleName("发送消息给 AI")
        self._btn_send.setAccessibleDescription("将输入框中的消息发送给 AI 智能体")
        self._btn_send.setShortcut("Alt+S")
        self._btn_send.setToolTip("发送 (Alt+S)")
        input_row.addWidget(self._btn_send)

        layout.addLayout(input_row)

        # 整体面板的可访问性描述
        self.setAccessibleName("AI 智能体对话面板")
        self.setAccessibleDescription("与 AI 策划助手对话的常驻面板")

    def _apply_theme(self) -> None:
        """应用当前主题色"""
        self._agent_label.setStyleSheet(ceshu_ai_agent_label_qss())
        self._status_label.setStyleSheet(ceshu_ai_status_qss())
        self._chat.setStyleSheet(ceshu_ai_chat_qss())
        self._input.setStyleSheet(ceshu_ai_input_qss())
        self._btn_send.setStyleSheet(ceshu_ai_send_btn_qss())
        self._btn_min.setStyleSheet(ceshu_ai_min_btn_qss())
        self._sep.setStyleSheet(ceshu_ai_sep_qss())

    def set_brain(self, brain) -> None:
        """注入 AgentBrain 引用"""
        self._brain = brain
        self._status_label.setText("在线" if brain else "离线")

    def set_ceshu_model(self, model) -> None:
        """注入当前策划书 model"""
        self._ceshu_model = model

    def set_context(self, chapter: str) -> None:
        """更新当前编辑章节上下文"""
        self._current_chapter = chapter
        agent_id = AgentRouter.route(chapter)
        display = AgentRouter.get_display_name(agent_id)
        self._agent_label.setText(display)

        # 添加系统提示
        hint = f"[系统] 检测到您正在编辑「{chapter}」，已切换到{display}"
        self._chat.append(f'<span style="color:{theme_color("hint")};font-size:11px;">{hint}</span>')

    def _on_send(self) -> None:
        text = self._input.text().strip()
        if not text:
            return
        self._chat.append(f'<b>你：</b> {text}')
        self._input.clear()
        self.message_sent.emit(text)

        # 尝试通过 agent brain 获取回复
        if self._brain:
            self._request_ai_response(text)
        else:
            self.append_response("AI 大脑尚未就绪，请稍后重试。", "系统")

    def _request_ai_response(self, text: str) -> None:
        """通过 AgentBrain 发送请求并获取回复。

        增强点：
        - 重试机制：失败时按 ``_AI_MAX_RETRIES`` 重试一次。
        - 耗时检测：用 ``time.monotonic`` 测量实际耗时，超过
          ``_AI_CALL_TIMEOUT_MS`` 时记录 warning 日志。
        - 异常分级：超时类 / 连接类 / 其他异常分别给出不同的友好消息。
        - 日志留痕：所有失败均通过 ``logger.warning`` 记录，便于排查。
        """
        import time

        # 构建上下文消息
        context = f"[策划书·{self._current_chapter}章] "
        if self._ceshu_model:
            game_name = self._ceshu_model.meta.get("game_name", "未命名")
            context += f"游戏「{game_name}」— "
        full_msg = context + text
        extra = {
            "ceshu_model": self._ceshu_model,
            "current_chapter": self._current_chapter,
        }

        # 状态反馈：切换到"思考中…"
        prev_status = self._status_label.text()
        self._status_label.setText("思考中…")

        start_t = time.monotonic()
        last_err: Exception | None = None
        result = None
        try:
            for attempt in range(_AI_MAX_RETRIES + 1):
                try:
                    result = self._brain.chat(full_msg, extra=extra)
                    if result:
                        break
                except TimeoutError as e:
                    last_err = e
                    logger.warning("AI 调用超时（第 %d 次）: %s", attempt + 1, e)
                except (ConnectionError, OSError) as e:
                    last_err = e
                    logger.warning("AI 调用网络异常（第 %d 次）: %s", attempt + 1, e)
                except Exception as e:
                    last_err = e
                    logger.warning("AI 调用异常（第 %d 次）: %s", attempt + 1, e)
                    # 非网络/超时类异常通常重试无益，直接退出
                    break
        finally:
            self._status_label.setText(prev_status)

        elapsed_ms = int((time.monotonic() - start_t) * 1000)
        if elapsed_ms > _AI_CALL_TIMEOUT_MS:
            logger.warning("AI 调用耗时 %d ms 超过阈值 %d ms",
                           elapsed_ms, _AI_CALL_TIMEOUT_MS)

        if result:
            agent_id = AgentRouter.route(self._current_chapter)
            display = AgentRouter.get_display_name(agent_id)
            self.append_response(str(result), display)
            return

        # 失败时给出友好提示（不暴露技术堆栈细节）
        if isinstance(last_err, TimeoutError):
            msg = f"AI 响应超时（已重试 {_AI_MAX_RETRIES} 次），请稍后重试。"
        elif isinstance(last_err, (ConnectionError, OSError)):
            msg = "AI 服务连接异常，请检查网络后重试。"
        elif last_err is not None:
            msg = "AI 处理请求时出现错误，请稍后重试。"
        else:
            msg = "AI 未返回有效回复，请重试。"
        self.append_response(msg, "错误")

    def append_response(self, text: str, agent_name: str = "") -> None:
        """显示 AI 回复"""
        accent = theme_color('agent_steward')
        prefix = f"[{agent_name}] " if agent_name else ""
        self._chat.append(f'<span style="color:{accent};"><b>{prefix}AI：</b> {text}</span>')

    def _toggle_minimize(self) -> None:
        """最小化/展开切换"""
        self._minimized = not self._minimized
        self._chat.setVisible(not self._minimized)
        self._input.setVisible(not self._minimized)
        self._btn_send.setVisible(not self._minimized)
        self._btn_min.setText("+" if self._minimized else "—")
