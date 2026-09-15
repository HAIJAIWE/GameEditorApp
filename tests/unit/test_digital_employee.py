"""测试 数字员工 — 桌面智能助手"""

from unittest.mock import MagicMock

import pytest

try:
    from ui.digital_employee import DigitalEmployee, DigitalPanel
    _HAS_DEP = True
except ImportError:
    _HAS_DEP = False


@pytest.mark.skipif(not _HAS_DEP, reason="ui.digital_employee 模块不可用")
class TestDigitalEmployeeClasses:
    """数字员工类测试"""

    def test_digitalpanel_create(self, mock_qt):
        """测试 DigitalPanel 创建"""
        panel = DigitalPanel(None)
        assert panel is not None

    def test_digitalemployee_create(self, mock_qt):
        """测试 DigitalEmployee 创建（注入 mock brain，避免真实启动 AgentBrain）"""
        de = DigitalEmployee(brain=MagicMock())
        assert de is not None

    def test_digitalpanel_worker_initially_none(self, mock_qt):
        """测试 DigitalPanel 的 AgentWorker 在任务开始前为空"""
        panel = DigitalPanel(None)
        assert panel._worker is None
