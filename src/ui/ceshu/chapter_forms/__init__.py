"""策划书各章表单组件 — 包拆分。兼容旧版 from chapter_forms import XXX。"""
from __future__ import annotations

from ._base import (
    ChapterArtForm,
    ChapterGameplayForm,
    ChapterMetaForm,
    ChapterNumericForm,
    ChapterResourcesForm,
    ChapterTechForm,
    ChapterVisionForm,
    ChapterWorldviewForm,
)
from ._common import (
    RefTextEdit,
    _add_row,
    _combo,
    _line_field,
    _on_ai_fill,
    _text_field,
    apply_ai_content_to_form,
)
from ._industrial import (
    ChapterAccessibilityForm,
    ChapterAudioForm,
    ChapterCharactersForm,
    ChapterCombatForm,
    ChapterEconomyForm,
    ChapterMarketAnalysisForm,
    ChapterMonetizationForm,
    ChapterMvpForm,
    ChapterRiskHandlingForm,
)

__all__ = [
    "RefTextEdit",
    "apply_ai_content_to_form",
    "_add_row",
    "_on_ai_fill",
    "_text_field",
    "_line_field",
    "_combo",
    "ChapterMetaForm",
    "ChapterVisionForm",
    "ChapterWorldviewForm",
    "ChapterGameplayForm",
    "ChapterNumericForm",
    "ChapterArtForm",
    "ChapterTechForm",
    "ChapterResourcesForm",
    "ChapterMarketAnalysisForm",
    "ChapterCharactersForm",
    "ChapterCombatForm",
    "ChapterEconomyForm",
    "ChapterMonetizationForm",
    "ChapterMvpForm",
    "ChapterRiskHandlingForm",
    "ChapterAudioForm",
    "ChapterAccessibilityForm",
]
