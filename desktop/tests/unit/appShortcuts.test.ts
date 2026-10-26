import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APP_SHORTCUTS } from '../../src/shared/util/shortcuts'

/**
 * 快捷键清单与**实际注册**的一致性守护测试。
 *
 * ## 为什么必须有这个测试
 * `src/shared/util/shortcuts.ts` 是一份**手写清单**，而真正的注册在
 * `src/renderer/src/App.tsx` 的 keydown handler 里。两处各写各的，迟早漂移：
 * - 有人加了新快捷键但忘了更新面板 → 面板漏了一个键（用户按了没反应也不知道去哪看）；
 * - 有人把面板里的键抄成 旧版 的 35 条 → 32 个「按了没反应」的键被当承诺做广告。
 *
 * 本测试做**双向**校验（读源码文本的轻量一致性检查，不做 AST 解析——
 *  `App.tsx` 的 handler 结构简单，文本匹配足够且不会因格式变动而脆）：
 *
 * 1. **清单 → 代码**：每条清单项都能在 `App.tsx` 里找到它对应的**注册表达式**；
 * 2. **代码 → 清单**：`App.tsx` 的 keydown handler 里出现的每个键组合，
 *    都必须在本清单里出现（防「加了键忘了加面板」）。
 *
 * ⚠️ 匹配依赖 `App.tsx` keydown handler 的写法：若有人重写那个 handler（例如换成
 * `Ctrl+Alt+Z`），本测试会红 —— **那是正确行为**：那时必须同步更新
 * `shared/util/shortcuts.ts` 的清单（否则面板内容会与真实注册不一致）。
 */

/** 读取 `App.tsx` 源码（相对 cwd，vitest 在 `desktop/` 下运行） */
function readAppSource(): string {
  const candidates = [
    resolve(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'),
    resolve(process.cwd(), 'desktop', 'src', 'renderer', 'src', 'App.tsx')
  ]
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf-8')
    } catch {
      /* 试下一个候选路径 */
    }
  }
  throw new Error(`找不到 App.tsx（尝试过：${candidates.join(' / ')}）`)
}

/**
 * 抽出 keydown handler 的那一段（从 `const onKeyDown = (event: KeyboardEvent)` 起
 * 到该 effect 结束），避免误匹配到别的 `addEventListener('keydown', ...)`。
 */
function extractShortcutHandler(source: string): string {
  const anchor = "// 键盘快捷键"
  const anchorIndex = source.indexOf(anchor)
  expect(anchorIndex, 'App.tsx 里找不到「// 键盘快捷键」注释锚点').toBeGreaterThan(-1)
  const start = source.indexOf('const onKeyDown = (event: KeyboardEvent)', anchorIndex)
  expect(start, 'App.tsx 里找不到快捷键的 onKeyDown 处理函数').toBeGreaterThan(-1)
  const end = source.indexOf('}, [performUndo, performRedo])', start)
  expect(end, 'App.tsx 里找不到快捷键 effect 的结尾').toBeGreaterThan(-1)
  return source.slice(start, end)
}

/**
 * 清单项 → 必须出现在 handler 里的注册片段。
 *
 * 这张表是「清单与代码之间的契约」：新增快捷键时必须同时补上它的注册片段，
 * 否则本测试在「清单 → 代码」这一步就红。
 */
const REQUIRED_REGISTRATION_SNIPPETS: Record<string, readonly string[]> = {
  'Ctrl+Z': ["key === 'z' && !event.shiftKey", 'void performUndo()'],
  'Ctrl+Shift+Z': ["(key === 'z' && event.shiftKey) || key === 'y'", 'void performRedo()'],
  'Ctrl+Y': ["(key === 'z' && event.shiftKey) || key === 'y'", 'void performRedo()']
}

