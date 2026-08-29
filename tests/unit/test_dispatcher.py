"""ToolDispatcher 技能调度器模块单元测试

覆盖技能注册、discover_skills() 自动发现、模糊匹配索引构建、
dispatch()/execute() 方法及其错误处理、参数修正与结果归一化。

若 dispatcher 模块因缺少 PyQt6 等依赖无法导入，整个模块自动跳过。
"""
import sys
import os
import json

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

# ── 安全导入：依赖缺失时跳过整个模块 ──
try:
    from core.agent.dispatcher import ToolDispatcher
    from core.agent.skill_protocol import BaseSkill
    from core.agent.models import SkillResult
    _DEP_AVAILABLE = True
except Exception as _import_err:  # pragma: no cover - 依赖缺失分支
    _DEP_AVAILABLE = False
    _IMPORT_ERR = _import_err
    # 占位基类，避免下方类定义因 NameError 而无法收集
    BaseSkill = object  # type: ignore
    SkillResult = None  # type: ignore

pytestmark = pytest.mark.skipif(
    not _DEP_AVAILABLE,
    reason="core.agent.dispatcher 模块不可用（可能缺少 PyQt6 等依赖）",
)


# ── 测试用假技能 ──

class FakeSkill(BaseSkill):
    """可配置 name 与 execute 返回值的测试技能"""
    name = "fake.tool"
    description = "用于单元测试的假技能 doing test stuff"
    version = "1.0.0"
    parameters = []
    REQUIRES_MAIN_THREAD = False

    def __init__(self, name="fake.tool", execute_result=None):
        self.name = name
        self._execute_result = (
            execute_result if execute_result is not None
            else {"success": True, "message": "ok"}
        )

    def execute(self, params, context):
        if isinstance(self._execute_result, BaseException):
            raise self._execute_result
        return self._execute_result


# ── 注册与计数 ──

class TestRegisterSkill:
    """register_skill / skill_count / list_skills 测试"""

    def test_register_skill_increments_count(self):
        """注册技能后 skill_count 递增"""
        d = ToolDispatcher()
        before = d.skill_count
        assert d.register_skill(FakeSkill()) is True
        assert d.skill_count == before + 1

    def test_register_skill_without_name_returns_false(self):
        """name 为空的技能注册失败返回 False"""
        d = ToolDispatcher()
        skill = FakeSkill(name="")
        assert d.register_skill(skill) is False
        assert d.get("") is None

    def test_register_skill_overwrites_same_name(self):
        """同名技能后注册覆盖前者"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="dup.tool", execute_result={"success": True, "message": "first"}))
        d.register_skill(FakeSkill(name="dup.tool", execute_result={"success": True, "message": "second"}))
        skill = d.get("dup.tool")
        assert skill is not None
        # 后者覆盖前者
        assert skill.execute({}, {})["message"] == "second"

    def test_get_returns_skill(self):
        """get 返回已注册的技能"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="my.tool"))
        assert d.get("my.tool") is not None
        assert d.get("my.tool").name == "my.tool"

    def test_get_nonexistent_returns_none(self):
        """get 查询未注册技能返回 None"""
        d = ToolDispatcher()
        assert d.get("nope.tool") is None

    def test_list_skills_includes_registered(self):
        """list_skills 包含已注册技能元信息"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="listed.tool"))
        skills = d.list_skills
        names = [s["name"] for s in skills]
        assert "listed.tool" in names
        # 元信息包含 source 字段
        entry = next(s for s in skills if s["name"] == "listed.tool")
        assert entry["source"] == "skill"
        assert entry["version"] == "1.0.0"

    def test_clear_resets_all(self):
        """clear 后技能、模糊索引全部清空"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="a.tool"))
        assert d.skill_count >= 1
        d.clear()
        assert d.skill_count == 0
        assert d.get("a.tool") is None


# ── 模糊匹配 ──

class TestFuzzyMatch:
    """fuzzy_match / _build_fuzzy_index 测试"""

    def test_fuzzy_match_exact_name(self):
        """精确名称直接命中"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        assert d.fuzzy_match("system.shell") == "system.shell"

    def test_fuzzy_match_empty_returns_none(self):
        """空字符串返回 None"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        assert d.fuzzy_match("") is None

    def test_fuzzy_match_via_static_alias(self):
        """静态别名映射 — 'shell' → 'system.shell'（即使未注册 shell 技能）"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        # 'shell' 是 _build_fuzzy_index 中映射到 'system.shell' 的别名
        assert d.fuzzy_match("shell") == "system.shell"

    def test_fuzzy_match_no_match_returns_none(self):
        """完全无法匹配的名称返回 None"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        # 一个不含任何已知关键字的字符串
        assert d.fuzzy_match("zzzqqqxxxx") is None

    def test_fuzzy_match_case_insensitive(self):
        """模糊匹配大小写不敏感"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        assert d.fuzzy_match("SHELL") == "system.shell"

    def test_fuzzy_index_contains_name_parts(self):
        """技能名称的组成部分（长度>=3）进入模糊索引"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="custom.thing"))
        # 'custom' 来自技能名拆分
        assert d.fuzzy_match("custom") == "custom.thing"


