"""委托技能 — 团队模式下 BOSS 委派任务给子智能体"""
from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()

_logger = get_logger()


class DelegateSkill(BaseSkill):
    name = "delegate_to_agent"
    description = "委派任务给团队中的专业智能体（仅团队模式可用）"
    version = "1.0.0"
    parameters = [
        {"name": "agent_id", "required": True, "description": "目标智能体ID，如 data_operator, schema_manager, planner, analyst, web_surfer, dev_coder, fixer"},
        {"name": "task", "required": True, "description": "委派的任务描述，应清晰说明目标和约束"},
    ]
    tags = ["team", "delegate", "agent"]

    def execute(self, params: dict, context: dict) -> dict:
        agent_id = params.get("agent_id", "")
        task = params.get("task", "")
        if not agent_id or not task:
            return {"success": False, "message": "缺少 agent_id 或 task 参数"}

        mw = context.get("main_window")
        if not mw or not getattr(mw, 'agent_brain', None):
            return {"success": False, "message": "无法访问 AgentBrain"}

        brain = mw.agent_brain
        agent_manager = getattr(brain, '_agent_manager', None)
        if not agent_manager:
            return {"success": False, "message": "无法访问 AgentManager"}

        agent_def = agent_manager.get_agent(agent_id)
        if not agent_def:
            available = [a.id for a in agent_manager.list_agents()]
            return {
                "success": False,
                "message": f"找不到智能体 '{agent_id}'。可用: {', '.join(available)}",
            }

        # 生成地图上下文供子智能体使用
        maps_text = ""
        try:
            maps_text = brain._generate_maps_text(mw)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        sub_context = {"_maps": maps_text, "main_window": mw}

        _logger.info(f"[Delegate] 委派给 {agent_def.name}({agent_id}): {task[:80]}")

        try:
            result = brain._subagent_engine._spawn_managed(task, sub_context, agent_def)
            summary = result.get("summary", "无结果")
            results_list = result.get("results", [])
            detail = "\n".join(f"  - {r}" for r in results_list[-5:])

            return {
                "success": True,
                "message": "\n".join([
                    f"【{agent_def.name}】执行完成",
                    f"结果摘要: {summary[:500]}",
                    f"详细步骤:\n{detail}",
                ]),
                "data": result,
            }
        except Exception as e:
            import traceback
            _logger.error(f"[Delegate] 委托执行异常: {e}")
            _logger.error(traceback.format_exc())
            return {"success": False, "message": f"委派 {agent_def.name} 执行失败: {e}"}
