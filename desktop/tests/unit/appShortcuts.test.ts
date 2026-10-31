import { describe, expect, it } from 'vitest'

import {
  APP_SHORTCUTS,
  APP_SHORTCUTS_STATUS_TEXT,
  matchShortcut,
  type ShortcutAction
} from '../../src/shared/util/ui'

/**
 * 快捷键清单（`src/shared/util/ui/shortcuts.ts`）的**行为**测试。
 *
 * ## 机制：清单是唯一事实源，漂移在结构上不可能发生
 * 以前这里是读 `App.tsx` 源码文本、用正则做「清单 ↔ 代码」双向校验 —— 那是脆耦合：
 * 只要有人重排/改写那个 effect（哪怕行为完全不变），测试就会红。
 *
 * 现在三处都从清单派生，没有任何一处手写键位：
 * - **实现**：`App.tsx` 的 keydown effect 调 `matchShortcut(event)`，按返回的 action 派发
 *   （本文件直接断言 `matchShortcut` 的输入/输出，不碰源码文本）；
 * - **状态栏**：渲染 `APP_SHORTCUTS_STATUS_TEXT`（本文件断言它由清单派生的结果）；
 * - **参考面板**：遍历 `APP_SHORTCUTS`。
 *
 * 于是「面板说有、按了没反应」这类漂移不再需要测试去比对两份文本 —— 只剩一份。
 * 这里保留的断言都是**结构与行为**：清单规模、字段完整、动作取值域，
 * 以及「清单里出现的每个动作都必须真的能被某个按键触发」。
 */

type ShortcutInput = Parameters<typeof matchShortcut>[0]

/** 构造一次按键输入（修饰键默认全 false；`altKey` 只是额外噪声，实现不看它） */
function key(
  k: string,
  modifiers: Partial<Pick<ShortcutInput, 'ctrlKey' | 'metaKey' | 'shiftKey'>> & { altKey?: boolean } = {}
): ShortcutInput & { altKey?: boolean } {
  return {
    key: k,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey
  }
}

describe('matchShortcut：按键 → 动作', () => {
  it('Ctrl+Z 撤销', () => {
    expect(matchShortcut(key('z', { ctrlKey: true }))).toBe('undo')
  })

  it('Cmd+Z（metaKey）同样撤销 —— macOS 与 Ctrl 同权', () => {
    expect(matchShortcut(key('z', { metaKey: true }))).toBe('undo')
  })

  it('Ctrl+Shift+Z 重做', () => {
    expect(matchShortcut(key('z', { ctrlKey: true, shiftKey: true }))).toBe('redo')
  })

  it('Ctrl+Y 重做（第二入口）', () => {
    expect(matchShortcut(key('y', { ctrlKey: true }))).toBe('redo')
  })

  it('裸 Z（无 Ctrl/Meta）不拦截，交还给输入框与浏览器', () => {
    expect(matchShortcut(key('z'))).toBeNull()
  })

  it('大写 Z（Shift 未按下但 key 为大写）也识别为撤销', () => {
    expect(matchShortcut(key('Z', { ctrlKey: true }))).toBe('undo')
  })

  it('Ctrl+Alt+Z 仍按 Ctrl+Z 处理（与历史内联实现一致：判定不看 altKey）', () => {
    // 刻意保持与迁移前逐字等价：AltGr 在部分键盘布局上会同时置位 ctrlKey+altKey，
    // 若这里返回 null，那些布局下撤销会静默失效。
    expect(matchShortcut(key('z', { ctrlKey: true, altKey: true }))).toBe('undo')
  })

  it('其它键 / 其它修饰组合返回 null', () => {
    expect(matchShortcut(key('x', { ctrlKey: true }))).toBeNull()
    expect(matchShortcut(key('s', { ctrlKey: true }))).toBeNull()
    expect(matchShortcut(key('a', { metaKey: true, shiftKey: true }))).toBeNull()
    expect(matchShortcut(key('y', { shiftKey: true }))).toBeNull()
  })
})

describe('快捷键清单（shared/util/ui/shortcuts.ts）', () => {
  it('规模：就是 3 条真实注册的绑定（不是旧版 35 条的移植）', () => {
    expect(APP_SHORTCUTS).toHaveLength(3)
  })

  it('字段完整：每条都有键 / 动作 / 说明', () => {
    for (const shortcut of APP_SHORTCUTS) {
      expect(shortcut.keys, '快捷键缺 keys').not.toBe('')
      expect(['undo', 'redo'], `快捷键 ${shortcut.keys} 的 action 越界`).toContain(shortcut.action)
      expect(shortcut.description, `快捷键 ${shortcut.keys} 缺 description`).not.toBe('')
    }
  })

  it('不含 Escape（交互键，不属命令键清单）', () => {
    expect(APP_SHORTCUTS.map((s) => s.keys)).not.toContain('Escape')
  })

  it('清单里出现的每个动作都真的能被某个按键触发（无「按了没反应」的条目）', () => {
    const triggered = new Set<ShortcutAction>()
    const samples: ShortcutInput[] = [
      key('z', { ctrlKey: true }),
      key('z', { ctrlKey: true, shiftKey: true }),
      key('y', { ctrlKey: true })
    ]
    for (const sample of samples) {
      const action = matchShortcut(sample)
      if (action !== null) triggered.add(action)
    }
    for (const shortcut of APP_SHORTCUTS) {
      expect(
        triggered.has(shortcut.action),
        `动作 ${shortcut.action}（${shortcut.keys}）没有对应的按键实现`
      ).toBe(true)
    }
  })

  it('每个动作恰有一个 primary 代表（状态栏只有一行）', () => {
    const actions = new Set(APP_SHORTCUTS.map((s) => s.action))
    const primaries = APP_SHORTCUTS.filter((s) => s.primary === true)
    expect(primaries.map((s) => s.action).sort()).toEqual([...actions].sort())
  })

  it('状态栏提示由清单派生，渲染文本保持原样', () => {
    expect(APP_SHORTCUTS_STATUS_TEXT).toBe('Ctrl+Z 撤销 · Ctrl+Y 重做')
  })
})
