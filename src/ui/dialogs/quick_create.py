"""快速创建向导 - 基于模板快速创建数据"""
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from ui.themes import theme_color

TEMPLATE_DEFS = {
    "role": [
        {"name": "战士", "desc": "近战物理输出，高生命高防御", "defaults": {
            "name": "新战士", "job": "战士", "race": "人类", "faction": "联盟",
            "category": "近战输出", "mechanism": ""}},
        {"name": "法师", "desc": "远程魔法输出，高魔攻低防御", "defaults": {
            "name": "新法师", "job": "法师", "race": "精灵", "faction": "中立",
            "category": "法术输出", "mechanism": ""}},
        {"name": "刺客", "desc": "高暴击高速度，低生命", "defaults": {
            "name": "新刺客", "job": "刺客", "race": "亡灵", "faction": "邪恶",
            "category": "爆发", "mechanism": ""}},
        {"name": "牧师", "desc": "辅助治疗，中等防御", "defaults": {
            "name": "新牧师", "job": "牧师", "race": "人类", "faction": "善良",
            "category": "治疗", "mechanism": ""}},
        {"name": "骑士", "desc": "超高防御和生命，可治疗", "defaults": {
            "name": "新骑士", "job": "骑士", "race": "人类", "faction": "联盟",
            "category": "坦克", "mechanism": ""}},
        {"name": "全能型", "desc": "各项属性均衡，适应多种场景", "defaults": {
            "name": "冒险者", "job": "冒险者", "race": "人类", "faction": "中立",
            "category": "全能", "mechanism": ""}},
    ],
    "job": [
        {"name": "战士职业", "desc": "物理近战职业模板", "defaults": {
            "name": "战士职业", "job_tier": "基础", "base_job_from": "无",
            "type": "坦克", "difficulty": "简单",
            "resource_type": "怒气", "growth_type": "血量型"}},
        {"name": "法师职业", "desc": "魔法远程职业模板", "defaults": {
            "name": "法师职业", "job_tier": "基础", "base_job_from": "无",
            "type": "输出", "difficulty": "普通",
            "resource_type": "法力", "growth_type": "法力型"}},
        {"name": "牧师职业", "desc": "治疗/增益职业模板", "defaults": {
            "name": "牧师职业", "job_tier": "基础", "base_job_from": "无",
            "type": "治疗", "difficulty": "普通",
            "resource_type": "法力", "growth_type": "均衡型"}},
        {"name": "弓箭手职业", "desc": "物理远程职业模板", "defaults": {
            "name": "弓箭手职业", "job_tier": "基础", "base_job_from": "无",
            "type": "输出", "difficulty": "普通",
            "resource_type": "能量", "growth_type": "攻击型"}},
    ],
    "monster": [
        {"name": "普通怪", "desc": "基础小怪，低属性", "defaults": {
            "name": "野猪", "level": "1", "type": "野兽",
            "category": "普通", "difficulty": "简单", "behavior": "游荡"}},
        {"name": "精英怪", "desc": "强化版小怪，中等属性", "defaults": {
            "name": "狂暴野猪", "level": "5", "type": "野兽",
            "category": "精英", "difficulty": "困难", "behavior": "攻击性"}},
        {"name": "Boss", "desc": "首领级怪物，高属性多技能", "defaults": {
            "name": "暗黑领主", "level": "10", "type": "恶魔",
            "category": "Boss", "difficulty": "首领", "behavior": "攻击性"}},
        {"name": "召唤物", "desc": "由技能召唤的临时单位", "defaults": {
            "name": "火元素", "level": "1", "type": "元素",
            "category": "事件怪", "difficulty": "简单", "behavior": "防御性"}},
        {"name": "稀有怪", "desc": "特殊稀有怪物，有特殊掉落", "defaults": {
            "name": "黄金龙", "level": "8", "type": "龙类",
            "category": "稀有", "difficulty": "精英", "behavior": "游荡"}},
    ],
    "skill": [
        {"name": "单体攻击", "desc": "对单个目标造成伤害", "defaults": {
            "name": "斩击", "type": "攻击", "damage_type": "物理伤害",
            "target": "单体敌人", "consume": "无消耗",
            "effect": "直接伤害", "category": "单体攻击"}},
        {"name": "范围攻击", "desc": "对多个目标造成伤害", "defaults": {
            "name": "烈焰风暴", "type": "攻击", "damage_type": "法术伤害",
            "target": "群体敌人", "consume": "法力",
            "effect": "直接伤害", "category": "群体攻击"}},
        {"name": "Buff技能", "desc": "增强己方属性", "defaults": {
            "name": "铁壁护盾", "type": "增益", "damage_type": "真伤",
            "target": "全体友方", "consume": "法力",
            "effect": "护盾", "category": "防御增益"}},
        {"name": "Debuff技能", "desc": "削弱敌方属性", "defaults": {
            "name": "寒冰诅咒", "type": "减益", "damage_type": "真伤",
            "target": "群体敌人", "consume": "法力",
            "effect": "减速", "category": "控制限制"}},
        {"name": "被动技能", "desc": "永久生效的被动能力", "defaults": {
            "name": "再生之心", "type": "被动", "damage_type": "真伤",
            "target": "自身", "consume": "无消耗",
            "effect": "直接伤害", "category": "被动光环"}},
        {"name": "治疗技能", "desc": "恢复己方生命值", "defaults": {
            "name": "圣光术", "type": "治疗", "damage_type": "真伤",
            "target": "单体友方", "consume": "法力",
            "effect": "直接伤害", "category": "单体治疗"}},
        {"name": "控制技能", "desc": "眩晕/沉默/减速等控制效果", "defaults": {
            "name": "雷霆一击", "type": "控制", "damage_type": "真伤",
            "target": "单体敌人", "consume": "法力",
            "effect": "眩晕", "category": "控制限制"}},
        {"name": "终极技能", "desc": "高消耗强力技能，长冷却", "defaults": {
            "name": "末日审判", "type": "攻击", "damage_type": "真伤",
            "target": "所有目标", "consume": "生命值",
            "effect": "直接伤害", "category": "群体攻击"}},
    ],
    "equip": [
        {"name": "武器", "desc": "增加攻击力", "defaults": {
            "name": "铁剑", "part": "武器", "rare": "普通",
            "job": "战士", "effect": "攻击加成",
            "category": "近战物理"}},
        {"name": "防具", "desc": "增加防御力", "defaults": {
            "name": "皮甲", "part": "胸甲", "rare": "普通",
            "job": "战士", "effect": "防御加成",
            "category": "近战物理"}},
        {"name": "饰品", "desc": "增加特殊属性", "defaults": {
            "name": "敏捷戒指", "part": "戒指", "rare": "稀有",
            "job": "所有", "effect": "暴击率",
            "category": "远程物理"}},
        {"name": "法器", "desc": "增加魔法相关属性", "defaults": {
            "name": "智慧法杖", "part": "武器", "rare": "史诗",
            "job": "法师", "effect": "法力加成",
            "category": "元素魔法"}},
    ],
    "item": [
        {"name": "回血药", "desc": "恢复生命值的消耗品", "defaults": {
            "name": "红药水", "type": "消耗品", "rare": "普通",
            "effect": "回血", "category": "恢复类",
            "value": "50", "buffs": ""}},
        {"name": "回蓝药", "desc": "恢复法力值的消耗品", "defaults": {
            "name": "蓝药水", "type": "消耗品", "rare": "普通",
            "effect": "回蓝", "category": "恢复类",
            "value": "30", "buffs": ""}},
        {"name": "强化石", "desc": "强化装备的消耗材料", "defaults": {
            "name": "强化石", "type": "材料", "rare": "稀有",
            "effect": "强化", "category": "强化类",
            "value": "100", "buffs": ""}},
        {"name": "任务物品", "desc": "用于推进剧情的特殊物品", "defaults": {
            "name": "神秘信件", "type": "任务", "rare": "普通",
            "effect": "解锁剧情", "category": "任务类",
            "value": "0", "buffs": ""}},
        {"name": "稀有材料", "desc": "打造高级装备的核心材料", "defaults": {
            "name": "龙鳞碎片", "type": "材料", "rare": "史诗",
            "effect": "锻造", "category": "材料类",
            "value": "500", "buffs": ""}},
    ],
    "buff": [
        {"name": "攻击Buff", "desc": "增加攻击力，持续一定回合", "defaults": {
            "name": "攻击强化", "type": "增益", "effect_type": "数值加成",
            "value": "15", "duration": "3", "tick_interval": "0",
            "stackable": "否", "max_stacks": "1", "dispel_type": "可驱散",
            "source": "技能", "category": "战斗增益"}},
        {"name": "防御Buff", "desc": "增加防御力，持续一定回合", "defaults": {
            "name": "铁壁", "type": "增益", "effect_type": "数值加成",
            "value": "20", "duration": "3", "tick_interval": "0",
            "stackable": "否", "max_stacks": "1", "dispel_type": "可驱散",
            "source": "技能", "category": "战斗增益"}},
        {"name": "持续伤害", "desc": "每回合造成持续伤害", "defaults": {
            "name": "灼烧", "type": "减益", "effect_type": "持续伤害",
            "value": "10", "duration": "3", "tick_interval": "1",
            "stackable": "可叠加", "max_stacks": "3", "dispel_type": "可驱散",
            "source": "技能", "category": "持续效果"}},
        {"name": "光环Buff", "desc": "被动光环效果，永久持续", "defaults": {
            "name": "勇气光环", "type": "增益", "effect_type": "百分比加成",
            "value": "10", "duration": "0", "tick_interval": "0",
            "stackable": "否", "max_stacks": "1", "dispel_type": "不可驱散",
            "source": "被动", "category": "光环"}},
        {"name": "控制效果", "desc": "使目标无法行动", "defaults": {
            "name": "眩晕", "type": "减益", "effect_type": "控制",
            "value": "1", "duration": "1", "tick_interval": "0",
            "stackable": "否", "max_stacks": "1", "dispel_type": "可驱散",
            "source": "技能", "category": "控制"}},
    ],
    "talent": [
        {"name": "攻击天赋", "desc": "提升角色的物理/法术攻击力", "defaults": {
            "name": "武器精通", "owner": "战士", "type": "战斗",
            "level": "1", "rarity": "普通", "effect_type": "数值加成",
            "value": "10", "unlock_condition": "无",
            "category": "战斗攻击"}},
        {"name": "防御天赋", "desc": "提升角色的生存能力", "defaults": {
            "name": "钢铁之躯", "owner": "骑士", "type": "战斗",
            "level": "1", "rarity": "普通", "effect_type": "数值加成",
            "value": "15", "unlock_condition": "无",
            "category": "战斗防御"}},
        {"name": "探索天赋", "desc": "提升移动速度和探索能力", "defaults": {
            "name": "疾步", "owner": "所有", "type": "冒险",
            "level": "5", "rarity": "稀有", "effect_type": "百分比加成",
            "value": "10", "unlock_condition": "角色等级5",
            "category": "移动探索"}},
        {"name": "生存天赋", "desc": "提升生命上限和回复速度", "defaults": {
            "name": "顽强", "owner": "所有", "type": "生存",
            "level": "3", "rarity": "普通", "effect_type": "百分比加成",
            "value": "15", "unlock_condition": "无",
            "category": "生存能力"}},
        {"name": "社交天赋", "desc": "降低商店价格，提升任务奖励", "defaults": {
            "name": "魅力", "owner": "所有", "type": "社交",
            "level": "1", "rarity": "稀有", "effect_type": "百分比加成",
            "value": "10", "unlock_condition": "无",
            "category": "社交互动"}},
    ],
    "achievement": [
        {"name": "首次击杀", "desc": "击败第一个敌人获得", "defaults": {
            "name": "初出茅庐", "description": "首次击败怪物",
            "condition": "monster_kill >= 1", "reward": "金币x100"}},
        {"name": "收集成就", "desc": "收集指定数量的物品", "defaults": {
            "name": "收藏家", "description": "收集100件不同物品",
            "condition": "item_unique >= 100", "reward": "称号: 收藏家"}},
        {"name": "探索成就", "desc": "探索地图完成度", "defaults": {
            "name": "冒险家", "description": "探索所有地图区域",
            "condition": "map_explored >= 100%", "reward": "称号: 冒险家"}},
        {"name": "等级成就", "desc": "达到指定等级", "defaults": {
            "name": "登峰造极", "description": "角色达到最高等级",
            "condition": "player_level >= 100", "reward": "称号: 传奇"}},
    ],
    "story": [
        {"name": "开场剧情", "desc": "游戏开场介绍世界背景", "defaults": {
            "name": "序幕·命运的召唤", "type": "主线", "order": "1",
            "scene": "新手村·广场", "content": "", "dialog_ids": "",
            "prev_story": "", "next_story": "", "branches": "",
            "condition": "无", "event": "无"}},
        {"name": "分支剧情", "desc": "根据选择产生不同走向", "defaults": {
            "name": "抉择·光与暗", "type": "分支", "order": "5",
            "scene": "营地·夜晚", "content": "", "dialog_ids": "",
            "prev_story": "", "next_story": "", "branches": "",
            "condition": "选择阵营", "event": "阵营变更"}},
        {"name": "支线剧情", "desc": "与主线无关的独立剧情", "defaults": {
            "name": "神秘的委托", "type": "支线", "order": "3",
            "scene": "酒馆·黄昏", "content": "", "dialog_ids": "",
            "prev_story": "", "next_story": "", "branches": "",
            "condition": "与NPC对话", "event": "解锁任务"}},
        {"name": "高潮剧情", "desc": "游戏重要转折点", "defaults": {
            "name": "终章·决战之时", "type": "主线", "order": "100",
            "scene": "最终战场", "content": "", "dialog_ids": "",
            "prev_story": "", "next_story": "", "branches": "",
            "condition": "完成前置主线", "event": "解锁结局"}},
    ],
    "task": [
        {"name": "击杀任务", "desc": "击杀指定怪物", "defaults": {
            "name": "清除野猪", "type": "日常", "difficulty": "简单",
            "level": "1", "reward": "金币x50", "dialog_id": "",
            "category": "战斗击杀"}},
        {"name": "收集任务", "desc": "收集指定物品", "defaults": {
            "name": "采集药草", "type": "日常", "difficulty": "简单",
            "level": "1", "reward": "红药水x3", "dialog_id": "",
            "category": "物品收集"}},
        {"name": "主线任务", "desc": "推动主线剧情发展", "defaults": {
            "name": "第一章·启程", "type": "主线", "difficulty": "普通",
            "level": "1", "reward": "成长礼包", "dialog_id": "",
            "category": "对话交互"}},
        {"name": "探索任务", "desc": "探索指定区域", "defaults": {
            "name": "探索遗迹", "type": "支线", "difficulty": "困难",
            "level": "10", "reward": "宝箱开启", "dialog_id": "",
            "category": "探索发现"}},
        {"name": "护送任务", "desc": "保护目标到达指定地点", "defaults": {
            "name": "护送商队", "type": "支线", "difficulty": "普通",
            "level": "5", "reward": "金币x200", "dialog_id": "",
            "category": "护送保护"}},
        {"name": "解谜任务", "desc": "破解机关或谜题", "defaults": {
            "name": "古代机关", "type": "支线", "difficulty": "精英",
            "level": "15", "reward": "智慧法杖", "dialog_id": "",
            "category": "解谜挑战"}},
    ],
    "dialog": [
        {"name": "打招呼", "desc": "NPC开场问候对话", "defaults": {
            "name": "热情的问候", "speaker": "村民",
            "content": "勇者大人！您终于来了！", "next_dialog": "",
            "options": "", "condition": "无", "event": "无"}},
        {"name": "任务对话", "desc": "NPC委托任务的对话", "defaults": {
            "name": "紧急委托", "speaker": "村长",
            "content": "村子附近的野猪越来越多了，能帮我们清理一下吗？", "next_dialog": "",
            "options": "接受任务|拒绝", "condition": "无", "event": "触发任务:清除野猪"}},
        {"name": "多选对话", "desc": "带有多个选项的对话", "defaults": {
            "name": "命运的分岔", "speaker": "神秘人",
            "content": "你想获得力量，还是自由？", "next_dialog": "",
            "options": "追求力量|渴望自由|什么都不选", "condition": "无", "event": "分支选择"}},
        {"name": "商店对话", "desc": "商人NPC的对话", "defaults": {
            "name": "武器店老板", "speaker": "铁匠",
            "content": "来看看我的新货！都是上好的装备！", "next_dialog": "",
            "options": "购买|出售|离开", "condition": "无", "event": "打开商店"}},
        {"name": "结局对话", "desc": "游戏结局的对话", "defaults": {
            "name": "告别", "speaker": "国王",
            "content": "你的名字将被永远铭记在这片大陆上。", "next_dialog": "",
            "options": "", "condition": "完成最终Boss战", "event": "播放结局动画"}},
    ],

}

