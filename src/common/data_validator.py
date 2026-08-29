"""数据验证模块 - 验证游戏配置数据的完整性和逻辑一致性"""
import json
from pathlib import Path

from common.logger import get_logger

# 项目根目录（基于本文件位置推导，避免依赖 CWD）
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class ComprehensiveDataValidator:
    """全面数据验证器 - 基于字段配置进行完整性和逻辑一致性验证"""

    def __init__(self, fields_config_path: str = ""):
        if not fields_config_path:
            fields_config_path = str(_PROJECT_ROOT / "data" / "fields_config.json")
        self.fields_config = self._load_fields_config(fields_config_path)
        self.logger = get_logger()

    def _load_fields_config(self, path: str) -> dict[str, list[dict]]:
        """加载字段配置"""
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            get_logger().error(f"加载字段配置失败 ({path}): {e}")
            return {}

    def validate_data(self, data: dict[str, list[dict]]) -> tuple[bool, list[str]]:
        """验证所有数据

        Args:
            data: 要验证的数据字典

        Returns:
            (是否通过验证, 错误消息列表)
        """
        errors = []

        # 验证每个数据类型
        for data_type, items in data.items():
            if not isinstance(items, list):
                errors.append(f"{data_type}: 数据类型错误，应该是数组")
                continue

            # 获取字段配置
            type_key = data_type.rstrip('s')  # skills -> skill
            if type_key not in self.fields_config:
                self.logger.warning(f"未找到 {type_key} 的字段配置，跳过验证")
                continue

            field_config = self.fields_config[type_key]

            # 验证每个数据项
            for idx, item in enumerate(items):
                item_errors = self._validate_item(item, field_config, data_type, idx)
                errors.extend(item_errors)

        # 验证数据唯一性
        uniqueness_errors = self._validate_uniqueness(data)
        errors.extend(uniqueness_errors)

        # 验证逻辑一致性
        logic_errors = self._validate_logic_consistency(data)
        errors.extend(logic_errors)

        return (len(errors) == 0, errors)

    def _validate_item(self, item: dict, field_config: list[dict],
                      data_type: str, idx: int) -> list[str]:
        """验证单个数据项"""
        errors = []

        # 检查必填字段（根据数据类型动态调整）
        required_fields = self._get_required_fields(item, field_config, data_type)
        for field in required_fields:
            if field not in item:
                errors.append(f"{data_type}[{idx}]: 缺少必填字段 '{field}'")

        # 验证字段值类型
        for field in field_config:
            field_name = field['name']
            if field_name not in item:
                continue

            value = item[field_name]
            field_type = field.get('type', '')

            # 验证数值字段
            if field_type == 'spinbox':
                if value != '' and not isinstance(value, (int, float)):
                    errors.append(f"{data_type}[{idx}]: 字段 '{field_name}' 应该是数值类型")

            # 验证枚举字段
            elif field_type == 'combobox':
                valid_values = field.get('values', [])
                if value and value not in valid_values:
                    errors.append(f"{data_type}[{idx}]: 字段 '{field_name}' 值 '{value}' 不在有效值列表中: {valid_values}")

            # 验证文本字段是否包含英文或拼音
            elif field_type in ['entry', 'desc', 'content']:
                if isinstance(value, str) and value:
                    # 检查是否包含英文字母（除了可能的标签分隔符）
                    if field_name not in ['tags', 'image_tags']:
                        # 检查是否包含英文字母或拼音
                        has_english = False
                        for char in value:
                            # 如果字符是英文字母且不是允许的特殊字符
                            if char.isalpha() and ord(char) < 128:  # ASCII字符
                                has_english = True
                                break

                        if has_english:
                            errors.append(f"{data_type}[{idx}]: 字段 '{field_name}' 包含非中文字符: '{value}'")

        return errors

    def _get_required_fields(self, item: dict, field_config: list[dict], data_type: str) -> list[str]:
        """获取必填字段列表（根据数据类型动态调整）"""
        required_fields = [f['name'] for f in field_config if f.get('editable', True)]

        # 特殊处理：技能的damage_type字段
        if data_type == 'skills':
            skill_type = item.get('type', '')
            if skill_type != '攻击':
                # 非攻击类技能不需要damage_type字段
                if 'damage_type' in required_fields:
                    required_fields.remove('damage_type')

        return required_fields

    def _validate_uniqueness(self, data: dict[str, list[dict]]) -> list[str]:
        """验证数据唯一性"""
        errors = []

        for data_type, items in data.items():
            if not isinstance(items, list):
                continue

            # 检查名称唯一性
            names = []
            for idx, item in enumerate(items):
                if 'name' in item and item['name']:
                    if item['name'] in names:
                        errors.append(f"{data_type}: 发现重复名称 '{item['name']}' (索引 {idx})")
                    names.append(item['name'])

            # 检查ID唯一性
            ids = []
            for idx, item in enumerate(items):
                if 'id' in item and item['id']:
                    if item['id'] in ids:
                        errors.append(f"{data_type}: 发现重复ID '{item['id']}' (索引 {idx})")
                    ids.append(item['id'])

        return errors

    def _validate_logic_consistency(self, data: dict[str, list[dict]]) -> list[str]:
        """验证逻辑一致性"""
        errors = []

        # 验证技能数据
        if 'skills' in data:
            for idx, skill in enumerate(data['skills']):
                # 攻击类技能必须有damage_type
                if skill.get('type') == '攻击':
                    if not skill.get('damage_type'):
                        errors.append(f"skills[{idx}]: 攻击类技能 '{skill.get('name')}' 缺少 damage_type 字段")
                # 非攻击类技能不应该有damage_type（或者是空字符串）
                elif skill.get('type') != '攻击':
                    if skill.get('damage_type') and skill.get('damage_type') != '':
                        errors.append(f"skills[{idx}]: 非攻击类技能 '{skill.get('name')}' 不应该有 damage_type 字段")

        # 验证角色数据
        if 'roles' in data:
            for idx, role in enumerate(data['roles']):
                # 数值应该在合理范围内
                if role.get('hp', 0) < 0:
                    errors.append(f"roles[{idx}]: 角色 '{role.get('name')}' 的生命值不能为负数")
                if role.get('mp', 0) < 0:
                    errors.append(f"roles[{idx}]: 角色 '{role.get('name')}' 的法力值不能为负数")
                if role.get('atk', 0) < 0:
                    errors.append(f"roles[{idx}]: 角色 '{role.get('name')}' 的攻击力不能为负数")
                if role.get('def', 0) < 0:
                    errors.append(f"roles[{idx}]: 角色 '{role.get('name')}' 的防御力不能为负数")

        # 验证怪物数据
        if 'monsters' in data:
            for idx, monster in enumerate(data['monsters']):
                if monster.get('level', 0) < 1:
                    errors.append(f"monsters[{idx}]: 怪物 '{monster.get('name')}' 的等级必须大于0")
                if monster.get('hp', 0) <= 0:
                    errors.append(f"monsters[{idx}]: 怪物 '{monster.get('name')}' 的生命值必须大于0")

        return errors

    def generate_validation_report(self, data: dict[str, list[dict]]) -> str:
        """生成验证报告"""
        is_valid, errors = self.validate_data(data)

        if is_valid:
            return "[通过] 数据验证通过！所有数据都符合要求。"

        report = "[失败] 数据验证失败！发现以下问题：\n\n"
        for i, error in enumerate(errors, 1):
            report += f"{i}. {error}\n"

        return report


def validate_default_data() -> bool:
    """验证默认数据文件"""
    try:
        with open("data/default.json", encoding='utf-8') as f:
            data = json.load(f)

        validator = ComprehensiveDataValidator()
        report = validator.generate_validation_report(data)

        print(report)  # noqa: T201 — 脚本输出

        is_valid, errors = validator.validate_data(data)
        return is_valid

    except Exception as e:
        import logging
        logging.getLogger(__name__).error("验证过程出错: %s", e)
        return False


if __name__ == "__main__":
    validate_default_data()
