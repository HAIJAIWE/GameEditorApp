"""Agent OS §11 — 安全 ACL：最小权限 + 危险操作确认"""
from collections.abc import Callable
from enum import IntEnum


class RiskLevel(IntEnum):
    READ_ONLY = 0
    DATA_WRITE = 1
    FILE_SYSTEM = 2
    NETWORK = 3
    SYSTEM = 4


# 默认允许的最大风险等级（可通过 set_max_allowed_risk 调整）
_max_allowed_risk: RiskLevel = RiskLevel.FILE_SYSTEM

# 被显式禁止的工具集合
_blocked_tools: set[str] = set()

# 被显式禁止的 (工具, 操作) 组合
_blocked_actions: set[tuple] = set()


def set_max_allowed_risk(level: RiskLevel):
    """设置全局允许的最大风险等级"""
    global _max_allowed_risk
    _max_allowed_risk = level


def block_tool(tool_name: str):
    """显式禁止某个工具"""
    _blocked_tools.add(tool_name)


def block_action(tool_name: str, action: str):
    """显式禁止某个工具的特定操作"""
    _blocked_actions.add((tool_name, action))


def unblock_tool(tool_name: str):
    """解除对某个工具的禁止"""
    _blocked_tools.discard(tool_name)


def unblock_action(tool_name: str, action: str):
    """解除对某个工具特定操作的禁止"""
    _blocked_actions.discard((tool_name, action))


TOOL_RISK_MAP = {
    "system.game_data": {"query": RiskLevel.READ_ONLY, "list": RiskLevel.READ_ONLY,
                          "search": RiskLevel.READ_ONLY, "summary": RiskLevel.READ_ONLY,
                          "create": RiskLevel.DATA_WRITE, "update": RiskLevel.DATA_WRITE,
                          "delete": RiskLevel.DATA_WRITE, "batch": RiskLevel.DATA_WRITE,
                          "import": RiskLevel.DATA_WRITE, "export": RiskLevel.DATA_WRITE},
    "system.game_data.update": RiskLevel.DATA_WRITE,
    "system.file_ops": {"read": RiskLevel.READ_ONLY, "write": RiskLevel.FILE_SYSTEM,
                         "delete": RiskLevel.FILE_SYSTEM, "edit": RiskLevel.FILE_SYSTEM,
                         "list": RiskLevel.READ_ONLY, "mkdir": RiskLevel.FILE_SYSTEM,
                         "copy": RiskLevel.FILE_SYSTEM, "move": RiskLevel.FILE_SYSTEM},
    "system.shell": RiskLevel.SYSTEM,
    "system.code": RiskLevel.SYSTEM,
    "system.web_search": RiskLevel.NETWORK,
    "system.web_fetch": RiskLevel.NETWORK,
    "system.browser": RiskLevel.NETWORK,
    "system.ceshu": RiskLevel.DATA_WRITE,
    "system.workflow": RiskLevel.DATA_WRITE,
    "system.vision": RiskLevel.NETWORK,
    "system.pdf_parse": RiskLevel.FILE_SYSTEM,
    "system.tts": RiskLevel.NETWORK,
    "system.speech_input": RiskLevel.NETWORK,
    "system.image_analyze": RiskLevel.NETWORK,
    "system.image_gen": RiskLevel.NETWORK,
    "system.visualization": RiskLevel.DATA_WRITE,
    "system.ui_preview": RiskLevel.DATA_WRITE,
    "system.export_doc": RiskLevel.DATA_WRITE,
    "system.git": RiskLevel.FILE_SYSTEM,
    "system.schema_edit": RiskLevel.DATA_WRITE,
    "system.game_balance": RiskLevel.DATA_WRITE,
    "system.scheduler": RiskLevel.SYSTEM,
    "system.todo": RiskLevel.DATA_WRITE,
    "system.ask_user": RiskLevel.READ_ONLY,
    "system.model": RiskLevel.DATA_WRITE,
    "system.batch_data": RiskLevel.DATA_WRITE,
}


def check_permission(tool_name: str, action: str = "") -> tuple:
    """检查工具操作权限

    Args:
        tool_name: 工具名称
        action: 操作名称

    Returns:
        (allowed: bool, risk_level: int, needs_confirmation: bool)
    """
    # 1. 检查显式禁止的工具
    if tool_name in _blocked_tools:
        return False, int(RiskLevel.SYSTEM), False

    # 2. 检查显式禁止的操作
    if action and (tool_name, action) in _blocked_actions:
        return False, int(RiskLevel.SYSTEM), False

    # 3. 获取风险等级
    rules = TOOL_RISK_MAP.get(tool_name, RiskLevel.DATA_WRITE)
    if isinstance(rules, dict):
        risk = rules.get(action, RiskLevel.DATA_WRITE)
    else:
        risk = rules

    # 4. 检查是否超过全局允许的最大风险等级
    if risk > _max_allowed_risk:
        return False, int(risk), False

    needs_confirmation = risk >= RiskLevel.SYSTEM
    return True, int(risk), needs_confirmation


def require_confirm(tool_name: str, params: dict, callback: Callable) -> bool:
    """对危险操作进行二次确认

    Args:
        tool_name: 工具名称
        params: 工具参数
        callback: 确认回调函数，签名为 (title, message) -> bool

    Returns:
        是否允许执行
    """
    allowed, risk, needs_confirm = check_permission(tool_name, params.get("action", ""))
    if not allowed:
        return False
    if not needs_confirm:
        return True

    return callback(
        "⚠️ 危险操作确认",
        f"工具: {tool_name}\n操作: {params.get('action', '?')}\n\n确认执行？"
    )
