"""引导式主页 - 工作流导向的起始界面"""
from common.logger import get_logger

logger = get_logger()

import json
from pathlib import Path

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QFrame, QGridLayout, QHBoxLayout, QLabel, QPushButton, QSizePolicy, QVBoxLayout, QWidget

from common.event_bus import EventBus
from ui.themes import theme_color

DATA_TYPE_LABELS = {
    "role": "角色", "job": "职业", "monster": "怪物",
    "skill": "技能", "equip": "装备", "item": "道具",
    "buff": "Buff", "talent": "天赋", "achievement": "成就",
    "story": "剧情", "task": "任务", "dialog": "对话",
}

QUICK_ACTIONS = [
    {"id": "create_role", "label": "创建角色", "icon": "\u2694\ufe0f",
     "desc": "\u8bbe\u8ba1\u4e00\u4e2a\u65b0\u7684\u6e38\u620f\u89d2\u8272", "data_type": "role"},
    {"id": "create_monster", "label": "\u521b\u5efa\u602a\u7269", "icon": "\ud83d\udc79",
     "desc": "\u8bbe\u8ba1\u4e00\u4e2a\u65b0\u7684\u654c\u4eba", "data_type": "monster"},
    {"id": "create_skill", "label": "\u521b\u5efa\u6280\u80fd", "icon": "\u2728",
     "desc": "\u8bbe\u8ba1\u4e00\u4e2a\u65b0\u7684\u6280\u80fd", "data_type": "skill"},
    {"id": "create_equip", "label": "\u521b\u5efa\u88c5\u5907", "icon": "\ud83d\udee1\ufe0f",
     "desc": "\u8bbe\u8ba1\u4e00\u4ef6\u65b0\u88c5\u5907", "data_type": "equip"},
    {"id": "batch_create", "label": "\u6279\u91cf\u521b\u5efa", "icon": "\ud83d\udce6",
     "desc": "\u4f7f\u7528\u6a21\u677f\u6279\u91cf\u751f\u6210\u6570\u636e", "data_type": None},
    {"id": "view_relations", "label": "\u67e5\u770b\u5173\u8054", "icon": "\ud83d\udd17",
     "desc": "\u6d4f\u89c8\u6570\u636e\u4e4b\u95f4\u7684\u5f15\u7528\u5173\u7cfb", "data_type": None},
]


