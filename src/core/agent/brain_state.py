"""AgentBrain 各 mixin 的公共基类（声明共享状态、类常量与跨 mixin 方法签名）

AgentBrain 的方法拆分到 brain_session / _plan / _llm / _prompt / _reflect / _subagent
六个 mixin；mixin 通过本类声明的属性与签名访问实例状态与既有方法，实现仍由各
mixin / 主类提供（MRO 下真实实现优先）。本类不承载运行时代码。
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any, Optional


class BrainState:
    """AgentBrain 与各 mixin 的公共基类（仅声明属性与签名）"""

    # ── 类常量（真实值定义在 AgentBrain 上）──
    _MAX_MESSAGE_CHARS: int
    _DEFAULT_MAX_TOKENS: int
    _DEFAULT_MAX_ITERATIONS: int
    _SUMMARY_KEEP_LAST: int
    _KEEP_SYSTEM_FIRST: int

    # ── 实例状态 ──
    _logger: Any
    _max_tokens: int
    _max_iterations: int
    _config: Any
    _agent_manager: Any
    _frontend_snapshot: Any
    _workspace: Any
    memory: Any
    learner: Any
    dispatcher: Any
    intent_parser: Any
    planner: Any
    _guard: Any
    _blackboard: Any
    _subagent_engine: Any
    _plugin_system: Any
    _perf: Any
    _session_conv_count: int
    _session_tool_calls: int
    _success_count: int
    _failure_count: int
    _session_start: float
    _last_user_input: str
    _last_response: str
    _restored_context: Any
    _session_meta: Any
    _session_dir: Any
    _session_file: Any
    _undo_stack: list

    # ── 跨 mixin 方法签名声明（实现见对应 mixin / 主类）──
    # STUBS
    def reload_workspace(self):
        raise NotImplementedError
    def configure(self, max_tokens: int = None, max_iterations: int = None,
                  temperature: float = None, model: str = None):
        raise NotImplementedError
    def reload_config(self):
        raise NotImplementedError
    def health_check(self) -> dict:
        raise NotImplementedError
    def _call_ai(self, config, prompt="", system_prompt=None, messages_list=None):
        raise NotImplementedError
    def boot(self):
        raise NotImplementedError
    def set_agent_manager(self, agent_manager):
        raise NotImplementedError
    def process(self, user_input: str, callback: Optional[Callable] = None,
                extra: Optional[dict] = None, images: Optional[list] = None) -> dict:
        raise NotImplementedError
    def end_session(self):
        raise NotImplementedError
    def _reflect_on_failures(self):
        raise NotImplementedError
    @staticmethod
    def _categorize_failure_patterns(failures: list) -> dict:
        raise NotImplementedError
    @staticmethod
    def _get_pattern_suggestion(pattern: str, failures: list) -> str:
        raise NotImplementedError
    def _evaluate_last_turn(self, last_user_input: str = "", last_response: str = ""):
        raise NotImplementedError
    def _ai_available(self) -> bool:
        raise NotImplementedError
    def _build_context(self, extra: dict = None) -> dict:
        raise NotImplementedError
    def _try_restore_session(self):
        raise NotImplementedError
    def _save_session(self, messages: list):
        raise NotImplementedError
    def has_pending_session(self) -> bool:
        raise NotImplementedError
    def get_pending_session_info(self) -> dict:
        raise NotImplementedError
    def load_pending_session(self) -> Optional[list]:
        raise NotImplementedError
    def clear_session(self):
        raise NotImplementedError
    def _record_deploy_metric(self, metric_type: str, data: dict):
        raise NotImplementedError
    def _execute_plan(self, steps: list, context: dict, callback=None, max_replan: int = 3) -> dict:
        raise NotImplementedError
    def _execute_with_retry(self, tool_name: str, params: dict, context: dict,
                            max_retries: int = 1, retry_delay: float = 0.5,
                            backoff_factor: float = 2.0) -> dict:
        raise NotImplementedError
    def _warn_from_past_failures(self, tool_name: str, params: dict, context: dict) -> str:
        raise NotImplementedError
    def _record_operation(self, tool_name: str, params: dict, result: dict):
        raise NotImplementedError
    def undo_last(self, data_manager=None) -> dict:
        raise NotImplementedError
    def get_uptime(self) -> float:
        raise NotImplementedError
    def get_session_stats(self) -> dict:
        raise NotImplementedError
    def _extract_project_context(self) -> dict:
        raise NotImplementedError
    def _agent_loop(self, user_input: str, callback, context: dict, mode="auto",
                    images: Optional[list] = None) -> dict:
        raise NotImplementedError
    def _build_agent_messages(self, user_input: str, context: dict, plan_results: dict,
                              images: Optional[list], is_plan: bool) -> list:
        raise NotImplementedError
    def _run_llm_iterations(self, messages: list, context: dict, is_plan: bool,
                            callback, plan_id: str, plan_text: Optional[str]) -> dict:
        raise NotImplementedError
    def _call_llm_stream(self, messages: list, callback, tool_schemas: list = None) -> tuple:
        raise NotImplementedError
    def _retry_llm_call(self, messages: list, use_stream: bool, callback, tool_schemas: list = None) -> tuple:
        raise NotImplementedError
    def _is_tool_allowed(self, tool_name: str) -> bool:
        raise NotImplementedError
    def _get_role_additions(self) -> str:
        raise NotImplementedError
    def _check_dangerous(self, tn: str, tp: dict, context: dict, messages: list,
                         all_results: dict, iteration: int) -> bool:
        raise NotImplementedError
    def _replan_step(self, tool_name: str, tool_params: dict, error: str,
                     messages: list, context: dict) -> str:
        raise NotImplementedError
    def _get_tool_alternatives(self, tool_name: str) -> list:
        raise NotImplementedError
    def _reset_plan_state(self):
        raise NotImplementedError
    def _execute_and_reflect(self, tool_requests, context, messages, all_results, iteration, callback):
        raise NotImplementedError
    @staticmethod
    def _estimate_tokens(text: str) -> int:
        raise NotImplementedError
    def _trim_messages(self, messages: list):
        raise NotImplementedError
    def _handle_subagent_call(self, subagent_data: dict, context, all_results, iteration) -> str:
        raise NotImplementedError
    @staticmethod
    def _format_subagent_result(result) -> str:
        raise NotImplementedError
    def _sliding_window_compress(self, messages: list, max_messages: int = 12) -> list:
        raise NotImplementedError
    def _get_project_context(self, context: dict) -> str:
        raise NotImplementedError
    def _build_managed_agents_desc(self) -> str:
        raise NotImplementedError
    def _build_project_context_block(self, context) -> str:
        raise NotImplementedError
    def _build_library_context_block(self, context) -> str:
        raise NotImplementedError
    def _build_plan_context_block(self, context) -> str:
        raise NotImplementedError
    def _build_learnings_block(self) -> str:
        raise NotImplementedError
    def _build_execution_system_prompt(self, plan_ctx: str, learn_ctx: str, library_ctx: str, base_proj: str, base: str) -> str:
        raise NotImplementedError
    def _build_system_prompt(self, is_plan: bool, context: dict = None) -> str:
        raise NotImplementedError
    def _keyword_engine(self, user_input: str, callback, context: dict) -> dict:
        raise NotImplementedError
    def _parse_with_think(self, raw: str) -> tuple:
        raise NotImplementedError
    def _spawn_subagent(self, task: str, context: dict, agent_type: str = "explorer") -> dict:
        raise NotImplementedError
    def _spawn_managed_subagent(self, task: str, context: dict, agent_def) -> dict:
        raise NotImplementedError
    def _multi_agent_debate(self, subagent_data: dict, context: dict) -> dict:
        raise NotImplementedError
    def _get_intent_hint(self, user_input: str, cached_intent=None) -> str:
        raise NotImplementedError
    def _identity_prompt(self) -> str:
        raise NotImplementedError
    def _fallback_answer(self, all_results: dict) -> str:
        raise NotImplementedError
    def _final_result(self, plan_id: str, answer: str, plan_text,
                      all_results: dict, think_log: list, callback) -> dict:
        raise NotImplementedError
