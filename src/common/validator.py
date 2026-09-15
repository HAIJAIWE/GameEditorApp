"""数据验证工具模块 - 提供游戏数据的验证功能"""
import json
from pathlib import Path
from typing import Any


class DataValidator:
    """数据验证器"""

    @staticmethod
    def validate_skill(skill: dict[str, Any]) -> tuple[bool, list[str]]:
        """
        验证技能数据

        Args:
            skill: 技能数据字典

        Returns:
            (是否有效, 错误列表)
        """
        errors = []

        # 检查必需字段
        required_fields = ['id', 'name', 'type']
        for field in required_fields:
            if field not in skill or not skill[field]:
                errors.append(f"技能缺少必需字段: {field}")

        # 检查数值范围
        if 'value' in skill:
            try:
                val = int(skill['value'])
                if val < 0:
                    errors.append(f"技能数值不能为负数: {val}")
                if val > 99999:
                    errors.append(f"技能数值过大: {val}")
            except (ValueError, TypeError):
                errors.append(f"技能数值无效: {skill['value']}")

        # 检查倍率
        if 'multiplier' in skill:
            try:
                mult = float(skill['multiplier'])
                if mult <= 0:
                    errors.append(f"倍率必须为正数: {mult}")
            except (ValueError, TypeError):
                errors.append(f"倍率无效: {skill['multiplier']}")

        # 检查冷却
        if 'cd' in skill:
            try:
                cd = int(skill['cd'])
                if cd < 0:
                    errors.append(f"冷却时间不能为负数: {cd}")
            except (ValueError, TypeError):
                errors.append(f"冷却时间无效: {skill['cd']}")

        return len(errors) == 0, errors

    @staticmethod
    def validate_role(role: dict[str, Any]) -> tuple[bool, list[str]]:
        """
        验证角色数据

        Args:
            role: 角色数据字典

        Returns:
            (是否有效, 错误列表)
        """
        errors = []

        required_fields = ['id', 'name', 'job', 'hp', 'atk', 'def']
        for field in required_fields:
            if field not in role or not role[field]:
                errors.append(f"角色缺少必需字段: {field}")

        # 检查数值范围
        for attr in ['hp', 'atk', 'def']:
            if attr in role:
                try:
                    val = int(role[attr])
                    if val < 0:
                        errors.append(f"{attr}不能为负数: {val}")
                except (ValueError, TypeError):
                    errors.append(f"{attr}无效: {role[attr]}")

        return len(errors) == 0, errors

    @staticmethod
    def validate_monster(monster: dict[str, Any]) -> tuple[bool, list[str]]:
        """
        验证怪物数据

        Args:
            monster: 怪物数据字典

        Returns:
            (是否有效, 错误列表)
        """
        errors = []

        required_fields = ['id', 'name', 'level', 'type']
        for field in required_fields:
            if field not in monster or not monster[field]:
                errors.append(f"怪物缺少必需字段: {field}")

        if 'level' in monster:
            try:
                level = int(monster['level'])
                if level < 1 or level > 100:
                    errors.append(f"等级范围应为1-100: {level}")
            except (ValueError, TypeError):
                errors.append(f"等级无效: {monster['level']}")

        return len(errors) == 0, errors

    @staticmethod
    def validate_item(item: dict[str, Any]) -> tuple[bool, list[str]]:
        """
        验证道具数据

        Args:
            item: 道具数据字典

        Returns:
            (是否有效, 错误列表)
        """
        errors = []

        required_fields = ['id', 'name', 'type']
        for field in required_fields:
            if field not in item or not item[field]:
                errors.append(f"道具缺少必需字段: {field}")

        return len(errors) == 0, errors

    @staticmethod
    def validate_story(story: dict[str, Any]) -> tuple[bool, list[str]]:
        """
        验证剧情数据

        Args:
            story: 剧情数据字典

        Returns:
            (是否有效, 错误列表)
        """
        errors = []

        required_fields = ['id', 'name', 'type', 'order']
        for field in required_fields:
            if field not in story or not story[field]:
                errors.append(f"剧情缺少必需字段: {field}")

        if 'order' in story:
            try:
                order = int(story['order'])
                if order < 0:
                    errors.append(f"剧情顺序不能为负数: {order}")
            except (ValueError, TypeError):
                errors.append(f"剧情顺序无效: {story['order']}")

        return len(errors) == 0, errors

    @staticmethod
    def validate_data(data: dict[str, Any], data_type: str) -> tuple[bool, list[str]]:
        """
        根据数据类型验证数据

        Args:
            data: 数据字典
            data_type: 数据类型

        Returns:
            (是否有效, 错误列表)
        """
        validators = {
            'skill': DataValidator.validate_skill,
            'role': DataValidator.validate_role,
            'monster': DataValidator.validate_monster,
            'item': DataValidator.validate_item,
            'equip': DataValidator.validate_item,
            'task': DataValidator.validate_item,
            'dialog': DataValidator.validate_item,
            'story': DataValidator.validate_story,
            'achievement': DataValidator.validate_item,
        }

        validator = validators.get(data_type)
        if validator:
            return validator(data)
        return True, []

    @staticmethod
    def validate_all_data(data_dict: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
        """
        验证所有数据

        Args:
            data_dict: 数据字典，键为数据类型复数形式

        Returns:
            验证结果字典
        """
        results: dict[str, list[dict[str, Any]]] = {}

        type_map = {
            'skills': 'skill',
            'roles': 'role',
            'monsters': 'monster',
            'equips': 'equip',
            'items': 'item',
            'tasks': 'task',
            'dialogs': 'dialog',
            'stories': 'story',
            'achievements': 'achievement',
        }

        for data_type_plural, items in data_dict.items():
            data_type = type_map.get(data_type_plural)
            if data_type and items:
                results[data_type_plural] = []
                for item in items:
                    is_valid, errors = DataValidator.validate_data(item, data_type)
                    results[data_type_plural].append({
                        'item': item,
                        'valid': is_valid,
                        'errors': errors
                    })

        return results


def validate_json_file(file_path: Path) -> tuple[bool, str]:
    """
    验证JSON文件是否有效

    Args:
        file_path: 文件路径

    Returns:
        (是否有效, 错误信息)
    """
    try:
        with open(file_path, encoding='utf-8') as f:
            json.load(f)
        return True, ""
    except json.JSONDecodeError as e:
        return False, f"JSON解析错误: {e}"
    except Exception as e:
        return False, f"文件读取错误: {e}"
