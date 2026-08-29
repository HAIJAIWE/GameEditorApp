from __future__ import annotations

from collections.abc import Callable
import json
from pathlib import Path
import time
from typing import Optional
import uuid

from common.logger import get_logger
from core.agent.agents.collaboration import Blackboard
from core.agent.agents.subagent_engine import SubAgentEngine
from core.agent.dispatcher import ToolDispatcher
from core.agent.frontend_snapshot import FrontendSnapshot
from core.agent.intent import IntentParser, Planner
from core.agent.learner import Learner
from core.agent.memory import Memory
from core.agent.safety_guard import SafetyGuard
from core.agent.workspace import get_workspace

logger = get_logger()


class AgentBrain:
    _MAX_MESSAGE_CHARS = 16000
    _DEFAULT_MAX_TOKENS = 8000
    _DEFAULT_MAX_ITERATIONS = 5
    _SUMMARY_KEEP_LAST = 3
    _KEEP_SYSTEM_FIRST = 3

    def __init__(self, data_dir: str = "", config: Optional[object] = None,
                 main_window: Optional[object] = None,
                 agent_manager: Optional[object] = None,
                 frontend_snapshot: Optional[FrontendSnapshot] = None):
        self._logger = get_logger()
        self._max_tokens = self._DEFAULT_MAX_TOKENS
        self._max_iterations = self._DEFAULT_MAX_ITERATIONS
        self._config = config
        self._agent_manager = agent_manager
        # ── agent↔ui 解耦：brain 只持有 FrontendSnapshot，不再直接持有 main_window ──
        # 向后兼容：若未提供 frontend_snapshot 但提供了 main_window，自动包装
        if frontend_snapshot is not None:
            self._frontend_snapshot = frontend_snapshot
        elif main_window is not None:
            self._frontend_snapshot = FrontendSnapshot(
                main_window=main_window,
                config=config,
                data_manager=getattr(main_window, 'data_manager', None),
            )
        else:
            self._frontend_snapshot = FrontendSnapshot(config=config)
        # _main_window 字段保留为 property（仅向后兼容被跳过的测试，新代码勿用）

        self._workspace = get_workspace()
        memory_dir = data_dir or str(self._workspace.memory_dir)
        self.memory = Memory(data_dir=memory_dir)
        self.learner = Learner(self.memory)
        self._session_conv_count = 0
        self._session_tool_calls = 0
        self._failure_count = 0
        self._last_user_input = ""
        self._last_response = ""
        self._blackboard = Blackboard()
        self._subagent_engine = SubAgentEngine(self)
        self._session_start = time.time()
        self._undo_stack: list = []
        self._success_count = 0

        self._session_dir = Path(memory_dir)
        self._session_dir.mkdir(parents=True, exist_ok=True)
        self._session_file = self._session_dir / "active_session.json"
        self._restored_context: Optional[list] = None
        self._session_meta: dict = {}

        self._try_restore_session()

        from core.agent.plugin_system import PluginSystem
        self._plugin_system = PluginSystem()
        self._plugin_system.discover()

        from core.agent.perf_dashboard import PerfDashboard
        self._perf = PerfDashboard(data_dir=str(self._session_dir / "perf"))

        self.dispatcher = ToolDispatcher()
        self.intent_parser = IntentParser(call_ai=self._call_ai)
        self.planner = Planner(call_ai=self._call_ai)
        self._guard = SafetyGuard(max_tokens=self._max_tokens,
                                  keep_system_first=self._KEEP_SYSTEM_FIRST)

        self._logger.info(f"AgentBrain initialized [workspace={self._workspace.current}]")

    def reload_workspace(self):
        """切换工作区后完整重载 Memory / Session / Perf"""
        memory_dir = str(self._workspace.memory_dir)
        self.memory = Memory(data_dir=memory_dir)
        self.learner = Learner(self.memory)
        self._session_conv_count = 0
        self._session_tool_calls = 0
        self._failure_count = 0

        self._session_dir = Path(memory_dir)
        self._session_dir.mkdir(parents=True, exist_ok=True)
        self._session_file = self._session_dir / "active_session.json"
        self._restored_context = None
        self._session_meta = {}
        self._try_restore_session()

        from core.agent.perf_dashboard import PerfDashboard
        self._perf = PerfDashboard(data_dir=str(self._session_dir / "perf"))

        self._logger.info(f"AgentBrain workspace reloaded [workspace={self._workspace.current}]")

    def configure(self, max_tokens: int = None, max_iterations: int = None,
                  temperature: float = None, model: str = None):
        if max_tokens is not None and max_tokens > 0:
            self._max_tokens = max_tokens
            self._logger.info(f"[Config] max_tokens={self._max_tokens}")
        if max_iterations is not None and max_iterations > 0:
            self._max_iterations = max_iterations
            self._logger.info(f"[Config] max_iterations={self._max_iterations}")
        if temperature is not None and self._config:
            self._config.temperature = temperature
            self._logger.info(f"[Config] temperature={temperature}")
        if model is not None and self._config:
            self._config.model = model
            self._logger.info(f"[Config] model={model}")

    def reload_config(self):
        """Agent OS §12: 配置热更新 — 不重启即生效 identity / tools / agents"""
        self._logger.info("[HotReload] 开始配置热更新...")

        # 1. 重载 AI 配置
        try:
            from core.agent.workspace import get_workspace
            ws = get_workspace()
            api_cfg = ws.load_settings("api_config")
            if api_cfg and self._config:
                if api_cfg.get("model"):
                    self._config.model = api_cfg["model"]
                if api_cfg.get("temperature"):
                    self._config.temperature = float(api_cfg["temperature"])
                if api_cfg.get("max_tokens"):
                    self._max_tokens = int(api_cfg["max_tokens"])
                self._logger.info("[HotReload] AI配置已更新")
        except Exception as e:
            self._logger.warning(f"[HotReload] AI配置重载失败: {e}")

        # 2. 重载 Agent 定义
        if self._agent_manager:
            try:
                ws = get_workspace() if 'ws' not in dir() else ws
                ws_reload = get_workspace()
                agents_cfg = ws_reload.load_settings("agents")
                if agents_cfg:
                    self._logger.info("[HotReload] Agent定义从配置加载（暂简化）")
            except Exception as e:
                self._logger.warning(f"[HotReload] Agent重载失败: {e}")

        # 3. 重载身份/人格
        try:
            ws2 = get_workspace()
            identity = ws2.load_identity()
            persona = ws2.load_persona()
            self._logger.info(f"[HotReload] 身份/人格已更新 ({identity.get('name','?')})")
        except Exception as e:
            self._logger.warning(f"[HotReload] 身份重载失败: {e}")

        # 4. 刷新技能注册
        try:
            count = self.dispatcher.discover_skills("core.agent.skills")
            self._logger.info(f"[HotReload] 技能已刷新 ({count}个)")
        except Exception as e:
            self._logger.warning(f"[HotReload] 技能重载失败: {e}")

        self._logger.info("[HotReload] 配置热更新完成")

    def health_check(self) -> dict:
        """Agent OS §12: 健康检查 — 返回系统运行时状态"""
        mem_stats = self.memory.get_memory_stats()
        return {
            "status": "running",
            "session_conv_count": self._session_conv_count,
            "failure_count": self._failure_count,
            "ai_available": self._ai_available(),
            "tools_count": len(self.dispatcher._skills) if hasattr(self.dispatcher, '_skills') else 0,
            "agents_loaded": bool(self._agent_manager),
            "memory": mem_stats,
            "config": {
                "model": self._config.model if self._config else "N/A",
                "max_tokens": self._max_tokens,
                "max_iterations": self._max_iterations,
            },
        }

    def _call_ai(self, config, prompt="", system_prompt=None, messages_list=None):
        from common.rate_limiter import RateLimiter
        if not RateLimiter().acquire("llm", timeout=15.0):
            self._logger.warning("[Agent] LLM 调用被限流，降级到关键词引擎")
            return False, "限流: 请求过于频繁，请稍后再试"
        from common.ai_client import generate_text
        return generate_text(config, prompt, system_prompt, messages_list)

    def boot(self):
        count = self.dispatcher.discover_skills("core.agent.skills")
        self.dispatcher.register_mcp_tools()
        self.dispatcher.set_subagent_handler(self._spawn_subagent)
        self._logger.info(f"AgentBrain booted with {count} skills")

    def set_agent_manager(self, agent_manager):
        self._agent_manager = agent_manager

    def process(self, user_input: str, callback: Optional[Callable] = None,
                extra: Optional[dict] = None, images: Optional[list] = None) -> dict:
        self._logger.info(f"[Agent] 用户输入: {user_input[:80]}" + (f" [附带{len(images)}张图片]" if images else ""))

        # 设置操作日志的会话上下文
        conv_id = (extra or {}).get("_conv_id")
        if conv_id:
            from core.operation_log import set_conversation_id
            set_conversation_id(conv_id)

        context = self._build_context(extra)
        context["_raw_input"] = user_input

        # Agent OS: LLM 生成结构化执行计划
        plan = {}
        if self._ai_available():
            intent = self.intent_parser.parse(user_input, None)
            context["_intent"] = intent
            if intent and intent.confidence >= 0.5:
                tools_desc = self.dispatcher.get_tools_description()
                plan = self.planner.plan(user_input, self._config, tools_desc)
            else:
                plan = {"goal": user_input[:50], "steps": []}

        context["_plan"] = plan

        if self._ai_available():
            # Agent OS: 有计划的先按计划执行，再让LLM总结
            result = self._agent_loop(user_input, callback, context, "auto", images)
        else:
            self._logger.info("[Agent] 路由: 关键词规则引擎 (AI 未配置)")
            result = self._keyword_engine(user_input, callback, context)

        self._last_user_input = user_input
        self._last_response = str(result.get("message", ""))[:500]

        self.memory.save_conversation(user_input, str(result.get("message", ""))[:500])

        self._session_conv_count += 1
        tool_count = len(context.get("_plan", {}).get("steps", [])) or \
                     (1 if result.get("iterations", 0) > 0 else 0)
        self._session_tool_calls += tool_count

        capture_interval = 5
        consolidate_interval = 10

        if self._session_conv_count >= 5:
            ratio = self._session_tool_calls / max(self._session_conv_count, 1)
            self._logger.debug(f"[Memory] 复杂度评估: tool_ratio={ratio:.0%}")
            if ratio > 0.5:
                capture_interval = 3
                consolidate_interval = 5
            elif ratio > 0.25:
                capture_interval = 5
                consolidate_interval = 10
            else:
                capture_interval = 8
                consolidate_interval = 15

        if self._session_conv_count % capture_interval == 0:
            self.memory.capture_context()
            # Agent OS: 中途中更新 MEMORY.md
            try:
                project_ctx = self._extract_project_context()
                self.memory.save_project_memory(project_ctx)
            except Exception as e:
                self._logger.warning(f"[Memory] 保存项目记忆失败: {e}")
        if self._session_conv_count % consolidate_interval == 0:
            self.memory.consolidate()
            self.memory.learn_preferences()
            self.memory.auto_archive()
        # Agent OS §12: 部署监控 — 记录请求指标
        self._record_deploy_metric("request", {
            "conv_count": self._session_conv_count,
            "failure_count": self._failure_count,
            "has_plan": bool(context.get("_plan", {}).get("steps", [])),
        })

        return result

    def end_session(self):
        """结束当前会话，提炼记忆并学习偏好"""
        self.memory.capture_context()
        self.memory.consolidate()
        self.memory.learn_preferences()
        self.memory.auto_archive()
        # Agent OS: 反思循环 — 分析失败并写经验
        if self._failure_count > 0:
            self._reflect_on_failures()
        # Agent OS: 持久化长期记忆到 MEMORY.md
        try:
            project_ctx = self._extract_project_context()
            self.memory.save_project_memory(project_ctx)
        except Exception as e:
            self._logger.warning(f"保存项目记忆失败: {e}")
        self.memory.clear_session()
        self._session_conv_count = 0
        self._session_tool_calls = 0
        self._logger.info("Session 结束，记忆已提炼")

    def _reflect_on_failures(self):
        """Agent OS §8 反思循环：失败模式归类 + 经验自动匹配 + 固化"""
        recent = self.learner.get_recent_failures(10)
        if not recent:
            return

        # Agent OS: 失败模式归类
        patterns = self._categorize_failure_patterns(recent)
        for pattern, failures in patterns.items():
            if len(failures) >= 2:
                self._logger.info(f"[Reflect] 发现失败模式 [{pattern}]: {len(failures)}次")
                suggestion = self._get_pattern_suggestion(pattern, failures)
                self.memory.save_learning("failure_pattern",
                    f"[{pattern}] {len(failures)}次: {suggestion}")
        summary = "\n".join(f"- {r['tool']}: {r['error'][:80]}" for r in recent)
        note = f"Session 反思 ({time.strftime('%Y-%m-%d %H:%M')}):\n{self._failure_count}次工具调用失败\n{summary}"
        self.memory.save_learning("reflect", note)
        self._logger.info(f"[Reflection] 已记录 {len(recent)} 条失败经验, {len(patterns)} 个模式")

        # Agent OS 评估层：LLM-Judge 自动评分
        self._evaluate_last_turn(self._last_user_input, self._last_response)

    @staticmethod
    def _categorize_failure_patterns(failures: list) -> dict:
        """Agent OS §8: 失败模式归类"""
        patterns = {}
        for f in failures:
            err = str(f.get("error", "")).lower()
            tool = f.get("tool", "unknown")
            if "not found" in err or "不存在" in err or "找不到" in err:
                key = "数据不存在"
            elif "permission" in err or "权限" in err or "denied" in err:
                key = "权限不足"
            elif "timeout" in err or "超时" in err:
                key = "超时"
            elif "json" in err or "parse" in err or "格式" in err or "schema" in err:
                key = "格式/解析错误"
            elif "param" in err or "参数" in err or "invalid" in err:
                key = "参数错误"
            elif "connection" in err or "连接" in err or "network" in err:
                key = "网络/连接"
            else:
                key = f"其他.{tool}"
            if key not in patterns:
                patterns[key] = []
            patterns[key].append(f)
        return dict(sorted(patterns.items(), key=lambda x: -len(x[1])))

    @staticmethod
    def _get_pattern_suggestion(pattern: str, failures: list) -> str:
        """Agent OS §8: 根据失败模式给出经验建议"""
        suggestions = {
            "数据不存在": "先 query 确认数据存在再操作，检查名称拼写",
            "权限不足": "检查工具白名单和 ACL 配置",
            "超时": "减少批量操作规模，或增加超时时间",
            "格式/解析错误": "检查参数 JSON 格式，确保符合工具 schema",
            "参数错误": "参考工具 input_schema 检查参数类型和必填项",
            "网络/连接": "检查网络状态和 API 端点可用性",
        }
        tools = list(set(f.get("tool", "") for f in failures))
        base = suggestions.get(pattern, f"检查工具 {', '.join(tools[:3])} 的参数配置")
        return f"{base} (涉及: {', '.join(tools[:3])})"


    def _evaluate_last_turn(self, last_user_input: str = "", last_response: str = ""):
        """Agent OS 评估层：LLM-Judge 自动评分"""
        if not last_user_input and not last_response:
            return
        try:
            from testing.auto_evaluator import auto_reflect_if_low
        except ImportError:
            try:
                from pathlib import Path
                import sys
                src = Path(__file__).resolve().parent.parent.parent
                if str(src) not in sys.path:
                    sys.path.insert(0, str(src))
                from testing.auto_evaluator import auto_reflect_if_low
            except ImportError:
                self._logger.debug("评估模块不可用，跳过")
                return
        try:
            auto_reflect_if_low(
                last_user_input[:200],
                last_response[:500],
                self._config,
                self.memory
            )
            self._logger.debug("[Evaluate] LLM-Judge 评分完成")
        except Exception as e:
            self._logger.debug(f"评估跳过: {e}")
    def _ai_available(self) -> bool:
        return bool(self._config and getattr(self._config, 'enabled', False)
                    and getattr(self._config, 'api_key', ''))

    def _build_context(self, extra: dict = None) -> dict:
        ctx = dict(extra or {})
        snap = self._frontend_snapshot
        # 数据引用直接从 snapshot 获取（不再从 main_window 内省）
        ctx.setdefault("data_manager", snap.data_manager)
        ctx.setdefault("config", snap.config or self._config)
        # main_window 仅在向后兼容场景下注入（部分旧 skill 仍读取 context["main_window"]）
        if snap.main_window is not None:
            ctx.setdefault("main_window", snap.main_window)
        # 库信息（原 _inject_library_context 逻辑已迁移到 FrontendSnapshot）
        lib_ctx = snap.get_library_context()
        if lib_ctx:
            ctx.setdefault("active_library", lib_ctx.get("active_library"))
            ctx.setdefault("library_path", lib_ctx.get("library_path", ""))
            ctx.setdefault("all_libraries", lib_ctx.get("all_libraries", []))
            if "data_types" in lib_ctx:
                ctx.setdefault("data_types", lib_ctx["data_types"])
            ctx.setdefault("library_summary", snap.build_library_summary())
        return ctx

    # ===================================================================
    #  会话持久化 (跨重启恢复)
    # ===================================================================

    def _try_restore_session(self):
        if not self._session_file.exists():
            return
        try:
            data = json.loads(self._session_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return
            self._restored_context = data.get("messages", [])
            self._session_meta = data.get("meta", {})
            if self._restored_context:
                self._logger.info(
                    f"[Session] 恢复会话: {len(self._restored_context)}条消息, "
                    f"时间={self._session_meta.get('saved_at', '未知')}"
                )
            else:
                self._restored_context = None
        except Exception as e:
            self._logger.warning(f"[Session] 会话恢复失败: {e}")
            self._restored_context = None

    def _save_session(self, messages: list):
        try:
            # 修复 P3-32: 超长 content 截断而非丢弃，避免会话恢复时丢失上下文角色
            def _truncate(m: dict) -> dict:
                out = {}
                for k, v in m.items():
                    if k == "content" and isinstance(v, str) and len(v) > 2000:
                        out[k] = v[:2000] + f"\n[...截断 {len(v) - 2000} 字符...]"
                    else:
                        out[k] = v
                return out

            data = {
                "meta": {
                    "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "timestamp": time.time(),
                    "message_count": len(messages),
                },
                "messages": [_truncate(m) for m in messages[-50:]],
            }
            self._session_file.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            self._logger.warning(f"[Session] 会话保存失败: {e}")

    def has_pending_session(self) -> bool:
        return bool(self._restored_context)

    def get_pending_session_info(self) -> dict:
        return {
            "has_session": self.has_pending_session(),
            "message_count": len(self._restored_context) if self._restored_context else 0,
            "saved_at": self._session_meta.get("saved_at", ""),
        }

    def load_pending_session(self) -> Optional[list]:
        context = self._restored_context
        self._restored_context = None
        self._session_meta = {}
        return context

    def clear_session(self):
        self._restored_context = None
        self._session_meta = {}
        try:
            if self._session_file.exists():
                self._session_file.unlink()
        except OSError as e:
            self._logger.warning(f"[Session] 会话文件清理失败: {e}")

    def _record_deploy_metric(self, metric_type: str, data: dict):
        """Agent OS §12: 部署监控 — 写入 metrics.jsonl"""
        try:
            mp = self._session_dir / "metrics.jsonl"
            entry = {"type": metric_type, "timestamp": time.time(), **data}
            with open(mp, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError as e:
            self._logger.debug(f"[Metrics] 写入失败: {e}")

    # ===================================================================
    #  Agent OS: 计划驱动执行 (§4 Plan-Execute)
    # ===================================================================

    def _execute_plan(self, steps: list, context: dict, callback=None, max_replan: int = 3) -> dict:
        """按计划步骤逐一执行工具调用，失败时 LLM 动态重排后续步骤

        Args:
            steps: Planner 输出的步骤列表
            context: 执行上下文（应包含 '_plan' 中的 goal 字段）
            callback: 步骤回调
            max_replan: 最多允许的 replan 次数

        Returns:
            {step_num: result_text}
        """
        results = {}
        steps_remaining = list(steps)
        replan_count = 0
        plan_goal = context.get("_plan", {}).get("goal", "")

        while steps_remaining:
            step_info = steps_remaining.pop(0)
            step_num = step_info.get("step", len(results) + 1)
            tool_name = step_info.get("tool", "")
            params = step_info.get("params", {})
            reason = step_info.get("reason", "")

            if not tool_name:
                self._logger.warning(f"[Plan] 步骤{step_num}无工具名，跳过")
                continue

            self._logger.info(f"[Plan] 执行步骤{step_num}: {tool_name} {params} ({reason})")
            if callback:
                callback("step_start", {"order": step_num, "tool": tool_name, "reason": reason})

            # Agent OS §5: 事前经验预警
            warning = self._warn_from_past_failures(tool_name, params, context)
            if warning:
                self._logger.info(f"[Reflect] 事前预警(步骤{step_num}): {warning[:80]}")

            # Agent OS §5: 带重试的执行
            r = self._execute_with_retry(tool_name, params, context, max_retries=1)

            msg = r.get("message", "") if r.get("success") else f"执行失败: {r.get('error', '未知')}"
            results[step_num] = msg

            self.learner.observe_tool_call(tool_name, params, r.get("success", False),
                                           msg[:200])

            if not r.get("success"):
                self._failure_count += 1
                if steps_remaining and replan_count < max_replan:
                    replan_count += 1
                    self._logger.info(f"[Plan] 步骤{step_num}失败，触发动态replan ({replan_count}/{max_replan})")
                    try:
                        tools_desc = self.dispatcher.get_tools_description()
                        newline = '\n'
                        success_summary = ", ".join(
                            f"步骤{k}✓" for k in results
                            if "失败" not in str(results[k])
                        ) or "无成功步骤"
                        replan_prompt = (
                            f"总体目标: {plan_goal}\n\n"
                            f"上一步 '{reason}' 执行失败: {r.get('error', '未知')[:150]}\n"
                            f"原始参数: {params}\n"
                            f"已完成步骤: {success_summary}\n"
                            f"已获结果摘要: {str({k: str(v)[:100] for k, v in results.items()})[:300]}\n\n"
                            f"剩余步骤需求:\n{newline.join('- ' + s.get('reason', '?') for s in steps_remaining)}\n\n"
                            f"请根据上述失败信息，重新规划剩余步骤。可以考虑:\n"
                            f"1. 先 query 获取正确名称再操作\n2. 使用不同的工具/action组合\n"
                            f"3. 调整参数格式或数据类型"
                        )
                        new_plan = self.planner.plan(replan_prompt, self._config, tools_desc)
                        new_steps = new_plan.get("steps", [])
                        if new_steps:
                            self._logger.info(f"[Plan] Replan生成 {len(new_steps)} 步替代方案")
                            steps_remaining = [self.planner._normalize_step(s) for s in new_steps]
                            continue
                    except Exception as e:
                        self._logger.warning(f"[Plan] Replan失败: {e}")
            else:
                self._failure_count = max(0, self._failure_count - 1)

            if callback:
                callback("step_done", {"tool": tool_name, "result": msg[:2000]})

        return results

    def _execute_with_retry(self, tool_name: str, params: dict, context: dict,
                            max_retries: int = 1, retry_delay: float = 0.5,
                            backoff_factor: float = 2.0) -> dict:
        """Agent OS §5: 带指数退避重试的工具执行"""
        import time
        last_error = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                delay = retry_delay * (backoff_factor ** (attempt - 1))
                self._logger.info(f"[Retry] {tool_name} 重试 {attempt}/{max_retries} (延迟{delay:.1f}s)")
                # 阻塞主线程的 sleep：此方法在同步上下文中调用（_execute_plan → _execute_with_retry），
                # 无法直接替换为 asyncio.sleep。max_retries=1 时最大延迟仅 0.5s，在合理范围内。
                time.sleep(delay)
            r = self.dispatcher.execute(tool_name, params, context)
            if r.get("success"):
                self._success_count += 1
                self._record_operation(tool_name, params, r)
                return r
            last_error = r
        return last_error or {"success": False, "error": "所有重试均失败", "message": ""}

    def _warn_from_past_failures(self, tool_name: str, params: dict, context: dict) -> str:
        """Agent OS §8: 事前经验预警 — 执行前匹配历史失败模式"""
        try:
            recent = self.learner.get_recent_failures(20)
            if not recent:
                return ""
            patterns = self._categorize_failure_patterns(recent)
            search_key = json.dumps({k: str(v)[:30] for k, v in params.items()}, ensure_ascii=False)
            for pattern, failures in patterns.items():
                for f in failures:
                    if f.get("tool") == tool_name and len(failures) >= 2:
                        suggestion = self._get_pattern_suggestion(pattern, failures)
                        self.memory.save_learning("pre_warning",
                            f"执行 {tool_name} 前发现历史失败模式 [{pattern}]: {suggestion}")
                        return f"[{pattern}] {suggestion}"
        except json.JSONDecodeError:
            self._logger.debug("[Reflect] 失败模式序列化异常")
        except Exception as e:
            self._logger.warning(f"[Reflect] 事前预警异常: {e}")
        return ""

    def _record_operation(self, tool_name: str, params: dict, result: dict):
        """Agent OS §9: 记录可撤销操作"""
        if tool_name != "system.game_data":
            return
        action = params.get("action", "")
        if action in ("create", "delete"):
            self._undo_stack.append({
                "time": time.time(),
                "tool": tool_name,
                "action": action,
                "params": params,
                "data_type": params.get("data_type", ""),
                "name": params.get("name", params.get("id", "?")),
            })
            if len(self._undo_stack) > 50:
                self._undo_stack = self._undo_stack[-50:]

    def undo_last(self, data_manager=None) -> dict:
        """Agent OS §9: 撤销最后一次创建/删除操作"""
        if not self._undo_stack:
            return {"success": False, "message": "无可撤销操作"}
        op = self._undo_stack.pop()
        if not data_manager:
            return {"success": False, "message": "缺少数据管理器，无法撤销"}
        try:
            dt = op.get("data_type", "")
            name = op.get("name", "")
            if op["action"] == "create":
                data_manager.delete_by_name(dt, name)
                msg = f"已撤销: 删除创建的 {dt}/{name}"
            elif op["action"] == "delete":
                msg = f"已记录: {dt}/{name} 曾被删除，需手动恢复"
            else:
                msg = "未知操作类型，无法撤销"
            self._logger.info(f"[Undo] {msg}")
            return {"success": True, "message": msg}
        except Exception as e:
            return {"success": False, "message": f"撤销失败: {e}"}

    def get_uptime(self) -> float:
        """Agent OS §12: 返回会话运行秒数"""
        return time.time() - self._session_start

    def get_session_stats(self) -> dict:
        """Agent OS §12: 会话统计 — 返回当前会话指标"""
        uptime = self.get_uptime()
        total = self._session_conv_count + self._failure_count
        return {
            "conversations": self._session_conv_count,
            "failures": self._failure_count,
            "successes": self._success_count,
            "success_rate": (
                f"{max(0, self._session_conv_count - self._failure_count)}/{self._session_conv_count}"
                if self._session_conv_count > 0 else "N/A"
            ),
            "has_restored_session": bool(self._restored_context),
            "uptime_seconds": int(uptime),
            "uptime": f"{int(uptime // 60)}m{int(uptime % 60)}s",
            "undo_stack_size": len(self._undo_stack),
        }

    def _extract_project_context(self) -> dict:
        """提取项目上下文信息（数据类型数量、最近操作等）"""
        ctx = {}
        try:
            dm = getattr(self._frontend_snapshot, 'data_manager', None) if hasattr(self, '_frontend_snapshot') else None
            if dm:
                for dt in dm.list_data_types() if dm else []:
                    try:
                        count = len(dm.get_all(dt) if dm else [])
                        if count > 0:
                            ctx[f"数据.{dt}"] = f"{count}条"
                    except KeyError as e:
                        self._logger.debug(f"[Context] 数据类型{dt}不存在: {e}")
        except AttributeError as e:
            self._logger.debug(f"[Context] 数据管理器不可用: {e}")
        try:
            ws = getattr(self, '_workspace', None)
            if ws:
                ctx["工作区"] = ws.current if hasattr(ws, 'current') else "default"
        except AttributeError as e:
            logger.debug(f"操作失败: {e}")
        return ctx

    # ===================================================================
    #  核心循环 — 推理 → 决策 → 执行 → 反思 (Native Tool Use)
    # ===================================================================

    def _agent_loop(self, user_input: str, callback, context: dict, mode="auto",
                    images: Optional[list] = None) -> dict:
        plan_id = f"llm_{uuid.uuid4().hex[:8]}"
        is_plan = (mode == "plan")

        # Agent OS: 计划驱动执行 — 有步骤的计划先直接执行，再让LLM总结
        plan = context.get("_plan", {})
        plan_steps = plan.get("steps", [])
        plan_results = {}
        if plan_steps and self._ai_available():
            self._logger.info(f"[Agent] 计划驱动执行: {len(plan_steps)}步")
            plan_results = self._execute_plan(plan_steps, context, callback)
            # 有执行结果后，让LLM总结
            self._logger.info(f"[Agent] 计划执行完成，{len(plan_results)}步结果，进入LLM总结阶段")

        messages = self._build_agent_messages(user_input, context, plan_results, images, is_plan)
        plan_text = plan.get("goal") if plan else None
        return self._run_llm_iterations(messages, context, is_plan, callback, plan_id, plan_text)

    def _build_agent_messages(self, user_input: str, context: dict, plan_results: dict,
                              images: Optional[list], is_plan: bool) -> list:
        """构建 LLM 消息列表（身份/系统/历史/记忆/黑板/意图/个性化/恢复会话/前端地图/计划结果）"""
        role_system_prompt = self._get_role_additions()
        messages = [
            {"role": "system", "content": self._identity_prompt()},
            {"role": "system", "content": self._build_system_prompt(is_plan, context)},
        ]
        if role_system_prompt:
            messages.append({"role": "system", "content": role_system_prompt})

        history_text = self.memory.format_history_for_llm()
        if history_text:
            messages.append({"role": "system", "content": history_text})

        # Agent OS: 注入长期记忆（MEMORY.md 上下文）
        self.memory.inject_memory_context(messages)

        # Agent OS: 注入黑板上下文（多Agent协作消息）
        bb_context = self._blackboard.get_context()
        if bb_context:
            messages.append({"role": "system", "content": bb_context})

        intent_hint = self._get_intent_hint(user_input, context.get("_intent"))
        if intent_hint:
            messages.append({"role": "system", "content": intent_hint})

        personalization = self.learner.get_personalized_prompt()
        if personalization:
            messages.append({"role": "system", "content": f"[系统] 根据学习到的数据:\n{personalization}"})

        if self._restored_context:
            restored = self._restored_context
            self._restored_context = None
            self._logger.info(f"[Session] 注入恢复的 {len(restored)} 条历史消息")
            for m in restored:
                role = m.get("role", "user")
                content = m.get("content", "")
                if role == "system":
                    continue
                if content and len(str(content)) < 5000:
                    messages.append({"role": role, "content": str(content)})

        if images:
            messages.append({"role": "user", "content": f"[系统] 用户上传了 {len(images)} 张图片，请根据图片内容进行分析处理。"})

        # 前端地图注入 + 文件地图 — 一次生成，全局复用（通过 FrontendSnapshot 生成）
        maps_text = self._frontend_snapshot.generate_maps_text()
        if maps_text:
            messages.append({"role": "system", "content": maps_text})
        context["_maps_cache"] = maps_text  # 供子智能体复用，避免重复生成

        # Agent OS: 注入计划执行结果
        if plan_results:
            results_text = "## 计划执行结果\n"
            for step_num, result_text in plan_results.items():
                results_text += f"步骤{step_num}: {result_text[:500]}\n"
            messages.append({"role": "system", "content": results_text})
            messages.append({"role": "user", "content": f"用户需求: {user_input}\n\n以上是各步骤的执行结果。请综合总结并回答用户。"})
        else:
            messages.append({"role": "user", "content": user_input})
        return messages

    def _run_llm_iterations(self, messages: list, context: dict, is_plan: bool,
                            callback, plan_id: str, plan_text: Optional[str]) -> dict:
        """LLM 迭代循环 — 推理→决策→执行→反思（最多 _max_iterations 轮）"""
        tool_schemas = self.dispatcher.get_tools_json_schema()
        all_results = {}
        think_log = []
        use_stream = callback is not None
        self._perf.start_session(plan_id)

        # 触发插件 on_agent_start hook（失败不影响主流程）
        try:
            self._plugin_system.trigger_hook(
                "on_agent_start",
                plan_id=plan_id, messages=messages, context=context
            )
        except Exception as e:
            self._logger.warning(f"[Plugin] on_agent_start hook 异常: {e}")

        for iteration in range(self._max_iterations):
            if callback:
                callback("step_start", {"order": iteration, "tool": "llm_think"})

            self._logger.info(f"[Agent] LLM 第{iteration+1}轮思考...")

            # Agent OS: 滑动窗口压缩
            messages = self._sliding_window_compress(messages)

            if use_stream:
                success, response = self._call_llm_stream(messages, callback, tool_schemas)
            else:
                from common.ai_client import generate_text_with_tools
                success, response = generate_text_with_tools(
                    self._config, "", "", messages, tools=tool_schemas
                )

            if not success:
                self._logger.warning(f"[Agent] LLM 第{iteration+1}轮调用失败: {response.get('content','')[:100]}")
                success, response = self._retry_llm_call(messages, use_stream, callback, tool_schemas)
                if not success:
                    self._logger.warning("[Agent] LLM 重试后仍失败")
                    break

            content = response.get("content", "")
            tool_calls = response.get("tool_calls") or []
            finish_reason = response.get("finish_reason", "stop")

            if content.strip():
                think_log.append(content[:200])
                self._logger.info(f"[Agent] 推理: {content[:100]}")

            # 追加 assistant 消息以符合 OpenAI 协议（tool 结果必须紧跟带 tool_calls 的 assistant）
            assistant_msg = {"role": "assistant", "content": content}
            if tool_calls:
                assistant_msg["tool_calls"] = [
                    {"id": tc.get("id", ""), "type": "function",
                     "function": {"name": tc.get("name", ""), "arguments": tc.get("arguments", "{}")}}
                    for tc in tool_calls
                ]
            messages.append(assistant_msg)

            if finish_reason == "stop" and not tool_calls:
                self._save_session(messages)
                return self._final_result(plan_id, content.strip()[:500], plan_text,
                                          all_results, think_log, callback)

            if not tool_calls:
                self._logger.warning("[Agent] LLM 未返回工具调用，退出循环")
                break

            tool_requests = []
            for tc in tool_calls:
                name = tc.get("name", "")
                try:
                    import json
                    args = json.loads(tc.get("arguments", "{}"))
                except json.JSONDecodeError as e:
                    self._logger.warning(f"[Agent] 工具参数JSON解析失败 (pos={e.pos})")
                    args = {}
                tool_requests.append((tc.get("id", ""), name, args))

            # Plan mode: check for plan content in text response
            if is_plan and content.strip():
                plan_text = content.strip()
                self._save_session(messages)
                return self._final_result(plan_id, plan_text, plan_text,
                                          all_results, think_log, callback)

            if self._agent_manager:
                filtered = []
                for tid, tn, tp in tool_requests:
                    resolved = self.dispatcher.fuzzy_match(tn) or tn
                    if self._is_tool_allowed(resolved):
                        filtered.append((tid, tn, tp))
                    else:
                        self._logger.warning(f"[Agent] 工具 {tn} 不在角色白名单中，已过滤")
                tool_requests = filtered

            if not tool_requests:
                self._logger.warning("[Agent] 无有效工具调用")
                break

            self._execute_and_reflect(tool_requests, context, messages, all_results, iteration, callback)

            self._trim_messages(messages)

        self._save_session(messages)
        return self._final_result(plan_id, self._fallback_answer(all_results), plan_text,
                                  all_results, think_log, callback)

    def _call_llm_stream(self, messages: list, callback, tool_schemas: list = None) -> tuple:
        from common.ai_client import generate_text_stream_with_tools

        stream_chunks = []

        def on_chunk(chunk: str):
            stream_chunks.append(chunk)
            callback("stream_chunk", {"text": chunk, "accumulated": "".join(stream_chunks)[-200:]})

        success, response = generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tool_schemas
        )

        if not success and not stream_chunks:
            success, response = generate_text_stream_with_tools(
                self._config, "", "", messages, tools=tool_schemas
            )

        if callback:
            callback("stream_done", {"full_text": response.get("content", "") if success else ""})

        return success, response

    def _retry_llm_call(self, messages: list, use_stream: bool, callback, tool_schemas: list = None) -> tuple:
        from common.ai_client import generate_text_stream_with_tools, generate_text_with_tools
        for retry in range(2):
            delay = 2.0 * (retry + 1)
            self._logger.info(f"[Agent] LLM 重试 {retry+1}/2，{delay:.0f}s 后执行")
            # 阻塞主线程的 sleep：此方法在同步 _agent_loop 中调用，整体为同步模型。
            # 最大延迟 4s（第2次重试），在 5s 限制范围内。若后续改为异步调用链可替换为 asyncio.sleep。
            time.sleep(delay)
            try:
                if use_stream:
                    success, response = generate_text_stream_with_tools(
                        self._config, "", "", messages, tools=tool_schemas
                    )
                else:
                    success, response = generate_text_with_tools(
                        self._config, "", "", messages, tools=tool_schemas
                    )
                if success:
                    return True, response
                self._logger.warning(f"[Agent] LLM 重试 {retry+1}/2 失败")
            except Exception as e:
                self._logger.warning(f"[Agent] LLM 重试 {retry+1}/2 异常: {e}")
        return False, {"content": "[LLM 重试 2 次后仍失败]"}

    def _is_tool_allowed(self, tool_name: str) -> bool:
        """检查当前工具在当前模式下是否可用。
        Solo 模式：全部可用
        团队模式：只允许 Boss 使用委派/对话工具，数据操作交给子智能体
        """
        if not self._agent_manager or not self._agent_manager.is_team_mode():
            return True

        # 团队模式下 Boss 只能委派/对话，不能直接操作数据
        boss_allowed = {"system.subagent", "system.delegate", "system.ask_user",
                        "system.diagnosis", "system.web_search"}
        return any(kw in tool_name for kw in boss_allowed)

    # ===================================================================
    #  AgentManager 工具白名单
    # ===================================================================

    def _get_role_additions(self) -> str:
        """获取当前角色附加提示词"""
        if not self._agent_manager:
            return ""
        if self._agent_manager.is_team_mode():
            return self._agent_manager.get_boss_prompt()
        return ""

    # ===================================================================
    #  危险操作守卫
    # ===================================================================

    def _check_dangerous(self, tn: str, tp: dict, context: dict, messages: list,
                         all_results: dict, iteration: int) -> bool:
        """检查并确认危险操作（通过 FrontendSnapshot 弹出确认框，解耦 PyQt 依赖）"""
        if not self._guard.check_dangerous(tn, tp, context, messages, all_results, iteration):
            return False

        # Agent OS §9: 通过 FrontendSnapshot 请求用户确认（不再直接依赖 PyQt/main_window）
        # 修复 P2-27: _danger_confirmed 记录 (tool, action) 元组，供 dispatcher 校验匹配
        action_desc = tp.get("action", str(tp)[:40])
        title = "危险操作确认"
        text = (
            f"即将执行危险操作:\n\n"
            f"  工具: {tn}\n"
            f"  参数: {action_desc}\n\n"
            f"是否继续执行？"
        )
        reply = self._frontend_snapshot.confirm_dangerous(title, text)
        if reply is True:
            # 记录被确认的 (tool_name, action) 元组，dispatcher 据此放行
            context["_danger_confirmed"] = (tn, tp.get("action", ""))
            self._logger.info(f"[Safety] 用户确认危险操作: {tn}/{tp.get('action','')}")
            return False
        elif reply is False:
            self._logger.info(f"[Safety] 用户取消危险操作: {tn}")
            all_results[iteration] = f"[STOP] 用户取消了危险操作: {tn}"
            return True
        # reply is None：无法弹出对话框，回落文本确认（允许继续）
        return True

    def _replan_step(self, tool_name: str, tool_params: dict, error: str,
                     messages: list, context: dict) -> str:
        return self._guard.replan_step(tool_name, tool_params, error, messages, context)

    def _get_tool_alternatives(self, tool_name: str) -> list:
        return SafetyGuard._get_tool_alternatives(tool_name)

    def _reset_plan_state(self):
        self._failure_count = 0

    # ===================================================================
    #  工具执行与反思
    # ===================================================================

    def _execute_and_reflect(self, tool_requests, context, messages, all_results, iteration, callback):
        if callback:
            callback("step_start", {"order": iteration, "tool": f"并行{len(tool_requests)}工具"})

        for tid, tn, tp in tool_requests:
            if self._check_dangerous(tn, tp, context, messages, all_results, iteration):
                return

        if len(tool_requests) == 1:
            tid, tn, tp = tool_requests[0]
            # Agent OS §8: 事前经验预警
            warning = self._warn_from_past_failures(tn, tp, context)
            if warning:
                self._logger.info(f"[Reflect] 事前预警: {warning[:80]}")
            # 触发插件 on_tool_call hook（执行前；失败不影响主流程）
            try:
                self._plugin_system.trigger_hook(
                    "on_tool_call",
                    tool_name=tn, params=tp, phase="before"
                )
            except Exception as e:
                self._logger.warning(f"[Plugin] on_tool_call(before) hook 异常: {e}")
            r = self._execute_with_retry(tn, tp, context, max_retries=1)
            msg = r.get("message", "") if r.get("success") else f"执行失败: {r.get('error', '未知')}"
            all_results[iteration] = msg
            # 触发插件 on_tool_call hook（执行后；失败不影响主流程）
            try:
                self._plugin_system.trigger_hook(
                    "on_tool_call",
                    tool_name=tn, params=tp, phase="after", result=r
                )
            except Exception as e:
                self._logger.warning(f"[Plugin] on_tool_call(after) hook 异常: {e}")
            if callback:
                callback("step_done", {"tool": tn, "result": msg[:2000]})

            self.learner.observe_tool_call(tn, tp, r.get("success", False),
                                           r.get("message", r.get("error", ""))[:200])

            if not r.get("success"):
                self._failure_count += 1
                error_msg = r.get('error', '未知')
                if self._failure_count >= 2:
                    alt = self._replan_step(tn, tp, error_msg, messages, context)
                    reflect_hint = (
                        f"\n\n第{self._failure_count}次失败。自动重规划建议:\n"
                        f"{alt}\n请尝试替代方案或调整参数。"
                    )
                else:
                    reflect_hint = (
                        f"\n\n执行失败({error_msg[:60]})。"
                        f"请反思: 参数是否正确？需要先query找到正确名称？"
                    )
                # Agent OS: 中途中度失败(≥3次)自动记录经验
                if self._failure_count >= 3:
                    self.memory.save_learning("mid_session_failure",
                        f"连续{self._failure_count}次失败: {tn} - {error_msg[:80]}")
                    self._logger.info(f"[Reflect] 中途学习: 已记录 {self._failure_count}次连续失败")
            else:
                self._failure_count = 0
                reflect_hint = "\n\n结果很短，需要补充查询验证。"

            messages.append({
                "role": "tool",
                "tool_call_id": tid,
                "name": tn,
                "content": f"{msg[:500]}{reflect_hint}",
            })
            self._logger.info(f"[Agent] 工具结果[{tn}]: {msg[:80]}")
        else:
            combined = self.dispatcher.execute_parallel(
                [(tn, tp) for _, tn, tp in tool_requests], context
            )
            all_results[iteration] = combined
            if callback:
                callback("step_done", {"tool": f"并行{len(tool_requests)}工具", "result": combined[:2000]})
            for tid, tn, tp in tool_requests:
                self.learner.observe_tool_call(tn, tp, True, f"并行执行: {combined[:100]}")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tid,
                    "name": tn,
                    "content": f"并行执行完成:\n{combined[:1000]}\n\n评估结果是否满足需求。",
                })

    # ===================================================================
    #  Token 智能裁剪
    # ===================================================================

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return SafetyGuard._estimate_tokens(text)

    def _trim_messages(self, messages: list):
        return self._guard.trim_messages(messages)

    # ===================================================================
    #  SubAgent 调用
    # ===================================================================

    def _handle_subagent_call(self, subagent_data: dict, context, all_results, iteration) -> str:
        agent_type = subagent_data.get("type", "explorer")
        agent_id = subagent_data.get("agent_id", "")
        task = subagent_data.get("task", subagent_data.get("query", str(subagent_data)))

        if agent_type == "debate":
            self._logger.info(f"[Agent] 启动多Agent辩论: {task[:80]}")
            result = self._multi_agent_debate(subagent_data, context)
            final = result.get("final_answer", str(result))
            rounds_info = f"(共{len(result.get('rounds', []))}轮辩论)"
            msg = f"多Agent辩论结果 {rounds_info}:\n{final[:800]}"
            all_results[iteration] = msg
            return msg

        if agent_id and self._agent_manager:
            agent_def = self._agent_manager.get_agent(agent_id)
            if agent_def:
                self._logger.info(f"[Agent] 委派给 [{agent_def.id}] {agent_def.name}: {task[:80]}")
                result = self._spawn_managed_subagent(task, context, agent_def)
                summary = self._format_subagent_result(result)
                msg = f"[{agent_def.icon} {agent_def.name}] 执行结果：\n{summary[:800]}"
                all_results[iteration] = msg
                return msg

        # 未指定 agent_id 或找不到该智能体时，尝试通过 match_agent 匹配
        lookup = agent_id or agent_type
        if self._agent_manager:
            agent_def = self._agent_manager.match_agent(lookup)
            if agent_def:
                self._logger.info(f"[Agent] 匹配到智能体 [{agent_def.id}] {agent_def.name}: {task[:80]}")
                result = self._spawn_managed_subagent(task, context, agent_def)
                summary = self._format_subagent_result(result)
                msg = f"[{agent_def.icon} {agent_def.name}] 执行结果：\n{summary[:800]}"
                all_results[iteration] = msg
                return msg

        available = [a.id for a in self._agent_manager.list_agents()] if self._agent_manager else []
        err_msg = f"无法找到匹配的智能体 (lookup='{lookup}')。" + (
            f"可用: {', '.join(available)}" if available else "无可用智能体，请先配置团队。"
        )
        self._logger.warning(f"[Agent] {err_msg}")
        all_results[iteration] = err_msg
        return err_msg

    @staticmethod
    def _format_subagent_result(result) -> str:
        summary = ""
        if isinstance(result, dict):
            for r in result.get("results", []):
                summary += r[:300] + "\n"
            if not summary:
                summary = result.get("summary", "")
        else:
            summary = str(result)
        return summary

    # ===================================================================
    #  System Prompt
    # ===================================================================



    def _sliding_window_compress(self, messages: list, max_messages: int = 12) -> list:
        """Agent OS: 智能滑动窗口压缩 — 非等权重消息处理

        压缩策略：
        - system（前3条身份/指令）始终保留
        - 优先级: tool（关键结果） > user（需求） > assistant（思考）
        - 从末尾向头部填充剩余槽位，保证最近上下文完整
        """
        if len(messages) <= max_messages:
            return messages

        # 修复 P3-33: 用 enumerate 一次建立 (msg, original_index)，避免 messages.index(m) O(n²)
        indexed = list(enumerate(messages))  # [(idx, msg), ...]

        system_msgs = [m for _, m in indexed if m.get("role") == "system"]
        keep_system = system_msgs[:3]

        non_system = [(idx, m) for idx, m in indexed if m.get("role") != "system"]
        priority = {"tool": 2, "user": 1, "assistant": 0}
        non_system.sort(key=lambda im: (
            priority.get(im[1].get("role", ""), 0),
            im[0]
        ), reverse=True)

        slots = max_messages - len(keep_system)
        keep_rest = non_system[:slots]
        keep_rest.sort(key=lambda im: im[0])  # 按原顺序恢复

        return keep_system + [m for _, m in keep_rest]

    def _get_project_context(self, context: dict) -> str:
        """扫描项目数据结构，生成 AI 可读的上下文摘要"""
        dm = context.get("data_manager") or self._frontend_snapshot.data_manager
        if not dm or not hasattr(dm, "data"):
            return ""
        lines = []
        from config.constants import _type_registry
        # 构建复数→单数反向映射（安全处理不规则复数如 stories→story）
        plural_to_singular = {}
        for sing, plur in _type_registry.plurals.items():
            plural_to_singular[plur] = sing
        for plural, items in dm.data.items():
            # 修复 P3-33 顺手补: rstrip("s") bug 在 brain.py 残留 — 改用 _resolve_singular
            singular = plural_to_singular.get(plural)
            if not singular:
                from core.agent.skills.common import _resolve_singular
                singular = _resolve_singular(plural)
            label = _type_registry.get_name(singular)
            count = len(items)
            fields = []
            if items:
                fields = [k for k in items[0].keys() if k not in ("id", "__type")][:8]
            lines.append(
                f"- {label} (type: '{singular}', {count}条) " +
                (f"字段: {', '.join(fields)}" if fields else "")
            )
        return "\n".join(lines)
    def _build_managed_agents_desc(self) -> str:
        """可委派的专业智能体清单描述。"""
        managed_agents_desc = ""
        if self._agent_manager:
            agents_info = []
            for a in self._agent_manager.list_agents():
                if a.id == "boss":
                    continue
                tools_str = ", ".join(a.tools[:4]) if a.tools else "无"
                agents_info.append(f"  - {a.icon} **{a.name}** (`{a.id}`): {a.description} [{tools_str}]")
            managed_agents_desc = (
                "\n## 可委派的专业智能体\n"
                + "\n".join(agents_info)
                + "\n使用 `delegate_to_agent` 工具委派，传入 agent_id。"
            )

        return managed_agents_desc


    def _build_project_context_block(self, context) -> str:
        """当前项目上下文块。"""
        proj_ctx = self._get_project_context(context)
        base_proj = ""
        if proj_ctx:
            base_proj = (
                "## 当前项目\n"
                + proj_ctx
                + "\n- data_type 取值用上面的英文 type\n"
            )

        return base_proj


    def _build_library_context_block(self, context) -> str:
        """当前库信息块。"""
        library_ctx = ""
        if context:
            lib_summary = context.get("library_summary", "")
            if lib_summary:
                library_ctx = f"## 当前库信息\n{lib_summary}\n\n"

        return library_ctx


    def _build_plan_context_block(self, context) -> str:
        """Agent OS 执行计划块。"""
        # Agent OS: 注入 LLM 生成的执行计划
        plan_ctx = ""
        if context:
            plan = context.get("_plan", {})
            steps = plan.get("steps", [])
            if steps:
                plan_lines = [f"## 执行计划（按步骤执行）\n目标: {plan.get('goal', 'N/A')}\n步骤:"]
                for s in steps:
                    plan_lines.append(f"  {s['step']}. {s['tool']}/{s.get('action','?')} → {s.get('reason','?')}")
                plan_ctx = "\n".join(plan_lines) + "\n\n"

        return plan_ctx


    def _build_learnings_block(self) -> str:
        """历史学习经验块（反思循环）。"""
        # Agent OS: 注入历史学习经验（反思循环）
        learnings = self.memory.get_recent_learnings(3)
        if learnings:
            learn_lines = ["## 历史经验（请参考以避免重复错误）"]
            for l in learnings:
                learn_lines.append(f"- [{l.get('category','?')}] {l.get('content','')[:120]}")
            learn_ctx = "\n".join(learn_lines) + "\n\n"
        else:
            learn_ctx = ""

        return learn_ctx


    def _build_execution_system_prompt(self, plan_ctx: str, learn_ctx: str, library_ctx: str, base_proj: str, base: str) -> str:
        """执行模式的完整系统提示词。"""
        return (
            "## 身份\n"
            + plan_ctx + learn_ctx + "你是游戏数据设计与开发助手，同时也是前端界面的管理者，可以直接操控编辑器的标签页、布局和面板。\n\n"
            "## 核心规则\n"
            "0.  每次收到用户消息，先看系统给你的【前端地图】！地图告诉你：当前位置(标记)、所有标签页及数据量、布局模式、面板状态、当前选中数据。不要盲猜！\n"
            "0b.  地图中的[WARN]（弹窗）和[ERR]（终端错误）优先看！有问题先解决弹窗和日志错误，再处理用户请求。\n"
            "0c. 看到[ERR]错误日志或[WARN]弹窗时，主动排查并修复！读文件→分析→改代码→重启，能自动修的就修，修完再干活。\n"
            "0d. 发现错误时先告诉用户「 发现错误，正在修复中...」，修完后打出完整报告： 错误摘要 → 原因 → 修复了什么 → 当前状态。修复前和修复后都要让用户知道。\n"
            "1. 如果是策划方案/设计文档 → 使用 system.ceshu action=run 生成\n"
            "2. 如果是创建游戏数据(怪物/技能/装备等) → 使用 system.game_data\n"
            "3. 优先并行调用独立工具\n"
            "4. 工具失败后反思参数，不要重复相同错误\n"
            "5. 不确定数据时先查询再操作\n"
            "6. 结果太短时主动补充查询验证\n"
            "7. 复杂多步骤任务可使用 system.workflow 创建工作流自动化执行\n\n"
            "## 前端操控（重要！你必须操控界面）\n"
            "你是前端管家，可以操控编辑器的界面。使用 system.ui_control 来控制：\n"
            "- 用户说「打开角色」→ system.ui_control action=switch_tab target=roles\n"
            "- 用户说「看怪物」→ system.ui_control action=switch_tab target=monsters\n"
            "- 用户说「去技能/装备/道具/任务页」→ system.ui_control action=switch_tab target=skills/equips/items/tasks\n"
            "- 用户说「去策划页」→ system.ui_control action=switch_tab target=planning\n"
            "- 用户说「用三栏布局」→ system.ui_control action=set_layout target=三栏界面\n"
            "- 用户说「换三栏界面」→ system.ui_control action=set_layout target=三栏界面\n"
            "- 用户说「打开智能体」→ system.ui_control action=toggle_panel target=智能体\n"
            "- 用户说「切换到XX库」→ system.ui_control action=switch_library target=库名\n"
            " system.ui_control 调用格式: {\"action\": \"switch_tab\", \"target\": \"roles\"} — target 必填！\n"
            " 切换标签页前先看地图！如果地图显示你已在目标页(标记)，无需重复切换。\n"
            " 收到用户指令后，如果涉及查看/编辑某个数据，必须先切换到对应标签页，再操作数据！\n"
            " 示例：「打开角色编辑器，创建一个法师」→ 先看地图确认位置 → 如不在角色页则第一步 system.ui_control action=switch_tab target=roles，第二步 system.game_data action=create data_type=roles name=法师\n\n"
            "## 终端/日志\n"
            "- 你无法直接看到终端输出，但可以在项目目录执行命令\n"
            "- 如果需要查看终端输出，使用 system.execute 运行所需命令\n"
            "- 启动/停止服务器、运行脚本、检查状态都用 system.execute\n\n"
            "## 文件与代码操作\n"
            "- 先看【项目文件地图】，了解项目结构再操作文件\n"
            "- 读文件: system.file_ops action=read path=src/core/agent/brain.py\n"
            "- 写文件: system.file_ops action=write path=xxx content=内容\n"
            "- 浏览目录: system.file_ops action=list path=src/\n"
            "- 搜索代码: system.file_ops action=grep keyword=关键词 path=src/\n"
            "- 执行命令: system.shell action=exec command=python --version\n"
            "- 生成代码: system.code mode=generate description=需求描述\n"
            "- 调试错误: system.code mode=debug error=错误信息\n\n"
            "## 创建游戏数据时\n"
            "- 直接用 system.game_data action=create，不要先查询再创建\n"
            "- 一次性给全所有参数：data_type、name、以及需要的属性值\n"
            "- 属性参考前端地图中显示的  字段 列表\n"
            "- 创建完直接展示结果，效率第一\n"
            + library_ctx + base_proj + base
        )



    def _build_system_prompt(self, is_plan: bool, context: dict = None) -> str:
        managed_agents_desc = self._build_managed_agents_desc()
        base_proj = self._build_project_context_block(context)
        library_ctx = self._build_library_context_block(context)
        plan_ctx = self._build_plan_context_block(context)
        learn_ctx = self._build_learnings_block()

        base = (
            "## 规则\n"
            "1. 使用提供的工具完成任务，优先并行调用独立工具\n"
            "2. 工具失败后反思参数, 不要重复相同错误\n"
            "3. 不确定数据时先查询再操作\n"
            "4. 结果太短时主动补充查询验证\n"
            f"{managed_agents_desc}"
        )

        if is_plan:
            return (
                "你是游戏策划分析助手。主要职责是分析和规划。\n"
                "- 使用 system.ceshu action=run 来生成完整的策划方案\n"
                "- 只查不改，3轮内出方案\n"
                + plan_ctx + learn_ctx + library_ctx + base_proj + base
            )

        return self._build_execution_system_prompt(plan_ctx, learn_ctx, library_ctx, base_proj, base)



    # ===================================================================
    #  关键词引擎 (降级)
    # ===================================================================

    def _keyword_engine(self, user_input: str, callback, context: dict) -> dict:
        session_ctx = self.memory.get_session_context()
        intent = self.intent_parser.parse(user_input, session_ctx)
        intent = self.learner.refine(intent)

        if intent is None:
            result = {"success": False, "message": "无法解析意图，请重新描述您的需求"}
            self._logger.warning("[Agent] 意图解析返回 None，使用降级响应")
            if callback:
                callback("done", result)
            return result

        self._logger.info(f"[Agent] 意图={intent.action} 置信度={intent.confidence:.0%}")

        # 闲聊/帮助意图无需调度工具，直接回复
        if intent.action in ("chat", "help"):
            if intent.action == "chat":
                message = "你好！我是你的游戏设计助手，有什么可以帮你的吗？"
            else:
                message = "你可以对我说「创建角色」「打开怪物编辑器」「写一个装备系统策划书」等"
            result = {"success": True, "message": message, "data": None}
            self.learner.observe(intent, result, None)
            self.intent_parser.learn_from_execution(
                intent.action, True, user_input
            )
            if callback:
                callback("done", result)
            return result

        params = dict(intent.params)
        params.update(context)

        result = self.dispatcher.execute(intent.action, params, context)
        self.learner.observe(intent, result, None)
        self.intent_parser.learn_from_execution(
            intent.action, result.get("success", False), user_input
        )

        if callback:
            callback("done", result)

        return result

    def _parse_with_think(self, raw: str) -> tuple:
        import json as _json
        import re as _re
        think = ""
        data = {}
        try:
            first_brace = raw.find("{")
            if first_brace < 0:
                return ("", {})
            json_str = raw[first_brace:]
            json_str = _re.sub(r'```json\s*|```', '', json_str)
            data = _json.loads(json_str)
        except json.JSONDecodeError as e:
            self._logger.warning(f"[Parse] JSON 解析失败 (pos={e.pos}): raw[:200]={raw[:200]}")
            return ("", {})
        except Exception as e:
            self._logger.warning(f"[Parse] 意外异常: {type(e).__name__}: {e} | raw[:200]={raw[:200]}")
            return ("", {})
        if isinstance(data, dict):
            think = str(data.pop("think", data.pop("reasoning", "")))
        return (think, data)

    def _spawn_subagent(self, task: str, context: dict, agent_type: str = "explorer") -> dict:
        maps_text = context.get("_maps_cache", "")
        if not maps_text:
            maps_text = self._frontend_snapshot.generate_maps_text()
        if maps_text:
            context = {**context, "_maps": maps_text}
        return self._subagent_engine.spawn(task, context, agent_type)

    def _spawn_managed_subagent(self, task: str, context: dict, agent_def) -> dict:
        maps_text = context.get("_maps_cache", "")
        if not maps_text:
            maps_text = self._frontend_snapshot.generate_maps_text()
        if maps_text:
            context = {**context, "_maps": maps_text}
        return self._subagent_engine._spawn_managed(task, context, agent_def)

    # ===================================================================
    #  多 Agent 辩论
    # ===================================================================

    def _multi_agent_debate(self, subagent_data: dict, context: dict) -> dict:
        return self._subagent_engine.debate(subagent_data, context)

    # ===================================================================
    #  辅助方法
    # ===================================================================

    def _get_intent_hint(self, user_input: str, cached_intent=None) -> str:
        try:
            intent = cached_intent or self.intent_parser.parse(user_input, None)
            if intent and intent.confidence >= 0.6:
                params_str = ", ".join(f"{k}={v}" for k, v in intent.params.items()
                                       if k in ("data_type", "keyword", "count", "name", "filter"))
                hint = f"[系统提示] 建议 tool=system.{intent.action}"
                if params_str:
                    hint += f" ({params_str})"
                # 策划方案直接告诉 LLM 怎么用
                if "planning" in intent.action:
                    if "create" in intent.action:
                        hint += "。调用 system.ceshu action=write name=方案名 content=方案内容。不要查询数据库"
                    elif "update" in intent.action:
                        hint += "。调用 system.ceshu action=select 或 write"
                return hint
        except json.JSONDecodeError:
            self._logger.debug("[IntentHint] JSON解析异常")
        except Exception as e:
            self._logger.warning(f"[IntentHint] 意图提示生成异常: {e}")
        return ""

    def _identity_prompt(self) -> str:
        identity = self._workspace.read_persona()
        user_profile = self._workspace.read_user_profile()
        if user_profile:
            identity += f"\n\n## 关于你的用户\n{user_profile}"
        return identity

    def _fallback_answer(self, all_results: dict) -> str:
        for r in all_results.values():
            if r and isinstance(r, str) and r.strip():
                return r.strip()
        return "抱歉，暂时无法处理这个请求。"

    def _final_result(self, plan_id: str, answer: str, plan_text,
                      all_results: dict, think_log: list, callback) -> dict:
        self._perf.record_iteration(len(all_results))
        summary = self._perf.end_session()

        # 触发插件 on_agent_finish hook（失败不影响主流程）
        try:
            self._plugin_system.trigger_hook(
                "on_agent_finish",
                plan_id=plan_id, answer=answer, all_results=all_results
            )
        except Exception as e:
            self._logger.warning(f"[Plugin] on_agent_finish hook 异常: {e}")

        if callback:
            cb_extra = {"has_plan": plan_text is not None, "plan_text": plan_text,
                        "think_log": think_log, "perf_summary": summary}
            callback("done", {"success": True, "answer": answer, "extra": cb_extra})

        return {
            "success": True,
            "plan_id": plan_id,
            "intent": "llm_agent",
            "message": answer,
            "chat_formatted": True,
            "iterations": len(all_results),
            "has_plan": plan_text is not None,
            "plan_text": plan_text,
            "think_log": think_log,
            "perf_summary": summary,
        }
def _get_library_info() -> str:
    """扫描 data/libraries/ 获取可用策划库概要"""
    import json
    from pathlib import Path
    lib_root = Path(__file__).resolve().parent.parent.parent.parent / "data" / "libraries"
    if not lib_root.is_dir():
        return ""
    lines = []
    for lib_dir in sorted(lib_root.iterdir()):
        if not lib_dir.is_dir():
            continue
        manifest = lib_dir / "library.json"
        if not manifest.exists():
            lines.append(f"- {lib_dir.name} (无描述)")
            continue
        try:
            with open(manifest, encoding="utf-8") as f:
                meta = json.load(f).get("metadata", {})
            desc = meta.get("description", "")[:80]
            version = meta.get("version", "?")
            lines.append(f"- {lib_dir.name} v{version}: {desc}")
        except (OSError, ValueError):
            # OSError: 文件读取失败；ValueError: JSON 解析失败
            lines.append(f"- {lib_dir.name}")
    return "\n".join(lines) if lines else ""