describe('快捷键清单（shared/util/shortcuts.ts）', () => {
  it('每条都在 App.tsx 里找到对应的实际注册', () => {
    const handler = extractShortcutHandler(readAppSource())
    for (const shortcut of APP_SHORTCUTS) {
      const snippets = REQUIRED_REGISTRATION_SNIPPETS[shortcut.keys]
      expect(snippets, `快捷键 ${shortcut.keys} 没有登记注册片段（新增快捷键需同步补这张表）`).toBeDefined()
      for (const snippet of snippets ?? []) {
        expect(handler.includes(snippet), `快捷键 ${shortcut.keys} 的注册片段「${snippet}」未出现在 keydown handler`).toBe(true)
      }
    }
  })

  it('反向：App.tsx handler 里判定的每个键都必须已在清单中（防止加了键忘了更新面板）', () => {
    const handler = extractShortcutHandler(readAppSource())

    // 从 handler 源码里**实际抽出**被判定的键位字母（形如 `key === 'z'`），
    // 而不是硬编码一张表 —— 硬编码的话，往 handler 里新加一个键就不会被发现。
    const judged = [...handler.matchAll(/key === '([a-z])'/g)].map((m) => m[1] as string)
    expect(judged.length, '没从 keydown handler 里解析出任何键位判定（handler 结构变了？）').toBeGreaterThan(0)

    // 清单里每个键位字母（去掉 Ctrl/Shift 等修饰前缀后的末段）
    const listedLetters = new Set(
      APP_SHORTCUTS.map((shortcut) => {
        const parts = shortcut.keys.split('+')
        return parts[parts.length - 1]?.toLowerCase() ?? ''
      })
    )

    const unlisted = [...new Set(judged)].filter((letter) => !listedLetters.has(letter))
    expect(
      unlisted,
      `App.tsx 的 keydown handler 判定了这些键，但 shared/util/shortcuts.ts 清单里没有：${unlisted.join('、')}。` +
        '请把它补进清单，否则用户在「快捷键参考」里看不到这个键。'
    ).toEqual([])
  })

  it('不含 旧版 独有、TS 未注册的键（不得照抄 shortcuts 的 35 条）', () => {
    const keys = APP_SHORTCUTS.map((s) => s.keys)
    // 逐个点名 旧版 DEFAULT_SHORTCUTS 里最容易被误抄、且 TS 侧确无实现的键
    const pyOnlyKeys = [
      'Ctrl+S', // 整文档保存（TS 刻意不做）
      'Ctrl+O', // 打开文件（TS 的「打开」走菜单，无全局键）
      'Ctrl+N',
      'Ctrl+Shift+S',
      'Ctrl+W',
      'Alt+F4',
      'Ctrl+X',
      'Ctrl+C',
      'Ctrl+V',
      'Ctrl+A',
      'Ctrl+F',
      'Ctrl+H',
      'Delete',
      'Ctrl+D',
      'F5',
      'F2',
      'Ctrl+Shift+F',
      'F7',
      'Ctrl+E',
      'Ctrl+I',
      'Ctrl+=',
      'Ctrl+-',
      'Ctrl+0',
      'F11',
      'Ctrl+T',
      'Ctrl+Space',
      'Ctrl+Shift+Space',
      'Ctrl+1',
      'Ctrl+2',
      'Ctrl+,',
      'Ctrl+PageUp',
      'Ctrl+PageDown'
    ]
    for (const key of pyOnlyKeys) {
      expect(keys, `清单不应出现 TS 未注册的键：${key}`).not.toContain(key)
    }
  })

  it('不含 Escape（属交互键「关闭浮层」，不是命令键，旧版 表里也没有）', () => {
    expect(APP_SHORTCUTS.map((s) => s.keys)).not.toContain('Escape')
  })

  it('规模与字段完整：3 条入口，每条都有键 / 动作 / 说明', () => {
    expect(APP_SHORTCUTS).toHaveLength(3)
    for (const shortcut of APP_SHORTCUTS) {
      expect(shortcut.keys).not.toBe('')
      expect(['undo', 'redo']).toContain(shortcut.action)
      expect(shortcut.description).not.toBe('')
    }
  })

  it('与状态栏快捷键提示一致（两处都只列真实注册的键）', () => {
    // App.tsx 的 statusbar-shortcuts 写死「Ctrl+Z 撤销 · Ctrl+Y 重做」，
    // 这里断言它的两条键都在清单里，避免状态栏与面板说法不一致。
    const source = readAppSource()
    const statusbarMatch = source.match(/data-testid="statusbar-shortcuts">\s*([\s\S]*?)\s*<\/span>/)
    expect(statusbarMatch, '找不到状态栏快捷键提示').not.toBeNull()
    const listed = new Set(APP_SHORTCUTS.map((s) => s.keys))
    expect(listed.has('Ctrl+Z')).toBe(true)
    expect(listed.has('Ctrl+Y')).toBe(true)
  })
})