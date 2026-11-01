// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { LocaleProvider, useT } from '@mobai/client-ui'

import { renderDom } from './render'

/**
 * `useT()` 的行为：无 Provider 回落中文；Provider 换成 en 后**立即**变英文。
 *
 * 为什么这条必须有：语言切换的整个价值就在"切了立刻生效"。如果 context 没接对，
 * 表现是"设置里改了、界面不动"，而单测里没有任何断言会红——只有这条会。
 */

function Probe() {
  const t = useT()
  return (
    <div data-testid="out">
      {t('common.ok')}|{t('agent.steps', { count: 3 })}
    </div>
  )
}

describe('client-ui i18n', () => {
  it('无 Provider ⇒ 回落中文默认值（不抛错）', async () => {
    const view = await renderDom(<Probe />)
    expect(view.byTestId('out').textContent).toBe('确定|3 步')
    await view.cleanup()
  })

  it('LocaleProvider en ⇒ 英文 + 插值', async () => {
    const view = await renderDom(
      <LocaleProvider locale="en">
        <Probe />
      </LocaleProvider>
    )
    expect(view.byTestId('out').textContent).toBe('OK|3 steps')
    await view.cleanup()
  })
})
