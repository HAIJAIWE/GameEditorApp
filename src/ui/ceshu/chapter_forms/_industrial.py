"""策划书表单组件。"""
from __future__ import annotations

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QFormLayout,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ._common import (
    _add_row,
    _combo,
    _safe_text,
    _text_field,
    ceshu_form_input_qss,
)


class ChapterMarketAnalysisForm(QWidget):
    """v5.0 工业级补充 — 市场分析章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._target_market = _text_field("目标市场（国内/海外/全球 + 平台）", 60)
        self._target_market.setPlainText(_safe_text(self._data.get("target_market", "")))
        self._target_market.textChanged.connect(lambda: self._emit())
        _add_row(form, "目标市场 *", self._target_market, "market_analysis.target_market")

        self._market_size = _text_field("市场容量与增长趋势", 60)
        self._market_size.setPlainText(_safe_text(self._data.get("market_size", "")))
        self._market_size.textChanged.connect(lambda: self._emit())
        _add_row(form, "市场容量", self._market_size)

        self._user_demographics = _text_field("用户画像（年龄/性别/地域/消费力）", 80)
        self._user_demographics.setPlainText(_safe_text(self._data.get("user_demographics", "")))
        self._user_demographics.textChanged.connect(lambda: self._emit())
        _add_row(form, "用户画像", self._user_demographics)

        self._competitors = _text_field("竞品列表，每行一个（名称 | 类型 | 优势 | 劣势 | 市场份额）", 80)
        comps = self._data.get("competitors", [])
        if isinstance(comps, list):
            lines = []
            for c in comps:
                if isinstance(c, dict):
                    lines.append(f"{c.get('name', '')} | {c.get('type', '')} | "
                                 f"{c.get('strengths', '')} | {c.get('weaknesses', '')} | "
                                 f"{c.get('market_share', '')}")
                elif isinstance(c, str):
                    lines.append(c)
            self._competitors.setPlainText("\n".join(lines))
        self._competitors.textChanged.connect(lambda: self._emit())
        _add_row(form, "竞品分析 *", self._competitors, "market_analysis.competitors")

        self._positioning = _text_field("市场定位（蓝海/红海/差异化）", 60)
        self._positioning.setPlainText(_safe_text(self._data.get("market_positioning", "")))
        self._positioning.textChanged.connect(lambda: self._emit())
        _add_row(form, "市场定位", self._positioning)

        self._entry_barriers = _text_field("进入壁垒分析", 60)
        self._entry_barriers.setPlainText(_safe_text(self._data.get("entry_barriers", "")))
        self._entry_barriers.textChanged.connect(lambda: self._emit())
        _add_row(form, "进入壁垒", self._entry_barriers)

        self._market_trends = _text_field("市场趋势（玩法/技术/付费），每行一个", 60)
        trends = self._data.get("market_trends", [])
        if isinstance(trends, list):
            self._market_trends.setPlainText("\n".join(trends))
        self._market_trends.textChanged.connect(lambda: self._emit())
        _add_row(form, "市场趋势", self._market_trends)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("market_analysis", self.get_data())

    def get_data(self) -> dict:
        comps_text = self._competitors.toPlainText().strip()
        competitors = []
        if comps_text:
            for line in comps_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                competitors.append({
                    "name": parts[0] if len(parts) > 0 else "",
                    "type": parts[1] if len(parts) > 1 else "",
                    "strengths": parts[2] if len(parts) > 2 else "",
                    "weaknesses": parts[3] if len(parts) > 3 else "",
                    "market_share": parts[4] if len(parts) > 4 else "",
                })

        trends_text = self._market_trends.toPlainText().strip()
        trends = [t.strip() for t in trends_text.split("\n") if t.strip()] if trends_text else []

        return {
            "target_market": self._target_market.toPlainText().strip(),
            "market_size": self._market_size.toPlainText().strip(),
            "user_demographics": self._user_demographics.toPlainText().strip(),
            "competitors": competitors,
            "market_positioning": self._positioning.toPlainText().strip(),
            "entry_barriers": self._entry_barriers.toPlainText().strip(),
            "market_trends": trends,
            "kpi_forecast": self._data.get("kpi_forecast", {}),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._target_market.setPlainText(data.get("target_market", ""))
        self._market_size.setPlainText(data.get("market_size", ""))
        self._user_demographics.setPlainText(data.get("user_demographics", ""))
        comps = data.get("competitors", [])
        if isinstance(comps, list):
            lines = []
            for c in comps:
                if isinstance(c, dict):
                    lines.append(f"{c.get('name', '')} | {c.get('type', '')} | "
                                 f"{c.get('strengths', '')} | {c.get('weaknesses', '')} | "
                                 f"{c.get('market_share', '')}")
                elif isinstance(c, str):
                    lines.append(c)
            self._competitors.setPlainText("\n".join(lines))
        self._positioning.setPlainText(data.get("market_positioning", ""))
        self._entry_barriers.setPlainText(data.get("entry_barriers", ""))
        trends = data.get("market_trends", [])
        if isinstance(trends, list):
            self._market_trends.setPlainText("\n".join(trends))


# === 第十一章：角色设计 ===

class ChapterCharactersForm(QWidget):
    """v5.0 工业级补充 — 角色设计章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._protagonist = _text_field("主角设定（背景/性格/外观/能力）", 100)
        self._protagonist.setPlainText(_safe_text(self._data.get("protagonist", "")))
        self._protagonist.textChanged.connect(lambda: self._emit())
        _add_row(form, "主角设定 *", self._protagonist, "characters.protagonist")

        self._main_npc_count = QSpinBox()
        self._main_npc_count.setRange(0, 9999)
        self._main_npc_count.setValue(self._data.get("main_npc_count", 0))
        self._main_npc_count.setStyleSheet(ceshu_form_input_qss())
        self._main_npc_count.valueChanged.connect(lambda: self._emit())
        _add_row(form, "主要 NPC 数量 *", self._main_npc_count)

        self._npc_list = _text_field("NPC 列表，每行一个（名称 | 角色 | 位置 | 性格 | 任务钩子）", 80)
        npcs = self._data.get("npc_list", [])
        if isinstance(npcs, list):
            lines = []
            for n in npcs:
                if isinstance(n, dict):
                    lines.append(f"{n.get('name', '')} | {n.get('role', '')} | "
                                 f"{n.get('location', '')} | {n.get('personality', '')} | "
                                 f"{n.get('quest_hook', '')}")
                elif isinstance(n, str):
                    lines.append(n)
            self._npc_list.setPlainText("\n".join(lines))
        self._npc_list.textChanged.connect(lambda: self._emit())
        _add_row(form, "NPC 列表", self._npc_list)

        self._antagonists = _text_field("反派设计，每行一个", 60)
        ants = self._data.get("antagonists", [])
        if isinstance(ants, list):
            self._antagonists.setPlainText("\n".join(
                a if isinstance(a, str) else a.get("name", "") for a in ants))
        self._antagonists.textChanged.connect(lambda: self._emit())
        _add_row(form, "反派设计", self._antagonists)

        self._boss_design = _text_field("Boss 设计，每行一个（名称 | 机制 | 阶段 | 奖励）", 80)
        bosses = self._data.get("boss_design", [])
        if isinstance(bosses, list):
            lines = []
            for b in bosses:
                if isinstance(b, dict):
                    lines.append(f"{b.get('name', '')} | {b.get('mechanics', '')} | "
                                 f"{b.get('phases', '')} | {b.get('rewards', '')}")
                elif isinstance(b, str):
                    lines.append(b)
            self._boss_design.setPlainText("\n".join(lines))
        self._boss_design.textChanged.connect(lambda: self._emit())
        _add_row(form, "Boss 设计", self._boss_design)

        self._companion = _text_field("同伴系统说明", 60)
        self._companion.setPlainText(_safe_text(self._data.get("companion_system", "")))
        self._companion.textChanged.connect(lambda: self._emit())
        _add_row(form, "同伴系统", self._companion)

        self._arcs = _text_field("角色成长弧线，每行一个", 60)
        arcs = self._data.get("character_arcs", [])
        if isinstance(arcs, list):
            self._arcs.setPlainText("\n".join(arcs))
        self._arcs.textChanged.connect(lambda: self._emit())
        _add_row(form, "角色成长弧线", self._arcs)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("characters", self.get_data())

    def get_data(self) -> dict:
        npc_text = self._npc_list.toPlainText().strip()
        npc_list = []
        if npc_text:
            for line in npc_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                npc_list.append({
                    "name": parts[0] if len(parts) > 0 else "",
                    "role": parts[1] if len(parts) > 1 else "",
                    "location": parts[2] if len(parts) > 2 else "",
                    "personality": parts[3] if len(parts) > 3 else "",
                    "quest_hook": parts[4] if len(parts) > 4 else "",
                })

        boss_text = self._boss_design.toPlainText().strip()
        bosses = []
        if boss_text:
            for line in boss_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                bosses.append({
                    "name": parts[0] if len(parts) > 0 else "",
                    "mechanics": parts[1] if len(parts) > 1 else "",
                    "phases": parts[2] if len(parts) > 2 else "",
                    "rewards": parts[3] if len(parts) > 3 else "",
                })

        arcs_text = self._arcs.toPlainText().strip()
        arcs = [a.strip() for a in arcs_text.split("\n") if a.strip()] if arcs_text else []

        ants_text = self._antagonists.toPlainText().strip()
        antagonists = [a.strip() for a in ants_text.split("\n") if a.strip()] if ants_text else []

        return {
            "protagonist": self._protagonist.toPlainText().strip(),
            "main_npc_count": self._main_npc_count.value(),
            "npc_list": npc_list,
            "antagonists": antagonists,
            "boss_design": bosses,
            "companion_system": self._companion.toPlainText().strip(),
            "character_arcs": arcs,
            "enemy_types": self._data.get("enemy_types", []),
            "voice_cast": self._data.get("voice_cast", []),
            "character_relationships": self._data.get("character_relationships", []),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._protagonist.setPlainText(data.get("protagonist", ""))
        self._main_npc_count.setValue(data.get("main_npc_count", 0))
        npcs = data.get("npc_list", [])
        if isinstance(npcs, list):
            lines = []
            for n in npcs:
                if isinstance(n, dict):
                    lines.append(f"{n.get('name', '')} | {n.get('role', '')} | "
                                 f"{n.get('location', '')} | {n.get('personality', '')} | "
                                 f"{n.get('quest_hook', '')}")
                elif isinstance(n, str):
                    lines.append(n)
            self._npc_list.setPlainText("\n".join(lines))
        ants = data.get("antagonists", [])
        if isinstance(ants, list):
            self._antagonists.setPlainText("\n".join(
                a if isinstance(a, str) else a.get("name", "") for a in ants))
        bosses = data.get("boss_design", [])
        if isinstance(bosses, list):
            lines = []
            for b in bosses:
                if isinstance(b, dict):
                    lines.append(f"{b.get('name', '')} | {b.get('mechanics', '')} | "
                                 f"{b.get('phases', '')} | {b.get('rewards', '')}")
                elif isinstance(b, str):
                    lines.append(b)
            self._boss_design.setPlainText("\n".join(lines))
        self._companion.setPlainText(data.get("companion_system", ""))
        arcs = data.get("character_arcs", [])
        if isinstance(arcs, list):
            self._arcs.setPlainText("\n".join(arcs))


# === 第十二章：战斗系统设计 ===

class ChapterCombatForm(QWidget):
    """v5.0 工业级补充 — 战斗系统设计章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._combat_mode = _combo(
            ["", "turn_based", "realtime", "semi_realtime", "auto_battle",
             "atb", "ctb", "srpg_grid"],
            self._data.get("combat_mode", ""))
        self._combat_mode.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "战斗模式 *", self._combat_mode, "combat.combat_mode")

        self._damage_formula = _text_field("伤害公式设计", 80)
        self._damage_formula.setPlainText(_safe_text(self._data.get("damage_formula", "")))
        self._damage_formula.textChanged.connect(lambda: self._emit())
        _add_row(form, "伤害公式 *", self._damage_formula, "combat.damage_formula")

        self._skill_system = _text_field("技能系统设计", 80)
        self._skill_system.setPlainText(_safe_text(self._data.get("skill_system", "")))
        self._skill_system.textChanged.connect(lambda: self._emit())
        _add_row(form, "技能系统", self._skill_system)

        self._buff_debuff = _text_field("Buff/Debuff 机制", 60)
        self._buff_debuff.setPlainText(_safe_text(self._data.get("buff_debuff", "")))
        self._buff_debuff.textChanged.connect(lambda: self._emit())
        _add_row(form, "Buff/Debuff", self._buff_debuff)

        self._element_system = _text_field("元素系统", 60)
        self._element_system.setPlainText(_safe_text(self._data.get("element_system", "")))
        self._element_system.textChanged.connect(lambda: self._emit())
        _add_row(form, "元素系统", self._element_system)

        self._combat_pace = _combo(
            ["", "slow", "medium", "fast", "variable"],
            self._data.get("combat_pace", ""))
        self._combat_pace.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "战斗节奏", self._combat_pace)

        self._team_formation = _text_field("队伍编排规则", 60)
        self._team_formation.setPlainText(_safe_text(self._data.get("team_formation", "")))
        self._team_formation.textChanged.connect(lambda: self._emit())
        _add_row(form, "队伍编排", self._team_formation)

        self._pvp = _text_field("PVP 设计", 60)
        self._pvp.setPlainText(_safe_text(self._data.get("pvp_design", "")))
        self._pvp.textChanged.connect(lambda: self._emit())
        _add_row(form, "PVP 设计", self._pvp)

        self._pve = _text_field("PVE 设计", 60)
        self._pve.setPlainText(_safe_text(self._data.get("pve_design", "")))
        self._pve.textChanged.connect(lambda: self._emit())
        _add_row(form, "PVE 设计", self._pve)

        self._boss_mechanics = _text_field("Boss 战机制设计", 80)
        self._boss_mechanics.setPlainText(_safe_text(self._data.get("boss_mechanics", "")))
        self._boss_mechanics.textChanged.connect(lambda: self._emit())
        _add_row(form, "Boss 战机制", self._boss_mechanics)

        self._balance = _text_field("战斗平衡策略", 60)
        self._balance.setPlainText(_safe_text(self._data.get("balance_strategy", "")))
        self._balance.textChanged.connect(lambda: self._emit())
        _add_row(form, "平衡策略", self._balance)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("combat", self.get_data())

    def get_data(self) -> dict:
        return {
            "combat_mode": self._combat_mode.currentText(),
            "damage_formula": self._damage_formula.toPlainText().strip(),
            "skill_system": self._skill_system.toPlainText().strip(),
            "buff_debuff": self._buff_debuff.toPlainText().strip(),
            "element_system": self._element_system.toPlainText().strip(),
            "combat_pace": self._combat_pace.currentText(),
            "team_formation": self._team_formation.toPlainText().strip(),
            "pvp_design": self._pvp.toPlainText().strip(),
            "pve_design": self._pve.toPlainText().strip(),
            "boss_mechanics": self._boss_mechanics.toPlainText().strip(),
            "combat_progression": self._data.get("combat_progression", ""),
            "balance_strategy": self._balance.toPlainText().strip(),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._combat_mode.setCurrentText(data.get("combat_mode", ""))
        self._damage_formula.setPlainText(data.get("damage_formula", ""))
        self._skill_system.setPlainText(data.get("skill_system", ""))
        self._buff_debuff.setPlainText(data.get("buff_debuff", ""))
        self._element_system.setPlainText(data.get("element_system", ""))
        self._combat_pace.setCurrentText(data.get("combat_pace", ""))
        self._team_formation.setPlainText(data.get("team_formation", ""))
        self._pvp.setPlainText(data.get("pvp_design", ""))
        self._pve.setPlainText(data.get("pve_design", ""))
        self._boss_mechanics.setPlainText(data.get("boss_mechanics", ""))
        self._balance.setPlainText(data.get("balance_strategy", ""))


# === 第十三章：经济系统设计 ===

class ChapterEconomyForm(QWidget):
    """v5.0 工业级补充 — 经济系统设计章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._currency_types = _text_field("货币类型，每行一个（名称 | 产出 | 回收 | 兑换率）", 80)
        curs = self._data.get("currency_types", [])
        if isinstance(curs, list):
            lines = []
            for c in curs:
                if isinstance(c, dict):
                    lines.append(f"{c.get('name', '')} | {c.get('source', '')} | "
                                 f"{c.get('sink', '')} | {c.get('exchange_rate', '')}")
                elif isinstance(c, str):
                    lines.append(c)
            self._currency_types.setPlainText("\n".join(lines))
        self._currency_types.textChanged.connect(lambda: self._emit())
        _add_row(form, "货币类型 *", self._currency_types, "economy.currency_types")

        self._source_sink = _text_field("产出与回收机制总览", 80)
        self._source_sink.setPlainText(_safe_text(self._data.get("source_sink", "")))
        self._source_sink.textChanged.connect(lambda: self._emit())
        _add_row(form, "产出与回收 *", self._source_sink, "economy.source_sink")

        self._drop_tables = _text_field("掉落表设计，每行一个", 60)
        drops = self._data.get("drop_tables", [])
        if isinstance(drops, list):
            self._drop_tables.setPlainText("\n".join(
                d if isinstance(d, str) else str(d) for d in drops))
        self._drop_tables.textChanged.connect(lambda: self._emit())
        _add_row(form, "掉落表", self._drop_tables)

        self._production_chain = _text_field("生产链/合成链说明", 60)
        self._production_chain.setPlainText(_safe_text(self._data.get("production_chain", "")))
        self._production_chain.textChanged.connect(lambda: self._emit())
        _add_row(form, "生产链", self._production_chain)

        self._market_design = _text_field("交易市场设计", 60)
        self._market_design.setPlainText(_safe_text(self._data.get("market_design", "")))
        self._market_design.textChanged.connect(lambda: self._emit())
        _add_row(form, "交易市场", self._market_design)

        self._inflation = _text_field("通胀控制策略", 60)
        self._inflation.setPlainText(_safe_text(self._data.get("inflation_control", "")))
        self._inflation.textChanged.connect(lambda: self._emit())
        _add_row(form, "通胀控制", self._inflation)

        self._economic_goals = _text_field("经济目标（玩家体验/盈利平衡）", 60)
        self._economic_goals.setPlainText(_safe_text(self._data.get("economic_goals", "")))
        self._economic_goals.textChanged.connect(lambda: self._emit())
        _add_row(form, "经济目标", self._economic_goals)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("economy", self.get_data())

    def get_data(self) -> dict:
        cur_text = self._currency_types.toPlainText().strip()
        curs = []
        if cur_text:
            for line in cur_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                curs.append({
                    "name": parts[0] if len(parts) > 0 else "",
                    "source": parts[1] if len(parts) > 1 else "",
                    "sink": parts[2] if len(parts) > 2 else "",
                    "exchange_rate": parts[3] if len(parts) > 3 else "",
                })

        drops_text = self._drop_tables.toPlainText().strip()
        drops = [d.strip() for d in drops_text.split("\n") if d.strip()] if drops_text else []

        return {
            "currency_types": curs,
            "source_sink": self._source_sink.toPlainText().strip(),
            "drop_tables": drops,
            "production_chain": self._production_chain.toPlainText().strip(),
            "market_design": self._market_design.toPlainText().strip(),
            "inflation_control": self._inflation.toPlainText().strip(),
            "economic_goals": self._economic_goals.toPlainText().strip(),
            "metrics_tracking": self._data.get("metrics_tracking", []),
            "seasonal_adjustment": self._data.get("seasonal_adjustment", ""),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        curs = data.get("currency_types", [])
        if isinstance(curs, list):
            lines = []
            for c in curs:
                if isinstance(c, dict):
                    lines.append(f"{c.get('name', '')} | {c.get('source', '')} | "
                                 f"{c.get('sink', '')} | {c.get('exchange_rate', '')}")
                elif isinstance(c, str):
                    lines.append(c)
            self._currency_types.setPlainText("\n".join(lines))
        self._source_sink.setPlainText(data.get("source_sink", ""))
        drops = data.get("drop_tables", [])
        if isinstance(drops, list):
            self._drop_tables.setPlainText("\n".join(
                d if isinstance(d, str) else str(d) for d in drops))
        self._production_chain.setPlainText(data.get("production_chain", ""))
        self._market_design.setPlainText(data.get("market_design", ""))
        self._inflation.setPlainText(data.get("inflation_control", ""))
        self._economic_goals.setPlainText(data.get("economic_goals", ""))


# === 第十四章：商业化设计 ===

class ChapterMonetizationForm(QWidget):
    """v5.0 工业级补充 — 商业化设计章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._payment_model = _combo(
            ["", "f2p", "p2p", "b2p", "subscription", "f2p_p2w", "f2p_cosmetic", "buy_to_play"],
            self._data.get("payment_model", ""))
        self._payment_model.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "付费模式 *", self._payment_model, "monetization.payment_model")

        self._pricing_tiers = _text_field("定价档位，每行一个（如 6/30/68/128/328/648）", 60)
        tiers = self._data.get("pricing_tiers", [])
        if isinstance(tiers, list):
            self._pricing_tiers.setPlainText("\n".join(str(t) for t in tiers))
        self._pricing_tiers.textChanged.connect(lambda: self._emit())
        _add_row(form, "定价档位 *", self._pricing_tiers)

        self._iap = _text_field("内购设计，每行一个（物品 | 价格 | 价值 | 目标用户）", 80)
        iaps = self._data.get("iap_design", [])
        if isinstance(iaps, list):
            lines = []
            for i in iaps:
                if isinstance(i, dict):
                    lines.append(f"{i.get('item', '')} | {i.get('price', '')} | "
                                 f"{i.get('value', '')} | {i.get('target', '')}")
                elif isinstance(i, str):
                    lines.append(i)
            self._iap.setPlainText("\n".join(lines))
        self._iap.textChanged.connect(lambda: self._emit())
        _add_row(form, "内购设计", self._iap)

        self._ad_strategy = _text_field("广告策略", 60)
        self._ad_strategy.setPlainText(_safe_text(self._data.get("ad_strategy", "")))
        self._ad_strategy.textChanged.connect(lambda: self._emit())
        _add_row(form, "广告策略", self._ad_strategy)

        self._subscription = _text_field("订阅制设计", 60)
        self._subscription.setPlainText(data.get("subscription_design", "") if isinstance(data, dict) else "")
        self._subscription.textChanged.connect(lambda: self._emit())
        _add_row(form, "订阅制", self._subscription)

        self._season_pass = _text_field("赛季通行证设计", 60)
        self._season_pass.setPlainText(_safe_text(self._data.get("season_pass", "")))
        self._season_pass.textChanged.connect(lambda: self._emit())
        _add_row(form, "赛季通行证", self._season_pass)

        self._vip = _text_field("VIP 系统设计", 60)
        self._vip.setPlainText(_safe_text(self._data.get("vip_system", "")))
        self._vip.textChanged.connect(lambda: self._emit())
        _add_row(form, "VIP 系统", self._vip)

        self._whale = _text_field("大 R 策略", 60)
        self._whale.setPlainText(_safe_text(self._data.get("whale_strategy", "")))
        self._whale.textChanged.connect(lambda: self._emit())
        _add_row(form, "大 R 策略", self._whale)

        self._f2p_exp = _text_field("免费玩家体验保障", 60)
        self._f2p_exp.setPlainText(_safe_text(self._data.get("f2p_experience", "")))
        self._f2p_exp.textChanged.connect(lambda: self._emit())
        _add_row(form, "免费玩家体验", self._f2p_exp)

        self._arpu = _text_field("ARPU 目标", 60)
        self._arpu.setPlainText(_safe_text(self._data.get("arpu_target", "")))
        self._arpu.textChanged.connect(lambda: self._emit())
        _add_row(form, "ARPU 目标", self._arpu)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("monetization", self.get_data())

    def get_data(self) -> dict:
        tiers_text = self._pricing_tiers.toPlainText().strip()
        tiers = [t.strip() for t in tiers_text.split("\n") if t.strip()] if tiers_text else []

        iap_text = self._iap.toPlainText().strip()
        iaps = []
        if iap_text:
            for line in iap_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                iaps.append({
                    "item": parts[0] if len(parts) > 0 else "",
                    "price": parts[1] if len(parts) > 1 else "",
                    "value": parts[2] if len(parts) > 2 else "",
                    "target": parts[3] if len(parts) > 3 else "",
                })

        return {
            "payment_model": self._payment_model.currentText(),
            "pricing_tiers": tiers,
            "iap_design": iaps,
            "ad_strategy": self._ad_strategy.toPlainText().strip(),
            "subscription_design": self._subscription.toPlainText().strip(),
            "season_pass": self._season_pass.toPlainText().strip(),
            "vip_system": self._vip.toPlainText().strip(),
            "limited_offers": self._data.get("limited_offers", ""),
            "whale_strategy": self._whale.toPlainText().strip(),
            "f2p_experience": self._f2p_exp.toPlainText().strip(),
            "revenue_forecast": self._data.get("revenue_forecast", {}),
            "arpu_target": self._arpu.toPlainText().strip(),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._payment_model.setCurrentText(data.get("payment_model", ""))
        tiers = data.get("pricing_tiers", [])
        if isinstance(tiers, list):
            self._pricing_tiers.setPlainText("\n".join(str(t) for t in tiers))
        iaps = data.get("iap_design", [])
        if isinstance(iaps, list):
            lines = []
            for i in iaps:
                if isinstance(i, dict):
                    lines.append(f"{i.get('item', '')} | {i.get('price', '')} | "
                                 f"{i.get('value', '')} | {i.get('target', '')}")
                elif isinstance(i, str):
                    lines.append(i)
            self._iap.setPlainText("\n".join(lines))
        self._ad_strategy.setPlainText(data.get("ad_strategy", ""))
        self._subscription.setPlainText(data.get("subscription_design", ""))
        self._season_pass.setPlainText(data.get("season_pass", ""))
        self._vip.setPlainText(data.get("vip_system", ""))
        self._whale.setPlainText(data.get("whale_strategy", ""))
        self._f2p_exp.setPlainText(data.get("f2p_experience", ""))
        self._arpu.setPlainText(data.get("arpu_target", ""))


# === 第十五章：MVP 规划 ===

class ChapterMvpForm(QWidget):
    """v5.0 工业级补充 — MVP 规划章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._mvp_scope = _text_field("MVP 范围定义", 100)
        self._mvp_scope.setPlainText(_safe_text(self._data.get("mvp_scope", "")))
        self._mvp_scope.textChanged.connect(lambda: self._emit())
        _add_row(form, "MVP 范围 *", self._mvp_scope, "mvp.mvp_scope")

        self._mvp_timeline = _text_field("MVP 时间线（开始/结束/关键节点）", 80)
        self._mvp_timeline.setPlainText(_safe_text(self._data.get("mvp_timeline", "")))
        self._mvp_timeline.textChanged.connect(lambda: self._emit())
        _add_row(form, "MVP 时间线 *", self._mvp_timeline, "mvp.mvp_timeline")

        self._core_features = _text_field("核心特性清单，每行一个", 80)
        feats = self._data.get("core_features", [])
        if isinstance(feats, list):
            self._core_features.setPlainText("\n".join(
                f if isinstance(f, str) else f.get("name", str(f)) for f in feats))
        self._core_features.textChanged.connect(lambda: self._emit())
        _add_row(form, "核心特性", self._core_features)

        self._cut_features = _text_field("暂缓特性清单，每行一个", 60)
        cuts = self._data.get("cut_features", [])
        if isinstance(cuts, list):
            self._cut_features.setPlainText("\n".join(
                c if isinstance(c, str) else str(c) for c in cuts))
        self._cut_features.textChanged.connect(lambda: self._emit())
        _add_row(form, "暂缓特性", self._cut_features)

        self._milestones = _text_field("里程碑，每行一个（名称 | 日期 | 交付物 | 验收标准）", 80)
        ms = self._data.get("milestones", [])
        if isinstance(ms, list):
            lines = []
            for m in ms:
                if isinstance(m, dict):
                    lines.append(f"{m.get('name', '')} | {m.get('date', '')} | "
                                 f"{m.get('deliverables', '')} | {m.get('acceptance', '')}")
                elif isinstance(m, str):
                    lines.append(m)
            self._milestones.setPlainText("\n".join(lines))
        self._milestones.textChanged.connect(lambda: self._emit())
        _add_row(form, "里程碑", self._milestones)

        self._success_criteria = _text_field("成功标准", 60)
        self._success_criteria.setPlainText(_safe_text(self._data.get("success_criteria", "")))
        self._success_criteria.textChanged.connect(lambda: self._emit())
        _add_row(form, "成功标准", self._success_criteria)

        self._team_size = QSpinBox()
        self._team_size.setRange(0, 999)
        self._team_size.setValue(self._data.get("team_size", 0))
        self._team_size.setStyleSheet(ceshu_form_input_qss())
        self._team_size.valueChanged.connect(lambda: self._emit())
        _add_row(form, "团队规模", self._team_size)

        self._budget = _text_field("预算估算", 60)
        self._budget.setPlainText(_safe_text(self._data.get("budget_estimate", "")))
        self._budget.textChanged.connect(lambda: self._emit())
        _add_row(form, "预算估算", self._budget)

        self._playtest = _text_field("试玩测试计划", 60)
        self._playtest.setPlainText(_safe_text(self._data.get("playtest_plan", "")))
        self._playtest.textChanged.connect(lambda: self._emit())
        _add_row(form, "试玩测试", self._playtest)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("mvp", self.get_data())

    def get_data(self) -> dict:
        core_text = self._core_features.toPlainText().strip()
        core = [f.strip() for f in core_text.split("\n") if f.strip()] if core_text else []

        cut_text = self._cut_features.toPlainText().strip()
        cuts = [c.strip() for c in cut_text.split("\n") if c.strip()] if cut_text else []

        ms_text = self._milestones.toPlainText().strip()
        ms = []
        if ms_text:
            for line in ms_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                ms.append({
                    "name": parts[0] if len(parts) > 0 else "",
                    "date": parts[1] if len(parts) > 1 else "",
                    "deliverables": parts[2] if len(parts) > 2 else "",
                    "acceptance": parts[3] if len(parts) > 3 else "",
                })

        return {
            "mvp_scope": self._mvp_scope.toPlainText().strip(),
            "mvp_timeline": self._mvp_timeline.toPlainText().strip(),
            "core_features": core,
            "cut_features": cuts,
            "prototype_features": self._data.get("prototype_features", []),
            "milestones": ms,
            "success_criteria": self._success_criteria.toPlainText().strip(),
            "team_size": self._team_size.value(),
            "budget_estimate": self._budget.toPlainText().strip(),
            "risk_assessment": self._data.get("risk_assessment", ""),
            "prototype_plan": self._data.get("prototype_plan", ""),
            "playtest_plan": self._playtest.toPlainText().strip(),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._mvp_scope.setPlainText(data.get("mvp_scope", ""))
        self._mvp_timeline.setPlainText(data.get("mvp_timeline", ""))
        feats = data.get("core_features", [])
        if isinstance(feats, list):
            self._core_features.setPlainText("\n".join(
                f if isinstance(f, str) else f.get("name", str(f)) for f in feats))
        cuts = data.get("cut_features", [])
        if isinstance(cuts, list):
            self._cut_features.setPlainText("\n".join(
                c if isinstance(c, str) else str(c) for c in cuts))
        ms = data.get("milestones", [])
        if isinstance(ms, list):
            lines = []
            for m in ms:
                if isinstance(m, dict):
                    lines.append(f"{m.get('name', '')} | {m.get('date', '')} | "
                                 f"{m.get('deliverables', '')} | {m.get('acceptance', '')}")
                elif isinstance(m, str):
                    lines.append(m)
            self._milestones.setPlainText("\n".join(lines))
        self._success_criteria.setPlainText(data.get("success_criteria", ""))
        self._team_size.setValue(data.get("team_size", 0))
        self._budget.setPlainText(data.get("budget_estimate", ""))
        self._playtest.setPlainText(data.get("playtest_plan", ""))


# === 第十六章：风险控制 ===

class ChapterRiskHandlingForm(QWidget):
    """v5.0 工业级补充 — 风险控制章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._risk_matrix = _text_field(
            "风险矩阵，每行一个（风险 | 概率 | 影响 | 应对 | 负责人）", 100)
        risks = self._data.get("risk_matrix", [])
        if isinstance(risks, list):
            lines = []
            for r in risks:
                if isinstance(r, dict):
                    lines.append(f"{r.get('risk', '')} | {r.get('probability', '')} | "
                                 f"{r.get('impact', '')} | {r.get('mitigation', '')} | "
                                 f"{r.get('owner', '')}")
                elif isinstance(r, str):
                    lines.append(r)
            self._risk_matrix.setPlainText("\n".join(lines))
        self._risk_matrix.textChanged.connect(lambda: self._emit())
        _add_row(form, "风险矩阵 *", self._risk_matrix, "risk_handling.risk_matrix")

        self._contingency = _text_field("应急预案", 80)
        self._contingency.setPlainText(_safe_text(self._data.get("contingency_plan", "")))
        self._contingency.textChanged.connect(lambda: self._emit())
        _add_row(form, "应急预案 *", self._contingency, "risk_handling.contingency_plan")

        self._technical = _text_field("技术风险，每行一个", 60)
        techs = self._data.get("technical_risks", [])
        if isinstance(techs, list):
            self._technical.setPlainText("\n".join(
                t if isinstance(t, str) else str(t) for t in techs))
        self._technical.textChanged.connect(lambda: self._emit())
        _add_row(form, "技术风险", self._technical)

        self._market = _text_field("市场风险，每行一个", 60)
        markets = self._data.get("market_risks", [])
        if isinstance(markets, list):
            self._market.setPlainText("\n".join(
                m if isinstance(m, str) else str(m) for m in markets))
        self._market.textChanged.connect(lambda: self._emit())
        _add_row(form, "市场风险", self._market)

        self._team = _text_field("团队风险，每行一个", 60)
        teams = self._data.get("team_risks", [])
        if isinstance(teams, list):
            self._team.setPlainText("\n".join(
                t if isinstance(t, str) else str(t) for t in teams))
        self._team.textChanged.connect(lambda: self._emit())
        _add_row(form, "团队风险", self._team)

        self._legal = _text_field("法律合规风险，每行一个", 60)
        legals = self._data.get("legal_risks", [])
        if isinstance(legals, list):
            self._legal.setPlainText("\n".join(
                item if isinstance(item, str) else str(item) for item in legals))
        self._legal.textChanged.connect(lambda: self._emit())
        _add_row(form, "法律风险", self._legal)

        self._schedule = _text_field("进度风险，每行一个", 60)
        schedules = self._data.get("schedule_risks", [])
        if isinstance(schedules, list):
            self._schedule.setPlainText("\n".join(
                s if isinstance(s, str) else str(s) for s in schedules))
        self._schedule.textChanged.connect(lambda: self._emit())
        _add_row(form, "进度风险", self._schedule)

        self._monitoring = _text_field("风险监控机制", 60)
        self._monitoring.setPlainText(_safe_text(self._data.get("risk_monitoring", "")))
        self._monitoring.textChanged.connect(lambda: self._emit())
        _add_row(form, "风险监控", self._monitoring)

        self._crisis = _text_field("危机管理预案", 80)
        self._crisis.setPlainText(_safe_text(self._data.get("crisis_management", "")))
        self._crisis.textChanged.connect(lambda: self._emit())
        _add_row(form, "危机管理", self._crisis)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("risk_handling", self.get_data())

    def get_data(self) -> dict:
        risk_text = self._risk_matrix.toPlainText().strip()
        risks = []
        if risk_text:
            for line in risk_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                risks.append({
                    "risk": parts[0] if len(parts) > 0 else "",
                    "probability": parts[1] if len(parts) > 1 else "",
                    "impact": parts[2] if len(parts) > 2 else "",
                    "mitigation": parts[3] if len(parts) > 3 else "",
                    "owner": parts[4] if len(parts) > 4 else "",
                })

        def _lines(field):
            t = field.toPlainText().strip()
            return [x.strip() for x in t.split("\n") if x.strip()] if t else []

        return {
            "risk_matrix": risks,
            "contingency_plan": self._contingency.toPlainText().strip(),
            "technical_risks": _lines(self._technical),
            "market_risks": _lines(self._market),
            "team_risks": _lines(self._team),
            "legal_risks": _lines(self._legal),
            "schedule_risks": _lines(self._schedule),
            "risk_monitoring": self._monitoring.toPlainText().strip(),
            "escalation_path": self._data.get("escalation_path", ""),
            "crisis_management": self._crisis.toPlainText().strip(),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        risks = data.get("risk_matrix", [])
        if isinstance(risks, list):
            lines = []
            for r in risks:
                if isinstance(r, dict):
                    lines.append(f"{r.get('risk', '')} | {r.get('probability', '')} | "
                                 f"{r.get('impact', '')} | {r.get('mitigation', '')} | "
                                 f"{r.get('owner', '')}")
                elif isinstance(r, str):
                    lines.append(r)
            self._risk_matrix.setPlainText("\n".join(lines))
        self._contingency.setPlainText(data.get("contingency_plan", ""))
        for field_name, key in [
            (self._technical, "technical_risks"),
            (self._market, "market_risks"),
            (self._team, "team_risks"),
            (self._legal, "legal_risks"),
            (self._schedule, "schedule_risks"),
        ]:
            v = data.get(key, [])
            if isinstance(v, list):
                field_name.setPlainText("\n".join(
                    x if isinstance(x, str) else str(x) for x in v))
        self._monitoring.setPlainText(data.get("risk_monitoring", ""))
        self._crisis.setPlainText(data.get("crisis_management", ""))


# === 第十七章：音频设计 ===

class ChapterAudioForm(QWidget):
    """v5.0 工业级补充 — 音频设计章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._music_style = _text_field("音乐风格定位", 60)
        self._music_style.setPlainText(_safe_text(self._data.get("music_style", "")))
        self._music_style.textChanged.connect(lambda: self._emit())
        _add_row(form, "音乐风格 *", self._music_style, "audio.music_style")

        self._sfx_count = QSpinBox()
        self._sfx_count.setRange(0, 99999)
        self._sfx_count.setValue(self._data.get("sfx_count", 0))
        self._sfx_count.setStyleSheet(ceshu_form_input_qss())
        self._sfx_count.valueChanged.connect(lambda: self._emit())
        _add_row(form, "音效数量估算 *", self._sfx_count)

        self._soundtrack = _text_field("配乐清单，每行一个（场景 | 时长 | 情绪 | 作曲者）", 80)
        sds = self._data.get("soundtrack_list", [])
        if isinstance(sds, list):
            lines = []
            for s in sds:
                if isinstance(s, dict):
                    lines.append(f"{s.get('scene', '')} | {s.get('duration', '')} | "
                                 f"{s.get('mood', '')} | {s.get('composer', '')}")
                elif isinstance(s, str):
                    lines.append(s)
            self._soundtrack.setPlainText("\n".join(lines))
        self._soundtrack.textChanged.connect(lambda: self._emit())
        _add_row(form, "配乐清单", self._soundtrack)

        self._sfx_list = _text_field("音效清单，每行一个（类别 | 数量 | 描述）", 80)
        sfxs = self._data.get("sfx_list", [])
        if isinstance(sfxs, list):
            lines = []
            for s in sfxs:
                if isinstance(s, dict):
                    lines.append(f"{s.get('category', '')} | {s.get('count', '')} | {s.get('description', '')}")
                elif isinstance(s, str):
                    lines.append(s)
            self._sfx_list.setPlainText("\n".join(lines))
        self._sfx_list.textChanged.connect(lambda: self._emit())
        _add_row(form, "音效清单", self._sfx_list)

        self._voice = _text_field("配音设计", 60)
        self._voice.setPlainText(_safe_text(self._data.get("voice_acting", "")))
        self._voice.textChanged.connect(lambda: self._emit())
        _add_row(form, "配音设计", self._voice)

        self._audio_engine = _combo(
            ["", "FMOD", "Wwise", "CRI ADX", "Unity Audio", "Unreal Audio", "自研"],
            self._data.get("audio_engine", ""))
        self._audio_engine.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "音频引擎", self._audio_engine)

        self._dynamic = _text_field("动态音频/自适应音乐", 60)
        self._dynamic.setPlainText(_safe_text(self._data.get("dynamic_audio", "")))
        self._dynamic.textChanged.connect(lambda: self._emit())
        _add_row(form, "动态音频", self._dynamic)

        self._audio_loc = _text_field("音频本地化", 60)
        self._audio_loc.setPlainText(_safe_text(self._data.get("audio_localization", "")))
        self._audio_loc.textChanged.connect(lambda: self._emit())
        _add_row(form, "音频本地化", self._audio_loc)

        self._audio_budget = _text_field("音频预算", 60)
        self._audio_budget.setPlainText(_safe_text(self._data.get("audio_budget", "")))
        self._audio_budget.textChanged.connect(lambda: self._emit())
        _add_row(form, "音频预算", self._audio_budget)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("audio", self.get_data())

    def get_data(self) -> dict:
        sd_text = self._soundtrack.toPlainText().strip()
        sds = []
        if sd_text:
            for line in sd_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                sds.append({
                    "scene": parts[0] if len(parts) > 0 else "",
                    "duration": parts[1] if len(parts) > 1 else "",
                    "mood": parts[2] if len(parts) > 2 else "",
                    "composer": parts[3] if len(parts) > 3 else "",
                })

        sfx_text = self._sfx_list.toPlainText().strip()
        sfxs = []
        if sfx_text:
            for line in sfx_text.split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split("|")]
                sfxs.append({
                    "category": parts[0] if len(parts) > 0 else "",
                    "count": parts[1] if len(parts) > 1 else "",
                    "description": parts[2] if len(parts) > 2 else "",
                })

        return {
            "music_style": self._music_style.toPlainText().strip(),
            "sfx_count": self._sfx_count.value(),
            "soundtrack_list": sds,
            "sfx_list": sfxs,
            "voice_acting": self._voice.toPlainText().strip(),
            "audio_engine": self._audio_engine.currentText(),
            "dynamic_audio": self._dynamic.toPlainText().strip(),
            "audio_localization": self._audio_loc.toPlainText().strip(),
            "audio_budget": self._audio_budget.toPlainText().strip(),
            "audio_milestones": self._data.get("audio_milestones", []),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._music_style.setPlainText(data.get("music_style", ""))
        self._sfx_count.setValue(data.get("sfx_count", 0))
        sds = data.get("soundtrack_list", [])
        if isinstance(sds, list):
            lines = []
            for s in sds:
                if isinstance(s, dict):
                    lines.append(f"{s.get('scene', '')} | {s.get('duration', '')} | "
                                 f"{s.get('mood', '')} | {s.get('composer', '')}")
                elif isinstance(s, str):
                    lines.append(s)
            self._soundtrack.setPlainText("\n".join(lines))
        sfxs = data.get("sfx_list", [])
        if isinstance(sfxs, list):
            lines = []
            for s in sfxs:
                if isinstance(s, dict):
                    lines.append(f"{s.get('category', '')} | {s.get('count', '')} | {s.get('description', '')}")
                elif isinstance(s, str):
                    lines.append(s)
            self._sfx_list.setPlainText("\n".join(lines))
        self._voice.setPlainText(data.get("voice_acting", ""))
        self._audio_engine.setCurrentText(data.get("audio_engine", ""))
        self._dynamic.setPlainText(data.get("dynamic_audio", ""))
        self._audio_loc.setPlainText(data.get("audio_localization", ""))
        self._audio_budget.setPlainText(data.get("audio_budget", ""))


# === 第十八章：可访问性与本地化 ===

class ChapterAccessibilityForm(QWidget):
    """v5.0 工业级补充 — 可访问性与本地化章节表单"""
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._languages = _text_field("支持语言列表，每行一个（如：简体中文、English、日本語）", 60)
        langs = self._data.get("language_list", [])
        if isinstance(langs, list):
            self._languages.setPlainText("\n".join(langs))
        self._languages.textChanged.connect(lambda: self._emit())
        _add_row(form, "支持语言 *", self._languages, "accessibility.language_list")

        self._loc_strategy = _text_field("本地化策略", 60)
        self._loc_strategy.setPlainText(_safe_text(self._data.get("localization_strategy", "")))
        self._loc_strategy.textChanged.connect(lambda: self._emit())
        _add_row(form, "本地化策略", self._loc_strategy)

        self._cultural = _text_field("文化适配（节日/敏感内容/数值单位）", 80)
        self._cultural.setPlainText(_safe_text(self._data.get("cultural_adaptation", "")))
        self._cultural.textChanged.connect(lambda: self._emit())
        _add_row(form, "文化适配", self._cultural)

        self._features = _text_field("无障碍特性，每行一个（如：色盲模式、字幕、手柄支持）", 60)
        feats = self._data.get("accessibility_features", [])
        if isinstance(feats, list):
            self._features.setPlainText("\n".join(feats))
        self._features.textChanged.connect(lambda: self._emit())
        _add_row(form, "无障碍特性 *", self._features, "accessibility.accessibility_features")

        self._subtitle = _text_field("字幕设计", 60)
        self._subtitle.setPlainText(_safe_text(self._data.get("subtitle_design", "")))
        self._subtitle.textChanged.connect(lambda: self._emit())
        _add_row(form, "字幕设计", self._subtitle)

        self._color_blind = _text_field("色盲支持", 60)
        self._color_blind.setPlainText(_safe_text(self._data.get("color_blind_support", "")))
        self._color_blind.textChanged.connect(lambda: self._emit())
        _add_row(form, "色盲支持", self._color_blind)

        self._motor = _text_field("运动无障碍", 60)
        self._motor.setPlainText(_safe_text(self._data.get("motor_accessibility", "")))
        self._motor.textChanged.connect(lambda: self._emit())
        _add_row(form, "运动无障碍", self._motor)

        self._cognitive = _text_field("认知无障碍", 60)
        self._cognitive.setPlainText(_safe_text(self._data.get("cognitive_accessibility", "")))
        self._cognitive.textChanged.connect(lambda: self._emit())
        _add_row(form, "认知无障碍", self._cognitive)

        self._rating = _text_field("分级认证（ESRB/PEGI/CERO/GRAC），每行一个", 60)
        ratings = self._data.get("rating_certification", [])
        if isinstance(ratings, list):
            self._rating.setPlainText("\n".join(
                r if isinstance(r, str) else str(r) for r in ratings))
        self._rating.textChanged.connect(lambda: self._emit())
        _add_row(form, "分级认证", self._rating)

        self._compliance = _text_field("合规备注", 80)
        self._compliance.setPlainText(_safe_text(self._data.get("compliance_notes", "")))
        self._compliance.textChanged.connect(lambda: self._emit())
        _add_row(form, "合规备注", self._compliance)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("accessibility", self.get_data())

    def get_data(self) -> dict:
        lang_text = self._languages.toPlainText().strip()
        langs = [line.strip() for line in lang_text.split("\n") if line.strip()] if lang_text else []

        feat_text = self._features.toPlainText().strip()
        feats = [f.strip() for f in feat_text.split("\n") if f.strip()] if feat_text else []

        rating_text = self._rating.toPlainText().strip()
        ratings = [r.strip() for r in rating_text.split("\n") if r.strip()] if rating_text else []

        return {
            "language_list": langs,
            "localization_strategy": self._loc_strategy.toPlainText().strip(),
            "cultural_adaptation": self._cultural.toPlainText().strip(),
            "accessibility_features": feats,
            "subtitle_design": self._subtitle.toPlainText().strip(),
            "color_blind_support": self._color_blind.toPlainText().strip(),
            "motor_accessibility": self._motor.toPlainText().strip(),
            "cognitive_accessibility": self._cognitive.toPlainText().strip(),
            "rating_certification": ratings,
            "compliance_notes": self._compliance.toPlainText().strip(),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        langs = data.get("language_list", [])
        if isinstance(langs, list):
            self._languages.setPlainText("\n".join(langs))
        self._loc_strategy.setPlainText(data.get("localization_strategy", ""))
        self._cultural.setPlainText(data.get("cultural_adaptation", ""))
        feats = data.get("accessibility_features", [])
        if isinstance(feats, list):
            self._features.setPlainText("\n".join(feats))
        self._subtitle.setPlainText(data.get("subtitle_design", ""))
        self._color_blind.setPlainText(data.get("color_blind_support", ""))
        self._motor.setPlainText(data.get("motor_accessibility", ""))
        self._cognitive.setPlainText(data.get("cognitive_accessibility", ""))
        ratings = data.get("rating_certification", [])
        if isinstance(ratings, list):
            self._rating.setPlainText("\n".join(
                r if isinstance(r, str) else str(r) for r in ratings))
        self._compliance.setPlainText(data.get("compliance_notes", ""))
