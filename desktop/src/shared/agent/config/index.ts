/**
 * shared/agent/config 能力入口。
 *
 * 外部一律从这里 import（`.../config`），不要再深插目录内文件。
 */

export { PREFERENCE_KEYWORDS, buildPersonalizedContext, extractPreferences } from './personalization'
export type { FeedbackRecord } from './personalization'
export { AGENT_PRESETS, DEFAULT_PRESET_ID, PRESET_PERSONA, presetLabel, presetPersona } from './presets'
export type { AgentPreset } from './presets'
export { ACTION_ALIASES, DEFAULT_MAX_ALLOWED_RISK, DEFAULT_TOOL_RISK, LLM_BULK_COUNT_THRESHOLD, RISK_LEVEL, TOOL_CATALOG_SUMMARY_MAX_CHARS, TOOL_RISK_MAP, checkPermission, clearDynamicToolRisk, fixParams, getToolCatalogLine, getToolDescription, inferAction, isBulkLlmCall, isSkillInteraction, llmConfirmReason, normalizeSkillResult, resolveInteractionQuestions, resolveRiskLevel, setDynamicToolRisk, toFunctionCallingTools, toJsonSchema } from './protocol'
export type { FunctionCallingTool, JsonObjectSchema, JsonSchemaProperty, LlmCallScope, PermissionCheck, RiskLevel, SkillExecutionContext, SkillInteraction, SkillInteractionOption, SkillInteractionQuestion, SkillParameter, SkillProtocol, SkillResult, ToolFunctionSchema } from './protocol'
