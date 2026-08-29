"""Agent OS §2 — AgentManager：智能体团队管理"""
from __future__ import annotations

from dataclasses import dataclass, field
import os

from common.logger import get_logger

logger = get_logger()

# ---------------------------------------------------------------------------
# 数据定义
# ---------------------------------------------------------------------------

@dataclass
class AgentDefinition:
    """智能体定义 — 用于团队模式的成员配置"""
    id: str
    name: str
    description: str = ""
    icon: str = ""
    system_prompt: str = ""
    tools: list[str] = field(default_factory=list)
    allow_delegate: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> AgentDefinition:
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            description=d.get("description", ""),
            icon=d.get("icon", "🤖"),
            system_prompt=d.get("system_prompt", ""),
            tools=d.get("tools", []),
            allow_delegate=d.get("allow_delegate", False),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "system_prompt": self.system_prompt,
            "tools": list(self.tools),
            "allow_delegate": self.allow_delegate,
        }


@dataclass
class Team:
    """智能体团队 — 一组智能体的集合"""
    id: str
    name: str
    description: str = ""
    members: list[AgentDefinition] = field(default_factory=list)
    custom_prompts: dict[str, str] = field(default_factory=dict)  # agent_id → 自定义提示词
    member_tools: dict[str, list[str]] = field(default_factory=dict)  # agent_id → 团队内可用工具列表

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "members": [m.to_dict() for m in self.members],
            "custom_prompts": self.custom_prompts,
            "member_tools": self.member_tools,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Team:
        return cls(
            id=d["id"],
            name=d["name"],
            description=d.get("description", ""),
            members=[AgentDefinition.from_dict(m) for m in d.get("members", [])],
            custom_prompts=d.get("custom_prompts", {}),
            member_tools=d.get("member_tools", {}),
        )


@dataclass
class TaskTicket:
    """任务交接票据 — 智能体之间的工作单元"""
    ticket_id: str
    assignee: str
    instruction: str
    context: dict = field(default_factory=dict)
    status: str = "pending"  # pending | running | done | failed
    result: dict = field(default_factory=dict)

# ---------------------------------------------------------------------------
# 预置智能体模板
# ---------------------------------------------------------------------------

from core.agent.prompts import STEWARD_BASE_PROMPT, TEAM_AGENTS

_TOOL_OWNER_MAP: dict[str, str] = {}


def _build_default_agents():
    """从统一提示词池构建 DEFAULT_AGENTS"""
    global DEFAULT_AGENTS
    agents = []
    for data in TEAM_AGENTS:
        agents.append(AgentDefinition.from_dict(data))
    # 管家
    agents.append(AgentDefinition(
        id="boss", name="任务管家", icon="🔔",
        description="任务拆解和调度协调",
        system_prompt=STEWARD_BASE_PROMPT,
        tools=[],
        allow_delegate=True,
    ))
    DEFAULT_AGENTS = agents


def _add_default_agents():
    """注册默认预置智能体到 _TOOL_OWNER_MAP"""
    for a in DEFAULT_AGENTS:
        for t in a.tools:
            _TOOL_OWNER_MAP[t] = a.id


DEFAULT_AGENTS: list = []
_build_default_agents()
_add_default_agents()


# AgentManager
# ---------------------------------------------------------------------------


