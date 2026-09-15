"""策划书技能 — 对策划书的 AI 可调用操作（list / get / create / update / delete / export / import / AI填充 / AI审查）

内置 AgentRouter 按章节路由到对应子智能体；CeshuSkill 的方法按职责拆分到
ceshu_skill_data / _generate / _prompt / _review 四个 mixin
（共享状态与方法签名见 ceshu_skill_state.py）。
"""
from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.ceshu_agent_router import AgentRouter
from core.agent.skills.ceshu_skill_data import CeshuSkillDataMixin
from core.agent.skills.ceshu_skill_generate import CeshuSkillGenerateMixin
from core.agent.skills.ceshu_skill_prompt import CeshuSkillPromptMixin
from core.agent.skills.ceshu_skill_review import CeshuSkillReviewMixin
from core.agent.skills.ceshu_style_helpers import _get_style_glossary, _infer_style_module

__all__ = [
    "AgentRouter",
    "CeshuSkill",
    # 以下为历史导入路径的兼容再导出（测试与 UI 仍从本模块导入）
    "_get_style_glossary",
    "_infer_style_module",
]


class CeshuSkill(
    CeshuSkillDataMixin,
    CeshuSkillGenerateMixin,
    CeshuSkillPromptMixin,
    CeshuSkillReviewMixin,
    BaseSkill,
):
    """策划书核心技能 — 系统级技能 system.ceshu"""

    name = "system.ceshu"
    NAME = "system.ceshu"
    DESCRIPTION = (
        "策划书管理: list=列表, get=获取详情, create=创建, update=更新, delete=删除, "
        "export=导出, import=导入, ai_generate=AI一键生成完整策划书, "
        "ai_fill_field=AI填充字段, ai_fill_chapter=AI填充整章, ai_review_full=AI全文审查, "
        "ai_review=AI结构化审阅(5维度评分), ai_generate_full=AI生成策划书计划(N10)"
    )
    version = "1.0.0"
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: 访问 main_window / 策划书 UI 视图
    VERSION = "1.0.0"

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "list", "get", "create", "update", "delete",
                    "export", "import", "ai_fill_field", "ai_fill_chapter", "ai_review_full",
                    "ai_review", "ai_generate", "ai_generate_full", "ai_generate_data",
                ],
                "description": "操作类型"
            },
            "ceshu_id": {"type": "string", "description": "策划书 ID"},
            "library": {"type": "string", "description": "库名称"},
            "template": {"type": "string", "description": "模板名称（create 时使用）"},
            "meta": {"type": "object", "description": "元信息（create/update 时使用）"},
            "game_name": {"type": "string", "description": "游戏名称（ai_generate 时使用）"},
            "description": {"type": "string", "description": "游戏描述（ai_generate 时用于推断模板和指导生成）"},
            "chapter": {"type": "string", "description": "章节键名（ai_fill_chapter 时使用）"},
            "field_path": {"type": "string", "description": "字段路径（ai_fill_field 时使用）"},
            "field_label": {"type": "string", "description": "字段显示名"},
            "field_content": {"type": "string", "description": "当前字段内容"},
            "keyword": {"type": "string", "description": "搜索关键词（list 时使用）"},
            "output": {"type": "string", "description": "导出路径"},
            "format": {
                "type": "string",
                "enum": ["ceshu", "ceshu_chain", "md", "docx", "pdf"],
                "description": "导出格式（export 时使用）：ceshu=JSON单版本, ceshu_chain=JSON版本链, md=Markdown, docx=Word工业级GDD, pdf=PDF带书签大纲"
            },
            "style": {
                "type": "string",
                "description": "游戏风格 (ai_generate 时使用)：xianxia/sci-fi/realistic/wuxia/post_apoc/fantasy 等，影响生成内容的术语和风格"
            },
            "module_type": {
                "type": "string",
                "description": "模块类型 (ai_generate 时使用)：rpg/slg/moba/fps/strategy/casual 等，影响游戏系统组合推荐"
            },
            "data_types": {
                "type": "array",
                "items": {"type": "string"},
                "description": "数据类型键名列表（ai_generate_data 时使用）：role/skill/monster/item 等，可用单数或复数"
            },
            "count": {
                "type": "integer",
                "description": "每个数据类型生成的条目数（ai_generate_data 时使用，默认 5，上限 20）"
            },
            "instruction": {
                "type": "string",
                "description": "补充要求（ai_generate_data 时使用）"
            },
        },
        "required": ["action"]
    }

    def execute(self, params: dict, context: dict) -> dict:
        logger = get_logger()
        action = params.get("action", "")
        try:
            if action == "list":
                return self._list(params, context, logger)
            elif action == "get":
                return self._get(params, context, logger)
            elif action == "create":
                return self._create(params, context, logger)
            elif action == "update":
                return self._update(params, context, logger)
            elif action == "delete":
                return self._delete(params, context, logger)
            elif action == "export":
                return self._export(params, context, logger)
            elif action == "import":
                return self._import(params, context, logger)
            elif action == "ai_fill_field":
                return self._ai_fill_field(params, context, logger)
            elif action == "ai_fill_chapter":
                return self._ai_fill_chapter(params, context, logger)
            elif action == "ai_review_full":
                return self._ai_review_full(params, context, logger)
            elif action == "ai_review":
                return self._ai_review(params, context, logger)
            elif action == "ai_generate":
                return self._ai_generate(params, context, logger)
            elif action == "ai_generate_full":
                return self._ai_generate_full(params, context, logger)
            elif action == "ai_generate_data":
                return self._ai_generate_data(params, context, logger)
            else:
                return {"success": False, "error": f"未知动作: {action}", "message": ""}
        except Exception as e:
            logger.error(f"CeshuSkill 执行失败: {e}")
            return {"success": False, "error": str(e), "message": ""}
