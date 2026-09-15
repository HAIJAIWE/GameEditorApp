"""章节编辑面板 — 左侧九章折叠面板，接入8主题

修复：用 QPushButton 做折叠标题替代 QGroupBox.checkable，避免信号冲突
"""
from __future__ import annotations

from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from common.lucide_icon import get_icon
from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS

from .ceshu_theme import theme_color
from .chapter_forms import (
    ChapterAccessibilityForm,
    ChapterArtForm,
    ChapterAudioForm,
    ChapterCharactersForm,
    ChapterCombatForm,
    ChapterEconomyForm,
    ChapterGameplayForm,
    ChapterMarketAnalysisForm,
    ChapterMetaForm,
    ChapterMonetizationForm,
    ChapterMvpForm,
    ChapterNumericForm,
    ChapterResourcesForm,
    ChapterRiskHandlingForm,
    ChapterTechForm,
    ChapterVisionForm,
    ChapterWorldviewForm,
)
from .competitive_chart import CompetitiveChart
from .systems_editor import SystemsEditor


class _CollapsibleSection(QWidget):
    """可折叠章节 — 标题按钮 + 内容区"""

    toggled = pyqtSignal(str, bool)  # chapter_key, expanded
    clicked = pyqtSignal(str)  # chapter_key

    def __init__(self, key: str, title: str, parent=None):
        super().__init__(parent)
        self._key = key
        self._expanded = True
        self._setup_ui(title)

    def _setup_ui(self, title: str) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 标题栏容器：标题按钮 + 进度条
        header_row = QHBoxLayout()
        header_row.setContentsMargins(0, 0, 0, 0)
        header_row.setSpacing(6)

        self._header = QPushButton(f"  {title}")
        self._header.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        self._header.setFlat(True)
        self._header.setCursor(Qt.CursorShape.PointingHandCursor)
        self._header.clicked.connect(self._on_header_click)
        self._header.setIcon(get_icon("chevron-down", theme_color('hint'), 18))
        self._header.setIconSize(QSize(18, 18))
        header_row.addWidget(self._header, 1)

        # v5.0 优化3: 章节完成度微型进度条
        self._progress_bar = QProgressBar()
        self._progress_bar.setRange(0, 100)
        self._progress_bar.setValue(0)
        self._progress_bar.setTextVisible(False)
        self._progress_bar.setFixedWidth(60)
        self._progress_bar.setFixedHeight(6)
        self._progress_bar.setToolTip("章节完成度（点击校验按钮查看详情）")
        self._progress_bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: none;
                border-radius: 3px;
            }}
            QProgressBar::chunk {{
                background: {theme_color('hint')};
                border-radius: 3px;
            }}
        """)
        header_row.addWidget(self._progress_bar, 0, Qt.AlignmentFlag.AlignVCenter)

        # 包装标题栏
        header_container = QWidget()
        header_container.setLayout(header_row)
        layout.addWidget(header_container)

        # 内容区容器
        self._content = QWidget()
        self._content_layout = QVBoxLayout(self._content)
        self._content_layout.setContentsMargins(8, 4, 8, 8)
        self._content_layout.setSpacing(6)
        layout.addWidget(self._content)

        self._apply_theme()

    def _apply_theme(self) -> None:
        self._header.setStyleSheet(f"""
            QPushButton {{
                text-align: left; padding: 10px 14px;
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-left: 3px solid {theme_color('accent')};
                border-radius: 10px; color: {theme_color('fg')};
                font-size: 13px;
            }}
            QPushButton:hover {{
                background: {theme_color('accent_light')};
            }}
        """)
        self._content.setStyleSheet(f"background: {theme_color('input_bg')};")

    def content_layout(self) -> QVBoxLayout:
        return self._content_layout

    def _on_header_click(self) -> None:
        self._expanded = not self._expanded
        self._header.setIcon(get_icon(
            "chevron-down" if self._expanded else "chevron-right",
            theme_color('hint'), 18))
        self._header.setIconSize(QSize(18, 18))
        self._content.setVisible(self._expanded)
        self.toggled.emit(self._key, self._expanded)
        self.clicked.emit(self._key)

    def set_expanded(self, expanded: bool) -> None:
        if self._expanded != expanded:
            self._expanded = expanded
            self._header.setIcon(get_icon(
                "chevron-down" if expanded else "chevron-right",
                theme_color('hint'), 18))
            self._header.setIconSize(QSize(18, 18))
            self._content.setVisible(expanded)

    def set_progress(self, pct: int) -> None:
        """v5.0 优化3: 设置章节完成度进度（0-100）

        颜色按完成度自动变化：
        - 0-49%: 红色 (#e57373)
        - 50-79%: 黄色 (#fff176)
        - 80-100%: 绿色 (#81c784)
        """
        pct = max(0, min(100, int(pct)))
        self._progress_bar.setValue(pct)
        if pct >= 80:
            color = "#81c784"
        elif pct >= 50:
            color = "#fff176"
        else:
            color = "#e57373"
        self._progress_bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: none;
                border-radius: 3px;
            }}
            QProgressBar::chunk {{
                background: {color};
                border-radius: 3px;
            }}
        """)
        self._progress_bar.setToolTip(f"章节完成度: {pct}%（点击校验按钮查看详情）")


class ChapterEditPanel(QScrollArea):
    """左侧九章折叠编辑面板"""

    chapter_changed = pyqtSignal(str)  # 当前编辑章节 key
    data_changed = pyqtSignal(str, object)  # chapter_key, data
    ref_clicked = pyqtSignal(str)  # @data[path] clicked
    # F1: AI 字段填充请求 (chapter_key, field_path) — 由 CeshuEditorView 异步调用 AI 并回填
    ai_fill_requested = pyqtSignal(str, str)

    _FORM_CLASSES = {
        # 基础 9 章
        "meta":      ChapterMetaForm,
        "vision":    ChapterVisionForm,
        "worldview": ChapterWorldviewForm,
        "gameplay":  ChapterGameplayForm,
        "numeric":   ChapterNumericForm,
        "art":       ChapterArtForm,
        "tech":      ChapterTechForm,
        "resources": ChapterResourcesForm,
        # v5.0 工业级补充 9 章
        "market_analysis":  ChapterMarketAnalysisForm,
        "characters":       ChapterCharactersForm,
        "combat":           ChapterCombatForm,
        "economy":          ChapterEconomyForm,
        "monetization":     ChapterMonetizationForm,
        "mvp":              ChapterMvpForm,
        "risk_handling":    ChapterRiskHandlingForm,
        "audio":            ChapterAudioForm,
        "accessibility":    ChapterAccessibilityForm,
    }

    def __init__(self, parent=None):
        super().__init__(parent)
        self._model = None
        self._sections: dict[str, _CollapsibleSection] = {}
        self._forms: dict[str, QWidget] = {}
        self._systems_editor: SystemsEditor | None = None
        self._competitive_chart: CompetitiveChart | None = None
        self._current_chapter = "meta"
        self.setWidgetResizable(True)
        self.setMinimumWidth(320)

    def render_chapters(self, model) -> None:
        """根据 CeshuModel 渲染章节（按档位：lite 只渲染基础 9 章）"""
        self._model = model

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        visible_keys = model.visible_chapter_keys() if model else list(CHAPTER_KEYS)
        for key in visible_keys:
            title = CHAPTER_LABELS.get(key, key)
            section = _CollapsibleSection(key, title)
            section.clicked.connect(lambda k=key: self._on_section_clicked(k))

            if key == "systems":
                # 第五章：游戏系统编辑器
                self._systems_editor = SystemsEditor(model.systems if model else {})
                self._systems_editor.systems_changed.connect(
                    lambda d: self.data_changed.emit("systems", d))
                section.content_layout().addWidget(self._systems_editor)
            elif key == "vision":
                # 第二章：含竞品象限图
                # 各章节表单宽度不限，统一以 QWidget 静态类型存放
                form: QWidget = ChapterVisionForm(model.vision if model else {})
                form_data_changed = getattr(form, 'data_changed', None)
                if form_data_changed is not None:
                    form_data_changed.connect(lambda k, d: self.data_changed.emit(k, d))
                section.content_layout().addWidget(form)
                self._competitive_chart = CompetitiveChart(
                    model.vision.get("competitive_analysis", []) if model else [])
                section.content_layout().addWidget(self._competitive_chart)
                self._forms[key] = form
            else:
                form_cls = self._FORM_CLASSES.get(key)
                if form_cls:
                    chapter_data = model.get_chapter(key) if model else {}
                    form = form_cls(chapter_data)
                    form_data_changed = getattr(form, 'data_changed', None)
                if form_data_changed is not None:
                    form_data_changed.connect(lambda k, d: self.data_changed.emit(k, d))
                    # F1: 连接表单的 ai_fill_requested 信号，附上章节键转发到顶层
                    if hasattr(form, 'ai_fill_requested'):
                        form.ai_fill_requested.connect(
                            lambda fp, ck=key: self.ai_fill_requested.emit(ck, fp))
                    section.content_layout().addWidget(form)
                    self._forms[key] = form

            layout.addWidget(section)
            self._sections[key] = section

        layout.addStretch()
        self.setWidget(container)

        # 初始化游戏系统数据
        if self._systems_editor and model:
            self._systems_editor.set_data(model.systems)

        # 连接所有 RefTextEdit 的 ref_clicked 信号
        for form in self._forms.values():
            self._connect_ref_widgets(form)

        # v5.0 优化3: 初始化章节完成度进度条
        self.refresh_progress()

    def _connect_ref_widgets(self, widget):
        """递归查找 RefTextEdit 并连接 ref_clicked 信号"""
        from .chapter_forms import RefTextEdit
        if isinstance(widget, RefTextEdit):
            widget.ref_clicked.connect(self.ref_clicked.emit)
            return
        for child in widget.findChildren(RefTextEdit):
            child.ref_clicked.connect(self.ref_clicked.emit)

    def _on_section_clicked(self, key: str) -> None:
        """点击章节标题"""
        self._current_chapter = key
        self.chapter_changed.emit(key)

    def get_current_chapter(self) -> str:
        return self._current_chapter

    def update_chapter_data(self, key: str, data: dict) -> None:
        """更新指定章节的表单数据"""
        if key == "systems" and self._systems_editor:
            self._systems_editor.set_data(data)
        elif key == "vision" and self._competitive_chart:
            self._competitive_chart.set_data(data.get("competitive_analysis", []))
        elif key in self._forms:
            form = self._forms[key]
            if hasattr(form, 'set_data'):
                form.set_data(data)

    def set_data_manager(self, data_manager) -> None:
        """P6: 注入 DataManager 给 SystemsEditor，启用进度回填"""
        if self._systems_editor:
            self._systems_editor.set_data_manager(data_manager)

    def refresh_progress(self) -> None:
        """v5.0 优化3: 刷新所有章节的完成度进度条

        从 CeshuModel.chapter_progress() 获取数据，更新每个章节标题栏的微型进度条。
        应在数据变化时调用（如 data_changed 信号触发后）。
        """
        if not self._model or not hasattr(self._model, 'chapter_progress'):
            return
        try:
            progress = self._model.chapter_progress()
        except Exception:
            return
        for key, section in self._sections.items():
            pct = int((progress.get(key, 0) or 0) * 100)
            section.set_progress(pct)

    def apply_ai_content(self, chapter_key: str, field_path: str, content: str) -> bool:
        """F1: 把 AI 生成的内容回填到指定章节表单的字段

        Args:
            chapter_key: 章节键名（如 "meta"）
            field_path: 字段路径（如 "meta.game_name"）
            content: AI 生成的内容

        Returns:
            True 如果成功回填
        """
        form = self._forms.get(chapter_key)
        if form is None:
            return False
        from .chapter_forms import apply_ai_content_to_form
        ok = apply_ai_content_to_form(form, field_path, content)
        # 回填成功后表单会自动 emit data_changed，model 会同步更新
        return ok

    def apply_template(self, chapter_key: str, merged_data: dict) -> bool:
        """N5: 应用模板合并后的数据到指定章节

        把模板库合并后的数据回填到对应章节表单，并触发 data_changed 信号
        让 model 同步更新。

        Args:
            chapter_key: 章节键名
            merged_data: 合并后的章节字段字典

        Returns:
            True 如果成功应用
        """
        if not chapter_key or not isinstance(merged_data, dict):
            return False
        # 特殊章节 systems 由 SystemsEditor 管理，不走表单路径
        if chapter_key == "systems":
            # systems 模板应用：直接更新 model + 刷新 SystemsEditor
            if self._model is not None:
                try:
                    self._model.set_chapter(chapter_key, merged_data)
                except Exception:
                    pass
            if self._systems_editor is not None and hasattr(self._systems_editor, 'set_data'):
                try:
                    self._systems_editor.set_data(merged_data)
                except Exception:
                    pass
            self.data_changed.emit(chapter_key, merged_data)
            return True
        form = self._forms.get(chapter_key)
        if form is None:
            return False
        if not hasattr(form, 'set_data'):
            return False
        try:
            form.set_data(merged_data)
        except Exception:
            return False
        # 触发 data_changed 让 model 同步
        self.data_changed.emit(chapter_key, merged_data)
        # 刷新章节完成度进度条
        self.refresh_progress()
        return True
