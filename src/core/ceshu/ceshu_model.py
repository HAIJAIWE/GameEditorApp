"""策划书数据模型 — 工业级 GDD 18 章结构 (v5.0)

合并旧版 9 章 (CeshuModel v4.0) / 22 章 (universal_basic v5.0) / 29 章 (writing guide)
三套互不兼容的结构，统一为工业级 18 章标准。

设计原则:
- 每章职责单一、可独立编辑
- 新增 9 章: market_analysis / characters / combat / economy / monetization
            / mvp / risk_handling / audio / accessibility
- 保留旧 9 章作为基础，字段语义不变（向后兼容）
- from_dict 自动检测 v4.0 旧数据并迁移到 v5.0 18 章结构
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import json
from typing import Optional
import uuid

from .ceshu_constants import SYSTEM_CONFIG_SCHEMA, SYSTEM_LABELS

# --- 章节键名与标签（共享知识，跨文件引用） ---
# v5.0: 18 章工业级结构 — 合并 9/22/29 三套
CHAPTER_KEYS = [
    # 基础章节 (旧 9 章保留)
    "meta", "vision", "worldview", "gameplay",
    "systems", "numeric", "art", "tech", "resources",
    # 新增章节 (工业级补充)
    "market_analysis", "characters", "combat", "economy",
    "monetization", "mvp", "risk_handling", "audio", "accessibility",
]

CHAPTER_LABELS = {
    # 基础 9 章
    "meta":             "第一章·项目元信息",
    "vision":           "第二章·产品愿景",
    "worldview":        "第三章·世界观",
    "gameplay":         "第四章·核心玩法",
    "systems":          "第五章·游戏系统设计",
    "numeric":          "第六章·数值设计",
    "art":              "第七章·美术设计",
    "tech":             "第八章·技术规格",
    "resources":        "第九章·资源规划",
    # 工业级补充 9 章
    "market_analysis":  "第十章·市场分析",
    "characters":       "第十一章·角色设计",
    "combat":           "第十二章·战斗系统设计",
    "economy":          "第十三章·经济系统设计",
    "monetization":     "第十四章·商业化设计",
    "mvp":              "第十五章·MVP 规划",
    "risk_handling":    "第十六章·风险控制",
    "audio":            "第十七章·音频设计",
    "accessibility":    "第十八章·可访问性与本地化",
}

# 每章必填字段（用于进度计算与校验）
CHAPTER_REQUIRED_FIELDS = {
    "meta":             ["game_name", "game_type", "positioning", "tags"],
    "vision":           ["design_vision", "differentiation"],
    "worldview":        ["architecture", "main_plot"],
    "gameplay":         ["core_loop", "game_modes"],
    "systems":          [],  # 游戏系统按 enabled 数量算进度
    "numeric":          ["core_formulas", "balance_principles"],
    "art":              ["art_style", "color_system"],
    "tech":             ["engine", "milestones"],
    "resources":        ["budget", "risk_matrix"],
    # 新增章节必填字段
    "market_analysis":  ["target_market", "competitors"],
    "characters":       ["protagonist", "main_npc_count"],
    "combat":           ["combat_mode", "damage_formula"],
    "economy":          ["currency_types", "source_sink"],
    "monetization":     ["payment_model", "pricing_tiers"],
    "mvp":              ["mvp_scope", "mvp_timeline"],
    "risk_handling":    ["risk_matrix", "contingency_plan"],
    "audio":            ["music_style", "sfx_count"],
    "accessibility":    ["language_list", "accessibility_features"],
}


# --- 基础 9 章默认值（保留旧字段语义） ---

def _default_meta() -> dict:
    return {
        "game_name": "", "game_type": "", "platform": [],
        "positioning": "", "tags": [],
        "version": "0.1.0", "date": datetime.now().strftime("%Y-%m-%d"),
        "confidentiality": "internal", "status": "draft",
    }


def _default_vision() -> dict:
    return {
        "design_vision": "",
        "user_personas": {"primary": "", "secondary": "", "potential": ""},
        "competitive_analysis": [],
        "differentiation": "",
        "business_model": "",
    }


def _default_worldview() -> dict:
    return {
        "architecture": "", "history_eras": [], "factions": [],
        "geography": "", "main_plot": "",
        "branch_endings": [], "character_network": [],
    }


def _default_gameplay() -> dict:
    return {
        "core_loop": "", "control_scheme": "", "first_30_min": "",
        "game_modes": [], "win_lose_conditions": "", "tutorial_design": "",
    }


def _default_systems() -> dict:
    """基础游戏系统均为 disabled，config 带标准字段（值为空）"""
    systems = {}
    for sys_id, fields in SYSTEM_CONFIG_SCHEMA.items():
        systems[sys_id] = {
            "enabled": False,
            "name": SYSTEM_LABELS.get(sys_id, sys_id),
            "config": {fname: "" for fname in fields},
        }
    return systems


def default_config_for(sys_id: str) -> dict:
    """获取指定游戏系统的标准 config 字段（值为空字符串）"""
    fields = SYSTEM_CONFIG_SCHEMA.get(sys_id, {})
    return {fname: "" for fname in fields}


def _is_empty_required_value(val) -> bool:
    """判断必填字段值是否视为"空"（用于校验）。

    视为空的情况：None / 空字符串 / 0 / 空列表。
    注意：与 ceshu_export_common.is_empty_value 不同，本函数将 0 也视为空
    （保持与历史 validate 行为一致，避免破坏既有测试）。
    同时保持历史行为：空字典 {} 不视为空（因 budget 等字段默认为 {}）。
    bool 类型按其数值语义处理（False == 0 视为空）。
    """
    if val is None:
        return True
    if isinstance(val, str):
        return val == ""
    if isinstance(val, list):
        return len(val) == 0
    if isinstance(val, bool):
        # bool 是 int 子类；False == 0，按历史行为视为空
        return not val
    if isinstance(val, (int, float)):
        return val == 0
    # dict 与其他类型不视为空（与历史 val == 0/[] 行为一致）
    return False


def _default_numeric() -> dict:
    return {
        "core_formulas": "", "growth_curves": [], "drop_tables": [],
        "economic_model": "", "balance_principles": "",
    }


def _default_art() -> dict:
    return {
        "art_style": "", "character_design": "", "environment_design": "",
        "ui_design_language": "", "color_system": "", "typography": "",
        "vfx": "", "animation": "", "multi_resolution": "",
    }


def _default_tech() -> dict:
    return {
        "engine": "", "core_architecture": "", "third_party_deps": [],
        "performance_targets": "", "milestones": [],
        "team_structure": "", "qa_plan": "",
    }


def _default_resources() -> dict:
    return {
        "art_assets": [], "audio_assets": [], "localization": [],
        "outsourcing": [], "budget": {}, "risk_matrix": [],
        "contingency_plan": "", "ip": "", "appendix": "",
    }


# --- 新增 9 章默认值（v5.0 工业级补充） ---

def _default_market_analysis() -> dict:
    """第十章·市场分析 — 目标市场、竞品、用户画像、市场容量"""
    return {
        "target_market": "",          # 目标市场（国内/海外/全球 + 平台）
        "market_size": "",            # 市场容量与增长趋势
        "user_demographics": "",      # 用户画像（年龄/性别/地域/消费力）
        "competitors": [],            # 竞品列表 [{name, type, strengths, weaknesses, market_share}]
        "market_positioning": "",     # 市场定位（蓝海/红海/差异化）
        "entry_barriers": "",         # 进入壁垒
        "market_trends": [],          # 市场趋势（玩法/技术/付费）
        "kpi_forecast": {},           # KPI 预测 {dau, mau, retention_d1, retention_d7, arpu, ltv}
    }


def _default_characters() -> dict:
    """第十一章·角色设计 — 主角、NPC、敌人、boss 设计"""
    return {
        "protagonist": "",            # 主角设定（背景/性格/外观/能力）
        "main_npc_count": 0,          # 主要 NPC 数量
        "npc_list": [],               # NPC 列表 [{name, role, location, personality, quest_hook}]
        "antagonists": [],            # 反派设计
        "boss_design": [],            # Boss 设计 [{name, mechanics, phases, rewards}]
        "enemy_types": [],            # 普通敌人类型
        "companion_system": "",       # 同伴系统
        "character_arcs": [],         # 角色成长弧线
        "voice_cast": [],             # 配音演员
        "character_relationships": [],# 角色关系网
    }


def _default_combat() -> dict:
    """第十二章·战斗系统设计 — 战斗机制、技能、平衡设计层面"""
    return {
        "combat_mode": "",            # 战斗模式（回合/即时/半即时）
        "damage_formula": "",         # 伤害公式设计
        "skill_system": "",           # 技能系统设计
        "buff_debuff": "",            # Buff/Debuff 机制
        "element_system": "",         # 元素系统
        "combat_pace": "",            # 战斗节奏设计
        "team_formation": "",         # 队伍编排
        "pvp_design": "",             # PVP 设计
        "pve_design": "",             # PVE 设计
        "boss_mechanics": "",         # Boss 战机制设计
        "combat_progression": "",     # 战斗难度递进
        "balance_strategy": "",       # 战斗平衡策略
    }


def _default_economy() -> dict:
    """第十三章·经济系统设计 — 货币、产出、回收、通胀控制"""
    return {
        "currency_types": [],         # 货币类型 [{name, source, sink, exchange_rate}]
        "source_sink": "",            # 产出与回收机制总览
        "drop_tables": [],            # 掉落表设计
        "production_chain": "",       # 生产链/合成链
        "market_design": "",          # 交易市场设计
        "inflation_control": "",      # 通胀控制策略
        "economic_goals": "",         # 经济目标（玩家体验/盈利平衡）
        "metrics_tracking": [],       # 经济指标追踪
        "seasonal_adjustment": "",    # 赛季经济调整
    }


def _default_monetization() -> dict:
    """第十四章·商业化设计 — 付费模式、定价、运营策略"""
    return {
        "payment_model": "",          # 付费模式（f2p/p2p/b2p/订阅）
        "pricing_tiers": [],          # 定价档位
        "iap_design": [],             # 内购设计 [{item, price, value, target}]
        "ad_strategy": "",            # 广告策略
        "subscription_design": "",    # 订阅制设计
        "season_pass": "",            # 赛季通行证设计
        "vip_system": "",             # VIP 系统设计
        "limited_offers": "",         # 限时活动设计
        "whale_strategy": "",         # 大 R 策略
        "f2p_experience": "",         # 免费玩家体验保障
        "revenue_forecast": {},       # 收入预测
        "arpu_target": "",            # ARPU 目标
    }


def _default_mvp() -> dict:
    """第十五章·MVP 规划 — 最小可行产品范围、里程碑、验收标准"""
    return {
        "mvp_scope": "",              # MVP 范围定义
        "mvp_timeline": "",           # MVP 时间线（开始/结束/关键节点）
        "core_features": [],          # 核心特性清单
        "cut_features": [],           # 暂缓特性清单
        "prototype_features": [],     # 原型验证特性
        "milestones": [],             # 里程碑 [{name, date, deliverables, acceptance}]
        "success_criteria": "",       # 成功标准
        "team_size": 0,               # MVP 团队规模
        "budget_estimate": "",        # 预算估算
        "risk_assessment": "",        # MVP 风险评估
        "prototype_plan": "",         # 原型制作计划
        "playtest_plan": "",          # 试玩测试计划
    }


def _default_risk_handling() -> dict:
    """第十六章·风险控制 — 风险矩阵、应对策略、监控机制"""
    return {
        "risk_matrix": [],            # 风险矩阵 [{risk, probability, impact, mitigation, owner}]
        "contingency_plan": "",       # 应急预案
        "technical_risks": [],        # 技术风险
        "market_risks": [],           # 市场风险
        "team_risks": [],             # 团队风险
        "legal_risks": [],            # 法律合规风险
        "schedule_risks": [],         # 进度风险
        "risk_monitoring": "",        # 风险监控机制
        "escalation_path": "",        # 风险上报路径
        "crisis_management": "",      # 危机管理预案
    }


def _default_audio() -> dict:
    """第十七章·音频设计 — 音乐、音效、配音、技术规格"""
    return {
        "music_style": "",            # 音乐风格
        "sfx_count": 0,               # 音效数量估算
        "soundtrack_list": [],        # 配乐清单 [{scene, duration, mood, composer}]
        "sfx_list": [],               # 音效清单 [{category, count, description}]
        "voice_acting": "",           # 配音设计
        "audio_engine": "",           # 音频引擎/中间件
        "dynamic_audio": "",          # 动态音频/自适应音乐
        "audio_localization": "",     # 音频本地化
        "audio_budget": "",           # 音频预算
        "audio_milestones": [],       # 音频制作里程碑
    }


def _default_accessibility() -> dict:
    """第十八章·可访问性与本地化 — 多语言、无障碍、文化适配"""
    return {
        "language_list": [],          # 支持语言列表
        "localization_strategy": "",  # 本地化策略
        "cultural_adaptation": "",    # 文化适配（节日/敏感内容/数值单位）
        "accessibility_features": [], # 无障碍特性 [色盲模式/字幕/手柄/键盘/触屏]
        "subtitle_design": "",        # 字幕设计
        "color_blind_support": "",    # 色盲支持
        "motor_accessibility": "",    # 运动无障碍
        "cognitive_accessibility": "",# 认知无障碍
        "rating_certification": [],   # 分级认证 (ESRB/PEGI/CERO/GRAC)
        "compliance_notes": "",       # 合规备注
    }


# --- 旧版 (v4.0) → 新版 (v5.0) 迁移映射 ---
# 当 from_dict 检测到 version="4.0" 或缺失新增章节时，自动迁移
# 把散落在旧章节中的相关字段抽取到新章节中


@dataclass
class CeshuModel:
    """策划书工业级 GDD 数据模型 (v5.0) — 18 章结构，单一事实来源

    合并旧版 9 章 (v4.0) + 新增 9 章 (v5.0 工业级补充)
    """
    ceshu_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    version: str = "5.0"
    created_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    updated_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    # P8: 版本管理字段
    parent_id: str = ""                # 父策划书 ID（主策划为空字符串）
    version_label: str = "v1.0"        # 版本标签
    is_active: bool = True             # 是否为激活版本（同 parent_id 下唯一）
    version_note: str = ""             # 版本说明（本次迭代改了什么）

    # 风格参数（v5.0: 参数化生成支持）
    style: str = ""                    # 风格 (xianxia/sci-fi/realistic/wuxia/post_apoc/...)
    module_type: str = ""              # 模块类型 (rpg/slg/moba/fps/...)

    # 基础 9 章
    meta: dict = field(default_factory=_default_meta)
    vision: dict = field(default_factory=_default_vision)
    worldview: dict = field(default_factory=_default_worldview)
    gameplay: dict = field(default_factory=_default_gameplay)
    systems: dict = field(default_factory=_default_systems)
    numeric: dict = field(default_factory=_default_numeric)
    art: dict = field(default_factory=_default_art)
    tech: dict = field(default_factory=_default_tech)
    resources: dict = field(default_factory=_default_resources)

    # 工业级补充 9 章 (v5.0)
    market_analysis: dict = field(default_factory=_default_market_analysis)
    characters: dict = field(default_factory=_default_characters)
    combat: dict = field(default_factory=_default_combat)
    economy: dict = field(default_factory=_default_economy)
    monetization: dict = field(default_factory=_default_monetization)
    mvp: dict = field(default_factory=_default_mvp)
    risk_handling: dict = field(default_factory=_default_risk_handling)
    audio: dict = field(default_factory=_default_audio)
    accessibility: dict = field(default_factory=_default_accessibility)

    enabled_editors: list = field(default_factory=list)
    editor_configs: dict = field(default_factory=dict)

    # --- 序列化 ---

    def to_dict(self) -> dict:
        """输出完整 JSON 结构（18 章 + 元数据）"""
        return {
            "version": self.version,
            "ceshu_id": self.ceshu_id,
            "created_at": self.created_at,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "parent_id": self.parent_id,
            "version_label": self.version_label,
            "is_active": self.is_active,
            "version_note": self.version_note,
            "style": self.style,
            "module_type": self.module_type,
            # 基础 9 章
            "meta": self.meta,
            "vision": self.vision,
            "worldview": self.worldview,
            "gameplay": self.gameplay,
            "systems": self.systems,
            "numeric": self.numeric,
            "art": self.art,
            "tech": self.tech,
            "resources": self.resources,
            # 工业级补充 9 章
            "market_analysis": self.market_analysis,
            "characters": self.characters,
            "combat": self.combat,
            "economy": self.economy,
            "monetization": self.monetization,
            "mvp": self.mvp,
            "risk_handling": self.risk_handling,
            "audio": self.audio,
            "accessibility": self.accessibility,
            "enabled_editors": self.compute_enabled_editors(),
            "editor_configs": self.editor_configs,
        }

    @classmethod
    def from_dict(cls, data: dict) -> CeshuModel:
        """从 dict 反序列化（自动检测并迁移旧版本 v4.0 → v5.0）"""
        # 检测版本：v4.0 (旧 9 章) 或缺失新章节 → 自动迁移
        ver = data.get("version", "5.0")
        needs_migration = (
            ver == "4.0"
            or "market_analysis" not in data
            or "characters" not in data
            or "combat" not in data
            or "economy" not in data
            or "monetization" not in data
            or "mvp" not in data
            or "risk_handling" not in data
            or "audio" not in data
            or "accessibility" not in data
        )
        if needs_migration:
            from .ceshu_migration import migrate_v4_to_v5
            data = migrate_v4_to_v5(dict(data))

        return cls(
            version=data.get("version", "5.0"),
            ceshu_id=data.get("ceshu_id", str(uuid.uuid4())[:8]),
            created_at=data.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
            updated_at=data.get("updated_at", ""),
            parent_id=data.get("parent_id", ""),
            version_label=data.get("version_label", "v1.0"),
            is_active=data.get("is_active", True),
            version_note=data.get("version_note", ""),
            style=data.get("style", ""),
            module_type=data.get("module_type", ""),
            # 基础 9 章
            meta=data.get("meta", _default_meta()),
            vision=data.get("vision", _default_vision()),
            worldview=data.get("worldview", _default_worldview()),
            gameplay=data.get("gameplay", _default_gameplay()),
            systems=data.get("systems", _default_systems()),
            numeric=data.get("numeric", _default_numeric()),
            art=data.get("art", _default_art()),
            tech=data.get("tech", _default_tech()),
            resources=data.get("resources", _default_resources()),
            # 工业级补充 9 章
            market_analysis=data.get("market_analysis", _default_market_analysis()),
            characters=data.get("characters", _default_characters()),
            combat=data.get("combat", _default_combat()),
            economy=data.get("economy", _default_economy()),
            monetization=data.get("monetization", _default_monetization()),
            mvp=data.get("mvp", _default_mvp()),
            risk_handling=data.get("risk_handling", _default_risk_handling()),
            audio=data.get("audio", _default_audio()),
            accessibility=data.get("accessibility", _default_accessibility()),
            enabled_editors=data.get("enabled_editors", []),
            editor_configs=data.get("editor_configs", {}),
        )

    @classmethod
    def from_json_file(cls, path: str) -> CeshuModel:
        """从 JSON 文件加载

        Args:
            path: JSON 文件路径

        Returns:
            反序列化后的 CeshuModel

        Raises:
            FileNotFoundError: 文件不存在
            ValueError: JSON 解析失败或数据格式错误（附用户友好消息）
        """
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            raise
        except json.JSONDecodeError as e:
            # 提供用户友好的错误消息，不暴露技术细节
            raise ValueError(
                f"策划书文件内容损坏（JSON 解析失败，第 {e.lineno} 行第 {e.colno} 列）"
            ) from e
        except OSError as e:
            raise ValueError(f"读取策划书文件失败：{e}") from e

        if not isinstance(data, dict):
            raise ValueError(
                f"策划书文件格式不正确：期望 JSON 对象，实际为 {type(data).__name__}"
            )
        return cls.from_dict(data)

    # --- 游戏系统管理 ---

    def compute_enabled_editors(self) -> list:
        """从 systems 中自动计算 enabled_editors，返回含 key/name/data_type 的字典列表"""
        result = []
        for k, v in self.systems.items():
            if isinstance(v, dict) and v.get("enabled"):
                result.append({
                    "key": k,
                    "name": v.get("name", SYSTEM_LABELS.get(k, k)),
                    "data_type": v.get("data_type", k),
                })
        return result

    def get_chapter(self, key: str) -> dict:
        """获取指定章节的数据"""
        return getattr(self, key, {})

    def set_chapter(self, key: str, value: dict) -> None:
        """设置指定章节的数据"""
        if key in CHAPTER_KEYS:
            setattr(self, key, value)

    def get_system(self, name: str) -> Optional[dict]:
        """获取指定游戏系统"""
        return self.systems.get(name)

    def set_system(self, name: str, enabled: bool, config: dict | None = None) -> None:
        """设置游戏系统状态"""
        if name in self.systems:
            self.systems[name]["enabled"] = enabled
            if config is not None:
                self.systems[name]["config"] = config

    def add_system(self, name: str, config: dict | None = None) -> None:
        """新增自定义游戏系统"""
        if name not in self.systems:
            self.systems[name] = {"enabled": True, "config": config or {}}

    def remove_system(self, name: str) -> None:
        """删除游戏系统"""
        self.systems.pop(name, None)

    # --- 进度与校验 ---

    def chapter_progress(self) -> dict:
        """计算每章完成度（0.0~1.0）和总进度（覆盖全部 18 章）"""
        progress = {}
        for key in CHAPTER_KEYS:
            data = getattr(self, key, {})
            if key == "systems":
                # 游戏系统按 enabled 数量计算
                total = len(self.systems)
                if total == 0:
                    pct = 0.0
                else:
                    enabled_count = sum(1 for v in self.systems.values() if isinstance(v, dict) and v.get("enabled"))
                    pct = min(enabled_count / max(total, 1), 1.0)
            else:
                required = CHAPTER_REQUIRED_FIELDS.get(key, [])
                if not required:
                    pct = 0.5  # 无必填字段时默认半满
                else:
                    filled = sum(1 for f in required if data.get(f))
                    pct = filled / len(required)
            progress[key] = round(pct, 2)
        progress["total"] = round(sum(progress[k] for k in CHAPTER_KEYS) / len(CHAPTER_KEYS), 2)
        return progress

    def validate(self) -> list:
        """校验数据完整性,逻辑见 ceshu_validation.validate_ceshu"""
        from .ceshu_validation import validate_ceshu
        return validate_ceshu(self)

    def auto_fill_required(self) -> int:
        """自动填充空必填字段,逻辑见 ceshu_fill.auto_fill_required_fields"""
        from .ceshu_fill import auto_fill_required_fields
        return auto_fill_required_fields(self)

    def touch(self) -> None:
        """更新时间戳"""
        self.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # --- P8: 版本管理辅助 ---

    @property
    def is_main_version(self) -> bool:
        """是否为主策划（无父版本）"""
        return not self.parent_id

    @property
    def version_display(self) -> str:
        """版本显示文本：v1.0 (主) / v1.1 (子)"""
        suffix = "主" if self.is_main_version else "子"
        active = "★" if self.is_active else ""
        return f"{self.version_label} ({suffix}){active}"
