/**
 * 旧版本 localStorage 明文 API Key → 系统钥匙串（`safeStorage`）的**一次性迁移**。
 *
 * ## 要解决的退步
 * E22（TS 迁移期）把生图 API Key 明文写进了 `mb.imageGenConfig` 的 `apiKey` 字段。
 * localStorage 对渲染层全部 JS、XSS、用户 DevTools 一律可读，而 旧版 侧
 * `config/settings` 是 **Fernet 加密**存的（密钥在 `~/.mb_kshbjq/.fernet_key`）。
 * 也就是说迁移当时引入了一次**明确的安全性退步**。本模块把这份明文收回钥匙串。
 *
 * ## 为什么是「读完即删」，失败也删
 * 明文在 localStorage 里每多待一秒都是攻击面。所以只要读到旧明文就**无条件抹掉**
 * （哪怕写入钥匙串失败），失败时用返回值把原因带给 UI，让用户重新粘贴一次。
 * 取舍：极少数「safeStorage 不可用 / 磁盘写失败」的机器上用户需要重输一次 Key；
 * 反过来若失败就保留明文，则等于给了攻击者无限次重试窗口 —— 不接受。
 *
 * ## 纯逻辑、零 React、零 electron
 * storage 与写钥匙串的回调都由调用方注入（渲染层注入 `window.mbApi.settings.setSecret`，
 * 单测注入假实现），故本模块可在 Node 下直接单测。
 */

import { IMAGE_GEN_CONFIG_KEY } from './imageGenConfig'
import type { StorageLike } from './settingsStore'
import { defaultSettingsStorage, readSetting, writeSetting } from './settingsStore'
import { SECRET_NAMES } from './secretNames'

/** 旧版本明文所在的字段名（`mb.imageGenConfig` 内） */
const LEGACY_API_KEY_FIELD = 'apiKey'

/**
 * 明文长度上限。
 * 与 `main/settings/secretStore.ts` 的 `MAX_SECRET_LENGTH`（4096）保持一致：
 * 超过就不可能是真 API Key，直接判为「旧数据非法」。
 */
const MAX_LEGACY_PLAINTEXT_LENGTH = 4096

/** 写入系统钥匙串的回调（渲染层传 `window.mbApi.settings.setSecret` 的薄包装） */
export type SetSecretFn = (name: string, plaintext: string) => Promise<{ ok: boolean; error?: string }>

/** 迁移结果分类（UI 据此给不同提示） */
export type LegacyApiKeyMigrationReason =
  /** 成功：旧明文已进钥匙串，localStorage 已无残留 */
  | 'migrated'
  /** localStorage 里本来就没有旧明文（绝大多数用户） */
  | 'no-legacy-key'
  /** 旧明文非法（超长 / 含 NUL）→ 已清除，需用户重新配置 */
  | 'invalid-legacy-key'
  /** 写入钥匙串失败 → 旧明文已清除，需用户重新配置 */
  | 'secret-write-failed'
  /** localStorage 不可用（隐私模式 / 被禁用）→ 什么都没做 */
  | 'storage-unavailable'

export interface LegacyApiKeyMigrationResult {
  /** 是否已成功写入系统钥匙串 */
  migrated: boolean
  reason: LegacyApiKeyMigrationReason
  /** 失败原因（成功时为 undefined），文案可直接展示给用户 */
  error?: string
}

/**
 * 读旧明文 API Key。
 * @returns 去空白后的明文；键缺失 / JSON 损坏 / 字段非字符串 / 只有空白 → `null`
 */
export function readLegacyImageGenApiKey(
  storage: StorageLike | null = defaultSettingsStorage()
): string | null {
  const raw = readSetting(IMAGE_GEN_CONFIG_KEY, storage)
  if (raw === null || raw === '') {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  const value = (parsed as Record<string, unknown>)[LEGACY_API_KEY_FIELD]
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * 从 `mb.imageGenConfig` 里抹掉 `apiKey` 字段，**保留 provider / model / baseUrl**。
 *
 * 边界处理：
 * - 键不存在 / 本就没有 `apiKey` 字段 → 视为已无残留，返回 true；
 * - JSON 损坏或不是对象 → 无法「只删字段」，直接删掉整个键（表单值回落默认，
 *   但这本来就是损坏数据，保留它没有意义），返回是否删成功；
 * - 写回抛错（配额满 / 禁用）→ 返回 false。
 */
export function stripLegacyImageGenApiKey(
  storage: StorageLike | null = defaultSettingsStorage()
): boolean {
  if (storage === null) {
    return false
  }
  const raw = readSetting(IMAGE_GEN_CONFIG_KEY, storage)
  if (raw === null || raw === '') {
    return true
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return removeConfigKey(storage)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return removeConfigKey(storage)
  }
  const record = parsed as Record<string, unknown>
  if (!(LEGACY_API_KEY_FIELD in record)) {
    return true
  }
  delete record[LEGACY_API_KEY_FIELD]
  return writeSetting(IMAGE_GEN_CONFIG_KEY, JSON.stringify(record), storage)
}

/**
 * 一次性迁移：把旧 localStorage 明文 API Key 搬进系统钥匙串，然后抹掉 localStorage 里的明文。
 *
 * @param plaintext 旧明文（一般由 {@link readLegacyImageGenApiKey} 给出）
 * @param setSecret 写钥匙串回调；失败/抛异常都视为写入失败
 * @param storage localStorage（注入便于单测；默认取浏览器 localStorage）
 * @param secretName 目标 secret 名，默认生图 API Key
 */
export async function migrateLegacyApiKey(
  plaintext: string | null,
  setSecret: SetSecretFn,
  storage: StorageLike | null = defaultSettingsStorage(),
  secretName: string = SECRET_NAMES.imageGenApiKey
): Promise<LegacyApiKeyMigrationResult> {
  if (storage === null) {
    return {
      migrated: false,
      reason: 'storage-unavailable',
      error: '本地存储不可用，无法检查旧版密钥'
    }
  }

  const legacy = (plaintext ?? '').trim()
  if (legacy === '') {
    // 无旧明文：仍抹一次，保证「只有空白残留」也被清掉
    stripLegacyImageGenApiKey(storage)
    return { migrated: false, reason: 'no-legacy-key' }
  }

  if (legacy.length > MAX_LEGACY_PLAINTEXT_LENGTH || legacy.includes('\0')) {
    stripLegacyImageGenApiKey(storage)
    return {
      migrated: false,
      reason: 'invalid-legacy-key',
      error: '旧版 API Key 非法（过长或含空字符），已从本地存储清除，请重新配置'
    }
  }

  let written: { ok: boolean; error?: string }
  try {
    written = await setSecret(secretName, legacy)
  } catch (err) {
    written = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // 安全优先：不论写入成功与否，都把 localStorage 里的明文抹掉
  stripLegacyImageGenApiKey(storage)

  if (!written.ok) {
    return {
      migrated: false,
      reason: 'secret-write-failed',
      error: `旧版 API Key 迁移到系统钥匙串失败：${written.error ?? '未知原因'}；本地明文已清除，请重新输入并保存`
    }
  }
  return { migrated: true, reason: 'migrated' }
}

/** 删除整个 `mb.imageGenConfig` 键（JSON 损坏时的兜底） */
function removeConfigKey(storage: StorageLike): boolean {
  try {
    storage.removeItem(IMAGE_GEN_CONFIG_KEY)
    return true
  } catch {
    return false
  }
}
