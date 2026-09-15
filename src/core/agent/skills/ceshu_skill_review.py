"""AI 审阅、系统推荐与结果组装 —— CeshuSkill 的 CeshuSkillReviewMixin 部分

自 ceshu_skill.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

from core.agent.skills.ceshu_skill_state import CeshuSkillState


class CeshuSkillReviewMixin(CeshuSkillState):
    """AI 审阅、系统推荐与结果组装"""

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
