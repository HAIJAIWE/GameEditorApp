"""Agent OS: 子代理引擎 — 管理子智能体生成和任务执行"""

from __future__ import annotations

import json

from common.logger import get_logger

logger = get_logger()


class SubAgentEngine:
    """子智能体引擎 — 生成并执行子智能体任务"""

    def __init__(self, brain):
        self._brain = brain
        self._logger = get_logger()

    @property
    def _config(self):
        return self._brain._config

    @property
    def _dispatcher(self):
        return self._brain.dispatcher

    @property
    def _memory(self):
        return self._brain.memory

    @property
    def _agent_manager(self):
        return self._brain._agent_manager

    def spawn(self, task: str, context: dict, agent_type: str = "explorer") -> dict:
        """生成子智能体执行任务。通过 AgentManager 匹配预置智能体。"""
        agent_def = None
        if self._agent_manager:
            agent_def = self._agent_manager.match_agent(agent_type)

        if not agent_def:
            available = [a.id for a in self._agent_manager.list_agents()] if self._agent_manager else []
            return {
                "summary": f"找不到匹配智能体 '{agent_type}'",
                "results": [f"可用: {', '.join(available)}" if available else "请先配置团队"],
            }

        return self._spawn_managed(task, context, agent_def)

    def _spawn_managed(self, task: str, context: dict, agent_def) -> dict:
        """通过 AgentManager 管理的预置智能体执行任务"""
        max_rounds = 5

        tool_schemas = self._dispatcher.get_tools_json_schema()
        allowed_skill_names = set()

        # 团队模式下检查 member_tools 覆盖
        effective_tools = list(agent_def.tools)
        try:
            mgr = self._agent_manager
            if mgr and mgr.is_team_mode():
                team = mgr.get_current_team()
                if team and agent_def.id in team.member_tools:
                    effective_tools = list(team.member_tools[agent_def.id])
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        if effective_tools:
            allowed = set(effective_tools)
            tool_schemas = [
                s for s in tool_schemas
                if s["name"] in allowed or any(
                    keyword in s["name"] for keyword in allowed
                )
            ]
            for t in effective_tools:
                resolved = self._dispatcher.fuzzy_match(t) or t
                allowed_skill_names.add(resolved)

        system_prompt = (
            f"你是 {agent_def.icon} {agent_def.name}。\n"
            f"{agent_def.system_prompt[:3000]}\n\n"
            f"当前任务: {task}\n"
            f"最多{max_rounds}轮工具调用。完成后直接给出最终答案。"
        )

        # 如果当前团队有自定义提示词，替换默认提示词
        try:
            mgr = self._agent_manager
            if mgr and mgr.is_team_mode():
                team = mgr.get_current_team()
                if team and agent_def.id in team.custom_prompts:
                    custom = team.custom_prompts[agent_def.id]
                    system_prompt = custom[:3000] + f"\n\n当前任务: {task}\n最多{max_rounds}轮工具调用。完成后直接给出最终答案。"
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        # 动态注入 MCP 工具信息
        all_skills = self._dispatcher.list_skills()
        mcp_tools = [s for s in all_skills if s.get("source") == "mcp"]
        skill_tools = [s for s in all_skills if s.get("source") == "skill"
                       and s["name"] in allowed_skill_names]
        if mcp_tools:
            mcp_lines = "\n".join(f"  - {s['name']}: {s['description']}" for s in mcp_tools)
            system_prompt += f"\n\n## 额外可用的 MCP 外部工具\n{mcp_lines}\n(如有需要可直接调用)"
        if skill_tools:
            desc_lines = "\n".join(f"  - {s['name']}: {s['description']}" for s in skill_tools)
            system_prompt += f"\n\n## 你的工具详情\n{desc_lines}"

        maps = context.get("_maps", "")
        if maps:
            system_prompt = f"{maps}\n\n{system_prompt}"

        from common.ai_client import generate_text_with_tools
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task},
        ]

        results = []
        for i in range(max_rounds):
            self._logger.info(f"[ManagedAgent:{agent_def.id}] 第{i+1}轮")
            success, response = generate_text_with_tools(
                self._config, "", "", messages, tools=tool_schemas
            )
            if not success:
                break

            content = response.get("content", "")
            tool_calls = response.get("tool_calls") or []
            finish_reason = response.get("finish_reason", "stop")

            if finish_reason == "stop" and not tool_calls:
                if content.strip():
                    results.append(content.strip()[:500])
                break

            for tc in tool_calls:
                name = tc.get("name", "")
                resolved = self._dispatcher.fuzzy_match(name) or name
                if agent_def.tools and resolved not in allowed_skill_names:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "name": name,
                        "content": f"[权限拒绝] 工具 {name} 不在 {agent_def.name} 的可用工具列表中",
                    })
                    continue
                try:
                    args = json.loads(tc.get("arguments", "{}"))
                except json.JSONDecodeError as e:
                    self._logger.warning(f"[ManagedAgent] 工具参数JSON解析失败: {e}")
                    args = {}
                r = self._dispatcher.execute(name, args, context)
                msg = r.get("message", str(r)) if isinstance(r, dict) else str(r)
                results.append(msg[:300])
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", ""),
                    "name": name,
                    "content": msg[:500],
                })

        return {
            "results": results,
            "summary": "\n".join(results[-3:]) if results else "无数据",
            "agent_name": agent_def.name,
            "agent_id": agent_def.id,
        }

    def debate(self, subagent_data: dict, context: dict) -> dict:
        """多 Agent 辩论 — 让多个智能体从不同角度分析同一问题"""
        topic = subagent_data.get("task", subagent_data.get("query", ""))
        agents = subagent_data.get("agents", ["analyst", "designer", "explorer"])
        rounds = subagent_data.get("rounds", 2)

        self._logger.info(f"[Debate] 启动辩论: topic={topic[:60]}, agents={agents}, rounds={rounds}")

        all_opinions = {}
        for agent_type in agents:
            result = self.spawn(topic, context, agent_type)
            summary = result.get("summary", str(result.get("results", [""])[-1])[:300])
            all_opinions[agent_type] = summary

        # 辩论轮次：汇总意见后让每个 agent 反驳/补充
        debate_rounds = []
        for r in range(rounds):
            round_data = {}
            for agent_type in agents:
                others = [a for a in agents if a != agent_type]
                others_views = {a: all_opinions.get(a, "无意见")[:200] for a in others}
                critique_prompt = (
                    f"辩论主题: {topic}\n\n"
                    f"你的观点: {all_opinions.get(agent_type, '')[:300]}\n\n"
                    f"其他方观点:\n" + "\n".join(f"- {a}: {v}" for a, v in others_views.items()) + "\n\n"
                    "请审视其他观点，找出漏洞或补充你的分析。"
                )
                critique_result = self.spawn(critique_prompt, context, agent_type)
                critique = critique_result.get("summary", "")[:300]
                round_data[agent_type] = critique
                all_opinions[agent_type] = critique
            debate_rounds.append(round_data)

        # 最终汇总
        final_prompt = (
            f"辩论主题: {topic}\n\n"
            f"经过{rounds}轮辩论，各智能体的最终观点:\n" + "\n".join(
                f"- {a}: {v[:300]}" for a, v in all_opinions.items()
            ) + "\n\n请综合各方观点，给出一个平衡的最终结论。"
        )
        final_result = self.spawn(final_prompt, context, "designer")
        final_answer = final_result.get("summary", str(final_result.get("results", [""])[-1])[:500])

        return {
            "topic": topic,
            "rounds": debate_rounds,
            "opinions": all_opinions,
            "final_answer": final_answer,
        }
