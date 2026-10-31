/**
 * shared/util/object —— 对象与 JSON 安全处理：类型守卫、带 fallback 的安全解析、LLM 返回 JSON 的容错解析。
 *
 * 外部一律从这里 import（`.../object`），不要再深插目录内文件。
 */

export * from './guards'
export * from './safeJson'
export * from './parseLlmJson'
