/**
 * shared/agent/config —— Agent 协议与配置：技能协议/风险分级与权限校验、工具目录与 JSON Schema 转换、预设人格、用户偏好提取。
 *
 * 外部一律从这里 import（`.../config`），不要再深插目录内文件。
 */

export { SKILL_ERRORS } from './errorCodes'
export type { SkillErrorCode } from './errorCodes'
export { PREFERENCE_KEYWORDS, buildPersonalizedContext, extractPreferences } from './personalization'
export type { FeedbackRecord } from './personalization'
export { AGENT_PRESETS, DEFAULT_PRESET_ID, PRESET_PERSONA, TECH_WRITER_PRESET_ID, presetLabel, presetPersona } from './presets'
export type { AgentPreset } from './presets'
export { PERMISSION_MODES, permissionPolicyHolder, resolvePermissionPolicy } from './permission'
export type { PermissionMode, PermissionPolicy } from './permission'
export { ACTION_ALIASES, DEFAULT_MAX_ALLOWED_RISK, DEFAULT_TOOL_RISK, LLM_BULK_COUNT_THRESHOLD, RISK_LEVEL, TOOL_CATALOG_SUMMARY_MAX_CHARS, TOOL_RISK_MAP, checkPermission, clearDynamicToolRisk, declaredActionsOf, fixParams, getToolCatalogLine, getToolDescription, inferAction, isBulkLlmCall, isSkillInteraction, llmConfirmReason, normalizeSkillResult, resolveInteractionQuestions, resolveRiskLevel, setDynamicToolRisk, toFunctionCallingTools, toJsonSchema } from './protocol'
export type { FunctionCallingTool, JsonObjectSchema, JsonSchemaProperty, LlmCallScope, PermissionCheck, RiskLevel, SkillExecutionContext, SkillInteraction, SkillInteractionOption, SkillInteractionQuestion, SkillProtocol, SkillResult, ToolFunctionSchema } from './protocol'
