"""Agent OS — AgentBrain：意图识别、计划执行、LLM 迭代、反思自愈与子智能体调度

方法按职责拆分到 brain_session / _plan / _llm / _prompt / _reflect / _subagent
六个 mixin（共享状态与签名见 brain_state.py）；AgentBrain 仍从本模块导出。
"""
from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any, Optional

from common.logger import get_logger
from core.agent.agents.collaboration import Blackboard
from core.agent.agents.subagent_engine import SubAgentEngine
from core.agent.brain_llm import BrainLLMMixin
from core.agent.brain_plan import BrainPlanMixin
from core.agent.brain_prompt import BrainPromptMixin
from core.agent.brain_reflect import BrainReflectionMixin
from core.agent.brain_session import BrainSessionMixin
from core.agent.brain_subagent import BrainSubagentMixin
from core.agent.dispatcher import ToolDispatcher
from core.agent.frontend_snapshot import FrontendSnapshot
from core.agent.intent import IntentParser, Planner
from core.agent.learner import Learner
from core.agent.memory import Memory
from core.agent.safety_guard import SafetyGuard
from core.agent.workspace import get_workspace


class AgentBrain(
    BrainSessionMixin,
    BrainPlanMixin,
    BrainLLMMixin,
    BrainPromptMixin,
    BrainReflectionMixin,
    BrainSubagentMixin,
):
    _MAX_MESSAGE_CHARS = 16000
    _DEFAULT_MAX_TOKENS = 8000
    _DEFAULT_MAX_ITERATIONS = 5
    _SUMMARY_KEEP_LAST = 3
    _KEEP_SYSTEM_FIRST = 3
    def __init__(self, data_dir: str = "", config: Optional[Any] = None,
                 main_window: Optional[object] = None,
                 agent_manager: Optional[Any] = None,
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


def _get_library_info() -> str:
    """扫描 data/libraries/ 获取可用策划库概要"""
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

