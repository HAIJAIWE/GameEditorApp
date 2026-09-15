"""统计分析模块单元测试"""
import os
import sys
import unittest

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

pytest.importorskip("PyQt6")  # PyQt6 缺失时跳过整个模块

from features.statistics import (
    analyze_balance,
    analyze_character_balance,
    analyze_monster_balance,
    analyze_skill_balance,
    calculate_overall_score,
    generate_issues,
    generate_recommendations,
)


class TestSkillBalance(unittest.TestCase):
    """技能平衡性分析测试"""

    def test_empty_skills(self):
        result = analyze_skill_balance([])
        self.assertEqual(result["status"], "无数据")

    def test_single_skill(self):
        skills = [{"name": "火球术", "value": 100}]
        result = analyze_skill_balance(skills)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["avg_damage"], 100)
        self.assertEqual(result["min_damage"], 100)
        self.assertEqual(result["max_damage"], 100)
        self.assertEqual(len(result["issues"]), 0)
        self.assertTrue(result["is_balanced"])

    def test_balanced_skills(self):
        skills = [
            {"name": "火球术", "value": 100},
            {"name": "冰箭术", "value": 110},
            {"name": "雷电术", "value": 90},
        ]
        result = analyze_skill_balance(skills)
        self.assertEqual(result["count"], 3)
        self.assertEqual(result["avg_damage"], 100)
        self.assertTrue(result["is_balanced"])

    def test_overpowered_skill(self):
        skills = [
            {"name": "火球术", "value": 10},
            {"name": "冰箭术", "value": 10},
            {"name": "天雷斩", "value": 100},
        ]
        result = analyze_skill_balance(skills)
        self.assertFalse(result["is_balanced"])
        self.assertGreater(len(result["issues"]), 0)
        self.assertIn("天雷斩", str(result["issues"]))

    def test_underpowered_skill(self):
        skills = [
            {"name": "火球术", "value": 100},
            {"name": "冰箭术", "value": 100},
            {"name": "雷电术", "value": 100},
            {"name": "弱击A", "value": 5},
            {"name": "弱击B", "value": 5},
            {"name": "弱击C", "value": 5},
        ]
        result = analyze_skill_balance(skills)
        self.assertFalse(result["is_balanced"])

    def test_skill_without_value(self):
        skills = [
            {"name": "被动技能", "type": "被动"},
            {"name": "火球术", "value": 100},
        ]
        result = analyze_skill_balance(skills)
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["avg_damage"], 100)


class TestCharacterBalance(unittest.TestCase):
    """角色平衡性分析测试"""

    def test_empty_characters(self):
        result = analyze_character_balance([])
        self.assertEqual(result["status"], "无数据")

    def test_balanced_characters(self):
        characters = [
            {"name": "战士A", "hp": 1000, "atk": 150},
            {"name": "法师A", "hp": 600, "atk": 200},
            {"name": "刺客A", "hp": 700, "atk": 180},
        ]
        result = analyze_character_balance(characters)
        self.assertTrue(result["is_balanced"])

    def test_overpowered_character(self):
        characters = [
            {"name": "战士A", "hp": 10, "atk": 10},
            {"name": "战士B", "hp": 10, "atk": 10},
            {"name": "Boss", "hp": 100, "atk": 100},
        ]
        result = analyze_character_balance(characters)
        self.assertFalse(result["is_balanced"])
        self.assertGreater(len(result["issues"]), 0)

    def test_character_missing_stats(self):
        characters = [
            {"name": "NPC"},
        ]
        result = analyze_character_balance(characters)
        self.assertEqual(result["avg_hp"], 0)
        self.assertEqual(result["avg_atk"], 0)


