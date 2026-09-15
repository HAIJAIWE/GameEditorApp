from typing import Optional

from PyQt6.QtCore import QEasingCurve, QObject, QPoint, QPropertyAnimation, QRect, QTimer
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (
    QComboBox,
    QGraphicsDropShadowEffect,
    QLineEdit,
    QListWidget,
    QPushButton,
    QWidget,
)

from common.logger import get_logger

logger = get_logger()


def _get_theme_colors():
    """获取当前主题颜色令牌"""
    from ui.themes import get_theme_colors, is_dark_theme
    return get_theme_colors(), is_dark_theme()


class EffectFactory:
    """特效工厂 - 统一管理发光、脉冲、滑动、淡入淡出动画"""

    @staticmethod
    def create_neon_effect(
        color: Optional[QColor] = None,
        radius: int = 15,
        offset_x: int = 0,
        offset_y: int = 0,
    ) -> QGraphicsDropShadowEffect:
        effect = QGraphicsDropShadowEffect()
        effect.setColor(color if color else QColor(14, 165, 233))
        effect.setBlurRadius(radius)
        effect.setOffset(offset_x, offset_y)
        return effect

    @staticmethod
    def create_pulse_animation(widget: QWidget, duration: int = 1000) -> QPropertyAnimation:
        animation = QPropertyAnimation(widget, b"opacity")
        animation.setDuration(duration)
        animation.setLoopCount(-1)
        animation.setKeyValueAt(0, 1.0)
        animation.setKeyValueAt(0.5, 0.7)
        animation.setKeyValueAt(1, 1.0)
        return animation

    @staticmethod
    def create_slide_animation(
        widget: QWidget, start_pos: QPoint, end_pos: QPoint, duration: int = 400
    ) -> QPropertyAnimation:
        animation = QPropertyAnimation(widget, b"pos")
        animation.setDuration(duration)
        animation.setEasingCurve(QEasingCurve.Type.InOutCubic)
        animation.setStartValue(start_pos)
        animation.setEndValue(end_pos)
        return animation

    @staticmethod
    def create_fade_animation(
        widget: QObject, start_opacity: float = 0.0, end_opacity: float = 1.0, duration: int = 300
    ) -> QPropertyAnimation:
        # QPropertyAnimation 的动画目标可以是任意 QObject（如 QWidget 或
        # QGraphicsOpacityEffect），故目标类型放宽为 QObject 而非 QWidget。
        animation = QPropertyAnimation(widget, b"opacity")
        animation.setDuration(duration)
        animation.setStartValue(start_opacity)
        animation.setEndValue(end_opacity)
        return animation


