"""编辑器布局技能 — AI 可直接增删改类型的编辑器分区/排版/控件配置"""
from __future__ import annotations

import json

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()
from core.agent.skills.common import normalize_params
from core.editor_layout import EditorLayout


class EditorLayoutSkill(BaseSkill):
    name = "system.editor_layout"
    description = "编辑器排版：查看/修改/新建各数据类型的编辑器分区布局"
    version = "1.0.0"
    parameters = []
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: 调用 mw.reload_type_schema 等 UI 方法

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "list_types", "get_layout", "set_layout", "add_section",
                    "remove_section", "add_field_to_section", "remove_field_from_section",
                    "auto_create", "remove_layout", "set_stat_hints"
                ],
                "description": "操作类型"
            },
            "data_type": {
                "type": "string",
                "description": "数据类型名称: role/monster/skill/equip/item/weapon/等"
            },
            "groups": {
                "type": "string",
                "description": "JSON 字符串: 完整的分区配置列表。每项: {title, icon, collapsed, fields, layout?, type?}"
            },
            "section": {
                "type": "string",
                "description": "JSON 字符串: 单个分区配置 {title, icon, collapsed, fields, layout?, type?}"
            },
            "section_title": {
                "type": "string",
                "description": "分区标题 (用于删除分区或添加字段到分区)"
            },
            "field_name": {
                "type": "string",
                "description": "字段名 (用于添加/移除字段到分区)"
            },
            "hints": {
                "type": "string",
                "description": "JSON 字符串: 属性参考范围 {分类名: {属性名: [最小值, 最大值]}}"
            }
        },
        "required": ["action", "data_type"]
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "get_layout")
        data_type = params.get("data_type", "")
        section_title = params.get("section_title", "")
        field_name = params.get("field_name", "")

        if not data_type and action not in ("list_types",):
            return {"success": False, "error": "缺少 data_type 参数", "message": ""}

        try:
            if action == "list_types":
                types = EditorLayout.list_types()
                return {"success": True, "message": "", "data": {
                    "types": types,
                    "count": len(types),
                }}

            elif action == "get_layout":
                groups = EditorLayout.get_groups(data_type)
                return {"success": True, "message": "", "data": {
                    "data_type": data_type,
                    "groups": groups,
                    "has_layout": len(groups) > 0,
                }}

            elif action == "set_layout":
                groups_str = params.get("groups", "[]")
                groups = self._parse_json(groups_str, [])
                if not isinstance(groups, list):
                    return {"success": False, "error": "groups 必须是 JSON 数组", "message": ""}
                EditorLayout.set_layout(data_type, groups)
                self._hot_reload(context)
                return {"success": True, "message": f"[OK] 已设置 {data_type} 的编辑器布局 ({len(groups)} 个分区)", "data": {"data_type": data_type, "section_count": len(groups)}}

            elif action == "add_section":
                section_str = params.get("section", "{}")
                section = self._parse_json(section_str, {})
                if not isinstance(section, dict) or "title" not in section:
                    return {"success": False, "error": "section 必须包含 title", "message": ""}
                EditorLayout.add_section(data_type, section)
                self._hot_reload(context)
                return {"success": True, "message": f"[OK] 已给 {data_type} 添加分区「{section.get('title')}」", "data": {"data_type": data_type, "section_title": section.get("title")}}

            elif action == "remove_section":
                if not section_title:
                    return {"success": False, "error": "缺少 section_title", "message": ""}
                ok = EditorLayout.remove_section(data_type, section_title)
                if ok:
                    self._hot_reload(context)
                    return {"success": True, "message": f"[OK] 已删除 {data_type} 的分区「{section_title}」", "data": {}}
                return {"success": False, "error": f"未找到分区: {section_title}", "message": ""}

            elif action == "add_field_to_section":
                if not section_title or not field_name:
                    return {"success": False, "error": "缺少 section_title 和 field_name", "message": ""}
                ok = EditorLayout.add_field_to_section(data_type, section_title, field_name)
                if ok:
                    self._hot_reload(context)
                    return {"success": True, "message": f"[OK] 已把 {field_name} 添加到 {data_type} 的分区「{section_title}」", "data": {}}
                return {"success": False, "error": f"未找到分区: {section_title}", "message": ""}

            elif action == "remove_field_from_section":
                if not section_title or not field_name:
                    return {"success": False, "error": "缺少 section_title 和 field_name", "message": ""}
                EditorLayout.remove_field_from_section(data_type, section_title, field_name)
                self._hot_reload(context)
                return {"success": True, "message": f"[OK] 已从 {data_type} 的分区「{section_title}」移除 {field_name}", "data": {}}

            elif action == "auto_create":
                return self._auto_create_layout(data_type, context, logger)

            elif action == "remove_layout":
                EditorLayout.remove_layout(data_type)
                self._hot_reload(context)
                return {"success": True, "message": f"[OK] 已删除 {data_type} 的编辑器布局配置", "data": {}}

            elif action == "set_stat_hints":
                hints_str = params.get("hints", "{}")
                hints = self._parse_json(hints_str, {})
                EditorLayout.set_stat_hints(data_type, hints)
                return {"success": True, "message": f"[OK] 已设置 {data_type} 的属性参考范围", "data": {}}

            else:
                return {"success": False, "error": f"未知操作: {action}", "message": ""}

        except Exception as e:
            logger.error(f"EditorLayout 失败: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def _auto_create_layout(self, data_type: str, context: dict, logger) -> dict:
        """从现有字段列表自动生成简单布局"""
        try:
            from config.settings import get_config
            config = get_config()
            all_fields = config.get_fields_config().get(data_type, [])
        except Exception:
            all_fields = []

        groups = EditorLayout.create_from_fields(data_type, all_fields)
        self._hot_reload(context)

        if groups:
            return {"success": True, "message": f"[OK] 已为 {data_type} 自动生成布局，共 {len(groups)} 个分区", "data": {"data_type": data_type, "groups": groups}}
        return {"success": False, "error": f"{data_type} 没有字段，无法自动生成布局", "message": ""}

    def _hot_reload(self, context: dict):
        mw = context.get("main_window")
        if mw and hasattr(mw, "reload_type_schema"):
            try:
                mw.reload_type_schema()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def _parse_json(self, text: str, default):
        if isinstance(text, (dict, list)):
            return text
        if not text or not isinstance(text, str):
            return default
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return default
