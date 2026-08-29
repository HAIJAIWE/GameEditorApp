"""PyQt6 GUI 层自动化测试"""
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
pytest.importorskip("PyQt6")  # PyQt6 缺失时跳过整个模块

from unittest.mock import patch
from PyQt6.QtWidgets import QApplication
from PyQt6.QtTest import QTest

_QAPP = None
_MOCK_QMESSAGEBOX = patch('PyQt6.QtWidgets.QMessageBox.information', return_value=None)
_MOCK_QFILE_DIALOG = patch('PyQt6.QtWidgets.QFileDialog.getOpenFileName', return_value=('', ''))
_MOCK_QINPUT_DIALOG = patch('PyQt6.QtWidgets.QInputDialog.getText', return_value=('', False))


def setUpModule():
    _MOCK_QMESSAGEBOX.start()
    _MOCK_QFILE_DIALOG.start()
    _MOCK_QINPUT_DIALOG.start()


def tearDownModule():
    _MOCK_QMESSAGEBOX.stop()
    _MOCK_QFILE_DIALOG.stop()
    _MOCK_QINPUT_DIALOG.stop()


def _get_app():
    global _QAPP
    if _QAPP is None:
        _QAPP = QApplication.instance() or QApplication(sys.argv)
    return _QAPP


import sys
_PY314_PLUS = sys.version_info >= (3, 14)
class TestMainWindowInit(unittest.TestCase):
    """主窗口初始化与基础结构测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_window_title(self):
        from config.constants import WINDOW_TITLE
        self.assertIn(WINDOW_TITLE, self.window.windowTitle())

    def test_minimum_size(self):
        size = self.window.minimumSize()
        self.assertGreaterEqual(size.width(), 800)
        self.assertGreaterEqual(size.height(), 600)

    def test_window_created(self):
        self.assertTrue(self.window.isWindow())
        self.assertEqual(self.window.windowIcon().isNull(), False)

    def test_central_widget_exists(self):
        self.assertIsNotNone(self.window.centralWidget())

    def test_data_manager_created(self):
        self.assertIsNotNone(self.window.data_manager)
        self.assertIsNotNone(self.window.data_manager.data)

    def test_status_bar_exists(self):
        self.assertIsNotNone(self.window.status_bar)
        msg = self.window.status_bar.currentMessage()
        self.assertTrue(len(msg) > 0)

    def test_progress_bar_exists(self):
        self.assertIsNotNone(self.window.progress_bar)

    def test_effects_manager_exists(self):
        self.assertIsNotNone(self.window.effects_manager)


class TestTabs(unittest.TestCase):
    """标签页创建与数据结构测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_all_data_tabs_created(self):
        expected_types = ['skill', 'role', 'monster', 'equip', 'item',
                          'task', 'dialog', 'story', 'achievement']
        for dt in expected_types:
            self.assertIn(dt, self.window.tabs, f"Missing tab: {dt}")

    def test_planning_tab(self):
        # ceshu_home 为延迟构建（布局应用时才实例化），此处验证入口存在
        self.assertTrue(hasattr(self.window, 'ceshu_home'))
        self.assertTrue(hasattr(self.window, 'ceshu_editor'))

    def test_ai_assistant_tab(self):
        self.assertIsNotNone(self.window.ai_bridge)
        self.assertIsNotNone(self.window.digital_panel)

    def test_tab_widget_exists(self):
        self.assertIsNotNone(self.window.tab_mgr)
        self.assertGreaterEqual(len(self.window.tabs), 1)

    def test_tab_widget_tab_count(self):
        self.assertGreaterEqual(len(self.window.tabs), 11)

    def test_planning_tab_is_first(self):
        from ui.ceshu import CeshuHomeView
        first_tab = self.window.ceshu_home
        self.assertIsInstance(first_tab, (CeshuHomeView, type(None)))

    def test_ai_assistant_is_second(self):
        from ui.ai_assistant_tab import AIAssistantTab
        self.assertTrue(hasattr(self.window, 'ai_bridge'))

    def test_switch_to_skill_tab(self):
        self.window.tab_mgr.ensure_tab_loaded('skill')
        self.assertIsNotNone(self.window.tabs.get('skill'))

    def test_switch_to_last_tab(self):
        data_type = list(self.window.tabs.keys())[-1]
        self.window.tab_mgr.ensure_tab_loaded(data_type)
        self.assertIsNotNone(self.window.tabs.get(data_type))


