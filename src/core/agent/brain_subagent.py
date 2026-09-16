"""子智能体调度、辩论与结果收尾 —— AgentBrain 的 BrainSubagentMixin 部分

自 brain.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

from common.logger import get_logger
from core.agent.brain_state import BrainState

logger = get_logger()


class BrainSubagentMixin(BrainState):
    """子智能体调度、辩论与结果收尾"""

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
    def _multi_agent_debate(self, subagent_data: dict, context: dict) -> dict:
        return self._subagent_engine.debate(subagent_data, context)
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
