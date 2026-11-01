/**
 * `SecretStore` 的 **Electron 薄壳**：把 `safeStorage` 注入给纯逻辑的存储层。
 *
 * ## 分层理由
 * `main/settings/secretStore.ts` 刻意**不 import electron**（只接受
 * `isEncryptionAvailable/encryptString/decryptString` 三个函数），所以它能在 Node 下
 * 直接单测。真正需要 electron 的只有「这三个函数从哪来」和「userData 在哪」，
 * 集中在本文件，`secretStore.ts` 因此保持零框架依赖、可测。
 *
 * ## 为什么是懒加载单例
 * `app.getPath('userData')` 只能在 app ready 之后取（早于 ready 调用会抛）。
 * `main/index.ts` 是模块顶层执行 import，若在顶层就构造 `SecretStore`，
 * 会在 `app.whenReady()` 之前触到未初始化的 electron 路径。故改为
 * `getSecretStore()` 首次调用时构造并缓存——首个调用点在 `activateLibrary()`
 * （whenReady 回调内），时机安全。
 *
 * ## 为什么不直接在 `main/ipc.ts` 里 import
 * 照 `getAppInfo` / `setWindowMode` 的既有先例：`ipc.ts` 通过 `IpcHandlerDeps`
 * 拿依赖（`import type` 即可，type-only 无运行时耦合），
 * 避免 `ipc.ts` ←→ `index.ts` 的循环依赖，也让 handler 可被注入假实现测试。
 */

import { app, safeStorage } from 'electron'

import { SecretStore } from './secretStore'

/** 进程内唯一实例（首次调用 `getSecretStore()` 时创建） */
let instance: SecretStore | null = null

/**
 * 取进程内唯一的 `SecretStore`（加密文件落在 `userData/secrets.enc`）。
 * 必须在 `app.whenReady()` 之后调用。
 */
export function getSecretStore(): SecretStore {
  if (instance === null) {
    instance = new SecretStore(
      app.getPath('userData'),
      () => safeStorage.isEncryptionAvailable(),
      (plaintext: string): Buffer => safeStorage.encryptString(plaintext),
      (cipher: Buffer): string => safeStorage.decryptString(cipher)
    )
  }
  return instance
}
