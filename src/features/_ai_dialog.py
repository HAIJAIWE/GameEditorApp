from __future__ import annotations

import json
from typing import Any, Optional

from PyQt6.QtCore import QThread, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common import generate_text
from common.logger import get_logger
from config.settings import get_config
from ui.themes.themes import get_current_theme, get_theme_colors

logger = get_logger()


class AIGenerateThread(QThread):
    """AI生成线程 - 避免UI阻塞"""
    finished = pyqtSignal(bool, str)

    def __init__(self, prompt: str, system_prompt: Optional[str] = None):
        super().__init__()
        self.prompt = prompt
        self.system_prompt = system_prompt

    def run(self):
        try:
            import threading
            config = get_config()
            logger = get_logger()

            # 用线程＋超时控制 API 调用
            result = {"success": False, "text": "未知错误"}
            def _call():
                try:
                    s, r = generate_text(config, self.prompt, self.system_prompt)
                    result["success"] = s
                    result["text"] = r
                except Exception as e:
                    result["text"] = str(e)

            t = threading.Thread(target=_call, daemon=True)
            t.start()
            t.join(timeout=60)  # 60秒超时
            if t.is_alive():
                logger.warning("AI生成超时（60秒）")
                self.finished.emit(False, "生成超时（60秒），请重试或缩短提示词")
            else:
                self.finished.emit(result["success"], result["text"])
        except Exception as e:
            self.finished.emit(False, str(e))


