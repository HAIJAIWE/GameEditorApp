"""策划书表单组件。"""
from __future__ import annotations

import json

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QFormLayout,
    QHBoxLayout,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from ._common import (
    _add_row,
    _combo,
    _line_field,
    _safe_text,
    _text_field,
    ceshu_form_input_qss,
)


def _join_items(items, sep: str = "\n") -> str:
    """把列表字段安全转为文本：dict 元素提取 name 或序列化为 JSON，避免 join 崩溃。

    AI 生成或历史数据里可能混入 dict（如 game_modes=[{name,desc}]），
    直接 "\n".join 会抛 TypeError，这里做兜底转换。
    """
    if not items:
        return ""
    parts = []
    for it in items:
        if isinstance(it, str):
            parts.append(it)
        elif isinstance(it, dict):
            name = it.get("name") or it.get("label") or it.get("title")
            if isinstance(name, str) and name:
                parts.append(name)
            else:
                try:
                    parts.append(json.dumps(it, ensure_ascii=False))
                except Exception:
                    parts.append(str(it))
        else:
            parts.append(str(it))
    return sep.join(parts)


class ChapterMetaForm(QWidget):
    data_changed = pyqtSignal(str, object)  # chapter_key, data
    ai_fill_requested = pyqtSignal(str)  # field_path

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        self._setup_ui()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._game_name = _line_field("输入游戏名称")
        self._game_name.setText(_safe_text(self._data.get("game_name", "")))
        self._game_name.textChanged.connect(lambda: self._emit())
        _add_row(form, "游戏名称 *", self._game_name, "meta.game_name")

        self._game_type = _combo([
            "RPG", "MMORPG", "ARPG", "战棋", "SLG", "RTS", "MOBA", "FPS", "TPS",
            "格斗", "大逃杀", "非对称竞技", "卡牌", "塔防", "模拟经营", "开放世界",
            "Roguelike", "生存建造", "视觉小说", "放置", "派对", "休闲益智",
        ], self._data.get("game_type", ""))
        self._game_type.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "游戏类型 *", self._game_type)

        self._platform_pc = QCheckBox("PC")
        self._platform_mobile = QCheckBox("移动端")
        self._platform_console = QCheckBox("主机")
        platforms = self._data.get("platform", [])
        self._platform_pc.setChecked("PC" in platforms)
        self._platform_mobile.setChecked("移动端" in platforms)
        self._platform_console.setChecked("主机" in platforms)
        for cb in (self._platform_pc, self._platform_mobile, self._platform_console):
            cb.toggled.connect(lambda: self._emit())
        plat_row = QHBoxLayout()
        plat_row.addWidget(self._platform_pc)
        plat_row.addWidget(self._platform_mobile)
        plat_row.addWidget(self._platform_console)
        plat_row.addStretch()
        plat_w = QWidget()
        plat_w.setLayout(plat_row)
        _add_row(form, "平台", plat_w)

        self._positioning = QLineEdit()
        self._positioning.setPlaceholderText("一句话描述你的游戏")
        self._positioning.setText(_safe_text(self._data.get("positioning", "")))
        self._positioning.setStyleSheet(ceshu_form_input_qss())
        self._positioning.textChanged.connect(lambda: self._emit())
        _add_row(form, "一句话定位", self._positioning, "meta.positioning")

        self._tags = QLineEdit()
        self._tags.setPlaceholderText("用逗号分隔，如: 剧情向,开放世界,多人联机")
        self._tags.setText(_join_items(self._data.get("tags", []), sep=", "))
        self._tags.setStyleSheet(ceshu_form_input_qss())
        self._tags.textChanged.connect(lambda: self._emit())
        _add_row(form, "特色标签", self._tags)

        self._status = _combo(["draft", "in_progress", "review", "final"],
                               self._data.get("status", "draft"))
        self._status.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "文档状态", self._status)

        self._confidentiality = _combo(["internal", "confidential", "strictly_confidential", "public"],
                                        self._data.get("confidentiality", "internal"))
        _add_row(form, "保密级别", self._confidentiality)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("meta", self.get_data())

    def get_data(self) -> dict:
        platforms = []
        if self._platform_pc.isChecked():
            platforms.append("PC")
        if self._platform_mobile.isChecked():
            platforms.append("移动端")
        if self._platform_console.isChecked():
            platforms.append("主机")
        tags_text = self._tags.text().strip()
        tags = [t.strip() for t in tags_text.split(",") if t.strip()] if tags_text else []
        return {
            "game_name": self._game_name.text().strip(),
            "game_type": self._game_type.currentText(),
            "platform": platforms,
            "positioning": self._positioning.text().strip(),
            "tags": tags,
            "status": self._status.currentText(),
            "confidentiality": self._confidentiality.currentText(),
            "version": self._data.get("version", "0.1.0"),
            "date": self._data.get("date", ""),
        }

    def set_data(self, data: dict) -> None:
        """完整数据回填"""
        self._data = data
        self._game_name.setText(data.get("game_name", ""))
        self._game_type.setCurrentText(data.get("game_type", ""))
        platforms = data.get("platform", [])
        self._platform_pc.setChecked("PC" in platforms)
        self._platform_mobile.setChecked("移动端" in platforms)
        self._platform_console.setChecked("主机" in platforms)
        self._positioning.setText(data.get("positioning", ""))
        self._tags.setText(_join_items(data.get("tags", []), sep=", "))
        self._status.setCurrentText(data.get("status", "draft"))
        self._confidentiality.setCurrentText(data.get("confidentiality", "internal"))


