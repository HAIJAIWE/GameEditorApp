import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { imageGenInputSchema } from '../../shared/schema/core/schemas'
import { SECRET_NAMES } from '../../shared/config/secretNames'
import type { ImageGenConfig } from '../../shared/config/imageGen'
import { generateImage } from '../imageGen/client'
import { saveImageFromUrl } from '../imageGen/save'

export function registerImageGenIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { secretStore } = deps
  // AI 生图（features/_ai_image 能力缺口补齐）：生成 + 落盘到指定目录
  //
  // API Key 的取值纪律：渲染层**不持有**明文（`req.config.apiKey` 传空串即可），
  // 真实 Key 由主进程从系统钥匙串解密后**在本地覆盖进 config**。
  handle('image:generate', imageGenInputSchema, async (req): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> => {
    const stored = await secretStore.get(SECRET_NAMES.imageGenApiKey)
    if (!stored.ok) {
      return { ok: false, error: `${stored.error}；请先在生图面板把 API Key 保存到系统钥匙串` }
    }
    const config: ImageGenConfig = { ...req.config, apiKey: stored.plaintext }
    const gen = await generateImage(config, req.prompt)
    if (!gen.ok) return { ok: false, error: gen.error }
    const saved = await saveImageFromUrl(gen.url, req.saveDir, req.filename)
    if (!saved.ok) return { ok: false, error: saved.error }
    return { ok: true, url: gen.url, path: saved.path }
  })
}