DATA_TYPE_LABELS = {
    "role": "角色", "job": "职业", "monster": "怪物",
    "skill": "技能", "equip": "装备", "item": "道具",
    "buff": "Buff", "talent": "天赋", "achievement": "成就",
    "story": "剧情", "task": "任务", "dialog": "对话",
}


class QuickCreateDialog(QDialog):
    """快速创建向导对话框"""

    data_created = pyqtSignal(str, dict)

    def __init__(self, data_manager, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self.setWindowTitle("快速创建")
        self.setMinimumSize(680, 520)
        font = QFont("Microsoft YaHei", 10)
        self.setFont(font)
        self._selected_template = None
        self._selected_card = None
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        top_layout = QHBoxLayout()
        type_label = QLabel("数据类型:")
        type_label.setFixedWidth(60)
        top_layout.addWidget(type_label)

        self.type_combo = QComboBox()
        schema = self.data_manager.config.get_type_schema()
        if schema:
            for t in schema.types:
                label = DATA_TYPE_LABELS.get(t.id, t.name)
                self.type_combo.addItem(label, t.id)
        else:
            for dt, label in DATA_TYPE_LABELS.items():
                self.type_combo.addItem(label, dt)

        self.type_combo.currentIndexChanged.connect(self._on_type_changed)
        top_layout.addWidget(self.type_combo, 1)
        layout.addLayout(top_layout)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        layout.addWidget(self.scroll, 1)

        self.template_container = QWidget()
        self.template_layout = QVBoxLayout(self.template_container)
        self.template_layout.setContentsMargins(0, 0, 0, 0)
        self.scroll.setWidget(self.template_container)

        bottom_layout = QHBoxLayout()
        bottom_layout.addStretch()

        self.create_btn = QPushButton("创建")
        self.create_btn.setEnabled(False)
        self.create_btn.clicked.connect(self._on_create)
        bottom_layout.addWidget(self.create_btn)

        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self.reject)
        bottom_layout.addWidget(cancel_btn)
        layout.addLayout(bottom_layout)

        self._on_type_changed(0)

    def _on_type_changed(self, index):
        data_type = self.type_combo.currentData()
        self._selected_template = None
        self.create_btn.setEnabled(False)

        while self.template_layout.count():
            child = self.template_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        templates = TEMPLATE_DEFS.get(data_type, [])
        if not templates:
            hint = QLabel("暂无预设模板，请直接创建")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.template_layout.addWidget(hint)
            self.create_btn.setEnabled(True)
            self._selected_template = {}
            return

        hint_label = QLabel("选择一个模板快速开始：")
        hint_label.setStyleSheet("font-weight: 600; font-size: 14px; margin-bottom: 8px;")
        self.template_layout.addWidget(hint_label)

        grid = QGridLayout()
        grid.setSpacing(10)
        col = 0
        row = 0
        max_cols = 2

        for tpl in templates:
            card = self._create_template_card(tpl)
            grid.addWidget(card, row, col)
            grid.setRowStretch(row, 1)
            col += 1
            if col >= max_cols:
                col = 0
                row += 1

        self.template_layout.addLayout(grid)

        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet(f"background-color: {theme_color('border')}; max-height: 1px; margin: 12px 0;")
        self.template_layout.addWidget(sep)

        blank_label = QLabel("或者从空白创建：")
        blank_label.setStyleSheet("font-size: 13px;")
        self.template_layout.addWidget(blank_label)

        blank_btn = QPushButton("空白创建")
        blank_btn.setObjectName("blankCreateBtn")
        blank_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        blank_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('input_bg')};
                border: 1.5px dashed {theme_color('border')};
                border-radius: 8px;
                padding: 12px;
                font-size: 14px;
                font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                color: {theme_color('hint')};
            }}
            QPushButton:hover {{
                background-color: {theme_color('border')};
                border-color: {theme_color('hint')};
                color: {theme_color('fg')};
            }}
            QPushButton:pressed {{
                background-color: {theme_color('border')};
            }}
        """)
        blank_btn.clicked.connect(lambda: self._select_template({}))
        self.template_layout.addWidget(blank_btn)

        self.template_layout.addStretch()

    def _create_template_card(self, tpl):
        card = QFrame()
        card._tpl_data = tpl
        card.setMinimumHeight(100)
        card.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        card.setCursor(Qt.CursorShape.PointingHandCursor)
        card.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('bg')};
                border: 1.5px solid {theme_color('border')};
                border-radius: 8px;
                padding: 10px;
                font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
            }}
            QFrame:hover {{
                border-color: {theme_color('accent')};
                background-color: {theme_color('accent_light')};
            }}
            QLabel {{
                font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                border: none;
                background: transparent;
            }}
        """)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(4)

        name_label = QLabel(tpl["name"])
        name_label.setObjectName("cardTitle")
        name_label.setWordWrap(False)
        name_label.setStyleSheet("font-weight: 700; font-size: 14px; font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;")
        layout.addWidget(name_label)

        desc_label = QLabel(tpl["desc"])
        desc_label.setObjectName("cardDesc")
        desc_label.setWordWrap(True)
        desc_label.setStyleSheet(f"font-size: 12px; color: {theme_color('hint')}; font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;")
        layout.addWidget(desc_label)

        card.mousePressEvent = lambda e: self._select_template(tpl, card) if e.button() == Qt.MouseButton.LeftButton else None
        return card

    def _select_template(self, tpl, card=None):
        if self._selected_card:
            self._selected_card.setStyleSheet(f"""
                QFrame {{
                    background-color: {theme_color('bg')};
                    border: 1.5px solid {theme_color('border')};
                    border-radius: 8px;
                    padding: 10px;
                    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                }}
                QFrame:hover {{
                    border-color: {theme_color('accent')};
                    background-color: {theme_color('accent_light')};
                }}
                QLabel {{
                    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                    border: none;
                    background: transparent;
                }}
            """)
            self._selected_card = None

        self._selected_template = tpl
        self.create_btn.setEnabled(True)

        if card:
            self._selected_card = card
            card.setStyleSheet(f"""
                QFrame {{
                    background-color: {theme_color('accent_light')};
                    border: 2px solid {theme_color('accent')};
                    border-radius: 8px;
                    padding: 10px;
                    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                }}
                QLabel {{
                    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                    border: none;
                    background: transparent;
                }}
            """)

    def _on_create(self):
        data_type = self.type_combo.currentData()
        if not data_type:
            return

        plural = self.data_manager.config.get_type_schema()
        data_type + "s"
        if plural:
            for t in plural.types:
                if t.id == data_type:
                    break

        new_item = {}
        new_item['id'] = self.data_manager.generate_id(data_type)

        if self._selected_template and 'defaults' in self._selected_template:
            new_item.update(self._selected_template['defaults'])

        self.data_created.emit(data_type, new_item)
        self.accept()
