"""RPG属性系统 - 核心数据模型"""
from common.logger import get_logger

logger = get_logger()

from enum import Enum
from typing import Optional

from common.graph import CircularDependencyError, topological_sort  # noqa: F401  # re-export 供外部导入


class AttrType(Enum):
    """属性类型"""
    BASE = "base"           # 基础属性（直接输入数值）
    DERIVED = "derived"     # 派生属性（通过公式计算）
    COMBAT = "combat"       # 战斗属性（有上限的计算值）


class Formula:
    """属性公式"""

    def __init__(self, coefficients: Optional[dict[str, float]] = None, base_value: float = 0, max_value: Optional[float] = None):
        self.coefficients = coefficients or {}
        self.base_value = base_value
        self.max_value = max_value

    def evaluate(self, context: dict[str, float]) -> float:
        """根据上下文计算值"""
        value = self.base_value
        for attr_name, coeff in self.coefficients.items():
            if coeff != 0:
                value += coeff * context.get(attr_name, 0)

        if self.max_value is not None:
            value = min(value, self.max_value)

        return value

    def to_string(self, attr_name: str = "") -> str:
        """生成可读的公式字符串"""
        terms = []
        for name, coeff in self.coefficients.items():
            if coeff != 0:
                if coeff == int(coeff):
                    coeff_str = str(int(coeff))
                else:
                    coeff_str = str(coeff)
                terms.append(f"{name}*{coeff_str}")

        parts = []
        if self.base_value != 0:
            parts.append(str(self.base_value))
        parts.extend(terms)

        formula = " + ".join(parts) if parts else "0"
        if attr_name:
            return f"{attr_name} = {formula}"
        return f"= {formula}"

    def to_legacy_string(self) -> str:
        """生成旧版兼容的公式字符串（用于保存到JSON）"""
        parts = []
        if self.base_value != 0:
            parts.append(str(self.base_value))
        for name, coeff in self.coefficients.items():
            if coeff != 0:
                if coeff == int(coeff):
                    coeff_str = str(int(coeff))
                else:
                    coeff_str = str(coeff)
                parts.append(f"{name}*{coeff_str}")

        if parts:
            return "= " + " + ".join(parts)
        return "=0"

    @classmethod
    def from_legacy_string(cls, formula_str: str, all_attr_names: list[str]) -> Formula:
        """从旧版公式字符串解析"""
        if not formula_str:
            return cls()

        expr = formula_str.strip()
        if not expr.startswith("="):
            return cls(base_value=float(expr) if expr else 0)

        expr = expr[1:].strip()

        coefficients = {}
        base_value = 0

        # 解析公式中的项
        parts = expr.split("+")
        for part in parts:
            part = part.strip()
            if not part:
                continue

            # 检查是否包含 *
            if "*" in part:
                attr_name, coeff_str = part.split("*", 1)
                attr_name = attr_name.strip()
                try:
                    coeff = float(coeff_str.strip())
                    coefficients[attr_name] = coeff
                except ValueError as e:
                    logger.debug(f"操作失败: {e}")
            else:
                # 常数项
                try:
                    base_value = float(part)
                except ValueError as e:
                    logger.debug(f"操作失败: {e}")

        return cls(coefficients=coefficients, base_value=base_value)


class AttributeDefinition:
    """属性定义"""

    def __init__(self, name: str, attr_type: AttrType, category: str = "", display_name: str = "", min_value: float = 0, max_value: Optional[float] = None, default_value: float = 0):
        self.name = name
        self.attr_type = attr_type
        self.category = category or self._get_default_category(attr_type)
        self.display_name = display_name or name
        self.min_value = min_value
        self.max_value = max_value
        self.default_value = default_value
        self.formula = Formula()

    @staticmethod
    def _get_default_category(attr_type: AttrType) -> str:
        if attr_type == AttrType.BASE:
            return "基础属性"
        elif attr_type == AttrType.DERIVED:
            return "派生属性"
        else:
            return "战斗属性"

    def to_dict(self) -> dict:
        """序列化为字典"""
        return {
            "name": self.name,
            "type": self.attr_type.value,
            "category": self.category,
            "display_name": self.display_name,
            "min_value": self.min_value,
            "max_value": self.max_value,
            "default_value": self.default_value,
            "formula": self.formula.to_legacy_string()
        }

    @classmethod
    def from_dict(cls, data: dict) -> AttributeDefinition:
        """从字典反序列化"""
        attr = cls(
            name=data.get("name", ""),
            attr_type=AttrType(data.get("type", "base")),
            category=data.get("category", ""),
            display_name=data.get("display_name", ""),
            min_value=data.get("min_value", 0),
            max_value=data.get("max_value"),
            default_value=data.get("default_value", 0)
        )
        attr.formula = Formula.from_legacy_string(data.get("formula", ""), [])
        return attr


