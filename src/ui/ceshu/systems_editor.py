"""游戏系统编辑器 — 第五章"游戏系统设计"的动态编辑器

展示所有可用数据类型的勾选列表：
  - 自动从 type_schema 读取所有已注册的数据类型
  - 类型编辑器新增类型后自动出现
  - 基础游戏系统按 SYSTEM_CONFIG_SCHEMA 渲染结构化字段表单
  - 数据类型条目/自定义游戏系统提供"备注"单行输入
"""
from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.logger import get_logger
from config.constants import DATA_TYPE_PLURALS
from core.ceshu.ceshu_constants import (
    SYSTEM_DEPENDENCIES,
    get_reverse_dependencies,
)
from core.ceshu.ceshu_model import SYSTEM_CONFIG_SCHEMA, SYSTEM_LABELS

from .ceshu_theme import (
    ceshu_form_input_qss,
    ceshu_systems_add_btn_qss,
    theme_color,
)

logger = get_logger()

# v5.0: 反向依赖缓存（模块级，避免每次刷新都重算）
_REVERSE_DEPS = get_reverse_dependencies()


class CustomSystemDialog(QDialog):
    """自定义游戏系统对话框：名称 + 映射的数据类型"""

    def __init__(self, available_types: list[tuple[str, str]], parent=None):
        super().__init__(parent)
        self.setWindowTitle("自定义游戏系统")
        self.setMinimumWidth(380)
        self._result: tuple[str, str] | None = None

        layout = QFormLayout(self)

        self._name_edit = QLineEdit()
        self._name_edit.setPlaceholderText("如: 建造系统、坐骑系统 ...")
        self._name_edit.setStyleSheet(ceshu_form_input_qss())
        layout.addRow("游戏系统名称:", self._name_edit)

        self._type_combo = QComboBox()
        self._type_combo.addItem("(通用占位编辑器)", "")
        for tid, tname in available_types:
            self._type_combo.addItem(f"{tname} ({tid})", tid)
        self._type_combo.setStyleSheet(ceshu_form_input_qss())
        layout.addRow("映射数据类型:", self._type_combo)

        btns = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(self._on_accept)
        btns.rejected.connect(self.reject)
        layout.addRow(btns)

    def _on_accept(self):
        name = self._name_edit.text().strip()
        if not name:
            return  # 名称必填
        dtype = self._type_combo.currentData()
        self._result = (name, dtype or None)
        self.accept()

    def get_result(self) -> tuple[str, str | None]:
        return self._result or ("", None)


