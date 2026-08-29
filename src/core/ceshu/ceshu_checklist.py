"""N11: GDD 完备性检查清单 — 预制作就绪（Pre-Production Readiness）检查

定义 50+ 项检查清单，分 6 大类：
- 项目基础（8 项）
- 游戏设计（12 项）
- 技术方案（8 项）
- 商业与市场（8 项）
- 团队与流程（6 项）
- 风险与合规（8 项）

每个检查项可指定自动检查函数（auto_check）或人工检查（manual）。
run_checklist(model) 返回 ChecklistReport，含就绪度评分与制作就绪判定。

核心逻辑不依赖 PyQt6，可独立单元测试。
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .ceshu_model import CeshuModel


# === 6 大类别常量 ===
CATEGORY_PROJECT = "项目基础"
CATEGORY_DESIGN = "游戏设计"
CATEGORY_TECH = "技术方案"
CATEGORY_MARKET = "商业与市场"
CATEGORY_TEAM = "团队与流程"
CATEGORY_RISK = "风险与合规"

ALL_CATEGORIES: list[str] = [
    CATEGORY_PROJECT, CATEGORY_DESIGN, CATEGORY_TECH,
    CATEGORY_MARKET, CATEGORY_TEAM, CATEGORY_RISK,
]

# 状态常量
STATUS_PASS = "pass"
STATUS_FAIL = "fail"
STATUS_WARNING = "warning"
STATUS_MANUAL = "manual"
STATUS_NA = "not_applicable"


@dataclass
class ChecklistItem:
    """检查项定义"""
    id: str
    category: str  # 6 大类之一
    title: str
    description: str
    required: bool  # True = 必须通过，False = 建议
    auto_check: str | None  # 自动检查函数名，None = 手动检查
    chapter_key: str | None  # 关联的章节


@dataclass
class ChecklistResult:
    """单项检查结果"""
    item_id: str
    status: str  # pass / fail / warning / manual / not_applicable
    message: str
    auto_checked: bool


@dataclass
class ChecklistReport:
    """检查清单报告"""
    results: list[ChecklistResult] = field(default_factory=list)
    total_items: int = 0
    passed: int = 0
    failed: int = 0
    warnings: int = 0
    manual: int = 0
    not_applicable: int = 0
    readiness_score: float = 0.0  # 0-100，通过率
    is_production_ready: bool = False  # 所有 required 项通过

    def summary(self) -> str:
        """生成检查报告摘要文本"""
        ready_text = "✅ 已就绪" if self.is_production_ready else "❌ 未就绪"
        lines = [
            "GDD 完备性检查报告",
            "========================================",
            f"就绪状态: {ready_text}",
            f"就绪度评分: {self.readiness_score:.1f} / 100",
            f"总检查项: {self.total_items}",
            f"  - 通过: {self.passed}",
            f"  - 失败: {self.failed}",
            f"  - 警告: {self.warnings}",
            f"  - 人工核查: {self.manual}",
            f"  - 不适用: {self.not_applicable}",
        ]
        # 列出失败的必需项
        failed_required = [
            r for r in self.results
            if r.status == STATUS_FAIL and _is_required_item(r.item_id)
        ]
        if failed_required:
            lines.append("")
            lines.append(f"关键缺失项（{len(failed_required)} 个必需项未通过）:")
            for r in failed_required:
                lines.append(f"  - [{r.item_id}] {r.message}")
        return "\n".join(lines)


# === 50 项检查清单定义 ===
# 按 6 大类组织，每项含 id / category / title / description / required / auto_check / chapter_key
def _project_items() -> list[ChecklistItem]:
    """项目基础（8 项）"""
    return [
        ChecklistItem("PB-01", CATEGORY_PROJECT, "游戏名称已确定",
                      "游戏名称是项目对外标识，必须明确",
                      required=True, auto_check="check_meta_game_name",
                      chapter_key="meta"),
        ChecklistItem("PB-02", CATEGORY_PROJECT, "游戏类型已确定",
                      "明确游戏类型（RPG/SLG/FPS/MOBA 等）以指导系统设计",
                      required=True, auto_check="check_meta_game_type",
                      chapter_key="meta"),
        ChecklistItem("PB-03", CATEGORY_PROJECT, "目标平台已确定",
                      "明确目标发布平台（PC/移动/主机/Web）",
                      required=True, auto_check="check_meta_platform",
                      chapter_key="meta"),
        ChecklistItem("PB-04", CATEGORY_PROJECT, "项目定位清晰",
                      "项目定位说明（受众/差异化/核心卖点）",
                      required=True, auto_check="check_meta_positioning",
                      chapter_key="meta"),
        ChecklistItem("PB-05", CATEGORY_PROJECT, "设计愿景完整",
                      "设计愿景阐述项目长期目标与设计哲学",
                      required=True, auto_check="check_vision_design_vision",
                      chapter_key="vision"),
        ChecklistItem("PB-06", CATEGORY_PROJECT, "差异化亮点明确",
                      "差异化亮点说明与竞品的核心区别",
                      required=True, auto_check="check_vision_differentiation",
                      chapter_key="vision"),
        ChecklistItem("PB-07", CATEGORY_PROJECT, "核心循环已定义",
                      "核心玩法循环（行为→反馈→奖励→目标）",
                      required=True, auto_check="check_gameplay_core_loop",
                      chapter_key="gameplay"),
        ChecklistItem("PB-08", CATEGORY_PROJECT, "项目标签已设置",
                      "项目标签便于检索与分类",
                      required=False, auto_check="check_meta_tags",
                      chapter_key="meta"),
    ]


def _design_items() -> list[ChecklistItem]:
    """游戏设计（12 项）"""
    return [
        ChecklistItem("GD-01", CATEGORY_DESIGN, "世界观已建立",
                      "世界观架构、主线剧情、势力格局等设定完整",
                      required=True, auto_check="check_worldview",
                      chapter_key="worldview"),
        ChecklistItem("GD-02", CATEGORY_DESIGN, "主要角色已定义",
                      "主角与主要 NPC 设定（背景/性格/外观/能力）",
                      required=True, auto_check="check_characters_main_npc",
                      chapter_key="characters"),
        ChecklistItem("GD-03", CATEGORY_DESIGN, "战斗系统已设计",
                      "战斗模式（回合/即时/半即时）与伤害公式",
                      required=True, auto_check="check_combat_mode",
                      chapter_key="combat"),
        ChecklistItem("GD-04", CATEGORY_DESIGN, "经济系统已设计",
                      "货币类型、产出回收机制、通胀控制",
                      required=True, auto_check="check_economy",
                      chapter_key="economy"),
        ChecklistItem("GD-05", CATEGORY_DESIGN, "核心系统已启用",
                      "至少启用 3 个核心游戏系统",
                      required=True, auto_check="check_systems_enabled_count",
                      chapter_key="systems"),
        ChecklistItem("GD-06", CATEGORY_DESIGN, "系统依赖完整",
                      "已启用系统的依赖系统均应启用",
                      required=True, auto_check="check_systems_dependencies",
                      chapter_key="systems"),
        ChecklistItem("GD-07", CATEGORY_DESIGN, "数值体系已规划",
                      "核心数值公式与平衡原则",
                      required=True, auto_check="check_numeric",
                      chapter_key="numeric"),
        ChecklistItem("GD-08", CATEGORY_DESIGN, "美术风格已确定",
                      "美术风格与色彩系统已确定",
                      required=True, auto_check="check_art_style",
                      chapter_key="art"),
        ChecklistItem("GD-09", CATEGORY_DESIGN, "音频方案已确定",
                      "音乐风格与音效方案已确定",
                      required=True, auto_check="check_audio",
                      chapter_key="audio"),
        ChecklistItem("GD-10", CATEGORY_DESIGN, "可访问性已考虑",
                      "无障碍特性与多语言支持",
                      required=False, auto_check="check_accessibility",
                      chapter_key="accessibility"),
        ChecklistItem("GD-11", CATEGORY_DESIGN, "操作方案已设计",
                      "操作方式（键鼠/手柄/触屏）与键位映射",
                      required=False, auto_check=None,
                      chapter_key="gameplay"),
        ChecklistItem("GD-12", CATEGORY_DESIGN, "教学流程已设计",
                      "新手教学流程与首次体验设计",
                      required=False, auto_check=None,
                      chapter_key="gameplay"),
    ]


def _tech_items() -> list[ChecklistItem]:
    """技术方案（8 项）"""
    return [
        ChecklistItem("TC-01", CATEGORY_TECH, "引擎已确定",
                      "游戏引擎选型（Unity/Unreal/自研等）",
                      required=True, auto_check="check_tech_engine",
                      chapter_key="tech"),
        ChecklistItem("TC-02", CATEGORY_TECH, "核心技术栈已确定",
                      "核心架构与第三方依赖",
                      required=True, auto_check="check_tech_stack",
                      chapter_key="tech"),
        ChecklistItem("TC-03", CATEGORY_TECH, "性能目标已设定",
                      "性能目标（帧率/内存/加载时间等）",
                      required=True, auto_check="check_tech_performance",
                      chapter_key="tech"),
        ChecklistItem("TC-04", CATEGORY_TECH, "MVP 范围已定义",
                      "MVP 范围（最小可行产品功能集）",
                      required=True, auto_check="check_mvp_scope",
                      chapter_key="mvp"),
        ChecklistItem("TC-05", CATEGORY_TECH, "MVP 时间线已确定",
                      "MVP 开发时间线（起止/关键节点）",
                      required=True, auto_check="check_mvp_timeline",
                      chapter_key="mvp"),
        ChecklistItem("TC-06", CATEGORY_TECH, "里程碑已规划",
                      "项目里程碑列表（名称/日期/交付物）",
                      required=True, auto_check="check_mvp_milestones",
                      chapter_key="mvp"),
        ChecklistItem("TC-07", CATEGORY_TECH, "成功标准已定义",
                      "MVP 成功标准（留存/活跃/付费等指标）",
                      required=True, auto_check="check_mvp_success_criteria",
                      chapter_key="mvp"),
        ChecklistItem("TC-08", CATEGORY_TECH, "技术风险评估",
                      "技术风险识别与应对方案（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="tech"),
    ]


def _market_items() -> list[ChecklistItem]:
    """商业与市场（8 项）"""
    return [
        ChecklistItem("MK-01", CATEGORY_MARKET, "目标市场已分析",
                      "目标市场（地域/平台/用户画像）",
                      required=True, auto_check="check_market_target",
                      chapter_key="market_analysis"),
        ChecklistItem("MK-02", CATEGORY_MARKET, "竞品已分析",
                      "竞品列表与优劣势分析",
                      required=True, auto_check="check_market_competitors",
                      chapter_key="market_analysis"),
        ChecklistItem("MK-03", CATEGORY_MARKET, "市场规模已评估",
                      "市场容量与增长趋势",
                      required=True, auto_check="check_market_size",
                      chapter_key="market_analysis"),
        ChecklistItem("MK-04", CATEGORY_MARKET, "商业模式已确定",
                      "付费模式（f2p/p2p/b2p/订阅）",
                      required=True, auto_check="check_monetization_model",
                      chapter_key="monetization"),
        ChecklistItem("MK-05", CATEGORY_MARKET, "定价策略已制定",
                      "定价档位与商品组合",
                      required=True, auto_check="check_monetization_pricing",
                      chapter_key="monetization"),
        ChecklistItem("MK-06", CATEGORY_MARKET, "内购设计已规划",
                      "内购商品设计（商品/价格/价值/目标用户）",
                      required=False, auto_check="check_monetization_iap",
                      chapter_key="monetization"),
        ChecklistItem("MK-07", CATEGORY_MARKET, "ARPU 目标已设定",
                      "ARPU 目标值与营收预测",
                      required=False, auto_check="check_monetization_arpu",
                      chapter_key="monetization"),
        ChecklistItem("MK-08", CATEGORY_MARKET, "KPI 预测已制定",
                      "KPI 预测（DAU/MAU/留存/LTV 等）",
                      required=True, auto_check="check_market_kpi",
                      chapter_key="market_analysis"),
    ]


def _team_items() -> list[ChecklistItem]:
    """团队与流程（6 项）"""
    return [
        ChecklistItem("TM-01", CATEGORY_TEAM, "团队规模已确定",
                      "开发团队规模与角色配置（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="mvp"),
        ChecklistItem("TM-02", CATEGORY_TEAM, "角色分工已明确",
                      "团队成员角色与职责分工（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="tech"),
        ChecklistItem("TM-03", CATEGORY_TEAM, "开发流程已确定",
                      "开发流程（敏捷/瀑布/Scrum/Kanban）（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="tech"),
        ChecklistItem("TM-04", CATEGORY_TEAM, "沟通工具已选定",
                      "团队沟通工具（Slack/钉钉/飞书等）（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="tech"),
        ChecklistItem("TM-05", CATEGORY_TEAM, "版本控制已建立",
                      "版本控制规范（Git/SVN/P4）（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="tech"),
        ChecklistItem("TM-06", CATEGORY_TEAM, "文档规范已建立",
                      "文档命名/存储/评审规范（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="tech"),
    ]


def _risk_items() -> list[ChecklistItem]:
    """风险与合规（8 项）"""
    return [
        ChecklistItem("RS-01", CATEGORY_RISK, "风险矩阵已建立",
                      "风险矩阵（风险/概率/影响/应对/负责人）",
                      required=True, auto_check="check_risk_matrix",
                      chapter_key="risk_handling"),
        ChecklistItem("RS-02", CATEGORY_RISK, "应对策略已制定",
                      "应急预案与应对策略",
                      required=True, auto_check="check_risk_mitigation",
                      chapter_key="risk_handling"),
        ChecklistItem("RS-03", CATEGORY_RISK, "资源需求已评估",
                      "美术/音频/本地化等资源规划与预算",
                      required=True, auto_check="check_resources",
                      chapter_key="resources"),
        ChecklistItem("RS-04", CATEGORY_RISK, "本地化计划已制定",
                      "本地化策略与支持语言列表",
                      required=False, auto_check="check_accessibility_localization",
                      chapter_key="accessibility"),
        ChecklistItem("RS-05", CATEGORY_RISK, "版权合规已检查",
                      "美术/音频/代码版权合规检查（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="resources"),
        ChecklistItem("RS-06", CATEGORY_RISK, "隐私政策已准备",
                      "用户隐私政策与数据处理说明（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="accessibility"),
        ChecklistItem("RS-07", CATEGORY_RISK, "年龄分级已确认",
                      "年龄分级认证（ESRB/PEGI/CERO/GRAC）（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="accessibility"),
        ChecklistItem("RS-08", CATEGORY_RISK, "数据合规已检查",
                      "数据合规（GDPR/CCPA/个保法等）（人工核查）",
                      required=False, auto_check=None,
                      chapter_key="accessibility"),
    ]



def _build_checklist_items() -> list[ChecklistItem]:
    """构建全部检查项列表（50 项）。"""
    return (
        _project_items() + _design_items() + _tech_items()
        + _market_items() + _team_items() + _risk_items()
    )


# === 模块级缓存（避免重复构建） ===
_CHECKLIST_ITEMS: list[ChecklistItem] | None = None


def get_checklist_items() -> list[ChecklistItem]:
    """获取所有检查项定义（带缓存）。"""
    global _CHECKLIST_ITEMS
    if _CHECKLIST_ITEMS is None:
        _CHECKLIST_ITEMS = _build_checklist_items()
    return _CHECKLIST_ITEMS


def get_items_by_category(category: str) -> list[ChecklistItem]:
    """按类别获取检查项。

    Args:
        category: 类别名（须为 ALL_CATEGORIES 之一）。

    Returns:
        该类别下的检查项列表。
    """
    return [it for it in get_checklist_items() if it.category == category]


def _is_required_item(item_id: str) -> bool:
    """根据 item_id 判断是否为必需项。"""
    for it in get_checklist_items():
        if it.id == item_id:
            return it.required
    return False


# === 自动检查函数 ===
# 每个函数签名: def check_xxx(model: CeshuModel) -> tuple[str, str]
# 返回 (status, message)，status ∈ {"pass", "fail", "warning"}

def _has_value(value) -> bool:
    """判断字段值是否非空（字符串非空 / 列表非空 / 字典非空 / 数字非零）。"""
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, (list, dict, tuple)):
        return len(value) > 0
    if isinstance(value, (int, float)):
        return value != 0
    return bool(value)


def check_meta_game_name(model: CeshuModel) -> tuple[str, str]:
    """检查游戏名称是否已确定。"""
    val = model.meta.get("game_name", "")
    if _has_value(val):
        return STATUS_PASS, f"游戏名称: {val}"
    return STATUS_FAIL, "游戏名称未设置"


def check_meta_game_type(model: CeshuModel) -> tuple[str, str]:
    """检查游戏类型是否已确定。"""
    val = model.meta.get("game_type", "")
    if _has_value(val):
        return STATUS_PASS, f"游戏类型: {val}"
    return STATUS_FAIL, "游戏类型未设置"


def check_meta_platform(model: CeshuModel) -> tuple[str, str]:
    """检查目标平台是否已确定。"""
    val = model.meta.get("platform", [])
    if _has_value(val):
        return STATUS_PASS, f"目标平台: {', '.join(str(p) for p in val)}"
    return STATUS_FAIL, "目标平台未设置"


def check_meta_positioning(model: CeshuModel) -> tuple[str, str]:
    """检查项目定位是否清晰。"""
    val = model.meta.get("positioning", "")
    if _has_value(val):
        snippet = val if len(val) <= 60 else val[:60] + "..."
        return STATUS_PASS, f"项目定位: {snippet}"
    return STATUS_FAIL, "项目定位未填写"


def check_meta_tags(model: CeshuModel) -> tuple[str, str]:
    """检查项目标签是否已设置。"""
    val = model.meta.get("tags", [])
    if _has_value(val):
        return STATUS_PASS, f"项目标签: {', '.join(str(t) for t in val)}"
    return STATUS_WARNING, "项目标签未设置（建议补充以便检索）"


def check_vision_design_vision(model: CeshuModel) -> tuple[str, str]:
    """检查设计愿景是否完整。"""
    val = model.vision.get("design_vision", "")
    if not _has_value(val):
        return STATUS_FAIL, "设计愿景未填写"
    if len(val) < 30:
        return STATUS_WARNING, f"设计愿景偏短（{len(val)} 字），建议扩充至 200 字以上"
    return STATUS_PASS, f"设计愿景已填写（{len(val)} 字）"


def check_vision_differentiation(model: CeshuModel) -> tuple[str, str]:
    """检查差异化亮点是否明确。"""
    val = model.vision.get("differentiation", "")
    if not _has_value(val):
        return STATUS_FAIL, "差异化亮点未填写"
    if len(val) < 15:
        return STATUS_WARNING, "差异化亮点偏短，建议细化核心卖点"
    return STATUS_PASS, f"差异化亮点: {val[:40]}{'...' if len(val) > 40 else ''}"


def check_gameplay_core_loop(model: CeshuModel) -> tuple[str, str]:
    """检查核心循环是否已定义。"""
    val = model.gameplay.get("core_loop", "")
    if _has_value(val):
        return STATUS_PASS, "核心循环已定义"
    return STATUS_FAIL, "核心循环未定义（玩家行为→反馈→奖励→目标）"


def check_worldview(model: CeshuModel) -> tuple[str, str]:
    """检查世界观是否已建立。"""
    arch = model.worldview.get("architecture", "")
    plot = model.worldview.get("main_plot", "")
    if not _has_value(arch) and not _has_value(plot):
        return STATUS_FAIL, "世界观架构与主线剧情均未填写"
    if not _has_value(arch):
        return STATUS_WARNING, "世界观架构未填写"
    if not _has_value(plot):
        return STATUS_WARNING, "主线剧情未填写"
    return STATUS_PASS, "世界观架构与主线剧情已建立"


def check_characters_main_npc(model: CeshuModel) -> tuple[str, str]:
    """检查主要角色是否已定义。"""
    prot = model.characters.get("protagonist", "")
    npc_count = model.characters.get("main_npc_count", 0)
    npc_list = model.characters.get("npc_list", [])
    if not _has_value(prot):
        return STATUS_FAIL, "主角设定未填写"
    if not _has_value(npc_count) or npc_count <= 0:
        return STATUS_WARNING, "主要 NPC 数量未设定"
    if not _has_value(npc_list):
        return STATUS_WARNING, "NPC 列表为空"
    return STATUS_PASS, f"主角已定义，NPC 数量={npc_count}"


def check_combat_mode(model: CeshuModel) -> tuple[str, str]:
    """检查战斗系统是否已设计。"""
    mode = model.combat.get("combat_mode", "")
    formula = model.combat.get("damage_formula", "")
    if not _has_value(mode):
        return STATUS_FAIL, "战斗模式未设置（回合/即时/半即时）"
    if not _has_value(formula):
        return STATUS_WARNING, "伤害公式未设计"
    return STATUS_PASS, f"战斗模式: {mode}"


def check_economy(model: CeshuModel) -> tuple[str, str]:
    """检查经济系统是否已设计。"""
    currencies = model.economy.get("currency_types", [])
    source_sink = model.economy.get("source_sink", "")
    if not _has_value(currencies) and not _has_value(source_sink):
        return STATUS_FAIL, "货币类型与产出回收机制均未填写"
    if not _has_value(currencies):
        return STATUS_WARNING, "货币类型未填写"
    return STATUS_PASS, f"经济系统已设计（{len(currencies) if isinstance(currencies, list) else 1} 种货币）"


def check_systems_enabled_count(model: CeshuModel) -> tuple[str, str]:
    """检查核心系统启用数量。"""
    enabled = [k for k, v in model.systems.items()
               if isinstance(v, dict) and v.get("enabled")]
    count = len(enabled)
    if count == 0:
        return STATUS_FAIL, "未启用任何游戏系统"
    if count < 3:
        return STATUS_WARNING, f"仅启用 {count} 个系统，建议至少 3 个核心系统"
    return STATUS_PASS, f"已启用 {count} 个游戏系统"


def check_systems_dependencies(model: CeshuModel) -> tuple[str, str]:
    """检查系统依赖是否完整。"""
    try:
        from .ceshu_constants import check_system_dependencies
        enabled = [k for k, v in model.systems.items()
                   if isinstance(v, dict) and v.get("enabled")]
        missing = check_system_dependencies(enabled)
        if not missing:
            return STATUS_PASS, "已启用系统的依赖均满足"
        details = "; ".join(
            f"{m['system']} 缺少 {','.join(m['missing'])}" for m in missing
        )
        return STATUS_FAIL, f"依赖缺失: {details}"
    except Exception as e:
        return STATUS_WARNING, f"依赖检查异常: {e}"


def check_numeric(model: CeshuModel) -> tuple[str, str]:
    """检查数值体系是否已规划。"""
    formulas = model.numeric.get("core_formulas", "")
    balance = model.numeric.get("balance_principles", "")
    if not _has_value(formulas):
        return STATUS_FAIL, "核心数值公式未填写"
    if not _has_value(balance):
        return STATUS_WARNING, "平衡原则未填写"
    return STATUS_PASS, "数值公式与平衡原则已规划"


def check_art_style(model: CeshuModel) -> tuple[str, str]:
    """检查美术风格是否已确定。"""
    style = model.art.get("art_style", "")
    color = model.art.get("color_system", "")
    if not _has_value(style):
        return STATUS_FAIL, "美术风格未确定"
    if not _has_value(color):
        return STATUS_WARNING, "色彩系统未确定"
    return STATUS_PASS, f"美术风格: {style}"


def check_audio(model: CeshuModel) -> tuple[str, str]:
    """检查音频方案是否已确定。"""
    music = model.audio.get("music_style", "")
    sfx_count = model.audio.get("sfx_count", 0)
    if not _has_value(music):
        return STATUS_FAIL, "音乐风格未确定"
    if not _has_value(sfx_count) or sfx_count <= 0:
        return STATUS_WARNING, "音效数量未估算"
    return STATUS_PASS, f"音乐风格: {music}"


def check_accessibility(model: CeshuModel) -> tuple[str, str]:
    """检查可访问性是否已考虑。"""
    features = model.accessibility.get("accessibility_features", [])
    languages = model.accessibility.get("language_list", [])
    if not _has_value(features) and not _has_value(languages):
        return STATUS_WARNING, "无障碍特性与支持语言均未设置"
    parts = []
    if _has_value(features):
        parts.append(f"{len(features)} 项无障碍特性")
    if _has_value(languages):
        parts.append(f"{len(languages)} 种语言")
    return STATUS_PASS, "已考虑: " + "、".join(parts)


def check_tech_engine(model: CeshuModel) -> tuple[str, str]:
    """检查引擎是否已确定。"""
    val = model.tech.get("engine", "")
    if _has_value(val):
        return STATUS_PASS, f"引擎: {val}"
    return STATUS_FAIL, "游戏引擎未确定"


def check_tech_stack(model: CeshuModel) -> tuple[str, str]:
    """检查核心技术栈是否已确定。"""
    arch = model.tech.get("core_architecture", "")
    deps = model.tech.get("third_party_deps", [])
    if not _has_value(arch) and not _has_value(deps):
        return STATUS_FAIL, "核心架构与第三方依赖均未填写"
    if not _has_value(arch):
        return STATUS_WARNING, "核心架构未填写"
    return STATUS_PASS, "技术栈已确定"


def check_tech_performance(model: CeshuModel) -> tuple[str, str]:
    """检查性能目标是否已设定。"""
    val = model.tech.get("performance_targets", "")
    if _has_value(val):
        return STATUS_PASS, f"性能目标: {val[:40]}{'...' if len(val) > 40 else ''}"
    return STATUS_FAIL, "性能目标未设定（帧率/内存/加载时间等）"


def check_mvp_scope(model: CeshuModel) -> tuple[str, str]:
    """检查 MVP 范围是否已定义。"""
    val = model.mvp.get("mvp_scope", "")
    if _has_value(val):
        return STATUS_PASS, "MVP 范围已定义"
    return STATUS_FAIL, "MVP 范围未定义"


def check_mvp_timeline(model: CeshuModel) -> tuple[str, str]:
    """检查 MVP 时间线是否已确定。"""
    val = model.mvp.get("mvp_timeline", "")
    if _has_value(val):
        return STATUS_PASS, f"MVP 时间线: {val}"
    return STATUS_FAIL, "MVP 时间线未确定"


def check_mvp_milestones(model: CeshuModel) -> tuple[str, str]:
    """检查里程碑是否已规划。"""
    val = model.mvp.get("milestones", [])
    if _has_value(val):
        return STATUS_PASS, f"已规划 {len(val)} 个里程碑"
    return STATUS_FAIL, "里程碑未规划"


def check_mvp_success_criteria(model: CeshuModel) -> tuple[str, str]:
    """检查成功标准是否已定义。"""
    val = model.mvp.get("success_criteria", "")
    if _has_value(val):
        return STATUS_PASS, f"成功标准: {val[:40]}{'...' if len(val) > 40 else ''}"
    return STATUS_FAIL, "MVP 成功标准未定义"


def check_market_target(model: CeshuModel) -> tuple[str, str]:
    """检查目标市场是否已分析。"""
    val = model.market_analysis.get("target_market", "")
    if _has_value(val):
        return STATUS_PASS, f"目标市场: {val}"
    return STATUS_FAIL, "目标市场未分析"


def check_market_competitors(model: CeshuModel) -> tuple[str, str]:
    """检查竞品是否已分析。"""
    val = model.market_analysis.get("competitors", [])
    if _has_value(val):
        return STATUS_PASS, f"已分析 {len(val)} 个竞品"
    return STATUS_FAIL, "竞品分析未填写"


def check_market_size(model: CeshuModel) -> tuple[str, str]:
    """检查市场规模是否已评估。"""
    val = model.market_analysis.get("market_size", "")
    if _has_value(val):
        return STATUS_PASS, f"市场规模: {val}"
    return STATUS_FAIL, "市场规模未评估"


def check_monetization_model(model: CeshuModel) -> tuple[str, str]:
    """检查商业模式是否已确定。"""
    val = model.monetization.get("payment_model", "")
    if _has_value(val):
        return STATUS_PASS, f"付费模式: {val}"
    return STATUS_FAIL, "付费模式未确定（f2p/p2p/b2p/订阅）"


def check_monetization_pricing(model: CeshuModel) -> tuple[str, str]:
    """检查定价策略是否已制定。"""
    val = model.monetization.get("pricing_tiers", [])
    if _has_value(val):
        return STATUS_PASS, f"定价档位: {len(val)} 档"
    return STATUS_FAIL, "定价档位未制定"


def check_monetization_iap(model: CeshuModel) -> tuple[str, str]:
    """检查内购设计是否已规划。"""
    val = model.monetization.get("iap_design", [])
    if _has_value(val):
        return STATUS_PASS, f"内购商品: {len(val)} 项"
    return STATUS_WARNING, "内购设计未规划"


def check_monetization_arpu(model: CeshuModel) -> tuple[str, str]:
    """检查 ARPU 目标是否已设定。"""
    val = model.monetization.get("arpu_target", "")
    if _has_value(val):
        return STATUS_PASS, f"ARPU 目标: {val}"
    return STATUS_WARNING, "ARPU 目标未设定"


def check_market_kpi(model: CeshuModel) -> tuple[str, str]:
    """检查 KPI 预测是否已制定。"""
    val = model.market_analysis.get("kpi_forecast", {})
    if _has_value(val):
        keys = list(val.keys()) if isinstance(val, dict) else []
        return STATUS_PASS, f"KPI 已制定（{len(keys)} 项指标）"
    return STATUS_FAIL, "KPI 预测未制定"


def check_risk_matrix(model: CeshuModel) -> tuple[str, str]:
    """检查风险矩阵是否已建立。"""
    val = model.risk_handling.get("risk_matrix", [])
    if _has_value(val):
        return STATUS_PASS, f"风险矩阵已建立（{len(val)} 项风险）"
    return STATUS_FAIL, "风险矩阵未建立"


def check_risk_mitigation(model: CeshuModel) -> tuple[str, str]:
    """检查应对策略是否已制定。"""
    val = model.risk_handling.get("contingency_plan", "")
    if _has_value(val):
        return STATUS_PASS, "应急预案已制定"
    return STATUS_FAIL, "应急预案未制定"


def check_resources(model: CeshuModel) -> tuple[str, str]:
    """检查资源需求是否已评估。"""
    budget = model.resources.get("budget", {})
    art_assets = model.resources.get("art_assets", [])
    audio_assets = model.resources.get("audio_assets", [])
    has_budget = _has_value(budget)
    has_assets = _has_value(art_assets) or _has_value(audio_assets)
    if not has_budget and not has_assets:
        return STATUS_FAIL, "资源预算与资产清单均未填写"
    if not has_budget:
        return STATUS_WARNING, "资源预算未填写"
    return STATUS_PASS, "资源需求已评估"


def check_accessibility_localization(model: CeshuModel) -> tuple[str, str]:
    """检查本地化计划是否已制定。"""
    languages = model.accessibility.get("language_list", [])
    strategy = model.accessibility.get("localization_strategy", "")
    if not _has_value(languages):
        return STATUS_WARNING, "支持语言列表为空"
    if not _has_value(strategy):
        return STATUS_WARNING, f"已支持 {len(languages)} 种语言，但本地化策略未填写"
    return STATUS_PASS, f"本地化计划已制定（{len(languages)} 种语言）"


# === 自动检查函数注册表 ===
# 函数名 → 函数对象
_AUTO_CHECK_REGISTRY: dict[str, Callable[[CeshuModel], tuple[str, str]]] = {
    "check_meta_game_name": check_meta_game_name,
    "check_meta_game_type": check_meta_game_type,
    "check_meta_platform": check_meta_platform,
    "check_meta_positioning": check_meta_positioning,
    "check_meta_tags": check_meta_tags,
    "check_vision_design_vision": check_vision_design_vision,
    "check_vision_differentiation": check_vision_differentiation,
    "check_gameplay_core_loop": check_gameplay_core_loop,
    "check_worldview": check_worldview,
    "check_characters_main_npc": check_characters_main_npc,
    "check_combat_mode": check_combat_mode,
    "check_economy": check_economy,
    "check_systems_enabled_count": check_systems_enabled_count,
    "check_systems_dependencies": check_systems_dependencies,
    "check_numeric": check_numeric,
    "check_art_style": check_art_style,
    "check_audio": check_audio,
    "check_accessibility": check_accessibility,
    "check_tech_engine": check_tech_engine,
    "check_tech_stack": check_tech_stack,
    "check_tech_performance": check_tech_performance,
    "check_mvp_scope": check_mvp_scope,
    "check_mvp_timeline": check_mvp_timeline,
    "check_mvp_milestones": check_mvp_milestones,
    "check_mvp_success_criteria": check_mvp_success_criteria,
    "check_market_target": check_market_target,
    "check_market_competitors": check_market_competitors,
    "check_market_size": check_market_size,
    "check_monetization_model": check_monetization_model,
    "check_monetization_pricing": check_monetization_pricing,
    "check_monetization_iap": check_monetization_iap,
    "check_monetization_arpu": check_monetization_arpu,
    "check_market_kpi": check_market_kpi,
    "check_risk_matrix": check_risk_matrix,
    "check_risk_mitigation": check_risk_mitigation,
    "check_resources": check_resources,
    "check_accessibility_localization": check_accessibility_localization,
}


# === 主检查函数 ===

def run_checklist(model: CeshuModel) -> ChecklistReport:
    """运行完整检查清单，返回报告。

    遍历全部检查项，调用对应的 auto_check 函数或标记为人工核查，
    汇总通过/失败/警告/人工/不适用数量，计算就绪度评分与制作就绪判定。

    Args:
        model: CeshuModel 实例。

    Returns:
        ChecklistReport 检查报告。
    """
    items = get_checklist_items()
    results: list[ChecklistResult] = []
    passed = failed = warnings = manual = na = 0
    failed_required_ids: list[str] = []

    for item in items:
        if item.auto_check is None:
            # 人工核查项
            results.append(ChecklistResult(
                item_id=item.id, status=STATUS_MANUAL,
                message=f"请人工核查：{item.description}",
                auto_checked=False,
            ))
            manual += 1
            continue

        # 自动检查
        fn = _AUTO_CHECK_REGISTRY.get(item.auto_check)
        if fn is None:
            results.append(ChecklistResult(
                item_id=item.id, status=STATUS_WARNING,
                message=f"未注册的检查函数: {item.auto_check}",
                auto_checked=False,
            ))
            warnings += 1
            continue

        try:
            status, message = fn(model)
        except Exception as e:
            status, message = STATUS_WARNING, f"检查异常: {e}"

        results.append(ChecklistResult(
            item_id=item.id, status=status, message=message,
            auto_checked=True,
        ))

        if status == STATUS_PASS:
            passed += 1
        elif status == STATUS_FAIL:
            failed += 1
            if item.required:
                failed_required_ids.append(item.id)
        elif status == STATUS_WARNING:
            warnings += 1
        elif status == STATUS_NA:
            na += 1

    # 就绪度评分 = 通过项 / (通过 + 失败 + 警告) * 100
    scored_total = passed + failed + warnings
    readiness = round(passed / scored_total * 100, 1) if scored_total > 0 else 0.0

    # 制作就绪 = 所有 required 项通过
    is_ready = len(failed_required_ids) == 0

    return ChecklistReport(
        results=results,
        total_items=len(items),
        passed=passed,
        failed=failed,
        warnings=warnings,
        manual=manual,
        not_applicable=na,
        readiness_score=readiness,
        is_production_ready=is_ready,
    )
