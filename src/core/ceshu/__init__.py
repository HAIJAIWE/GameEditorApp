"""策划书（Ceshu）核心模块 — 18 章 GDD 数据模型与管理器 (v5.0 工业级)

导出：
  CeshuModel    — 18 章 GDD 数据模型
  CeshuManager  — 策划书 CRUD 管理器
  CeshuTemplate — 模板加载器
  CeshuDataSync — 策划书↔游戏数据双向同步协调器 (v5.0)
  SYSTEM_LABELS / SYSTEM_CONFIG_SCHEMA — 13 游戏系统配置
  SYSTEM_DEPENDENCIES / MODULE_SYSTEM_RECOMMENDATIONS / HYBRID_GAMEPLAY_PRESETS — v5.0 工业级补充
"""
from .ceshu_constants import (
    HYBRID_GAMEPLAY_PRESETS,
    MODULE_SYSTEM_RECOMMENDATIONS,
    SYSTEM_CONFIG_SCHEMA,
    SYSTEM_DEPENDENCIES,
    SYSTEM_LABELS,
    check_system_dependencies,
    find_preset,
    get_preset_by_key,
    get_recommended_systems,
    get_reverse_dependencies,
)
from .ceshu_data_sync import CeshuDataSync
from .ceshu_manager import CeshuManager
from .ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS, CeshuModel
from .ceshu_template import CeshuTemplate

__all__ = [
    "CeshuModel", "CeshuManager", "CeshuTemplate", "CeshuDataSync",
    "CHAPTER_KEYS", "CHAPTER_LABELS",
    "SYSTEM_LABELS", "SYSTEM_CONFIG_SCHEMA",
    "SYSTEM_DEPENDENCIES", "MODULE_SYSTEM_RECOMMENDATIONS", "HYBRID_GAMEPLAY_PRESETS",
    "get_preset_by_key", "find_preset", "get_recommended_systems",
    "check_system_dependencies", "get_reverse_dependencies",
]
