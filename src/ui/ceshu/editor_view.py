"""一体化编辑视图 — 水平分栏：左侧章节表单 | 右侧游戏系统预览

AI 面板已移至顶层右栏，不再内嵌。
"""
from __future__ import annotations

from PyQt6.QtCore import QSize, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont, QKeySequence, QShortcut
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.lucide_icon import get_icon
from ui.themes import theme_color

from .ceshu_theme import (
    ceshu_editor_btn_back_qss,
    ceshu_editor_btn_export_qss,
    ceshu_editor_btn_save_qss,
    ceshu_editor_title_qss,
)
from .chapter_panel import ChapterEditPanel
from .editor_view_mixins import (
    AIMixin,
    ExportMixin,
    ReviewMixin,
    SystemMixin,
    TemplateMixin,
    VersionMixin,
)
from .editor_view_workers import _AIFillChapterWorker, _AIFillFieldWorker
from .preview_panel import EditorPreviewPanel

# ── F1/F7: AI 调用 Worker（后台线程，避免阻塞 UI） ──



class CeshuEditorView(QWidget, AIMixin, ExportMixin, ReviewMixin, SystemMixin, TemplateMixin, VersionMixin):
    """策划书编辑器 — 章节表单 + 预览"""

    back_requested = pyqtSignal()           # 返回首页
    chapter_changed = pyqtSignal(str)       # 当前编辑章节 (通知顶层 AI 面板)
    ref_clicked = pyqtSignal(str)           # @data[path] 点击
    type_editor_requested = pyqtSignal()    # 打开类型编辑器
    systems_changed = pyqtSignal()          # P3: 游戏系统列表变更（确认弹窗后）

    def __init__(self, library_root: str = "", parent=None):
        super().__init__(parent)
        self._library_root = library_root
        self._model = None
        self._manager = None
        self._ceshu_id = ""
        self._library = "默认库"
        self._dirty = False
        # F1/F7: AI worker 引用（防止 GC 回收）
        self._ai_field_worker: _AIFillFieldWorker | None = None
        self._ai_chapter_worker: _AIFillChapterWorker | None = None
        # F1: 当前等待 AI 回填的按钮（用于回填后恢复 busy 状态）
        self._pending_ai_buttons: dict[str, object] = {}
        self._setup_ui()
        self._start_autosave()
        EventBus().on("theme_changed", self._on_theme_changed)

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── 顶部工具栏 ──
        toolbar = QHBoxLayout()
        toolbar.setContentsMargins(12, 8, 12, 8)

        self._btn_back = QPushButton("  返回")
        self._btn_back.setIcon(get_icon("chevron-left", theme_color('fg'), 18))
        self._btn_back.setIconSize(QSize(18, 18))
        self._btn_back.clicked.connect(lambda: self.back_requested.emit())
        toolbar.addWidget(self._btn_back)

        self._title_label = QLabel("策划书")
        self._title_label.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        toolbar.addWidget(self._title_label)

        # P8: 版本信息标签
        self._version_label = QLabel("")
        self._version_label.setStyleSheet(
            "background: rgba(79, 140, 247, 0.15); color: #4f8cf7; "
            "padding: 2px 10px; border-radius: 10px; font-size: 12px; border: none;"
        )
        toolbar.addWidget(self._version_label)

        # P8: 设为激活按钮（非激活版本可见）
        self._btn_activate = QPushButton("设为激活")
        self._btn_activate.clicked.connect(self._on_activate_clicked)
        self._btn_activate.setStyleSheet(
            "QPushButton { background: #22C55E; color: white; padding: 4px 12px; "
            "border: none; border-radius: 4px; font-size: 12px; }"
            "QPushButton:hover { background: #16A34A; }"
        )
        self._btn_activate.setVisible(False)
        toolbar.addWidget(self._btn_activate)

        # P8: 派生新版本按钮
        self._btn_derive = QPushButton("派生新版本")
        self._btn_derive.clicked.connect(self._on_derive_clicked)
        self._btn_derive.setStyleSheet(
            "QPushButton { background: transparent; color: #4f8cf7; padding: 4px 12px; "
            "border: 1px solid #4f8cf7; border-radius: 4px; font-size: 12px; }"
            "QPushButton:hover { background: rgba(79, 140, 247, 0.1); }"
        )
        toolbar.addWidget(self._btn_derive)

        toolbar.addStretch()

        # === UX: 按功能分组 + 分隔符 + 工具提示 ===
        # 文件组：保存
        self._btn_save = QPushButton("保存")
        self._btn_save.clicked.connect(self.save_ceshu)
        self._btn_save.setToolTip("保存当前策划书 (Ctrl+S)")
        toolbar.addWidget(self._btn_save)

        toolbar.addWidget(self._make_separator())

        # 编辑组：校验 | 模板 | 预设
        self._btn_validate = QPushButton("校验")
        self._btn_validate.clicked.connect(self._on_validate)
        self._btn_validate.setToolTip("校验策划书完整性与一致性 (Ctrl+Shift+V)")
        toolbar.addWidget(self._btn_validate)

        self._btn_template = QPushButton("模板")
        self._btn_template.clicked.connect(self._on_template_picker)
        self._btn_template.setToolTip("打开章节模板库，一键应用预置模板 (Ctrl+Shift+T)")
        toolbar.addWidget(self._btn_template)

        self._btn_preset = QPushButton("预设")
        self._btn_preset.clicked.connect(self._on_preset_market)
        self._btn_preset.setToolTip("打开混合玩法预设市场")
        toolbar.addWidget(self._btn_preset)

        # N13: GDD 模板编辑器按钮
        self._btn_template_edit = QPushButton("模板编辑")
        self._btn_template_edit.clicked.connect(self._on_template_editor)
        self._btn_template_edit.setToolTip("打开 GDD 模板编辑器，管理自定义可复用模板 (Ctrl+Shift+E)")
        toolbar.addWidget(self._btn_template_edit)

        toolbar.addWidget(self._make_separator())

        # AI 组：AI 生成 | AI 整章 | AI 审阅
        self._btn_ai_full = QPushButton("AI 生成")
        self._btn_ai_full.clicked.connect(self._on_ai_full_generate)
        self._btn_ai_full.setToolTip("从简要描述一键生成完整 18 章 GDD (Ctrl+Shift+G)")
        toolbar.addWidget(self._btn_ai_full)

        self._btn_ai_chapter = QPushButton("AI 整章")
        self._btn_ai_chapter.clicked.connect(self._on_ai_fill_chapter)
        self._btn_ai_chapter.setToolTip("使用 AI 一键生成整章内容")
        toolbar.addWidget(self._btn_ai_chapter)

        # N6: AI 智能审阅按钮
        self._btn_ai_review = QPushButton("AI 审阅")
        self._btn_ai_review.clicked.connect(self._on_ai_review)
        self._btn_ai_review.setToolTip("AI 5 维度结构化审阅 + Top 3 改进建议 (Ctrl+Shift+R)")
        toolbar.addWidget(self._btn_ai_review)

        toolbar.addWidget(self._make_separator())

        # 分析组：评分 | 字数 | 对比 | 时间线
        self._btn_score = QPushButton("评分")
        self._btn_score.clicked.connect(self._on_score_report)
        self._btn_score.setToolTip("工业级 GDD 评分报告（结构/质量/市场） (Ctrl+Shift+S)")
        toolbar.addWidget(self._btn_score)

        self._btn_wordstat = QPushButton("字数")
        self._btn_wordstat.clicked.connect(self._on_word_stats)
        self._btn_wordstat.setToolTip("字数统计 + 写作建议")
        toolbar.addWidget(self._btn_wordstat)

        self._btn_diff = QPushButton("对比")
        self._btn_diff.clicked.connect(self._on_version_diff)
        self._btn_diff.setToolTip("对比同版本链下两个版本的差异 (Ctrl+Shift+D)")
        toolbar.addWidget(self._btn_diff)

        # N7: 版本时间线按钮
        self._btn_timeline = QPushButton("时间线")
        self._btn_timeline.clicked.connect(self._on_version_timeline)
        self._btn_timeline.setToolTip("可视化版本时间线，支持切换版本")
        toolbar.addWidget(self._btn_timeline)

        # N11: GDD 完备性检查清单按钮
        self._btn_checklist = QPushButton("清单")
        self._btn_checklist.clicked.connect(self._on_checklist)
        self._btn_checklist.setToolTip("GDD 完备性检查清单，预制作就绪检查 (Ctrl+Shift+L)")
        toolbar.addWidget(self._btn_checklist)

        # N15: 变更日志按钮
        self._btn_changelog = QPushButton("日志")
        self._btn_changelog.clicked.connect(self._on_changelog)
        self._btn_changelog.setToolTip("从版本对比生成变更日志 (Ctrl+Shift+H)")
        toolbar.addWidget(self._btn_changelog)

        # N14: 字段依赖关系图按钮
        self._btn_field_graph = QPushButton("字段图")
        self._btn_field_graph.clicked.connect(self._on_field_dependency_graph)
        self._btn_field_graph.setToolTip("查看跨章节字段依赖关系图 (Ctrl+Shift+F)")
        toolbar.addWidget(self._btn_field_graph)

        toolbar.addWidget(self._make_separator())

        # 导出组：导出
        self._btn_export = QPushButton("导出")
        self._btn_export.clicked.connect(self._on_export)
        self._btn_export.setToolTip("导出策划书为 .ceshu/.md/.html/.docx/.pdf/.pptx")
        toolbar.addWidget(self._btn_export)

        toolbar.addWidget(self._make_separator())

        # 笔记组：笔记
        # N8: 章节笔记按钮
        self._btn_notes = QPushButton("笔记")
        self._btn_notes.clicked.connect(self._on_chapter_notes)
        self._btn_notes.setToolTip("打开章节笔记管理器，记录设计要点 (Ctrl+Shift+N)")
        toolbar.addWidget(self._btn_notes)

        layout.addLayout(toolbar)

        # === UX: 快捷键 ===
        self._setup_shortcuts()

        # ── 主内容区：水平分栏 ──
        self._splitter = QSplitter(Qt.Orientation.Horizontal)

        self._chapter_panel = ChapterEditPanel(parent=self)
        self._chapter_panel.chapter_changed.connect(self._on_chapter_changed)
        self._chapter_panel.data_changed.connect(self._on_data_changed)
        self._chapter_panel.ref_clicked.connect(self.ref_clicked.emit)
        # F1: 接收 AI 字段填充请求
        self._chapter_panel.ai_fill_requested.connect(self._on_ai_fill_field)
        self._splitter.addWidget(self._chapter_panel)

        self._preview_panel = EditorPreviewPanel(parent=self)
        self._splitter.addWidget(self._preview_panel)

        self._splitter.setSizes([500, 400])
        layout.addWidget(self._splitter)

        self._apply_theme()

    def _apply_theme(self) -> None:
        self._btn_back.setStyleSheet(ceshu_editor_btn_back_qss())
        self._title_label.setStyleSheet(ceshu_editor_title_qss())
        self._btn_save.setStyleSheet(ceshu_editor_btn_save_qss())
        self._btn_export.setStyleSheet(ceshu_editor_btn_export_qss())
        # v5.0: 校验按钮采用与导出一致的描边风格（强调辅助操作）
        self._btn_validate.setStyleSheet(ceshu_editor_btn_export_qss())
        # v5.0 优化D: 预设按钮同描边风格
        self._btn_preset.setStyleSheet(ceshu_editor_btn_export_qss())
        # F6/F7: 新按钮同描边风格
        self._btn_wordstat.setStyleSheet(ceshu_editor_btn_export_qss())
        self._btn_ai_chapter.setStyleSheet(ceshu_editor_btn_export_qss())
        # N10: AI 一键生成按钮同描边风格
        self._btn_ai_full.setStyleSheet(ceshu_editor_btn_export_qss())
        # N5: 模板按钮同描边风格
        self._btn_template.setStyleSheet(ceshu_editor_btn_export_qss())
        # N4: 评分按钮同描边风格
        self._btn_score.setStyleSheet(ceshu_editor_btn_export_qss())
        # N1: 对比按钮同描边风格
        self._btn_diff.setStyleSheet(ceshu_editor_btn_export_qss())
        # N6/N7/N8: 新按钮同描边风格
        self._btn_ai_review.setStyleSheet(ceshu_editor_btn_export_qss())
        self._btn_timeline.setStyleSheet(ceshu_editor_btn_export_qss())
        self._btn_notes.setStyleSheet(ceshu_editor_btn_export_qss())
        # N11: 清单按钮同描边风格
        self._btn_checklist.setStyleSheet(ceshu_editor_btn_export_qss())
        # N13/N15: 新按钮同描边风格
        self._btn_template_edit.setStyleSheet(ceshu_editor_btn_export_qss())
        self._btn_changelog.setStyleSheet(ceshu_editor_btn_export_qss())
        # N14: 字段图按钮同描边风格
        self._btn_field_graph.setStyleSheet(ceshu_editor_btn_export_qss())

    def _make_separator(self) -> QFrame:
        """UX: 创建工具栏竖直分隔符。"""
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.VLine)
        sep.setFrameShadow(QFrame.Shadow.Sunken)
        sep.setFixedWidth(2)
        return sep

    def _setup_shortcuts(self) -> None:
        """UX: 注册工具栏快捷键。"""
        self._shortcut_save = QShortcut(QKeySequence("Ctrl+S"), self)
        self._shortcut_save.activated.connect(self.save_ceshu)

        self._shortcut_validate = QShortcut(QKeySequence("Ctrl+Shift+V"), self)
        self._shortcut_validate.activated.connect(self._on_validate)

        self._shortcut_template = QShortcut(QKeySequence("Ctrl+Shift+T"), self)
        self._shortcut_template.activated.connect(self._on_template_picker)

        self._shortcut_score = QShortcut(QKeySequence("Ctrl+Shift+S"), self)
        self._shortcut_score.activated.connect(self._on_score_report)

        self._shortcut_diff = QShortcut(QKeySequence("Ctrl+Shift+D"), self)
        self._shortcut_diff.activated.connect(self._on_version_diff)

        self._shortcut_ai_review = QShortcut(QKeySequence("Ctrl+Shift+R"), self)
        self._shortcut_ai_review.activated.connect(self._on_ai_review)

        self._shortcut_notes = QShortcut(QKeySequence("Ctrl+Shift+N"), self)
        self._shortcut_notes.activated.connect(self._on_chapter_notes)

        self._shortcut_checklist = QShortcut(QKeySequence("Ctrl+Shift+L"), self)
        self._shortcut_checklist.activated.connect(self._on_checklist)

        self._shortcut_ai_full = QShortcut(QKeySequence("Ctrl+Shift+G"), self)
        self._shortcut_ai_full.activated.connect(self._on_ai_full_generate)

        # N13: GDD 模板编辑器快捷键
        self._shortcut_template_edit = QShortcut(QKeySequence("Ctrl+Shift+E"), self)
        self._shortcut_template_edit.activated.connect(self._on_template_editor)

        # N15: 变更日志快捷键
        self._shortcut_changelog = QShortcut(QKeySequence("Ctrl+Shift+H"), self)
        self._shortcut_changelog.activated.connect(self._on_changelog)

        # N14: 字段依赖关系图快捷键
        self._shortcut_field_graph = QShortcut(QKeySequence("Ctrl+Shift+F"), self)
        self._shortcut_field_graph.activated.connect(self._on_field_dependency_graph)

    def _on_theme_changed(self, **_) -> None:
        self._apply_theme()

    # ── 公共接口 ──

    def load_ceshu(self, ceshu_id: str, library: str, schema=None) -> None:
        """加载策划书

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            schema: 可选，TypeSchema 对象（用于游戏系统编辑器动态加载类型）
        """
        import os

        from core.ceshu import CeshuManager
        root = self._library_root or os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "data", "libraries")
        self._manager = CeshuManager(root)
        self._ceshu_id = ceshu_id
        self._library = library

        model = self._manager.get_ceshu(ceshu_id, library)
        self._model = model
        self._title_label.setText(model.meta.get("game_name", "未命名策划书"))
        self._chapter_panel.render_chapters(model)
        self._preview_panel.set_ceshu_model(model)

        # 注入类型模式到游戏系统编辑器（动态读取全部数据类型）
        if schema and hasattr(self._chapter_panel, '_systems_editor'):
            self._chapter_panel._systems_editor.set_schema(schema)

        enabled = model.compute_enabled_editors()
        self._preview_panel.refresh(self._build_enabled_editors(enabled))

        # P8: 刷新版本信息显示
        self._refresh_version_display()

        # 通知顶层当前章节（供 AI 面板感知）
        self.chapter_changed.emit("meta")

    @property
    def model(self):
        return self._model

    @property
    def preview_panel(self):
        return self._preview_panel

    @property
    def chapter_panel(self):
        return self._chapter_panel

    def set_chapter(self, chapter_key: str) -> None:
        """外部导航跳转到指定章节（由顶层左栏调用）"""
        self._chapter_panel._on_section_clicked(chapter_key)

    def set_data_manager(self, data_manager) -> None:
        """P6: 注入 DataManager，供 ChapterPanel/SystemsEditor 显示进度"""
        self._chapter_panel.set_data_manager(data_manager)

    # ── 内部回调 ──

    def _on_chapter_changed(self, chapter: str) -> None:
        self.chapter_changed.emit(chapter)

    def _on_data_changed(self, chapter_key: str, data: dict) -> None:
        if self._model:
            self._model.set_chapter(chapter_key, data)
            self._dirty = True
            if chapter_key == "systems":
                enabled = self._model.compute_enabled_editors()
                self._preview_panel.refresh(self._build_enabled_editors(enabled))
            # v5.0 优化3: 数据变化时刷新章节完成度进度条
            self._chapter_panel.refresh_progress()

    def _build_enabled_editors(self, enabled_keys: list) -> list[dict]:
        """将启用游戏系统键列表转换为含 key/name/data_type 的字典列表"""
        # compute_enabled_editors 已返回完整 dict，直接复用
        # 如果传入的是纯字符串列表则兜底
        result = []
        for k in enabled_keys:
            if isinstance(k, dict):
                result.append(k)
            else:
                from core.ceshu.ceshu_model import SYSTEM_LABELS
                entry = {"key": k, "name": SYSTEM_LABELS.get(k, k), "data_type": k}
                if self._model and hasattr(self._model, 'systems'):
                    sys_cfg = self._model.systems.get(k, {})
                    if isinstance(sys_cfg, dict):
                        entry["name"] = sys_cfg.get("name", SYSTEM_LABELS.get(k, k))
                        entry["data_type"] = sys_cfg.get("data_type", k) or k
                result.append(entry)
        return result

    def save_ceshu(self) -> None:
        if self._manager and self._model:
            self._manager.save_ceshu(self._model, self._library)
            self._dirty = False


    # ── F1: AI 字段填充闭环 ──





    # ── F6: 字数统计 + 写作建议 ──


    # ── F7: AI 整章生成 ──




    # ── N10: AI 一键生成完整策划书 ──





    def _refresh_chapter_forms(self) -> None:
        """v5.0 优化C: 刷新所有章节表单（从 model 重新加载数据到 UI）"""
        if not self._model or not self._chapter_panel:
            return
        forms = getattr(self._chapter_panel, '_forms', {})
        for key, form in forms.items():
            if not hasattr(form, 'set_data'):
                continue
            try:
                chapter_data = self._model.get_chapter(key)
                form.set_data(chapter_data)
            except Exception:
                pass


    def _start_autosave(self) -> None:
        from config.constants import CESHU_AUTOSAVE_INTERVAL_MS
        self._autosave_timer = QTimer(self)
        self._autosave_timer.timeout.connect(self._auto_save)
        self._autosave_timer.start(CESHU_AUTOSAVE_INTERVAL_MS)

    def _auto_save(self) -> None:
        if self._dirty:
            self.save_ceshu()

    def closeEvent(self, event):
        if self._dirty:
            self.save_ceshu()
        super().closeEvent(event)

    def _open_type_editor(self) -> None:
        """被 SystemsEditor 通过父级链调用的类型编辑器入口"""
        self.type_editor_requested.emit()

    # ── N5: 章节模板库 ──



    # ── N4: 评分系统 ──


    # ── N1: 版本对比工具 ──




    # ── P8: 版本管理 ──




    # ── N6: AI 智能审阅 ──


    # ── N7: 版本时间线 ──



    # ── N8: 章节笔记 ──

    def _on_chapter_notes(self) -> None:
        """N8: 弹出章节笔记对话框。"""
        if not self._ceshu_id:
            QMessageBox.information(self, "章节笔记", "请先加载策划书")
            return
        import os

        from .chapter_notes import ChapterNotesDialog, ChapterNotesManager
        root = self._library_root or os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "data", "libraries")
        manager = ChapterNotesManager(root, self._library, self._ceshu_id)
        dlg = ChapterNotesDialog(manager, parent=self)
        dlg.exec()

    # ── N11: GDD 完备性检查清单 ──


    # ── N13: GDD 模板编辑器 ──



    # ── N15: 变更日志 ──


    # ── N14: 字段依赖关系图 ──

