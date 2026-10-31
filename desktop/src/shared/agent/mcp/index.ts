/**
 * shared/agent/mcp —— MCP 接入：客户端握手与 tools 列表/调用、配置解析、MCP 工具转 SkillProtocol 的桥接。
 *
 * 外部一律从这里 import（`.../mcp`），不要再深插目录内文件。
 */

export * from './client'
export * from './config'
export * from './types'
export * from './bridge'
