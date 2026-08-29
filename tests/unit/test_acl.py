"""ACL 权限控制单元测试"""
import sys
import os

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest
from security.acl import (
    RiskLevel, check_permission, block_tool, block_action,
    unblock_tool, unblock_action, set_max_allowed_risk, require_confirm,
    _blocked_tools, _blocked_actions,
)


@pytest.fixture(autouse=True)
def reset_acl_state():
    """每个测试前后重置 ACL 全局状态"""
    _blocked_tools.clear()
    _blocked_actions.clear()
    set_max_allowed_risk(RiskLevel.SYSTEM)
    yield
    _blocked_tools.clear()
    _blocked_actions.clear()
    set_max_allowed_risk(RiskLevel.SYSTEM)


class TestCheckPermission:
    """check_permission 方法测试"""

    def test_check_permission_read_only(self):
        """READ_ONLY 工具应该被允许且无需确认"""
        allowed, risk, needs_confirm = check_permission("system.game_data", "query")
        assert allowed is True
        assert risk == RiskLevel.READ_ONLY
        assert needs_confirm is False

    def test_check_permission_system_needs_confirm(self):
        """SYSTEM 级别工具应该需要确认"""
        allowed, risk, needs_confirm = check_permission("system.shell")
        assert allowed is True
        assert risk == RiskLevel.SYSTEM
        assert needs_confirm is True

    def test_check_permission_unknown_defaults_data_write(self):
        """未知工具默认应为 DATA_WRITE 级别"""
        allowed, risk, needs_confirm = check_permission("unknown_tool_xyz")
        assert allowed is True
        assert risk == RiskLevel.DATA_WRITE

    def test_check_permission_blocked_tool(self):
        """block_tool 后该工具应该被拒绝"""
        block_tool("system.game_data")
        allowed, risk, needs_confirm = check_permission("system.game_data", "query")
        assert allowed is False

    def test_check_permission_blocked_action(self):
        """block_action 后特定操作应该被拒绝"""
        block_action("system.game_data", "delete")
        allowed, risk, needs_confirm = check_permission("system.game_data", "delete")
        assert allowed is False
        # 其他操作不受影响
        allowed2, _, _ = check_permission("system.game_data", "query")
        assert allowed2 is True

    def test_check_permission_unblock_tool(self):
        """unblock_tool 后工具应该恢复允许"""
        block_tool("system.game_data")
        allowed_before, _, _ = check_permission("system.game_data", "query")
        assert allowed_before is False

        unblock_tool("system.game_data")
        allowed_after, _, _ = check_permission("system.game_data", "query")
        assert allowed_after is True


class TestSetMaxAllowedRisk:
    """set_max_allowed_risk 测试"""

    def test_set_max_allowed_risk(self):
        """设置最大风险为 READ_ONLY 后应拒绝 DATA_WRITE"""
        set_max_allowed_risk(RiskLevel.READ_ONLY)
        allowed, risk, needs_confirm = check_permission("system.game_data", "create")
        assert allowed is False
        # READ_ONLY 操作仍应被允许
        allowed2, _, _ = check_permission("system.game_data", "query")
        assert allowed2 is True


class TestRequireConfirm:
    """require_confirm 测试"""

    def test_require_confirm_allowed(self):
        """安全工具的 require_confirm 应返回 True"""
        result = require_confirm(
            "system.game_data",
            {"action": "query"},
            lambda title, msg: True
        )
        assert result is True

    def test_require_confirm_blocked(self):
        """被禁止工具的 require_confirm 应返回 False"""
        block_tool("system.shell")
        result = require_confirm(
            "system.shell",
            {},
            lambda title, msg: True
        )
        assert result is False
