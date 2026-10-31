/**
 * 组件测试的 DOM 渲染辅助（W2）。
 *
 * ## 为什么不用 @testing-library/react
 * 本项目只引入 `jsdom` 一个 devDependency（架构评估里「唯一可能新增」的那一个）。
 * 我们需要的能力很小 —— 挂载、点一下、按 `data-testid` 找节点、读文本 ——
 * 用 React 自带的 `createRoot` + `act` 就够，不必再背一个库和它的版本约束（React 19）。
 *
 * ## 两个容易踩的点
 * 1. `IS_REACT_ACT_ENVIRONMENT` 必须置 true，否则 React 19 会对 `act()` 报警告。
 * 2. `act` 只保证「本次更新」落定；组件在 effect 里发起的 `window.mbApi.*` 是 promise，
 *    其 `.then` 里的 `setState` 要再冲一次微任务队列才可见 —— 见 `flush()`。
 */

import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { createDefaultCeshu } from '../../../src/shared/ceshu/model'
import type { CeshuDocument } from '../../../src/shared/ceshu/reference'
import type { AppContextValue } from '../../../src/renderer/src/plugins/host'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/**
 * 面板测试用的 `AppContextValue`：默认全是空实现，按需覆盖。
 *
 * 为什么要有这个 helper：`AppContextValue` 会随插件化切片增长（Slice 6 加了 `handleDataCleared`），
 * 若每个测试都手写完整字面量，加一个字段就要改一圈测试。新增字段只改这里。
 */
export function appContextValue(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    types: [],
    setTypes: () => undefined,
    handleJump: () => undefined,
    refreshUndo: () => undefined,
    handleDataCleared: () => undefined,
    afterMutation: () => undefined,
    ...overrides
  }
}

export interface RenderResult {
  container: HTMLDivElement
  /** CSS 选择器查询（单个） */
  query: (selector: string) => HTMLElement | null
  /** CSS 选择器查询（全部） */
  queryAll: (selector: string) => HTMLElement[]
  /** 按 data-testid 取节点；取不到直接抛错（比断言 null 更容易定位问题） */
  byTestId: (id: string) => HTMLElement
  /** 容器内纯文本（用于「错误条/提示条是否出现」这类断言） */
  text: () => string
  /** 模拟点击并等待 React 与异步副作用落定 */
  click: (element: HTMLElement) => Promise<void>
  /**
   * 给受控输入框设值并触发 React 的 onChange（走原生 value setter，绕过 React 的值追踪），
   * 包 `act` 并等待更新落定。用于搜索框 / 表单这类受控输入。
   */
  change: (element: HTMLElement, value: string) => Promise<void>
  /**
   * 换 props 重渲染（同一个 root，保留组件内部 state）。
   *
   * 用于「外部 props 变化 → 组件反应」这类契约：新建 root 会把组件重挂，
   * 内部 state（搜索词、草稿）全丢，测出来的行为与真实使用不一致。
   */
  rerender: (element: ReactElement) => Promise<void>
  /** 等待挂载期 promise 链（如 `mbApi.ceshu.get`）落定 */
  flush: () => Promise<void>
  cleanup: () => Promise<void>
}

/** 冲一次微任务 + 一次宏任务，让 effect 里的 promise `.then` 跑完 */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/**
 * 向 `document` 派发一次 keydown。
 *
 * 必须包在 `act` 里：组件在监听器里 `setState`，裸派发会触发
 * 「An update to X inside a test was not wrapped in act(...)」并让断言跑在更新之前。
 */
export async function pressKey(key: string): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
  await flush()
}

export async function renderDom(element: ReactElement): Promise<RenderResult> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)

  await act(async () => {
    root.render(element)
  })
  await flush()

  return {
    container,
    query: (selector) => container.querySelector<HTMLElement>(selector),
    queryAll: (selector) => [...container.querySelectorAll<HTMLElement>(selector)],
    byTestId: (id) => {
      const found = container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
      if (found === null) throw new Error(`找不到 data-testid="${id}"`)
      return found
    },
    text: () => container.textContent ?? '',
    click: async (target) => {
      await act(async () => {
        target.click()
      })
      await flush()
    },
    change: async (target, value) => {
      const input = target as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await flush()
    },
    rerender: async (element) => {
      await act(async () => {
        root.render(element)
      })
      await flush()
    },
    flush,
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  }
}

/* ------------------------------------------------------------------ */
/* window.mbApi 桩                                                     */
/* ------------------------------------------------------------------ */