def _glow_button_qss():
    """根据当前主题生成 GlowButton QSS"""
    cfg, dark = _get_theme_colors()
    if dark:
        return f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 {cfg['input_bg']}, stop:1 {cfg['bg']});
                color: {cfg['fg']};
                border: 2px solid {cfg['accent']};
                padding: 10px 24px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 13px;
            }}
            QPushButton:hover {{
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 {cfg.get('accent_light', cfg['input_bg'])}, stop:1 {cfg['input_bg']});
                border-color: {cfg.get('accent_hover', cfg['accent'])};
                color: {cfg['fg']};
            }}
            QPushButton:pressed {{
                background: {cfg.get('accent_active', cfg['accent'])};
                padding: 10px 22px;
            }}
            QPushButton:disabled {{
                background-color: {cfg.get('disabled_bg', '#333')};
                border-color: {cfg.get('border', '#555')};
                color: {cfg.get('disabled_fg', '#666')};
            }}
        """
    else:
        return f"""
            QPushButton {{
                background: {cfg['accent']};
                color: {cfg.get('btn_text', 'white')};
                border: none;
                padding: 10px 24px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 13px;
            }}
            QPushButton:hover {{
                background: {cfg.get('accent_hover', cfg['accent'])};
            }}
            QPushButton:pressed {{
                background: {cfg.get('accent_active', cfg['accent'])};
                padding: 10px 22px;
            }}
            QPushButton:disabled {{
                background-color: {cfg.get('disabled_bg', '#e2e8f0')};
                color: {cfg.get('disabled_fg', '#94a3b8')};
            }}
        """


def _glow_lineedit_qss():
    """根据当前主题生成 GlowLineEdit QSS"""
    cfg, dark = _get_theme_colors()
    return f"""
        QLineEdit {{
            background-color: {cfg['input_bg']};
            color: {cfg['fg']};
            border: 2px solid {cfg.get('border', '#ccc')};
            border-radius: 8px;
            padding: 10px 14px;
            selection-background-color: {cfg['accent']};
            selection-color: {cfg.get('btn_text', 'white')};
            font-size: 13px;
        }}
        QLineEdit:focus {{
            border-color: {cfg['accent']};
        }}
    """


def _glow_combobox_qss():
    """根据当前主题生成 GlowComboBox QSS"""
    cfg, dark = _get_theme_colors()
    return f"""
        QComboBox {{
            background-color: {cfg['input_bg']};
            color: {cfg['fg']};
            border: 2px solid {cfg.get('border', '#ccc')};
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 13px;
            min-width: 150px;
        }}
        QComboBox:focus {{
            border-color: {cfg['accent']};
        }}
        QComboBox::drop-down {{
            border-left: 2px solid {cfg.get('border', '#ccc')};
            border-radius: 0 8px 8px 0;
        }}
        QComboBox::down-arrow {{
            image: none;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 5px solid {cfg['hint']};
            width: 0;
            height: 0;
        }}
        QComboBox QAbstractItemView {{
            background-color: {cfg['input_bg']};
            color: {cfg['fg']};
            border: 2px solid {cfg['accent']};
            border-radius: 8px;
        }}
        QComboBox QAbstractItemView::item {{
            padding: 8px 12px;
        }}
        QComboBox QAbstractItemView::item:hover {{
            background-color: {cfg.get('accent_light', cfg['input_bg'])};
        }}
    """


def _glow_listwidget_qss():
    """根据当前主题生成 GlowListWidget QSS"""
    cfg, dark = _get_theme_colors()
    return f"""
        QListWidget {{
            background-color: {cfg['input_bg']};
            color: {cfg['fg']};
            border: 2px solid {cfg.get('border', '#ccc')};
            border-radius: 8px;
            alternate-background-color: {cfg.get('accent_light', cfg['input_bg'])};
            font-size: 13px;
        }}
        QListWidget::item {{
            padding: 8px 12px;
            border-radius: 4px;
        }}
        QListWidget::item:selected {{
            background-color: {cfg['accent']};
            color: {cfg.get('btn_text', 'white')};
        }}
        QListWidget::item:hover {{
            background-color: {cfg.get('accent_light', cfg['input_bg'])};
        }}
    """


class GlowButton(QPushButton):
    """带发光特效的按钮"""

    def __init__(self, text: str = "", parent: Optional[QWidget] = None):
        super().__init__(text, parent)
        cfg, dark = _get_theme_colors()
        accent_color = QColor(cfg['accent'])
        accent_hover_color = QColor(cfg.get('accent_hover', cfg['accent']))
        accent_active_color = QColor(cfg.get('accent_active', cfg['accent']))

        self.normal_effect = EffectFactory.create_neon_effect(accent_color, 10)
        self.hover_effect = EffectFactory.create_neon_effect(accent_hover_color, 20)
        self.pressed_effect = EffectFactory.create_neon_effect(accent_active_color, 8)

        self.setStyleSheet(_glow_button_qss())

        self.scale_animation = QPropertyAnimation(self, b"geometry")
        self.scale_animation.setDuration(150)
        self.scale_animation.setEasingCurve(QEasingCurve.Type.OutQuad)

    def enterEvent(self, event):
        try:
            self.setGraphicsEffect(self.hover_effect)
            self._animate_scale(1.05)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().enterEvent(event)

    def leaveEvent(self, event):
        try:
            self.setGraphicsEffect(self.normal_effect)
            self._animate_scale(1.0)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().leaveEvent(event)

    def mousePressEvent(self, event):
        try:
            self.setGraphicsEffect(self.pressed_effect)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event):
        try:
            self.setGraphicsEffect(self.normal_effect)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().mouseReleaseEvent(event)

    def _animate_scale(self, target_scale: float):
        rect = self.geometry()
        current_width = rect.width()
        current_height = rect.height()
        new_width = int(current_width * target_scale)
        new_height = int(current_height * target_scale)
        x = rect.x() + (current_width - new_width) // 2
        y = rect.y() + (current_height - new_height) // 2

        new_rect = QRect(x, y, new_width, new_height)

        try:
            self.scale_animation.stop()
            self.scale_animation.setStartValue(rect)
            self.scale_animation.setEndValue(new_rect)
            self.scale_animation.start()
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")


class GlowLineEdit(QLineEdit):
    """带发光特效的输入框"""

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        cfg, dark = _get_theme_colors()
        border_color = QColor(cfg.get('border', '#ccc'))
        accent_color = QColor(cfg['accent'])

        self.normal_effect = EffectFactory.create_neon_effect(border_color, 5)
        self.focus_effect = EffectFactory.create_neon_effect(accent_color, 15)

        self.setGraphicsEffect(self.normal_effect)
        self.setStyleSheet(_glow_lineedit_qss())

    def focusInEvent(self, event):
        try:
            self.setGraphicsEffect(self.focus_effect)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().focusInEvent(event)

    def focusOutEvent(self, event):
        try:
            self.setGraphicsEffect(self.normal_effect)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().focusOutEvent(event)


class GlowComboBox(QComboBox):
    """带发光特效的下拉框"""

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        cfg, dark = _get_theme_colors()
        border_color = QColor(cfg.get('border', '#ccc'))
        accent_color = QColor(cfg['accent'])

        self.normal_effect = EffectFactory.create_neon_effect(border_color, 5)
        self.focus_effect = EffectFactory.create_neon_effect(accent_color, 15)
        self.setGraphicsEffect(self.normal_effect)

        self.setStyleSheet(_glow_combobox_qss())

    def focusInEvent(self, event):
        try:
            self.setGraphicsEffect(self.focus_effect)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().focusInEvent(event)

    def focusOutEvent(self, event):
        try:
            self.setGraphicsEffect(self.normal_effect)
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")
        super().focusOutEvent(event)


class GlowListWidget(QListWidget):
    """带发光特效的列表"""

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        cfg, dark = _get_theme_colors()
        border_color = QColor(cfg.get('border', '#ccc'))

        self.setStyleSheet(_glow_listwidget_qss())

        self.normal_effect = EffectFactory.create_neon_effect(border_color, 8)
        self.setGraphicsEffect(self.normal_effect)


class StatusIndicator(QWidget):
    """状态指示灯"""

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.setFixedSize(12, 12)
        self._active = False
        self.timer = QTimer()
        self.timer.timeout.connect(self._blink)
        self._blink_state = True

    def set_active(self, active: bool):
        self._active = active
        if active:
            try:
                self.timer.start(500)
            except RuntimeError as e:
                logger.debug(f"特效应用失败: {e}")
        else:
            try:
                self.timer.stop()
            except RuntimeError as e:
                logger.debug(f"特效应用失败: {e}")
            self._blink_state = True
        self.update()

    def _blink(self):
        try:
            self._blink_state = not self._blink_state
            self.update()
        except RuntimeError as e:
            logger.debug(f"特效应用失败: {e}")

    def paintEvent(self, event):
        from PyQt6.QtGui import QBrush, QPainter

        from ui.themes import theme_color
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        if self._active:
            accent = theme_color('accent')
            try:
                # 从十六进制颜色中解析 RGB 并生成闪烁效果
                r = int(accent[1:3], 16)
                g = int(accent[3:5], 16)
                b = int(accent[5:7], 16)
                color = QColor(r, g, b) if self._blink_state else QColor(r, g, b, 180)
            except (ValueError, IndexError):
                color = QColor(0, 255, 255) if self._blink_state else QColor(0, 200, 255)
        else:
            color = QColor(100, 100, 100)

        painter.setBrush(QBrush(color))
        painter.drawEllipse(2, 2, 8, 8)
        painter.end()


class SuccessToast(QWidget):
    """成功提示弹出层"""

    def __init__(self, message: str, parent: Optional[QWidget] = None):
        super().__init__(parent)
        from ui.themes import theme_color
        accent = theme_color('accent')
        self.setStyleSheet(f"""
            QWidget {{
                background-color: {accent};
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-weight: bold;
                font-size: 14px;
            }}
        """)
        from PyQt6.QtWidgets import QHBoxLayout, QLabel
        layout = QHBoxLayout(self)
        layout.addWidget(QLabel("✓"))
        layout.addWidget(QLabel(message))
        layout.setSpacing(8)

        from PyQt6.QtWidgets import QGraphicsOpacityEffect
        self._opacity_effect = QGraphicsOpacityEffect(self)
        self._opacity_effect.setOpacity(0.0)
        self.setGraphicsEffect(self._opacity_effect)

        self.animation = EffectFactory.create_fade_animation(self._opacity_effect, 0.0, 1.0, 300)
        self.hide()

    def show(self, duration: int = 2000):
        super().show()
        self.animation.start()
        QTimer.singleShot(duration, self._fade_out)

    def _fade_out(self):
        fade_animation = EffectFactory.create_fade_animation(self._opacity_effect, 1.0, 0.0, 300)
        fade_animation.start()
        QTimer.singleShot(300, self.hide)
