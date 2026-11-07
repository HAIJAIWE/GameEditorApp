/**
 * shared/ceshu/reference —— 策划书静态参考数据：章节键/标签/必填、下拉选项标签、混合玩法预设、术语冲突检测、参考 GDD 对比、章节模板（内置+自定义）与默认章节。
 *
 * 外部一律从这里 import（`.../reference`），不要再深插目录内文件。
 *
 * ⚠️ 顺序有意义（本目录在 `ceshu` / `ceshuSchema` 的同一个强连通分量里）：
 * - `./ceshuOptionLabels` 必须排在 `./ceshuCustomTemplates`、`./ceshuTemplates`、`./ceshuDefaults` 之前。
 *   后三者经 `model → data → ceshuSchema` 绕回来，而 `ceshuSchema/production/meta.ts` 在**模块顶层**
 *   读 `GDD_SCOPE_LABELS`（就定义在 optionLabels 里）。排反了，meta.ts 顶层会读到 undefined 直接崩。
 * - `./ceshuDefaults` 放最后：它是本目录唯一反向依赖 `shared/ceshuSchema` 的模块（取 CHAPTER_SCHEMAS 默认值），
 *   排在最后 = 其余模块全部求值完毕后才触发回边。
 * 入口之所以用显式命名导出（而不是 `export *`）也是同一原因：vite-node 把 `export *`
 * 编译成**求值期快照拷贝**，环上的绑定会永久丢失；显式命名导出编成 getter，是活绑定。
 */