class AIGenerateDialog(QDialog):
    """AI生成对话框"""

    def __init__(
        self,
        parent: Optional[QWidget] = None,
        initial_prompt: str = "",
        data_type: str = "",
        existing_names: Optional[list[str]] = None,
        existing_roles: Optional[list[dict[str, Any]]] = None,
        existing_monsters: Optional[list[dict[str, Any]]] = None,
        existing_equips: Optional[list[dict[str, Any]]] = None,
        planning_text: str = "",
        generate_mode: str = "通用模板",
    ):
        super().__init__(parent)
        self.config = get_config()
        self.data_type = data_type
        self.existing_names = existing_names or []
        self.existing_roles = existing_roles or []
        self.existing_monsters = existing_monsters or []
        self.existing_equips = existing_equips or []
        self.planning_text = planning_text
        self.generate_mode = generate_mode
        self.selected_template_name: str = ""
        self.result_text = ""
        self.setup_ui(initial_prompt)
        self.setWindowTitle("AI生成内容")
        self.setMinimumSize(750, 750)

    def _tc(self, key: str) -> str:
        """获取当前主题颜色令牌（P1-4: 主题化辅助方法）"""
        if not hasattr(self, "_theme_colors"):
            self._theme_colors = get_theme_colors(get_current_theme())
        return self._theme_colors.get(key, "")

    def _hint_qss(self, kind: str = "default") -> str:
        """生成模式提示框的样式表（主题化）"""
        accent_light = self._tc("accent_light") or "#f5f5f5"
        accent = self._tc("accent") or "#2196F3"
        hint = self._tc("hint") or "#888"
        if kind == "selected":
            return (f"font-size: 11px; padding: 4px 8px; background: {accent_light}; "
                    f"border-radius: 4px; color: {accent}; border-left: 3px solid {accent};")
        return (f"font-size: 11px; padding: 4px 8px; background: transparent; "
                f"border-radius: 4px; color: {hint};")

    def setup_ui(self, initial_prompt: str):
        layout = QVBoxLayout(self)

        # 显示已有数据数量
        if self.existing_names and len(self.existing_names) > 0:
            info_label = QLabel(f"📚 本地已有 {len(self.existing_names)} 个数据，AI会自动避开重复内容！")
            info_label.setStyleSheet(f"color: {self._tc('accent') or '#2196F3'}; font-weight: bold; background: transparent;")
            layout.addWidget(info_label)

        # 生成数量选择
        count_layout = QHBoxLayout()
        count_layout.addWidget(QLabel("生成数量："))
        self.count_spin = QSpinBox()
        self.count_spin.setMinimum(1)
        self.count_spin.setMaximum(20)
        self.count_spin.setValue(1)
        count_layout.addWidget(self.count_spin)
        count_layout.addStretch()
        layout.addLayout(count_layout)

        if self.data_type == "skill":
            mode_layout = QHBoxLayout()
            mode_layout.addWidget(QLabel("🎯 参考模板："))
            self.mode_combo = QComboBox()
            self.mode_combo.addItem("⚔️ 角色模板 — 选择一个角色作为技能归属", "角色模板")
            self.mode_combo.addItem("👹 怪物模板 — 选择一个怪物作为技能归属", "怪物模板")
            self.mode_combo.addItem("🛡️ 装备模板 — 基于装备机制/套装效果设计技能", "装备模板")
            self.mode_combo.addItem("📦 通用模板 — 基于策划方案世界观设计独立技能", "通用模板")
            index = self.mode_combo.findData(self.generate_mode)
            if index >= 0:
                self.mode_combo.setCurrentIndex(index)
            self.mode_combo.currentIndexChanged.connect(self._on_mode_changed)
            mode_layout.addWidget(self.mode_combo)
            mode_layout.addStretch()
            layout.addLayout(mode_layout)

            template_layout = QHBoxLayout()
            template_layout.addWidget(QLabel("📋 选择具体模板："))
            self.template_selector = QComboBox()
            self.template_selector.setMinimumWidth(350)
            self.template_selector.currentIndexChanged.connect(self._on_template_selected)
            template_layout.addWidget(self.template_selector)
            template_layout.addStretch()
            layout.addLayout(template_layout)

            self._mode_hint = QLabel()
            self._mode_hint.setWordWrap(True)
            self._mode_hint.setStyleSheet(self._hint_qss("default"))
            layout.addWidget(self._mode_hint)
            self._on_mode_changed()

        # 用户可编辑部分（包含完整提示词）
        layout.addWidget(QLabel("✏️ 提示词（可编辑）："))
        self.prompt_edit = QTextEdit()
        self.prompt_edit.setMaximumHeight(150)
        layout.addWidget(self.prompt_edit)

        # 生成结果
        layout.addWidget(QLabel("生成结果："))
        self.result_edit = QTextEdit()
        self.result_edit.setReadOnly(True)
        layout.addWidget(self.result_edit)

        # 按钮
        button_layout = QHBoxLayout()

        self.generate_btn = QPushButton("生成")
        self.generate_btn.clicked.connect(self.generate_content)
        button_layout.addWidget(self.generate_btn)

        button_layout.addStretch()

        self.ok_btn = QPushButton("确定")
        self.ok_btn.clicked.connect(self.accept)
        self.ok_btn.setEnabled(False)
        button_layout.addWidget(self.ok_btn)

        self.cancel_btn = QPushButton("取消")
        self.cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_btn)

        layout.addLayout(button_layout)

        # 直接设置用户输入的提示词（完全空白，没有任何预设模板）
        self.prompt_edit.setPlainText(initial_prompt)

    def _on_mode_changed(self):
        self.generate_mode = self.mode_combo.currentData()
        self.template_selector.clear()
        self.selected_template_name = ""

        if self.generate_mode == "角色模板":
            if self.existing_roles:
                for r in self.existing_roles:
                    label = f"{r.get('name', '?')} | {r.get('job', '?')} | HP:{r.get('hp', '?')} ATK:{r.get('atk', '?')}"
                    self.template_selector.addItem(label, r.get("name", ""))
            else:
                self.template_selector.addItem("⚠️ 暂无角色数据", "")
        elif self.generate_mode == "怪物模板":
            if self.existing_monsters:
                for m in self.existing_monsters:
                    label = f"{m.get('name', '?')} | Lv{m.get('level', '?')} | {m.get('category', '?')} | {m.get('behavior', '?')}"
                    self.template_selector.addItem(label, m.get("name", ""))
            else:
                self.template_selector.addItem("⚠️ 暂无怪物数据", "")
        elif self.generate_mode == "装备模板":
            if self.existing_equips:
                for e in self.existing_equips:
                    effect = e.get("effect", "") or ""
                    rarity = e.get("rarity", "") or ""
                    label = f"{e.get('name', '?')} | {rarity} | 部位:{e.get('part', '?')}"
                    if effect and len(effect) > 30:
                        effect = effect[:27] + "..."
                    label += f" | 效果:{effect}" if effect else ""
                    self.template_selector.addItem(label, e.get("name", ""))
            else:
                self.template_selector.addItem("⚠️ 暂无装备数据", "")
        else:
            if self.planning_text:
                preview = self.planning_text[:80].replace("\n", " ")
                if len(self.planning_text) > 80:
                    preview += "..."
                self.template_selector.addItem(f"📄 策划方案: {preview}", "planning")
            else:
                self.template_selector.addItem("⚠️ 暂无策划文档，请先在「策划方案」标签页创建或导入", "")

        self._update_template_hint()

    def _on_template_selected(self):
        idx = self.template_selector.currentIndex()
        if idx >= 0:
            self.selected_template_name = self.template_selector.currentData() or ""
        self._update_template_hint()

    def _update_template_hint(self):
        mode = self.generate_mode
        name = self.selected_template_name

        if mode == "角色模板":
            if name:
                role = next((r for r in self.existing_roles if r.get("name") == name), None)
                if role:
                    self._mode_hint.setText(
                        f"✅ 已选择角色「{role.get('name','?')}」作为技能模板\n"
                        f"  职业：{role.get('job','?')}  |  定位：{role.get('category','?')}  |  "
                        f"HP：{role.get('hp','?')}  |  ATK：{role.get('atk','?')}\n"
                        f"  → AI将根据此角色的职业定位生成专属技能（owner字段填此角色名）"
                    )
                    self._mode_hint.setStyleSheet(self._hint_qss("selected"))
                else:
                    self._mode_hint.setText(f"✅ 已选择角色「{name}」")
            else:
                count = len(self.existing_roles)
                self._mode_hint.setText(f"👆 请从上方下拉框选择一个角色模板（共{count}个可用）")
                self._mode_hint.setStyleSheet(self._hint_qss("default"))

        elif mode == "怪物模板":
            if name:
                monster = next((m for m in self.existing_monsters if m.get("name") == name), None)
                if monster:
                    self._mode_hint.setText(
                        f"✅ 已选择怪物「{monster.get('name','?')}」作为技能模板\n"
                        f"  等级：{monster.get('level','?')}  |  类型：{monster.get('category','?')}  |  "
                        f"行为：{monster.get('behavior','?')}  |  难度：{monster.get('difficulty','?')}\n"
                        f"  → AI将根据此怪物的类型和行为模式设计专属技能（owner字段填此怪物名）"
                    )
                    self._mode_hint.setStyleSheet(self._hint_qss("selected"))
                else:
                    self._mode_hint.setText(f"✅ 已选择怪物「{name}」")
            else:
                count = len(self.existing_monsters)
                self._mode_hint.setText(f"👆 请从上方下拉框选择一个怪物模板（共{count}个可用）")

        elif mode == "装备模板":
            if name:
                equip = next((e for e in self.existing_equips if e.get("name") == name), None)
                if equip:
                    effect_preview = (equip.get("effect", "") or "")[:60]
                    set_effect = (equip.get("set_effect", "") or "")[:40]
                    parts = [f"✅ 已选择装备「{equip.get('name','?')}」作为技能灵感"]
                    parts.append(f"  部位：{equip.get('part','?')}  |  稀有度：{equip.get('rarity','?')}  |  属性：+{equip.get('value','?')}")
                    if effect_preview:
                        parts.append(f"  装备效果：{effect_preview}")
                    if set_effect:
                        parts.append(f"  套装效果：{set_effect}")
                    parts.append("  → AI将把装备机制转化为可激活的技能效果")
                    self._mode_hint.setText("\n".join(parts))
                    self._mode_hint.setStyleSheet(self._hint_qss("selected"))
                else:
                    self._mode_hint.setText(f"✅ 已选择装备「{name}」")
            else:
                count = len(self.existing_equips)
                self._mode_hint.setText(f"👆 请从上方下拉框选择一个装备模板（共{count}个可用）\n→ 装备的机制/套装效果将被转化为技能设计灵感")

        else:
            if self.planning_text:
                char_count = len(self.planning_text)
                self._mode_hint.setText(
                    f"✅ 使用策划文档作为通用模板（共{char_count}字）\n"
                    f"  → AI将基于策划方案中的世界观、数值体系、战斗规则来设计通用技能"
                )
                self._mode_hint.setStyleSheet(self._hint_qss("selected"))
            else:
                self._mode_hint.setText(
                    "⚠️ 暂无策划文档。建议先在「策划方案」标签页创建或导入策划案，\n"
                    "   作为通用模板为AI提供世界观和数值约束。当前将按默认奇幻RPG设定生成。"
                )

    def _get_type_config(self) -> dict:
        """从类型模式获取数据类型的生成配置"""
        schema = self.config.get_type_schema()
        result = {
            "planning": {
                "name": "策划文档",
                "fields": "完整的游戏策划文档",
                "special_notes": "",
                "is_json": False
            }
        }
        if schema:
            for t in schema.types:
                ctx = t.ai_context
                result[t.id] = {
                    "name": t.name,
                    "fields": ctx.get("field_descriptions", ""),
                    "special_notes": ctx.get("special_notes", ""),
                    "is_json": True,
                    "role_description": ctx.get("role_description", "")
                }
        return result

    def _get_json_example(self) -> str:
        """根据数据类型返回对应的JSON格式示例 — 从类型模式获取"""
        schema = self.config.get_type_schema()
        if schema:
            type_def = schema.get_type(self.data_type)
            if type_def:
                json_examples = type_def.ai_context.get("json_example", [])
                if json_examples:
                    return json.dumps(json_examples, ensure_ascii=False, indent=2)
        return json.dumps([
            {"name": "示例名称", "desc": "这是一个示例描述", "value": 100},
            {"name": "另一个示例", "desc": "这是另一个示例", "value": 200}
        ], ensure_ascii=False, indent=2)

    def _build_avoid_prompt(self) -> str:
        """构造"避免已有内容"提示词（限制数量避免 prompt 过长）。"""
        # 构造"不要生成已有内容"的提示词部分（限制数量避免 prompt 过长）
        avoid_prompt = ""
        if self.existing_names and len(self.existing_names) > 0:
            display_names = self.existing_names[:8]  # 限制只显示前8个
            names_str = ", ".join(display_names)
            hint = f"等{len(self.existing_names)}个" if len(self.existing_names) > 8 else ""
            avoid_prompt = f"\n\n避免以下已有名称：{names_str}{hint}"

        return avoid_prompt


    def _sanitize_user_input(self, user_input: str) -> str:
        """清理用户输入中的英文提示词，确保不干扰中文要求。"""
        if user_input:
            # 移除常见的英文提示词
            user_input = user_input.replace("in Chinese", "")
            user_input = user_input.replace("In Chinese", "")
            user_input = user_input.replace("中文版", "")
            user_input = user_input.strip()

        return user_input


    def _build_mode_instruction(self) -> tuple[str, str]:
        """构造技能生成模式的专属约束指令（角色/怪物/装备/通用模板）。"""
        mode_instruction = ""
        notes_extra = ""
        if self.data_type == "skill":
            name = self.selected_template_name

            if self.generate_mode == "角色模板" and name:
                role = next((r for r in self.existing_roles if r.get("name") == name), None)
                if role:
                    role_detail = (
                        f"\n【选定角色模板】\n"
                        f"名称：{role.get('name', '?')}\n"
                        f"职业：{role.get('job', '?')}\n"
                        f"定位：{role.get('category', '?')}\n"
                        f"HP：{role.get('hp', '?')} | ATK：{role.get('atk', '?')} | DEF：{role.get('def', '?')}\n"
                        f"种族：{role.get('race', '?')} | 派系：{role.get('faction', '?')}\n"
                        f"背景：{role.get('background', '无')}\n"
                        f"技能：{role.get('skills', '无')}\n"
                    )
                    notes_extra += role_detail
                    job = role.get('job', '')
                    atk = role.get('atk', 0)
                    hp = role.get('hp', 0)
                    mode_instruction = (
                        "\n【模板约束：角色专属技能】\n"
                        f"所有生成的技能必须绑定到角色「{name}」（owner字段填'{name}'）。\n"
                        f"此角色的职业是「{job}」，请根据该职业定位设计技能：\n"
                        f"- 坦克/骑士→ 防御、嘲讽、护盾、反击类技能\n"
                        f"- 战士/狂战士→ 近战攻击、旋风斩、冲锋、破甲类技能\n"
                        f"- 法师/术士→ 远程法术、元素爆发、AOE、控制类技能\n"
                        f"- 牧师/祭司→ 治疗、净化、祝福、复活类技能\n"
                        f"- 刺客/盗贼→ 潜行、背刺、毒伤、闪避类技能\n"
                        f"- 弓箭手/游侠→ 远程射击、陷阱、追踪、连射类技能\n"
                        f"技能数值参考：ATK={atk}, HP={hp}，技能伤害应在ATK的{int(atk*0.5)}-{int(atk*3)}范围内。"
                    )
                else:
                    mode_instruction = "\n【注意】未找到选定的角色，将按通用模式生成。"

            elif self.generate_mode == "怪物模板" and name:
                monster = next((m for m in self.existing_monsters if m.get("name") == name), None)
                if monster:
                    monster_detail = (
                        f"\n【选定怪物模板】\n"
                        f"名称：{monster.get('name', '?')}\n"
                        f"等级：{monster.get('level', '?')} | 类型：{monster.get('category', '?')}\n"
                        f"HP：{monster.get('hp', '?')} | ATK：{monster.get('atk', '?')} | DEF：{monster.get('def', '?')}\n"
                        f"行为模式：{monster.get('behavior', '?')}\n"
                        f"难度：{monster.get('difficulty', '?')} | 掉落：{monster.get('drops', '?')}\n"
                        f"描述：{monster.get('desc', '无')}\n"
                    )
                    notes_extra += monster_detail
                    behavior = monster.get('behavior', '')
                    level = monster.get('level', 1)
                    difficulty = monster.get('difficulty', '普通')
                    mode_instruction = (
                        "\n【模板约束：怪物专属技能】\n"
                        f"所有生成的技能必须绑定到怪物「{name}」（owner字段填'{name}'）。\n"
                        f"此怪物等级Lv{level}，难度为「{difficulty}」，行为模式为「{behavior}」。\n"
                        f"根据行为模式设计技能：\n"
                        f"- 攻击性→ 高伤害单体/群体攻击、撕裂、流血类技能\n"
                        f"- 防御性→ 护盾、反伤、硬化、召唤小怪类技能\n"
                        f"- 游荡型→ 突袭、陷阱、隐匿、毒雾类技能\n"
                        f"- 召唤型→ 召唤随从、群体增益、献祭召唤物类技能\n"
                        f"Boss级（首领/史诗）怪物应有2-3个强力技能+1个终极技能；\n"
                        f"普通怪物1-2个基础技能即可。"
                    )
                else:
                    mode_instruction = "\n【注意】未找到选定的怪物，将按通用模式生成。"

            elif self.generate_mode == "装备模板" and name:
                equip = next((e for e in self.existing_equips if e.get("name") == name), None)
                if equip:
                    effect = equip.get("effect", "") or ""
                    set_effect = equip.get("set_effect", "") or ""
                    rarity = equip.get("rarity", "") or ""
                    part = equip.get("part", "") or ""
                    value = equip.get("value", 0)
                    equip_detail = (
                        f"\n【选定装备模板 — 技能灵感来源】\n"
                        f"名称：{equip.get('name', '?')}\n"
                        f"部位：{part} | 稀有度：{rarity} | 属性加成：+{value}\n"
                        f"适用职业：{equip.get('job', '?')}\n"
                        f"装备效果：{effect or '无'}\n"
                        f"套装效果：{set_effect or '无'}\n"
                        f"描述：{equip.get('desc', '无')}\n"
                    )
                    notes_extra += equip_detail
                    mode_instruction = (
                        "\n【模板约束：装备机制转技能】\n"
                        f"基于装备「{name}」的机制设计可激活的主动/被动技能！\n"
                        f"装备效果「{effect or '无'}」是被动触发，现在把它转化为玩家可主动释放的技能。\n"
                        f"套装效果「{set_effect or '无'}」可以转化为需要特定条件触发的终极技能。\n"
                        f"转换原则：\n"
                        f"- 装备的数值加成 → 技能的buff/debuff效果\n"
                        f"- 装备的特殊效果 → 技能的核心机制（如冰霜减速→冰霜领域）\n"
                        f"- 装备的套装条件 → 技能的前置条件或组合技\n"
                        f"- owner字段填'通用'，但tags中注明来源装备名\n"
                        f"稀有度「{rarity}」影响技能强度：传说→强效，普通→基础"
                    )
                else:
                    mode_instruction = "\n【注意】未找到选定的装备，将按通用模式生成。"

            else:
                if self.planning_text:
                    planning_preview = self.planning_text[:500]
                    if len(self.planning_text) > 500:
                        planning_preview += "..."
                    notes_extra += f"\n【策划方案文档（通用模板）】\n{planning_preview}\n"
                    mode_instruction = (
                        "\n【模板约束：策划方案世界观】\n"
                        "基于上述策划文档的世界观和设定来设计通用技能。\n"
                        "- 技能命名和风格要符合文档中的世界设定\n"
                        "- 数值体系参考文档中的平衡规则\n"
                        "- 技能类型覆盖文档中定义的职业体系\n"
                        "- owner字段填'通用'\n"
                        "- 如果文档中有特定的魔法/武技系统，请遵循其设定"
                    )
                else:
                    mode_instruction = (
                        "\n【模板约束：默认奇幻RPG设定】\n"
                        "无策划文档可用，按标准奇幻RPG设定设计通用技能。\n"
                        "- 覆盖多种元素（火/冰/雷/暗/光/自然）\n"
                        "- 包含近战和远程两种风格\n"
                        "- 数值范围合理（伤害10-500，CD 3-30秒）\n"
                        "- owner字段填'通用'"
                    )

        return mode_instruction, notes_extra


    def _build_json_user_prompt(self, role_desc, type_name, count, user_input, type_cfg, notes, avoid_prompt, has_planning_context) -> str:
        """构造 JSON 数据类型的生成提示词（CRISPE 框架）。"""
        user_prompt = f"""【角色】
{role_desc}

【上下文】
用户正在开发一款奇幻RPG游戏，需要为游戏生成{type_name}数据。{'已提供策划方案作为设计蓝本，请严格遵循其中的世界观设定、数值规则和风格指南！' if has_planning_context else '请基于标准奇幻RPG设定进行创作。'}

【指令】
根据以下用户需求，生成恰好{count}个{type_name}数据：

{user_input}

【字段要求】
每个{type_name}必须包含以下字段：
{type_cfg['fields']}

{notes}

【生成规则】
1. 必须生成恰好 {count} 个完全不同的{type_name}，名称绝不可重复！
2. 每个{type_name}的 desc（描述）必须各不相同，有独特的表达！
3. 数值必须符合奇幻RPG游戏平衡标准，不同条目间要有合理差异！
4. 所有文本内容必须使用中文，名称要有奇幻风格和中文美感！

【输出格式 — 极其重要！】
你的回复中只能包含JSON数组，不能有任何其他内容！

严格按照以下格式输出，一个完整的JSON数组：

{self._get_json_example()}

格式铁律：
1. 字段名必须用英文双引号包裹（如 "name", "type", "value"）
2. 字符串值用中文填写
3. 数字值绝对不能加引号（如 "value": 180 正确， "value": "180" 错误！）
4. JSON数组的最后一个对象后面不能有逗号
5. 整个回复 = JSON数组，不要在前面加"以下是生成结果"，不要在JSON后面加任何说明文字
6. 不要用```json 或 ``` 包裹JSON
7. 如果生成失败或遇到问题，仍要输出一个空数组 []，不要输出错误信息
{avoid_prompt}"""
        return user_prompt


    def _build_planning_doc_user_prompt(self, user_input, notes) -> str:
        """构造策划文档生成提示词（非 JSON 类型）。"""
        user_prompt = f"""【角色】
你是一位拥有10年行业经验的资深游戏策划师，主导过多款成功RPG项目，擅长撰写专业、详细、可落地的游戏策划文档。

【上下文】
用户需要在编辑器中设计游戏的 10 种核心数据：
- 角色（roles）：职业、种族、属性、背景故事
- 怪物（monsters）：等级、类型、行为模式、掉落
- 技能（skills）：技能类型、效果、数值、连招体系
- 装备（equips）：部位、稀有度、职业适配、套装效果
- 天赋（talents）：天赋类型、稀有度、效果类型、解锁条件
- 道具（items）：消耗品、材料、任务道具
- 任务（tasks）：主线/支线/日常，奖励设计
- 对话（dialogs）：NPC对话、选项、分支
- 剧情（stories）：章节结构、转折、伏笔
- 成就（achievements）：达成条件、奖励梯度
策划文档将作为这些数据的设计蓝图，AI会根据策划文档中的规则自动生成数据。

【指令】
根据以下用户需求，生成一份专业、完整的游戏策划文档：

{user_input}

【内容结构】
文档必须包含以下章节，每个章节都要详细展开：

1. 游戏理念和背景
   - 游戏定位和核心理念
   - 世界观设定（详细描述，包括世界历史、地理环境、主要势力等）
   - 游戏主题和氛围

2. 核心玩法和系统
   - 主要玩法机制（探索、战斗、社交等）
   - 特色系统介绍（经济系统、任务系统、成就系统等）
   - 玩家交互方式

3. 角色和职业设计
   - 职业体系（列出所有职业名称和定位）
   - 每个职业的背景故事和特色
   - 职业技能特点和定位

4. 技能和战斗系统
   - 技能分类（主动技能、被动技能、终极技能等）
   - 战斗机制（攻击、防御、闪避、连击等）
   - 技能释放和冷却系统
   - 技能组合和连招

5. 数值平衡
   - 等级系统和经验获取
   - 属性成长曲线
   - 装备系统和强化
   - 数值设计原则和平衡机制

6. 剧情和世界观
   - 主线剧情概述（分章节描述）
   - 世界设定（详细描述每个重要区域、城市、势力）
   - 支线任务和隐藏内容

7. AI生成系统
   - AI生成内容类型（技能、角色、怪物、装备、道具、任务、对话、剧情等）
   - AI生成机制（根据策划文档的设定和规则进行生成）
   - AI生成内容的质量控制和审核流程
   - AI生成与人工创作的结合方式

8. 美术风格
   - 视觉风格定位（写实/卡通/像素等）
   - 色彩基调和艺术风格
   - UI设计方向和交互体验
   - 角色和场景设计风格

{notes}

【风格要求】
- 专业、严谨的策划文档风格
- 使用Markdown格式组织内容
- 章节清晰，层次分明
- 语言正式但易于理解

【目标受众】
游戏开发团队成员，包括策划、程序、美术、测试等岗位

【输出要求】
- 直接输出完整的策划文档内容
- 所有内容使用中文
- 确保内容完整，不要截断
- 达到专业游戏策划文档水平"""
        return user_prompt


    def _build_generic_user_prompt(self, type_name, count, user_input, avoid_prompt) -> str:
        """构造未配置数据类型的通用 JSON 生成提示词。"""
        user_prompt = f"""【角色】
你是一位资深的游戏{type_name}数据设计师，精通奇幻RPG的数值体系和世界观构建。

【上下文】
用户正在开发一款奇幻RPG游戏，需要通过AI快速生成大量、多样化的{type_name}数据，用于填充游戏内容和测试。

【指令】
根据以下用户需求，生成恰好{count}个{type_name}数据，每个数据必须完整且互不相同：

{user_input}

【输出格式 — 极其重要！】
你的回复中只能包含JSON数组，不能有任何其他内容！
严格按此格式输出：

[
    {{{{"字段1": "中文值", "字段2": 数字}}}},
    ...
]

格式铁律：
1. 字段名用英文双引号（如 "name"）
2. 字符串值用中文（如 "暗影之刃"）
3. 数字值不加引号（180 正确，"180" 错误！）
4. 最后一项后面不加逗号
5. 回复 = 纯JSON数组，不加任何额外文字
6. 不用```json包裹
7. 失败时输出 [] 不要输出错误信息
{avoid_prompt}

【质量要求】
- 所有名称和描述必须各不相同，杜绝重复
- 数值设定参考奇幻RPG标准，互有差异
- 名称要有奇幻风格和中文美感"""
        return user_prompt


    def generate_content(self):
        user_input = self.prompt_edit.toPlainText().strip()
        if not user_input:
            QMessageBox.warning(self, "提示", "请输入提示词")
            return

        config = get_config()
        if not config.enabled:
            QMessageBox.warning(self, "提示", "请先在设置中启用API")
            return

        if config.provider != "Ollama" and not config.api_key:
            QMessageBox.warning(self, "提示", "请先在设置中配置API Key")
            return

        # 禁用按钮，显示生成中
        self.generate_btn.setEnabled(False)
        self.generate_btn.setText("生成中...")
        self.result_edit.setText("正在生成，请稍候...")

        # 获取生成数量
        count = self.count_spin.value()

        # 构造系统提示词和用户提示词
        system_prompt = None
        user_prompt = ""

        avoid_prompt = self._build_avoid_prompt()

        # 检查用户输入中是否包含策划上下文（须在清理前判断）
        has_planning_context = "【重要】请严格按照以下游戏策划案来生成数据" in user_input
        user_input = self._sanitize_user_input(user_input)

        if self.data_type:
            type_configs = self._get_type_config()

            if self.data_type in type_configs:
                type_cfg = type_configs[self.data_type]
                type_name = type_cfg["name"]

                if type_cfg["is_json"]:
                    system_prompt = None

                    notes = ""
                    if type_cfg["special_notes"]:
                        notes = f"\n【重要约束】\n{type_cfg['special_notes']}"

                    # 每种类型的专属 CRISPE 角色定位 — 从类型模式获取
                    role_desc = type_cfg.get("role_description", f"你是一位专业的游戏数据设计师，擅长创建符合游戏世界观的{type_name}数据。")

                    mode_instruction, notes_extra = self._build_mode_instruction()
                    notes += notes_extra
                    notes += mode_instruction

                    user_prompt = self._build_json_user_prompt(
                        role_desc, type_name, count, user_input,
                        type_cfg, notes, avoid_prompt, has_planning_context,
                    )
                else:
                    # 非JSON类型（如策划文档）
                    system_prompt = None

                    notes = ""
                    if type_cfg["special_notes"]:
                        notes = f"\n{type_cfg['special_notes']}"

                    user_prompt = self._build_planning_doc_user_prompt(user_input, notes)
            else:
                # 没有配置的数据类型，使用通用提示词（符合CRISPE框架）
                type_name = self.data_type
                system_prompt = None
                user_prompt = self._build_generic_user_prompt(type_name, count, user_input, avoid_prompt)

        # 调试：记录发送给AI的提示词
        logger = get_logger()
        logger.info(f"=== 发送给AI的系统提示词 ===\n{system_prompt}\n")
        logger.info(f"=== 发送给AI的用户提示词 ===\n{user_prompt}\n")

        # 启动生成线程
        self.thread = AIGenerateThread(user_prompt, system_prompt)
        self.thread.finished.connect(self.on_generation_finished)
        self.thread.start()


    def on_generation_finished(self, success: bool, result: str):
        self.generate_btn.setEnabled(True)
        self.generate_btn.setText("生成")

        if success:
            self.result_text = result
            self.result_edit.setText(result)
            self.ok_btn.setEnabled(True)
        else:
            self.result_edit.setText(f"生成失败：\n{result}")
            self.ok_btn.setEnabled(False)

    def get_result(self) -> str:
        return self.result_text

