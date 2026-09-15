"""提示词构建与 LLM 输出解析 —— CeshuSkill 的 CeshuSkillPromptMixin 部分

自 ceshu_skill.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import json

from core.agent.skills.ceshu_skill_state import CeshuSkillState


class CeshuSkillPromptMixin(CeshuSkillState):
    """提示词构建与 LLM 输出解析"""

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
