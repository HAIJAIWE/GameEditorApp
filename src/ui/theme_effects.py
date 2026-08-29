"""主题特效管理器 - 低调的流光动画效果 + 文字流光"""
from PyQt6.QtCore import QTimer
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import QGroupBox, QTabBar

from common.logger import get_logger
from ui.effects import EffectFactory
from ui.text_glow_effect import TextGlowManager

logger = get_logger()


# 各主题特效配色配置 - 低饱和度柔和配色
THEME_EFFECT_COLORS = {
    "科幻": {
        "glow_color": (0, 212, 255),           # 科幻青
        "hover_color": (0, 184, 230),           # 深科幻青
    },
    "赛博霓虹": {
        "glow_color": (255, 45, 149),           # 霓虹粉
        "hover_color": (224, 32, 128),          # 深霓虹粉
    },
    "赤焰": {
        "glow_color": (239, 68, 68),            # 火焰红
        "hover_color": (220, 38, 38),           # 深火焰红
    },
    "复古像素": {
        "glow_color": (51, 255, 51),            # CRT绿
        "hover_color": (42, 212, 42),           # 深CRT绿
    },
    "极光幽邃": {
        "glow_color": (52, 211, 153),           # 极光绿
        "hover_color": (45, 184, 132),          # 深极光绿
    },
    "暗夜": {
        "glow_color": (167, 139, 250),          # 紫罗兰
        "hover_color": (124, 58, 237),          # 深紫罗兰
    },
    "深色": {
        "glow_color": (56, 189, 248),           # 天蓝
        "hover_color": (2, 132, 199),           # 深蓝
    },
    "现代": {
        "glow_color": (99, 102, 241),           # 靛蓝
        "hover_color": (79, 70, 229),           # 深靛蓝
    },
    "默认": {
        "glow_color": (14, 165, 233),           # 青蓝
        "hover_color": (2, 132, 199),           # 深青蓝
    },
    "暖调": {
        "glow_color": (217, 119, 6),            # 琥珀
        "hover_color": (180, 83, 9),            # 深琥珀
    },
}


class ThemeEffectsManager:
    """主题特效管理器

    低调的流光动画效果：
    - 较小发光半径
    - 低饱和度颜色
    - 慢速动画
    - 文字流光效果
    """

    def __init__(self, main_window):
        self.main_window = main_window
        self._pulse_timer = None
        self.current_theme = None
        self._phase = 0
        self._all_widgets = []
        self._text_glow_manager = TextGlowManager()
        self._text_widgets = []

    def apply_theme_effects(self, theme_name, text_widgets=None):
        """应用指定主题的特效

        Args:
            theme_name: 主题名称
            text_widgets: 需要流光效果的文字组件列表 [(widget, 'role_name'), ...]
        """
        self.clear_effects()

        if theme_name not in THEME_EFFECT_COLORS:
            return

        self.current_theme = theme_name
        colors = THEME_EFFECT_COLORS[theme_name]

        # 收集所有需要添加特效的组件
        self._collect_widgets()

        # 启动流光动画
        self._phase = 0
        self._start_streamer_animation(colors)

        # 应用文字流光
        if text_widgets:
            self._text_widgets = text_widgets
            self._text_glow_manager.apply_text_glow(theme_name, text_widgets)

    def clear_effects(self):
        """清除所有特效"""
        # 停止定时器
        if self._pulse_timer:
            try:
                self._pulse_timer.stop()
            except RuntimeError as e:
                logger.debug(f"特效应用失败: {e}")
            self._pulse_timer = None

        # 移除所有组件的发光效果
        for w in self._all_widgets:
            try:
                w.setGraphicsEffect(None)
            except Exception as e:
                logger.debug(f"特效应用失败: {e}")
        self._all_widgets.clear()

        # 清除文字流光效果
        self._text_glow_manager.clear()

        self.current_theme = None
        self._phase = 0
        self._text_widgets.clear()

    def _collect_widgets(self):
        """收集所有需要添加特效的组件"""
        try:
            # 所有标签栏
            for tab_bar in self.main_window.findChildren(QTabBar):
                self._all_widgets.append(tab_bar)

            # 所有分组框
            for group_box in self.main_window.findChildren(QGroupBox):
                self._all_widgets.append(group_box)

            # 注意：不对大型容器组件（如 central widget）应用发光效果，避免性能问题
        except Exception as e:
            logger.debug(f"特效应用失败: {e}")

    def _start_streamer_animation(self, colors):
        """启动低调的流光动画"""
        c1 = colors["glow_color"]
        c2 = colors["hover_color"]

        # 创建动画定时器 - 优化：降频到300ms，减少CPU占用
        self._pulse_timer = QTimer()
        self._pulse_timer.setInterval(300)

        def update_streamer():
            try:
                self._phase = (self._phase + 1) % 20

                t = (self._phase % 10) / 10
                if self._phase >= 10:
                    t = 1 - t

                r = int(c1[0] + (c2[0] - c1[0]) * t)
                g = int(c1[1] + (c2[1] - c1[1]) * t)
                b = int(c1[2] + (c2[2] - c1[2]) * t)

                base_size = 5
                max_size = 12
                color = QColor(r, g, b)

                # 只对可见组件应用效果
                to_remove = []
                for i, w in enumerate(self._all_widgets):
                    try:
                        if not w.isVisible():
                            to_remove.append(w)
                            continue

                        offset = (i * 3) % 20
                        p = (self._phase + offset) % 20
                        ti = (p % 10) / 10
                        if p >= 10:
                            ti = 1 - ti
                        si = int(base_size + (max_size - base_size) * ti)

                        effect = EffectFactory.create_neon_effect(color, si)
                        w.setGraphicsEffect(effect)
                    except RuntimeError:
                        to_remove.append(w)
                    except Exception as e:
                        logger.debug(f"特效应用失败: {e}")

                for w in to_remove:
                    if w in self._all_widgets:
                        self._all_widgets.remove(w)
            except Exception as e:
                logger.debug(f"特效应用失败: {e}")

        self._pulse_timer.timeout.connect(update_streamer)
        self._pulse_timer.start()

        # 立即执行一次
        update_streamer()
