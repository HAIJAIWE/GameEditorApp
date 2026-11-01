/**
 * `system.browser` 内置技能（对齐 dsh `browser-use` 的可用子集，**不用 Playwright**）。
 *
 * 两种用法：
 * - `open`：用系统默认浏览器打开 URL（给人看）；
 * - `read` / `eval` / `screenshot`：用**隐藏 BrowserWindow** 加载页面后取正文/执行 JS/截图
 *   （给智能体用，等价于 browser-use 的读页与交互）。
 *
 * 安全：仅 http/https；`open/read/screenshot` = NETWORK，`eval`（页面执行任意 JS）= SYSTEM（每次审批）。
 * 依赖可注入（测试不碰 electron）。
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'

/** 输出上限（字符） */
export const BROWSER_MAX_CHARS = 200_000

const ACTIONS = ['open', 'read', 'eval', 'screenshot'] as const

export interface BrowserSkillOptions {
  /** 截图目录（`<工作区>/.mb-shots`） */
  root?: () => string
  /** 打开外部链接（缺省 Electron shell.openExternal） */
  openExternal?: (url: string) => Promise<void>
  /** 加载页面取标题/正文/HTML（缺省隐藏 BrowserWindow） */
  loadPage?: (url: string) => Promise<{ title: string; text: string; html: string }>
  /** 加载页面后执行 JS（缺省隐藏 BrowserWindow） */
  evalPage?: (url: string, code: string) => Promise<unknown>
  /** 加载页面并截图（缺省隐藏 BrowserWindow） */
  screenshotPage?: (url: string, path: string) => Promise<void>
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

function cap(text: string): string {
  return text.length <= BROWSER_MAX_CHARS ? text : `${text.slice(0, BROWSER_MAX_CHARS)}\n…（截断）`
}

export function createBrowserSkill(options: BrowserSkillOptions = {}): SkillProtocol {
  // 懒加载 electron 实现：测试注入时完全不碰 electron
  const openExternal =
    options.openExternal ??
    (async (url: string): Promise<void> => {
      const { shell } = await import('electron')
      await shell.openExternal(url)
    })
  const loadPage =
    options.loadPage ??
    (async (url: string) => (await import('../browser/browserWindow')).loadPage(url))
  const evalPage =
    options.evalPage ??
    (async (url: string, code: string) => (await import('../browser/browserWindow')).evalPage(url, code))
  const screenshotPage =
    options.screenshotPage ??
    (async (url: string, path: string) => (await import('../browser/browserWindow')).screenshotPage(url, path))

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return fail(`未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, 'EBADACTION')
    }
    const url = typeof params.url === 'string' ? params.url.trim() : ''
    if (url === '') return fail('缺少 url', 'EBADARG')
    if (!isOpenableUrl(url)) return fail(`只支持 http/https 的合法 URL：${url}`, 'EBADURL')

    try {
      if (action === 'open') {
        await openExternal(url)
        return { success: true, message: `已在系统浏览器打开：${url}`, data: { url } }
      }

      if (action === 'read') {
        const page = await loadPage(url)
        const body = `# ${page.title || url}\n\n${page.text}`
        return { success: true, message: cap(body), data: { title: page.title, chars: page.text.length } }
      }

      if (action === 'eval') {
        const code = typeof params.code === 'string' ? params.code : ''
        if (code.trim() === '') return fail('eval 需要 code', 'EBADARG')
        const result = await evalPage(url, code)
        const json = typeof result === 'string' ? result : JSON.stringify(result)
        return { success: true, message: cap(json), data: { result } }
      }

      // screenshot
      const root = options.root?.() ?? ''
      if (root === '') return fail('未配置截图目录', 'EBADARG')
      const dir = join(root, '.mb-shots')
      mkdirSync(dir, { recursive: true })
      const fileName = `${Date.now()}-browser.png`
      await screenshotPage(url, join(dir, fileName))
      return { success: true, message: `已截图：.mb-shots/${fileName}（相对工作区）`, data: { file: fileName } }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EBROWSER')
    }
  }

  return {
    id: 'system.browser',
    description:
      '浏览器（不用 Playwright）：open=系统浏览器打开 / read=隐藏窗口加载并取标题+正文 / '
      + 'eval=加载后在页面执行 JS（点击/填表/取值）/ screenshot=加载后截图（存 .mb-shots）。'
      + '仅 http/https；eval 为 SYSTEM 风险（每次审批）。',
    version: '0.2.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        url: { type: 'string', description: 'http/https URL' },
        code: { type: 'string', description: 'eval 时在页面执行的 JS（表达式或语句，返回可 JSON 化的值）' }
      },
      required: ['action', 'url']
    },
    tags: ['system', 'browser'],
    execute: run
  }
}