# ── discover_skills 自动发现 ──

class TestDiscoverSkills:
    """discover_skills() 自动发现机制测试"""

    def test_discover_nonexistent_package_returns_zero(self):
        """不存在的包路径返回 0"""
        d = ToolDispatcher()
        count = d.discover_skills("nonexistent.pkg.xyz")
        assert count == 0

    def test_discover_empty_package_does_not_register_unknown(self, tmp_path):
        """空包（无技能模块）不抛异常，且不注册来自该包的技能

        注意：discover_skills 会迭代全局 BaseSkill.__subclasses__()，
        因此可能注册进程内已加载的其他技能；本测试仅验证空包本身不贡献新技能。
        """
        pkg = tmp_path / "emptypkg"
        pkg.mkdir()
        (pkg / "__init__.py").write_text("", encoding="utf-8")
        sys.path.insert(0, str(tmp_path))
        try:
            d = ToolDispatcher()
            count = d.discover_skills("emptypkg")
            assert isinstance(count, int)
            assert count >= 0
            # 空包内无技能模块，不应注册任何来自 emptypkg 的技能
            assert d.get("emptypkg.anything") is None
        finally:
            sys.path.remove(str(tmp_path))
            sys.modules.pop("emptypkg", None)

    def test_discover_finds_skill_in_temp_package(self, tmp_path):
        """从临时包中发现 BaseSkill 子类并注册"""
        pkg = tmp_path / "discopkg"
        pkg.mkdir()
        (pkg / "__init__.py").write_text("", encoding="utf-8")
        (pkg / "tmp_skill.py").write_text(
            "from core.agent.skill_protocol import BaseSkill\n"
            "class TempDiscoSkill(BaseSkill):\n"
            "    name = 'temp.disco'\n"
            "    description = '临时发现技能'\n"
            "    version = '0.1.0'\n"
            "    parameters = []\n"
            "    def execute(self, params, context):\n"
            "        return {'success': True, 'message': 'temp'}\n",
            encoding="utf-8",
        )
        sys.path.insert(0, str(tmp_path))
        try:
            d = ToolDispatcher()
            count = d.discover_skills("discopkg")
            assert count >= 1
            assert d.get("temp.disco") is not None
        finally:
            sys.path.remove(str(tmp_path))
            for k in [k for k in list(sys.modules) if k.startswith("discopkg")]:
                sys.modules.pop(k, None)


# ── execute / dispatch 错误处理 ──

