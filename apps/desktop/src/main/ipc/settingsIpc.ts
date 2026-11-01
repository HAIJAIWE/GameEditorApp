import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  secretNameInputSchema,
  setSecretInputSchema
} from '@mobai/shared/schema/adapters'
import { isValidSecretName } from '../settings/secretStore'

export function registerSettingsIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { secretStore } = deps
  // 系统钥匙串（API Key 等敏感配置）：渲染层永远拿不到明文，只有 has / set / delete 三条通道，**没有 get**
  handle('settings:hasSecret', secretNameInputSchema, async (req) => {
    if (!isValidSecretName(req.name)) {
      return { has: false }
    }
    try {
      return { has: await secretStore.has(req.name) }
    } catch {
      // 读盘异常时保守回答「未配置」：宁可让用户重新配一次，也不要误报已配置
      return { has: false }
    }
  })
  handle('settings:setSecret', setSecretInputSchema, async (req) => {
    // 名字合法性用 secretStore 自己的校验函数复核（zod 只挡了长度/类型）
    if (!isValidSecretName(req.name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    return secretStore.set(req.name, req.plaintext)
  })
  handle('settings:deleteSecret', secretNameInputSchema, async (req) => {
    if (!isValidSecretName(req.name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    return secretStore.remove(req.name)
  })
}
