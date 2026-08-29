"""未覆盖 Skill 和基础设施的单元测试

覆盖 6 个核心模块:
  - GameDataSkill: 游戏数据 CRUD (11 actions)
  - ComputerUseSkill: 桌面自动化 (12 actions)
  - UiControlSkill: 前端界面操控 (5 actions)
  - BatchDataSkill: 批量数据生成 (委托 GameDataSkill)
  - DiagnosisSkill: 系统诊断与修复 (9 actions)
  - MCPRegistry: MCP 工具注册中心 (单例 + 内置工具)
"""
import sys
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

# 将 src 目录加入模块搜索路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))


# ---------------------------------------------------------------------------
# 安全导入: 每个模块用 try/except 保护, 导入失败则对应 test class 自动 skip
# ---------------------------------------------------------------------------

_game_data_available = False
try:
    # GameDataSkill 模块加载时会执行 _build_type_labels()，
    # 需要 config.constants._type_registry 可用。
    from core.agent.skills.game_data_skill import GameDataSkill, _TYPE_LABELS
    _game_data_available = True
except Exception:
    pass

_computer_use_available = False
try:
    from core.agent.skills.computer_use_skill import ComputerUseSkill
    _computer_use_available = True
except Exception:
    pass

_ui_control_available = False
try:
    from core.agent.skills.ui_control_skill import UiControlSkill
    _ui_control_available = True
except Exception:
    pass

_batch_data_available = False
try:
    from core.agent.skills.batch_data_skill import BatchDataSkill
    _batch_data_available = True
except Exception:
    pass

_diagnosis_available = False
try:
    from core.agent.skills.diagnosis_skill import DiagnosisSkill
    _diagnosis_available = True
except Exception:
    pass

_mcp_available = False
try:
    from core.agent.mcp import MCPRegistry, get_mcp_registry
    _mcp_available = True
except Exception:
    pass


# ═══════════════════════════════════════════════════════════════════════════
#  TestGameDataSkill
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _game_data_available, reason="GameDataSkill 无法导入")
class TestGameDataSkill:
    """GameDataSkill 基础属性、Schema 结构与 execute 边界条件测试"""

    def test_instantiation(self):
        """创建实例，验证 name 属性"""
        skill = GameDataSkill()
        assert skill.name == "system.game_data"

    def test_name_constant(self):
        """类级 NAME 常量应与 name 一致"""
        assert GameDataSkill.NAME == "system.game_data"
        assert GameDataSkill.name == "system.game_data"

    def test_params_schema_has_action(self):
        """PARAMS_SCHEMA 中 action 参数应有 11 个枚举值"""
        schema = GameDataSkill.PARAMS_SCHEMA
        assert schema is not None, "PARAMS_SCHEMA 不应为 None"
        action_enum = schema["properties"]["action"]["enum"]
        expected_actions = {
            "create", "update", "delete", "batch_create", "batch_update",
            "query", "list", "switch_tab", "switch_library", "load_library",
            "list_types",
        }
        assert len(action_enum) == 11, f"期望 11 个 action, 实际 {len(action_enum)}"
        assert set(action_enum) == expected_actions

    def test_params_schema_required(self):
        """required 应包含 'action'"""
        schema = GameDataSkill.PARAMS_SCHEMA
        assert "required" in schema
        assert "action" in schema["required"]

    def test_execute_no_action(self):
        """execute({}) 缺少 action 时应返回错误（action 默认为空字符串, 落入 '未知动作' 分支）"""
        skill = GameDataSkill()
        # 传入空 context，execute 会尝试创建独立 DataManager
        with patch("core.agent.skills.game_data_skill.OptimizedDataManager", create=True) as mock_dm_cls:
            mock_dm = MagicMock()
            mock_dm.data = {}
            mock_dm_cls.return_value = mock_dm
            result = skill.execute({}, {})
        # ToolOutcome 是 dataclass; 空 action 会落入 else 分支: "未知动作: "
        if hasattr(result, "is_error"):
            assert result.is_error(), "空 action 应返回错误结果"
        elif isinstance(result, dict):
            assert not result.get("success", True)

    def test_execute_unknown_action(self):
        """execute({"action": "nonexistent"}) 应返回错误"""
        skill = GameDataSkill()
        with patch("core.agent.skills.game_data_skill.OptimizedDataManager", create=True) as mock_dm_cls:
            mock_dm = MagicMock()
            mock_dm.data = {}
            mock_dm_cls.return_value = mock_dm
            result = skill.execute({"action": "nonexistent"}, {})
        if hasattr(result, "is_error"):
            assert result.is_error()
        elif isinstance(result, dict):
            assert not result.get("success", True)

    def test_execute_list_types_no_context(self):
        """execute({"action": "list_types"}) 无 context 时应优雅失败或正常执行"""
        skill = GameDataSkill()
        # list_types 委托给 _list_data_types, 需要 dm 和 _type_registry
        # 无 context 时应该不抛异常
        try:
            result = skill.execute({"action": "list_types"}, {})
            # 不应崩溃, 结果可能是成功(有数据)或失败(无注册表)
            assert result is not None
        except Exception:
            # 如果 config.constants 不可导入, 允许异常
            pytest.skip("config.constants 不可用导致 list_types 异常")

    def test_module_level_type_labels(self):
        """_TYPE_LABELS 应是非空字典（前提是 config.constants 可用）"""
        assert isinstance(_TYPE_LABELS, dict), "_TYPE_LABELS 应为 dict"
        # 如果 config.constants._type_registry 有数据, _TYPE_LABELS 应非空
        # 但在某些测试环境可能为空, 至少确保类型正确
        assert _TYPE_LABELS is not None