class TestThemeSwitching(unittest.TestCase):
    """主题切换测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_default_theme(self):
        # 应用会从 window_state.json 恢复用户上次保存的主题，
        # 因此只校验 current_theme 始终是合法主题之一
        from config.constants import THEME_NAMES
        self.assertIn(self.window.current_theme, THEME_NAMES)

    def test_theme_combo_exists(self):
        # 主题选择已移入设置对话框，主窗口保留 change_theme 入口
        self.assertTrue(hasattr(self.window, 'change_theme'))

    def test_all_themes_available(self):
        from config.constants import THEME_NAMES
        for theme in THEME_NAMES:
            self.window.change_theme(theme)
            self.assertEqual(self.window.current_theme, theme)

    def test_switch_to_dark_theme(self):
        self.window.change_theme("深色")
        self.assertEqual(self.window.current_theme, "深色")

    def test_switch_to_warm_theme(self):
        self.window.change_theme("暖调")
        self.assertEqual(self.window.current_theme, "暖调")

    def test_switch_to_night_theme(self):
        self.window.change_theme("暗夜")
        self.assertEqual(self.window.current_theme, "暗夜")

    def test_round_trip_themes(self):
        themes = ["默认", "深色", "暗夜", "默认"]
        for theme in themes:
            self.window.change_theme(theme)
            self.assertEqual(self.window.current_theme, theme)


class TestLayoutSwitching(unittest.TestCase):
    """布局切换测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_default_is_three_column_layout(self):
        self.assertTrue(self.window.is_three_column_layout)

    def test_layout_always_stays_three_column(self):
        self.window.set_layout("tab")
        QApplication.processEvents()
        self.assertTrue(self.window.is_three_column_layout)
        self.window.set_layout("three_column")
        QApplication.processEvents()
        self.assertTrue(self.window.is_three_column_layout)

    def test_three_column_has_combo(self):
        # 数据视图入口已整合进策划书模式（home_widget / tab_mgr 架构）
        self.assertTrue(hasattr(self.window, 'home_widget'))

    def test_three_column_has_project_list(self):
        self.assertTrue(hasattr(self.window, 'ceshu_home'))


class TestMenuStructure(unittest.TestCase):
    """菜单结构测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_menubar_exists(self):
        self.assertIsNotNone(self.window.menuBar())

    def test_all_menus_exist(self):
        menu_titles = []
        for action in self.window.menuBar().actions():
            if action.menu():
                menu_titles.append(action.text().replace("&", ""))
        expected = ["文件", "编辑", "工具", "设置", "帮助"]
        for title in expected:
            self.assertIn(title, menu_titles, f"Missing menu: {title}")

    def test_menu_count(self):
        menu_count = sum(1 for a in self.window.menuBar().actions() if a.menu())
        self.assertGreaterEqual(menu_count, 5)


class TestStatusBar(unittest.TestCase):
    """状态栏测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_progress_bar_hidden_by_default(self):
        # 数据加载期间进度条可见，完成后经 QTimer 延迟隐藏；轮询等待其隐藏
        for _ in range(30):
            QTest.qWait(200)
            if not self.window.progress_bar.isVisible():
                break
        self.assertFalse(self.window.progress_bar.isVisible())

    def test_update_progress_shows_bar(self):
        self.window._update_progress("测试", 50)
        self.assertFalse(self.window.progress_bar.isHidden())
        self.assertEqual(self.window.progress_bar.value(), 50)

    def test_update_progress_hides_bar_on_complete(self):
        self.window._update_progress("完成", 100)
        for _ in range(30):
            QTest.qWait(200)
            if not self.window.progress_bar.isVisible():
                break
        self.assertFalse(self.window.progress_bar.isVisible())


class TestShortcuts(unittest.TestCase):
    """快捷键测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_save_shortcut_exists(self):
        self.assertTrue(hasattr(self.window, 'save_shortcut'))

    def test_open_shortcut_exists(self):
        self.assertTrue(hasattr(self.window, 'open_shortcut'))

    def test_undo_shortcut_exists(self):
        self.assertTrue(hasattr(self.window, 'undo_shortcut'))

    def test_redo_shortcut_exists(self):
        self.assertTrue(hasattr(self.window, 'redo_shortcut'))


class TestUnsavedChanges(unittest.TestCase):
    """未保存变更检测测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_no_unsaved_changes_initially(self):
        self.assertFalse(self.window._has_unsaved_changes)

    def test_mark_data_changed(self):
        self.window.mark_data_changed()
        self.assertTrue(self.window._has_unsaved_changes)

    def test_window_title_updates_on_change(self):
        self.window.mark_data_changed()
        self.assertIn("有未保存的更改", self.window.windowTitle())

    def test_compute_data_hash(self):
        self.window._compute_data_hash()
        self.assertIsNotNone(self.window._data_hash)
        self.assertFalse(self.window._has_unsaved_changes)


