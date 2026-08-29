"""N14: 字段级依赖关系图 — 跨章节字段依赖可视化与校验

与 SYSTEM_DEPENDENCIES（系统级依赖）不同，本模块描述**字段级**依赖：
例如 combat.combat_mode 依赖 systems.battle.config.turn_mode。

依赖类型:
- "consistency"（一致性）: 两个字段值应保持一致
- "derived"（派生）: 一个字段值应由另一个派生
- "reference"（引用）: 一个字段引用另一个字段的内容

设计目标:
- 纯 Python（不依赖 PyQt6），方便单元测试与 AI 调用
- 提供 18 章节字段依赖表、按章节/字段查询、违规检查、邻接表构建
- 供 ui.ceshu.field_dependency_graph 渲染可视化图形
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# === 依赖类型常量 ===
DEP_TYPE_CONSISTENCY = "consistency"
DEP_TYPE_DERIVED = "derived"
DEP_TYPE_REFERENCE = "reference"

# === 检查状态 ===
STATUS_OK = "ok"
STATUS_VIOLATION = "violation"
STATUS_WARNING = "warning"


@dataclass
class FieldDependency:
    """字段级依赖关系定义。

    Attributes:
        source_chapter: 源章节 key（如 "combat"）
        source_field: 源字段路径（如 "combat_mode"）
        target_chapter: 目标章节 key（如 "systems"）
        target_field: 目标字段路径（如 "battle.config.turn_mode"）
        dependency_type: 依赖类型 consistency / derived / reference
        description: 依赖描述（中文，供 UI 显示）
        check_rule: 自动检查规则名（None 表示不自动检查）
    """
    source_chapter: str
    source_field: str
    target_chapter: str
    target_field: str
    dependency_type: str
    description: str
    check_rule: str | None = None


# === 字段依赖关系表（>= 15 条，覆盖 18 章主要跨章节字段依赖） ===
FIELD_DEPENDENCIES: list[FieldDependency] = [
    # 一致性依赖（consistency）
    FieldDependency("combat", "combat_mode", "systems", "battle.config.turn_mode",
                    DEP_TYPE_CONSISTENCY, "战斗模式与系统回合制设置应一致",
                    "check_combat_turn_consistency"),
    FieldDependency("monetization", "payment_model", "systems", "economy.config.payment_system",
                    DEP_TYPE_CONSISTENCY, "付费模式与经济系统应一致",
                    "check_payment_consistency"),
    FieldDependency("monetization", "pricing_tiers", "systems", "economy.config.recharge_tiers",
                    DEP_TYPE_CONSISTENCY, "定价档位与充值档位应一致",
                    "check_pricing_tiers_consistency"),
    FieldDependency("economy", "currency_types", "systems", "economy.config.currency_types",
                    DEP_TYPE_CONSISTENCY, "经济货币类型与系统配置应一致",
                    "check_currency_types_consistency"),
    FieldDependency("risk_handling", "risk_matrix", "resources", "risk_matrix",
                    DEP_TYPE_CONSISTENCY, "风险矩阵与资源规划应同步",
                    "check_risk_matrix_consistency"),
    FieldDependency("mvp", "milestones", "tech", "milestones",
                    DEP_TYPE_CONSISTENCY, "MVP 里程碑应与技术里程碑对齐",
                    "check_mvp_milestones_consistency"),
    FieldDependency("accessibility", "language_list", "resources", "localization",
                    DEP_TYPE_CONSISTENCY, "可访问性语言列表与资源本地化应一致",
                    "check_language_list_consistency"),
    FieldDependency("worldview", "factions", "systems", "social.config.faction_system",
                    DEP_TYPE_CONSISTENCY, "世界观阵营与社交系统阵营应协同",
                    "check_faction_consistency"),

    # 派生依赖（derived）
    FieldDependency("characters", "main_npc_count", "systems", "character.config.class_count",
                    DEP_TYPE_DERIVED, "NPC 数量应与角色系统规模匹配",
                    "check_npc_count"),
    FieldDependency("numeric", "core_formulas", "combat", "damage_formula",
                    DEP_TYPE_DERIVED, "数值核心公式应派生自战斗伤害公式",
                    "check_formula_derivation"),
    FieldDependency("audio", "music_style", "art", "art_style",
                    DEP_TYPE_DERIVED, "音乐风格应由美术风格派生",
                    "check_style_derivation"),
    FieldDependency("gameplay", "core_loop", "combat", "combat_mode",
                    DEP_TYPE_DERIVED, "核心循环应由战斗模式派生",
                    "check_core_loop_derivation"),
    FieldDependency("art", "character_design", "characters", "protagonist",
                    DEP_TYPE_DERIVED, "美术角色设计应由角色设定派生",
                    "check_character_design_derivation"),

    # 引用依赖（reference）
    FieldDependency("market_analysis", "target_market", "accessibility", "localization_strategy",
                    DEP_TYPE_REFERENCE, "目标市场决定本地化策略", None),
    FieldDependency("market_analysis", "competitors", "monetization", "payment_model",
                    DEP_TYPE_REFERENCE, "竞品分析影响付费模式选择", None),
    FieldDependency("vision", "differentiation", "market_analysis", "market_positioning",
                    DEP_TYPE_REFERENCE, "差异化定位与市场定位相互引用", None),
    FieldDependency("tech", "engine", "art", "art_style",
                    DEP_TYPE_REFERENCE, "技术引擎选型影响美术风格可行性", None),
    FieldDependency("resources", "budget", "mvp", "budget_estimate",
                    DEP_TYPE_REFERENCE, "资源预算应参考 MVP 预算估算", None),
    FieldDependency("characters", "boss_design", "combat", "boss_mechanics",
                    DEP_TYPE_REFERENCE, "Boss 设计与战斗 Boss 机制相互引用", None),
    FieldDependency("meta", "positioning", "market_analysis", "market_positioning",
                    DEP_TYPE_REFERENCE, "项目定位与市场定位相互引用", None),
]


def get_dependencies_for_chapter(chapter_key: str) -> list[FieldDependency]:
    """获取与指定章节相关的所有依赖（作为源或目标）。

    Args:
        chapter_key: 章节 key（如 "combat"）

    Returns:
        与该章节相关的 FieldDependency 列表
    """
    return [
        dep for dep in FIELD_DEPENDENCIES
        if dep.source_chapter == chapter_key or dep.target_chapter == chapter_key
    ]


def get_dependencies_for_field(chapter_key: str, field_path: str) -> list[FieldDependency]:
    """获取指定字段的依赖。

    Args:
        chapter_key: 章节 key
        field_path: 字段路径（如 "combat_mode" 或 "battle.config.turn_mode"）

    Returns:
        该字段参与的所有 FieldDependency 列表
    """
    result: list[FieldDependency] = []
    for dep in FIELD_DEPENDENCIES:
        if dep.source_chapter == chapter_key and dep.source_field == field_path:
            result.append(dep)
        elif dep.target_chapter == chapter_key and dep.target_field == field_path:
            result.append(dep)
    return result


def _get_nested_value(data: Any, path: str) -> Any:
    """按点分路径取嵌套值（如 "battle.config.turn_mode"）。

    Args:
        data: 起始数据（dict）
        path: 点分路径

    Returns:
        找到的值；任一段缺失返回 None
    """
    if not isinstance(data, dict) or not path:
        return None
    cur: Any = data
    for seg in path.split("."):
        if isinstance(cur, dict) and seg in cur:
            cur = cur[seg]
        else:
            return None
    return cur


def _values_consistent(a: Any, b: Any) -> bool:
    """判断两个字段值是否一致。

    - 都为空 → 一致（不报错）
    - 一空一非空 → 一致（仅一侧设置不视为冲突）
    - 都非空 → 严格相等（列表/字符串/数字均按 == 比较）
    """
    a_empty = a is None or a == "" or a == [] or a == {}
    b_empty = b is None or b == "" or b == [] or b == {}
    if a_empty or b_empty:
        return True
    return a == b


def check_field_dependencies(model: CeshuModel) -> list[dict]:
    """检查所有字段依赖，返回违规列表。

    Args:
        model: CeshuModel 实例

    Returns:
        list[dict]: 每项形如
            {"dependency": FieldDependency, "status": "ok"/"violation"/"warning",
             "message": str}
    """
    # 预取所有章节快照，避免每条依赖都重复调用 model.get_chapter（O(N) → O(1)）
    _chapters_cache: dict[str, Any] = {}
    for dep in FIELD_DEPENDENCIES:
        if dep.source_chapter not in _chapters_cache:
            _chapters_cache[dep.source_chapter] = model.get_chapter(dep.source_chapter)
        if dep.target_chapter not in _chapters_cache:
            _chapters_cache[dep.target_chapter] = model.get_chapter(dep.target_chapter)

    results: list[dict] = []
    for dep in FIELD_DEPENDENCIES:
        src_val = _get_nested_value(_chapters_cache.get(dep.source_chapter), dep.source_field)
        tgt_val = _get_nested_value(_chapters_cache.get(dep.target_chapter), dep.target_field)

        src_empty = src_val is None or src_val == "" or src_val == [] or src_val == {}
        tgt_empty = tgt_val is None or tgt_val == "" or tgt_val == [] or tgt_val == {}

        if src_empty and tgt_empty:
            status = STATUS_OK
            message = "两侧字段均未填写，暂无冲突"
        elif src_empty or tgt_empty:
            status = STATUS_WARNING
            message = f"仅一侧字段已填写（{dep.source_chapter}.{dep.source_field}="
            message += f"{src_val!r}, {dep.target_chapter}.{dep.target_field}={tgt_val!r}）"
        elif _values_consistent(src_val, tgt_val):
            status = STATUS_OK
            message = "字段值一致，依赖满足"
        else:
            status = STATUS_VIOLATION
            message = (f"依赖冲突：{dep.source_chapter}.{dep.source_field}={src_val!r} "
                       f"与 {dep.target_chapter}.{dep.target_field}={tgt_val!r} 不一致")

        results.append({
            "dependency": dep,
            "status": status,
            "message": message,
        })
    return results


def build_dependency_graph() -> dict:
    """构建依赖图（邻接表表示）。

    Returns:
        dict: {chapter: [dependent_chapters]}，
              chapter 依赖列表中的每个章节都被 chapter 直接依赖。
              仅包含存在依赖关系的章节。
    """
    graph: dict[str, list[str]] = {}
    for dep in FIELD_DEPENDENCIES:
        # source 依赖 target，所以 target 出现在 source 的依赖列表中
        targets = graph.setdefault(dep.source_chapter, [])
        if dep.target_chapter not in targets:
            targets.append(dep.target_chapter)
        # 确保 target 节点也在图中
        graph.setdefault(dep.target_chapter, [])
    return graph


def get_chapter_violation_summary(model: CeshuModel) -> dict[str, str]:
    """返回每个章节的违规状态汇总（供 UI 节点着色用）。

    Args:
        model: CeshuModel 实例

    Returns:
        dict: {chapter_key: "ok"/"warning"/"violation"}
              取该章节相关依赖中最严重的状态。
    """
    results = check_field_dependencies(model)
    severity = {STATUS_OK: 0, STATUS_WARNING: 1, STATUS_VIOLATION: 2}
    chapter_status: dict[str, int] = {}
    for item in results:
        dep: FieldDependency = item["dependency"]
        st = severity.get(item["status"], 0)
        for ch in (dep.source_chapter, dep.target_chapter):
            chapter_status[ch] = max(chapter_status.get(ch, 0), st)
    reverse = {0: STATUS_OK, 1: STATUS_WARNING, 2: STATUS_VIOLATION}
    return {ch: reverse[sev] for ch, sev in chapter_status.items()}