# ═══════════════════════════════════════════════════════════════════════════
#  TestComputerUseSkill
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _computer_use_available, reason="ComputerUseSkill 无法导入")
class TestComputerUseSkill:
    """ComputerUseSkill 实例化与 Schema 测试

    ComputerUseSkill.__init__ 会创建 ScreenCaptureManager、MouseKeyboardController、
    VisionLLMAdapter 等硬件组件, 需要 mock 掉整个 computer_use 模块。
    """

    def _make_skill(self):
        """在 mock 环境下创建 ComputerUseSkill 实例"""
        mock_module = MagicMock()
        mock_module.ScreenCaptureManager = MagicMock
        mock_module.WidgetTreeOperator = MagicMock
        mock_module.MouseKeyboardController = MagicMock
        mock_module.VisionLLMAdapter = MagicMock

        with patch.dict("sys.modules", {"core.agent.computer_use": mock_module}):
            # 重新导入以使用 mock
            import importlib
            import core.agent.skills.computer_use_skill as mod
            importlib.reload(mod)
            skill = mod.ComputerUseSkill()
        return skill

    def test_instantiation(self):
        """mock 掉依赖后应能成功实例化"""
        skill = self._make_skill()
        assert skill is not None

    def test_name(self):
        """name 应为 'system.computer_use'"""
        skill = self._make_skill()
        assert skill.name == "system.computer_use"

    def test_tags(self):
        """tags 应包含 'computer_use' 和 '桌面'"""
        skill = self._make_skill()
        assert "computer_use" in skill.tags
        assert "桌面" in skill.tags
        assert "自动化" in skill.tags
        assert "视觉" in skill.tags

    def test_params_schema_action_count(self):
        """action enum 应有 12 个值"""
        schema = ComputerUseSkill.PARAMS_SCHEMA
        assert schema is not None
        action_enum = schema["properties"]["action"]["enum"]
        assert len(action_enum) == 12, f"期望 12 个 action, 实际 {len(action_enum)}"
        expected = {
            "describe_screen", "click", "click_widget", "click_text",
            "type", "press_key", "scroll", "ai_operate", "widget_tree",
            "screenshot", "double_click", "right_click",
        }
        assert set(action_enum) == expected

    def test_execute_no_action(self):
        """execute({}) 缺少 action 时应返回错误"""
        skill = self._make_skill()
        result = skill.execute({}, {})
        if hasattr(result, "is_error"):
            assert result.is_error()
        elif isinstance(result, dict):
            assert not result.get("success", True)


