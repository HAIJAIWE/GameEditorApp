"""GameEditorApp 测试公共 fixtures

提供跨测试复用的 mock 对象和辅助工具。
src/ 路径自动注入 sys.path，确保测试可直接 import 项目模块。
"""

import os
import shutil
import sys
import tempfile

# 确保 src/ 在 sys.path 中
_src_dir = os.path.join(os.path.dirname(__file__), "..", "src")

# GUI 测试使用 offscreen Qt 平台（无原生窗口），避免 Windows COM/OLE 崩溃 (0x8001010d)
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
if _src_dir not in sys.path:
    sys.path.insert(0, os.path.abspath(_src_dir))

from unittest.mock import MagicMock

import pytest

# ── 基础 Mock Fixtures ──

@pytest.fixture
def mock_logger():
    """模拟 Logger — 静默记录所有调用"""
    logger = MagicMock()
    logger.info = MagicMock()
    logger.warning = MagicMock()
    logger.error = MagicMock()
    logger.debug = MagicMock()
    return logger


@pytest.fixture
def mock_config():
    """模拟 AppConfig — 最小可用配置"""
    config = MagicMock()
    config.get_api_config.return_value = {
        "api_key": "test-key",
        "base_url": "https://api.test.com",
        "model": "test-model",
    }
    config.get.return_value = None
    config.max_iterations = 10
    config.enable_stream = False
    config.enable_plan = False
    return config


@pytest.fixture
def mock_data_manager():
    """模拟 DataManager — 内存数据存储"""
    dm = MagicMock()
    dm._data = {}
    dm.get_all_data.return_value = []
    dm.get_data_by_type.return_value = []
    dm.get_item_by_name.return_value = None
    dm.add_item.return_value = True
    dm.update_item.return_value = True
    dm.delete_item.return_value = True
    return dm


@pytest.fixture
def mock_dispatcher():
    """模拟 ToolDispatcher"""
    dispatcher = MagicMock()
    dispatcher.execute.return_value = {"success": True, "message": "OK", "error": ""}
    dispatcher.get_tools_description.return_value = "tool_a: 描述A\ntool_b: 描述B"
    dispatcher.skill_count = 10
    return dispatcher


@pytest.fixture
def mock_planner():
    """模拟 Planner"""
    planner = MagicMock()
    planner.plan.return_value = {"steps": [], "goal": "test goal"}
    planner._normalize_step = lambda s: s
    return planner


# ── 临时目录 Fixture ──

@pytest.fixture
def temp_dir():
    """提供临时目录，测试结束后自动清理"""
    d = tempfile.mkdtemp(prefix="geapp_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def temp_session_dir(temp_dir):
    """提供 Agent 会话临时目录"""
    session_dir = os.path.join(temp_dir, "session")
    os.makedirs(session_dir)
    return session_dir


# ── PyQt6 Mock（避免 GUI 依赖） ──

@pytest.fixture(scope="session")
def qapp():
    """真实 QApplication（offscreen 平台，整个测试会话复用）

    PyQt6 要求构造 QWidget 之前必须存在 QApplication 实例，否则进程直接
    abort（退出码 0xC0000409），因此所有 UI 测试统一依赖此 fixture。
    """
    pytest.importorskip("PyQt6.QtWidgets")
    from PyQt6.QtWidgets import QApplication

    yield QApplication.instance() or QApplication([])


@pytest.fixture
def mock_qt(qapp, monkeypatch):
    """UI 测试环境

    真实 PyQt6 可用时直接使用真实 offscreen Qt（不 mock）——mock 与真实 Qt 混用
    会导致真实 QStyle/QWidget 收到 MagicMock 参数而报 TypeError；
    仅在 PyQt6 缺失时注入 MagicMock，保证 UI 模块仍可被导入。
    """
    try:
        import PyQt6.QtWidgets  # noqa: F401
    except ImportError:
        qt_modules = [
            "PyQt6", "PyQt6.QtCore", "PyQt6.QtGui", "PyQt6.QtWidgets",
            "PyQt6.QtNetwork", "PyQt6.QtSvg",
        ]
        for mod in qt_modules:
            monkeypatch.setitem(sys.modules, mod, MagicMock())


# ── 辅助工具 ──

class FakeCallback:
    """记录回调调用的测试辅助类"""

    def __init__(self):
        self.calls = []

    def __call__(self, event, data=None):
        self.calls.append((event, data))

    @property
    def last_event(self):
        return self.calls[-1][0] if self.calls else None

    @property
    def last_data(self):
        return self.calls[-1][1] if self.calls else None

    def event_count(self, event_name):
        return sum(1 for e, _ in self.calls if e == event_name)


@pytest.fixture
def fake_callback():
    """提供 FakeCallback 实例"""
    return FakeCallback()
