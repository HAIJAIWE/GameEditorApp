"""测试 AgentBrain — 智能体大脑核心"""
import pytest

try:
    from core.agent.brain import AgentBrain
    _HAS_DEP = True
except ImportError:
    _HAS_DEP = False


@pytest.mark.skipif(not _HAS_DEP, reason="core.agent.brain 模块不可用")
class TestAgentBrain:
    """AgentBrain 模块测试"""

    def test_create_default(self):
        """测试默认创建"""
        brain = AgentBrain()
        assert brain is not None
        assert brain._max_tokens == brain._DEFAULT_MAX_TOKENS
        assert brain._max_iterations == brain._DEFAULT_MAX_ITERATIONS

    def test_create_with_data_dir(self, temp_dir):
        """测试指定数据目录创建"""
        brain = AgentBrain(data_dir=temp_dir)
        assert brain.memory is not None

    def test_configure_max_tokens(self):
        """测试配置 max_tokens"""
        brain = AgentBrain()
        brain.configure(max_tokens=4096)
        assert brain._max_tokens == 4096

    def test_configure_max_iterations(self):
        """测试配置 max_iterations"""
        brain = AgentBrain()
        brain.configure(max_iterations=10)
        assert brain._max_iterations == 10

    def test_configure_invalid_values(self):
        """测试无效配置值"""
        brain = AgentBrain()
        brain.configure(max_tokens=0)  # 无效
        assert brain._max_tokens == brain._DEFAULT_MAX_TOKENS
        brain.configure(max_tokens=-1)  # 无效
        assert brain._max_tokens == brain._DEFAULT_MAX_TOKENS

    def test_health_check_returns_dict(self):
        """测试健康检查返回字典"""
        brain = AgentBrain()
        result = brain.health_check()
        assert isinstance(result, dict)
        assert "status" in result
        assert result["status"] == "running"

    def test_health_check_contains_expected_keys(self):
        """测试健康检查包含预期字段"""
        brain = AgentBrain()
        result = brain.health_check()
        expected_keys = [
            "status", "session_conv_count", "failure_count",
            "ai_available", "config", "memory"
        ]
        for key in expected_keys:
            assert key in result, f"缺少 key: {key}"

    def test_set_agent_manager(self):
        """测试设置 Agent 管理器"""
        brain = AgentBrain()
        mock_mgr = object()
        brain.set_agent_manager(mock_mgr)
        assert brain._agent_manager is mock_mgr

    def test_boot(self):
        """测试启动"""
        brain = AgentBrain()
        # boot 不应抛出异常
        brain.boot()

    def test_get_uptime(self):
        """测试获取运行时间"""
        brain = AgentBrain()
        uptime = brain.get_uptime()
        assert isinstance(uptime, float)
        assert uptime >= 0

    def test_get_session_stats(self):
        """测试获取会话统计"""
        brain = AgentBrain()
        stats = brain.get_session_stats()
        assert isinstance(stats, dict)
        assert "conversations" in stats
        assert "uptime_seconds" in stats

    def test_end_session(self):
        """测试结束会话（不应抛出异常）"""
        brain = AgentBrain()
        brain.end_session()

    def test_reload_workspace(self, temp_dir):
        """测试重载工作区"""
        brain = AgentBrain(data_dir=temp_dir)
        # 重载不应抛出异常
        brain.reload_workspace()

    def test_has_pending_session_new_brain(self):
        """测试新创建的 brain 无待处理会话"""
        brain = AgentBrain()
        assert brain.has_pending_session() is False