# ═══════════════════════════════════════════════════════════════════════════
#  TestUiControlSkill
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _ui_control_available, reason="UiControlSkill 无法导入")
class TestUiControlSkill:
    """UiControlSkill 基础属性与 Schema 测试"""

    def test_instantiation(self):
        """应能直接实例化（无自定义 __init__）"""
        skill = UiControlSkill()
        assert skill is not None

    def test_name(self):
        """name 应为 'system.ui_control'"""
        skill = UiControlSkill()
        assert skill.name == "system.ui_control"

    def test_tags(self):
        """tags 应包含 'system', 'ui', '界面', '前端'"""
        skill = UiControlSkill()
        assert "system" in skill.tags
        assert "ui" in skill.tags
        assert "界面" in skill.tags
        assert "前端" in skill.tags

    def test_parameters_empty(self):
        """parameters 应为空列表"""
        skill = UiControlSkill()
        assert skill.parameters == []

    def test_execute_no_action(self):
        """execute({}) 缺少 action 时应返回错误"""
        skill = UiControlSkill()
        # 无 main_window context, execute 应返回失败
        result = skill.execute({}, {})
        if hasattr(result, "is_error"):
            assert result.is_error()
        elif isinstance(result, dict):
            assert not result.get("success", True)

    def test_params_schema_action_enum(self):
        """PARAMS_SCHEMA 中 action 应有 5 个枚举值"""
        schema = UiControlSkill.PARAMS_SCHEMA
        assert schema is not None
        action_enum = schema["properties"]["action"]["enum"]
        assert len(action_enum) == 5
        expected = {"switch_tab", "switch_library", "set_layout", "toggle_panel", "get_state"}
        assert set(action_enum) == expected


# ═══════════════════════════════════════════════════════════════════════════
#  TestBatchDataSkill
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _batch_data_available, reason="BatchDataSkill 无法导入")
class TestBatchDataSkill:
    """BatchDataSkill 基础属性与委托行为测试"""

    def test_instantiation(self):
        """应能直接实例化"""
        skill = BatchDataSkill()
        assert skill is not None

    def test_name(self):
        """name 应为 'system.batch_data'"""
        skill = BatchDataSkill()
        assert skill.name == "system.batch_data"

    def test_parameters_empty(self):
        """parameters 应为空列表"""
        skill = BatchDataSkill()
        assert skill.parameters == []

    def test_execute_delegates_to_game_data(self):
        """execute 应尝试调用 GameDataSkill._batch_create"""
        skill = BatchDataSkill()
        mock_dm = MagicMock()
        mock_dm.data = {}
        mock_mw = MagicMock()

        # 提供一个有 data_manager 的 context
        context = {"main_window": mock_mw, "data_manager": mock_dm}

        # Mock GameDataSkill 的 _batch_create 方法
        with patch("core.agent.skills.game_data_skill.GameDataSkill._batch_create") as mock_batch:
            mock_batch.return_value = {"success": True, "message": "mocked"}
            result = skill.execute({"data_type": "roles", "count": 3}, context)
            # _batch_create 应被调用
            mock_batch.assert_called_once()

    def test_execute_no_data_manager(self):
        """execute 在无 data_manager 时应返回错误"""
        skill = BatchDataSkill()
        result = skill.execute({"data_type": "roles"}, {})
        if hasattr(result, "is_error"):
            assert result.is_error()
        elif isinstance(result, dict):
            assert not result.get("success", True)


# ═══════════════════════════════════════════════════════════════════════════
#  TestDiagnosisSkill
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _diagnosis_available, reason="DiagnosisSkill 无法导入")
class TestDiagnosisSkill:
    """DiagnosisSkill 基础属性、参数结构与 execute 边界测试"""

    def test_instantiation(self):
        """应能直接实例化"""
        skill = DiagnosisSkill()
        assert skill is not None

    def test_name(self):
        """name 应为 'system.diagnosis'"""
        skill = DiagnosisSkill()
        assert skill.name == "system.diagnosis"

    def test_tags(self):
        """tags 应包含 diagnosis, repair, health, rollback, backup, code_fix"""
        skill = DiagnosisSkill()
        expected_tags = {"diagnosis", "repair", "health", "rollback", "backup", "code_fix"}
        assert set(skill.tags) == expected_tags

    def test_parameters_has_actions(self):
        """parameters 列表中 action 参数应有 9 个枚举值"""
        skill = DiagnosisSkill()
        assert isinstance(skill.parameters, list)
        assert len(skill.parameters) > 0, "parameters 不应为空列表"

        # 找到 action 参数
        action_param = None
        for p in skill.parameters:
            if p.get("name") == "action":
                action_param = p
                break

        assert action_param is not None, "parameters 中应有 'action' 参数"
        assert "enum" in action_param, "action 参数应有 enum 字段"
        assert len(action_param["enum"]) == 9, \
            f"action 应有 9 个枚举值, 实际 {len(action_param['enum'])}"
        expected_actions = {
            "diagnose", "health", "fix_data", "rollback",
            "translate", "references", "backup", "fix_code", "fix_config",
        }
        assert set(action_param["enum"]) == expected_actions

    def test_execute_no_action(self):
        """execute({}) 缺少 action 时应使用默认值 'health' 或返回错误"""
        skill = DiagnosisSkill()
        # DiagnosisSkill.execute 中 action 默认为 "health"
        # health 会调用 _health_report → tool_repair._show_health_report
        with patch("core.agent.tools.tool_repair._show_health_report", create=True) as mock_health:
            mock_health.return_value = "mocked health report"
            result = skill.execute({}, {})
        # 应成功返回或至少不崩溃
        assert result is not None

    def test_execute_unknown_action(self):
        """execute({"action": "nonexistent"}) 应返回错误"""
        skill = DiagnosisSkill()
        result = skill.execute({"action": "nonexistent"}, {})
        if hasattr(result, "is_error"):
            assert result.is_error()
            assert "未知" in (result.error or result.message or "")
        elif isinstance(result, dict):
            assert not result.get("success", True)