export { GAME_TERMS } from './glossaryTerms'
export { BASE_CHAPTER_KEYS, CESHU_EXPORT_FORMATS, CESHU_FORMAT_EXTENSIONS, CESHU_FORMAT_LABELS, CHAPTER_KEYS, DEFAULT_DISABLED_MODULE_CHAPTERS, CHAPTER_LABELS, CHAPTER_NAMES, CHAPTER_PARTS, CHAPTER_REQUIRED_FIELDS, GDD_SCOPE_FULL, GDD_SCOPE_LITE, LITE_CHAPTER_KEYS, META_CHAPTER_KEY, MODULE_CHAPTERS, NON_COMBAT_GAME_TYPES, NUMBERED_CHAPTER_KEYS, STATUS_WARNING, SYSTEM_DEPENDENCIES, SYSTEM_LABELS, TEMPLATE_VERSION, UNIVERSAL_CORE_CHAPTERS, WARNING_STATUS_META, chapterAnchorOf, chapterApplicableToGenre, chapterNumber, chapterOrdinalCn, chapterPartOf, checkSystemDependencies, contentChapterCount, defaultEnabledModuleChapters, enabledModuleChapters, gameTypeHasCombat, isChapterEnabled, isChapterKey, isCoreChapter, isGddScope, partDisplayName, visibleChapterKeys } from './ceshuConstants'
export type { CeshuChapters, CeshuColumnDef, CeshuDocument, CeshuDocumentBase, CeshuExportFormat, CeshuExportResult, CeshuFieldDef, CeshuFieldKind, CeshuSummary, ChapterData, ChapterKey, ChapterPart, EnabledEditor, GddScope, NumberedChapterKey, SystemConfigFieldDef, SystemEntry } from './ceshuConstants'
export { AI_BEHAVIOR_LABELS, AOE_RULE_LABELS, ATTRIBUTE_POINT_LABELS, AUDIO_ENGINE_LABELS, BATTLE_TRIGGER_LABELS, BATTLE_VIEW_LABELS, BRANCH_QUEST_LABELS, CLASS_CHANGE_LABELS, COMBAT_MODE_LABELS, COMBAT_PACE_LABELS, COMBO_SYSTEM_LABELS, CONFIDENTIALITY_LABELS, COOLDOWN_MODE_LABELS, DOC_STATUS_LABELS, DROP_BIND_RULE_LABELS, DROP_SYSTEM_LABELS, ELEMENT_SYSTEM_LABELS, ELEMENT_TYPE_LABELS, ENERGY_SYSTEM_LABELS, ENGINE_LABELS, ESCAPE_RULE_LABELS, FACTION_SYSTEM_LABELS, FREE_DRAW_LABELS, GDD_SCOPE_LABELS, GENDER_OPTIONS_LABELS, GUILD_WAR_LABELS, LEADERBOARD_LABELS, LEARN_METHOD_LABELS, MARKET_TYPE_LABELS, MMR_SYSTEM_LABELS, PAYMENT_MODEL_LABELS, PAYMENT_SYSTEM_LABELS, PITY_MECHANISM_LABELS, PROGRESSION_TRACK_LABELS, PVP_TYPE_LABELS, RANDOM_QUEST_LABELS, RANK_SYSTEM_LABELS, REPEATABLE_LABELS, SCORE_SYSTEM_LABELS, SKILL_TREE_LABELS, SKILL_TYPE_LABELS, STAR_RATING_LABELS, STORY_QUEST_LABELS, UPGRADE_METHOD_LABELS } from './ceshuOptionLabels'
export { HYBRID_GAMEPLAY_PRESETS, PRESET_KEYS, PRESET_STYLE_BADGE_COLORS, PRESET_STYLE_BADGE_FALLBACK, buildPresetApplication, filterPresets, formatModuleBadge, formatRecommendedSystems, formatSecondaryModules, styleBadgeColor } from './ceshuPresets'
export type { HybridGameplayPreset, HybridPresetEntry, PresetApplication } from './ceshuPresets'
export { MAX_TERM_CONFLICTS, MIN_VARIANT_USES, TERM_CHECK_GROUP_IDS, buildTermGroups, detectTerminologyConflicts, terminologyConflictMessage, terminologyConflictMessages } from './ceshuTerminology'
export type { TermConflict, TermGroup } from './ceshuTerminology'
export { CESHU_REFERENCE_GDDS, CESHU_REFERENCE_KIND_LABELS, compareWithReferences, conceptRequiredFields, referenceGaps, referenceKey } from './ceshuReferenceGdd'
export type { CeshuReferenceComparison, CeshuReferenceFieldCoverage, CeshuReferenceGdd, CeshuReferenceKind, CeshuReferenceSource } from './ceshuReferenceGdd'
export { CUSTOM_TEMPLATE_GLOBAL_CATEGORY, TEMPLATE_NAME_REQUIRED_ERROR, applyCustomTemplateUpdate, buildTemplateExportFile, createCustomTemplate, createCustomTemplateId, customTemplateToChapterTemplate, filterCustomTemplates, isValidCustomTemplateName, normalizeCustomTemplate, normalizeImportedTemplate, normalizeTemplateCategory, normalizeTemplateTags, parseTemplateCategoryFile, parseTemplateTagsInput, parseTemplatesImportFile, safeTemplateCategory, searchCustomTemplates, serializeTemplateCategoryFile, sortCustomTemplates } from './ceshuCustomTemplates'
export type { CeshuCustomTemplate, CustomTemplateDraft, CustomTemplateExportEntry, CustomTemplateExportFile, CustomTemplateFile, CustomTemplateUpdate } from './ceshuCustomTemplates'
export { CHAPTER_TEMPLATES, TEMPLATE_APPLY_MODES, TEMPLATE_APPLY_MODE_LABELS, TEMPLATE_APPLY_MODE_SHORT_LABELS, TEMPLATE_NO_DATA_HINT, buildTemplatePreview, chapterTemplateMatches, chapterTemplateSummary, countChapterTemplates, countTemplateFields, filterChapterTemplates, formatTemplateValue, getChapterTemplateByName, isTemplateEmptyField, listChapterTemplates, mergeTemplateByMode, mergeTemplateToChapter, searchChapterTemplates, templateChapterLabel } from './ceshuTemplates'
export type { ChapterTemplate, ChapterTemplateHit, TemplateApplyMode, TemplatePreviewRow } from './ceshuTemplates'
export { createDefaultChapters } from './ceshuDefaults'
