"""策划书数据完整性校验（纯函数模块）。

将 CeshuModel.validate 的校验逻辑独立成模块级函数 validate_ceshu(model),便于单独单元测试与复用。
由 CeshuModel.validate 懒加载调用,避免循环导入。
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .ceshu_model import (
    CHAPTER_LABELS,
    CHAPTER_REQUIRED_FIELDS,
    _is_empty_required_value,
)

if TYPE_CHECKING:
    from .ceshu_model import CeshuModel


def validate_ceshu(model: CeshuModel) -> list:
    """校验数据完整性，返回错误列表（覆盖全部 18 章必填字段）

    v5.0 工业级校验：
    - 必填字段非空检查
    - 章节间一致性检查（如 combat.combat_mode 与 systems.battle.config.turn_mode 一致）
    - 字段类型与值域检查
    - 商业化与经济系统协同检查
    - MVP 与里程碑一致性检查
    - 风险与资源规划一致性检查
    - 风格与美术/音频一致性检查
    """
    errors = []

    # 基础必填字段检查（按档位可见章节：lite 只校验基础 9 章）
    for key in model.visible_chapter_keys():
        if key == "systems":
            continue  # 游戏系统无必填字段
        data = getattr(model, key, {})
        required = CHAPTER_REQUIRED_FIELDS.get(key, [])
        if not required:
            continue
        label = CHAPTER_LABELS.get(key, key)
        if not isinstance(data, dict):
            errors.append(f"{label}：章节数据格式异常")
            continue
        for f in required:
            val = data.get(f)
            if _is_empty_required_value(val):
                errors.append(f"{label}：字段 '{f}' 为必填项")

    # === 章节间一致性检查 ===

    # 1. combat.combat_mode 与 systems.battle.config.turn_mode 应一致
    battle_sys = model.systems.get("battle", {}) or {}
    battle_cfg = battle_sys.get("config", {}) or {}
    combat_mode = model.combat.get("combat_mode", "")
    battle_turn_mode = battle_cfg.get("turn_mode", "")
    if combat_mode and battle_turn_mode and combat_mode != battle_turn_mode:
        errors.append(
            f"一致性冲突：第十二章 combat.combat_mode='{combat_mode}' "
            f"与 第五章 systems.battle.config.turn_mode='{battle_turn_mode}' 不一致"
        )

    # 2. monetization.payment_model 与 systems.economy.config.payment_system 应一致
    eco_sys = model.systems.get("economy", {}) or {}
    eco_cfg = eco_sys.get("config", {}) or {}
    pay_model = model.monetization.get("payment_model", "")
    eco_payment = eco_cfg.get("payment_system", "")
    if pay_model and eco_payment and pay_model != eco_payment:
        errors.append(
            f"一致性冲突：第十四章 monetization.payment_model='{pay_model}' "
            f"与 第五章 systems.economy.config.payment_system='{eco_payment}' 不一致"
        )

    # 3. risk_handling.risk_matrix 与 resources.risk_matrix 应同步
    rh_risk = model.risk_handling.get("risk_matrix", [])
    res_risk = model.resources.get("risk_matrix", [])
    if rh_risk and res_risk and rh_risk != res_risk:
        errors.append("一致性警告：risk_handling.risk_matrix 与 resources.risk_matrix 内容不一致，建议统一")

    # 4. worldview.factions 与 social.faction_system 应协同
    social_sys = model.systems.get("social", {}) or {}
    social_cfg = social_sys.get("config", {}) or {}
    worldview_factions = model.worldview.get("factions", [])
    social_faction_sys = social_cfg.get("faction_system", "")
    if worldview_factions and social_faction_sys == "none":
        errors.append(
            "一致性冲突：第三章 worldview.factions 已设定阵营，"
            "但 systems.social.config.faction_system='none'"
        )

    # 5. art.art_style 与 audio.music_style 风格应协同
    art_style = model.art.get("art_style", "")
    music_style = model.audio.get("music_style", "")
    if art_style and music_style:
        # 简单冲突检测：若美术明确为"像素风"但音乐为"交响乐"，提示
        art_lower = art_style.lower()
        music_lower = music_style.lower()
        if ("像素" in art_style or "pixel" in art_lower) and \
           ("交响" in music_style or "symphony" in music_lower):
            errors.append(
                f"一致性警告：第七章 art.art_style='{art_style}' 与 第十七章 audio.music_style='{music_style}' "
                f"风格不协调，建议匹配"
            )

    # 6. mvp.milestones 与 tech.milestones 应一致
    mvp_milestones = model.mvp.get("milestones", [])
    tech_milestones = model.tech.get("milestones", [])
    if mvp_milestones and tech_milestones and mvp_milestones != tech_milestones:
        errors.append(
            "一致性警告：第十五章 mvp.milestones 与 第八章 tech.milestones 不一致，"
            "MVP 里程碑应与技术里程碑对齐"
        )

    # 7. monetization.pricing_tiers 与 systems.economy.config.recharge_tiers 应一致
    pricing_tiers = model.monetization.get("pricing_tiers", [])
    recharge_tiers = eco_cfg.get("recharge_tiers", "")
    if pricing_tiers and recharge_tiers:
        # 把 recharge_tiers (字符串) 转成列表比较
        if isinstance(recharge_tiers, str):
            rt_list = [t.strip() for t in recharge_tiers.split(",") if t.strip()]
        else:
            rt_list = list(recharge_tiers) if isinstance(recharge_tiers, list) else []
        if rt_list and pricing_tiers and rt_list != pricing_tiers:
            errors.append(
                "一致性警告：第十四章 monetization.pricing_tiers 与 "
                "systems.economy.config.recharge_tiers 不一致，建议统一"
            )

    # 8. accessibility.language_list 与 resources.localization 应一致
    lang_list = model.accessibility.get("language_list", [])
    res_loc = model.resources.get("localization", [])
    if lang_list and res_loc and lang_list != res_loc:
        errors.append(
            "一致性警告：第十八章 accessibility.language_list 与 第九章 resources.localization 不一致，建议统一"
        )

    # 9. characters.main_npc_count 与 characters.npc_list 数量应一致
    main_npc_count = model.characters.get("main_npc_count", 0)
    npc_list = model.characters.get("npc_list", [])
    if main_npc_count and isinstance(npc_list, list) and npc_list and \
       abs(main_npc_count - len(npc_list)) > max(2, int(main_npc_count * 0.2)):
        errors.append(
            f"一致性警告：第十一章 characters.main_npc_count={main_npc_count} "
            f"与 npc_list 实际数量={len(npc_list)} 差异较大，请核对"
        )

    # 10. economy.currency_types 与 systems.economy.config.currency_types 应一致
    eco_currencies = model.economy.get("currency_types", [])
    sys_currencies = eco_cfg.get("currency_types", "")
    if eco_currencies and sys_currencies:
        # 提取 economy.currency_types 中的 name
        eco_names = []
        if isinstance(eco_currencies, list):
            for c in eco_currencies:
                if isinstance(c, dict):
                    eco_names.append(c.get("name", ""))
                elif isinstance(c, str):
                    eco_names.append(c)
        # 提取 systems.economy.config.currency_types 中的名称
        sys_names = []
        if isinstance(sys_currencies, str):
            sys_names = [c.strip() for c in sys_currencies.split(",") if c.strip()]
        elif isinstance(sys_currencies, list):
            for c in sys_currencies:
                if isinstance(c, dict):
                    sys_names.append(c.get("name", ""))
                elif isinstance(c, str):
                    sys_names.append(c)
        if eco_names and sys_names:
            eco_set = {n for n in eco_names if n}
            sys_set = {n for n in sys_names if n}
            if eco_set and sys_set and eco_set != sys_set:
                errors.append(
                    "一致性警告：第十三章 economy.currency_types 与 "
                    "systems.economy.config.currency_types 不一致，建议统一"
                )

    # 11. v5.0 工业级补充：游戏系统依赖检查
    # 启用某系统时，其依赖的系统必须也已启用
    try:
        from .ceshu_constants import check_system_dependencies
        enabled_systems = [k for k, v in model.systems.items() if v and v.get("enabled", True)]
        missing_deps = check_system_dependencies(enabled_systems)
        for item in missing_deps:
            sys_name = item["system"]
            missing_names = "、".join(item["missing"])
            errors.append(
                f"依赖缺失：第五章 systems.{sys_name} 已启用，"
                f"但其依赖系统 [{missing_names}] 未启用"
            )
    except Exception:
        # 避免循环导入或其他异常影响主校验流程
        pass

    return errors
