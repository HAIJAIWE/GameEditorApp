import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CHAPTER_LABELS, CHAPTER_NAMES } from '@mobai/shared/ceshu/reference'

/**
 * 守卫：**源码里不得出现与 CHAPTER_LABELS 不一致的硬编码章节标签**。
 *
 * 章节标签现为「N. 名称」（如「5. 战斗系统设计」）。历史上源里散落过手写章号
 * （数据编辑器空态引导文案等），typecheck / eslint / vitest 全绿也抓不到——因为没有断言读它们。
 *
 * 本守卫用「章节名 → 正确数字」反查：源码里出现 `<数字>. <已知章节名>` 时，数字必须与
 * CHAPTER_LABELS 一致。未知名字（如「1. 启程」这类游戏内剧情名）不匹配，避免误报。
 */

const SRC_ROOT = join(import.meta.dirname, '../../src')
const CHAPTER_NAME_SET = new Set(Object.values(CHAPTER_NAMES))

/** 已知章节名（按长度降序，避免短名先匹配吞掉长名），转成正则分支 */
const NAME_ALTERNATION = [...CHAPTER_NAME_SET]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

/** 从 `N. 名称` 里取正确数字，构造 名称 → 数字 反查表 */
function buildExpectedOrdinals(): Map<string, string> {
  const map = new Map<string, string>()
  for (const label of Object.values(CHAPTER_LABELS)) {
    const matched = /^(\d+)\.\s*(.+)$/.exec(label)
    if (matched === null) continue
    map.set(matched[2]!.trim(), matched[1]!)
  }
  return map
}

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/** 扫描一段源码文本，返回漂移描述（file 仅用于报错定位） */
function scanForDrift(file: string, text: string, expected: Map<string, string>): string[] {
  const offenders: string[] = []
  const pattern = new RegExp(`(\\d+)\\.\\s*(${NAME_ALTERNATION})`, 'g')
  const lines = text.split('\n')
  for (const matched of text.matchAll(pattern)) {
    const [, ordinal, name] = matched
    const lineNo = text.slice(0, matched.index).split('\n').length
    // 逃生口：迁移/历史注释里需要**引用旧章号**作对照时，在那一行加
    // `guard-allow-stale-label` 标记即可（仅限注释里的历史说明，不得用于用户可见文案）。
    if (lines[lineNo - 1]?.includes('guard-allow-stale-label')) continue
    const hit = name!.trim()
    if (expected.get(hit) !== ordinal) {
      offenders.push(`${file}:${lineNo} 写成「${ordinal}. ${hit}」，应为「${expected.get(hit)}. ${hit}」`)
    }
  }
  return offenders
}

describe('硬编码章节标签守卫（编号小节式「N. 名称」）', () => {
  const expected = buildExpectedOrdinals()

  it('反查表自身健全：全部编号章（23 章）均可从 CHAPTER_LABELS 解析出章号，且 meta 不参与', () => {
    expect(expected.size).toBe(23)
    expect(expected.get('产品愿景')).toBe('1')
    expect(expected.get('世界观与角色')).toBe('2')
    expect(expected.get('游戏系统设计')).toBe('4')
    expect(expected.get('战斗系统设计')).toBe('5')
    expect(expected.get('可访问性与本地化')).toBe('16')
    expect(expected.get('UI/UX 交互设计')).toBe('17')
    expect(expected.get('性能与适配')).toBe('23')
    expect(expected.has('文档信息')).toBe(false)
  })

  it('src 下不存在「N. <章节名>」写法与 CHAPTER_LABELS 冲突的地方', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_ROOT)) {
      offenders.push(...scanForDrift(file, readFileSync(file, 'utf-8'), expected))
    }

    expect(offenders, `发现硬编码章节标签漂移：\n${offenders.join('\n')}`).toEqual([])
  })

  it('自证有效：喂进「5. 游戏系统设计」这类错误章号必须报出来，且不误伤正确标签', () => {
    // 这条防的是「守卫永远为绿」——没有它，上面那条断言可能因为正则写错而恒过。
    const stale = [
      "const s = '在「5. 游戏系统设计」勾选要做的系统后'", // ← 错误（游戏系统设计应为 4）
      '// 跳到 5. 战斗系统设计', // ← 正确（combat 就是第 5 章）→ 不该报
      'const label = `15. 商业化设计`', // ← 正确 → 不该报
      "const quest = '1. 启程'" // ← 非策划书章节名 → 不该报
    ].join('\n')
    const found = scanForDrift('<synthetic>', stale, expected)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('写成「5. 游戏系统设计」')
    expect(found[0]).toContain('应为「4. 游戏系统设计」')
  })

  it('逃生口：带 guard-allow-stale-label 的行不报（供迁移注释引用旧章号）', () => {
    const text = '// 旧版此处写作「5. 游戏系统设计」 guard-allow-stale-label\n'
    expect(scanForDrift('<synthetic>', text, expected)).toEqual([])
  })

  it('用户可见文案里的章号也走同一守卫（防止只在注释里改对、文案里留错）', () => {
    expect(CHAPTER_LABELS.systems).toBe('4. 游戏系统设计')
  })
})
