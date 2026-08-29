"""P3: 系统确认弹窗 — AI 生成策划书后弹出，让用户确认游戏系统 + 字段架构预览

合并了"系统确认"和"字段架构生成"为一步：
- 显示 AI 推荐启用的游戏系统列表（带勾选）
- 每个系统展开后显示标准字段架构预览
- 用户可勾选/取消、新增自定义系统
- 确认后保存到策划书 + 触发 TypeSchema 注册
"""
from __future__ import annotations

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from ui.themes import theme_color

logger = get_logger()


class SystemConfirmDialog(QDialog):
    """系统确认弹窗 — AI 生成策划书后显示，用户确认/调整游戏系统"""

    # 信号：用户确认后发射，参数为最终启用的系统键列表
    confirmed = pyqtSignal(list)

    def __init__(self, model, parent=None):
        """初始化

        Args:
            model: CeshuModel 实例，包含 systems 配置
            parent: 父窗口
        """
        super().__init__(parent)
        self._model = model
        self._checkboxes: dict[str, QCheckBox] = {}  # sys_key -> checkbox
        self._custom_systems: list[dict] = []  # 用户新增的自定义系统
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        self.setWindowTitle("确认游戏系统 + 字段架构")
        self.setMinimumSize(700, 600)
        self.setModal(True)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(12)

        # ── 标题 ──
        title = QLabel("✅ 确认游戏系统 + 字段架构预览")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        hint = QLabel("AI 已根据你的描述推荐了游戏系统。请勾选确认，可展开查看字段架构。")
        hint.setWordWrap(True)
        hint.setStyleSheet(f"color: {theme_color('hint')}; font-size: 12px;")
        layout.addWidget(hint)

        # ── 系统列表（滚动区） ──
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        container = QWidget()
        self._grid = QGridLayout(container)
        self._grid.setContentsMargins(0, 0, 0, 0)
        self._grid.setSpacing(8)

        from core.ceshu.ceshu_model import SYSTEM_CONFIG_SCHEMA, SYSTEM_LABELS

        # 按启用顺序排列：启用的在前，禁用的在后
        all_systems = list(self._model.systems.items())
        all_systems.sort(key=lambda kv: 0 if (isinstance(kv[1], dict) and kv[1].get("enabled")) else 1)

        row = 0
        for sys_key, sys_cfg in all_systems:
            if not isinstance(sys_cfg, dict):
                continue
            enabled = bool(sys_cfg.get("enabled", False))
            sys_name = sys_cfg.get("name", SYSTEM_LABELS.get(sys_key, sys_key))
            data_type = sys_cfg.get("data_type", sys_key)

            # 系统卡片
            card = QFrame()
            card.setObjectName("SystemCard")
            card_layout = QVBoxLayout(card)
            card_layout.setContentsMargins(12, 8, 12, 8)
            card_layout.setSpacing(4)

            # 勾选行
            check_row = QHBoxLayout()
            cb = QCheckBox(f"{sys_name}  ({data_type})")
            cb.setChecked(enabled)
            cb.setFont(QFont("Microsoft YaHei", 10, QFont.Weight.Medium))
            self._checkboxes[sys_key] = cb
            check_row.addWidget(cb)

            # AI 推荐理由（如果有）
            ai_reason = sys_cfg.get("ai_reason", "")
            if ai_reason:
                reason_label = QLabel(f"💡 {ai_reason}")
                reason_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px;")
                reason_label.setWordWrap(True)
                check_row.addWidget(reason_label, stretch=1)

            card_layout.addLayout(check_row)

            # 字段架构预览（来自 SYSTEM_CONFIG_SCHEMA）
            if sys_key in SYSTEM_CONFIG_SCHEMA:
                fields = SYSTEM_CONFIG_SCHEMA[sys_key]
                field_text = self._format_fields_preview(fields, sys_cfg.get("config", {}))
                if field_text:
                    fields_label = QLabel(field_text)
                    fields_label.setStyleSheet(
                        f"color: {theme_color('hint')}; font-size: 11px; padding-left: 24px;"
                    )
                    fields_label.setWordWrap(True)
                    fields_label.setVisible(enabled)  # 默认展开/收起
                    cb.toggled.connect(fields_label.setVisible)
                    card_layout.addWidget(fields_label)
            elif sys_cfg.get("config", {}).get("note"):
                # 自定义系统的 note
                note_label = QLabel(f"📝 {sys_cfg['config']['note']}")
                note_label.setStyleSheet(
                    f"color: {theme_color('hint')}; font-size: 11px; padding-left: 24px;"
                )
                note_label.setWordWrap(True)
                note_label.setVisible(enabled)
                cb.toggled.connect(note_label.setVisible)
                card_layout.addWidget(note_label)

            self._grid.addWidget(card, row, 0)
            row += 1

        scroll.setWidget(container)
        layout.addWidget(scroll, stretch=1)

        # ── 自定义系统输入行 ──
        custom_row = QHBoxLayout()
        self._custom_input = QLineEdit()
        self._custom_input.setPlaceholderText("新增自定义系统名称（如 tower_defense）...")
        custom_row.addWidget(self._custom_input, stretch=1)

        add_btn = QPushButton("+ 添加")
        add_btn.clicked.connect(self._on_add_custom)
        custom_row.addWidget(add_btn)
        layout.addLayout(custom_row)

        # ── 底部按钮 ──
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self.reject)
        btn_row.addWidget(cancel_btn)

        confirm_btn = QPushButton("✅ 确认生成")
        confirm_btn.setObjectName("PrimaryBtn")
        confirm_btn.clicked.connect(self._on_confirm)
        btn_row.addWidget(confirm_btn)
        layout.addLayout(btn_row)

    def _format_fields_preview(self, fields: dict, config: dict) -> str:
        """格式化字段架构预览"""
        parts = []
        for fname, fdef in fields.items():
            ftype = fdef.get("type", "entry")
            label = fdef.get("label", fname).rstrip(":")
            current_val = config.get(fname, "")
            val_str = f" = {current_val}" if current_val else ""
            parts.append(f"• {fname} ({label}, {ftype}){val_str}")
        return "\n".join(parts[:8]) + (f"\n... 共 {len(parts)} 个字段" if len(parts) > 8 else "")

    def _on_add_custom(self) -> None:
        """添加自定义系统"""
        name = self._custom_input.text().strip()
        if not name:
            return
        if name in self._checkboxes:
            QMessageBox.warning(self, "提示", f"系统 '{name}' 已存在")
            return

        # 添加到列表
        card = QFrame()
        card.setObjectName("SystemCard")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(12, 8, 12, 8)

        cb = QCheckBox(f"{name}  (自定义)")
        cb.setChecked(True)
        cb.setFont(QFont("Microsoft YaHei", 10, QFont.Weight.Medium))
        self._checkboxes[name] = cb
        card_layout.addWidget(cb)

        note_label = QLabel("📝 自定义系统，可在策划书编辑器中详细配置")
        note_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; padding-left: 24px;")
        note_label.setWordWrap(True)
        card_layout.addWidget(note_label)

        row = self._grid.rowCount()
        self._grid.addWidget(card, row, 0)
        self._custom_systems.append({"key": name, "name": name})
        self._custom_input.clear()

    def _on_confirm(self) -> None:
        """确认 → 保存到策划书 + 发射信号"""
        enabled_keys = []
        for sys_key, cb in self._checkboxes.items():
            if cb.isChecked():
                enabled_keys.append(sys_key)

        # 更新 model.systems
        for sys_key, sys_cfg in self._model.systems.items():
            if isinstance(sys_cfg, dict):
                sys_cfg["enabled"] = sys_key in enabled_keys

        # 添加自定义系统
        for custom in self._custom_systems:
            key = custom["key"]
            if key not in self._model.systems:
                self._model.add_system(key, {"note": "自定义系统"})
                self._model.systems[key]["enabled"] = True
                self._model.systems[key]["name"] = custom["name"]

        self.confirmed.emit(enabled_keys)
        self.accept()

    def _apply_theme(self) -> None:
        """应用主题样式"""
        self.setStyleSheet(f"""
            QDialog {{ background: {theme_color('bg')}; }}
            QFrame#SystemCard {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
            }}
            QCheckBox {{ color: {theme_color('fg')}; spacing: 8px; }}
            QCheckBox::indicator {{
                width: 16px; height: 16px;
                border: 2px solid {theme_color('border')};
                border-radius: 4px;
                background: {theme_color('bg')};
            }}
            QCheckBox::indicator:checked {{
                background: {theme_color('accent')};
                border-color: {theme_color('accent')};
            }}
            QLineEdit {{
                border: 1px solid {theme_color('border')};
                border-radius: 6px; padding: 8px 12px;
                background: {theme_color('input_bg')};
                color: {theme_color('fg')};
            }}
            QPushButton {{
                border-radius: 6px; padding: 8px 16px;
                border: 1px solid {theme_color('border')};
                background: {theme_color('input_bg')};
                color: {theme_color('fg')};
            }}
            QPushButton#PrimaryBtn {{
                background: {theme_color('accent')};
                color: white; border: none;
                padding: 10px 24px; font-weight: 600;
            }}
            QPushButton#PrimaryBtn:hover {{
                background: {theme_color('accent_hover')};
            }}
            QScrollArea {{ border: none; }}
        """)
