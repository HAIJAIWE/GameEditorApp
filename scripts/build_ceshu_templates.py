#!/usr/bin/env python3
"""生成策划书模板数据（44 种游戏类型 × 18 章 GDD 结构）

从内置的类型→系统映射表生成 ceshu_templates.json，无需外部数据源。
输出到 src/core/ceshu/data/ceshu_templates.json（纳入版本控制），
供 CeshuTemplate 在干净检出 / CI / 打包环境中使用。

用法:
    python scripts/build_ceshu_templates.py
"""

import json
from pathlib import Path
import sys

# 项目根目录（scripts/ 的上一级）
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "src" / "core" / "ceshu" / "data" / "ceshu_templates.json"

TYPE_SYSTEMS = {
    "RPG角色扮演游戏": ["battle", "character", "skill", "equipment", "item", "quest", "social", "economy", "growth"],
    "MMORPG（大型多人在线）": [
        "battle",
        "character",
        "skill",
        "equipment",
        "item",
        "quest",
        "social",
        "economy",
        "growth",
    ],
    "ARPG动作角色扮演": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "战棋策略游戏（SRPG）": ["battle", "character", "skill", "equipment", "item", "quest"],
    "策略游戏（SLG）": ["battle", "character", "equipment", "item", "quest", "economy", "growth"],
    "RTS即时战略游戏": ["battle", "character", "skill", "equipment", "item", "quest"],
    "回合制策略游戏": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "动作竞技游戏（MOBA/大乱斗）": [
        "battle",
        "character",
        "skill",
        "equipment",
        "social",
        "economy",
        "growth",
        "customization",
    ],
    "FPS射击游戏": ["battle", "character", "skill", "equipment", "item", "quest", "social", "customization"],
    "TPS第三人称射击": ["battle", "character", "skill", "equipment", "item", "quest", "social", "customization"],
    "格斗游戏（FTG）": ["battle", "character", "skill", "equipment", "customization"],
    "大逃杀（Battle Royale）": [
        "battle",
        "character",
        "skill",
        "equipment",
        "item",
        "quest",
        "social",
        "customization",
    ],
    "非对称竞技游戏": ["battle", "character", "skill", "equipment", "social", "customization"],
    "卡牌策略游戏": ["battle", "character", "skill", "item", "quest", "social", "economy", "growth", "customization"],
    "纸牌游戏": ["battle", "character", "skill", "item", "quest", "social", "economy"],
    "棋盘桌游": ["battle", "character", "skill", "item", "quest", "social", "economy", "growth"],
    "自走棋策略游戏": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "塔防（TD）": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "模拟经营游戏": ["character", "item", "quest", "economy", "growth", "customization"],
    "农场模拟游戏": ["character", "item", "quest", "economy", "growth"],
    "城市建造游戏": ["character", "item", "quest", "economy", "growth", "customization"],
    "体育竞技游戏": ["battle", "character", "skill", "equipment", "item", "quest", "social", "customization"],
    "竞速游戏": ["battle", "character", "skill", "equipment", "item", "quest", "social", "customization"],
    "音乐节奏游戏": ["character", "skill", "item", "quest", "customization"],
    "文字冒险视觉小说": ["character", "quest"],
    "恋爱养成游戏": ["character", "item", "quest"],
    "互动电影游戏": ["character", "quest"],
    "放置增量点击类": ["character", "skill", "item", "quest", "economy", "growth"],
    "派对聚会游戏": ["character", "skill", "item", "quest", "social", "customization"],
    "休闲益智游戏": ["character", "skill", "item", "quest"],
    "解谜冒险游戏": ["character", "skill", "item", "quest"],
    "动作冒险游戏": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "平台跳跃游戏": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "银河城类游戏": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "开放世界动作冒险": ["battle", "character", "skill", "equipment", "item", "quest", "social", "economy", "growth"],
    "Roguelike/Roguelite": ["battle", "character", "skill", "equipment", "item", "quest", "growth"],
    "生存建造游戏": ["character", "equipment", "item", "quest", "economy", "growth"],
    "恐怖惊悚游戏": ["battle", "character", "skill", "equipment", "item", "quest"],
    "潜行暗杀游戏": ["battle", "character", "skill", "equipment", "item", "quest"],
    "飞行射击游戏": ["battle", "character", "skill", "equipment", "item", "quest"],
    "弹幕地狱射击": ["battle", "character", "skill", "equipment", "item", "quest"],
    "钓鱼模拟游戏": ["character", "skill", "equipment", "item", "quest", "economy", "growth"],
    "太空探索游戏": ["battle", "character", "skill", "equipment", "item", "quest", "social", "economy", "growth"],
    "战争模拟游戏": ["battle", "character", "skill", "equipment", "item", "quest", "social", "economy", "growth"],
}