class TestExecuteErrorHandling:
    """execute() 方法及错误处理测试"""

    def test_execute_unknown_tool_returns_error(self):
        """执行未注册且无法模糊匹配的工具返回错误"""
        d = ToolDispatcher()
        result = d.execute("zzzqqqxxxx", {}, {})
        assert result["success"] is False
        assert "未知工具" in result["error"]

    def test_execute_calls_skill_and_normalizes(self):
        """执行已注册技能 — 返回归一化结果"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(
            name="fake.run",
            execute_result={"success": True, "message": "ran successfully"},
        ))
        result = d.execute("fake.run", {"action": "x"}, {})
        assert result["success"] is True
        assert result["message"] == "ran successfully"
        # 归一化后包含 _raw 原始结果
        assert result["_raw"]["message"] == "ran successfully"

    def test_execute_skill_exception_returns_error(self):
        """技能 execute 抛异常时返回错误结果而非崩溃"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(
            name="fake.boom",
            execute_result=RuntimeError("kaboom"),
        ))
        result = d.execute("fake.boom", {}, {})
        assert result["success"] is False
        assert "kaboom" in result["error"]

    def test_execute_unregistered_resolved_returns_error(self):
        """模糊匹配到名称但未注册技能时返回错误"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        # 'command' 别名映射到 'system.shell'，先注册一个真实技能以保证可执行
        # 这里测试一个映射到未注册技能的别名
        # 'planning' → 'system.ceshu'（未注册）
        result = d.execute("planning", {}, {})
        assert result["success"] is False
        assert "未注册技能" in result["error"]

    def test_execute_blocks_dangerous_action(self):
        """高危操作（system.shell/exec）未确认时被拦截"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="system.shell"))
        result = d.execute("system.shell", {"action": "exec"}, {})
        assert result["success"] is False
        assert "高危" in result["error"]

    def test_execute_allows_dangerous_after_confirm(self):
        """高危操作经 _danger_confirmed 确认后放行"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(
            name="system.shell",
            execute_result={"success": True, "message": "executed"},
        ))
        ctx = {"_danger_confirmed": ("system.shell", "exec")}
        result = d.execute("system.shell", {"action": "exec"}, ctx)
        assert result["success"] is True
        assert result["message"] == "executed"
        # 确认标记被清除，避免重复使用
        assert ctx["_danger_confirmed"] is None

    def test_execute_subagent_without_handler(self):
        """subagent 工具未配置 handler 时返回错误"""
        d = ToolDispatcher()
        result = d.execute("system.subagent", {"task": "do x"}, {})
        assert result["success"] is False
        assert "SubAgent" in result["error"]

    def test_execute_subagent_missing_task(self):
        """subagent 工具缺少 task 参数返回错误"""
        d = ToolDispatcher()
        d.set_subagent_handler(lambda task, ctx: {"success": True, "message": task})
        result = d.execute("system.subagent", {}, {})
        assert result["success"] is False
        assert "task" in result["error"]

    def test_execute_subagent_with_handler(self):
        """subagent 工具经 handler 正常执行"""
        d = ToolDispatcher()
        captured = {}

        def handler(task, ctx):
            captured["task"] = task
            return {"success": True, "message": f"done: {task}"}

        d.set_subagent_handler(handler)
        result = d.execute("system.subagent", {"task": "explore data"}, {})
        assert result["success"] is True
        assert "explore data" in result["message"]
        assert captured["task"] == "explore data"


# ── _normalize_result / _fix_params ──

class TestNormalizeAndFixParams:
    """_normalize_result 与 _fix_params 静态方法测试"""

    def test_normalize_dict_with_success_message(self):
        """含 success+message 的字典直接归一化并附 _raw"""
        r = ToolDispatcher._normalize_result({"success": True, "message": "hi"})
        assert r["success"] is True
        assert r["message"] == "hi"
        assert r["_raw"]["message"] == "hi"

    def test_normalize_dict_without_success_key(self):
        """不含 success 的字典补全默认值"""
        r = ToolDispatcher._normalize_result({"data": "payload"})
        assert r["success"] is True
        assert r["data"] == "payload"

    def test_normalize_skill_result_object(self):
        """SkillResult 对象归一化为 dict"""
        sr = SkillResult(success=True, data="hello", error=None)
        r = ToolDispatcher._normalize_result(sr)
        assert r["success"] is True
        assert r["data"] == "hello"
        assert "hello" in r["message"]

    def test_normalize_string(self):
        """字符串归一化为成功结果"""
        r = ToolDispatcher._normalize_result("plain text")
        assert r["success"] is True
        assert r["message"] == "plain text"

    def test_fix_params_game_data_create(self):
        """game_data 有 data_type+name 无 item_id → action=create"""
        p = ToolDispatcher._fix_params("system.game_data",
                                       {"data_type": "item", "name": "sword"})
        assert p["action"] == "create"

    def test_fix_params_game_data_update_with_item_id(self):
        """game_data 有 item_id → action=update"""
        p = ToolDispatcher._fix_params("system.game_data",
                                       {"data_type": "item", "item_id": "1",
                                        "field": "hp", "value": 10})
        assert p["action"] == "update"

    def test_fix_params_game_data_list_default(self):
        """game_data 仅 data_type → action=list"""
        p = ToolDispatcher._fix_params("system.game_data", {"data_type": "item"})
        assert p["action"] == "list"

    def test_fix_params_game_data_query_with_keyword(self):
        """game_data 有 keyword → action=query"""
        p = ToolDispatcher._fix_params("system.game_data", {"keyword": "foo"})
        assert p["action"] == "query"

    def test_fix_params_shell_defaults_exec(self):
        """shell 无 action → action=exec"""
        p = ToolDispatcher._fix_params("system.shell", {})
        assert p["action"] == "exec"

    def test_fix_params_file_ops_branches(self):
        """file_ops 不同输入路由到不同 action"""
        assert ToolDispatcher._fix_params("system.file_ops", {"content": "x", "path": "p"})["action"] == "write"
        assert ToolDispatcher._fix_params("system.file_ops", {"pattern": "foo"})["action"] == "grep"
        assert ToolDispatcher._fix_params("system.file_ops", {})["action"] == "read"

    def test_fix_params_alias_mapping(self):
        """参数别名 — 'type' 映射为 'data_type' 并移除原键"""
        p = ToolDispatcher._fix_params("some.tool", {"type": "item"})
        assert p.get("data_type") == "item"
        assert "type" not in p


# ── 工具描述与 schema ──

class TestToolsDescription:
    """get_tools_description / get_tools_json_schema 测试"""

    def test_get_tools_description_includes_skill(self):
        """工具描述文本包含已注册技能"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="desc.tool"))
        desc = d.get_tools_description()
        assert "desc.tool" in desc

    def test_get_tools_json_schema_returns_list(self):
        """get_tools_json_schema 返回 schema 列表"""
        d = ToolDispatcher()
        d.register_skill(FakeSkill(name="schema.tool"))
        schemas = d.get_tools_json_schema()
        assert isinstance(schemas, list)
        assert any(s["name"] == "schema.tool" for s in schemas)

    def test_get_tools_description_includes_subagent(self):
        """配置 subagent handler 后描述包含 system.subagent"""
        d = ToolDispatcher()
        d.set_subagent_handler(lambda task, ctx: None)
        desc = d.get_tools_description()
        assert "system.subagent" in desc
