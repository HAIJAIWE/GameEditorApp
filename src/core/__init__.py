"""核心业务模块"""
from .attr_system import AttributeDefinition, AttributeSystem, AttrType, CircularDependencyError, Formula
from .buff_system import BuffEffect, BuffSystem, BuffType
from .calc_engine import AttributeCalcEngine
from .data_manager import OptimizedDataManager
from .equipment_system import EquipmentBonus, EquipmentSlot, EquipmentSystem
from .extended_formulas import ExtendedFormula, FormulaConfig, FormulaType
from .game_templates import GameTemplates
from .level_scaling import LevelScalingSystem, ScalingConfig

__all__ = [
    "OptimizedDataManager",
    "AttributeSystem",
    "AttrType",
    "Formula",
    "AttributeDefinition",
    "CircularDependencyError",
    "AttributeCalcEngine",
    "FormulaType",
    "FormulaConfig",
    "ExtendedFormula",
    "GameTemplates",
    "EquipmentSystem",
    "EquipmentBonus",
    "EquipmentSlot",
    "BuffSystem",
    "BuffEffect",
    "BuffType",
    "LevelScalingSystem",
    "ScalingConfig",
]
