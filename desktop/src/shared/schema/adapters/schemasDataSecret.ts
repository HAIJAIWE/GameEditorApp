/**
 * `schemasData` 拆分件：**系统钥匙串**（API Key 等敏感配置，主进程用 Electron safeStorage 加密落盘）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/**
 * 密钥操作的通用入参（`hasSecret` / `deleteSecret` 共用）。
 * 这里只做「是字符串、长度不越界」的粗校验；**字符集的严格校验（禁路径分隔符 / `..`）
 * 放在主进程**，用 `main/settings/secretStore.ts` 的 `isValidSecretName` 复核，
 * 避免 shared 反向依赖 main。
 */
export const secretNameInputSchema = z.object({
  name: z.string().min(1).max(64)
})

/**
 * 写入密钥：明文只用于主进程加密落盘。
 * 长度上限 4096 与 `secretStore` 的 `MAX_SECRET_LENGTH` 一致（超长在 schema 层就挡住，
 * 避免把整份文档误当密钥存进去）。
 */
export const setSecretInputSchema = z.object({
  name: z.string().min(1).max(64),
  plaintext: z.string().min(1).max(4096)
})

export type SecretNameInput = z.infer<typeof secretNameInputSchema>
export type SetSecretInput = z.infer<typeof setSecretInputSchema>
