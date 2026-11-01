/**
 * 敏感配置（API Key）存储层 —— 用 Electron `safeStorage` 加密，落到 userData。
 *
 * ## 为什么需要它（这是一次安全性退步的修复）
 * 旧版 `config/settings` 用 **Fernet 加密**存 3 个 API Key（密钥在
 * `~/.mb_kshbjq/.fernet_key`）。TS 侧迁移时 E22 把生图的 apiKey 直接放进了
 * **localStorage 明文**（`mb.imageGenConfig`）——localStorage 任何读得到
 * `window.localStorage` 的代码（含渲染层全部 JS、XSS、用户 DevTools）都能拿到。
 * 那是**相对 旧版 的明确退步**，本模块修掉它。
 *
 * ## 正确姿势：渲染层永远拿不到明文
 * 渲染层是 `sandbox: true` + `contextIsolation: true`，**无法访问 safeStorage**
 * （safeStorage 只能由主进程调用）。所以：
 * - 写入：渲染层把明文经 IPC 交给主进程 → 主进程加密落盘，**渲染层不留存**；
 * - 读取：渲染层**拿不到明文**，只问「有没有配过」（`hasSecret`），
 *   真正使用时由主进程在**本地**解密并使用（本次是给生图请求加 Authorization 头）。
 * 这样即使渲染层被 XSS，也无法读到长期密钥。
 *
 * ## 平台能力
 * `safeStorage.isEncryptionAvailable()` 为 false 时（Linux 无 keyring 等），
 * 本模块**明确不降级为明文**——直接返回错误，让用户知道存不了，
 * 而不是悄悄把密钥写成明文（那比重构前更糟）。
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** 加密后密钥文件的文件名（落在 userData 下） */
export const SECRET_FILE_NAME = 'secrets.enc'

/** 单个 secret 的最大明文长度（防误存整份文档/大数组；API Key 通常 < 200 字符） */
const MAX_SECRET_LENGTH = 4096

/**
 * 存储的 secret 清单结构。
 * `entries` 的 value 是 **base64 密文**，不是明文。
 */
export interface SecretBundle {
  version: 1
  /** secret 名 → base64 密文 */
  entries: Record<string, string>
}

/** 校验 secret 名合法（只允许字母数字 . _ -，禁止路径分隔符，防穿越/注入） */
export function isValidSecretName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(name) && !name.includes('..')
}

/** 明文是否可接受：非空、无 NUL、长度在限内 */
export function isValidSecretPlaintext(plaintext: string): boolean {
  return plaintext.length > 0 && plaintext.length <= MAX_SECRET_LENGTH && !plaintext.includes('\0')
}

/**
 * 解析 secret 文件内容 → 清单。
 * **容错**：文件不存在 / JSON 损坏 / 结构不对 → 返回空清单（不是 null，便于调用方统一处理）。
 * 这样一次损坏不会让整个设置面板打不开。
 */
export function parseSecretBundle(raw: string | null): SecretBundle {
  if (raw === null || raw === '') {
    return { version: 1, entries: {} }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { version: 1, entries: {} }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { version: 1, entries: {} }
  }
  const candidate = parsed as Partial<SecretBundle>
  if (candidate.version !== 1 || typeof candidate.entries !== 'object' || candidate.entries === null) {
    return { version: 1, entries: {} }
  }
  const entries: Record<string, string> = {}
  for (const [name, cipher] of Object.entries(candidate.entries)) {
    // 只保留「合法名 + 合法 base64 密文」，其余丢弃
    if (isValidSecretName(name) && typeof cipher === 'string' && cipher !== '') {
      entries[name] = cipher
    }
  }
  return { version: 1, entries }
}

/** 序列化清单（原子写用） */
export function serializeSecretBundle(bundle: SecretBundle): string {
  return JSON.stringify(bundle, null, 2)
}

/** 读 secret 文件 → 清单（不存在/损坏都返回空清单，不抛） */
export async function readSecretBundle(userDataDir: string): Promise<SecretBundle> {
  try {
    const raw = await readFile(join(userDataDir, SECRET_FILE_NAME), 'utf-8')
    return parseSecretBundle(raw)
  } catch {
    return { version: 1, entries: {} }
  }
}

