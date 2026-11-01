/**
 * 技术设计文档面板 IPC。
 *
 * 复用 `system.tech_doc` 技能（`<库>/tech/<name>.md`）做 list/read/write/outline，
 * 导出走保存对话框。面板是产品侧 UI，直接调技能而非再写一套存储逻辑。
 */

import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { techDocNameInputSchema, techDocWriteInputSchema } from '@mobai/shared/schema/adapters'

export function registerTechDocIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const run = (params: Record<string, unknown>): Promise<import('@mobai/shared/agent/config').SkillResult> =>
    deps.agentDispatcher.execute('system.tech_doc', params, {})

  handle('techDoc:list', undefined, async () => {
    const result = await run({ action: 'list' })
    const docs = (result.data as { docs?: string[] } | undefined)?.docs ?? []
    return { docs }
  })

  handle('techDoc:outline', undefined, async () => {
    const result = await run({ action: 'outline' })
    return { content: result.success ? result.message : '' }
  })

  handle('techDoc:read', techDocNameInputSchema, async (req) => {
    const result = await run({ action: 'read', name: req.name })
    if (!result.success) throw new Error(result.error ?? result.message)
    return { content: result.message }
  })

  handle('techDoc:write', techDocWriteInputSchema, async (req) => {
    const result = await run({ action: 'write', name: req.name, content: req.content })
    if (!result.success) throw new Error(result.error ?? result.message)
    return { ok: true }
  })

  handle('techDoc:delete', techDocNameInputSchema, async (req) => {
    const result = await run({ action: 'delete', name: req.name })
    if (!result.success) throw new Error(result.error ?? result.message)
    return { ok: true }
  })

  handle('techDoc:export', techDocNameInputSchema, async (req) => {
    const read = await run({ action: 'read', name: req.name })
    if (!read.success) throw new Error(read.error ?? read.message)
    const options: SaveDialogOptions = {
      title: '导出技术设计文档',
      defaultPath: `${req.name}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { path: null }
    await writeFile(result.filePath, read.message, 'utf8')
    return { path: result.filePath }
  })
}
