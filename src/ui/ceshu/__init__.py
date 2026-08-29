"""策划书 UI 模块 — 首页 + 一体化编辑视图 + 预览 + AI 面板 + 8主题支持"""
from .ai_field_button import AIFieldButton
from .ai_panel import AIChatPanel

# N6/N7/N8: 新增对话框
from .ai_review_dialog import AIReviewDialog
from .ceshu_theme import apply_ceshu_theme
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
from .chapter_notes import ChapterNotesDialog, ChapterNotesManager
from .chapter_panel import ChapterEditPanel
from .competitive_chart import CompetitiveChart
from .editor_view import CeshuEditorView
from .home_card import CeshuCard
from .home_view import CeshuHomeView
from .preset_market_dialog import PresetMarketDialog
from .preview_panel import EditorPreviewPanel
from .score_report_dialog import ScoreReportDialog
from .system_confirm_dialog import SystemConfirmDialog
from .system_dependency_graph import SystemDependencyGraphDialog
from .systems_editor import SystemsEditor
from .template_picker_dialog import TemplatePickerDialog
from .validation_dialog import ValidationReportDialog
from .version_diff_dialog import VersionDiffDialog
from .version_timeline_dialog import VersionTimelineDialog
from .word_stats_dialog import WordStatsDialog

__all__ = [
    "CeshuHomeView", "CeshuCard", "CeshuEditorView",
    "ChapterEditPanel", "SystemsEditor", "SystemConfirmDialog",
    "CompetitiveChart",
    "EditorPreviewPanel", "AIChatPanel", "AIFieldButton",
    "ValidationReportDialog", "PresetMarketDialog",
    "SystemDependencyGraphDialog", "WordStatsDialog",
    "TemplatePickerDialog", "ScoreReportDialog", "VersionDiffDialog",
    # 基础 9 章表单
    "ChapterMetaForm", "ChapterVisionForm", "ChapterWorldviewForm",
    "ChapterGameplayForm", "ChapterNumericForm", "ChapterArtForm",
    "ChapterTechForm", "ChapterResourcesForm",
    # v5.0 工业级补充 9 章表单
    "ChapterMarketAnalysisForm", "ChapterCharactersForm", "ChapterCombatForm",
    "ChapterEconomyForm", "ChapterMonetizationForm", "ChapterMvpForm",
    "ChapterRiskHandlingForm", "ChapterAudioForm", "ChapterAccessibilityForm",
    "apply_ceshu_theme",
    # N6/N7/N8: 新增对话框
    "AIReviewDialog", "VersionTimelineDialog",
    "ChapterNotesManager", "ChapterNotesDialog",
]