CATEGORIES = {
    "RPG角色扮演游戏": "角色扮演",
    "MMORPG（大型多人在线）": "角色扮演",
    "ARPG动作角色扮演": "角色扮演",
    "战棋策略游戏（SRPG）": "策略",
    "策略游戏（SLG）": "策略",
    "RTS即时战略游戏": "策略",
    "回合制策略游戏": "策略",
    "塔防（TD）": "策略",
    "动作竞技游戏（MOBA/大乱斗）": "竞技",
    "非对称竞技游戏": "竞技",
    "FPS射击游戏": "射击",
    "TPS第三人称射击": "射击",
    "大逃杀（Battle Royale）": "射击",
    "飞行射击游戏": "射击",
    "弹幕地狱射击": "射击",
    "格斗游戏（FTG）": "格斗",
    "卡牌策略游戏": "卡牌",
    "纸牌游戏": "卡牌",
    "棋盘桌游": "卡牌",
    "自走棋策略游戏": "卡牌",
    "模拟经营游戏": "模拟",
    "农场模拟游戏": "模拟",
    "城市建造游戏": "模拟",
    "生存建造游戏": "模拟",
    "钓鱼模拟游戏": "模拟",
    "太空探索游戏": "模拟",
    "战争模拟游戏": "模拟",
    "体育竞技游戏": "体育",
    "竞速游戏": "体育",
    "音乐节奏游戏": "音乐",
    "文字冒险视觉小说": "剧情",
    "恋爱养成游戏": "剧情",
    "互动电影游戏": "剧情",
    "恐怖惊悚游戏": "剧情",
    "放置增量点击类": "休闲",
    "派对聚会游戏": "休闲",
    "休闲益智游戏": "休闲",
    "解谜冒险游戏": "休闲",
    "动作冒险游戏": "动作",
    "平台跳跃游戏": "动作",
    "银河城类游戏": "动作",
    "开放世界动作冒险": "动作",
    "Roguelike/Roguelite": "动作",
    "潜行暗杀游戏": "动作",
}

ALL_SYSTEMS = [
    "battle",
    "character",
    "skill",
    "equipment",
    "item",
    "quest",
    "social",
    "economy",
    "growth",
    "customization",
]


