"""文字流光特效管理器 - 低调的动态流光效果"""
from PyQt6.QtCore import QTimer
from PyQt6.QtGui import QColor

from common.logger import get_logger
from ui.effects import EffectFactory

logger = get_logger()


# 各主题文字流光配色 - 低饱和度柔和配色
TEXT_GLOW_COLORS = {
    "默认": {
        "color1": (14, 165, 233),             # 青蓝
        "color2": (56, 189, 248),             # 天蓝
    },
    "暖调": {
        "color1": (217, 119, 6),              # 琥珀
        "color2": (251, 191, 36),             # 浅琥珀
    },
    "深色": {
        "color1": (56, 189, 248),              # 天蓝
        "color2": (125, 211, 252),            # 浅天蓝
    },
    "暗夜": {
        "color1": (192, 132, 252),            # 紫罗兰
        "color2": (216, 180, 254),            # 浅紫
    },
    "赛博霓虹": {
        "color1": (0, 240, 255),              # 赛博青
        "color2": (100, 255, 255),            # 浅赛博青
    },
    "赤焰": {
        "color1": (249, 115, 22),             # 引擎橙
        "color2": (251, 146, 60),             # 浅橙
    },
    "复古像素": {
        "color1": (74, 222, 128),             # 像素绿
        "color2": (134, 239, 172),            # 浅绿
    },
    "极光幽邃": {
        "color1": (45, 212, 191),             # 极光绿
        "color2": (94, 234, 212),             # 浅极光绿
    },
}


class TextGlowManager:
    """文字流光特效管理器"""

    def __init__(self):
        self._text_widgets = []
        self._timer = None
        self._phase = 0
        self._current_colors = None

    def apply_text_glow(self, theme_name: str, text_widgets: list):
        """
        给指定文字组件添加低调的流光效果

        Args:
            theme_name: 主题名称
            text_widgets: 需要添加流光的组件列表 [(widget, 'role_name'), ...]
                          角色类型: 'title'(标题), 'label'(标签), 'important'(重要文字)
        """
        self.clear()

        if theme_name not in TEXT_GLOW_COLORS:
            return

        self._current_colors = TEXT_GLOW_COLORS[theme_name]
        self._text_widgets = text_widgets

        # 启动流光动画
        self._start_text_glow()

    def clear(self):
        """清除所有文字流光效果"""
        if self._timer:
            try:
                self._timer.stop()
            except RuntimeError as e:
                logger.debug(f"特效应用失败: {e}")
            self._timer = None

        # 恢复所有组件的默认样式
        for widget, _ in self._text_widgets:
            try:
                widget.setGraphicsEffect(None)
            except Exception as e:
                logger.debug(f"特效应用失败: {e}")

        self._text_widgets.clear()
        self._phase = 0

    def _start_text_glow(self):
        """启动低调的文字流光动画"""
        self._timer = QTimer()
        self._timer.setInterval(150)

        def update_text_effects():
            try:
                self._phase = (self._phase + 1) % 60

                for i, (widget, role) in enumerate(self._text_widgets):
                    try:
                        # 每个组件稍微错开相位
                        offset = (i * 7) % 60
                        p = (self._phase + offset) % 60

                        # 较小的发光范围
                        if role == 'title':
                            base_size = 4
                            max_size = 10
                        elif role == 'important':
                            base_size = 3
                            max_size = 8
                        else:
                            base_size = 2
                            max_size = 6

                        # 计算当前的尺寸
                        t = (p % 30) / 30
                        if p >= 30:
                            t = 1 - t
                        glow_size = int(base_size + (max_size - base_size) * t)

                        # 计算当前颜色插值
                        c1r, c1g, c1b = self._current_colors['color1']
                        c2r, c2g, c2b = self._current_colors['color2']

                        r = int(c1r + (c2r - c1r) * t)
                        g = int(c1g + (c2g - c1g) * t)
                        b = int(c1b + (c2b - c1b) * t)

                        try:
                            color = QColor(r, g, b)
                            effect = EffectFactory.create_neon_effect(color, glow_size)
                            widget.setGraphicsEffect(effect)
                        except Exception as e:
                            logger.debug(f"特效应用失败: {e}")
                    except Exception as e:
                        logger.debug(f"特效应用失败: {e}")
            except Exception as e:
                logger.debug(f"特效应用失败: {e}")

        self._timer.timeout.connect(update_text_effects)
        self._timer.start()
