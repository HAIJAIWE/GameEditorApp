"""数据统计和分析功能模块"""
from typing import Any

from PyQt6.QtCore import Qt

from common.logger import get_logger


def analyze_balance(data: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """
    AI平衡性分析

    Args:
        data: 完整的游戏数据

    Returns:
        平衡性分析结果
    """
    logger = get_logger()
    analysis: dict[str, Any] = {
        "skills": {},
        "characters": {},
        "monsters": {},
        "overall": {
            "score": 0,
            "issues": [],
            "recommendations": []
        }
    }

    try:
        skills = data.get("skills", [])
        if skills:
            analysis["skills"] = analyze_skill_balance(skills)

        characters = data.get("roles", [])
        if characters:
            analysis["characters"] = analyze_character_balance(characters)

        monsters = data.get("monsters", [])
        if monsters:
            analysis["monsters"] = analyze_monster_balance(monsters)

        overall_score = calculate_overall_score(analysis)
        analysis["overall"]["score"] = overall_score
        analysis["overall"]["issues"] = generate_issues(analysis)
        analysis["overall"]["recommendations"] = generate_recommendations(analysis)

        logger.info("平衡性分析完成")
    except Exception as e:
        logger.error(f"平衡性分析出错: {e}", exc_info=True)
        analysis["overall"]["issues"].append(f"分析出错: {e}")

    return analysis


def analyze_skill_balance(skills: list[dict[str, Any]]) -> dict[str, Any]:
    """
    分析技能平衡性

    Args:
        skills: 技能数据列表

    Returns:
        技能分析结果
    """
    if not skills:
        return {"status": "无数据"}

    damage_values = [s.get("value", 0) for s in skills if s.get("value") is not None]

    avg_damage = sum(damage_values) / len(damage_values) if damage_values else 0
    min_damage = min(damage_values) if damage_values else 0
    max_damage = max(damage_values) if damage_values else 0

    # 找出不平衡的技能
    issues = []
    for skill in skills:
        damage = skill.get("value", 0)
        if damage > avg_damage * 2:
            issues.append(f"技能「{skill.get('name')}」伤害过高: {damage}")
        elif damage < avg_damage * 0.5 and damage > 0:
            issues.append(f"技能「{skill.get('name')}」伤害过低: {damage}")

    return {
        "count": len(skills),
        "avg_damage": round(avg_damage, 2),
        "min_damage": min_damage,
        "max_damage": max_damage,
        "issues": issues,
        "is_balanced": len(issues) <= 2
    }


def analyze_character_balance(characters: list[dict[str, Any]]) -> dict[str, Any]:
    """
    分析角色平衡性

    Args:
        characters: 角色数据列表

    Returns:
        角色分析结果
    """
    if not characters:
        return {"status": "无数据"}

    hp_values = [c.get("hp", 0) for c in characters if c.get("hp") is not None]
    atk_values = [c.get("atk", 0) for c in characters if c.get("atk") is not None]

    avg_hp = sum(hp_values) / len(hp_values) if hp_values else 0
    avg_atk = sum(atk_values) / len(atk_values) if atk_values else 0

    issues = []
    for char in characters:
        hp = char.get("hp", 0)
        atk = char.get("atk", 0)
        hp_ratio = hp / avg_hp if avg_hp > 0 else 0
        atk_ratio = atk / avg_atk if avg_atk > 0 else 0

        if hp_ratio > 2 or atk_ratio > 2:
            issues.append(f"角色「{char.get('name')}」数值过高: HP={hp}, ATK={atk}")
        elif (hp_ratio < 0.5 or atk_ratio < 0.5) and (hp > 0 or atk > 0):
            issues.append(f"角色「{char.get('name')}」数值过低: HP={hp}, ATK={atk}")

    return {
        "count": len(characters),
        "avg_hp": round(avg_hp, 2),
        "avg_atk": round(avg_atk, 2),
        "issues": issues,
        "is_balanced": len(issues) <= 2
    }


def analyze_monster_balance(monsters: list[dict[str, Any]]) -> dict[str, Any]:
    """
    分析怪物平衡性

    Args:
        monsters: 怪物数据列表

    Returns:
        怪物分析结果
    """
    if not monsters:
        return {"status": "无数据"}

    # 按等级分组
    level_groups: dict[int, list[dict[str, Any]]] = {}
    for monster in monsters:
        level = monster.get("level", 1)
        if level not in level_groups:
            level_groups[level] = []
        level_groups[level].append(monster)

    issues = []
    for level, m_list in level_groups.items():
        if len(m_list) > 0:
            avg_hp = sum(m.get("hp", 0) for m in m_list) / len(m_list)

            for m in m_list:
                hp_ratio = m.get("hp", 0) / avg_hp if avg_hp > 0 else 0
                if hp_ratio > 2:
                    issues.append(f"{level}级怪物「{m.get('name')}」HP过高: {m.get('hp')}")
                elif hp_ratio < 0.5 and m.get("hp", 0) > 0:
                    issues.append(f"{level}级怪物「{m.get('name')}」HP过低: {m.get('hp')}")

    return {
        "count": len(monsters),
        "level_groups": len(level_groups),
        "issues": issues,
        "is_balanced": len(issues) <= 2
    }


def calculate_overall_score(analysis: dict[str, Any]) -> int:
    """
    计算总体平衡分数（0-100）

    Args:
        analysis: 分析结果

    Returns:
        平衡分数
    """
    score = 0
    max_score = 0

    # 技能平衡
    if "skills" in analysis and "is_balanced" in analysis["skills"]:
        max_score += 30
        if analysis["skills"]["is_balanced"]:
            score += 30
        else:
            score += max(0, 30 - len(analysis["skills"].get("issues", [])) * 5)

    # 角色平衡
    if "characters" in analysis and "is_balanced" in analysis["characters"]:
        max_score += 30
        if analysis["characters"]["is_balanced"]:
            score += 30
        else:
            score += max(0, 30 - len(analysis["characters"].get("issues", [])) * 5)

    # 怪物平衡
    if "monsters" in analysis and "is_balanced" in analysis["monsters"]:
        max_score += 40
        if analysis["monsters"]["is_balanced"]:
            score += 40
        else:
            score += max(0, 40 - len(analysis["monsters"].get("issues", [])) * 5)

    # 归一化到100分
    if max_score > 0:
        return int(score * 100 / max_score)
    return 50


def generate_issues(analysis: dict[str, Any]) -> list[str]:
    """生成问题清单"""
    all_issues = []

    if "skills" in analysis:
        all_issues.extend(analysis["skills"].get("issues", []))
    if "characters" in analysis:
        all_issues.extend(analysis["characters"].get("issues", []))
    if "monsters" in analysis:
        all_issues.extend(analysis["monsters"].get("issues", []))

    return all_issues


def generate_recommendations(analysis: dict[str, Any]) -> list[str]:
    """生成优化建议"""
    recommendations = []
    score = analysis["overall"]["score"]

    if score < 60:
        recommendations.append("严重失衡：需要立即调整主要参数")
    elif score < 80:
        recommendations.append("轻微失衡：建议优化部分参数")

    if len(generate_issues(analysis)) > 5:
        recommendations.append("问题较多：建议进行全面数值复审")

    recommendations.append("建议进行实际战斗测试验证数值平衡")
    recommendations.append("考虑添加装备/技能组合影响的平衡测试")

    return recommendations


def show_game_data_statistics(main_window) -> None:
    """显示游戏数据统计

    Args:
        main_window: 主窗口实例
    """
    from ui.dialogs import StatisticsDialog
    dialog = StatisticsDialog(main_window, main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_balance_analysis(main_window) -> None:
    """显示平衡性分析

    Args:
        main_window: 主窗口实例
    """
    from ui.dialogs import BalanceAnalysisDialog
    dialog = BalanceAnalysisDialog(main_window, main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()
