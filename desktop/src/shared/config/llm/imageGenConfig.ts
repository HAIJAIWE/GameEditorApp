/**
 * 生图面板「非敏感表单字段」的 localStorage 持久化（纯逻辑，无 React，可单测）。
 *
 * `StorageLike` 与 `defaultSettingsStorage()` 均取自 `settingsStore.ts`（统一设置基座，
 * 唯一真源）；本仓 localStorage 助手统一放 shared/，才能被 node 端 tsc 覆盖单测。
 *
 * 存的是**面板表单**字段（provider/model/baseUrl），不含 `enabled`
 * （面板总是以 enabled=true 发起，由 imageGen.ts 做前置校验）。
 *
 * ## 这里**刻意没有 apiKey**（安全硬约束）
 * E22 曾把生图 API Key 明文写进本键的 `apiKey` 字段，而 localStorage 对渲染层全部 JS、
 * XSS、用户 DevTools 一律可读 —— 相对 旧版 侧 `config/settings`（Fernet 加密）
 * 是一次明确的安全性退步。现在：
 * - Key 由主进程用 Electron `safeStorage` 加密落盘（`userData/secrets.enc`）；
 * - 渲染层**永不持有明文**，只问「配没配过」（`settings:hasSecret`）；
 * - 历史明文的一次性搬迁见 `shared/secretMigration.ts`（读完即删，含失败时也删）。
 *
 * 字段从类型与落盘结构里**整个移除**（而不是「保留但永不写入」）：留着字段就等于
 * 留了一条把明文写回 localStorage 的路，是后门而非冗余。
 */

import type { StorageLike } from '../settings/settingsStore'
import { defaultStorage } from '../settings/settingsStore'

export type { StorageLike }

export type StoredProvider = 'openai' | 'qwen' | 'doubao' | 'generic'

/** 落 localStorage 的非敏感表单字段（**没有 apiKey**，见文件头说明） */
export interface StoredImageGenConfig {
  provider: StoredProvider
  model: string
  baseUrl: string
}

export const IMAGE_GEN_CONFIG_KEY = 'mb.imageGenConfig'

export const DEFAULT_IMAGE_GEN_CONFIG: StoredImageGenConfig = {
  provider: 'openai',
  model: '',
  baseUrl: ''
}

const PROVIDERS: readonly StoredProvider[] = ['openai', 'qwen', 'doubao', 'generic']

function isProvider(value: unknown): value is StoredProvider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 读配置。缺失 / JSON 损坏 / 字段类型不对 → 回落默认值（**不抛**）。
 * provider 非法时回落 'openai'，其余非法字段回落空串。
 * 注：历史遗留的 `apiKey` 字段会被**忽略**（读取时直接丢弃），清除动作由
 * `shared/secretMigration.ts` 在迁移时统一做。
 */
export function loadImageGenConfig(storage: StorageLike | null = defaultStorage()): StoredImageGenConfig {
  if (storage === null) {
    return { ...DEFAULT_IMAGE_GEN_CONFIG }
  }
  let raw: string | null
  try {
    raw = storage.getItem(IMAGE_GEN_CONFIG_KEY)
  } catch {
    return { ...DEFAULT_IMAGE_GEN_CONFIG }
  }
  if (raw === null || raw === '') {
    return { ...DEFAULT_IMAGE_GEN_CONFIG }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_IMAGE_GEN_CONFIG }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ...DEFAULT_IMAGE_GEN_CONFIG }
  }
  const record = parsed as Record<string, unknown>
  return {
    provider: isProvider(record.provider) ? record.provider : DEFAULT_IMAGE_GEN_CONFIG.provider,
    model: asString(record.model),
    baseUrl: asString(record.baseUrl)
  }
}

/**
 * 写配置。storage 不可用或写入抛错 → 静默 no-op（不阻塞面板使用）。
 * 只写非敏感字段：**任何调用点都无法把 API Key 落进 localStorage**。
 */
export function saveImageGenConfig(
  config: StoredImageGenConfig,
  storage: StorageLike | null = defaultStorage()
): void {
  if (storage === null) {
    return
  }
  // 显式白名单挑选字段：即便调用方手里握着一个带 apiKey 的对象，也不会被写进去
  const payload: StoredImageGenConfig = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl
  }
  try {
    storage.setItem(IMAGE_GEN_CONFIG_KEY, JSON.stringify(payload))
  } catch {
    // 配额满/禁用存储：忽略，表单仍可本次会话内使用
  }
}
