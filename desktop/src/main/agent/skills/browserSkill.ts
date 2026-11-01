/**
 * `system.browser` 内置技能（对齐 dsh `browser-use` 的**最小可用子集**）：用系统默认浏览器打开一个 URL。
 *
 * dsh 的 browser-use 是 Playwright 驱动（导航/点击/截图/取文本）；我们**没有运行时 Playwright**，
 * 故只做「打开 URL 给人看」这一档。**读取页面内容请用 `system.web_fetch`**（已实现）。
 *
 * 安全：仅 http/https；风险 NETWORK（审批）；`openExternal` 可注入便于单测。
 */

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'

export interface BrowserSkillOptions {
  /** 打开外部链接（缺省用 Electron shell.openExternal；测试可注入） */
  openExternal?: (url: string) => Promise<void>
}

/** URL 是否可交给系统浏览器打开（仅 http/https） */
export function isOpenableUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `browser 失败：${message}`, error }
}

export function createBrowserSkill(options: BrowserSkillOptions = {}): SkillProtocol {
  // 懒加载 electron：单测注入 openExternal 时完全不碰 electron
  const openExternal =
    options.openExternal ??
    (async (url: string): Promise<void> => {
      const { shell } = await import('electron')
      await shell.openExternal(url)
    })

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'open') {
      return fail(`未知 action: ${action}（当前仅支持 open；读页面请用 system.web_fetch）`, 'EBADACTION')
    }
    const url = typeof params.url === 'string' ? params.url.trim() : ''
    if (url === '') return fail('缺少 url', 'EBADARG')
    if (!isOpenableUrl(url)) return fail(`只支持 http/https 的合法 URL：${url}`, 'EBADURL')

    try {
      await openExternal(url)
      return { success: true, message: `已在系统浏览器打开：${url}`, data: { url } }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EOPEN')
    }
  }

  return {
    id: 'system.browser',
    description:
      '用系统默认浏览器打开一个 URL（仅 http/https）。这是 browser-use 的最小档——'
      + '不驱动页面交互；读取网页内容请用 system.web_fetch。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['open'], description: '操作类型: open=打开' },
        url: { type: 'string', description: 'http/https URL' }
      },
      required: ['action', 'url']
    },
    tags: ['system', 'browser'],
    execute: run
  }
}