class OnboardingGuide(QFrame):
    """快速入门引导区 — 5 步引导卡片，展示核心工作流入口"""

    action_triggered = pyqtSignal(str, str)

    STEPS = [
        {"id": "onboarding_library", "icon": "📁", "title": "创建游戏库",
         "desc": "管理你的游戏项目，每个库独立配置数据结构和类型"},
        {"id": "onboarding_types", "icon": "📋", "title": "定义数据类型",
         "desc": "配置角色、技能、装备等数据类型的字段结构"},
        {"id": "onboarding_data", "icon": "✏️", "title": "编辑游戏数据",
         "desc": "在表格中增删改查游戏配置数据"},
        {"id": "onboarding_ceshu", "icon": "📝", "title": "撰写策划书",
         "desc": "用结构化模板编写游戏设计文档"},
        {"id": "onboarding_ai", "icon": "🤖", "title": "AI 辅助",
         "desc": "使用 AI 生成数据、分析数值平衡"},
    ]

    def __init__(self, data_manager, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self._collapsed = False
        self._completed = set()
        self._config_dir = None
        if hasattr(data_manager, 'config') and data_manager.config:
            self._config_dir = data_manager.config.config_dir
        self._load_state()
        self._setup_ui()

    # ---- 状态持久化 ----

    def _get_config_path(self) -> Path:
        if self._config_dir:
            return self._config_dir / "app_config.json"
        return Path("app_config.json")

    def _load_state(self):
        try:
            path = self._get_config_path()
            if path.exists():
                with open(path, encoding='utf-8') as f:
                    data = json.load(f)
                self._collapsed = data.get("onboarding_collapsed", False)
                self._completed = set(data.get("onboarding_completed", []))
        except Exception:
            self._collapsed = False
            self._completed = set()

    def _save_state(self):
        try:
            path = self._get_config_path()
            data = {}
            if path.exists():
                with open(path, encoding='utf-8') as f:
                    data = json.load(f)
            data["onboarding_collapsed"] = self._collapsed
            data["onboarding_completed"] = list(self._completed)
            data["onboarding_done"] = len(self._completed) >= len(self.STEPS)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    # ---- UI ----

    def _setup_ui(self):
        self.setObjectName("onboardingGuide")
        self.setStyleSheet(f"""
            QFrame#onboardingGuide {{
                background: {theme_color('accent_light')};
                border: 1px solid {theme_color('border')};
                border-radius: 12px;
            }}
        """)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # ---- 标题栏（可点击折叠） ----
        header = QFrame()
        header.setObjectName("guideHeader")
        header.setCursor(Qt.CursorShape.PointingHandCursor)
        header.setStyleSheet("QFrame#guideHeader { background: transparent; border: none; }")

        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(16, 10, 16, 10)
        header_layout.setSpacing(8)

        collapse_icon = QLabel("▼" if not self._collapsed else "▶")
        collapse_icon.setStyleSheet(f"font-size: 10px; color: {theme_color('hint')}; border: none; background: transparent;")
        collapse_icon.setObjectName("guideCollapseIcon")
        header_layout.addWidget(collapse_icon)

        title = QLabel("🚀 快速入门")
        title.setStyleSheet(f"font-size: 15px; font-weight: 700; color: {theme_color('fg')}; border: none; background: transparent;")
        header_layout.addWidget(title)

        # 进度
        completed_count = len(self._completed)
        total = len(self.STEPS)
        progress = QLabel(f"{completed_count}/{total} 已完成")
        progress.setObjectName("guideProgress")
        progress.setStyleSheet(f"font-size: 11px; color: {theme_color('hint')}; border: none; background: transparent;")
        header_layout.addWidget(progress)
        header_layout.addStretch()

        dismiss_btn = QPushButton("✕")
        dismiss_btn.setFixedSize(22, 22)
        dismiss_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent; color: {theme_color('hint')};
                border: none; font-size: 12px;
            }}
            QPushButton:hover {{ color: {theme_color('danger')}; }}
        """)
        dismiss_btn.setToolTip("关闭引导")
        dismiss_btn.clicked.connect(self._do_dismiss)
        header_layout.addWidget(dismiss_btn)

        header.mousePressEvent = lambda e: self._toggle_collapsed() if e.button() == Qt.MouseButton.LeftButton else None
        outer.addWidget(header)

        # ---- 卡片区 ----
        self._card_container = QWidget()
        self._card_container.setObjectName("guideCards")
        self._card_container.setStyleSheet("QWidget#guideCards { background: transparent; border: none; }")
        self._card_container.setVisible(not self._collapsed)

        cards_layout = QHBoxLayout(self._card_container)
        cards_layout.setContentsMargins(12, 0, 12, 12)
        cards_layout.setSpacing(8)

        for i, step in enumerate(self.STEPS):
            card = self._create_step_card(i, step)
            cards_layout.addWidget(card)

        outer.addWidget(self._card_container)

    def _create_step_card(self, index: int, step: dict) -> QFrame:
        done = index in self._completed
        card = QFrame()
        card.setObjectName(f"stepCard_{index}")
        accent = theme_color('accent')
        hint = theme_color('hint')
        fg = theme_color('fg')
        input_bg = theme_color('input_bg')

        card.setStyleSheet(f"""
            QFrame#stepCard_{index} {{
                background: {input_bg if not done else f'{hint}20'};
                border: 1px solid {accent}40;
                border-radius: 10px;
            }}
        """)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(4)

        # 序号圆
        num_frame = QFrame()
        num_frame.setFixedSize(24, 24)
        num_frame.setStyleSheet(f"""
            QFrame {{
                background: {accent if not done else hint};
                border-radius: 12px;
            }}
        """)
        num_layout = QVBoxLayout(num_frame)
        num_layout.setContentsMargins(0, 0, 0, 0)
        num_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        num_label = QLabel("✓" if done else str(index + 1))
        num_label.setStyleSheet("font-size: 11px; font-weight: bold; color: white; border: none; background: transparent;")
        num_layout.addWidget(num_label)

        row1 = QHBoxLayout()
        row1.setSpacing(6)
        row1.addWidget(num_frame)

        icon_label = QLabel(step["icon"])
        icon_label.setStyleSheet("font-size: 18px; border: none; background: transparent;")
        row1.addWidget(icon_label)

        title = QLabel(step["title"])
        title.setStyleSheet(f"font-weight: 700; font-size: 13px; color: {fg if not done else hint}; border: none; background: transparent;")
        row1.addWidget(title)
        row1.addStretch()
        layout.addLayout(row1)

        desc = QLabel(step["desc"])
        desc.setStyleSheet(f"font-size: 11px; color: {hint}; border: none; background: transparent; padding-left: 30px;")
        desc.setWordWrap(True)
        layout.addWidget(desc)

        layout.addStretch()

        # 操作按钮
        if not done:
            btn = QPushButton("开始")
            btn.setFixedHeight(26)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {accent}; color: white; border: none;
                    border-radius: 5px; font-size: 11px; font-weight: 600;
                    padding: 0 12px;
                }}
                QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
            """)
            btn.clicked.connect(lambda checked, idx=index, s=step: self._do_step(idx, s))
            layout.addWidget(btn, alignment=Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignBottom)

        return card

    # ---- 动作 ----

    def _toggle_collapsed(self):
        self._collapsed = not self._collapsed
        self._card_container.setVisible(not self._collapsed)
        icon = self.findChild(QLabel, "guideCollapseIcon")
        if icon:
            icon.setText("▼" if not self._collapsed else "▶")
        self._save_state()

    def _do_dismiss(self):
        """关闭引导区（标记折叠并保存）"""
        self._collapsed = True
        self._card_container.setVisible(False)
        icon = self.findChild(QLabel, "guideCollapseIcon")
        if icon:
            icon.setText("▶")
        self._save_state()

    def _do_step(self, index: int, step: dict):
        self._completed.add(index)
        self._save_state()
        # 更新进度
        progress = self.findChild(QLabel, "guideProgress")
        if progress:
            progress.setText(f"{len(self._completed)}/{len(self.STEPS)} 已完成")
        # 刷新卡片状态
        self._refresh_cards()
        # 发射信号
        self.action_triggered.emit(step["id"], "")
        # 全部完成自动折叠
        if len(self._completed) >= len(self.STEPS):
            QTimer.singleShot(500, self._do_dismiss)

    def _refresh_cards(self):
        old_container = self._card_container
        idx = self.layout().indexOf(old_container)
        if idx >= 0:
            self.layout().removeWidget(old_container)
            old_container.deleteLater()
        self._card_container = QWidget()
        self._card_container.setObjectName("guideCards")
        self._card_container.setStyleSheet("QWidget#guideCards { background: transparent; border: none; }")
        self._card_container.setVisible(not self._collapsed)

        cards_layout = QHBoxLayout(self._card_container)
        cards_layout.setContentsMargins(12, 0, 12, 12)
        cards_layout.setSpacing(8)

        for i, step in enumerate(self.STEPS):
            card = self._create_step_card(i, step)
            cards_layout.addWidget(card)

        self.layout().insertWidget(idx, self._card_container)

    def reset(self):
        """重置引导状态（供「帮助 → 快速入门」菜单使用）"""
        self._collapsed = False
        self._completed = set()
        self._save_state()
        self._refresh_cards()
        icon = self.findChild(QLabel, "guideCollapseIcon")
        if icon:
            icon.setText("▼")
        self._card_container.setVisible(True)


