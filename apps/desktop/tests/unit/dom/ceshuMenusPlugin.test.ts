/**
 * 编辑器「更多」菜单插件（B 方案 Slice 16）。
 *
 * 覆盖：挂载点隔离（不进 App 顶栏）、条目数（20 + 3 分隔符）、死链守卫、E2E testid 保留。
 * 放在 `tests/unit/dom/` 是因为它 import 渲染层插件（`tsconfig.node.json` 不覆盖 `src/renderer`）。
 */
import { describe, expect, it } from 'vitest'

import { defineCeshuMenusPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginMenuItem } from '@mobai/shared/plugin/types'

function hostWithMenus(): PluginHost {
  const host = new PluginHost()
  host.register(defineCeshuViewsPlugin())
  host.register(defineCeshuMenusPlugin(host))
  return host
}

function isSeparator(item: PluginMenuItem): boolean {
  return item.command === undefined && item.items === undefined
}

describe('编辑器「更多」菜单插件（Slice 16）', () => {
  it('挂在 ceshu.toolbar 挂载点，不进 App 顶栏', () => {
    const host = hostWithMenus()
    expect(host.menus()).toEqual([]) // 默认 'app' 下没有它
    expect(host.menus('ceshu.toolbar')).toHaveLength(1)
    expect(host.menus('ceshu.toolbar')[0].menuKey).toBe('common.more')
  })

  it('20 个菜单项 + 3 个分隔符（4 组）', () => {
    const host = hostWithMenus()
    const items = host.menus('ceshu.toolbar')[0].items
    const real = items.filter((item) => !isSeparator(item))
    expect(real).toHaveLength(20)
    expect(items.length - real.length).toBe(3)
  })

  it('每个菜单项引用的命令都真实存在（死链守卫）', () => {
    const host = hostWithMenus()
    const ids = new Set(host.commands().map((command) => command.id))
    const missing: string[] = []
    for (const item of host.menus('ceshu.toolbar')[0].items) {
      if (item.command !== undefined && !ids.has(item.command)) missing.push(item.labelKey ?? item.label ?? item.command)
    }
    expect(missing).toEqual([])
  })

  it('E2E 依赖的 testid 全部保留', () => {
    const host = hostWithMenus()
    const testids = new Set(
      host.menus('ceshu.toolbar')[0].items.map((item) => item.testid).filter((id): id is string => id !== undefined)
    )
    for (const id of [
      'ceshu-derive',
      'ceshu-ai-review',
      'ceshu-preset-market',
      'ceshu-template-editor',
      'ceshu-route',
      'ceshu-health',
      'ceshu-readiness',
      'ceshu-autofill',
      'ceshu-diff',
      'ceshu-timeline',
      'ceshu-changelog',
      'ceshu-datarefs',
      'ceshu-migration-preview',
      'ceshu-consume-prompt',
      'ceshu-import-patch',
      'ceshu-export-project',
      'ceshu-export-handoff',
      'ceshu-start-ai-dev',
      'ceshu-work-board',
      'ceshu-notes'
    ]) {
      expect(testids.has(id), id).toBe(true)
    }
  })
})