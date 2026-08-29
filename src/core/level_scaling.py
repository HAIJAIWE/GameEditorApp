"""等级缩放系统 - 支持基于等级的属性自动缩放"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ScalingConfig:
    """等级缩放配置"""
    # 线性缩放: base_value + per_level * (level - 1)
    per_level: float = 0.0

    # 指数缩放: base_value * (1 + growth_rate)^(level - 1)
    growth_rate: float = 0.0

    # 分段缩放: 不同等级区间使用不同缩放
    # [{"min_level": 1, "max_level": 10, "per_level": 5}, ...]
    tiered_scaling: list[dict] = None

    # 上限
    max_value: Optional[float] = None

    def __post_init__(self):
        if self.tiered_scaling is None:
            self.tiered_scaling = []

    def scale_value(self, base_value: float, level: int) -> float:
        """根据等级缩放值"""
        if level <= 1:
            return base_value

        # 优先使用分段缩放
        if self.tiered_scaling:
            for tier in self.tiered_scaling:
                min_level = tier.get("min_level", 1)
                max_level = tier.get("max_level", float("inf"))
                if min_level <= level <= max_level:
                    per_level = tier.get("per_level", 0)
                    growth = per_level * (level - 1)
                    result = base_value + growth
                    if self.max_value is not None:
                        result = min(result, self.max_value)
                    return result

        # 使用指数缩放
        if self.growth_rate != 0:
            result = base_value * (1 + self.growth_rate) ** (level - 1)
            if self.max_value is not None:
                result = min(result, self.max_value)
            return result

        # 使用线性缩放
        if self.per_level != 0:
            result = base_value + self.per_level * (level - 1)
            if self.max_value is not None:
                result = min(result, self.max_value)
            return result

        return base_value


class LevelScalingSystem:
    """等级缩放系统"""

    def __init__(self):
        # 每个属性的缩放配置 {attr_name: ScalingConfig}
        self.scaling_configs: dict[str, ScalingConfig] = {}

    def set_scaling(self, attr_name: str, config: ScalingConfig):
        """设置属性的缩放配置"""
        self.scaling_configs[attr_name] = config

    def remove_scaling(self, attr_name: str):
        """移除属性的缩放配置"""
        self.scaling_configs.pop(attr_name, None)

    def get_scaled_values(self, base_values: dict[str, float], level: int) -> dict[str, float]:
        """获取缩放后的属性值"""
        result = dict(base_values)
        for attr_name, base_value in base_values.items():
            if attr_name in self.scaling_configs:
                config = self.scaling_configs[attr_name]
                result[attr_name] = config.scale_value(base_value, level)
        return result

    def get_scaling_info(self, attr_name: str) -> Optional[dict]:
        """获取属性的缩放信息"""
        if attr_name not in self.scaling_configs:
            return None

        config = self.scaling_configs[attr_name]
        return {
            "per_level": config.per_level,
            "growth_rate": config.growth_rate,
            "tiered_scaling": config.tiered_scaling,
            "max_value": config.max_value,
        }

    def set_default_scaling(self, attr_name: str, per_level: float, max_value: Optional[float] = None):
        """设置默认的线性缩放"""
        self.scaling_configs[attr_name] = ScalingConfig(
            per_level=per_level,
            max_value=max_value,
        )

    def set_exponential_scaling(self, attr_name: str, growth_rate: float, max_value: Optional[float] = None):
        """设置指数缩放"""
        self.scaling_configs[attr_name] = ScalingConfig(
            growth_rate=growth_rate,
            max_value=max_value,
        )

    def set_tiered_scaling(self, attr_name: str, tiers: list[dict], max_value: Optional[float] = None):
        """设置分段缩放"""
        self.scaling_configs[attr_name] = ScalingConfig(
            tiered_scaling=tiers,
            max_value=max_value,
        )
