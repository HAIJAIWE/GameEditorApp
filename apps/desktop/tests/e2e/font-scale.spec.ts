import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 字号缩放必须覆盖整站文字。
 *
 * 回归背景：曾有 99 处 `font-size: Npx` 字面值不读 `--ui-font-scale`，
 * 而另外几百处走 `--text-*` 档位会跟随 —— 用户在设置面板调字号时
 * （10–21px ⇒ scale 0.77–1.62）界面会「一半放大、一半不动」。
 *
 * 用真实的 `.sidebar-item`（原本写死 14px）锁住行为：默认 14px，
 * scale=1.5 时应为 21px。这条在替换前是红的。
 */
test('调大字号时组件文字跟随缩放（不再有写死的 px）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-font-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const measured = await window.evaluate(async (): Promise<{ before: string; after: string; found: boolean }> => {
      const el = document.querySelector<HTMLElement>('.sidebar-item')
      if (el === null) return { before: '', after: '', found: false }
      const before = getComputedStyle(el).fontSize
      document.documentElement.style.setProperty('--ui-font-scale', '1.5')
      // 自定义属性级联要等一次样式重算；同一同步块里连读会拿到缓存值
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      const after = getComputedStyle(el).fontSize
      document.documentElement.style.removeProperty('--ui-font-scale')
      return { before, after, found: true }
    })

    expect(measured.found, '没有找到 .sidebar-item，检查选择器和首屏结构').toBe(true)
    expect(measured.before).toBe('14px')
    expect(measured.after).toBe('21px')
  } finally {
    await app.close()
  }
})
