/**
 * agentService 包对外桶（保持 `brainService.ts` 原有公共 API 不变）。
 *
 * - `types`         ：AgentChatOptions / AgentBrainServiceDeps
 * - `domainContext` ：域 grounding / 默认评估器
 * - `memory`        ：记忆块装配 + MEMORY_INJECT_TOP_K
 * - `service`       ：AgentBrainService / createDispatcherToolRunner
 */

export * from './types'
export * from './domainContext'
export * from './memory'
export * from './service'
