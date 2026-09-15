"""策划书技能 — 对策划书的 AI 可调用操作（list / get / create / update / delete / export / import / AI填充 / AI审查）

内置 AgentRouter 按章节路由到对应子智能体。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill


class AgentRouter:
    """智能体路由器 — 按章节映射到对应子智能体（v5.0: 18 章完整路由）"""

    CHAPTER_AGENT_MAP = {
        # 基础 9 章
        "meta":      "通用策划助手",
        "vision":    "通用策划助手",
        "worldview": "content_writer",
        "gameplay":  "通用策划助手",
        "systems":   "game_designer",
        "numeric":   "data_analyst",
        "art":       "通用策划助手",
        "tech":      "code_assistant",
        "resources": "通用策划助手",
        # v5.0 工业级补充 9 章
        "market_analysis":  "data_analyst",
        "characters":       "content_writer",
        "combat":           "game_designer",
        "economy":          "data_analyst",
        "monetization":     "通用策划助手",
        "mvp":              "code_assistant",
        "risk_handling":    "通用策划助手",
        "audio":            "通用策划助手",
        "accessibility":    "通用策划助手",
    }

    AGENT_DISPLAY = {
        "game_designer":    "策划专家",
        "content_writer":   "文案写手",
        "data_analyst":     "数据分析师",
        "code_assistant":   "代码助手",
        "通用策划助手":      "通用策划助手",
    }

    @classmethod
    def route(cls, chapter: str) -> str:
        """按章节获取智能体 ID"""
        return cls.CHAPTER_AGENT_MAP.get(chapter, "通用策划助手")

    @classmethod
    def get_display_name(cls, agent_id: str) -> str:
        """获取智能体展示名"""
        return cls.AGENT_DISPLAY.get(agent_id, agent_id)

    @classmethod
    def get_agent_prompt(cls, chapter: str) -> str:
        """按章节生成智能体提示语（v5.0: 覆盖全部 18 章）"""
        prompts = {
            # 基础 9 章
            "meta":      "请根据当前项目元信息，补充游戏名称和类型建议。",
            "vision":    "请分析市场定位和竞品，给出差异化建议。",
            "worldview": "请为世界观设定提出创意构思或优化现有设定。",
            "gameplay":  "请分析核心玩法设计，提出改进建议。",
            "systems":   "请设计或审查游戏系统规则和参数。",
            "numeric":   "请分析数值框架，提供平衡性建议。",
            "art":       "请提供美术风格方向和配色方案建议。",
            "tech":      "请提供技术选型、架构方案和开发计划建议。",
            "resources": "请协助规划资源清单和风险评估。",
            # v5.0 工业级补充 9 章
            "market_analysis":  "请分析目标市场、竞品和用户画像，提供市场定位建议。",
            "characters":       "请设计主角、NPC、反派和 Boss 角色，包含背景与成长弧线。",
            "combat":           "请设计战斗机制、技能系统、伤害公式和平衡策略。",
            "economy":          "请设计货币体系、产出回收机制和通胀控制策略。",
            "monetization":     "请设计付费模式、定价档位和运营策略，平衡免费与付费体验。",
            "mvp":              "请规划 MVP 范围、里程碑和验收标准，确保核心玩法可验证。",
            "risk_handling":    "请识别技术/市场/团队/进度风险，制定应对和监控策略。",
            "audio":            "请设计音乐风格、音效清单和音频技术规格。",
            "accessibility":    "请规划多语言支持、无障碍特性和分级认证。",
        }
        return prompts.get(chapter, "请协助完善当前章节内容。")


class CeshuSkill(BaseSkill):
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

    # --- 辅助方法 ---

    @staticmethod
    def _resolve_library(context: dict, params: dict) -> str:
        """从上下文或参数中解析当前库名"""
        lib = params.get("library", "")
        if not lib:
            mw = context.get("main_window")
            if mw and hasattr(mw, "active_library_name"):
                lib = mw.active_library_name
        if not lib:
            ws = context.get("workspace_root", "")
            if ws:
                lib = Path(ws).name
        return lib or "默认库"

    def _get_manager(self, context: dict) -> Any:
        """获取 CeshuManager 实例"""
        from core.ceshu import CeshuManager
        mw = context.get("main_window")
        lib_root: Any = ""
        if mw and hasattr(mw, "data_manager"):
            dm = mw.data_manager
            if dm and hasattr(dm, "_root"):
                lib_root = dm._root
        if not lib_root:
            lib_root = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "libraries"
        return CeshuManager(lib_root)

    # --- CRUD ---

    def _list(self, params: dict, context: dict, logger) -> dict:
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        keyword = params.get("keyword", "")
        ceshus = mgr.list_ceshu(library, keyword)
        lines = [f"策划书列表（{len(ceshus)} 本）:"]
        for c in ceshus:
            lines.append(f"- [{c['game_type']}] {c['name']} (id={c['ceshu_id']}) {c['status']}")
        return {"success": True, "message": "\n".join(lines), "data": {"ceshus": ceshus}}

    def _get(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        try:
            model = mgr.get_ceshu(ceshu_id, library)
            return {"success": True, "message": f"策划书: {model.meta.get('game_name', '未命名')}", "data": model.to_dict()}
        except FileNotFoundError:
            return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}

    def _create(self, params: dict, context: dict, logger) -> dict:
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        template = params.get("template", "")
        meta = params.get("meta")
        model = mgr.create_ceshu(library, template, meta)
        return {"success": True, "message": f"策划书已创建: {model.meta.get('game_name', '未命名')}", "data": model.to_dict()}

    def _update(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        try:
            model = mgr.get_ceshu(ceshu_id, library)
            if "meta" in params:
                model.meta.update(params["meta"])
            if "chapter" in params and "chapter_data" in params:
                model.set_chapter(params["chapter"], params["chapter_data"])
            mgr.save_ceshu(model, library)
            return {"success": True, "message": "策划书已更新", "data": model.to_dict()}
        except FileNotFoundError:
            return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}

    def _delete(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        ok = mgr.delete_ceshu(ceshu_id, library)
        if ok:
            return {"success": True, "message": f"策划书 {ceshu_id} 已删除"}
        return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}

    def _export(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        output = params.get("output", "")
        fmt = params.get("format", "ceshu")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        if fmt == "docx":
            path = mgr.export_ceshu_docx(ceshu_id, library, output, include_validation_report=True)
        elif fmt == "pdf":
            path = mgr.export_ceshu_pdf(ceshu_id, library, output, include_validation_report=True)
        elif fmt == "md":
            path = mgr.export_ceshu_markdown(ceshu_id, library, output)
        elif fmt == "ceshu_chain":
            path = mgr.export_ceshu(ceshu_id, library, output, include_version_chain=True)
        else:  # "ceshu" 默认
            path = mgr.export_ceshu(ceshu_id, library, output, include_version_chain=False)
        return {"success": True, "message": f"已导出到 {path}"}

    def _import(self, params: dict, context: dict, logger) -> dict:
        filepath = params.get("filepath", "")
        if not filepath:
            return {"success": False, "error": "缺少 filepath", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        model = mgr.import_ceshu(filepath, library)
        return {"success": True, "message": f"策划书已导入: {model.meta.get('game_name', '未命名')}", "data": model.to_dict()}

    # --- AI 操作 ---

    def _call_llm(self, prompt: str, system_prompt: str, logger) -> tuple:
        """调用 LLM 生成内容

        Returns:
            (success, content_or_error): 成功时 content 为生成的文本，
            失败时 content 为错误原因
        """
        try:
            from common.ai_client import generate_text
            from config.settings import get_config
            config = get_config()
            if not config.enabled:
                logger.warning("[CeshuAI] AI 未启用")
                return (False, "AI 未连接 API，请在设置中配置 AI 接口（API Key、Base URL、模型名称）后再使用此功能。")
            if not getattr(config, 'api_key', ''):
                return (False, "AI 未连接 API，请在设置中填写 API Key 后再使用此功能。")
            success, result = generate_text(config, prompt, system_prompt)
            if success:
                return (True, result.strip())
            else:
                # 常见错误：额度不足、key 无效、网络超时
                err_lower = str(result).lower()
                if "quota" in err_lower or "额度" in str(result) or "insufficient" in err_lower:
                    return (False, "AI 调用失败：API 额度不足，请充值或更换 API Key 后重试。")
                elif "unauthorized" in err_lower or "invalid" in err_lower or "key" in err_lower:
                    return (False, "AI 调用失败：API Key 无效或已过期，请检查设置。")
                elif "timeout" in err_lower or "timed out" in err_lower:
                    return (False, "AI 调用失败：请求超时，请检查网络连接后重试。")
                else:
                    logger.warning(f"[CeshuAI] LLM 调用失败: {str(result)[:200]}")
                    return (False, f"AI 调用失败：{str(result)[:100]}")
        except Exception as e:
            logger.warning(f"[CeshuAI] LLM 调用异常: {e}")
            return (False, f"AI 调用异常：{e}")

    def _ai_generate_data(self, params: dict, context: dict, logger) -> dict:
        """AI 生成候选游戏数据 — 依据策划书数值/系统章生成初始数据（人工审批后导入）

        数据共同开发工作流的后端：把策划书 numeric/systems 章作为设定上下文，
        为指定数据类型生成候选条目 JSON，由 UI 预览勾选后人工写入 DataManager。

        入参:
            data_types: 数据类型键名列表（单数或复数均可）
            count: 每类条数（默认 5，1-20）
            instruction: 补充要求

        返回:
            {"success": True, "data": {"candidates": {复数键: [items]}, "generated_counts": {...}}}
        """
        from config.constants import _type_registry

        reg = _type_registry
        raw_types: list = params.get("data_types") or []
        selected: list[tuple[str, str, str]] = []  # (singular, name, plural)
        plurals_set = set(reg.plurals.values())
        for raw in raw_types:
            key = str(raw).strip().lower()
            if not key:
                continue
            if key in plurals_set:
                singular = next((s for s, p in reg.plurals.items() if p == key), key)
            else:
                singular = key
            plural = reg.get_plural(singular)
            name = reg.get_name(singular)
            if (singular, name, plural) in selected:
                continue
            selected.append((singular, name, plural))

        if not selected:
            return {
                "success": False,
                "error": "未选择任何数据类型",
                "message": "请至少选择一种数据类型（如角色、技能、怪物）。",
            }

        try:
            count = int(params.get("count", 5))
        except (TypeError, ValueError):
            count = 5
        count = max(1, min(count, 20))
        instruction = str(params.get("instruction", "")).strip()

        # 策划书上下文
        model = context.get("_inline_model")
        background_bits: list[str] = []
        if model is not None:
            meta = getattr(model, "meta", {}) or {}
            for label, key in (("游戏名", "game_name"), ("类型", "game_type"), ("定位", "positioning")):
                val = meta.get(key) if isinstance(meta, dict) else ""
                if val:
                    background_bits.append(f"{label}：{val}")
            numeric = getattr(model, "numeric", {}) or {}
            if isinstance(numeric, dict):
                for label, key in (("核心公式", "core_formulas"), ("平衡原则", "balance_principles"), ("经济模型", "economic_model")):
                    val = numeric.get(key)
                    if val:
                        background_bits.append(f"{label}：{str(val)[:500]}")
            systems = getattr(model, "systems", {}) or {}
            enabled_names = [
                str(cfg.get("name", "")).strip()
                for cfg in systems.values()
                if isinstance(cfg, dict) and cfg.get("enabled")
            ]
            enabled_names = [n for n in enabled_names if n]
            if enabled_names:
                background_bits.append("启用的游戏系统：" + "、".join(enabled_names[:12]))
        background = "\n".join(background_bits) if background_bits else "（策划书尚未填写背景信息，请按通用 RPG 设定生成）"

        # 数据类型字段提示（基于默认 RPG schema）
        type_desc_lines: list[str] = []
        try:
            from core.defaults.rpg_schema import create_default_rpg_schema
            schema = create_default_rpg_schema()
            for _singular, name, plural in selected:
                td = schema.get_type(_singular)
                if td is not None:
                    fields = [
                        f.name for f in td.get_user_fields()
                        if f.name not in {"id", "image", "image_desc", "image_tags"}
                    ]
                    type_desc_lines.append(f"- {name}（键: {plural}）：建议字段 {', '.join(fields[:14])}")
                else:
                    type_desc_lines.append(f"- {name}（键: {plural}）：字段参考默认数据表")
        except Exception:
            type_desc_lines = [f"- {name}（键: {plural}）" for _singular, name, plural in selected]
        type_desc = "\n".join(type_desc_lines)

        system_prompt = (
            "你是资深游戏数值与内容策划，负责从策划书设定出发生成初始游戏数据。"
            "你只输出一个合法 JSON 对象，不输出任何解释、注释或代码块标记。"
        )
        user_prompt = (
            f"请根据下面的策划书设定，为指定的游戏数据类型生成初始候选数据（人工审批后才导入，允许少量瑕疵）。\n\n"
            f"[策划书设定]\n{background}\n\n"
            f"[数据类型与建议字段]\n{type_desc}\n\n"
            f"[要求]\n"
            f"1. 每个类型生成 {count} 条数据。\n"
            f"2. 输出 JSON 对象：键为上面的复数键名，值为数组；不生成 id 字段。\n"
            f"3. 每条必须包含 name；数值字段量级与策划书数值设定保持一致。\n"
            f"4. 内容风格统一、可读，避免重复。\n"
            + (f"5. 补充要求：{instruction}\n" if instruction else "")
            + '输出格式示例：{"roles": [{"name": "示例", "desc": "..."}], "skills": [...]}'
        )

        success, content = self._call_llm(user_prompt, system_prompt, logger)
        if not success:
            return {"success": False, "message": content, "data": None}

        parsed = self._parse_llm_json(content, logger)
        if not isinstance(parsed, dict):
            return {
                "success": False,
                "message": "AI 返回内容无法解析为 JSON，请重试或减少生成数量。",
                "data": None,
            }

        # 归一化：键名对齐复数键、条目去 id、仅保留 dict 条目
        candidates: dict[str, list[dict]] = {}
        generated_counts: dict[str, int] = {}
        for _singular, _name, plural in selected:
            bucket = parsed.get(plural)
            if bucket is None and plural in plurals_set:
                # AI 可能用了单数键
                bucket = parsed.get(_singular)
            items = [it for it in bucket if isinstance(it, dict)] if isinstance(bucket, list) else []
            cleaned = []
            for it in items:
                it.pop("id", None)
                cleaned.append(it)
            if cleaned:
                candidates[plural] = cleaned
                generated_counts[plural] = len(cleaned)

        total = sum(generated_counts.values())
        if total == 0:
            return {
                "success": False,
                "message": "AI 未返回任何有效数据条目，请补充数值章设定或调整要求后重试。",
                "data": None,
            }
        return {
            "success": True,
            "message": f"已生成 {total} 条候选数据（" + "、".join(f"{k}:{v}" for k, v in generated_counts.items()) + "），请人工勾选导入。",
            "data": {"candidates": candidates, "generated_counts": generated_counts},
        }



    def _ai_fill_field(self, params: dict, context: dict, logger) -> dict:
        """AI 填充单个字段 — 实际调用 LLM 生成内容"""
        field_path = params.get("field_path", "")
        field_label = params.get("field_label", "")
        field_content = params.get("field_content", "")
        chapter = params.get("chapter", "meta")
        agent_id = AgentRouter.route(chapter)
        display = AgentRouter.get_display_name(agent_id)

        system_prompt = (
            f"你是{display}，正在协助编写游戏策划书的{chapter}章节。"
            f"请为字段「{field_label or field_path}」生成专业、具体的内容。"
            f"只输出字段内容本身，不要加多余的解释或前缀。"
        )
        user_prompt = (
            f"请为策划书 {chapter} 章节的「{field_label or field_path}」字段生成内容。\n"
            f"当前内容: {field_content or '(空)'}\n"
            f"请直接输出生成的内容，50-300字。"
        )

        success, content = self._call_llm(user_prompt, system_prompt, logger)
        if success:
            return {
                "success": True,
                "message": f"[{display}] 已为字段「{field_label or field_path}」生成内容",
                "data": {
                    "agent_id": agent_id,
                    "display_name": display,
                    "field_path": field_path,
                    "generated_content": content,
                }
            }
        else:
            return {
                "success": False,
                "message": content,
                "data": None,
            }

    def _ai_fill_chapter(self, params: dict, context: dict, logger) -> dict:
        """AI 填充整章 — 实际调用 LLM 生成内容

        F7 增强：
        - 列出章节所有字段名（包括空字段），防止 AI 漏字段
        - 加入游戏名称、类型、定位等上下文
        - 加入风格术语提示（如有）
        - 加入已有非空字段值作为参考
        """
        chapter = params.get("chapter", "meta")
        agent_id = AgentRouter.route(chapter)
        display = AgentRouter.get_display_name(agent_id)

        ceshu_id = params.get("ceshu_id", "")
        only_empty = bool(params.get("only_empty", False))
        model = None
        existing_content = ""
        field_list_str = ""
        if ceshu_id:
            mgr = self._get_manager(context)
            library = self._resolve_library(context, params)
            try:
                model = mgr.get_ceshu(ceshu_id, library)
                chapter_data = model.get_chapter(chapter)
                # F7: 列出所有字段名（包括空字段），让 AI 不漏字段
                if isinstance(chapter_data, dict):
                    if only_empty:
                        # d3: 仅补全空字段 — 只把空字段列入待生成清单
                        empty_fields = [k for k, v in chapter_data.items() if not v]
                        if not empty_fields:
                            return {
                                "success": True,
                                "message": "本章没有空字段，无需补全",
                                "data": {"generated_content": "", "nothing_to_fill": True},
                            }
                        field_list_str = ", ".join(empty_fields)
                    else:
                        field_list_str = ", ".join(chapter_data.keys())
                    existing_content = "\n".join(
                        f"- {k}: {v}" for k, v in chapter_data.items()
                        if v and isinstance(v, (str, int, float))
                    )
            except Exception:
                pass

        # F7: 构建上下文 — 游戏名称、类型、定位
        context_lines = []
        if model is not None:
            game_name = model.meta.get("game_name", "")
            game_type = model.meta.get("game_type", "")
            positioning = model.meta.get("positioning", "")
            if game_name:
                context_lines.append(f"游戏名称: {game_name}")
            if game_type:
                context_lines.append(f"游戏类型: {game_type}")
            if positioning:
                context_lines.append(f"市场定位: {positioning}")
            # F7: 风格术语提示
            style = getattr(model, 'style', '') or ''
            if style:
                glossary = _get_style_glossary(style)
                if glossary:
                    context_lines.append(f"风格: {style}")
                    context_lines.append(f"风格术语表:\n{glossary}")
        context_str = "\n".join(context_lines) if context_lines else "(无上下文)"

        if only_empty:
            system_prompt = (
                f"你是{display}，正在协助编写游戏策划书的{chapter}章节。"
                f"请仅补全下面列出的空字段。"
                f"输出格式为 JSON，键为字段名，值为生成内容。"
                f"只输出 JSON，不要加任何解释或 markdown 标记。"
            )
        else:
            system_prompt = (
                f"你是{display}，正在协助编写游戏策划书的{chapter}章节。"
                f"请生成该章节的完整内容，包括所有字段。"
                f"输出格式为 JSON，键为字段名，值为生成内容（字符串或简单结构）。"
                f"只输出 JSON，不要加任何解释或 markdown 标记。"
            )
        user_prompt = (
            f"请为策划书「{chapter}」整章生成内容。\n"
            f"章节提示: {AgentRouter.get_agent_prompt(chapter)}\n\n"
            f"上下文信息:\n{context_str}\n\n"
            f"该章节需要填充的字段列表:\n{field_list_str}\n\n"
        )
        if existing_content:
            user_prompt += f"已有非空内容（请保留并补充其他字段）:\n{existing_content}\n\n"
        if only_empty:
            user_prompt += (
                "要求：\n"
                "1. 只输出上面字段列表中列出的空字段，已填字段一律不要输出\n"
                "2. 字段值要具体、专业、符合游戏类型和风格\n"
                "3. 字符串字段生成 50-300 字的专业内容\n"
                "4. 列表字段生成 2-5 个元素的列表\n"
                "5. 数字字段生成合理的整数值\n"
                "6. 只输出 JSON，不要加任何解释"
            )
        else:
            user_prompt += (
                "要求：\n"
                "1. 必须为字段列表中的每个字段都生成内容（即使是空字符串也要包含键）\n"
                "2. 字段值要具体、专业、符合游戏类型和风格\n"
                "3. 字符串字段生成 50-300 字的专业内容\n"
                "4. 列表字段生成 2-5 个元素的列表\n"
                "5. 数字字段生成合理的整数值\n"
                "6. 只输出 JSON，不要加任何解释"
            )

        success, content = self._call_llm(user_prompt, system_prompt, logger)
        if success:
            return {
                "success": True,
                "message": f"[{display}] 已为「{chapter}」整章生成内容",
                "data": {
                    "agent_id": agent_id,
                    "display_name": display,
                    "chapter": chapter,
                    "generated_content": content,
                }
            }
        else:
            return {
                "success": False,
                "message": content,
                "data": None,
            }

    def _ai_generate_full(self, params: dict, context: dict, logger) -> dict:
        """N10: AI 一键生成完整策划书 — 生成计划（不直接调用 AI）

        与 ``ai_generate`` 不同，本 action 仅返回生成计划（章节顺序 + 每章提示词
        模板 + 上下文章段），由调用方（如 ``_AIFullGenerateWorker``）逐章调用
        ``ai_fill_chapter`` 完成 AI 生成，便于在 UI 上展示章节级进度。

        参数（user_input）:
            game_name: 游戏名称
            game_type: 游戏类型 (RPG/MMORPG/ARPG/MOBA/FPS/SLG/休闲/放置 等)
            style: 风格 (仙侠/武侠/科幻/现代/奇幻/末日/历史/二次元 等)
            description: 简要描述（3-5 句话游戏概念）
            references: 参考游戏（逗号分隔，可选）
            platforms: 目标平台列表 (PC/移动端/主机/Web)
            business_model: 商业模式 (F2P/P2P/Buyonce/混合)
            include_market_analysis: 是否包含市场分析 (默认 True)
            include_risk_assessment: 是否包含风险评估 (默认 True)

        Returns:
            data: {
                chapter_order: [chapter_key, ...] — 18 章生成顺序
                chapter_prompts: {chapter_key: str} — 每章提示词
                user_input: dict — 原始用户输入（含归一化字段）
                meta_seed: dict — 用于 ai_fill_chapter 上下文的 meta 字段
            }
        """
        user_input = self._normalize_user_input(params)
        include_market = bool(params.get("include_market_analysis", True))
        include_risk = bool(params.get("include_risk_assessment", True))

        chapter_order = self._build_chapter_order(include_market, include_risk)
        chapter_prompts = self._build_chapter_prompts(user_input, chapter_order)
        meta_seed = self._build_meta_seed(user_input)

        logger.info(
            f"[CeshuAI] ai_generate_full 计划生成: {len(chapter_order)} 章, "
            f"game={user_input['game_name'] or '(未命名)'}, "
            f"type={user_input['game_type']}, style={user_input['style']}"
        )

        return {
            "success": True,
            "message": f"已生成 {len(chapter_order)} 章生成计划",
            "data": {
                "chapter_order": chapter_order,
                "chapter_prompts": chapter_prompts,
                "user_input": user_input,
                "meta_seed": meta_seed,
            },
        }

    # --- _ai_generate_full 辅助方法 ---

    @staticmethod
    def _normalize_user_input(params: dict) -> dict:
        """归一化用户输入字段，补全默认值并清理空白。"""
        raw_platforms = params.get("platforms", "")
        if isinstance(raw_platforms, str):
            platforms = [p.strip() for p in raw_platforms.split(",") if p.strip()]
        elif isinstance(raw_platforms, list):
            platforms = [str(p).strip() for p in raw_platforms if str(p).strip()]
        else:
            platforms = []

        raw_refs = params.get("references", "")
        if isinstance(raw_refs, str):
            references = [r.strip() for r in raw_refs.split(",") if r.strip()]
        elif isinstance(raw_refs, list):
            references = [str(r).strip() for r in raw_refs if str(r).strip()]
        else:
            references = []

        return {
            "game_name": str(params.get("game_name", "")).strip(),
            "game_type": str(params.get("game_type", "")).strip(),
            "style": str(params.get("style", "")).strip(),
            "description": str(params.get("description", "")).strip(),
            "references": references,
            "platforms": platforms,
            "business_model": str(params.get("business_model", "")).strip(),
        }

    @staticmethod
    def _build_chapter_order(include_market: bool, include_risk: bool) -> list:
        """构建 18 章生成顺序（按章节依赖）。

        依赖关系（简化版）:
          meta → vision → worldview → characters → gameplay → combat
                → systems → economy → monetization → numeric → art → audio
                → tech → mvp → resources → accessibility
          market_analysis 在 vision 之后（可选）
          risk_handling 在 tech 之后（可选）
        """
        order = ["meta", "vision"]
        if include_market:
            order.append("market_analysis")
        order.extend([
            "worldview", "characters", "gameplay", "combat",
            "systems", "economy", "monetization", "numeric",
            "art", "audio", "tech",
        ])
        if include_risk:
            order.append("risk_handling")
        order.extend(["mvp", "resources", "accessibility"])
        return order

    @staticmethod
    def _build_meta_seed(user_input: dict) -> dict:
        """从 user_input 派生 meta 章节种子数据（供 ai_fill_chapter 上下文）。"""
        return {
            "game_name": user_input.get("game_name", ""),
            "game_type": user_input.get("game_type", ""),
            "platform": list(user_input.get("platforms", [])),
            "positioning": "",
            "tags": [user_input["style"]] if user_input.get("style") else [],
        }

    @staticmethod
    def _build_chapter_prompts(user_input: dict, chapter_order: list) -> dict:
        """为每章生成定制化提示词（拼接到 ai_fill_chapter 默认提示之后）。"""
        from core.ceshu.ceshu_model import CHAPTER_LABELS

        game_name = user_input.get("game_name", "")
        game_type = user_input.get("game_type", "")
        style = user_input.get("style", "")
        description = user_input.get("description", "")
        references = user_input.get("references", [])
        platforms = user_input.get("platforms", [])
        biz = user_input.get("business_model", "")

        base_lines = []
        if game_name:
            base_lines.append(f"游戏名称: {game_name}")
        if game_type:
            base_lines.append(f"游戏类型: {game_type}")
        if style:
            base_lines.append(f"风格: {style}")
        if description:
            base_lines.append(f"概念描述: {description}")
        if references:
            base_lines.append(f"参考游戏: {', '.join(references)}")
        if platforms:
            base_lines.append(f"目标平台: {', '.join(platforms)}")
        if biz:
            base_lines.append(f"商业模式: {biz}")
        base_context = "\n".join(base_lines)

        chapter_hint = {
            "meta": "请生成项目元信息：游戏名称、类型、市场定位（一句话）、标签列表（3-5个）。",
            "vision": "请生成产品愿景：设计愿景、差异化卖点、用户画像（主/次/潜在）、商业模式。",
            "market_analysis": "请生成市场分析：目标市场、市场容量、用户画像、竞品列表、市场定位、进入壁垒、市场趋势、KPI预测。",
            "worldview": "请生成世界观：世界观架构、历史时代、阵营列表、地理设定、主线剧情、分支结局、角色关系网。",
            "characters": "请生成角色设计：主角设定、主要NPC数量与列表、反派设计、Boss设计、敌人类型、同伴系统、角色成长弧线。",
            "gameplay": "请生成核心玩法：核心循环、操作方案、首30分钟体验、游戏模式、胜负条件、新手引导。",
            "combat": "请生成战斗系统：战斗模式、伤害公式、技能系统、Buff机制、元素系统、战斗节奏、PVP/PVE设计、Boss机制。",
            "systems": "请生成游戏系统：基于玩法需求推荐应启用的游戏系统及配置（保留 systems 结构中 enabled/config 字段）。",
            "economy": "请生成经济系统：货币类型、产出与回收机制、掉落表、生产链、市场设计、通胀控制、经济目标。",
            "monetization": "请生成商业化设计：付费模式、定价档位、内购设计、广告策略、订阅制、赛季通行证、VIP系统、收入预测。",
            "numeric": "请生成数值设计：核心公式、成长曲线、掉落表、经济模型、平衡原则。",
            "art": "请生成美术设计：美术风格、角色设计、环境设计、UI设计语言、色彩系统、字体、特效、动画、多分辨率。",
            "audio": "请生成音频设计：音乐风格、音效数量、配乐清单、音效清单、配音设计、音频引擎、动态音频、音频预算。",
            "tech": "请生成技术规格：引擎选型、核心架构、第三方依赖、性能目标、里程碑、团队结构、QA计划。",
            "risk_handling": "请生成风险控制：风险矩阵、应急预案、技术风险、市场风险、团队风险、法律风险、进度风险、监控机制。",
            "mvp": "请生成MVP规划：MVP范围、时间线、核心特性、暂缓特性、原型特性、里程碑、成功标准、团队规模、预算估算。",
            "resources": "请生成资源规划：美术资产、音频资产、本地化、外包、预算、风险矩阵、应急预案、IP、附录。",
            "accessibility": "请生成可访问性与本地化：支持语言列表、本地化策略、文化适配、无障碍特性、字幕设计、色盲支持、分级认证。",
        }

        prompts = {}
        for ch in chapter_order:
            label = CHAPTER_LABELS.get(ch, ch)
            hint = chapter_hint.get(ch, "请生成该章节内容。")
            prompts[ch] = (
                f"【章节】{label}\n"
                f"【用户输入】\n{base_context or '(无)'}\n"
                f"【生成要求】{hint}\n"
                f"输出 JSON，键为字段名，值为生成内容；只输出 JSON。"
            )
        return prompts

    def _ai_review_full(self, params: dict, context: dict, logger) -> dict:
        """AI 全文审查 — 实际调用 LLM 进行审查（v5.0: 覆盖全部 18 章）"""
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        try:
            from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
            model = mgr.get_ceshu(ceshu_id, library)
            progress = model.chapter_progress()
            disabled = [k for k, v in model.systems.items() if isinstance(v, dict) and not v.get("enabled")]

            # v5.0: 遍历全部 18 章
            summary_parts = []
            for key in CHAPTER_KEYS:
                chapter_data = model.get_chapter(key)
                if not isinstance(chapter_data, dict):
                    continue
                filled = {k: v for k, v in chapter_data.items()
                          if v and isinstance(v, (str, int, float))}
                if filled:
                    label = CHAPTER_LABELS.get(key, key)
                    summary_parts.append(
                        f"【{label}】" + " / ".join(f"{k}: {str(v)[:80]}" for k, v in filled.items())
                    )
            summary = "\n".join(summary_parts)

            # v5.0: 内置校验报告
            validation_errors = model.validate()

            system_prompt = "你是资深游戏策划审查专家，请对策划书进行专业审查。"
            user_prompt = (
                f"请对以下策划书进行全文审查：\n\n{summary}\n\n"
                f"总进度: {progress.get('total', 0)*100:.0f}%\n"
                f"未启用游戏系统: {', '.join(disabled) if disabled else '无'}\n"
                f"内置校验发现: {len(validation_errors)} 个问题"
                + (f"（首条: {validation_errors[0]}）" if validation_errors else "") + "\n\n"
                f"风格: {model.style or '未指定'}, 模块类型: {model.module_type or '未指定'}\n\n"
                f"请检查：\n"
                f"1. 各章设定是否一致（如世界观与系统设计不矛盾）\n"
                f"2. 是否有遗漏的关键内容\n"
                f"3. 数值框架合理性\n"
                f"4. 开发计划可行性\n"
                f"5. 商业化与经济的平衡\n"
                f"6. MVP 范围是否合理\n"
                f"7. 风险识别是否充分\n"
                f"请列出发现的问题和改进建议。"
            )

            success, content = self._call_llm(user_prompt, system_prompt, logger)
            if success:
                return {
                    "success": True,
                    "message": content,
                    "data": {
                        "ceshu_id": ceshu_id,
                        "progress": progress,
                        "validation_errors": validation_errors,
                        "review_result": content,
                    }
                }
            else:
                return {
                    "success": False,
                    "message": content,
                    "data": None,
                }
        except FileNotFoundError:
            return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}

    def _ai_review(self, params: dict, context: dict, logger) -> dict:
        """N6: AI 结构化审阅 — 5 维度评分 + 详细反馈 + Top 3 改进建议

        维度：内容完整性 / 逻辑一致性 / 市场可行性 / 技术可行性 / 创意度
        每个维度：1-10 分 + 文字反馈
        总体评价 + Top 3 改进建议

        Returns:
            data: {
                dimensions: [{key, label, score, feedback}, ...],
                overall: str,
                suggestions: [str, str, str],
                raw_response: str
            }
        """
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        try:
            from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
            model = mgr.get_ceshu(ceshu_id, library)
            progress = model.chapter_progress()

            # 收集各章节填充内容摘要
            summary_parts = []
            for key in CHAPTER_KEYS:
                chapter_data = model.get_chapter(key)
                if not isinstance(chapter_data, dict):
                    continue
                filled = {k: v for k, v in chapter_data.items()
                          if v and isinstance(v, (str, int, float))}
                if filled:
                    label = CHAPTER_LABELS.get(key, key)
                    summary_parts.append(
                        f"【{label}】" + " / ".join(f"{k}: {str(v)[:60]}" for k, v in filled.items())
                    )
            summary = "\n".join(summary_parts) or "(策划书内容为空)"

            validation_errors = model.validate()

            system_prompt = (
                "你是资深游戏策划审阅专家。请对策划书进行结构化审阅，输出严格 JSON。"
                "JSON 格式如下：\n"
                "{\n"
                '  "dimensions": [\n'
                '    {"key":"completeness","label":"内容完整性","score":1-10,"feedback":"详细反馈"},\n'
                '    {"key":"consistency","label":"逻辑一致性","score":1-10,"feedback":"详细反馈"},\n'
                '    {"key":"market","label":"市场可行性","score":1-10,"feedback":"详细反馈"},\n'
                '    {"key":"technical","label":"技术可行性","score":1-10,"feedback":"详细反馈"},\n'
                '    {"key":"creativity","label":"创意度","score":1-10,"feedback":"详细反馈"}\n'
                "  ],\n"
                '  "overall":"总体评价 100-200 字",\n'
                '  "suggestions":["改进建议1","改进建议2","改进建议3"]\n'
                "}\n"
                "只输出 JSON，不要加任何解释或 markdown 标记。"
            )
            user_prompt = (
                f"请对以下策划书进行 5 维度结构化审阅：\n\n{summary}\n\n"
                f"完成进度: {progress.get('total', 0)*100:.0f}%\n"
                f"内置校验问题数: {len(validation_errors)}\n"
                f"风格: {model.style or '未指定'}, 模块类型: {model.module_type or '未指定'}\n\n"
                f"评分标准：1-3 分（严重不足）/ 4-6 分（合格）/ 7-8 分（良好）/ 9-10 分（优秀）。"
            )

            success, content = self._call_llm(user_prompt, system_prompt, logger)
            if not success:
                return {"success": False, "message": content, "data": None}

            parsed = self._parse_llm_json(content, logger)
            if not parsed or "dimensions" not in parsed:
                return {
                    "success": False,
                    "message": "AI 返回内容解析失败",
                    "data": {"raw_response": content},
                }

            # 兜底字段补全
            dimensions = parsed.get("dimensions", []) or []
            valid_keys = {"completeness", "consistency", "market", "technical", "creativity"}
            dim_by_key = {d.get("key"): d for d in dimensions if isinstance(d, dict)}
            default_labels = {
                "completeness": "内容完整性",
                "consistency": "逻辑一致性",
                "market": "市场可行性",
                "technical": "技术可行性",
                "creativity": "创意度",
            }
            ordered_dims = []
            for k in valid_keys:
                d = dim_by_key.get(k, {})
                score = d.get("score", 0)
                try:
                    score = int(score)
                except Exception:
                    score = 0
                if score < 1:
                    score = 1
                if score > 10:
                    score = 10
                ordered_dims.append({
                    "key": k,
                    "label": d.get("label") or default_labels[k],
                    "score": score,
                    "feedback": d.get("feedback", "") or "",
                })

            suggestions = parsed.get("suggestions", []) or []
            if isinstance(suggestions, str):
                suggestions = [suggestions]
            suggestions = [str(s) for s in suggestions if s][:3]
            while len(suggestions) < 3:
                suggestions.append("（暂无更多建议）")

            overall = parsed.get("overall", "") or ""

            return {
                "success": True,
                "message": "AI 审阅完成",
                "data": {
                    "ceshu_id": ceshu_id,
                    "dimensions": ordered_dims,
                    "overall": overall,
                    "suggestions": suggestions,
                    "progress": progress,
                    "validation_errors": validation_errors,
                    "raw_response": content,
                },
            }
        except FileNotFoundError:
            return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}

    def _apply_system_recommendations(self, model, recommended) -> None:
        """应用 AI 分析推荐：先全部禁用，再按推荐启用+填充标准 config。"""
        # 应用游戏系统推荐：先全部禁用，再按推荐启用+填充标准 config
        from core.ceshu.ceshu_model import SYSTEM_CONFIG_SCHEMA, default_config_for
        for sys_name in list(model.systems.keys()):
            if isinstance(model.systems[sys_name], dict):
                model.systems[sys_name]["enabled"] = False
                # 重置为空标准字段（保留 schema 结构）
                if sys_name in SYSTEM_CONFIG_SCHEMA:
                    model.systems[sys_name]["config"] = default_config_for(sys_name)
                else:
                    model.systems[sys_name]["config"] = {}
        for sys_name, sys_info in recommended.items():
            if not isinstance(sys_info, dict):
                continue
            enabled = bool(sys_info.get("enabled", False))
            ai_config = sys_info.get("config", {})
            if not isinstance(ai_config, dict):
                ai_config = {}
            if sys_name in model.systems:
                model.systems[sys_name]["enabled"] = enabled
                if enabled:
                    # 合并：以标准字段为底，用 AI 返回的值覆盖
                    if sys_name in SYSTEM_CONFIG_SCHEMA:
                        merged = default_config_for(sys_name)
                        # 只接受 schema 中定义的字段（过滤 AI 脏字段）
                        for k, v in ai_config.items():
                            if k in SYSTEM_CONFIG_SCHEMA[sys_name]:
                                merged[k] = v
                        model.systems[sys_name]["config"] = merged
                    else:
                        # 数据类型条目/已有自定义：保留 AI 给的 note 等
                        model.systems[sys_name]["config"] = ai_config
            elif enabled:
                # 自定义游戏系统（混合玩法可能新增，如 tower_defense/card_battle/pet）
                model.add_system(sys_name, ai_config if ai_config else {})




    def _apply_preset_systems(self, model, rec_sys_list) -> None:
        """套用混合玩法预设推荐系统（先全部禁用，再启用/新增）。"""
        from core.ceshu.ceshu_model import SYSTEM_CONFIG_SCHEMA, default_config_for
        # 先全部禁用
        for sys_name in list(model.systems.keys()):
            if isinstance(model.systems[sys_name], dict):
                model.systems[sys_name]["enabled"] = False
                if sys_name in SYSTEM_CONFIG_SCHEMA:
                    model.systems[sys_name]["config"] = default_config_for(sys_name)
                else:
                    model.systems[sys_name]["config"] = {}
        # 启用预设推荐的系统
        for sys_name in rec_sys_list:
            if sys_name in model.systems:
                if isinstance(model.systems[sys_name], dict):
                    model.systems[sys_name]["enabled"] = True
            else:
                # 不在默认 13 系统内 → 作为自定义系统添加
                model.add_system(sys_name, {})



    def _apply_batch_to_model(self, model, chapters, batch_data) -> None:
        """把一批 LLM 返回的章节数据合并进 model（仅合并 dict 字段）。"""
        if not batch_data:
            return
        for ch in chapters:
            if ch in batch_data and isinstance(batch_data[ch], dict):
                chapter = getattr(model, ch, {})
                chapter.update(batch_data[ch])
                setattr(model, ch, chapter)


    def _build_result_message(self, model, template_name, analysis, preset) -> str:
        """构造生成结果摘要消息。"""
        progress = model.chapter_progress()
        enabled_sys = model.compute_enabled_editors()
        hybrid_line = ""
        if analysis and analysis.get("hybrid_notes"):
            hybrid_line = f"混合玩法: {analysis['hybrid_notes']}\n"
        preset_line = ""
        if preset:
            preset_line = f"匹配预设: {preset.get('label', '')} ({preset.get('highlight', '')})\n"
        result_msg = (
            f"策划书已生成！\n"
            f"游戏名称: {model.meta.get('game_name', '未命名')}\n"
            f"游戏类型: {model.meta.get('game_type', '')}\n"
            f"{hybrid_line}{preset_line}"
            f"骨架模板: {template_name}\n"
            f"完成进度: {progress['total']:.0%}\n"
            f"已启用游戏系统: {', '.join(enabled_sys) if enabled_sys else '无'}\n"
            f"你可以在策划书编辑器中查看和修改各章节内容。"
        )
        return result_msg


    def _ai_generate(self, params: dict, context: dict, logger) -> dict:
        """AI 一键生成完整策划书 — 自由描述 + 混合玩法 + 风格参数化

        v5.0 增强：
        - 接收 style/module_type 参数，自动推断并应用风格术语
        - 支持 18 章完整生成（含工业级补充 9 章）
        - 风格术语映射表指导 LLM 生成符合风格的内容

        不再强制匹配单一模板。流程：
        1. 以"基础开发版 (通用)"为骨架（基础游戏系统均可启用）
        2. 推断 style/module_type（参数优先，否则从 description 推断）
        3. AI 分析用户描述，推荐应启用的游戏系统组合（支持混合玩法）
        4. 应用推荐：启用/禁用游戏系统，可新增自定义游戏系统
        5. 分三批 LLM 生成所有 18 章内容（融合混合玩法 + 风格术语）

        参数:
            template: 模板名称（可选）
            game_name: 游戏名称（可选）
            description: 用户对游戏的自由描述（可选）
            style: 游戏风格 (xianxia/sci-fi/realistic/wuxia/...)（可选，自动推断）
            module_type: 模块类型 (rpg/slg/moba/fps/...)（可选，自动推断）
        """
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        template_name = params.get("template", "") or "基础开发版 (通用)"
        game_name = params.get("game_name", "")
        description = params.get("description", "")
        style = params.get("style", "")
        module_type = params.get("module_type", "")

        # v5.0: 自动推断 style/module_type（如未显式提供）
        if not style or not module_type:
            inferred_style, inferred_module = _infer_style_module(description)
            if not style:
                style = inferred_style
            if not module_type:
                module_type = inferred_module

        logger.info(f"[CeshuAI] 使用基础骨架: {template_name}, style={style}, module_type={module_type}")

        # v5.0: 查找匹配的混合玩法预设（用于辅助系统推荐与生成提示）
        from core.ceshu.ceshu_constants import find_preset
        preset = find_preset(style, module_type) if (style or module_type) else None
        if preset:
            logger.info(f"[CeshuAI] 匹配混合玩法预设: {preset.get('key')} - {preset.get('label')}")

        # 1. 以通用模板为骨架创建策划书（所有游戏系统默认 disabled）
        model = mgr.create_ceshu(library, template_name)
        if game_name:
            model.meta["game_name"] = game_name
        # v5.0: 设置风格参数
        model.style = style
        model.module_type = module_type

        # 风格术语提示（让 LLM 生成符合风格的内容）
        style_glossary = _get_style_glossary(style)
        style_hint = ""
        if style_glossary:
            style_hint = (
                f"\n游戏风格: {style}\n"
                f"风格术语表（请在生成内容时使用对应术语）：\n{style_glossary}\n"
            )
        # v5.0: 预设特色提示
        preset_hint = ""
        if preset:
            preset_hint = (
                f"\n混合玩法预设: {preset.get('label', '')}\n"
                f"特色方向: {preset.get('highlight', '')}\n"
                f"推荐启用系统: {', '.join(preset.get('recommended_systems', []))}\n"
            )

        # 2. AI 分析阶段：分析描述，推荐游戏系统组合（支持混合玩法）
        analysis = None
        if description:
            analysis_success, analysis = self._analyze_description(description, model, logger)
            if not analysis_success:
                return {"success": False, "message": analysis, "data": None}

            # 应用元信息
            if analysis.get("game_name") and not game_name:
                model.meta["game_name"] = analysis["game_name"]
            if analysis.get("game_type"):
                model.meta["game_type"] = analysis["game_type"]
            if analysis.get("positioning"):
                model.meta["positioning"] = analysis["positioning"]
            if analysis.get("tags"):
                model.meta["tags"] = analysis["tags"]

            # 应用游戏系统推荐：先全部禁用，再按推荐启用+填充标准 config
            recommended = analysis.get("subsystems", {})
            self._apply_system_recommendations(model, recommended)

            logger.info(f"[CeshuAI] 已应用游戏系统推荐: 启用={model.compute_enabled_editors()}")

        # v5.0: 若无 AI 分析（无 description）但匹配到混合玩法预设，则直接套用预设推荐系统
        if not analysis and preset:
            rec_sys_list = preset.get("recommended_systems", [])
            self._apply_preset_systems(model, rec_sys_list)
            logger.info(f"[CeshuAI] 已套用预设推荐系统: {rec_sys_list}")

        # 3. 生成阶段：分三批 LLM 生成所有 18 章内容
        system_prompt = (
            "你是一位资深游戏策划，请根据用户提供的信息生成完整的游戏策划书内容。"
            "支持混合玩法（如 RPG+塔防+卡牌）的创意组合，请充分发挥创意。"
            "输出必须是合法 JSON，键为章节名，值为该章节的字段字典。"
            "只输出 JSON，不要加任何解释或 markdown 标记。"
        )

        hybrid_hint = ""
        if analysis and analysis.get("hybrid_notes"):
            hybrid_hint = (
                f"\n混合玩法说明: {analysis['hybrid_notes']}\n"
                f"请务必在各章节中体现混合玩法的协同设计，不要简单拼凑。"
            )
        # v5.0: 综合混合玩法与预设提示
        combined_hint = hybrid_hint + preset_hint + style_hint

        # 第一批：创意章节 (meta + vision + worldview + gameplay + characters)
        batch1_prompt = self._build_generate_prompt(model, [
            "meta", "vision", "worldview", "gameplay", "characters"
        ], game_name, description) + combined_hint

        logger.info("[CeshuAI] 开始生成第一批章节 (meta/vision/worldview/gameplay/characters)...")
        success1, content1 = self._call_llm(batch1_prompt, system_prompt, logger)
        if not success1:
            return {"success": False, "message": content1, "data": None}

        batch1_data = self._parse_llm_json(content1, logger)
        self._apply_batch_to_model(model, ["meta", "vision", "worldview", "gameplay", "characters"], batch1_data)

        # 第二批：制作章节 (numeric + art + tech + resources + audio)
        batch2_prompt = self._build_generate_prompt(model, [
            "numeric", "art", "tech", "resources", "audio"
        ], game_name, description) + combined_hint

        logger.info("[CeshuAI] 开始生成第二批章节 (numeric/art/tech/resources/audio)...")
        success2, content2 = self._call_llm(batch2_prompt, system_prompt, logger)
        if success2:
            batch2_data = self._parse_llm_json(content2, logger)
            self._apply_batch_to_model(model, ["numeric", "art", "tech", "resources", "audio"], batch2_data)
        else:
            logger.warning(f"[CeshuAI] 第二批生成失败: {content2}")

        # v5.0 第三批：工业级补充章节 (market_analysis + combat + economy + monetization + mvp + risk_handling + accessibility)
        batch3_prompt = self._build_generate_prompt(model, [
            "market_analysis", "combat", "economy", "monetization",
            "mvp", "risk_handling", "accessibility"
        ], game_name, description) + combined_hint

        logger.info("[CeshuAI] 开始生成第三批章节 (工业级补充 7 章)...")
        success3, content3 = self._call_llm(batch3_prompt, system_prompt, logger)
        if success3:
            batch3_data = self._parse_llm_json(content3, logger)
            self._apply_batch_to_model(model, [
                "market_analysis", "combat", "economy", "monetization",
                "mvp", "risk_handling", "accessibility"
            ], batch3_data)
        else:
            logger.warning(f"[CeshuAI] 第三批生成失败: {content3}")

        # 4. 保存
        mgr.save_ceshu(model, library)

        result_msg = self._build_result_message(model, template_name, analysis, preset)

        return {
            "success": True,
            "message": result_msg,
            "data": {
                "ceshu_id": model.ceshu_id,
                "model": model.to_dict(),
                "progress": model.chapter_progress(),
                "analysis": analysis,
            }
        }



    def _analyze_description(self, description: str, model, logger) -> tuple:
        """AI 分析用户描述，推荐游戏系统组合（支持混合玩法）

        Returns:
            (success, analysis_or_error): 成功时 analysis 为 dict，包含:
            - game_name: 推荐的游戏名称
            - game_type: 游戏类型（支持组合如 "RPG+塔防+卡牌"）
            - positioning: 一句话市场定位
            - tags: 标签列表
            - subsystems: {sys_name: {enabled, config: {field: value}}}
              对基础游戏系统填标准字段；自定义游戏系统用 {note: "..."}
            - hybrid_notes: 混合玩法协同说明（如有，否则空字符串）
        """
        from core.ceshu.ceshu_model import SYSTEM_CONFIG_SCHEMA, default_config_for

        # 构建基础游戏系统的字段说明（让 AI 知道每个游戏系统有哪些标准字段可填）
        sys_docs = []
        for sys_id, fields in SYSTEM_CONFIG_SCHEMA.items():
            field_docs = []
            for fname, fdef in fields.items():
                ftype = fdef.get("type", "entry")
                label = fdef.get("label", fname).rstrip(":")
                if ftype == "combobox":
                    choices = "/".join(fdef.get("values", []))
                    field_docs.append(f"    - {fname} ({label}, 选其一): {choices}")
                elif ftype == "spinbox":
                    lo = fdef.get("from", 0)
                    hi = fdef.get("to", 9999)
                    field_docs.append(f"    - {fname} ({label}, 整数): {lo}-{hi}")
                elif ftype == "checkbox":
                    field_docs.append(f"    - {fname} ({label}, 开关): enabled/disabled")
                elif ftype == "textarea":
                    field_docs.append(f"    - {fname} ({label}, 多行文本)")
                else:
                    field_docs.append(f"    - {fname} ({label}, 文本)")
            sys_docs.append(f"- {sys_id}:\n" + "\n".join(field_docs))

        systems_doc = "\n".join(sys_docs)

        system_prompt = (
            "你是一位资深游戏策划分析师。请根据用户对游戏的自由描述，分析游戏类型和应启用的游戏系统。"
            "支持混合玩法（如 RPG+塔防+卡牌），可以推荐启用任意组合的游戏系统，也可以新增自定义游戏系统。"
            "对基础游戏系统，必须填充其标准 config 字段（根据描述给出具体值）。"
            "对自定义游戏系统（如 tower_defense），用 {\"note\": \"...\"} 描述配置方向。"
            "输出必须是合法 JSON，不要加任何解释或 markdown 标记。"
        )

        user_prompt = (
            f"用户对游戏的描述:\n{description}\n\n"
            f"基础游戏系统及标准配置字段（enabled=true 时必须填 config）:\n"
            f"{systems_doc}\n\n"
            f"请分析描述并输出 JSON，格式如下：\n"
            f'{{\n'
            f'  "game_name": "推荐的游戏名称（如描述中没明确给出，根据描述创意命名）",\n'
            f'  "game_type": "游戏类型（支持组合，如 \\"RPG+塔防+卡牌\\"）",\n'
            f'  "positioning": "一句话市场定位",\n'
            f'  "tags": ["标签1", "标签2"],\n'
            f'  "subsystems": {{\n'
            f'    "battle": {{"enabled": true, "config": {{"turn_mode": "realtime", "pvp_type": "arena", "team_size": 3, "damage_formula": "ATK*skill_multiplier-DEF", "death_penalty": "掉落10%经验", "combat_pace": "fast"}}}},\n'
            f'    "tower_defense": {{"enabled": true, "config": {{"note": "自定义:塔防战斗，怪物沿路径进攻，玩家放置防御塔"}}}}\n'
            f'  }},\n'
            f'  "hybrid_notes": "混合玩法协同说明（如有，否则空字符串）"\n'
            f'}}\n\n'
            f"要求：\n"
            f"1. subsystems 中只包含 enabled=true 的游戏系统（不需要列出 disabled 的）\n"
            f"2. 基础游戏系统的 config 必须填充标准字段（字段名见上方文档），值要符合字段类型\n"
            f"   - combobox 字段值必须是候选值之一\n"
            f"   - spinbox 字段值必须是整数（在范围内）\n"
            f"   - entry 字段值是简短文本（10-50字）\n"
            f"3. 可以新增默认之外的自定义游戏系统（如 tower_defense/card_battle/pet 等），其 config 用 {{\"note\": \"...\"}}\n"
            f"4. 如果是混合玩法，hybrid_notes 应说明各玩法如何协同\n"
            f"5. 只输出 JSON，不要加任何解释"
        )

        success, content = self._call_llm(user_prompt, system_prompt, logger)
        if not success:
            return (False, content)

        analysis = self._parse_llm_json(content, logger)
        if not analysis:
            return (False, "AI 分析结果解析失败，请重试。")

        # 兜底：如果 subsystems 字段缺失或为空，启用全部基础游戏系统（config 用空标准字段）
        if not analysis.get("subsystems"):
            analysis["subsystems"] = {
                k: {"enabled": True, "config": default_config_for(k)}
                for k in SYSTEM_CONFIG_SCHEMA
            }

        logger.info(
            f"[CeshuAI] 描述分析完成: type={analysis.get('game_type', '')}, "
            f"subsystems={list(analysis.get('subsystems', {}).keys())}"
        )

        return (True, analysis)

    @staticmethod
    def _build_generate_prompt(model, chapters: list, game_name: str, description: str) -> str:
        """构建 AI 生成提示词"""
        from core.ceshu.ceshu_model import CHAPTER_LABELS

        parts = ["请根据以下信息，生成游戏策划书的指定章节内容。"]
        if game_name:
            parts.append(f"游戏名称: {game_name}")
        if description:
            parts.append(f"用户描述: {description}")

        parts.append(f"游戏类型: {model.meta.get('game_type', '')}")
        parts.append(f"模板定位: {model.meta.get('positioning', '')}")

        parts.append("\n请生成以下章节的内容：")
        for ch in chapters:
            label = CHAPTER_LABELS.get(ch, ch)
            chapter_data = getattr(model, ch, {})
            if ch == "systems":
                enabled = [k for k, v in chapter_data.items() if isinstance(v, dict) and v.get("enabled")]
                parts.append(f"\n【{label}】已启用游戏系统: {', '.join(enabled)}")
                parts.append("  请为每个已启用游戏系统生成简短的配置说明。")
            else:
                field_list = list(chapter_data.keys())
                parts.append(f"\n【{label}】字段: {', '.join(field_list)}")
                parts.append("  请为每个字段生成具体、专业的内容。")

        parts.append("\n输出格式：JSON 对象，键为章节名，值为该章节字段字典。")
        parts.append('示例: {"meta": {"game_name": "xxx"}, "vision": {"design_vision": "xxx"}}')
        parts.append("\n只输出 JSON，不要加任何解释。")
        return "\n".join(parts)

    @staticmethod
    def _parse_llm_json(content: str, logger) -> dict:
        """解析 LLM 返回的 JSON（容错处理）"""
        if not content:
            return {}

        text = content.strip()
        # 去掉 markdown 代码块标记
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines)

        # 找 JSON 边界
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            try:
                import re
                text = re.sub(r',\s*}', '}', text)
                text = re.sub(r',\s*]', ']', text)
                return json.loads(text)
            except Exception:
                logger.warning("[CeshuAI] JSON 解析失败")
                return {}


# --- v5.0 风格参数化辅助函数 ---

# 风格关键词 → style 标识符映射
_STYLE_KEYWORDS = {
    "xianxia": ["仙侠", "修真", "渡劫", "元婴", "化神", "灵气", "宗门", "飞升"],
    "wuxia":   ["武侠", "江湖", "门派", "侠客", "武功", "内力"],
    "sci-fi":  ["科幻", "星际", "未来", "机甲", "AI", "赛博", "太空", "外星"],
    "fantasy": ["奇幻", "魔法", "龙", "精灵", "矮人", "地下城", "中世纪"],
    "post_apoc": ["末世", "废土", "丧尸", "核战", "末日", "避难所"],
    "realistic": ["写实", "现实", "现代", "军事", "历史"],
    "anime":   ["二次元", "动漫", "萌系", "治愈"],
    "dark":    ["暗黑", "哥特", "恐怖", "克苏鲁"],
}

# 模块类型关键词 → module_type 标识符映射
_MODULE_KEYWORDS = {
    "rpg":     ["RPG", "角色扮演", "剧情", "升级"],
    "slg":     ["SLG", "策略", "经营", "建设", "模拟"],
    "moba":    ["MOBA", "推塔", "5v5", "对战"],
    "fps":     ["FPS", "射击", "枪战", "第一人称"],
    "card":    ["卡牌", "抽卡", "集换式"],
    "tower_defense": ["塔防", "防守"],
    "roguelike": ["肉鸽", "roguelike", "永久死亡"],
    "casual":  ["休闲", "益智", "消除"],
    "sandbox": ["沙盒", "开放世界", "建造"],
    "fighting": ["格斗", "对战"],
    "rhythm":  ["音游", "节奏"],
    "mmorpg":  ["MMORPG", "大型多人", "网游"],
}


def _infer_style_module(description: str) -> tuple:
    """从用户描述中推断 style 和 module_type

    Returns:
        (style, module_type): 推断失败返回 ("", "")
    """
    if not description:
        return ("", "")

    desc_lower = description.lower()

    # 推断 style
    style = ""
    for s, keywords in _STYLE_KEYWORDS.items():
        if any(kw in description for kw in keywords):
            style = s
            break

    # 推断 module_type
    module_type = ""
    for m, keywords in _MODULE_KEYWORDS.items():
        if any(kw in description or kw.lower() in desc_lower for kw in keywords):
            module_type = m
            break

    return (style, module_type)


# 风格术语表 — 指导 LLM 生成符合风格的内容
_STYLE_GLOSSARIES = {
    "xianxia": (
        "气血=HP, 灵力=MP, 修为=经验, 渡劫=升级关键节点\n"
        "境界划分: 练气→筑基→金丹→元婴→化神→渡劫→大乘→飞升\n"
        "宗门/门派系统, 法宝=装备, 丹药=消耗品, 功法=技能\n"
        "灵石=货币, 天地人=品质分级, 仙魔妖=阵营"
    ),
    "wuxia": (
        "气血=HP, 内力=MP, 经验=阅历\n"
        "境界: 三流→二流→一流→后天→先天→宗师→大成\n"
        "门派/帮派系统, 兵器=装备, 秘籍=技能书\n"
        "银两=货币, 武功=技能, 经脉=属性系统"
    ),
    "sci-fi": (
        "HP=生命值, MP=能量/护盾, 经验=数据/经验值\n"
        "等级=军衔/阶级, 装备=武器/护甲/模块\n"
        "货币=信用点/星币, 阵营=联邦/帝国/自由联盟\n"
        "技能=战术模块, 消耗品=医疗包/能量电池"
    ),
    "fantasy": (
        "HP=生命值, MP=魔法值, 经验=经验值\n"
        "种族: 人类/精灵/矮人/兽人/龙裔\n"
        "职业: 战士/法师/牧师/盗贼/游侠/圣骑士\n"
        "装备=武器/护甲/饰品, 货币=金币/银币/铜币\n"
        "魔法=元素: 火/水/土/风/光/暗"
    ),
    "post_apoc": (
        "HP=生命值, 辐射值=Radiation, 饥饿度/口渴度\n"
        "资源= scrap(废料)/弹药/食物/水/燃料\n"
        "装备=武器/护甲/防毒面具, 阵营=幸存者/掠夺者/军方\n"
        "技能=生存技能, 消耗品=治疗针/抗辐射药"
    ),
    "realistic": (
        "HP=生命值, 体力=Stamina, 经验=经验值\n"
        "装备=武器/护甲/配件, 货币=游戏币/真实货币\n"
        "等级=军衔/段位, 技能=主动/被动技能"
    ),
}


def _get_style_glossary(style: str) -> str:
    """获取指定风格的术语表"""
    if not style:
        return ""
    return _STYLE_GLOSSARIES.get(style, "")
