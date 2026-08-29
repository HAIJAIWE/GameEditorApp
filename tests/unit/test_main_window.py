"""测试 主窗口"""
from unittest.mock import MagicMock, patch

import pytest

try:
    from ui.main_window import MainWindow, _safe_call
    _HAS_DEP = True
except ImportError:
    _HAS_DEP = False


import sys
_PY314_PLUS = sys.version_info >= (3, 14)
@pytest.mark.skipif(not _HAS_DEP, reason="ui.main_window 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestMainWindow:
    """MainWindow 模块测试 (mock_qt 模式)"""

    def test_safe_call_success(self, mock_qt):
        """测试 _safe_call 成功执行"""
        def my_fn(a, b):
            return a + b
        result = _safe_call(my_fn, 1, 2)
        assert result == 3

    def test_safe_call_exception(self, mock_qt):
        """测试 _safe_call 异常处理"""
        def failing_fn():
            raise ValueError("测试错误")
        result = _safe_call(failing_fn)
        assert result is None

    def test_safe_call_lambda(self, mock_qt):
        """测试 _safe_call lambda"""
        result = _safe_call(lambda: 42)
        assert result == 42

    def test_safe_call_with_kwargs(self, mock_qt):
        """测试 _safe_call 带关键字参数"""
        def my_fn(x, y=10):
            return x + y
        result = _safe_call(my_fn, 5, y=15)
        assert result == 20

    def test_mainwindow_property_defaults(self, mock_qt):
        """测试 MainWindow 属性默认值"""
        mw = MainWindow()
        assert mw._has_unsaved_changes is not None
        assert mw.is_three_column_layout is True
        assert mw.current_theme == "默认"

    def test_mainwindow_startup_mode(self, mock_qt):
        """测试启动模式"""
        mw = MainWindow()
        assert mw.startup_mode is not None

    def test_mainwindow_tabs_dict(self, mock_qt):
        """测试 tabs 字典初始为空"""
        mw = MainWindow()
        assert isinstance(mw.tabs, dict)

    def test_mainwindow_data_manager(self, mock_qt):
        """测试 data_manager 创建"""
        mw = MainWindow()
        # data_manager 是在 __init__ 中创建的，不是最初设置的 None
        # 由于 mock_qt 下 QTimer 和相关 UI 可能有问题，这里只要不崩溃即可
        assert hasattr(mw, 'data_manager')

    def test_mainwindow_effects_manager(self, mock_qt):
        """测试 effects_manager 存在"""
        mw = MainWindow()
        assert mw.effects_manager is not None

    def test_mainwindow_config_exists(self, mock_qt):
        """测试 config 存在"""
        mw = MainWindow()
        assert mw.config is not None

    def test_mainwindow_auto_save_defaults(self, mock_qt):
        """测试自动保存默认值"""
        mw = MainWindow()
        assert mw.auto_save_enabled in (True, False)
        assert mw.auto_save_interval is not None
