"""v4 → v5 策划书数据迁移（纯函数模块）。

从旧 9 章 GDD 数据中提取字段填充新的工业级 9 章;缺失字段使用默认值。
由 CeshuModel.from_dict 在检测到 v4.0/缺章时懒加载调用。
"""
from __future__ import annotations

from .ceshu_model import (
    _default_accessibility,
    _default_audio,
    _default_characters,
    _default_combat,
    _default_economy,
    _default_market_analysis,
    _default_monetization,
    _default_mvp,
    _default_risk_handling,
)


def migrate_v4_to_v5(data: dict) -> dict:
    """将 v4.0 (9 章) 数据迁移到 v5.0 (18 章) 结构

    策略：
    - 保留旧 9 章原始数据不变（向后兼容）
    - 从旧章节中提取相关字段填充新 9 章
    - 新章节缺失字段使用默认值
    """
    # 新章节默认值
    data.setdefault("market_analysis", _default_market_analysis())
    data.setdefault("characters", _default_characters())
    data.setdefault("combat", _default_combat())
    data.setdefault("economy", _default_economy())
    data.setdefault("monetization", _default_monetization())
    data.setdefault("mvp", _default_mvp())
    data.setdefault("risk_handling", _default_risk_handling())
    data.setdefault("audio", _default_audio())
    data.setdefault("accessibility", _default_accessibility())

    # 从 vision 派生市场分析相关字段
    vision = data.get("vision", {}) or {}
    if vision.get("competitive_analysis") and not data["market_analysis"].get("competitors"):
        # 把 competitive_analysis (旧字符串列表) 转成新结构
        old_competitors = vision["competitive_analysis"]
        if isinstance(old_competitors, list):
            data["market_analysis"]["competitors"] = [
                {"name": c, "type": "", "strengths": "", "weaknesses": "", "market_share": ""}
                if isinstance(c, str) else c
                for c in old_competitors
            ]
    if vision.get("business_model") and not data["monetization"].get("payment_model"):
        data["monetization"]["payment_model"] = vision["business_model"]

    # 从 worldview.character_network 派生 characters
    worldview = data.get("worldview", {}) or {}
    if worldview.get("character_network") and not data["characters"].get("npc_list"):
        cn = worldview["character_network"]
        if isinstance(cn, list):
            data["characters"]["npc_list"] = cn

    # 从 systems.battle 派生 combat 章节的关键字段
    systems = data.get("systems", {}) or {}
    battle_sys = systems.get("battle", {}) or {}
    battle_cfg = battle_sys.get("config", {}) or {}
    if battle_cfg.get("damage_formula") and not data["combat"].get("damage_formula"):
        data["combat"]["damage_formula"] = battle_cfg["damage_formula"]
    if battle_cfg.get("turn_mode") and not data["combat"].get("combat_mode"):
        data["combat"]["combat_mode"] = battle_cfg["turn_mode"]
    if battle_cfg.get("combat_pace") and not data["combat"].get("combat_pace"):
        data["combat"]["combat_pace"] = battle_cfg["combat_pace"]

    # 从 systems.economy 派生 economy 章节
    eco_sys = systems.get("economy", {}) or {}
    eco_cfg = eco_sys.get("config", {}) or {}
    if eco_cfg.get("currency_types") and not data["economy"].get("currency_types"):
        # 旧字段是字符串，新字段是列表
        ct = eco_cfg["currency_types"]
        if isinstance(ct, str) and ct:
            data["economy"]["currency_types"] = [{"name": c.strip(), "source": "", "sink": "", "exchange_rate": ""}
                                                 for c in ct.split(",") if c.strip()]
        elif isinstance(ct, list):
            data["economy"]["currency_types"] = ct
    if eco_cfg.get("source_mechanisms") and not data["economy"].get("source_sink"):
        data["economy"]["source_sink"] = eco_cfg["source_mechanisms"]
    if eco_cfg.get("inflation_control") and not data["economy"].get("inflation_control"):
        data["economy"]["inflation_control"] = eco_cfg["inflation_control"]

    # 从 systems.economy 派生 monetization 章节
    if eco_cfg.get("payment_system") and not data["monetization"].get("payment_model"):
        data["monetization"]["payment_model"] = eco_cfg["payment_system"]
    if eco_cfg.get("recharge_tiers") and not data["monetization"].get("pricing_tiers"):
        rt = eco_cfg["recharge_tiers"]
        if isinstance(rt, str) and rt:
            data["monetization"]["pricing_tiers"] = [t.strip() for t in rt.split(",") if t.strip()]
        elif isinstance(rt, list):
            data["monetization"]["pricing_tiers"] = rt
    if eco_cfg.get("vip_system") is not None and not data["monetization"].get("vip_system"):
        data["monetization"]["vip_system"] = "启用" if eco_cfg.get("vip_system") else "未启用"
    if eco_cfg.get("season_pass") is not None and not data["monetization"].get("season_pass"):
        data["monetization"]["season_pass"] = "启用" if eco_cfg.get("season_pass") else "未启用"

    # 从 resources 派生 audio / risk_handling 章节
    resources = data.get("resources", {}) or {}
    if resources.get("audio_assets") and not data["audio"].get("sfx_list"):
        aa = resources["audio_assets"]
        if isinstance(aa, list):
            data["audio"]["sfx_list"] = aa
    if resources.get("risk_matrix") and not data["risk_handling"].get("risk_matrix"):
        data["risk_handling"]["risk_matrix"] = resources["risk_matrix"]
    if resources.get("contingency_plan") and not data["risk_handling"].get("contingency_plan"):
        data["risk_handling"]["contingency_plan"] = resources["contingency_plan"]
    if resources.get("localization") and not data["accessibility"].get("language_list"):
        loc = resources["localization"]
        if isinstance(loc, list):
            data["accessibility"]["language_list"] = loc

    # 从 tech.milestones 派生 mvp.milestones
    tech = data.get("tech", {}) or {}
    if tech.get("milestones") and not data["mvp"].get("milestones"):
        data["mvp"]["milestones"] = tech["milestones"]

    # 升级版本号
    data["version"] = "5.0"
    return data
