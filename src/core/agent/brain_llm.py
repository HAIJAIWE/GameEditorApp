"""LLM 迭代循环、工具调用与上下文压缩 —— AgentBrain 的 BrainLLMMixin 部分

自 brain.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import time
from typing import Any, Optional
import uuid

from common.logger import get_logger
from core.agent.brain_state import BrainState
from core.agent.safety_guard import SafetyGuard

logger = get_logger()


class BrainLLMMixin(BrainState):
    """LLM 迭代循环、工具调用与上下文压缩"""

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
        all_results: dict[str, Any] = {}
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
    def _get_role_additions(self) -> str:
        """获取当前角色附加提示词"""
        if not self._agent_manager:
            return ""
        if self._agent_manager.is_team_mode():
            return self._agent_manager.get_boss_prompt()
        return ""
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
    def _get_tool_alternatives(self, tool_name: str) -> list:
        return SafetyGuard._get_tool_alternatives(tool_name)
    def _execute_and_reflect(self, tool_requests, context, messages, all_results, iteration, callback):
        if callback:
            callback("step_start", {"order": iteration, "tool": f"并行{len(tool_requests)}工具"})

        for _tid, tn, tp in tool_requests:
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
    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return SafetyGuard._estimate_tokens(text)
    def _trim_messages(self, messages: list):
        return self._guard.trim_messages(messages)
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
