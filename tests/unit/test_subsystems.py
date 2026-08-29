"""GameEditorApp 子系统单元测试

覆盖: SessionManager, ReflectionEngine, PlanCoordinator, ReactEngine
"""

import sys
import json
import time
import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch

# 将 src 目录加入模块搜索路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))

# ── 导入保护: 所有子系统导入均用 try/except 包裹 ──

try:
    from core.agent.session_manager import SessionManager
    _HAS_SESSION_MANAGER = True
except Exception:
    _HAS_SESSION_MANAGER = False

try:
    from core.agent.reflection_engine import ReflectionEngine
    _HAS_REFLECTION_ENGINE = True
except Exception:
    _HAS_REFLECTION_ENGINE = False

try:
    from core.agent.plan_coordinator import PlanCoordinator
    _HAS_PLAN_COORDINATOR = True
except Exception:
    _HAS_PLAN_COORDINATOR = False

try:
    from core.agent.react_engine import ReactEngine
    _HAS_REACT_ENGINE = True
except Exception:
    _HAS_REACT_ENGINE = False


# ═══════════════════════════════════════════════════════════
#  SessionManager 测试
# ═══════════════════════════════════════════════════════════

import sys
_PY314_PLUS = sys.version_info >= (3, 14)
@pytest.mark.skipif(not _HAS_SESSION_MANAGER, reason="SessionManager 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestSessionManager:
    """会话管理器测试 — 持久化、计数器、撤销栈、工作区切换、指标记录"""

    def _make_sm(self, tmp_dir=None):
        """创建一个使用临时目录的 SessionManager 实例"""
        if tmp_dir is None:
            tmp_dir = tempfile.mkdtemp()
        return SessionManager(Path(tmp_dir)), tmp_dir

    # ── 初始化 ──

    def test_init_creates_directory_and_default_state(self):
        """创建实例后应建立目录并初始化默认状态"""
        sm, tmp = self._make_sm()
        try:
            assert sm.conv_count == 0
            assert sm.tool_call_count == 0
            assert sm.failure_count == 0
            assert sm.undo_stack == []
            assert isinstance(sm.session_dir, Path)
            assert sm.session_dir.exists()
            assert not sm.has_pending()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── 持久化: save + restore ──

    def test_save_and_restore_roundtrip(self):
        """保存消息后新建实例，应自动恢复上下文"""
        tmp = tempfile.mkdtemp()
        try:
            sm1, _ = self._make_sm(tmp)
            messages = [
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好，有什么可以帮你？"},
            ]
            sm1.save(messages)

            # 重新创建实例，_try_restore 应自动读取
            sm2 = SessionManager(Path(tmp))
            assert sm2.has_pending()
            loaded = sm2.load_pending()
            assert loaded is not None
            assert len(loaded) == 2
            assert loaded[0]["role"] == "user"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_restore_no_file_means_no_pending(self):
        """没有 session 文件时不应有待恢复会话"""
        tmp = tempfile.mkdtemp()
        try:
            sm, _ = self._make_sm(tmp)
            assert not sm.has_pending()
            assert sm.load_pending() is None
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── has_pending / get_pending_info / load_pending ──

    def test_get_pending_info_with_session(self):
        """保存后应返回正确的待恢复信息"""
        tmp = tempfile.mkdtemp()
        try:
            sm1, _ = self._make_sm(tmp)
            sm1.save([{"role": "user", "content": "测试消息"}])

            sm2 = SessionManager(Path(tmp))
            info = sm2.get_pending_info()
            assert info["has_session"] is True
            assert info["message_count"] == 1
            assert "saved_at" in info
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_get_pending_info_empty(self):
        """无待恢复会话时 has_session 应为 False"""
        sm, tmp = self._make_sm()
        try:
            info = sm.get_pending_info()
            assert info["has_session"] is False
            assert info["message_count"] == 0
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_load_pending_clears_after_load(self):
        """load_pending 后应清除待恢复状态"""
        tmp = tempfile.mkdtemp()
        try:
            sm1, _ = self._make_sm(tmp)
            sm1.save([{"role": "user", "content": "data"}])

            sm2 = SessionManager(Path(tmp))
            assert sm2.has_pending()
            sm2.load_pending()
            assert not sm2.has_pending()
            # 第二次 load 应返回 None
            assert sm2.load_pending() is None
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── clear ──

    def test_clear_removes_context_and_file(self):
        """clear 应清除内存上下文并删除 session 文件"""
        tmp = tempfile.mkdtemp()
        try:
            sm1, _ = self._make_sm(tmp)
            sm1.save([{"role": "user", "content": "data"}])

            sm2 = SessionManager(Path(tmp))
            assert sm2.has_pending()
            sm2.clear()
            assert not sm2.has_pending()
            assert not (Path(tmp) / "active_session.json").exists()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── 计数器方法 ──

    def test_counter_increments_and_decrements(self):
        """测试所有计数器的增减操作"""
        sm, tmp = self._make_sm()
        try:
            sm.increment_conversations()
            sm.increment_conversations()
            assert sm.conv_count == 2

            sm.increment_tool_calls(3)
            assert sm.tool_call_count == 3

            sm.increment_failures()
            sm.increment_failures()
            assert sm.failure_count == 2

            sm.decrement_failures()
            assert sm.failure_count == 1

            # decrement 不应低于 0
            sm.decrement_failures()
            sm.decrement_failures()
            assert sm.failure_count == 0

            sm.increment_failures()
            sm.reset_failures()
            assert sm.failure_count == 0

            sm.increment_successes()
            sm.increment_successes()
            # success_count 通过 get_stats 间接验证
            stats = sm.get_stats()
            assert stats["successes"] == 2
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── push_undo / pop_undo ──

    def test_undo_push_pop_and_limit(self):
        """撤销栈的 push、pop 以及 50 条上限"""
        sm, tmp = self._make_sm()
        try:
            # 空栈 pop 应返回 None
            assert sm.pop_undo() is None

            # push + pop 正常
            sm.push_undo({"action": "create", "name": "怪物A"})
            sm.push_undo({"action": "delete", "name": "怪物B"})
            assert len(sm.undo_stack) == 2

            popped = sm.pop_undo()
            assert popped["action"] == "delete"
            assert len(sm.undo_stack) == 1

            # 测试 50 条上限: 推入 60 条应截断为 50
            for i in range(60):
                sm.push_undo({"index": i})
            assert len(sm.undo_stack) == 50
            # 栈顶应为最新推入的
            assert sm.undo_stack[-1]["index"] == 59
            # 栈底应为 index=10 (前 10 条被挤出)
            assert sm.undo_stack[0]["index"] == 10
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── get_stats ──

    def test_get_stats_returns_expected_keys(self):
        """返回的统计字典应包含所有预期键"""
        sm, tmp = self._make_sm()
        try:
            sm.increment_conversations()
            stats = sm.get_stats()
            expected_keys = {
                "conversations", "failures", "successes",
                "success_rate", "has_restored_session",
                "uptime_seconds", "uptime", "undo_stack_size",
            }
            assert expected_keys.issubset(stats.keys())
            assert stats["conversations"] == 1
            assert stats["has_restored_session"] is False
            assert stats["undo_stack_size"] == 0
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_get_stats_success_rate_format(self):
        """success_rate 在有会话时显示比率，无会话时显示 N/A"""
        sm, tmp = self._make_sm()
        try:
            # 无会话时
            assert sm.get_stats()["success_rate"] == "N/A"

            sm.increment_conversations()
            sm.increment_conversations()
            sm.increment_failures()
            rate = sm.get_stats()["success_rate"]
            assert rate == "1/2"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── get_uptime ──

    def test_get_uptime_returns_positive_float(self):
        """get_uptime 应返回非负浮点秒数"""
        sm, tmp = self._make_sm()
        try:
            uptime = sm.get_uptime()
            assert isinstance(uptime, float)
            assert uptime >= 0.0
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── reload ──

    def test_reload_resets_state_and_switches_dir(self):
        """reload 应切换工作区目录并重置所有计数器"""
        sm, tmp1 = self._make_sm()
        tmp2 = tempfile.mkdtemp()
        try:
            sm.increment_conversations()
            sm.increment_tool_calls(5)
            sm.increment_failures()
            sm.push_undo({"action": "create"})

            sm.reload(Path(tmp2))
            assert sm.conv_count == 0
            assert sm.tool_call_count == 0
            assert sm.failure_count == 0
            assert sm.undo_stack == []
            assert sm.session_dir == Path(tmp2)
            assert not sm.has_pending()
        finally:
            shutil.rmtree(tmp1, ignore_errors=True)
            shutil.rmtree(tmp2, ignore_errors=True)

    # ── record_metric ──

    def test_record_metric_writes_jsonl(self):
        """record_metric 应向 metrics.jsonl 追加 JSON 行"""
        sm, tmp = self._make_sm()
        try:
            sm.record_metric("deploy", {"version": "1.0"})
            sm.record_metric("deploy", {"version": "2.0"})

            metrics_file = Path(tmp) / "metrics.jsonl"
            assert metrics_file.exists()

            lines = metrics_file.read_text(encoding="utf-8").strip().split("\n")
            assert len(lines) == 2

            entry = json.loads(lines[0])
            assert entry["type"] == "deploy"
            assert entry["version"] == "1.0"
            assert "timestamp" in entry
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── reset_session_counters ──

    def test_reset_session_counters(self):
        """reset_session_counters 应仅重置会话和工具调用计数"""
        sm, tmp = self._make_sm()
        try:
            sm.increment_conversations()
            sm.increment_tool_calls(10)
            sm.increment_failures()

            sm.reset_session_counters()
            assert sm.conv_count == 0
            assert sm.tool_call_count == 0
            # failures 不受 reset_session_counters 影响
            assert sm.failure_count == 1
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


# ═══════════════════════════════════════════════════════════
#  ReflectionEngine 测试
# ═══════════════════════════════════════════════════════════

@pytest.mark.skipif(not _HAS_REFLECTION_ENGINE, reason="ReflectionEngine 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestReflectionEngine:
    """反思学习引擎测试 — 失败模式归类、经验建议、反思、预警、事中学习"""

    def _make_engine(self):
        """创建带 mock learner/memory 的 ReflectionEngine"""
        learner = MagicMock()
        memory = MagicMock()
        engine = ReflectionEngine(learner, memory)
        return engine, learner, memory

    # ── categorize_failure_patterns (静态方法) ──

    def test_categorize_failure_patterns_mixed_errors(self):
        """不同错误类型应归入不同模式"""
        failures = [
            {"tool": "tool_a", "error": "连接超时"},
            {"tool": "tool_b", "error": "数据不存在"},
            {"tool": "tool_c", "error": "permission denied"},
            {"tool": "tool_d", "error": "JSON parse error"},
            {"tool": "tool_e", "error": "invalid param value"},
            {"tool": "tool_f", "error": "network connection lost"},
        ]
        patterns = ReflectionEngine.categorize_failure_patterns(failures)

        assert "超时" in patterns
        assert "数据不存在" in patterns
        assert "权限不足" in patterns
        assert "格式/解析错误" in patterns
        assert "参数错误" in patterns
        assert "网络/连接" in patterns

    def test_categorize_failure_patterns_groups_same_type(self):
        """同类错误应合并到同一模式键下"""
        failures = [
            {"tool": "tool_a", "error": "连接超时"},
            {"tool": "tool_b", "error": "timeout occurred"},
        ]
        patterns = ReflectionEngine.categorize_failure_patterns(failures)
        assert "超时" in patterns
        assert len(patterns["超时"]) == 2

    def test_categorize_failure_patterns_unknown_becomes_other(self):
        """无法识别的错误应归入 '其他.<tool>'"""
        failures = [{"tool": "custom_tool", "error": "something weird happened"}]
        patterns = ReflectionEngine.categorize_failure_patterns(failures)
        assert "其他.custom_tool" in patterns

    def test_categorize_failure_patterns_chinese_keywords(self):
        """中文关键词也应正确匹配"""
        failures = [
            {"tool": "t1", "error": "找不到该角色"},
            {"tool": "t2", "error": "权限不足无法操作"},
            {"tool": "t3", "error": "参数格式错误"},
        ]
        patterns = ReflectionEngine.categorize_failure_patterns(failures)
        assert "数据不存在" in patterns     # "找不到"
        assert "权限不足" in patterns
        assert "格式/解析错误" in patterns  # "格式"

    # ── get_pattern_suggestion (静态方法) ──

    def test_get_pattern_suggestion_known_patterns(self):
        """已知模式应返回对应的经验建议"""
        assert "query" in ReflectionEngine.get_pattern_suggestion(
            "数据不存在", [{"tool": "t1"}]
        )
        assert "批量" in ReflectionEngine.get_pattern_suggestion(
            "超时", [{"tool": "t2"}]
        )
        assert "白名单" in ReflectionEngine.get_pattern_suggestion(
            "权限不足", [{"tool": "t3"}]
        )
        assert "schema" in ReflectionEngine.get_pattern_suggestion(
            "格式/解析错误", [{"tool": "t4"}]
        )
        assert "input_schema" in ReflectionEngine.get_pattern_suggestion(
            "参数错误", [{"tool": "t5"}]
        )
        assert "网络" in ReflectionEngine.get_pattern_suggestion(
            "网络/连接", [{"tool": "t6"}]
        )

    def test_get_pattern_suggestion_unknown_pattern(self):
        """未知模式应返回包含工具名的默认建议"""
        result = ReflectionEngine.get_pattern_suggestion(
            "未知模式", [{"tool": "alpha"}, {"tool": "beta"}]
        )
        assert "alpha" in result
        assert "beta" in result

    # ── reflect_on_failures ──

    def test_reflect_on_failures_zero_skips(self):
        """failure_count=0 时不应调用 learner 和 memory"""
        engine, learner, memory = self._make_engine()
        engine.reflect_on_failures(0, "input", "response")
        learner.get_recent_failures.assert_not_called()
        memory.save_learning.assert_not_called()

    def test_reflect_on_failures_negative_skips(self):
        """failure_count 为负数时也应跳过"""
        engine, learner, memory = self._make_engine()
        engine.reflect_on_failures(-1)
        learner.get_recent_failures.assert_not_called()

    def test_reflect_on_failures_positive_triggers_learning(self):
        """failure_count > 0 时应获取失败记录并保存学习"""
        engine, learner, memory = self._make_engine()
        learner.get_recent_failures.return_value = [
            {"tool": "system.game_data", "error": "数据不存在"},
            {"tool": "system.game_data", "error": "找不到该角色"},
            {"tool": "system.file", "error": "连接超时"},
        ]
        engine.reflect_on_failures(3, "创建一个角色", "执行失败")

        learner.get_recent_failures.assert_called_once_with(10)
        assert memory.save_learning.call_count >= 1

    # ── warn_from_past_failures ──

    def test_warn_from_past_failures_no_history_returns_empty(self):
        """无历史失败时应返回空字符串"""
        engine, learner, memory = self._make_engine()
        learner.get_recent_failures.return_value = []

        result = engine.warn_from_past_failures("system.game_data", {"action": "create"})
        assert result == ""

    def test_warn_from_past_failures_matching_pattern(self):
        """匹配到历史失败模式时应返回预警文本"""
        engine, learner, memory = self._make_engine()
        learner.get_recent_failures.return_value = [
            {"tool": "system.game_data", "error": "数据不存在"},
            {"tool": "system.game_data", "error": "找不到该角色"},
        ]
        result = engine.warn_from_past_failures("system.game_data", {"action": "create"})
        assert result != ""
        assert "数据不存在" in result

    # ── mid_session_learn ──

    def test_mid_session_learn_below_threshold(self):
        """failure_count < 3 时不应记录"""
        engine, learner, memory = self._make_engine()
        engine.mid_session_learn(2, "tool_a", "some error")
        memory.save_learning.assert_not_called()

    def test_mid_session_learn_at_threshold(self):
        """failure_count >= 3 时应记录到 memory"""
        engine, learner, memory = self._make_engine()
        engine.mid_session_learn(3, "tool_a", "some error")
        memory.save_learning.assert_called_once()
        call_args = memory.save_learning.call_args
        assert call_args[0][0] == "mid_session_failure"
        assert "tool_a" in call_args[0][1]

    # ── build_failure_reflect_hint ──

    def test_build_hint_low_failure_no_replan(self):
        """failure_count < 2 时应返回反思提示"""
        engine, _, _ = self._make_engine()
        hint = engine.build_failure_reflect_hint(1, "tool_a", "参数不正确")
        assert "反思" in hint
        assert "参数不正确" in hint

    def test_build_hint_high_failure_with_replan(self):
        """failure_count >= 2 且提供 replan_callback 时应返回重规划提示"""
        engine, _, _ = self._make_engine()
        callback = MagicMock(return_value="尝试使用 query 先确认数据")
        hint = engine.build_failure_reflect_hint(2, "tool_a", "error", callback)

        assert "重规划" in hint
        callback.assert_called_once_with("tool_a", "error")

    def test_build_hint_high_failure_no_callback(self):
        """failure_count >= 2 但无 replan_callback 时应返回普通反思提示"""
        engine, _, _ = self._make_engine()
        hint = engine.build_failure_reflect_hint(3, "tool_a", "some error")
        assert "反思" in hint


# ═══════════════════════════════════════════════════════════
#  PlanCoordinator 测试
# ═══════════════════════════════════════════════════════════

@pytest.mark.skipif(not _HAS_PLAN_COORDINATOR, reason="PlanCoordinator 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestPlanCoordinator:
    """规划协调器测试 — 计划执行、重试、撤销、操作记录"""

    def _make_pc(self, session_manager=None):
        """创建带 mock 依赖的 PlanCoordinator"""
        dispatcher = MagicMock()
        planner = MagicMock()
        reflection_engine = MagicMock()
        reflection_engine.warn_from_past_failures.return_value = ""

        pc = PlanCoordinator(
            dispatcher=dispatcher,
            planner=planner,
            reflection_engine=reflection_engine,
            session_manager=session_manager,
        )
        return pc, dispatcher, planner, reflection_engine

    # ── execute_plan ──

    def test_execute_plan_empty_steps(self):
        """空步骤列表应返回空字典"""
        pc, disp, plan, refl = self._make_pc()
        result = pc.execute_plan([], {})
        assert result == {}
        disp.execute.assert_not_called()

    def test_execute_plan_single_success_step(self):
        """正常步骤应调用 dispatcher.execute 并返回结果"""
        pc, disp, plan, refl = self._make_pc()
        disp.execute.return_value = {"success": True, "message": "创建成功"}

        steps = [{"step": 1, "tool": "system.game_data", "params": {"action": "create"}, "reason": "创建角色"}]
        result = pc.execute_plan(steps, {})

        assert 1 in result
        assert "创建成功" in result[1]
        disp.execute.assert_called_once()

    def test_execute_plan_multiple_steps(self):
        """多步骤应按顺序逐一执行"""
        pc, disp, plan, refl = self._make_pc()
        disp.execute.side_effect = [
            {"success": True, "message": "步骤1完成"},
            {"success": True, "message": "步骤2完成"},
        ]
        steps = [
            {"step": 1, "tool": "tool_a", "params": {}, "reason": "第一步"},
            {"step": 2, "tool": "tool_b", "params": {}, "reason": "第二步"},
        ]
        result = pc.execute_plan(steps, {})
        assert len(result) == 2
        assert disp.execute.call_count == 2

    def test_execute_plan_failure_triggers_replan(self):
        """步骤失败且有后续步骤时应触发 replan"""
        pc, disp, plan, refl = self._make_pc()

        # 第一次执行失败，第二次成功 (来自 replan 的新步骤)
        disp.execute.side_effect = [
            {"success": False, "error": "数据不存在", "message": ""},
            {"success": True, "message": "replan后成功"},
        ]
        disp.get_tools_description.return_value = "工具列表"

        plan.plan.return_value = {
            "steps": [{"step": 2, "tool": "tool_query", "params": {}, "reason": "先查询"}]
        }
        plan._normalize_step.side_effect = lambda s: s

        steps = [
            {"step": 1, "tool": "tool_create", "params": {"name": "x"}, "reason": "创建"},
            {"step": 2, "tool": "tool_update", "params": {}, "reason": "更新"},
        ]
        context = {"_plan": {"goal": "测试目标"}}
        result = pc.execute_plan(steps, context)

        # replan 应被触发
        plan.plan.assert_called_once()

    def test_execute_plan_callback_invoked(self):
        """callback 应在步骤开始和结束时被调用"""
        pc, disp, plan, refl = self._make_pc()
        disp.execute.return_value = {"success": True, "message": "OK"}

        callback = MagicMock()
        steps = [{"step": 1, "tool": "tool_a", "params": {}, "reason": "测试"}]
        pc.execute_plan(steps, {}, callback=callback)

        event_types = [call[0][0] for call in callback.call_args_list]
        assert "step_start" in event_types
        assert "step_done" in event_types

    # ── _execute_with_retry ──

    def test_retry_first_success(self):
        """首次成功应直接返回，不触发重试"""
        pc, disp, _, _ = self._make_pc()
        disp.execute.return_value = {"success": True, "message": "OK"}

        result = pc._execute_with_retry("tool", {}, {}, max_retries=2, retry_delay=0)
        assert result["success"] is True
        assert disp.execute.call_count == 1

    def test_retry_then_success(self):
        """首次失败后重试成功"""
        pc, disp, _, _ = self._make_pc()
        disp.execute.side_effect = [
            {"success": False, "error": "临时故障"},
            {"success": True, "message": "重试后成功"},
        ]

        result = pc._execute_with_retry("tool", {}, {}, max_retries=2, retry_delay=0)
        assert result["success"] is True
        assert disp.execute.call_count == 2

    def test_retry_all_fail(self):
        """所有重试均失败时应返回最后的错误"""
        pc, disp, _, _ = self._make_pc()
        disp.execute.side_effect = [
            {"success": False, "error": "错误1"},
            {"success": False, "error": "错误2"},
            {"success": False, "error": "错误3"},
        ]

        result = pc._execute_with_retry("tool", {}, {}, max_retries=2, retry_delay=0)
        assert result["success"] is False
        assert disp.execute.call_count == 3

    # ── undo_last ──

    def test_undo_no_session_manager(self):
        """无 session_manager 时应返回失败"""
        pc, _, _, _ = self._make_pc(session_manager=None)
        result = pc.undo_last()
        assert result["success"] is False
        assert "会话管理器" in result["message"]

    def test_undo_empty_stack(self):
        """无可撤销操作时应返回失败"""
        tmp = tempfile.mkdtemp()
        try:
            sm = SessionManager(Path(tmp))
            pc, _, _, _ = self._make_pc(session_manager=sm)
            result = pc.undo_last(data_manager=MagicMock())
            assert result["success"] is False
            assert "无可撤销" in result["message"]
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_undo_create_deletes_item(self):
        """撤销 create 操作应调用 data_manager.delete_by_name"""
        tmp = tempfile.mkdtemp()
        try:
            sm = SessionManager(Path(tmp))
            sm.push_undo({
                "time": time.time(),
                "tool": "system.game_data",
                "action": "create",
                "params": {"action": "create", "data_type": "roles", "name": "战士"},
                "data_type": "roles",
                "name": "战士",
            })

            pc, _, _, _ = self._make_pc(session_manager=sm)
            dm = MagicMock()
            result = pc.undo_last(data_manager=dm)

            assert result["success"] is True
            dm.delete_by_name.assert_called_once_with("roles", "战士")
            assert "撤销" in result["message"]
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_undo_no_data_manager(self):
        """有 undo 栈但无 data_manager 时应返回失败"""
        tmp = tempfile.mkdtemp()
        try:
            sm = SessionManager(Path(tmp))
            sm.push_undo({"action": "create", "data_type": "roles", "name": "x"})

            pc, _, _, _ = self._make_pc(session_manager=sm)
            result = pc.undo_last(data_manager=None)
            assert result["success"] is False
            assert "数据管理器" in result["message"]
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ── _record_operation ──

    def test_record_operation_ignores_non_game_data(self):
        """非 system.game_data 工具不应记录"""
        tmp = tempfile.mkdtemp()
        try:
            sm = SessionManager(Path(tmp))
            pc, _, _, _ = self._make_pc(session_manager=sm)

            pc._record_operation("system.file", {"action": "create"}, {"success": True})
            assert len(sm.undo_stack) == 0
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_record_operation_pushes_create_and_delete(self):
        """create 和 delete 操作应推入 undo 栈"""
        tmp = tempfile.mkdtemp()
        try:
            sm = SessionManager(Path(tmp))
            pc, _, _, _ = self._make_pc(session_manager=sm)

            pc._record_operation(
                "system.game_data",
                {"action": "create", "data_type": "roles", "name": "战士"},
                {"success": True},
            )
            assert len(sm.undo_stack) == 1
            assert sm.undo_stack[0]["action"] == "create"
            assert sm.undo_stack[0]["name"] == "战士"

            pc._record_operation(
                "system.game_data",
                {"action": "delete", "data_type": "roles", "name": "法师"},
                {"success": True},
            )
            assert len(sm.undo_stack) == 2
            assert sm.undo_stack[1]["action"] == "delete"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_record_operation_ignores_update_action(self):
        """update 等非 create/delete 操作不应记录"""
        tmp = tempfile.mkdtemp()
        try:
            sm = SessionManager(Path(tmp))
            pc, _, _, _ = self._make_pc(session_manager=sm)

            pc._record_operation(
                "system.game_data",
                {"action": "update", "data_type": "roles", "name": "战士"},
                {"success": True},
            )
            assert len(sm.undo_stack) == 0
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


# ═══════════════════════════════════════════════════════════
#  ReactEngine 测试
# ═══════════════════════════════════════════════════════════

@pytest.mark.skipif(not _HAS_REACT_ENGINE, reason="ReactEngine 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestReactEngine:
    """核心 ReAct 推理引擎测试 — JSON解析、Token估算、降级回复、引用更新、危险检测"""

    def _make_engine(self):
        """创建全 mock 依赖的 ReactEngine"""
        engine = ReactEngine(
            dispatcher=MagicMock(),
            memory=MagicMock(),
            learner=MagicMock(),
            guard=MagicMock(),
            subagent_engine=MagicMock(),
            intent_parser=MagicMock(),
            ctx_mgr=MagicMock(),
            perf=MagicMock(),
            call_ai_fn=MagicMock(),
            workspace=MagicMock(),
        )
        return engine

    # ── parse_with_think ──

    def test_parse_with_think_json_with_think_field(self):
        """JSON 带 think 字段应解析为 (think, 剩余字段)"""
        engine = self._make_engine()
        raw = '{"think": "让我分析一下", "tool": "system.game_data", "params": {}}'
        think, data = engine.parse_with_think(raw)

        assert think == "让我分析一下"
        assert data["tool"] == "system.game_data"
        assert data["params"] == {}
        # think 应已从 data 中移除
        assert "think" not in data

    def test_parse_with_think_json_with_reasoning_field(self):
        """JSON 带 reasoning 字段也应被识别"""
        engine = self._make_engine()
        raw = '{"reasoning": "推理过程", "tool": "x"}'
        think, data = engine.parse_with_think(raw)

        assert think == "推理过程"
        assert data["tool"] == "x"
        assert "reasoning" not in data

    def test_parse_with_think_plain_json(self):
        """普通 JSON (无 think/reasoning) 应返回空 think"""
        engine = self._make_engine()
        raw = '{"tool": "system.game_data", "params": {"name": "test"}}'
        think, data = engine.parse_with_think(raw)

        assert think == ""
        assert data["tool"] == "system.game_data"

    def test_parse_with_think_non_json_text(self):
        """非 JSON 纯文本应返回空元组"""
        engine = self._make_engine()
        think, data = engine.parse_with_think("这不是一段JSON文本")

        assert think == ""
        assert data == {}

    def test_parse_with_think_empty_string(self):
        """空字符串应返回空元组"""
        engine = self._make_engine()
        think, data = engine.parse_with_think("")
        assert think == ""
        assert data == {}

    def test_parse_with_think_markdown_wrapped_json(self):
        """markdown 代码块包裹的 JSON 也应正确解析"""
        engine = self._make_engine()
        raw = '一些前缀文字\n```json\n{"think": "思考", "tool": "x"}\n```'
        think, data = engine.parse_with_think(raw)

        assert think == "思考"
        assert data["tool"] == "x"

    def test_parse_with_think_json_prefix_text(self):
        """JSON 前有前缀文字时应从第一个 { 开始解析"""
        engine = self._make_engine()
        raw = '前缀说明文字 {"think": "分析", "action": "go"}'
        think, data = engine.parse_with_think(raw)

        assert think == "分析"
        assert data["action"] == "go"

    # ── _estimate_tokens ──

    def test_estimate_tokens(self):
        """_estimate_tokens 应返回正整数 (委托给 SafetyGuard)"""
        engine = self._make_engine()
        with patch("core.agent.safety_guard.SafetyGuard._estimate_tokens", return_value=10):
            result = ReactEngine._estimate_tokens("一段测试文本")
            assert isinstance(result, int)
            assert result == 10

    def test_estimate_tokens_empty_string(self):
        """空字符串应返回 0 或接近 0 的值"""
        engine = self._make_engine()
        with patch("core.agent.safety_guard.SafetyGuard._estimate_tokens", return_value=0):
            result = ReactEngine._estimate_tokens("")
            assert result == 0

    # ── _fallback_answer ──

    def test_fallback_answer_returns_first_nonempty(self):
        """应返回 all_results 中第一个非空字符串"""
        result = ReactEngine._fallback_answer({
            0: "",
            1: "创建角色成功",
            2: "更新完成",
        })
        assert result == "创建角色成功"

    def test_fallback_answer_all_empty(self):
        """全部为空时应返回默认回复"""
        result = ReactEngine._fallback_answer({0: "", 1: ""})
        assert result == "抱歉，暂时无法处理这个请求。"

    def test_fallback_answer_empty_dict(self):
        """空字典应返回默认回复"""
        result = ReactEngine._fallback_answer({})
        assert result == "抱歉，暂时无法处理这个请求。"

    def test_fallback_answer_skips_none_values(self):
        """None 值应被跳过"""
        result = ReactEngine._fallback_answer({0: None, 1: "有效结果"})
        assert result == "有效结果"

    # ── update_refs ──

    def test_update_refs_updates_existing_attrs(self):
        """update_refs 应更新已存在的下划线前缀属性"""
        engine = self._make_engine()
        new_dispatcher = MagicMock()
        new_memory = MagicMock()

        engine.update_refs(dispatcher=new_dispatcher, memory=new_memory)
        assert engine._dispatcher is new_dispatcher
        assert engine._memory is new_memory

    def test_update_refs_ignores_unknown_attrs(self):
        """update_refs 应忽略不存在的属性名"""
        engine = self._make_engine()
        # 不应抛出异常
        engine.update_refs(nonexistent_field="value")
        assert not hasattr(engine, "_nonexistent_field") or engine._nonexistent_field != "value"

    # ── _check_dangerous ──

    def test_check_dangerous_guard_says_safe(self):
        """guard.check_dangerous 返回 False 时应返回 False (非危险)"""
        engine = self._make_engine()
        engine._guard.check_dangerous.return_value = False

        result = engine._check_dangerous("tool_a", {}, {}, [], {}, 0)
        assert result is False

    def test_check_dangerous_guard_detects_danger_no_window(self):
        """guard 检测到危险但无 main_window 时应返回 True (阻止执行)"""
        engine = self._make_engine()
        engine._guard.check_dangerous.return_value = True
        engine._main_window = None

        all_results = {}
        result = engine._check_dangerous("tool_a", {}, {}, [], all_results, 0)
        # 无窗口时无法弹确认框，默认阻止
        assert result is True

    def test_check_dangerous_user_confirms_via_dialog(self):
        """用户点确认时 guard 返回 True 但 _check_dangerous 返回 False (允许继续)"""
        engine = self._make_engine()
        engine._guard.check_dangerous.return_value = True
        engine._main_window = MagicMock()

        # 构造 QMessageBox mock: question 返回 Yes → 用户确认
        mock_qmb_cls = MagicMock()
        yes_btn = object()  # 唯一标识
        mock_qmb_cls.StandardButton.Yes = yes_btn
        mock_qmb_cls.StandardButton.No = object()
        mock_qmb_cls.question.return_value = yes_btn  # == StandardButton.Yes

        mock_qt_widgets = MagicMock()
        mock_qt_widgets.QMessageBox = mock_qmb_cls

        with patch.dict("sys.modules", {"PyQt6": MagicMock(), "PyQt6.QtWidgets": mock_qt_widgets}):
            result = engine._check_dangerous(
                "tool_a", {"action": "delete"}, {"main_window": engine._main_window}, [], {}, 0
            )
            # 用户确认后应返回 False (允许继续执行)
            assert result is False

    def test_check_dangerous_user_cancels_records_stop(self):
        """用户取消时应在 all_results 中记录 STOP"""
        engine = self._make_engine()
        engine._guard.check_dangerous.return_value = True
        engine._main_window = MagicMock()

        # 构造 QMessageBox mock: question 返回 No → 用户取消
        mock_qmb_cls = MagicMock()
        yes_btn = object()
        no_btn = object()
        mock_qmb_cls.StandardButton.Yes = yes_btn
        mock_qmb_cls.StandardButton.No = no_btn
        mock_qmb_cls.question.return_value = no_btn  # != StandardButton.Yes

        mock_qt_widgets = MagicMock()
        mock_qt_widgets.QMessageBox = mock_qmb_cls

        with patch.dict("sys.modules", {"PyQt6": MagicMock(), "PyQt6.QtWidgets": mock_qt_widgets}):
            all_results = {}
            result = engine._check_dangerous(
                "danger_tool", {"action": "delete"},
                {"main_window": engine._main_window}, [], all_results, 5
            )
            assert result is True
            assert 5 in all_results
            assert "STOP" in all_results[5]


# ═══════════════════════════════════════════════════════════
#  脚本入口
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    # 支持 python test_subsystems.py 直接运行
    pytest.main([__file__, "-v", "--tb=short"])
