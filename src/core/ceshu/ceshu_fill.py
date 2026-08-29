"""策划书必填字段自动填充（纯函数模块）。

将 CeshuModel.auto_fill_required 的逻辑独立成模块级函数 auto_fill_required_fields(model),便于单独测试。
由 CeshuModel.auto_fill_required 懒加载调用。
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .ceshu_model import CeshuModel


def auto_fill_required_fields(model: CeshuModel) -> int:
    """v5.0 优化C: 自动填充所有空必填字段（本地智能占位）

    根据章节上下文生成合理的占位值，避免空白校验失败。
    本方法不调用 LLM，仅用规则推导默认值。

    Returns:
        int: 实际填充的字段数
    """
    filled = 0

    # 各章节必填字段的默认值生成器
    # 策略：基于已有上下文（如 game_name/game_type/style）推导
    game_name = model.meta.get("game_name", "") or "未命名项目"
    game_type = model.meta.get("game_type", "") or "RPG"

    # 第一章 meta
    if not model.meta.get("positioning"):
        model.meta["positioning"] = f"{game_name} - {game_type} 类型项目"
        filled += 1
    if not model.meta.get("tags"):
        model.meta["tags"] = [game_type.lower(), "原创", "策划中"]
        filled += 1

    # 第二章 vision
    if not model.vision.get("design_vision"):
        model.vision["design_vision"] = f"打造一款具有差异化体验的{game_type}游戏，核心乐趣聚焦于玩法深度与长期留存"
        filled += 1
    if not model.vision.get("differentiation"):
        model.vision["differentiation"] = "差异化卖点待细化（建议结合市场分析补充）"
        filled += 1

    # 第三章 worldview
    if not model.worldview.get("architecture"):
        model.worldview["architecture"] = "世界观架构待补充：建议包含时空背景、势力格局、核心冲突"
        filled += 1
    if not model.worldview.get("main_plot"):
        model.worldview["main_plot"] = "主线剧情待补充：建议设定开端-发展-高潮-结局四幕结构"
        filled += 1

    # 第四章 gameplay
    if not model.gameplay.get("core_loop"):
        model.gameplay["core_loop"] = "核心循环待补充：建议定义 玩家行为→反馈→奖励→下一目标 的闭环"
        filled += 1
    if not model.gameplay.get("game_modes"):
        model.gameplay["game_modes"] = ["主线剧情", "自由探索"]
        filled += 1

    # 第六章 numeric
    if not model.numeric.get("core_formulas"):
        model.numeric["core_formulas"] = "核心数值公式待补充：建议包含伤害公式、成长曲线、掉落概率"
        filled += 1
    if not model.numeric.get("balance_principles"):
        model.numeric["balance_principles"] = "平衡原则：早期易上手、中期有深度、后期有目标"
        filled += 1

    # 第七章 art
    if not model.art.get("art_style"):
        model.art["art_style"] = f"{game_type} 通用美术风格"
        filled += 1
    if not model.art.get("color_system"):
        model.art["color_system"] = "主色调 + 辅助色 + 强调色（建议3-5色）"
        filled += 1

    # 第八章 tech
    if not model.tech.get("engine"):
        model.tech["engine"] = "引擎选型待确定（Unity / Unreal / 自研）"
        filled += 1
    if not model.tech.get("milestones"):
        model.tech["milestones"] = ["原型期", "Alpha", "Beta", "上线"]
        filled += 1

    # 第九章 resources
    if not model.resources.get("budget"):
        model.resources["budget"] = {"total": "", "art": "", "dev": "", "marketing": ""}
        filled += 1
    if not model.resources.get("risk_matrix"):
        model.resources["risk_matrix"] = [{"risk": "进度风险", "level": "中", "mitigation": "里程碑管控"}]
        filled += 1

    # 第十章 market_analysis
    if not model.market_analysis.get("target_market"):
        model.market_analysis["target_market"] = "目标市场待补充：建议明确平台、地域、用户画像"
        filled += 1
    if not model.market_analysis.get("competitors"):
        model.market_analysis["competitors"] = [{"name": "待补充竞品", "type": "同类型"}]
        filled += 1

    # 第十一章 characters
    if not model.characters.get("protagonist"):
        model.characters["protagonist"] = "主角设定待补充：背景、性格、外观、能力"
        filled += 1
    if not model.characters.get("main_npc_count"):
        model.characters["main_npc_count"] = 5
        filled += 1

    # 第十二章 combat
    if not model.combat.get("combat_mode"):
        model.combat["combat_mode"] = "回合制" if "RPG" in game_type.upper() else "即时制"
        filled += 1
    if not model.combat.get("damage_formula"):
        model.combat["damage_formula"] = "伤害 = 攻击力 × 技能倍率 - 防御力 × 减伤系数"
        filled += 1

    # 第十三章 economy
    if not model.economy.get("currency_types"):
        model.economy["currency_types"] = [{"name": "金币", "source": "任务/掉落", "sink": "商店购买"}]
        filled += 1
    if not model.economy.get("source_sink"):
        model.economy["source_sink"] = "产出渠道：任务/战斗/活动；回收渠道：商店/强化/抽卡"
        filled += 1

    # 第十四章 monetization
    if not model.monetization.get("payment_model"):
        model.monetization["payment_model"] = "f2p"  # 默认免费+内购
        filled += 1
    if not model.monetization.get("pricing_tiers"):
        model.monetization["pricing_tiers"] = ["月卡 30元", "通行证 68元", "礼包 128元"]
        filled += 1

    # 第十五章 mvp
    if not model.mvp.get("mvp_scope"):
        model.mvp["mvp_scope"] = "MVP 范围待补充：建议包含核心玩法 + 1个完整章节 + 基础UI"
        filled += 1
    if not model.mvp.get("mvp_timeline"):
        model.mvp["mvp_timeline"] = "MVP 时间线待补充：建议 3-6 个月"
        filled += 1

    # 第十六章 risk_handling
    if not model.risk_handling.get("risk_matrix"):
        model.risk_handling["risk_matrix"] = model.resources.get("risk_matrix", [])
        filled += 1
    if not model.risk_handling.get("contingency_plan"):
        model.risk_handling["contingency_plan"] = "应急预案：进度延期→砍次要特性；技术风险→备选方案"
        filled += 1

    # 第十七章 audio
    if not model.audio.get("music_style"):
        model.audio["music_style"] = f"与{model.art.get('art_style', '美术风格')}协调的音乐风格"
        filled += 1
    if not model.audio.get("sfx_count"):
        model.audio["sfx_count"] = 50  # 默认 50 个音效
        filled += 1

    # 第十八章 accessibility
    if not model.accessibility.get("language_list"):
        model.accessibility["language_list"] = ["简体中文"]
        filled += 1
    if not model.accessibility.get("accessibility_features"):
        model.accessibility["accessibility_features"] = ["色盲模式", "字幕", "键位自定义"]
        filled += 1

    return filled
