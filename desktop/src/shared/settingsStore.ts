/**
 * settingsStore —— 统一设置存储基座（迁移 Python `config/settings.py` 的存储职责）。
 *
 * ## 为什么有这个模块
 * 迁移到 E22 时，应用里已有 **4 处各自为政的 localStorage 写法**，无统一抽象：
 *
 * | key | 位置 | 写法问题 |
 * |---|---|---|
 * | `mb.visibleTypes`      | `shared/visibleTypes.ts`     | 有 `StorageLike` 注入，但无法枚举/导出 |
 * | `mb.gameStyle`         | `shared/gameStyle.ts`        | 同上（已复用 `StorageLike`） |
 * | `mb.imageGenConfig`    | `shared/imageGenConfig.ts`   | 同上 |
 * | `mb.dataDiffBaseline`  | `renderer/.../DataDiffPanel.tsx` | **裸 `window.localStorage`**、组件内自带 try/catch、且存整表数据 |
 *
 * 分散的代价：无法「一键导出/重置全部设置」、无法枚举某个命名空间下有哪些键、
 * 键名散落各处易拼错、异常处理各不相同。
 *
 * ## 本模块提供（**纯逻辑，零 React、零 fs，可单测**）
 * - `StorageLike`：**唯一真源**（从 `visibleTypes.ts` 迁到这里，其余模块从此处 import）
 * - 统一的 `readSetting`/`writeSetting`/`removeSetting`/`clearNamespace`
 * - 命名空间枚举 `listSettingKeys()`（按前缀）
 * - 导出 / 导入 / 重置：`exportSettings()` / `importSettings()` / `resetAllSettings()`
 *
 * ## 有意不迁（避免过度开发）
 * - **不做 i18n**：Python `common/i18n.py`（401 行）是全局翻译框架，而 TS 侧 UI 文案
 *   目前 100% 硬编码中文。接入 i18n 需翻译全部组件文案（数十个文件、上千字符串），
 *   属**独立立项**，不是存储基座的职责。
 * - **不做窗口几何状态**：Electron 侧窗口尺寸/位置由 `main/windowState.ts` 覆盖（原子写
 *   落 `window-state.json`），与「用户偏好设置」语义不同，不混进本模块的 `mb.` 命名空间。
 * - **主题系统已迁**：多主题（深/浅）偏好见 `shared/theme.ts`，挂在 `mb.theme`，复用本模块
 *   的 `readSetting` / `writeSetting`——存储真源仍在此，只是逻辑独立成模块。
 *
 * ## 存储位置
 * 沿用既有做法落 **localStorage**（键前缀 `mb.`），而非 Python 的 `config.json`——
 * 本仓 DataService 已在 localStorage/用户目录体系内，渲染层读设置无需 IPC。
 */

/** localStorage 抽象（**唯一真源**；`visibleTypes`/`gameStyle`/`imageGenConfig` 由此 re-export） */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 所有设置键的公共前缀（命名空间） */
export const SETTINGS_KEY_PREFIX = 'mb.'

/** 取默认 storage（浏览器 localStorage）；Node / 主进程下可能不存在 → null */
export function defaultSettingsStorage(): StorageLike | null {
  try {
    const holder = globalThis as unknown as { localStorage?: StorageLike }
    return holder.localStorage ?? null
  } catch {
    // 某些环境访问 localStorage 会抛（隐私模式 / 禁用）
    return null
  }
}

/**
 * 读一个设置项（返回**原始字符串**）。
 * @returns 键不存在或 storage 不可用时为 `null`
 */