export interface ApiStubOptions {
  /** `ceshu.get` 返回的文档（`ceshu_id` 会被改成传入的 id 之外的值请自行设置） */
  doc?: CeshuDocument
  /** `ceshu.get` 抛错（用于错误条测试） */
  getError?: Error
  /** 覆盖任意通道：键形如 `'ceshu.autoFill'` */
  overrides?: Record<string, (...args: unknown[]) => unknown>
}

export interface ApiStub {
  /** 调用流水，形如 `ceshu.get`、`ceshu.autoFill` */
  calls: string[]
  restore: () => void
}

/**
 * 安装 `window.mbApi` 桩。
 *
 * 未显式覆盖的通道**不报错**，而是记流水后返回 `undefined` —— 这样「组件多调了一个
 * 我们没预料的通道」会体现为断言失败（calls 里多一条）而不是运行期崩溃，
 * 排查成本低得多。命名空间本身也是懒创建的 Proxy，故新增面板不会让整套桩失效。
 */
export function installMbApi(options: ApiStubOptions = {}): ApiStub {
  const calls: string[] = []
  const doc = options.doc ?? createDefaultCeshu({ scope: 'full', name: '测试项目' })
  const namespaces = new Map<string, Record<string, unknown>>()

  const recorder = (name: string, impl?: (...args: unknown[]) => unknown) => {
    return async (...args: unknown[]): Promise<unknown> => {
      calls.push(name)
      return impl === undefined ? undefined : impl(...args)
    }
  }

  const namespace = (name: string, seed: Record<string, unknown> = {}): Record<string, unknown> => {
    const existing = namespaces.get(name)
    if (existing !== undefined) return existing
    const created = new Proxy(seed, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined
        if (!(prop in target)) target[prop] = recorder(`${name}.${prop}`)
        return target[prop]
      }
    })
    namespaces.set(name, created)
    return created
  }

  // 常用通道先种上默认实现（返回形状要与真实契约一致，否则组件会二次报错）
  namespace('ceshu', {
    get: recorder('ceshu.get', () => {
      if (options.getError !== undefined) throw options.getError
      return doc
    }),
    autoFill: recorder('ceshu.autoFill', () => ({ doc, filled: 2 })),
    versions: recorder('ceshu.versions', () => []),
    changelog: recorder('ceshu.changelog', () => ({ entries: [] })),
    validate: recorder('ceshu.validate', () => []),
    // 核对面板挂载即自动核对（从生成面板返回后无需再手点），默认给一个合法的空结果，
    // 形状必须与 DataTableCheckResult 一致，否则组件会二次报错
    checkDataTables: recorder('ceshu.checkDataTables', () => ({ requirements: [], issues: [], ok: true })),
    saveChapter: recorder('ceshu.saveChapter', () => doc),
    setActive: recorder('ceshu.setActive', () => doc),
    notes: {
      list: recorder('ceshu.notes.list', () => []),
      add: recorder('ceshu.notes.add', () => ({})),
      update: recorder('ceshu.notes.update', () => ({})),
      delete: recorder('ceshu.notes.delete', () => ({}))
    },
    templates: {
      list: recorder('ceshu.templates.list', () => []),
      save: recorder('ceshu.templates.save', () => ({})),
      update: recorder('ceshu.templates.update', () => ({})),
      delete: recorder('ceshu.templates.delete', () => ({}))
    }
  })
  namespace('dialog', {
    chooseCeshuExportFile: recorder('dialog.chooseCeshuExportFile', () => ({ canceled: true })),
    chooseReportFile: recorder('dialog.chooseReportFile', () => ({ canceled: true }))
  })
  // 库条在菜单栏右侧角部件里常驻挂载，形状必须是 `{ libraries, active }`（见 IPC 契约）
  namespace('library', {
    list: recorder('library.list', () => ({ libraries: [], active: '' })),
    switch: recorder('library.switch', () => undefined)
  })

  for (const [channel, impl] of Object.entries(options.overrides ?? {})) {
    const [ns, method] = channel.split('.')
    if (ns === undefined || method === undefined) continue
    namespace(ns)[method] = recorder(channel, impl)
  }

  const api = new Proxy(
    {},
    {
      get(_target, prop) {
        return typeof prop === 'string' ? namespace(prop) : undefined
      }
    }
  )

  const host = window as unknown as { mbApi?: unknown }
  const previous = host.mbApi
  host.mbApi = api

  return {
    calls,
    restore: () => {
      host.mbApi = previous
      calls.length = 0
    }
  }
}