def normalize_item_fields(item):
    if 'tag' in item and 'tags' not in item:
        item['tags'] = item['tag']
    elif 'tags' in item and 'tag' not in item:
        item['tag'] = item['tags']
    if 'description' in item and 'desc' not in item:
        item['desc'] = item['description']
    elif 'desc' in item and 'description' not in item:
        item['description'] = item['desc']


def find_matching_brace(s, start):
    count = 1
    for i in range(start + 1, len(s)):
        if s[i] == '{':
            count += 1
        elif s[i] == '}':
            count -= 1
            if count == 0:
                return i
    return -1


def parse_ai_result(result, data_type=None):
    try:
        import json
        logger = get_logger()

        if data_type == "planning":
            logger.info("\u7b56\u5212\u6587\u6863\u7c7b\u578b\uff0c\u76f4\u63a5\u8fd4\u56de\u539f\u59cb\u6587\u672c")
            return {"desc": result}

        logger.info(f"\u5f00\u59cb\u89e3\u6790AI\u751f\u6210\u7ed3\u679c\uff0c\u957f\u5ea6: {len(result)}")

        error_keywords = ["\u65e0\u6cd5", "\u4e0d\u80fd", "\u62b1\u6b49", "\u5bf9\u4e0d\u8d77", "\u9519\u8bef", "\u5931\u8d25", "sorry", "can't", "cannot"]
        for keyword in error_keywords:
            if keyword in result.lower():
                logger.warning("\u68c0\u6d4b\u5230\u53ef\u80fd\u7684\u9519\u8bef\u4fe1\u606f\uff0c\u8fd4\u56de\u539f\u59cb\u6587\u672c")
                return {"desc": result}

        result_clean = result.replace("```json", "").replace("```", "").strip()
        result_clean = result_clean.replace("\t", "  ").replace("\r", "")
        result_clean = result_clean.encode('utf-8', errors='ignore').decode('utf-8')

        logger.info(f"\u6e05\u7406\u540e\u7ed3\u679c: {result_clean[:500]}")

        items = []
        pos = 0
        while True:
            obj_start = result_clean.find('{', pos)
            if obj_start == -1:
                break
            obj_end = find_matching_brace(result_clean, obj_start)
            if obj_end == -1:
                break
            try:
                item_str = result_clean[obj_start:obj_end+1]
                if len(item_str) > 1024 * 1024:
                    logger.warning(f"JSON\u5bf9\u8c61\u8fc7\u5927\uff0c\u8df3\u8fc7: {len(item_str)}\u5b57\u8282")
                    pos = obj_end + 1
                    continue
                depth = item_str.count('{') - item_str.count('}')
                if depth > 20:
                    logger.warning(f"JSON\u5d4c\u5957\u8fc7\u6df1\uff0c\u8df3\u8fc7: depth={depth}")
                    pos = obj_end + 1
                    continue
                item = json.loads(item_str)
                if not isinstance(item, dict):
                    logger.warning(f"JSON\u89e3\u6790\u7ed3\u679c\u4e0d\u662f\u5b57\u5178\u7c7b\u578b: {type(item)}")
                    pos = obj_end + 1
                    continue
                normalize_item_fields(item)
                if 'name' not in item or not item['name']:
                    type_names = {
                        "skill": "\u6280\u80fd", "role": "\u89d2\u8272", "monster": "\u602a\u7269",
                        "equip": "\u88c5\u5907", "item": "\u9053\u5177", "task": "\u4efb\u52a1",
                        "dialog": "\u5bf9\u8bdd", "story": "\u5267\u60c5", "achievement": "\u6210\u5c31"
                    }
                    type_name = type_names.get(data_type, "\u6570\u636e")
                    item['name'] = f"AI\u751f\u6210{type_name}"
                items.append(item)
                pos = obj_end + 1
            except json.JSONDecodeError:
                pos = obj_end + 1
                continue
            except Exception as e:
                logger.warning(f"\u89e3\u6790\u9879\u76ee\u5f02\u5e38: {e}")
                pos = obj_end + 1
                continue

        if not items:
            array_start = result_clean.find('[')
            if array_start != -1:
                count_br = 1
                array_end = -1
                for i in range(array_start + 1, len(result_clean)):
                    if result_clean[i] == '[':
                        count_br += 1
                    elif result_clean[i] == ']':
                        count_br -= 1
                        if count_br == 0:
                            array_end = i
                            break
                if array_end != -1:
                    try:
                        array_str = result_clean[array_start:array_end+1]
                        array_data = json.loads(array_str)
                        if isinstance(array_data, list):
                            for array_item in array_data:
                                if isinstance(array_item, dict):
                                    normalize_item_fields(array_item)
                                    items.append(array_item)
                    except (json.JSONDecodeError, Exception) as e:
                        logger.debug(f"操作失败: {e}")

        if items:
            return {"items": items, "count": len(items)}

        type_names = {
            "role": "\u89d2\u8272", "monster": "\u602a\u7269", "equip": "\u88c5\u5907",
            "item": "\u9053\u5177", "task": "\u4efb\u52a1", "dialog": "\u5bf9\u8bdd",
            "story": "\u5267\u60c5", "achievement": "\u6210\u5c31"
        }
        type_name = type_names.get(data_type, "\u6570\u636e")
        return {
            "items": [{"name": f"AI\u751f\u6210{type_name}", "desc": result}],
            "count": 1
        }
    except Exception:
        type_names = {
            "role": "\u89d2\u8272", "monster": "\u602a\u7269", "equip": "\u88c5\u5907",
            "item": "\u9053\u5177", "task": "\u4efb\u52a1", "dialog": "\u5bf9\u8bdd",
            "story": "\u5267\u60c5", "achievement": "\u6210\u5c31"
        }
        type_name = type_names.get(data_type, "\u6570\u636e")
        return {
            "items": [{"name": f"AI\u751f\u6210{type_name}", "desc": result}],
            "count": 1
        }
