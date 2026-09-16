"""意图处理、计划执行与撤销 —— AgentBrain 的 BrainPlanMixin 部分

自 brain.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

from collections.abc import Callable
import json
import time
from typing import Any, Optional

from common.logger import get_logger
from core.agent.brain_state import BrainState

logger = get_logger()


class BrainPlanMixin(BrainState):
    """意图处理、计划执行与撤销"""

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
        results: dict[str, Any] = {}
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
            json.dumps({k: str(v)[:30] for k, v in params.items()}, ensure_ascii=False)
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
    def _reset_plan_state(self):
        self._failure_count = 0
    def _replan_step(self, tool_name: str, tool_params: dict, error: str,
                     messages: list, context: dict) -> str:
        return self._guard.replan_step(tool_name, tool_params, error, messages, context)