class HomeWidget(QWidget):
    """\u5f15\u5bfc\u5f0f\u4e3b\u9875"""

    action_triggered = pyqtSignal(str, str)

    def __init__(self, data_manager, parent=None):
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.data_manager = data_manager
        self._stats_dirty = False
        self._stats_timer = QTimer(self)
        self._stats_timer.setSingleShot(True)
        self._stats_timer.timeout.connect(self._on_stats_timer)
        EventBus().on("data_changed", self._mark_stats_dirty)
        # 策划书上下文/显示类型变化 → 刷新数据概览卡片
        EventBus().on("ceshu_context_changed", self._mark_stats_dirty)
        self._guide = None
        self._setup_ui()

    def _mark_stats_dirty(self, **_):
        self._stats_dirty = True
        self._stats_timer.start(200)

    def _on_stats_timer(self):
        if self._stats_dirty:
            self._stats_dirty = False
            self._refresh_stats()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 24, 32, 24)
        layout.setSpacing(16)

        # 快速入门引导区
        self._guide = OnboardingGuide(self.data_manager, self)
        self._guide.action_triggered.connect(self.action_triggered.emit)
        layout.addWidget(self._guide)

        welcome = QLabel("今天想做什么？")
        welcome.setStyleSheet("font-size: 20px; font-weight: 700; margin-bottom: 4px; font-family: 'Microsoft YaHei', sans-serif;")
        welcome.setObjectName("welcomeLabel")
        layout.addWidget(welcome)

        subtitle = QLabel("\u9009\u62e9\u4e00\u4e2a\u64cd\u4f5c\u5feb\u901f\u5f00\u59cb\uff0c\u6216\u67e5\u770b\u6570\u636e\u6982\u89c8")
        subtitle.setStyleSheet(f"font-size: 13px; color: {theme_color('hint')}; margin-bottom: 8px; font-family: 'Microsoft YaHei', sans-serif;")
        subtitle.setObjectName("subtitleLabel")
        layout.addWidget(subtitle)

        grid = QGridLayout()
        grid.setSpacing(12)
        col = 0
        row = 0
        max_cols = 3

        for action in QUICK_ACTIONS:
            card = self._create_action_card(action)
            grid.addWidget(card, row, col)
            col += 1
            if col >= max_cols:
                col = 0
                row += 1

        layout.addLayout(grid)

        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setObjectName("homeSep")
        layout.addWidget(sep)

        stats_header = QHBoxLayout()
        stats_label = QLabel("\ud83d\udcca \u6570\u636e\u6982\u89c8")
        stats_label.setStyleSheet("font-size: 16px; font-weight: 700; margin-top: 4px; font-family: 'Microsoft YaHei', sans-serif;")
        stats_label.setObjectName("statsTitle")
        stats_header.addWidget(stats_label)
        stats_header.addStretch()
        self._manage_btn = QPushButton("⚙ 管理显示类型")
        self._manage_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._manage_btn.setStyleSheet(
            f"font-size: 12px; color: {theme_color('accent')}; border: none; "
            f"background: transparent; padding: 2px 6px;"
        )
        self._manage_btn.setToolTip("选择首页数据概览区显示哪些数据类型（数据本身不受影响）")
        self._manage_btn.clicked.connect(self._on_manage_visible_types)
        stats_header.addWidget(self._manage_btn)
        layout.addLayout(stats_header)

        self.stats_container = QWidget()
        self.stats_layout = QHBoxLayout(self.stats_container)
        self.stats_layout.setContentsMargins(0, 0, 0, 0)
        self.stats_layout.setSpacing(12)
        layout.addWidget(self.stats_container)

        self._safe_refresh_stats()
        layout.addStretch()

    def _create_action_card(self, action):
        card = QFrame()
        card.setObjectName("actionCard")
        card.setFixedHeight(90)
        card.setCursor(Qt.CursorShape.PointingHandCursor)
        card.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        # 键盘可达性：可聚焦 + Tab 遍历 + Enter/Space 触发
        card.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        card.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(16, 10, 16, 10)
        card_layout.setSpacing(4)

        title_row = QHBoxLayout()
        icon_label = QLabel(action["icon"])
        icon_label.setStyleSheet("font-size: 20px; border: none; background: transparent;")
        title_row.addWidget(icon_label)

        name_label = QLabel(action["label"])
        name_label.setStyleSheet("font-weight: 700; font-size: 14px; font-family: 'Microsoft YaHei', sans-serif; border: none; background: transparent;")
        name_label.setObjectName("actionTitle")
        title_row.addWidget(name_label)
        title_row.addStretch()
        card_layout.addLayout(title_row)

        desc_label = QLabel(action["desc"])
        desc_label.setStyleSheet(f"font-size: 12px; color: {theme_color('hint')}; font-family: 'Microsoft YaHei', sans-serif; border: none; background: transparent;")
        desc_label.setObjectName("actionDesc")
        card_layout.addWidget(desc_label)

        card.mousePressEvent = lambda e, a=action: self._on_action(a) if e.button() == Qt.MouseButton.LeftButton else None
        # 键盘触发：Enter / Space 等同于点击
        original_key_press = card.keyPressEvent
        def _key_press(event, a=action, _orig=original_key_press):
            if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Space):
                self._on_action(a)
                event.accept()
            else:
                _orig(event)
        card.keyPressEvent = _key_press
        return card

    def _on_action(self, action):
        action_id = action["id"]
        data_type = action.get("data_type") or ""
        self.action_triggered.emit(action_id, data_type)

    def _safe_refresh_stats(self):
        try:
            all_data = getattr(self.data_manager, "data", None)
            if not isinstance(all_data, dict):
                return
            schema = None
            try:
                if hasattr(self.data_manager, "config") and self.data_manager.config:
                    schema = self.data_manager.config.get_type_schema()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

            if schema and hasattr(schema, "types"):
                for t in schema.types:
                    if not self._is_type_allowed(t.id):
                        continue
                    label = DATA_TYPE_LABELS.get(t.id, t.name)
                    items = all_data.get(t.plural_key, [])
                    count = len(items) if isinstance(items, list) else 0
                    stat_card = self._create_stat_card(label, count, t.color)
                    self.stats_layout.addWidget(stat_card)
            else:
                for data_type, label in DATA_TYPE_LABELS.items():
                    items = all_data.get(data_type + "s", [])
                    count = len(items) if isinstance(items, list) else 0
                    stat_card = self._create_stat_card(label, count, theme_color('hint'))
                    self.stats_layout.addWidget(stat_card)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _refresh_stats(self):
        while self.stats_layout.count():
            child = self.stats_layout.takeAt(0)
            if child.widget():
                w = child.widget()
                w.setParent(None)  # 立即从 widget 树移除，避免 findChildren 命中旧卡片
                w.deleteLater()
        self._safe_refresh_stats()

    def _is_type_allowed(self, data_type: str) -> bool:
        """按当前上下文判断是否显示该类型（策划书过滤 > 用户显示配置）"""
        try:
            parent = self.parent()
            if parent is not None and hasattr(parent, 'tab_mgr'):
                return parent.tab_mgr.is_type_allowed(data_type)
        except Exception:
            pass
        # 兜底：直接读配置
        try:
            config = getattr(self.data_manager, 'config', None)
            visible = getattr(config, 'visible_types', None)
            if visible is not None:
                return data_type in visible
        except Exception:
            pass
        return True

    def _on_manage_visible_types(self):
        """打开「显示类型」选择对话框，保存并刷新概览区"""
        try:
            config = getattr(self.data_manager, 'config', None)
            if config is None:
                return
            schema = config.get_type_schema()
            if schema is None or not getattr(schema, 'types', None):
                from PyQt6.QtWidgets import QMessageBox
                QMessageBox.information(self, "管理显示类型", "当前库没有可用的数据类型")
                return
            from ui.dialogs.type_visibility_dialog import TypeVisibilityDialog
            dlg = TypeVisibilityDialog(schema, config.visible_types, parent=self)
            if dlg.exec() != TypeVisibilityDialog.DialogCode.Accepted:
                return
            config.visible_types = dlg.result_types()
            config.save_ui_prefs()
            self._refresh_stats()
            # 通知主窗口重建标签页（如果有可见标签页载体）
            parent = self.parent()
            if parent is not None and hasattr(parent, 'tab_mgr'):
                parent.tab_mgr.invalidate_tab_configs()
                if hasattr(parent, '_rebuild_all_tabs'):
                    parent._rebuild_all_tabs()
        except Exception as e:
            logger.warning(f"管理显示类型失败: {e}", exc_info=True)

    def _create_stat_card(self, label, count, color):
        card = QFrame()
        card.setObjectName("statCard")
        card.setFixedHeight(60)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(12, 6, 12, 6)
        card_layout.setSpacing(2)

        count_label = QLabel(str(count))
        count_label.setStyleSheet(f"font-size: 20px; font-weight: 700; color: {color}; font-family: 'Microsoft YaHei', sans-serif; border: none; background: transparent;")
        card_layout.addWidget(count_label)

        name_label = QLabel(label)
        name_label.setStyleSheet(f"font-size: 12px; color: {theme_color('hint')}; font-family: 'Microsoft YaHei', sans-serif; border: none; background: transparent;")
        card_layout.addWidget(name_label)

        return card

    def refresh(self):
        self._refresh_stats()

    def get_guide(self):
        """获取引导区实例（供「帮助 → 快速入门」菜单调用）"""
        return self._guide
