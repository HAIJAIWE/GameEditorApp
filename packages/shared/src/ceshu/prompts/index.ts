/**
 * shared/ceshu/prompts —— 策划书 AI 提示词：章节/整篇生成与对抗式审阅提示词、风格与品类档案、AI 生成标记、克隆拆解、任务计划与系统确认。
 *
 * 外部一律从这里 import（`.../prompts`），不要再深插目录内文件。
 */

export { CESHU_AGENT_CONTEXT_LIMIT, CESHU_AGENT_GAME_PREFIX, CESHU_AGENT_PATCH_SYSTEM_PROMPT, CESHU_AGENT_SYSTEM_PROMPT, CESHU_AGENT_TRUNCATED_SUFFIX, CESHU_AGENT_UNTITLED, buildCeshuAgentPrompt } from './ceshuAgentChatPrompt'
export { AI_SEED_GUIDE, AI_SEED_PREFIX, buildAiSeedPrompt } from './aiSeedPrompt'
export { ADVERSARIAL_CHECK_KEYS, ADVERSARIAL_CHECK_LABELS, ADVERSARIAL_CHECK_PROBES, ADVERSARIAL_LEVELS, ADVERSARIAL_LEVEL_LABELS, AGENT_DISPLAY, APP_ADVERSARIAL_CHECK_PROBES, APP_NO_FABRICATION, APP_REQUIREMENTS_FULL, APP_REQUIREMENTS_ONLY_EMPTY, APP_WRITING_STANDARD, BUSINESS_HARD_CONSTRAINTS, CESHU_NO_FABRICATION, CESHU_WRITING_STANDARD, CHAPTER_AGENT_MAP, CHAPTER_AGENT_PROMPTS, CHAPTER_GENERATION_HINTS, FULL_GEN_BUSINESS_MODELS, FULL_GEN_GAME_TYPES, FULL_GEN_PLATFORMS, FULL_GEN_STYLES, GENRE_PROFILE_BY_TYPE, GENRE_REVIEW_PROFILES, PLATFORM_HARD_CONSTRAINTS, REQUIREMENTS_FULL, REQUIREMENTS_ONLY_EMPTY, REQUIREMENT_STRING_CONTENT, STYLE_GLOSSARIES, STYLE_KEYWORD_HINTS, STYLE_LABEL_TO_KEY, TYPE_KEYWORD_HINTS, TYPE_LABEL_TO_KEY, agentForChapter, agentForDocChapter, buildChapterOrder, buildChapterPrompt, buildChapterPrompts, buildFullGeneratePlan, buildKeywordConstraintBlock, buildMetaSeed, buildReviewMarkdown, buildReviewPrompts, buildReviewSummary, countFindings, filterGeneratedFields, finalizeReview, genreReviewProfile, getStyleGlossary, mapStyleLabelToKey, mapTypeLabelToKey, mergeChapterDraft, normalizeFullGenerateInput, parseReviewResponse, resolveGenreProfileKey, reviewProbeFor } from './ceshuAi'
export type { AdversarialCheckKey, AdversarialFinding, AdversarialLevel, CeshuAiGenerateResult, CeshuAiReviewResult, CeshuReviewPayload, ChapterAgent, ChapterPromptOptions, ChapterPromptResult, FullGenerateFormInput, FullGenerateInput, FullGeneratePlan, GenreProfileKey, GenreReviewProfile, TypeKeywordHint } from './ceshuAi'
export { AI_GENERATED_KEY, clearAiGenerated, markAiGenerated, pendingAiChapters, readAiGenerated } from './ceshuAiMark'
export type { AiGeneratedMap } from './ceshuAiMark'
export { BUNDLE_CONSUME_TASKS, BUNDLE_CONSUME_TASK_LABELS, BUNDLE_CONSUME_USAGE, buildBundleConsumePrompt } from './ceshuBundlePrompt'
export type { BundleConsumeTask } from './ceshuBundlePrompt'
export { CLONE_CONCEPT_CHAPTERS, applyCloneDecompose, buildCloneDecomposePrompt, parseCloneDecompose } from './ceshuClonePrompt'
export type { CloneDecomposeInput } from './ceshuClonePrompt'
export { buildDemoPrompt } from './ceshuDemoPrompt'
export type { DemoPromptResult } from './ceshuDemoPrompt'
export { FIELDS_PREVIEW_LIMIT, buildSystemConfirmResult, formatFieldsPreview, systemDisplayName } from './ceshuSystemConfirm'
export type { SystemConfirmCustom, SystemConfirmResult } from './ceshuSystemConfirm'
export { TASK_DIGEST_LIMIT, TASK_PER_ROLE_LIMIT, buildRoleTaskPrompt, buildTaskDigest, countTaskPlan, isEmptyTaskPlan, parseRoleTaskPlan, taskRolesForDoc } from './ceshuTaskPrompt'
