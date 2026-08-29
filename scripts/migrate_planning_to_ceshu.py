#!/usr/bin/env python3
"""数据迁移脚本：planning_docs_v3.json → ceshu/{ceshu_id}.json

将旧版策划方案数据迁移为九章 GDD 结构。
用法: python scripts/migrate_planning_to_ceshu.py [library_name]

如果不指定 library_name，迁移所有库。
"""
from __future__ import annotations
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path


def migrate_planning_to_ceshu(planning_file: Path, ceshu_dir: Path) -> dict:
    """单个 planning_docs_v3.json → 多个 ceshu/{id}.json"""
    if not planning_file.exists():
        return {"success": False, "error": f"源文件不存在: {planning_file}"}

    with open(planning_file, "r", encoding="utf-8") as f:
        old_docs = json.load(f)

    if not isinstance(old_docs, list):
        # 兼容单对象格式
        old_docs = [old_docs]

    ceshu_dir.mkdir(parents=True, exist_ok=True)
    created = []
    skipped = []

    for doc in old_docs:
        if not isinstance(doc, dict):
            continue
        old_id = doc.get("id", str(uuid.uuid4())[:8])
        # 移植旧数据到九章结构
        new_doc = {
            "version": "4.0",
            "ceshu_id": old_id.replace("planning_", "ceshu_") if old_id.startswith("planning_") else f"ceshu_{old_id}",
            "created_at": doc.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
            "updated_at": doc.get("updated_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
            "meta": {
                "game_name": doc.get("name", "未命名") if "name" in doc else doc.get("game_concept", "")[:40],
                "game_type": _detect_game_type(doc),
                "platform": [],
                "positioning": "",
                "tags": [],
                "version": "0.1.0",
                "date": doc.get("created_at", "")[:10],
                "confidentiality": "internal",
                "status": "draft",
            },
            "vision": {
                "design_vision": (doc.get("game_concept", "") or "")[:500],
                "user_personas": {"primary": "", "secondary": "", "potential": ""},
                "competitive_analysis": [],
                "differentiation": "",
                "business_model": "",
            },
            "worldview": {
                "architecture": (doc.get("worldview", "") or "")[:500],
                "history_eras": [],
                "factions": [],
                "geography": "",
                "main_plot": (doc.get("story", "") or "")[:500],
                "branch_endings": [],
                "character_network": [],
            },
            "gameplay": {
                "core_loop": (doc.get("gameplay", "") or "")[:500],
                "control_scheme": "",
                "first_30_min": "",
                "game_modes": [],
                "win_lose_conditions": "",
                "tutorial_design": "",
            },
            "systems": _migrate_systems(doc),
            "numeric": {
                "core_formulas": _extract_formulas(doc),
                "growth_curves": [],
                "drop_tables": [],
                "economic_model": "",
                "balance_principles": _extract_balance(doc),
            },
            "art": {
                "art_style": (doc.get("art_style", "") or "")[:500],
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
                "milestones": _extract_milestones(doc),
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
                "appendix": _extract_appendix(doc),
            },
            "enabled_editors": [],
            "editor_configs": {},
        }

        ceshu_id = new_doc["ceshu_id"]
        new_path = ceshu_dir / f"{ceshu_id}.json"
        with open(new_path, "w", encoding="utf-8") as f:
            json.dump(new_doc, f, ensure_ascii=False, indent=2)
        created.append(str(new_path))

    return {
        "success": True,
        "created": len(created),
        "skipped": len(skipped),
        "files": created,
    }


def _detect_game_type(doc: dict) -> str:
    """从旧文档内容推断游戏类型"""
    text = json.dumps(doc, ensure_ascii=False).lower()
    type_keywords = [
        ("mmorpg", "MMORPG"), ("arpg", "ARPG"), ("rpg", "RPG"),
        ("moba", "MOBA"), ("fps", "FPS"), ("tps", "TPS"),
        ("slg", "SLG"), ("rts", "RTS"),
        ("卡牌", "卡牌"), ("塔防", "塔防"),
        ("模拟经营", "模拟经营"), ("农场", "农场模拟"), ("城市建造", "城市建造"),
        ("格斗", "格斗"), ("大逃杀", "大逃杀"),
        ("休闲", "休闲益智"), ("解谜", "解谜冒险"),
        ("战棋", "战棋"), ("回合制", "回合制策略"),
        ("开放世界", "开放世界"), ("roguelike", "Roguelike"),
        ("视觉小说", "视觉小说"), ("放置", "放置"),
    ]
    for kw, label in type_keywords:
        if kw in text:
            return label
    return doc.get("detected_type", "通用")


def _migrate_systems(doc: dict) -> dict:
    """从旧数据推断子系统配置"""
    systems = {
        "battle": {"enabled": False, "config": {}},
        "character": {"enabled": False, "config": {}},
        "skill": {"enabled": False, "config": {}},
        "equipment": {"enabled": False, "config": {}},
        "item": {"enabled": False, "config": {}},
        "quest": {"enabled": False, "config": {}},
        "social": {"enabled": False, "config": {}},
        "economy": {"enabled": False, "config": {}},
        "growth": {"enabled": False, "config": {}},
        "customization": {"enabled": False, "config": {}},
    }
    text = json.dumps(doc, ensure_ascii=False)
    triggers = {
        "battle": ["战斗", "伤害", "攻击", "技能", "元素", "克制", "回合制", "连携"],
        "character": ["角色", "属性", "职业", "等级", "成长"],
        "skill": ["技能", "法术", "魔法", "能力"],
        "equipment": ["装备", "武器", "防具", "饰品", "强化", "附魔", "镶嵌"],
        "item": ["道具", "物品", "消耗品", "材料", "资源", "收集"],
        "quest": ["任务", "关卡", "章节", "成就"],
        "social": ["社交", "好友", "公会", "组队", "交易"],
        "economy": ["经济", "货币", "金币", "商城", "交易行", "代币"],
        "growth": ["养成", "成长", "天赋", "科技", "升级", "进化"],
        "customization": ["皮肤", "个性化", "卡背", "装扮", "棋盘皮肤"],
    }
    for key, keywords in triggers.items():
        if any(kw in text for kw in keywords):
            systems[key]["enabled"] = True
    return systems


def _extract_formulas(doc: dict) -> str:
    """提取数值公式"""
    numeric = doc.get("numeric", {})
    if isinstance(numeric, dict):
        return numeric.get("formula", "")
    return ""


def _extract_balance(doc: dict) -> str:
    """提取平衡原则"""
    numeric = doc.get("numeric", {})
    if isinstance(numeric, dict):
        return numeric.get("base_stats", "")
    return ""


def _extract_milestones(doc: dict) -> list:
    """从 notes 中提取开发阶段"""
    notes = doc.get("notes", "")
    if not notes:
        return []
    milestones = []
    for line in notes.split("\n"):
        if "阶段" in line or "Phase" in line or "月)" in line:
            milestones.append({"phase": line.strip()[:100]})
    return milestones[:5]  # 最多5个阶段


def _extract_appendix(doc: dict) -> str:
    """将无法映射的字段放入附录"""
    unmapped = {}
    skip_keys = {"id", "name", "game_concept", "worldview", "gameplay", "systems",
                 "story", "art_style", "created_at", "updated_at", "versions",
                 "detected_type", "notes", "numeric"}
    for k, v in doc.items():
        if k not in skip_keys and v:
            unmapped[k] = str(v)[:200]
    if unmapped:
        return json.dumps(unmapped, ensure_ascii=False, indent=2)
    return ""


def main():
    base = Path(__file__).resolve().parent.parent / "data" / "libraries"
    if not base.exists():
        print(f"库目录不存在: {base}")
        return

    import sys
    libs_to_migrate = sys.argv[1:] if len(sys.argv) > 1 else [d.name for d in base.iterdir() if d.is_dir()]

    for lib_name in libs_to_migrate:
        lib_dir = base / lib_name
        planning_file = lib_dir / "planning" / "planning_docs_v3.json"
        ceshu_dir = lib_dir / "ceshu"

        if not planning_file.exists():
            print(f"[跳过] {lib_name}: 无 planning_docs_v3.json")
            continue

        # 备份旧文件
        backup = planning_file.with_suffix(".json.bak")
        shutil.copy2(planning_file, backup)
        print(f"[备份] {planning_file} → {backup}")

        # 执行迁移
        result = migrate_planning_to_ceshu(planning_file, ceshu_dir)
        if result["success"]:
            print(f"[迁移] {lib_name}: 创建 {result['created']} 个策划书文件")
            for f in result["files"]:
                print(f"  - {f}")
            # 删除旧文件
            planning_file.unlink()
            print(f"[删除] {planning_file}")
        else:
            print(f"[失败] {lib_name}: {result.get('error')}")


if __name__ == "__main__":
    main()
