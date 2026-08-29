"""主题系统冒烟测试"""
import unittest
import sys
from pathlib import Path

_PROJ_ROOT = Path(__file__).resolve().parent.parent.parent
_SRC = str(_PROJ_ROOT / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

# 主题系统依赖 PyQt6，缺失时整体跳过
try:
    import PyQt6  # noqa: F401
    _HAS_PYQT = True
except ImportError:
    _HAS_PYQT = False


class TestThemeConfigs(unittest.TestCase):
    """主题配置数据验证"""

    @classmethod
    def setUpClass(cls):
        if not _HAS_PYQT:
            raise unittest.SkipTest("PyQt6 未安装，主题系统测试跳过")
        from ui.themes import _THEME_CONFIGS, THEMES
        cls.CONFIGS = _THEME_CONFIGS
        cls.QSS = THEMES

    def test_ten_themes_defined(self):
        """10 套主题都已定义"""
        self.assertEqual(len(self.CONFIGS), 10)

    def test_theme_names_unique(self):
        """主题名不重复"""
        names = list(self.CONFIGS.keys())
        self.assertEqual(len(names), len(set(names)))

    def test_each_theme_has_required_tokens(self):
        """每套主题都有必要的颜色 Token"""
        required = ['bg', 'fg', 'accent', 'hint', 'border', 'input_bg',
                     'scroll', 'btn_text', 'accent_bg', 'accent_hover',
                     'accent_active', 'disabled_bg', 'disabled_fg']
        for name, cfg in self.CONFIGS.items():
            for token in required:
                self.assertIn(token, cfg,
                              f"主题 '{name}' 缺少 Token: '{token}'")

    def test_qss_generated_for_all_themes(self):
        """所有主题的 QSS 都已生成"""
        self.assertEqual(len(self.QSS), len(self.CONFIGS))
        for name, qss in self.QSS.items():
            self.assertIsInstance(qss, str, f"主题 '{name}' QSS 不是字符串")
            self.assertGreater(len(qss), 100, f"主题 '{name}' QSS 太短")

    def test_accent_colors_distinct(self):
        """各主题 accent 颜色有区分度（无完全重复）"""
        accents = {name: cfg['accent'].upper() for name, cfg in self.CONFIGS.items()}

        duplicates = []
        names = list(accents.keys())
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                if accents[names[i]] == accents[names[j]]:
                    duplicates.append(f"{names[i]} ↔ {names[j]}: {accents[names[i]]}")

        if duplicates:
            self.fail("以下主题 accent 颜色重复:\n" + "\n".join(duplicates))

    def test_dark_light_split(self):
        """暗色/亮色主题分类正确"""
        from ui.themes import _is_dark_theme
        dark = {n for n, c in self.CONFIGS.items() if _is_dark_theme(c)}
        self.assertGreater(len(dark), 0, "至少应有 1 套暗色主题")
        self.assertLess(len(dark), len(self.CONFIGS), "至少应有 1 套亮色主题")

    def test_token_format_valid(self):
        """颜色 Token 格式合法（hex/rgba/CSS命名颜色）"""
        import re
        color_pat = re.compile(
            r'^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|'
            r'white|black|transparent|inherit|initial)$'
        )

        color_keys = ['accent', 'accent_hover', 'accent_active',
                       'bg', 'fg', 'hint', 'input_bg', 'scroll',
                       'btn_text', 'disabled_bg', 'disabled_fg']
        for name, cfg in self.CONFIGS.items():
            for key in color_keys:
                if key in cfg:
                    val = cfg[key]
                    if not color_pat.match(val):
                        self.fail(f"主题 '{name}' Token '{key}'='{val}' 格式非法")


class TestThemeSwitching(unittest.TestCase):
    """主题切换运行时验证"""

    @classmethod
    def setUpClass(cls):
        if not _HAS_PYQT:
            raise unittest.SkipTest("PyQt6 未安装，主题系统测试跳过")

    def test_switch_all_themes_no_error(self):
        """10 套主题依次切换不报错"""
        from ui.themes import set_current_theme, get_theme_colors, _THEME_CONFIGS

        for name in _THEME_CONFIGS:
            set_current_theme(name)
            colors = get_theme_colors()
            self.assertIsInstance(colors, dict)
            self.assertIn('bg', colors, f"切换后 '{name}' 缺少 bg 颜色")
            self.assertIn('accent', colors, f"切换后 '{name}' 缺少 accent 颜色")

    def test_theme_color_helper(self):
        """theme_color() 辅助函数能正确取值"""
        from ui.themes import set_current_theme, theme_color, _THEME_CONFIGS

        for name in _THEME_CONFIGS:
            set_current_theme(name)
            accent = theme_color('accent')
            expected = _THEME_CONFIGS[name]['accent']
            self.assertEqual(accent.upper(), expected.upper(),
                             f"主题 '{name}' theme_color('accent') 不匹配")

    def test_agent_colors_present(self):
        """所有主题的 Agent 颜色都存在"""
        agent_keys = ['agent_steward', 'agent_operator', 'agent_schema',
                       'agent_planner', 'agent_analyst', 'agent_web',
                       'agent_media', 'agent_dev', 'agent_ops', 'agent_fixer']
        from ui.themes import _THEME_CONFIGS
        for name, cfg in _THEME_CONFIGS.items():
            for key in agent_keys:
                self.assertIn(key, cfg, f"主题 '{name}' 缺少 Agent 颜色: '{key}'")


if __name__ == '__main__':
    unittest.main()
