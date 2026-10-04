/**
 * 生图面板配置的 localStorage 持久化（纯逻辑，无 React，可单测）。
 *
 * 复用 `visibleTypes.ts` 的 `StorageLike` 与其 `defaultStorage()` 取法
 * （同一事实单一真源；本仓 localStorage 助手统一放 shared/，才能被 node 端 tsc 覆盖单测）。
 *
 * 存的是**面板表单**字段（provider/apiKey/model/baseUrl），不含 `enabled`
 * （面板总是以 enabled=true 发起，由 imageGen.ts 做前置校验）。
 */

import type { StorageLike } from './visibleTypes'

export type { StorageLike }

export type StoredProvider = 'openai' | 'qwen' | 'doubao' | 'generic'

export interface StoredImageGenConfig {
  provider: StoredProvider
  apiKey: string
  model: string
  baseUrl: string
}

export const IMAGE_GEN_CONFIG_KEY = 'mb.imageGenConfig'

export const DEFAULT_IMAGE_GEN_CONFIG: StoredImageGenConfig = {
  provider: 'openai',
  apiKey: '',
  model: '',
  baseUrl: ''
}

const PROVIDERS: readonly StoredProvider[] = ['openai', 'qwen', 'doubao', 'generic']

function defaultStorage(): StorageLike | null {
  const holder = globalThis as unknown as { localStorage?: StorageLike }
  return holder.localStorage ?? null
}

function isProvider(value: unknown): value is StoredProvider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 读配置。缺失 / JSON 损坏 / 字段类型不对 → 回落默认值（**不抛**）。
 * provider 非法时回落 'openai'，其余非法字段回落空串。
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
    apiKey: asString(record.apiKey),
    model: asString(record.model),
    baseUrl: asString(record.baseUrl)
  }
}

/** 写配置。storage 不可用或写入抛错 → 静默 no-op（不阻塞面板使用）。 */
export function saveImageGenConfig(
  config: StoredImageGenConfig,
  storage: StorageLike | null = defaultStorage()
): void {
  if (storage === null) {
    return
  }
  try {
    storage.setItem(IMAGE_GEN_CONFIG_KEY, JSON.stringify(config))
  } catch {
    // 配额满/禁用存储：忽略，表单仍可本次会话内使用
  }
}