class TestMonsterBalance(unittest.TestCase):
    """怪物平衡性分析测试"""

    def test_empty_monsters(self):
        result = analyze_monster_balance([])
        self.assertEqual(result["status"], "无数据")

    def test_single_level_monsters(self):
        monsters = [
            {"name": "哥布林", "level": 1, "hp": 100, "atk": 10},
            {"name": "史莱姆", "level": 1, "hp": 80, "atk": 8},
        ]
        result = analyze_monster_balance(monsters)
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["level_groups"], 1)
        self.assertTrue(result["is_balanced"])

    def test_multi_level_monsters(self):
        monsters = [
            {"name": "哥布林", "level": 1, "hp": 100, "atk": 10},
            {"name": "龙", "level": 10, "hp": 5000, "atk": 500},
        ]
        result = analyze_monster_balance(monsters)
        self.assertEqual(result["level_groups"], 2)
        self.assertTrue(result["is_balanced"])

    def test_overpowered_monster_in_group(self):
        monsters = [
            {"name": "哥布林A", "level": 1, "hp": 10, "atk": 1},
            {"name": "哥布林B", "level": 1, "hp": 10, "atk": 1},
            {"name": "变异哥布林", "level": 1, "hp": 100, "atk": 10},
        ]
        result = analyze_monster_balance(monsters)
        self.assertFalse(result["is_balanced"])
        self.assertGreater(len(result["issues"]), 0)


class TestOverallBalance(unittest.TestCase):
    """综合平衡分析测试"""

    def setUp(self):
        self.sample_data = {
            "skills": [
                {"name": "火球术", "value": 100},
                {"name": "冰箭术", "value": 110},
            ],
            "roles": [
                {"name": "战士", "hp": 1000, "atk": 150},
                {"name": "法师", "hp": 600, "atk": 200},
            ],
            "monsters": [
                {"name": "哥布林", "level": 1, "hp": 100, "atk": 10},
            ],
        }

    def test_analyze_balance_returns_structure(self):
        result = analyze_balance(self.sample_data)
        self.assertIn("skills", result)
        self.assertIn("characters", result)
        self.assertIn("monsters", result)
        self.assertIn("overall", result)
        self.assertIn("score", result["overall"])
        self.assertIsInstance(result["overall"]["score"], int)

    def test_analyze_balance_empty_data(self):
        result = analyze_balance({})
        self.assertEqual(result["overall"]["score"], 50)

    def test_analyze_balance_balanced_data(self):
        balanced_data = {
            "skills": [
                {"name": "火球术", "value": 100},
                {"name": "冰箭术", "value": 105},
            ],
            "roles": [
                {"name": "战士", "hp": 1000, "atk": 150},
                {"name": "法师", "hp": 900, "atk": 160},
            ],
            "monsters": [
                {"name": "哥布林", "level": 1, "hp": 100, "atk": 10},
                {"name": "史莱姆", "level": 1, "hp": 95, "atk": 12},
            ],
        }
        result = analyze_balance(balanced_data)
        self.assertGreaterEqual(result["overall"]["score"], 70)

    def test_calculate_perfect_score(self):
        analysis = {
            "skills": {"is_balanced": True},
            "characters": {"is_balanced": True},
            "monsters": {"is_balanced": True},
        }
        score = calculate_overall_score(analysis)
        self.assertEqual(score, 100)

    def test_calculate_zero_score(self):
        analysis = {
            "skills": {"is_balanced": False, "issues": ["x"] * 10},
            "characters": {"is_balanced": False, "issues": ["x"] * 10},
            "monsters": {"is_balanced": False, "issues": ["x"] * 10},
        }
        score = calculate_overall_score(analysis)
        self.assertEqual(score, 0)


class TestIssuesAndRecommendations(unittest.TestCase):
    """问题清单和优化建议测试"""

    def test_generate_issues_empty(self):
        analysis = {"overall": {"score": 50}}
        issues = generate_issues(analysis)
        self.assertEqual(issues, [])

    def test_generate_issues_with_data(self):
        analysis = {
            "skills": {"issues": ["技能A伤害过高"]},
            "characters": {"issues": ["角色B数值过高"]},
            "monsters": {"issues": ["怪物C HP过高"]},
            "overall": {"score": 50},
        }
        issues = generate_issues(analysis)
        self.assertEqual(len(issues), 3)

    def test_generate_recommendations_low_score(self):
        analysis = {"overall": {"score": 30}}
        recs = generate_recommendations(analysis)
        self.assertIn("严重失衡", recs[0])
        self.assertEqual(len(recs), 3)

    def test_generate_recommendations_high_score(self):
        analysis = {"overall": {"score": 85}}
        recs = generate_recommendations(analysis)
        self.assertGreaterEqual(len(recs), 2)
        self.assertNotIn("严重失衡", recs[0])


if __name__ == "__main__":
    unittest.main()