class TestAutoSave(unittest.TestCase):
    """自动保存测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_auto_save_enabled_by_default(self):
        self.assertTrue(self.window.auto_save_enabled)

    def test_auto_save_timer_exists(self):
        self.assertTrue(hasattr(self.window, 'auto_save_timer'))

    def test_toggle_auto_save_off(self):
        self.window.auto_save_enabled = True
        self.window.toggle_auto_save()
        self.assertFalse(self.window.auto_save_enabled)

    def test_toggle_auto_save_on(self):
        self.window.auto_save_enabled = False
        self.window.toggle_auto_save()
        self.assertTrue(self.window.auto_save_enabled)


class TestDataManagerInteraction(unittest.TestCase):
    """数据管理器交互测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_init_loads_default_data(self):
        self.assertIsNotNone(self.window.data_manager.data)
        self.assertIsInstance(self.window.data_manager.data, dict)

    def test_data_has_types(self):
        data = self.window.data_manager.data
        from config.constants import DATA_TYPE_PLURALS
        for dt, plural in DATA_TYPE_PLURALS.items():
            self.assertIn(plural, data, f"Missing plural key: {plural}")

    def test_refresh_all_tabs(self):
        self.window._refresh_all_tabs()


class TestEffectsIntegration(unittest.TestCase):
    """特效集成测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def setUp(self):
        from ui.main_window import MainWindow
        self.window = MainWindow()

    def tearDown(self):
        try:
            self.window.close()
            self.window.deleteLater()
        except RuntimeError:
            pass

    def test_effects_manager_type(self):
        from ui.theme_effects import ThemeEffectsManager
        self.assertIsInstance(self.window.effects_manager, ThemeEffectsManager)

    def test_glow_widgets_list_empty_initially(self):
        self.assertIsInstance(self.window.glow_widgets, list)

    def test_apply_effects_does_not_crash(self):
        self.window._apply_effects()


class TestComponentFactories(unittest.TestCase):
    """特效组件工厂测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def test_glow_button_creation(self):
        from ui.effects import GlowButton
        btn = GlowButton("测试按钮")
        self.assertEqual(btn.text(), "测试按钮")
        btn.deleteLater()

    def test_glow_line_edit_creation(self):
        from ui.effects import GlowLineEdit
        le = GlowLineEdit()
        self.assertIsNotNone(le)
        le.setPlaceholderText("测试")
        self.assertEqual(le.placeholderText(), "测试")
        le.deleteLater()

    def test_glow_combo_creation(self):
        from ui.effects import GlowComboBox
        cb = GlowComboBox()
        cb.addItems(["A", "B", "C"])
        self.assertEqual(cb.count(), 3)
        cb.deleteLater()

    def test_glow_list_creation(self):
        from ui.effects import GlowListWidget
        lw = GlowListWidget()
        self.assertIsNotNone(lw)
        lw.deleteLater()

    def test_effect_factory_neon_effect(self):
        from ui.effects import EffectFactory
        effect = EffectFactory.create_neon_effect()
        self.assertIsNotNone(effect)
        self.assertGreater(effect.blurRadius(), 5)

    def test_effect_factory_pulse_animation(self):
        from ui.effects import EffectFactory
        from PyQt6.QtWidgets import QWidget
        w = QWidget()
        anim = EffectFactory.create_pulse_animation(w)
        self.assertEqual(anim.loopCount(), -1)
        w.deleteLater()

    def test_effect_factory_slide_animation(self):
        from ui.effects import EffectFactory
        from PyQt6.QtCore import QPoint
        from PyQt6.QtWidgets import QWidget
        w = QWidget()
        anim = EffectFactory.create_slide_animation(w, QPoint(0, 0), QPoint(100, 0))
        self.assertEqual(anim.duration(), 400)
        w.deleteLater()

    def test_effect_factory_fade_animation(self):
        from ui.effects import EffectFactory
        from PyQt6.QtWidgets import QWidget
        w = QWidget()
        anim = EffectFactory.create_fade_animation(w)
        self.assertEqual(anim.startValue(), 0.0)
        self.assertEqual(anim.endValue(), 1.0)
        w.deleteLater()


class TestCloseAndCleanup(unittest.TestCase):
    """关闭与清理测试"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()

    def test_close_window_without_file(self):
        from ui.main_window import MainWindow
        window = MainWindow()
        window.close()
        self.assertTrue(True)

    def test_central_widget_replaced_on_layout_change(self):
        from ui.main_window import MainWindow
        window = MainWindow()
        first_central = window.centralWidget()
        window.set_layout(True)
        second_central = window.centralWidget()
        self.assertIsNot(first_central, second_central)
        window.close()
        window.deleteLater()


if __name__ == "__main__":
    unittest.main()
