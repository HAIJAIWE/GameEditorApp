from core.agent.brain import AgentBrain
from core.agent.diagnostics.error_handler import (
    ErrorResult,
    ErrorType,
    RepairLogger,
    retry_on_error,
    self_healing_execute,
)
from core.agent.dispatcher import ToolDispatcher
from core.agent.models import ExecutionContext, Intent, MemoryEntry, SkillResult
from core.agent.skill_protocol import BaseSkill
from core.agent.workspace import WorkspaceManager, get_workspace

_dispatcher = ToolDispatcher()
_dispatcher.discover_skills()

def execute_tool(name: str, params: dict, main_window=None) -> str:
    """兼容 wrapper — 通过 dispatcher 执行工具"""
    dm = getattr(main_window, 'data_manager', None) if main_window else None
    result = _dispatcher.execute(name, params, {"main_window": main_window, "data_manager": dm})
    if isinstance(result, dict):
        return result.get("message", str(result))
    return str(result)

__all__ = [
    "AgentBrain",
    "BaseSkill",
    "ToolDispatcher",
    "Intent",
    "SkillResult",
    "MemoryEntry",
    "ExecutionContext",
    "ErrorResult",
    "ErrorType",
    "RepairLogger",
    "retry_on_error",
    "self_healing_execute",
    "execute_tool",
    "WorkspaceManager",
    "get_workspace",
]