class SystemsEditor(QWidget):
    """游戏系统编辑器 — 基础游戏系统按 schema 渲染结构化字段 + 动态数据类型 + 自定义"""

    systems_changed = pyqtSignal(dict)

    def __init__(self, systems: dict | None = None, parent=None):
        super().__init__(parent)
        self._systems: dict = {}
        self._schema = None          # TypeSchema 对象
        self._available_types: list[tuple[str, str]] = []  # [(id, name), ...]
        self._rows: list[QFrame] = []
        # P6: 数据→策划书进度回填
        self._data_manager = None
        self._progress_labels: dict[str, QLabel] = {}  # key → QLabel
        # v5.0: 依赖关系标签
        self._dependency_labels: dict[str, QLabel] = {}  # key → QLabel
        self._setup_ui()
        if systems:
            self.set_data(systems)
        # P6: 监听数据变更事件，自动刷新进度
        EventBus().on("data_changed", self._on_data_changed)

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        self._header = QLabel("勾选游戏系统 → 对应编辑器显示在右侧预览面板")
        layout.addWidget(self._header)

        # 去掉内部 QScrollArea，让内容自然展开
        # 外层 ChapterEditPanel 已是 QScrollArea，负责统一滚动
        self._container = QWidget()
        self._rows_layout = QVBoxLayout(self._container)
        self._rows_layout.setContentsMargins(0, 0, 0, 0)
        self._rows_layout.setSpacing(4)
        layout.addWidget(self._container)

        # 操作按钮栏
        btn_layout = QHBoxLayout()
        self._custom_btn = QPushButton("+ 自定义游戏系统")
        self._custom_btn.clicked.connect(self._on_add_custom)
        btn_layout.addWidget(self._custom_btn)

        self._type_btn = QPushButton("⚙ 打开类型编辑器")
        self._type_btn.clicked.connect(self._on_open_type_editor)
        btn_layout.addWidget(self._type_btn)

        # v5.0 优化B: 依赖关系图按钮
        self._graph_btn = QPushButton("🔗 依赖关系图")
        self._graph_btn.clicked.connect(self._on_open_dependency_graph)
        btn_layout.addWidget(self._graph_btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)

        self._apply_theme()

    def _apply_theme(self) -> None:
        self._header.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px;")
        qss = ceshu_systems_add_btn_qss()
        self._custom_btn.setStyleSheet(qss)
        self._type_btn.setStyleSheet(qss)
        # v5.0 优化B: 依赖图按钮同款样式
        self._graph_btn.setStyleSheet(qss)

    # ── 数据接口 ──

    def set_data(self, systems: dict) -> None:
        """设置游戏系统数据（来自 CeshuModel）"""
        self._systems = dict(systems)
        # 兜底：确保基础游戏系统的 config 包含所有标准字段（兼容旧数据）
        for sys_id in SYSTEM_CONFIG_SCHEMA:
            if sys_id in self._systems and isinstance(self._systems[sys_id], dict):
                cfg = self._systems[sys_id].get("config", {})
                if not isinstance(cfg, dict):
                    cfg = {}
                # 补齐缺失字段，不覆盖已有值
                for fname in SYSTEM_CONFIG_SCHEMA[sys_id]:
                    if fname not in cfg:
                        cfg[fname] = ""
                self._systems[sys_id]["config"] = cfg
        self._refresh()
        # P6: 数据切换后刷新进度
        self._refresh_progress()

    def set_data_manager(self, data_manager) -> None:
        """P6: 注入 DataManager，启用进度回填功能"""
        self._data_manager = data_manager
        self._refresh_progress()

    def set_schema(self, schema) -> None:
        """设置类型模式（TypeSchema 对象），动态生成游戏系统列表"""
        self._schema = schema
        self._available_types.clear()
        if schema and hasattr(schema, 'types'):
            for t in schema.types:
                self._available_types.append((t.id, t.name))
        self._ensure_schema_entries()
        self._refresh()

    def _ensure_schema_entries(self) -> None:
        """确保所有类型模式中的数据类型都有对应游戏系统（缺失的自动追加）"""
        for tid, tname in self._available_types:
            if tid not in self._systems:
                self._systems[tid] = {
                    "enabled": False,
                    "name": tname,
                    "data_type": tid,
                    "config": {},
                }

    # ── 自定义游戏系统 ──

    def _on_add_custom(self) -> None:
        if not self._schema:
            # 没有类型模式也能添加，但不显示类型映射选择
            name, ok = QInputDialog.getText(self, "自定义游戏系统", "游戏系统名称:")
            if ok and name.strip():
                key = self._next_custom_key()
                self._systems[key] = {
                    "enabled": True,
                    "name": name.strip(),
                    "data_type": None,
                    "config": {},
                }
                self.systems_changed.emit(dict(self._systems))
                self._refresh()
            return

        dlg = CustomSystemDialog(self._available_types, self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            name, dtype = dlg.get_result()
            if name:
                key = self._next_custom_key()
                self._systems[key] = {
                    "enabled": True,
                    "name": name,
                    "data_type": dtype,
                    "config": {},
                }
                self.systems_changed.emit(dict(self._systems))
                self._refresh()

    def _next_custom_key(self) -> str:
        i = 1
        while f"custom_{i}" in self._systems:
            i += 1
        return f"custom_{i}"

    def _on_delete_system(self, key: str) -> None:
        """删除自定义游戏系统"""
        if key.startswith("custom_"):
            self._systems.pop(key, None)
            self.systems_changed.emit(dict(self._systems))
            self._refresh()

    # ── 类型编辑 ──

    def _on_open_type_editor(self) -> None:
        parent = self.parentWidget()
        while parent:
            if hasattr(parent, '_open_type_editor'):
                parent._open_type_editor()
                return
            parent = parent.parentWidget()

    def _on_open_dependency_graph(self) -> None:
        """v5.0 优化B: 打开系统依赖关系图对话框"""
        # 向上查找 CeshuEditorView 获取 model
        parent = self.parentWidget()
        model = None
        while parent:
            if hasattr(parent, 'model'):
                model = parent.model
                break
            parent = parent.parentWidget()
        from .system_dependency_graph import SystemDependencyGraphDialog
        dlg = SystemDependencyGraphDialog(model, parent=self)
        dlg.exec()

    # ── UI 刷新 ──

    def _refresh(self) -> None:
        """重建所有游戏系统行"""
        while self._rows_layout.count():
            item = self._rows_layout.takeAt(0)
            if item:
                w = item.widget()
                if w is not None:
                    w.setParent(None)
        self._rows.clear()
        # P6: 清空进度标签引用，稍后在 _build_row 中重建
        self._progress_labels.clear()
        # v5.0: 清空依赖标签引用
        self._dependency_labels.clear()

        # 分类排序：基础游戏系统在前（按 schema 顺序），数据类型条目在中，自定义在后
        default_keys = [k for k in SYSTEM_CONFIG_SCHEMA if k in self._systems]
        schema_keys = [tid for tid, _ in self._available_types
                       if tid in self._systems and tid not in SYSTEM_CONFIG_SCHEMA]
        custom_keys = [k for k in self._systems if k.startswith("custom_")]

        for key in default_keys + schema_keys + custom_keys:
            cfg = self._systems[key]
            if not isinstance(cfg, dict):
                cfg = {"enabled": False, "config": {}}

            enabled = cfg.get("enabled", False)
            display_name = cfg.get("name", SYSTEM_LABELS.get(key, key))
            data_type = cfg.get("data_type", "")
            config = cfg.get("config", {})
            if not isinstance(config, dict):
                config = {}

            is_custom = key.startswith("custom_")
            row = self._build_row(key, display_name, data_type, enabled, config, is_custom)
            self._rows_layout.addWidget(row)
            self._rows.append(row)

        self._apply_theme()
        # P6: 重建后刷新进度
        self._refresh_progress()
        # v5.0: 刷新依赖标签
        self._refresh_dependency_labels()

    def _refresh_dependency_labels(self) -> None:
        """v5.0: 刷新所有依赖关系标签

        - 红色：依赖未满足（启用了某系统但其依赖未启用）
        - 绿色：依赖已满足
        - 灰色：被其他系统依赖（仅提示）
        """
        enabled_keys = {k for k, v in self._systems.items()
                        if isinstance(v, dict) and v.get("enabled", False)}
        for key, label in self._dependency_labels.items():
            parts = []
            # 该系统依赖哪些系统
            deps = SYSTEM_DEPENDENCIES.get(key, [])
            if deps:
                dep_names = [SYSTEM_LABELS.get(d, d) for d in deps]
                # 检查依赖是否满足
                missing = [d for d in deps if d not in enabled_keys]
                if missing:
                    missing_names = "、".join(SYSTEM_LABELS.get(d, d) for d in missing)
                    parts.append(f"<span style='color:#e57373'>⚠ 依赖: {missing_names}</span>")
                else:
                    parts.append(f"<span style='color:#81c784'>✓ 依赖: {'、'.join(dep_names)}</span>")
            # 该系统被哪些系统依赖
            dependents = _REVERSE_DEPS.get(key, [])
            if dependents:
                dep_labels = [SYSTEM_LABELS.get(d, d) for d in dependents]
                parts.append(f"<span style='color:{theme_color('hint')}'>被依赖: {'、'.join(dep_labels)}</span>")
            if parts:
                label.setText(" · ".join(parts))
                label.setVisible(True)
            else:
                label.setVisible(False)

    def _build_row(self, key: str, display_name: str, data_type: str,
                   enabled: bool, config: dict, is_custom: bool) -> QFrame:
        row = QFrame()
        row.setFrameShape(QFrame.Shape.StyledPanel)
        row.setStyleSheet(f"""
            QFrame {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
                padding: 4px;
            }}
        """)

        rl = QVBoxLayout(row)
        rl.setContentsMargins(8, 6, 8, 6)
        rl.setSpacing(4)

        # ── 顶行：勾选框 + 名称 + 信息标签 + 删除按钮 ──
        top = QHBoxLayout()

        cb = QCheckBox(display_name if not is_custom else f"自定义·{display_name}")
        cb.setChecked(enabled)
        cb.toggled.connect(lambda checked, k=key: self._on_toggle(k, checked))
        cb.setStyleSheet(f"""
            QCheckBox {{ font-weight: 600; font-size: 13px; color: {theme_color('fg')}; }}
            QCheckBox::indicator {{ width: 18px; height: 18px; }}
        """)
        top.addWidget(cb)

        # 数据类型标签
        dtype_label = QLabel(f"→ {data_type}" if data_type else "(占位)")
        dtype_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; border: none; background: transparent;")
        top.addWidget(dtype_label)

        # v5.0: 依赖关系标签（仅基础游戏系统显示）
        if key in SYSTEM_DEPENDENCIES or key in _REVERSE_DEPS:
            dep_label = QLabel("")
            dep_label.setTextFormat(Qt.TextFormat.RichText)
            dep_label.setStyleSheet(
                f"color: {theme_color('hint')}; font-size: 10px; "
                f"border: none; background: transparent; padding: 1px 4px;"
            )
            top.addWidget(dep_label)
            self._dependency_labels[key] = dep_label

        top.addStretch()

        # P6: 进度标签（有 data_type 时创建，启用时显示）
        if data_type:
            progress_label = QLabel("")
            progress_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; border: none; background: transparent;")
            progress_label.setVisible(enabled)
            top.addWidget(progress_label)
            self._progress_labels[key] = progress_label
            # 勾选状态变化时显隐进度标签
            cb.toggled.connect(lambda checked, lbl=progress_label: lbl.setVisible(checked))

        if is_custom:
            del_btn = QPushButton("✕")
            del_btn.setFixedSize(22, 22)
            del_btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('danger_bg', '#5a1a1a')};
                    color: {theme_color('fg')}; border: none; border-radius: 11px;
                    font-size: 12px; font-weight: bold;
                }}
                QPushButton:hover {{ background: {theme_color('danger_hover')}; }}
            """)
            del_btn.clicked.connect(lambda: self._on_delete_system(key))
            top.addWidget(del_btn)

        rl.addLayout(top)

        # ── 结构化配置区（按 schema 渲染，启用时可见）──
        config_widget = self._build_config_widget(key, config)
        config_widget.setVisible(enabled)
        cb.toggled.connect(lambda checked, w=config_widget: w.setVisible(checked))
        rl.addWidget(config_widget)

        return row

    def _build_config_widget(self, key: str, config: dict) -> QWidget:
        """构建游戏系统配置区：有 schema 用结构化字段，无 schema 用单行备注"""
        widget = QWidget()
        widget.setStyleSheet("border: none; background: transparent;")

        if key in SYSTEM_CONFIG_SCHEMA:
            # 基础游戏系统：按 schema 渲染结构化字段
            form = QFormLayout(widget)
            form.setContentsMargins(8, 4, 8, 4)
            form.setSpacing(4)
            for fname, fdef in SYSTEM_CONFIG_SCHEMA[key].items():
                value = config.get(fname, "")
                field_widget = self._build_field_widget(key, fname, fdef, value)
                label_text = fdef.get("label", fname)
                form.addRow(label_text, field_widget)
        else:
            # 数据类型条目 / 自定义游戏系统：单行备注
            layout = QHBoxLayout(widget)
            layout.setContentsMargins(8, 4, 8, 4)
            note_label = QLabel("备注:")
            note_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; border: none; background: transparent;")
            layout.addWidget(note_label)
            note_edit = QLineEdit()
            note_edit.setText(str(config.get("note", "")))
            note_edit.setPlaceholderText("可选：该游戏系统/数据类型的备注说明")
            note_edit.setStyleSheet(ceshu_form_input_qss())
            note_edit.textChanged.connect(
                lambda t, k=key: self._on_note_changed(k, t))
            layout.addWidget(note_edit)
        return widget

    def _build_field_widget(self, key: str, fname: str, fdef: dict, value) -> QWidget:
        """根据字段定义构建单个输入控件（5 种类型）"""
        ftype = fdef.get("type", "entry")
        if ftype == "combobox":
            combo = QComboBox()
            combo.addItem("(未设置)", "")
            for v in fdef.get("values", []):
                combo.addItem(v, v)
            # 设置当前值
            idx = combo.findData(str(value)) if value else 0
            combo.setCurrentIndex(idx if idx >= 0 else 0)
            combo.setStyleSheet(ceshu_form_input_qss())
            combo.currentIndexChanged.connect(
                lambda _, k=key, fn=fname, c=combo: self._on_field_changed(k, fn, c.currentData() or ""))
            return combo
        elif ftype == "spinbox":
            spin = QSpinBox()
            spin.setRange(fdef.get("from", 0), fdef.get("to", 9999))
            try:
                spin.setValue(int(value) if value != "" else fdef.get("from", 0))
            except (ValueError, TypeError):
                spin.setValue(fdef.get("from", 0))
            spin.setStyleSheet(ceshu_form_input_qss())
            spin.valueChanged.connect(
                lambda v, k=key, fn=fname: self._on_field_changed(k, fn, str(v)))
            return spin
        elif ftype == "checkbox":
            # 开关：勾选=enabled，未勾选=disabled
            from PyQt6.QtWidgets import QCheckBox
            cb = QCheckBox("启用")
            cb.setChecked(str(value) == "enabled")
            cb.setStyleSheet(f"""
                QCheckBox {{ spacing: 6px; color: {theme_color('fg')}; font-size: 12px; }}
                QCheckBox::indicator {{ width: 16px; height: 16px; }}
            """)
            cb.toggled.connect(
                lambda checked, k=key, fn=fname: self._on_field_changed(k, fn, "enabled" if checked else "disabled"))
            return cb
        elif ftype == "textarea":
            # 多行文本（公式、规则、机制描述）
            from PyQt6.QtWidgets import QTextEdit
            te = QTextEdit()
            te.setPlainText(str(value) if value else "")
            te.setMinimumHeight(60)
            te.setMaximumHeight(120)
            te.setStyleSheet(ceshu_form_input_qss())
            te.textChanged.connect(
                lambda k=key, fn=fname, w=te: self._on_field_changed(k, fn, w.toPlainText()))
            return te
        else:
            # entry → QLineEdit
            edit = QLineEdit()
            edit.setText(str(value) if value else "")
            edit.setStyleSheet(ceshu_form_input_qss())
            edit.textChanged.connect(
                lambda t, k=key, fn=fname: self._on_field_changed(k, fn, t))
            return edit

    def _on_toggle(self, key: str, checked: bool) -> None:
        if key in self._systems:
            self._systems[key]["enabled"] = checked
            self.systems_changed.emit(dict(self._systems))
            # v5.0: 实时刷新依赖标签（启用状态变化会影响其他系统的依赖满足情况）
            self._refresh_dependency_labels()

    def _on_field_changed(self, key: str, field_name: str, value: str) -> None:
        """结构化字段值变化"""
        if key in self._systems:
            cfg = self._systems[key].get("config", {})
            if not isinstance(cfg, dict):
                cfg = {}
            cfg[field_name] = value
            self._systems[key]["config"] = cfg
            self.systems_changed.emit(dict(self._systems))

    def _on_note_changed(self, key: str, text: str) -> None:
        """数据类型条目/自定义游戏系统的备注变化"""
        if key in self._systems:
            cfg = self._systems[key].get("config", {})
            if not isinstance(cfg, dict):
                cfg = {}
            cfg["note"] = text
            self._systems[key]["config"] = cfg
            self.systems_changed.emit(dict(self._systems))

    # ── P6: 自动统计回填 ──

    def _on_data_changed(self, **_) -> None:
        """EventBus 'data_changed' 回调 — 刷新所有进度标签"""
        self._refresh_progress()

    def _refresh_progress(self) -> None:
        """刷新所有启用游戏系统的进度标签

        - 无 data_manager 或无进度标签：直接返回
        - 遍历每个启用系统，查询数据条目数
        - 与策划书 config 中的数量约束对比，显示进度
        """
        if not self._data_manager or not self._progress_labels:
            return

        for key, label in self._progress_labels.items():
            try:
                sys_cfg = self._systems.get(key, {})
                if not isinstance(sys_cfg, dict):
                    continue
                data_type = sys_cfg.get("data_type", key)
                if not data_type:
                    label.setText("")
                    continue

                # 获取当前数据条目数
                plural_key = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
                current = len(self._data_manager.data.get(plural_key, []))

                # 查找数量约束（兼容多种字段名）
                config = sys_cfg.get("config", {})
                if not isinstance(config, dict):
                    config = {}
                count_limit = None
                for fname in ["count", f"{data_type}_count", "max_count", "total_count"]:
                    if fname in config:
                        try:
                            val = int(config[fname])
                            if val > 0:
                                count_limit = val
                                break
                        except (ValueError, TypeError):
                            continue

                if count_limit and count_limit > 0:
                    if current == 0:
                        text, color = f"❌ 0/{count_limit}", "hint"
                    elif current >= count_limit:
                        text, color = f"✅ {current}/{count_limit}", "success"
                    else:
                        text, color = f"⚠️ {current}/{count_limit}", "warning"
                else:
                    text, color = (f"📊 {current} 项" if current > 0 else ""), "hint"

                label.setText(text)
                label.setStyleSheet(
                    f"color: {theme_color(color)}; font-size: 11px; "
                    f"border: none; background: transparent;"
                )
            except Exception as e:
                logger.debug(f"[P6] 刷新进度失败 {key}: {e}")
                label.setText("")

    def get_data(self) -> dict:
        return dict(self._systems)