def _empty_chapter() -> dict:
    """18 章 GDD 的空章节结构（v5 结构）"""
    return {
        "meta": {
            "game_name": "",
            "game_type": "",
            "platform": [],
            "positioning": "",
            "tags": [],
            "status": "draft",
            "confidentiality": "internal",
        },
        "vision": {
            "design_vision": "",
            "user_personas": {"primary": "", "secondary": "", "potential": ""},
            "competitive_analysis": [],
            "differentiation": "",
            "business_model": "",
        },
        "worldview": {
            "architecture": "",
            "history_eras": [],
            "factions": [],
            "geography": "",
            "main_plot": "",
            "branch_endings": [],
            "character_network": [],
        },
        "gameplay": {
            "core_loop": "",
            "control_scheme": "",
            "first_30_min": "",
            "game_modes": [],
            "win_lose_conditions": "",
            "tutorial_design": "",
        },
        "systems": {},
        "numeric": {
            "core_formulas": "",
            "growth_curves": [],
            "drop_tables": [],
            "economic_model": "",
            "balance_principles": "",
        },
        "art": {
            "art_style": "",
            "character_design": "",
            "environment_design": "",
            "ui_design_language": "",
            "color_system": "",
            "typography": "",
            "vfx": "",
            "animation": "",
            "multi_resolution": "",
        },
        "tech": {
            "engine": "Unity",
            "core_architecture": "",
            "third_party_deps": [],
            "performance_targets": "",
            "milestones": [],
            "team_structure": "",
            "qa_plan": "",
        },
        "resources": {
            "art_assets": [],
            "audio_assets": [],
            "localization": [],
            "outsourcing": [],
            "budget": {},
            "risk_matrix": [],
            "contingency_plan": "",
            "ip": "",
            "appendix": "",
        },
        "market_analysis": {
            "target_market": "",
            "market_size": "",
            "user_demographics": "",
            "competitors": [],
            "market_positioning": "",
            "entry_barriers": "",
            "market_trends": [],
            "kpi_forecast": {},
        },
        "characters": {"protagonist": {}, "npc_list": [], "character_network": []},
        "combat": {
            "combat_mode": "",
            "damage_formula": "",
            "skill_system": "",
            "enemy_design": [],
            "difficulty_curve": "",
            "ai_behavior": "",
        },
        "economy": {
            "currency_types": [],
            "source_sink": "",
            "inflation_control": "",
            "trade_system": "",
            "economy_metrics": {},
        },
        "monetization": {
            "payment_model": "",
            "pricing_tiers": [],
            "iap_design": [],
            "ad_strategy": "",
            "subscription_design": "",
            "season_pass": "",
            "vip_system": "",
            "limited_offers": [],
            "whale_strategy": "",
            "f2p_experience": "",
            "revenue_forecast": {},
            "arpu_target": "",
        },
        "mvp": {
            "mvp_scope": "",
            "mvp_timeline": "",
            "core_features": [],
            "cut_features": [],
            "prototype_features": [],
            "milestones": [],
            "success_criteria": "",
            "team_size": 0,
            "budget_estimate": "",
            "risk_assessment": "",
            "prototype_plan": "",
            "playtest_plan": "",
        },
        "risk_handling": {
            "risk_matrix": [],
            "contingency_plan": "",
            "legal_risks": [],
            "technical_risks": [],
            "market_risks": [],
        },
        "audio": {"music_style": "", "sfx_design": "", "voice_acting": "", "audio_tech": "", "audio_assets": []},
        "accessibility": {
            "color_blind_mode": "",
            "subtitle_settings": "",
            "remap_controls": "",
            "difficulty_options": "",
            "language_list": [],
            "ui_scaling": "",
        },
    }


def _build_template(name: str) -> dict:
    """为一个游戏类型生成 v5 结构模板"""
    enabled = TYPE_SYSTEMS.get(name, ["battle", "character", "skill"])
    systems_dict = {}
    for s in ALL_SYSTEMS:
        systems_dict[s] = {"enabled": s in enabled, "config": {}}

    data = _empty_chapter()
    data["version"] = "5.0"
    data["meta"]["game_type"] = name.split("（")[0]
    data["meta"]["positioning"] = f"{name}类型游戏的基础 GDD 模板"
    data["systems"] = systems_dict
    data["enabled_editors"] = enabled
    data["editor_configs"] = {}

    return {
        "name": name,
        "category": CATEGORIES.get(name, "其他"),
        "data": data,
    }


def main() -> int:
    templates = [_build_template(name) for name in TYPE_SYSTEMS]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(templates, ensure_ascii=False, indent=2), encoding="utf-8")

    cats: dict = {}
    for t in templates:
        cats.setdefault(t["category"], []).append(t["name"])
    print(f"已生成 {len(templates)} 个策划书模板 -> {OUTPUT_PATH}")
    for c, names in cats.items():
        print(f"  {c}: {len(names)} 种 - {', '.join(names[:3])}...")
    print("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
