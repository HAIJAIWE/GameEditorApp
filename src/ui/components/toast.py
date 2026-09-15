"""Toast 非阻塞通知组件"""
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QGraphicsOpacityEffect, QLabel, QVBoxLayout, QWidget

from ui.themes import theme_color


class Toast(QWidget):
    """非阻塞通知"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint |
                           Qt.WindowType.Tool |
                           Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)

        self._opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self._opacity_effect)
        self._opacity_effect.setOpacity(0.95)

        self._label = QLabel()
        self._label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._label.setStyleSheet(self._toast_qss("default"))

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self._label)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._fade_out)
        self._fade_steps = 0

    def _toast_qss(self, kind: str = "default") -> str:
        """生成主题化 Toast 样式表（P1-5: 替换硬编码 rgba 颜色）"""
        if kind == "error":
            bg = theme_color('danger') or '#c83c3c'
        elif kind == "success":
            bg = theme_color('accent') or '#3ca06a'
        else:
            bg = theme_color('bg') or '#323232'
        fg = theme_color('btn_text') or 'white'
        return f"""
            QLabel {{
                color: {fg};
                font-size: 13px;
                padding: 12px 24px;
                background-color: {bg};
                border-radius: 8px;
            }}
        """

    def show_message(self, text: str, duration: int = 3000,
                     success: bool = False, error: bool = False):
        """显示消息

        Args:
            text: 消息文本
            duration: 显示时长（毫秒）
            success: 是否为成功提示（绿色）
            error: 是否为错误提示（红色）
        """
        self._label.setText(text)

        if error:
            self._label.setStyleSheet(self._toast_qss("error"))
        elif success:
            self._label.setStyleSheet(self._toast_qss("success"))
        else:
            self._label.setStyleSheet(self._toast_qss("default"))

        self.adjustSize()

        # 居中显示在父窗口顶部
        parent = self.parent()
        if isinstance(parent, QWidget):
            parent_rect = parent.geometry()
            x = parent_rect.center().x() - self.width() // 2
            y = parent_rect.top() + 60
            self.move(x, y)

        self._opacity_effect.setOpacity(0.95)
        self.show()
        self.raise_()

        self._fade_steps = 0
        self._timer.start(duration // 2)  # 一半时间后开始淡出

    def _fade_out(self):
        """淡出动画"""
        self._fade_steps += 1
        opacity = max(0, 0.95 - self._fade_steps * 0.2)
        self._opacity_effect.setOpacity(opacity)

        if self._fade_steps >= 5:
            self._timer.stop()
            self.hide()