/** 写 secret 文件（**原子写**：tmp + rename） */
export async function writeSecretBundle(userDataDir: string, bundle: SecretBundle): Promise<void> {
  const file = join(userDataDir, SECRET_FILE_NAME)
  const temp = `${file}.tmp`
  await mkdir(dirname(file), { recursive: true })
  await writeFile(temp, serializeSecretBundle(bundle), 'utf-8')
  await rename(temp, file)
}

/**
 * 内存态的 secret 存取（依赖注入 electron safeStorage，便于单测）。
 *
 * 设计成 class 而非散函数：safeStorage 的调用点收敛在一处，
 * 便于单测时传入 fake，也便于未来换加密后端。
 */
export class SecretStore {
  /**
   * @param userDataDir 加密文件落盘目录（通常 app.getPath('userData')）
   * @param isAvailable `safeStorage.isEncryptionAvailable`
   * @param encrypt `safeStorage.encryptString`（返回 Buffer）
   * @param decrypt `safeStorage.decryptString`（接受 Buffer，返回明文串）
   */
  constructor(
    private readonly userDataDir: string,
    private readonly isAvailable: () => boolean,
    private readonly encrypt: (plaintext: string) => Buffer,
    private readonly decrypt: (cipher: Buffer) => string
  ) {}

  /** 加密能力是否可用（不可用时**不降级明文**，写/读都直接报错） */
  available(): boolean {
    return this.isAvailable()
  }

  /** 某个 secret 是否已配置（**不需要解密**，渲染层就靠这个显示「已配置」） */
  async has(name: string): Promise<boolean> {
    if (!isValidSecretName(name)) {
      return false
    }
    const bundle = await readSecretBundle(this.userDataDir)
    return bundle.entries[name] !== undefined
  }

  /** 已配置的 secret 名清单（不含密文） */
  async listNames(): Promise<string[]> {
    const bundle = await readSecretBundle(this.userDataDir)
    return Object.keys(bundle.entries).sort()
  }

  /** 写入（加密后落盘）。返回是否成功，**不抛** */
  async set(name: string, plaintext: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isValidSecretName(name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    if (!isValidSecretPlaintext(plaintext)) {
      return { ok: false, error: '密钥内容为空或过长' }
    }
    if (!this.isAvailable()) {
      // 关键安全决策：宁可不存，也不明文落盘
      return { ok: false, error: '当前系统不支持安全存储（safeStorage 不可用），已拒绝保存明文密钥' }
    }
    try {
      const cipher = this.encrypt(plaintext).toString('base64')
      const bundle = await readSecretBundle(this.userDataDir)
      bundle.entries[name] = cipher
      await writeSecretBundle(this.userDataDir, bundle)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: `保存密钥失败：${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /** 读取并解密（**仅主进程本地使用**，不要经 IPC 把明文发给渲染层） */
  async get(name: string): Promise<{ ok: true; plaintext: string } | { ok: false; error: string }> {
    if (!isValidSecretName(name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    const bundle = await readSecretBundle(this.userDataDir)
    const cipher = bundle.entries[name]
    if (cipher === undefined) {
      return { ok: false, error: '未配置该密钥' }
    }
    if (!this.isAvailable()) {
      return { ok: false, error: '当前系统不支持安全存储，无法解密' }
    }
    try {
      return { ok: true, plaintext: this.decrypt(Buffer.from(cipher, 'base64')) }
    } catch (err) {
      return { ok: false, error: `解密失败：${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /** 删除某个 secret */
  async remove(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isValidSecretName(name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    try {
      const bundle = await readSecretBundle(this.userDataDir)
      if (bundle.entries[name] === undefined) {
        return { ok: true }
      }
      delete bundle.entries[name]
      await writeSecretBundle(this.userDataDir, bundle)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: `删除密钥失败：${err instanceof Error ? err.message : String(err)}` }
    }
  }
}