# === 第二章：产品愿景 ===

class ChapterVisionForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._design_vision = _text_field("阐述设计理念和愿景", 120)
        self._design_vision.setPlainText(_safe_text(self._data.get("design_vision", "")))
        self._design_vision.textChanged.connect(lambda: self._emit())
        _add_row(form, "设计愿景", self._design_vision, "vision.design_vision")

        personas = self._data.get("user_personas", {})
        self._primary_user = _text_field("主要目标用户", 80)
        self._primary_user.setPlainText(personas.get("primary", ""))
        self._primary_user.textChanged.connect(lambda: self._emit())
        _add_row(form, "主要用户", self._primary_user)

        self._secondary_user = _text_field("次要目标用户", 80)
        self._secondary_user.setPlainText(personas.get("secondary", ""))
        self._secondary_user.textChanged.connect(lambda: self._emit())
        _add_row(form, "次要用户", self._secondary_user, "vision.user_personas.secondary")

        self._differentiation = _text_field("与竞品的差异化优势", 80)
        self._differentiation.setPlainText(_safe_text(self._data.get("differentiation", "")))
        self._differentiation.textChanged.connect(lambda: self._emit())
        _add_row(form, "差异化优势", self._differentiation, "vision.differentiation")

        self._business_model = _text_field("商业模式", 80)
        self._business_model.setPlainText(_safe_text(self._data.get("business_model", "")))
        self._business_model.textChanged.connect(lambda: self._emit())
        _add_row(form, "商业模式", self._business_model, "vision.business_model")

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("vision", self.get_data())

    def get_data(self) -> dict:
        return {
            "design_vision": self._design_vision.toPlainText().strip(),
            "user_personas": {
                "primary": self._primary_user.toPlainText().strip(),
                "secondary": self._secondary_user.toPlainText().strip(),
                "potential": "",
            },
            "differentiation": self._differentiation.toPlainText().strip(),
            "business_model": self._business_model.toPlainText().strip(),
            "competitive_analysis": self._data.get("competitive_analysis", []),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._design_vision.setPlainText(data.get("design_vision", ""))
        personas = data.get("user_personas", {})
        self._primary_user.setPlainText(personas.get("primary", ""))
        self._secondary_user.setPlainText(personas.get("secondary", ""))
        self._differentiation.setPlainText(data.get("differentiation", ""))
        self._business_model.setPlainText(data.get("business_model", ""))


# === 第三章：世界观 ===

class ChapterWorldviewForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._architecture = _text_field("世界观架构描述", 100)
        self._architecture.setPlainText(_safe_text(self._data.get("architecture", "")))
        self._architecture.textChanged.connect(lambda: self._emit())
        _add_row(form, "世界观架构", self._architecture, "worldview.architecture")

        self._geography = _text_field("地理与区域设定", 60)
        self._geography.setPlainText(_safe_text(self._data.get("geography", "")))
        self._geography.textChanged.connect(lambda: self._emit())
        _add_row(form, "地理设定", self._geography)

        self._main_plot = _text_field("主线剧情大纲", 100)
        self._main_plot.setPlainText(_safe_text(self._data.get("main_plot", "")))
        self._main_plot.textChanged.connect(lambda: self._emit())
        _add_row(form, "主线剧情", self._main_plot, "worldview.main_plot")

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("worldview", self.get_data())

    def get_data(self) -> dict:
        return {
            "architecture": self._architecture.toPlainText().strip(),
            "geography": self._geography.toPlainText().strip(),
            "main_plot": self._main_plot.toPlainText().strip(),
            "history_eras": self._data.get("history_eras", []),
            "factions": self._data.get("factions", []),
            "branch_endings": self._data.get("branch_endings", []),
            "character_network": self._data.get("character_network", []),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._architecture.setPlainText(data.get("architecture", ""))
        self._geography.setPlainText(data.get("geography", ""))
        self._main_plot.setPlainText(data.get("main_plot", ""))


# === 第四章：核心玩法 ===

class ChapterGameplayForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._core_loop = _text_field("核心循环描述，如: 探索→战斗→获取→养成→更强探索", 60)
        self._core_loop.setPlainText(_safe_text(self._data.get("core_loop", "")))
        self._core_loop.textChanged.connect(lambda: self._emit())
        _add_row(form, "核心循环", self._core_loop, "gameplay.core_loop")

        self._game_modes = _text_field("游戏模式，每行一个", 60)
        self._game_modes.setPlainText(_join_items(self._data.get("game_modes", [])))
        self._game_modes.textChanged.connect(lambda: self._emit())
        _add_row(form, "游戏模式", self._game_modes)

        self._first_30 = _text_field("玩家首次游玩30分钟内的体验流程", 80)
        self._first_30.setPlainText(_safe_text(self._data.get("first_30_min", "")))
        self._first_30.textChanged.connect(lambda: self._emit())
        _add_row(form, "新手体验(前30分钟)", self._first_30)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("gameplay", self.get_data())

    def get_data(self) -> dict:
        modes_text = self._game_modes.toPlainText().strip()
        modes = [m.strip() for m in modes_text.split("\n") if m.strip()] if modes_text else []
        return {
            "core_loop": self._core_loop.toPlainText().strip(),
            "game_modes": modes,
            "first_30_min": self._first_30.toPlainText().strip(),
            "control_scheme": self._data.get("control_scheme", ""),
            "win_lose_conditions": self._data.get("win_lose_conditions", ""),
            "tutorial_design": self._data.get("tutorial_design", ""),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._core_loop.setPlainText(data.get("core_loop", ""))
        self._game_modes.setPlainText(_join_items(data.get("game_modes", [])))
        self._first_30.setPlainText(data.get("first_30_min", ""))


# === 第六章：数值设计 ===

class ChapterNumericForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._formulas = _text_field("核心数值公式，如伤害公式，每行一个", 100)
        self._formulas.setPlainText(_safe_text(self._data.get("core_formulas", "")))
        self._formulas.textChanged.connect(lambda: self._emit())
        _add_row(form, "核心公式", self._formulas, "numeric.core_formulas")

        self._balance = _text_field("平衡设计原则", 80)
        self._balance.setPlainText(_safe_text(self._data.get("balance_principles", "")))
        self._balance.textChanged.connect(lambda: self._emit())
        _add_row(form, "平衡原则", self._balance)

        self._economy = _text_field("经济循环模型说明", 80)
        self._economy.setPlainText(_safe_text(self._data.get("economic_model", "")))
        self._economy.textChanged.connect(lambda: self._emit())
        _add_row(form, "经济模型", self._economy, "numeric.economic_model")

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("numeric", self.get_data())

    def get_data(self) -> dict:
        return {
            "core_formulas": self._formulas.toPlainText().strip(),
            "balance_principles": self._balance.toPlainText().strip(),
            "economic_model": self._economy.toPlainText().strip(),
            "growth_curves": self._data.get("growth_curves", []),
            "drop_tables": self._data.get("drop_tables", []),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._formulas.setPlainText(data.get("core_formulas", ""))
        self._balance.setPlainText(data.get("balance_principles", ""))
        self._economy.setPlainText(data.get("economic_model", ""))


# === 第七章：美术设计 ===

class ChapterArtForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._art_style = _text_field("美术风格定位描述", 80)
        self._art_style.setPlainText(_safe_text(self._data.get("art_style", "")))
        self._art_style.textChanged.connect(lambda: self._emit())
        _add_row(form, "美术风格", self._art_style)

        self._color_system = _text_field("色彩体系描述", 80)
        self._color_system.setPlainText(_safe_text(self._data.get("color_system", "")))
        self._color_system.textChanged.connect(lambda: self._emit())
        _add_row(form, "色彩体系", self._color_system, "art.color_system")

        self._typography = _text_field("字体与排版规范", 80)
        self._typography.setPlainText(_safe_text(self._data.get("typography", "")))
        self._typography.textChanged.connect(lambda: self._emit())
        _add_row(form, "字体排版", self._typography)

        self._vfx = _text_field("特效风格描述", 80)
        self._vfx.setPlainText(_safe_text(self._data.get("vfx", "")))
        self._vfx.textChanged.connect(lambda: self._emit())
        _add_row(form, "特效风格", self._vfx, "art.vfx")

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("art", self.get_data())

    def get_data(self) -> dict:
        return {
            "art_style": self._art_style.toPlainText().strip(),
            "color_system": self._color_system.toPlainText().strip(),
            "typography": self._typography.toPlainText().strip(),
            "vfx": self._vfx.toPlainText().strip(),
            "character_design": self._data.get("character_design", ""),
            "environment_design": self._data.get("environment_design", ""),
            "ui_design_language": self._data.get("ui_design_language", ""),
            "animation": self._data.get("animation", ""),
            "multi_resolution": self._data.get("multi_resolution", ""),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._art_style.setPlainText(data.get("art_style", ""))
        self._color_system.setPlainText(data.get("color_system", ""))
        self._typography.setPlainText(data.get("typography", ""))
        self._vfx.setPlainText(data.get("vfx", ""))


# === 第八章：技术规格 ===

class ChapterTechForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._engine = _combo([
            "Unity", "Unreal Engine", "Godot", "Cocos2d", "PyGame", "自定义引擎", "其他"
        ], self._data.get("engine", ""))
        self._engine.currentTextChanged.connect(lambda: self._emit())
        _add_row(form, "引擎/框架", self._engine)

        self._architecture = _text_field("核心技术架构说明", 80)
        self._architecture.setPlainText(_safe_text(self._data.get("core_architecture", "")))
        self._architecture.textChanged.connect(lambda: self._emit())
        _add_row(form, "核心架构", self._architecture, "tech.core_architecture")

        self._milestones = _text_field("开发里程碑，每行一个阶段", 80)
        milestones = self._data.get("milestones", [])
        if isinstance(milestones, list) and milestones:
            self._milestones.setPlainText("\n".join(
                m.get("phase", m) if isinstance(m, dict) else str(m) for m in milestones))
        self._milestones.textChanged.connect(lambda: self._emit())
        _add_row(form, "开发里程碑", self._milestones)

        self._team = _text_field("团队编制与分工", 80)
        self._team.setPlainText(_safe_text(self._data.get("team_structure", "")))
        self._team.textChanged.connect(lambda: self._emit())
        _add_row(form, "团队分工", self._team)

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("tech", self.get_data())

    def get_data(self) -> dict:
        ms_text = self._milestones.toPlainText().strip()
        ms = [{"phase": m.strip()} for m in ms_text.split("\n") if m.strip()] if ms_text else []
        return {
            "engine": self._engine.currentText(),
            "core_architecture": self._architecture.toPlainText().strip(),
            "milestones": ms,
            "team_structure": self._team.toPlainText().strip(),
            "third_party_deps": self._data.get("third_party_deps", []),
            "performance_targets": self._data.get("performance_targets", ""),
            "qa_plan": self._data.get("qa_plan", ""),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        self._engine.setCurrentText(data.get("engine", ""))
        self._architecture.setPlainText(data.get("core_architecture", ""))
        milestones = data.get("milestones", [])
        if isinstance(milestones, list) and milestones:
            self._milestones.setPlainText("\n".join(
                m.get("phase", m) if isinstance(m, dict) else str(m) for m in milestones))
        else:
            self._milestones.setPlainText("")
        self._team.setPlainText(data.get("team_structure", ""))


# === 第九章：资源规划 ===

class ChapterResourcesForm(QWidget):
    data_changed = pyqtSignal(str, object)
    ai_fill_requested = pyqtSignal(str)

    def __init__(self, data: dict | None = None, parent=None):
        super().__init__(parent)
        self._data = data or {}
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self._budget = _text_field("预算概算说明", 80)
        self._budget.setPlainText(
            self._data.get("budget", {}).get("summary", "") if isinstance(self._data.get("budget"), dict) else "")
        self._budget.textChanged.connect(lambda: self._emit())
        _add_row(form, "预算概算", self._budget)

        self._risk = _text_field("主要风险及应对措施", 80)
        self._risk.setPlainText(
            "\n".join(self._data.get("risk_matrix", [])) if isinstance(self._data.get("risk_matrix"), list) else "")
        self._risk.textChanged.connect(lambda: self._emit())
        _add_row(form, "风险评估", self._risk, "resources.risk_matrix")

        self._ip = _text_field("知识产权说明", 80)
        self._ip.setPlainText(_safe_text(self._data.get("ip", "")))
        self._ip.textChanged.connect(lambda: self._emit())
        _add_row(form, "知识产权", self._ip, "resources.ip")

        layout.addLayout(form)
        layout.addStretch()

    def _emit(self) -> None:
        self.data_changed.emit("resources", self.get_data())

    def get_data(self) -> dict:
        risk_lines = self._risk.toPlainText().strip().split("\n") if self._risk.toPlainText().strip() else []
        return {
            "budget": {"summary": self._budget.toPlainText().strip()},
            "risk_matrix": [r.strip() for r in risk_lines if r.strip()],
            "ip": self._ip.toPlainText().strip(),
            "art_assets": self._data.get("art_assets", []),
            "audio_assets": self._data.get("audio_assets", []),
            "localization": self._data.get("localization", []),
            "outsourcing": self._data.get("outsourcing", []),
            "contingency_plan": self._data.get("contingency_plan", ""),
            "appendix": self._data.get("appendix", ""),
        }

    def set_data(self, data: dict) -> None:
        self._data = data
        budget = data.get("budget", {})
        self._budget.setPlainText(budget.get("summary", "") if isinstance(budget, dict) else "")
        risk = data.get("risk_matrix", [])
        self._risk.setPlainText("\n".join(risk) if isinstance(risk, list) else "")
        self._ip.setPlainText(data.get("ip", ""))
