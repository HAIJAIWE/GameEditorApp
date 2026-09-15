"""SafetyGuard 单元测试"""
import os
import sys

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from core.agent.safety_guard import SafetyGuard


@pytest.fixture
def guard():
    return SafetyGuard(max_tokens=12000, keep_system_first=2)


class TestCheckDangerous:
    """check_dangerous 方法测试"""

    def test_check_dangerous_shell_tool(self, guard):
        """system.shell 应该被标记为危险"""
        ctx = {}
        msgs = []
        results = {}
        assert guard.check_dangerous("system.shell", {}, ctx, msgs, results, 0) is True

    def test_check_dangerous_read_only(self, guard):
        """system.game_data 的 query 操作不应被标记为危险"""
        ctx = {}
        msgs = []
        results = {}
        assert guard.check_dangerous("system.game_data", {"action": "query"}, ctx, msgs, results, 0) is False

    def test_check_dangerous_delete_action(self, guard):
        """system.file_ops 的 delete 操作应该被标记为危险"""
        ctx = {}
        msgs = []
        results = {}
        assert guard.check_dangerous("system.file_ops", {"action": "delete"}, ctx, msgs, results, 0) is True

    def test_check_dangerous_data_delete(self, guard):
        """delete_current_item 应该被标记为危险"""
        ctx = {}
        msgs = []
        results = {}
        assert guard.check_dangerous("delete_current_item", {}, ctx, msgs, results, 0) is True

    def test_check_dangerous_safe_tool(self, guard):
        """system.game_data 的 list 操作不应被标记为危险"""
        ctx = {}
        msgs = []
        results = {}
        assert guard.check_dangerous("system.game_data", {"action": "list"}, ctx, msgs, results, 0) is False


class TestReplanStep:
    """replan_step 方法测试"""

    def test_replan_step_returns_alternatives(self, guard):
        """replan_step 应该返回包含替代方案的建议文本"""
        messages = [{"role": "user", "content": "帮我创建一个角色"}]
        context = {"messages": messages}
        result = guard.replan_step("system.game_data", {"action": "create"}, "执行失败", messages, context)
        assert "自动重规划" in result
        assert "system.game_data" in result
        assert "替代方案" in result


class TestTrimMessages:
    """trim_messages 方法测试"""

    def test_trim_messages_short(self, guard):
        """短消息列表不应被裁剪"""
        msgs = [
            {"role": "system", "content": "你是一个助手"},
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "你好！"},
        ]
        sum(len(m["content"]) for m in msgs)
        guard.trim_messages(msgs)
        # 短消息不应被修改
        assert msgs[0]["content"] == "你是一个助手"
        assert msgs[1]["content"] == "你好"

    def test_trim_messages_long(self, guard):
        """超长消息应该被裁剪"""
        # keep_system_first=2，前2条视为系统消息保留
        # 第3条及之后的非system消息才会被_trim_non_system处理
        # 注意：tiktoken 对纯重复字符会 BPE 合并，50000 个 "A" 仅约 6250 token
        # 需要确保 token 数超过 max_tokens=12000，用中英混合内容
        long_content = "你好世界Hello" * 5000  # 60000 字符 ≈ 37500 token > 12000
        msgs = [
            {"role": "system", "content": "系统提示1"},
            {"role": "system", "content": "系统提示2"},
            {"role": "user", "content": long_content},
            {"role": "assistant", "content": "回复"},
        ]
        guard.trim_messages(msgs)
        # 超长内容应该被压缩
        assert len(msgs[2]["content"]) < len(long_content)


class TestEstimateTokens:
    """_estimate_tokens 方法测试"""

    def test_estimate_tokens(self):
        """_estimate_tokens 应该返回正整数"""
        result = SafetyGuard._estimate_tokens("Hello, world! 你好世界")
        assert isinstance(result, int)
        assert result > 0
