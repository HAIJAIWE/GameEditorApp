/**
 * 技术设计文档面板 IPC。
 *
 * 复用 `system.tech_doc` 技能（`<库>/tech/<name>.md`）做 list/read/write/outline，
 * 导出走保存对话框。面板是产品侧 UI，直接调技能而非再写一套存储逻辑。
 */

import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'

import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import { techDocGenerateInputSchema, techDocNameInputSchema, techDocWriteInputSchema } from '@mobai/shared/schema/adapters'
import { parseTechDocSections, techDocSectionMaterials } from '@mobai/shared/agent/techDoc/techDocDraft'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { generateTechDocSectionTask } from '../techDoc/generateSection'

export function registerTechDocIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
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
  /**
   * 按节 AI 生成：把「当前策划书 + 文档里已写完的其它节」喂给提示词层，拿回本节正文。
   *
   * 素材取法：优先用**当前活跃的那份策划书**；没有活跃文档时仍可生成
   * （提示词层会出「暂无 GDD 素材，按工程常识给最小可行设计」的兜底）。
   * 「已写完的其它节」只取**已保存的文档正文**：渲染层未保存的编辑不参与，
   * 否则交叉引用会基于一个用户还没定稿的版本。
   */
  handle('techDoc:generate', techDocGenerateInputSchema, async (req, event) => {
    let doc: CeshuDocument | undefined
    try {
      const activeId = deps.ceshuManager.list().find((item) => item.isActive === true)?.id
      doc = activeId !== undefined ? deps.ceshuManager.get(activeId) : undefined
    } catch {
      // 库里没有策划书 / 文档损坏：按「无素材」生成，不该让整节失败
      doc = undefined
    }
    const materials = doc !== undefined ? techDocSectionMaterials(doc, req.sectionId) : []
    let written: Array<{ title: string; body: string }> = []
    if (req.name !== undefined) {
      const read = await run({ action: 'read', name: req.name })
      // 文档还不存在（第一次给新文档生成）属正常路径：read 失败就当没有「已写完的其它节」
      if (read.success) written = parseTechDocSections(read.message)
    }
    const gameName = doc !== undefined ? String(doc.meta.game_name ?? '') : ''
    return generateTechDocSectionTask(
      { llm, client: deps.llmClient },
      {
        gameName,
        sectionId: req.sectionId,
        materials,
        written,
        ...(req.extra !== undefined ? { extra: req.extra } : {}),
        confirmed: req.confirmed === true,
        senderId: event.sender.id
      }
    )
  })
}