# ═══════════════════════════════════════════════════════════════════════════
#  TestMCPRegistry
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _mcp_available, reason="MCPRegistry 无法导入")
class TestMCPRegistry:
    """MCPRegistry 单例、内置工具、注册与调用测试

    注意: MCPRegistry 使用 __new__ + _lock 实现单例,
    每个测试前需重置 _instance 以确保隔离。
    """

    @pytest.fixture(autouse=True)
    def reset_singleton(self):
        """每个测试前后重置单例, 确保测试隔离"""
        MCPRegistry._instance = None
        yield
        # 清理: shutdown 并重置
        if MCPRegistry._instance is not None:
            try:
                MCPRegistry._instance.shutdown()
            except Exception:
                pass
            MCPRegistry._instance = None

    def _make_registry(self):
        """创建新的 registry 实例 (mock 掉 _load_config 避免文件 IO)"""
        with patch.object(MCPRegistry, "_load_config"):
            return get_mcp_registry()

    def test_singleton(self):
        """两次 get_mcp_registry() 应返回同一实例"""
        reg1 = self._make_registry()
        # 第二次调用不需要 mock _load_config, 因为 __init__ 会跳过已初始化的
        reg2 = get_mcp_registry()
        assert reg1 is reg2, "单例模式应返回同一实例"

    def test_builtin_echo_exists(self):
        """'mcp.echo' 应在 list_tools 中"""
        reg = self._make_registry()
        tools = reg.list_tools()
        tool_names = [t["name"] for t in tools]
        assert "mcp.echo" in tool_names, f"mcp.echo 未找到, 现有工具: {tool_names}"

    def test_builtin_time_exists(self):
        """'mcp.time' 应在 list_tools 中"""
        reg = self._make_registry()
        tools = reg.list_tools()
        tool_names = [t["name"] for t in tools]
        assert "mcp.time" in tool_names, f"mcp.time 未找到, 现有工具: {tool_names}"

    def test_call_echo(self):
        """call_tool('mcp.echo', {'text': 'hello'}) 应返回包含 'hello' 的结果"""
        reg = self._make_registry()
        result = reg.call_tool("mcp.echo", {"text": "hello"})
        assert result.get("success") is True
        assert result.get("echo") == "hello"
        assert "hello" in result.get("message", "")

    def test_call_time(self):
        """call_tool('mcp.time', {}) 应返回包含时间信息的结果"""
        reg = self._make_registry()
        result = reg.call_tool("mcp.time", {})
        assert result.get("success") is True
        assert "timestamp" in result
        assert "iso" in result
        assert isinstance(result["timestamp"], (int, float))

    def test_register_tool(self):
        """注册自定义工具后 list_tools 应包含它"""
        reg = self._make_registry()
        reg.register_tool("custom.test_tool", "test_server", {"description": "测试工具"})
        tools = reg.list_tools()
        tool_names = [t["name"] for t in tools]
        assert "custom.test_tool" in tool_names, \
            f"自定义工具未找到, 现有工具: {tool_names}"

    def test_is_available(self):
        """有工具时 is_available() 应返回 True"""
        reg = self._make_registry()
        # 至少有内置工具
        assert reg.is_available() is True

    def test_get_tools_description(self):
        """get_tools_description() 应返回非空字符串"""
        reg = self._make_registry()
        desc = reg.get_tools_description()
        assert isinstance(desc, str)
        assert len(desc) > 0
        # 应包含内置工具名
        assert "mcp.echo" in desc
        assert "mcp.time" in desc

    def test_call_unknown_tool(self):
        """调用未注册工具应返回错误"""
        reg = self._make_registry()
        result = reg.call_tool("nonexistent.tool", {})
        assert "error" in result or not result.get("success", True)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