class AttributeSystem:
    """属性系统数据模型"""

    def __init__(self):
        self.attributes: dict[str, AttributeDefinition] = {}
        self._build_default_system()

    @staticmethod
    def _create_attr(name: str, attr_type: AttrType, category: str, display_name: str = "", min_value: float = 0, max_value: Optional[float] = None, default_value: float = 0) -> AttributeDefinition:
        """创建属性定义的便捷方法"""
        return AttributeDefinition(
            name=name,
            attr_type=attr_type,
            category=category,
            display_name=display_name or name,
            min_value=min_value,
            max_value=max_value,
            default_value=default_value,
        )

    def _build_default_system(self):
        """构建默认属性系统"""
        base_attrs = {
            "力量": {"category": "基础属性", "display_name": "力量", "min_value": 0, "max_value": None, "default_value": 10},
            "智力": {"category": "基础属性", "display_name": "智力", "min_value": 0, "max_value": None, "default_value": 10},
            "敏捷": {"category": "基础属性", "display_name": "敏捷", "min_value": 0, "max_value": None, "default_value": 10},
            "体质": {"category": "基础属性", "display_name": "体质", "min_value": 0, "max_value": None, "default_value": 10},
        }

        for name, config in base_attrs.items():
            attr = AttributeDefinition(
                name=name,
                attr_type=AttrType.BASE,
                **config
            )
            self.attributes[name] = attr

        derived_attrs = {
            "HP": {
                "category": "派生属性",
                "formula": Formula(coefficients={"力量": 10, "体质": 20, "敏捷": 5}, base_value=0)
            },
            "MP": {
                "category": "派生属性",
                "formula": Formula(coefficients={"智力": 15, "体质": 5}, base_value=0)
            },
            "物攻": {
                "category": "派生属性",
                "formula": Formula(coefficients={"力量": 2, "敏捷": 1}, base_value=0)
            },
            "物防": {
                "category": "派生属性",
                "formula": Formula(coefficients={"力量": 0.5, "敏捷": 0.5, "体质": 2}, base_value=0)
            },
            "魔攻": {
                "category": "派生属性",
                "formula": Formula(coefficients={"智力": 3}, base_value=0)
            },
            "魔防": {
                "category": "派生属性",
                "formula": Formula(coefficients={"智力": 1, "体质": 1}, base_value=0)
            },
            "速度": {
                "category": "派生属性",
                "formula": Formula(coefficients={"敏捷": 2}, base_value=0)
            },
        }

        for name, config in derived_attrs.items():
            attr = AttributeDefinition(
                name=name,
                attr_type=AttrType.DERIVED,
                category=config["category"]
            )
            attr.formula = config["formula"]
            self.attributes[name] = attr

        combat_attrs = {
            "暴击率": {
                "category": "战斗属性",
                "formula": Formula(coefficients={"敏捷": 0.4}, base_value=5, max_value=100)
            },
            "暴击伤害": {
                "category": "战斗属性",
                "formula": Formula(coefficients={"敏捷": 0.5}, base_value=150, max_value=999)
            },
            "命中率": {
                "category": "战斗属性",
                "formula": Formula(coefficients={"敏捷": 0.3}, base_value=85, max_value=100)
            },
            "闪避率": {
                "category": "战斗属性",
                "formula": Formula(coefficients={"敏捷": 0.4}, base_value=5, max_value=100)
            },
            "回血/回合": {
                "category": "战斗属性",
                "formula": Formula(coefficients={"体质": 1}, base_value=0)
            },
            "回蓝/回合": {
                "category": "战斗属性",
                "formula": Formula(coefficients={"智力": 0.5}, base_value=0)
            },
        }

        for name, config in combat_attrs.items():
            attr = AttributeDefinition(
                name=name,
                attr_type=AttrType.COMBAT,
                category=config["category"]
            )
            attr.formula = config["formula"]
            self.attributes[name] = attr

    @property
    def base_attributes(self) -> list[str]:
        """所有基础属性名称"""
        return [name for name, attr in self.attributes.items() if attr.attr_type == AttrType.BASE]

    @property
    def derived_attributes(self) -> list[str]:
        """所有派生属性名称"""
        return [name for name, attr in self.attributes.items() if attr.attr_type == AttrType.DERIVED]

    @property
    def combat_attributes(self) -> list[str]:
        """所有战斗属性名称"""
        return [name for name, attr in self.attributes.items() if attr.attr_type == AttrType.COMBAT]

    def get_dependencies(self, attr_name: str) -> list[str]:
        """获取某个属性依赖的所有其他属性"""
        attr = self.attributes.get(attr_name)
        if not attr:
            return []
        return list(attr.formula.coefficients.keys())

    def calculate(self, attr_name: str, context: dict[str, float]) -> float:
        """计算单个属性的值"""
        attr = self.attributes.get(attr_name)
        if not attr:
            return 0

        if attr.attr_type == AttrType.BASE:
            return context.get(attr_name, attr.default_value)

        return attr.formula.evaluate(context)

    def calculate_all(self, base_values: dict[str, float]) -> dict[str, float]:
        """计算所有派生属性（使用拓扑排序）"""
        results = dict(base_values)

        # 拓扑排序
        sorted_attrs = self._topological_sort()

        for attr_name in sorted_attrs:
            if attr_name in base_values:
                continue

            attr = self.attributes.get(attr_name)
            if not attr:
                continue

            value = self.calculate(attr_name, results)

            # 应用min/max约束
            if attr.min_value is not None:
                value = max(value, attr.min_value)
            if attr.max_value is not None:
                value = min(value, attr.max_value)

            results[attr_name] = value

        return results

    def _topological_sort(self) -> list[str]:
        """拓扑排序，确保计算顺序正确"""
        graph = {}
        for name in self.attributes:
            graph[name] = self.get_dependencies(name)
        return topological_sort(graph)

    def add_attribute(self, name: str, attr_type: AttrType, category: str = "", display_name: str = "") -> AttributeDefinition:
        """添加新属性"""
        if name in self.attributes:
            raise ValueError(f"属性'{name}'已存在")

        attr = AttributeDefinition(
            name=name,
            attr_type=attr_type,
            category=category,
            display_name=display_name or name
        )
        self.attributes[name] = attr
        return attr

    def remove_attribute(self, name: str) -> bool:
        """删除属性"""
        if name not in self.attributes:
            return False

        # 检查是否有其他属性依赖此属性
        for other_name, other_attr in self.attributes.items():
            if other_name == name:
                continue
            if name in other_attr.formula.coefficients:
                raise ValueError(f"无法删除'{name}'：属性'{other_name}'依赖于它")

        del self.attributes[name]
        return True

    def rename_attribute(self, old_name: str, new_name: str) -> bool:
        """重命名属性"""
        if old_name not in self.attributes:
            return False
        if new_name in self.attributes:
            raise ValueError(f"属性'{new_name}'已存在")

        # 更新属性定义
        attr = self.attributes.pop(old_name)
        attr.name = new_name
        self.attributes[new_name] = attr

        # 更新其他属性的公式引用
        for other_attr in self.attributes.values():
            if old_name in other_attr.formula.coefficients:
                other_attr.formula.coefficients[new_name] = other_attr.formula.coefficients.pop(old_name)

        return True

    def update_formula(self, attr_name: str, formula: Formula) -> bool:
        """更新属性公式"""
        if attr_name not in self.attributes:
            return False

        attr = self.attributes[attr_name]
        attr.formula = formula
        return True

    def to_dict(self) -> dict:
        """序列化为字典"""
        return {
            name: attr.to_dict()
            for name, attr in self.attributes.items()
        }

    @classmethod
    def from_dict(cls, data: dict) -> AttributeSystem:
        """从字典反序列化"""
        system = cls()
        system.attributes = {}
        for name, attr_data in data.items():
            system.attributes[name] = AttributeDefinition.from_dict(attr_data)
        return system

    def to_json_file(self, path: str) -> None:
        """保存到JSON文件"""
        import json
        from pathlib import Path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def from_json_file(cls, path: str) -> AttributeSystem:
        """从JSON文件加载"""
        import json
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        return cls.from_dict(data)
