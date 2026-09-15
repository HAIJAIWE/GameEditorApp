"""AI 生成（数据/字段/整章/全文与描述分析） —— CeshuSkill 的 CeshuSkillGenerateMixin 部分

自 ceshu_skill.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

from core.agent.skills.ceshu_agent_router import AgentRouter
from core.agent.skills.ceshu_skill_state import CeshuSkillState
from core.agent.skills.ceshu_style_helpers import _get_style_glossary, _infer_style_module


class CeshuSkillGenerateMixin(CeshuSkillState):
    """AI 生成（数据/字段/整章/全文与描述分析）"""

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
