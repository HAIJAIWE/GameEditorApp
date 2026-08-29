"""批量游戏数据生成 — 委托给 system.game_data._batch_create"""
from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class BatchDataSkill(BaseSkill):
    name = "system.batch_data"
    description = "批量生成游戏数据条目（一次创建多个角色/怪物/技能/装备等）"
    version = "1.1.0"
    parameters = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "data_type": {
                "type": "string",
                "description": "数据类型英文复数键: roles/monsters/skills/equips/items/talents/buffs/tasks/achievements/jobs/titles/stories/dialogs 等"
            },
            "count": {
                "type": "integer",
                "description": "批量创建数量，默认5，最大50",
                "minimum": 1,
                "maximum": 50
            },
            "prefix": {
                "type": "string",
                "description": "名称前缀(batch_data)"
            },
            "template": {
                "type": "string",
                "description": "模板JSON字符串(可选，不提供则自动生成)"
            },
            "strategy": {
                "type": "string",
                "enum": ["random", "increment", "template"],
                "description": "生成策略: random(随机)/increment(递增编号)/template(模板填充)"
            },
            "include_skills": {
                "type": "boolean",
                "description": "角色/怪物是否附带技能"
            },
            "level_range": {
                "type": "string",
                "description": "等级范围: min-max 如 '1-50'"
            }
        },
        "required": ["data_type"]
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        from core.agent.skills.game_data_skill import GameDataSkill

        mw = context.get("main_window")
        dm = context.get("data_manager")
        if not dm and mw:
            dm = getattr(mw, 'data_manager', None)
        if not dm:
            return {"success": False, "error": "无法访问数据管理器", "message": ""}

        gd = GameDataSkill()
        return gd._batch_create(dm, mw, params, get_logger())
