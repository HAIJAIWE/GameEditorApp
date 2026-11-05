// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PermissionMenu } from '../../../src/renderer/src/components/digital'
import { installMbApi, renderDom, type ApiStub } from './render'

/**
 * 权限档位下拉的**提权风险确认**。
 *
 * 锁的是一条安全边界：切到「完全访问」不该点一下就生效 ——
 * 完全访问下删除文件、执行命令不再逐次询问，代价太大。
 * 其余档位（含从 full 降级）不受影响，仍然直接生效。
 */

let api: ApiStub | null = null

afterEach(() => {
  api?.restore()
  api = null
})

function stubMode(mode: 'readOnly' | 'ask' | 'full'): ApiStub {
  return installMbApi({
    overrides: {
      'agent.getPermissionMode': () => ({ mode }),
      'agent.setPermissionMode': () => ({ ok: true })
    }
  })
}

function modeCalls(stub: ApiStub): string[] {
  return stub.calls.filter((name) => name === 'agent.setPermissionMode')
}

async function openMenu(): Promise<Awaited<ReturnType<typeof renderDom>>> {
  const view = await renderDom(<PermissionMenu />)
  await view.click(view.byTestId('digital-permission-menu'))
  return view
}

function itemOf(view: Awaited<ReturnType<typeof renderDom>>, mode: string): HTMLElement {
  const found = view
    .queryAll('[data-testid="digital-permission-item"]')
    .find((element) => element.getAttribute('data-mode') === mode)
  if (found === undefined) throw new Error(`找不到权限档位 ${mode}`)
  return found
}

describe('权限档位 · 提权风险确认', () => {
  it('切到「完全」先出确认视图，不立即落盘', async () => {
    api = stubMode('readOnly')
    const view = await openMenu()
    expect(view.byTestId('digital-permission-menu').textContent).toContain('只读')

    await view.click(itemOf(view, 'full'))

    expect(view.query('[data-testid="digital-permission-risk"]')).not.toBeNull()
    expect(view.text()).toContain('开启完全访问？')
    expect(modeCalls(api)).toHaveLength(0)
    await view.cleanup()
  })

  it('未勾选「我已了解风险」时确认按钮不可用', async () => {
    api = stubMode('readOnly')
    const view = await openMenu()
    await view.click(itemOf(view, 'full'))

    const confirm = view.byTestId('digital-permission-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    await view.click(view.byTestId('digital-permission-ack'))
    expect((view.byTestId('digital-permission-confirm') as HTMLButtonElement).disabled).toBe(false)
    await view.cleanup()
  })

  it('勾选后确认才真正切到 full', async () => {
    api = stubMode('readOnly')
    const view = await openMenu()
    await view.click(itemOf(view, 'full'))
    await view.click(view.byTestId('digital-permission-ack'))
    await view.click(view.byTestId('digital-permission-confirm'))

    expect(modeCalls(api)).toHaveLength(1)
    expect(view.query('[data-testid="digital-permission-risk"]')).toBeNull()
    expect(view.byTestId('digital-permission-menu').textContent).toContain('完全')
    await view.cleanup()
  })

  it('取消不落盘、不改变当前档位', async () => {
    api = stubMode('readOnly')
    const view = await openMenu()
    await view.click(itemOf(view, 'full'))
    await view.click(view.byTestId('digital-permission-cancel'))

    expect(modeCalls(api)).toHaveLength(0)
    expect(view.query('[data-testid="digital-permission-risk"]')).toBeNull()
    expect(view.byTestId('digital-permission-menu').textContent).toContain('只读')
    await view.cleanup()
  })

  it('切到「询问」不需要确认（降级/非提权直接生效）', async () => {
    api = stubMode('readOnly')
    const view = await openMenu()
    await view.click(itemOf(view, 'ask'))

    expect(view.query('[data-testid="digital-permission-risk"]')).toBeNull()
    expect(modeCalls(api)).toHaveLength(1)
    await view.cleanup()
  })

  it('已经是 full 时再点 full 不弹确认', async () => {
    api = stubMode('full')
    const view = await openMenu()
    await view.click(itemOf(view, 'full'))

    expect(view.query('[data-testid="digital-permission-risk"]')).toBeNull()
    await view.cleanup()
  })
})