class AgentManager:
    """智能体团队管理器 — 单例，管理预置和自定义智能体和团队"""

    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, data_dir: str = ""):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self._data_dir = data_dir or "data/agents"

        # 预置智能体索引（id → AgentDefinition）
        self._defaults: dict[str, AgentDefinition] = {
            a.id: a for a in DEFAULT_AGENTS
        }

        # 当前注册的所有智能体（预置 + 用户自定义）
        self._agents: dict[str, AgentDefinition] = dict(self._defaults)

        # 自定义团队
        self._teams: dict[str, Team] = {}
        self._current_team_id: str | None = None

        self._logger = logger

        # 加载持久化的自定义团队
        self._load_teams()

    # ------------------------------------------------------------------
    # 智能体查询
    # ------------------------------------------------------------------

    def list_agents(self) -> list[AgentDefinition]:
        return list(self._agents.values())

    def list_default_agents(self) -> list[AgentDefinition]:
        return list(self._defaults.values())

    def get_agent(self, agent_id: str) -> AgentDefinition | None:
        return self._agents.get(agent_id)

    def match_agent(self, name_id_or_alias: str) -> AgentDefinition | None:
        """按 ID、名称、关键词匹配智能体"""
        if not name_id_or_alias:
            return None
        name_lower = name_id_or_alias.lower()
        # 精确 ID
        if name_id_or_alias in self._agents:
            return self._agents[name_id_or_alias]
        # 精确名称
        for a in self._agents.values():
            if a.name == name_id_or_alias:
                return a
        # 模糊匹配
        for a in self._agents.values():
            if name_lower in a.id.lower() or name_lower in a.name.lower():
                return a
        # 描述包含
        for a in self._agents.values():
            if name_lower in a.description.lower():
                return a
        return None

    # ------------------------------------------------------------------
    # 自定义智能体
    # ------------------------------------------------------------------

    def register_agent(self, agent: AgentDefinition) -> bool:
        """注册自定义智能体（覆盖预置同名）"""
        self._agents[agent.id] = agent
        for t in agent.tools:
            _TOOL_OWNER_MAP[t] = agent.id
        return True

    def unregister_agent(self, agent_id: str) -> bool:
        if agent_id in self._defaults:
            self._logger.warning(f"不能卸载预置智能体: {agent_id}")
            return False
        self._agents.pop(agent_id, None)
        # 清理 tool map
        for t, owner in list(_TOOL_OWNER_MAP.items()):
            if owner == agent_id:
                _TOOL_OWNER_MAP.pop(t, None)
        return True

    # ------------------------------------------------------------------
    # 团队管理
    # ------------------------------------------------------------------

    def list_teams(self) -> list[Team]:
        return list(self._teams.values())

    def get_team(self, team_id: str) -> Team | None:
        return self._teams.get(team_id)

    def create_team(self, team: Team) -> bool:
        if team.id in self._teams:
            return False
        self._teams[team.id] = team
        self._save_teams()
        return True

    def update_team(self, team: Team) -> bool:
        if team.id not in self._teams:
            return False
        self._teams[team.id] = team
        self._save_teams()
        return True

    def delete_team(self, team_id: str) -> bool:
        if team_id not in self._teams:
            return False
        del self._teams[team_id]
        if self._current_team_id == team_id:
            self._current_team_id = None
        self._save_teams()
        return True

    def set_current_team(self, team_id: str | None):
        self._current_team_id = team_id

    def set_active_agent(self, agent_id: str) -> bool:
        """设置当前活跃的智能体 ID（用于 boss 模式下标记当前执行者）"""
        if agent_id in self._agents:
            self._active_agent_id = agent_id
            return True
        self._logger.warning(f"未知智能体: {agent_id}")
        return False

    def get_active_agent(self) -> str | None:
        """获取当前活跃的智能体 ID"""
        return getattr(self, "_active_agent_id", None)

    def get_current_team(self) -> Team | None:
        if self._current_team_id:
            return self._teams.get(self._current_team_id)
        return None

    # ------------------------------------------------------------------
    # 模式判断
    # ------------------------------------------------------------------

    def is_team_mode(self) -> bool:
        """当前是否处于团队模式"""
        return self._current_team_id is not None

    def get_boss_prompt(self) -> str:
        """生成 BOSS 动态提示词（包含当前团队的成员列表）"""
        team = self.get_current_team()
        if not team or not team.members:
            return STEWARD_BASE_PROMPT + "(无可用成员)"

        prompt = STEWARD_BASE_PROMPT
        for m in team.members:
            tools_str = ", ".join(m.tools[:5]) if m.tools else "对话"
            prompt += f"- {m.icon} {m.name}（{m.description}）: {tools_str}\n"

        prompt += (
            "\n你可以使用 `delegate_to_agent` 工具将子任务委派给特定成员。"
            "\n使用方法：delegate_to_agent(agent_id, instruction, context)"
        )
        return prompt

    # ------------------------------------------------------------------
    # 工具归属查询
    # ------------------------------------------------------------------

    def get_tools_for_agent(self, agent_id: str) -> list[str]:
        agent = self._agents.get(agent_id)
        if agent:
            return list(agent.tools)
        return []

    def get_agent_for_tool(self, tool_name: str) -> str | None:
        """返回拥有该工具的智能体 ID。用于局部匹配"""
        for agent in self._agents.values():
            for t in agent.tools:
                if t in tool_name or tool_name in t:
                    return agent.id
        return None

    # ------------------------------------------------------------------
    # 持久化
    # ------------------------------------------------------------------

    def _teams_path(self) -> str:
        return os.path.join(self._data_dir, "teams.json")

    def _save_teams(self):
        try:
            os.makedirs(self._data_dir, exist_ok=True)
            data = {
                "teams": [t.to_dict() for t in self._teams.values()],
                "current_team_id": self._current_team_id,
            }
            import json
            with open(self._teams_path(), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            self._logger.error(f"保存团队失败: {e}")

    def _load_teams(self):
        path = self._teams_path()
        if not os.path.exists(path):
            return
        try:
            import json
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            self._teams = {t["id"]: Team.from_dict(t) for t in data.get("teams", [])}
            self._current_team_id = data.get("current_team_id")
        except Exception as e:
            self._logger.warning(f"加载团队失败: {e}")
