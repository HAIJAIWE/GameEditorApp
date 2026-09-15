"""策划书智能体路由 —— 按章节映射到子智能体（自 ceshu_skill.py 拆出，逻辑未改动）"""
from __future__ import annotations


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
