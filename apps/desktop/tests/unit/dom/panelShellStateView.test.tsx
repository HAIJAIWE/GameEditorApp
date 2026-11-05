// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { LocaleProvider } from '@mobai/client-ui'
import { PluginHost } from '@mobai/shared/plugin/host'

import { PanelShell, StateView } from '../../../src/renderer/src/components/common'
import { AppContextProvider, HostPanel } from '../../../src/renderer/src/plugins/host'
import { defineSessionHistoryPlugin } from '../../../src/renderer/src/plugins/session'
import { appContextValue, installMbApi, renderDom, type RenderResult } from './render'

/**
 * Phase A 原语：`PanelShell`（统一内容外壳）与 `StateView`（空/载/错三态）。
 *
 * 这两件是「27 个面板各写各的外壳」的收敛点。测试钉住三件事：
 * 1. 外壳不渲染标题/关闭（那是 `AppPanelOverlay` 的职责），只渲染 toolbar/body/footer；
 * 2. 三态的默认文案与 `role` 正确，且可被覆盖；
 * 3. 迁移后的会话历史面板**读失败会显示错误态**（修掉原先 `catch {}` 的静默）。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function tree(host: PluginHost, panelId: string) {
  return (
    <AppContextProvider value={appContextValue()}>
      <HostPanel host={host} panelId={panelId} onClose={() => undefined} />
    </AppContextProvider>
  )
}

describe('PanelShell', () => {
  it('渲染 testId / toolbar / body / footer，data-scroll 默认为 true', async () => {
    view = await renderDom(
      <LocaleProvider locale="zh">
        <PanelShell testId="ps" toolbar={<span>TB</span>} footer={<button type="button">OK</button>}>
          <p>BODY</p>
        </PanelShell>
      </LocaleProvider>
    )
    expect(view.byTestId('ps')).toBeTruthy()
    expect(view.text()).toContain('TB')
    expect(view.text()).toContain('BODY')
    expect(view.text()).toContain('OK')
    expect(view.query('.panel-shell-body')?.getAttribute('data-scroll')).toBe('true')
    // 外壳不画窗口标题：标题/关闭由浮层负责，避免双重外壳
    expect(view.query('.panel-shell-title')).toBeNull()
    expect(view.query('[data-testid="panel-close"]')).toBeNull()
  })

  it('scroll=false 时正文不滚动，且空的 toolbar/footer 不渲染', async () => {
    view = await renderDom(
      <LocaleProvider locale="zh">
        <PanelShell scroll={false}>
          <p>BODY</p>
        </PanelShell>
      </LocaleProvider>
    )
    expect(view.query('.panel-shell-body')?.getAttribute('data-scroll')).toBe('false')
    expect(view.query('.panel-shell-toolbar')).toBeNull()
    expect(view.query('.panel-shell-footer')).toBeNull()
  })
})

describe('StateView', () => {
  it('三种默认标题（zh）与 role', async () => {
    view = await renderDom(
      <LocaleProvider locale="zh">
        <>
          <StateView kind="empty" testId="s-empty" />
          <StateView kind="loading" testId="s-loading" />
          <StateView kind="error" testId="s-error" />
        </>
      </LocaleProvider>
    )
    expect(view.byTestId('s-empty').textContent).toContain('暂无内容')
    expect(view.byTestId('s-loading').textContent).toContain('加载中')
    expect(view.byTestId('s-error').textContent).toContain('加载失败')
    expect(view.byTestId('s-error').getAttribute('role')).toBe('alert')
    expect(view.byTestId('s-loading').getAttribute('aria-live')).toBe('polite')
  })

  it('自定义标题 / 说明 / 动作', async () => {
    view = await renderDom(
      <LocaleProvider locale="zh">
        <StateView
          kind="empty"
          title="没有会话"
          description="去开一个"
          action={<button type="button">新建</button>}
        />
      </LocaleProvider>
    )
    expect(view.text()).toContain('没有会话')
    expect(view.text()).toContain('去开一个')
    expect(view.text()).toContain('新建')
  })
})

describe('会话历史面板（Phase A 迁移）', () => {
  it('读失败显示错误态与重试，不再静默伪装成空', async () => {
    const host = new PluginHost()
    host.register(defineSessionHistoryPlugin(host))
    api = installMbApi({
      overrides: {
        'agent.sessionTurns': () => {
          throw new Error('boom')
        },
        'agent.draftList': () => []
      }
    })
    host.openPanel('sessionHistory.panel')
    view = await renderDom(tree(host, 'sessionHistory.panel'))
    await view.flush()

    expect(view.byTestId('session-history-panel')).toBeTruthy()
    expect(view.text()).toContain('加载失败')
    expect(view.text()).toContain('boom')
    expect(view.text()).toContain('重试')
  })
})