export function readSetting(key: string, storage: StorageLike | null = defaultSettingsStorage()): string | null {
  if (storage === null) {
    return null
  }
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/**
 * 写一个设置项。空串视为「清除」（避免留下无意义键）。
 * @returns 是否真的写入成功（storage 不可用/抛错 → false）
 */
export function writeSetting(key: string, value: string, storage: StorageLike | null = defaultSettingsStorage()): boolean {
  if (storage === null) {
    return false
  }
  try {
    if (value === '') {
      storage.removeItem(key)
      return true
    }
    storage.setItem(key, value)
    return true
  } catch {
    // 配额满 / 禁用存储：不影响主流程
    return false
  }
}

/** 删除一个设置项。@returns 是否成功 */
export function removeSetting(key: string, storage: StorageLike | null = defaultSettingsStorage()): boolean {
  if (storage === null) {
    return false
  }
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * 读一个 JSON 设置项。
 * @param fallback 键缺失 / JSON 损坏 / 类型不符时的回落值
 */
export function readJsonSetting<T>(
  key: string,
  fallback: T,
  storage: StorageLike | null = defaultSettingsStorage()
): T {
  const raw = readSetting(key, storage)
  if (raw === null) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 写一个 JSON 设置项。@returns 是否成功 */
export function writeJsonSetting(key: string, value: unknown, storage: StorageLike | null = defaultSettingsStorage()): boolean {
  let raw: string
  try {
    raw = JSON.stringify(value)
  } catch {
    // 循环引用等
    return false
  }
  return writeSetting(key, raw, storage)
}

/**
 * 列出某个命名空间下的所有设置键。
 * 注意：`StorageLike` 接口**没有 `key()`/长度**（刻意保持最小面），
 * 故本函数需要传入一个可枚举的 storage 实现（浏览器的 `window.localStorage` 满足）。
 * 传入的 storage 不支持枚举时返回 `[]`。
 */
export function listSettingKeys(storage: StorageLike | null = defaultSettingsStorage()): string[] {
  if (storage === null) {
    return []
  }
  const maybe = storage as StorageLike & {
    length?: number
    key?: (index: number) => string | null
  }
  if (typeof maybe.length !== 'number' || typeof maybe.key !== 'function') {
    return []
  }
  const keys: string[] = []
  for (let index = 0; index < maybe.length; index += 1) {
    const key = maybe.key(index)
    if (key !== null && key.startsWith(SETTINGS_KEY_PREFIX)) {
      keys.push(key)
    }
  }
  return keys.sort()
}

/** 设置快照（导出文件 / 导入用的结构） */
export interface SettingsSnapshot {
  /** 应用版本标识，便于将来做设置迁移 */
  version: 1
  /** key → 原始字符串值 */
  entries: Record<string, string>
}

/** 导出全部 `mb.` 设置。storage 不支持枚举时返回空快照 */
export function exportSettings(storage: StorageLike | null = defaultSettingsStorage()): SettingsSnapshot {
  const entries: Record<string, string> = {}
  for (const key of listSettingKeys(storage)) {
    const value = readSetting(key, storage)
    if (value !== null) {
      entries[key] = value
    }
  }
  return { version: 1, entries }
}

/**
 * 导入设置快照（覆盖同名键）。
 * @returns 实际写入的键数；快照格式非法时返回 0
 */
export function importSettings(
  snapshot: unknown,
  storage: StorageLike | null = defaultSettingsStorage()
): number {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return 0
  }
  const candidate = snapshot as Partial<SettingsSnapshot>
  if (candidate.version !== 1 || typeof candidate.entries !== 'object' || candidate.entries === null) {
    return 0
  }
  let count = 0
  for (const [key, value] of Object.entries(candidate.entries)) {
    // 只接受带命名空间前缀的键，避免导入文件塞入任意 localStorage 键
    if (!key.startsWith(SETTINGS_KEY_PREFIX) || typeof value !== 'string') {
      continue
    }
    if (writeSetting(key, value, storage)) {
      count += 1
    }
  }
  return count
}

/**
 * 重置全部 `mb.` 设置（谨慎调用）。
 * @returns 删除的键数
 */
export function resetAllSettings(storage: StorageLike | null = defaultSettingsStorage()): number {
  const keys = listSettingKeys(storage)
  let count = 0
  for (const key of keys) {
    if (removeSetting(key, storage)) {
      count += 1
    }
  }
  return count
}

/** 本仓已登记的设置键（单一清单：新增设置请在此登记，便于导出/重置可预期） */
export const SETTINGS_KEYS = {
  visibleTypes: 'mb.visibleTypes',
  gameStyle: 'mb.gameStyle',
  imageGenConfig: 'mb.imageGenConfig',
  dataDiffBaseline: 'mb.dataDiffBaseline',
  theme: 'mb.theme',
  fontSize: 'mb.fontSize',
  confirmDelete: 'mb.confirmDelete'
} as const

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS]
