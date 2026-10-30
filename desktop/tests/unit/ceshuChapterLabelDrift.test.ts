import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CHAPTER_LABELS, CHAPTER_NAMES } from '../../src/shared/ceshu/ceshuConstants'

/**
 * 守卫：**源码里不得出现与 CHAPTER_LABELS 不一致的硬编码章节标签**。
 *
 * 背景：分区制重组把章号整体改了（`systems` 从「第五章」变成「第四章」，
 * `what`/`worldview`+`characters` 并成 `story`…）。当时 src 里散落着几处手写的
 * 「第五章·游戏系统设计」（数据编辑器空态引导文案等），**typecheck / eslint / vitest 全绿也抓不到**
 * —— 因为没有任何断言读它们。实测是渲染截图才看出来的。
 *
 * 本守卫用「章节名 → 正确中文数字」反查：只要出现 `第<数字>章·<已知章节名>`，
 * 数字就必须与 CHAPTER_LABELS 一致。未知名字（如「第一章·启程」这类游戏内剧情名）直接跳过，
 * 避免误报。
 */

const SRC_ROOT = join(import.meta.dirname, '../../src')
const CHAPTER_NAME_SET = new Set(Object.values(CHAPTER_NAMES))

/** 从 `第<中文数字>章·<名字>` 里取正确数字，构造 名字 → 数字 反查表 */
function buildExpectedOrdinals(): Map<string, string> {
  const map = new Map<string, string>()
  for (const label of Object.values(CHAPTER_LABELS)) {
    const matched = /^第(.+)章·(.+)$/.exec(label)
    if (matched === null) continue
    map.set(matched[2]!, matched[1]!)
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
  const pattern = /第([一二三四五六七八九十]+)章·([^\s"'`）)]+)/g
  const lines = text.split('\n')
  for (const matched of text.matchAll(pattern)) {
    const [, ordinal, name] = matched
    const lineNo = text.slice(0, matched.index).split('\n').length
    // 逃生口：迁移/历史注释里需要**引用旧章号**作对照时，在那一行加
    // `guard-allow-stale-label` 标记即可（仅限注释里的历史说明，不得用于用户可见文案）。
    if (lines[lineNo - 1]?.includes('guard-allow-stale-label')) continue
    // 截断到已知章节名可能的最长长度再比对（正则贪婪会把尾随标点/文字吃进来）
    const name_ = name!
    const hit = [...CHAPTER_NAME_SET].find((n) => name_.startsWith(n))
    if (hit === undefined) continue // 非策划书章节名（如「启程」），跳过
    if (expected.get(hit) !== ordinal) {
      offenders.push(`${file}:${lineNo} 写成「第${ordinal}章·${hit}」，应为「第${expected.get(hit)}章·${hit}」`)
    }
  }
  return offenders
}

describe('硬编码章节标签守卫（分区重组后防回归）', () => {
  const expected = buildExpectedOrdinals()

  it('反查表自身健全：全部编号章（P2 后 23 章）均可从 CHAPTER_LABELS 解析出章号，且 meta 不参与', () => {
    expect(expected.size).toBe(23)
    expect(expected.get('产品愿景')).toBe('一')
    expect(expected.get('世界观与角色')).toBe('二')
    expect(expected.get('游戏系统设计')).toBe('四')
    expect(expected.get('战斗系统设计')).toBe('五')
    expect(expected.get('可访问性与本地化')).toBe('十六')
    expect(expected.get('UI/UX 交互设计')).toBe('十七')
    expect(expected.get('性能与适配')).toBe('二十三')
    expect(expected.has('文档信息')).toBe(false)
  })

  it('src 下不存在「第N章·<章节名>」写法与 CHAPTER_LABELS 冲突的地方', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_ROOT)) {
      offenders.push(...scanForDrift(file, readFileSync(file, 'utf-8'), expected))
    }

    expect(offenders, `发现硬编码章节标签漂移：\n${offenders.join('\n')}`).toEqual([])
  })

  it('自证有效：喂进「第五章·游戏系统设计」这类真实历史缺陷时必须报出来，且不误伤正确标签', () => {
    // 这条防的是「守卫永远为绿」——没有它，上面那条断言可能因为正则写错而恒过。
    const stale = [
      "const s = '在「第五章·游戏系统设计」勾选要做的系统后'", // ← 真实缺陷（应为第四章）
      '// 跳到第五章·战斗系统设计', // ← 正确（combat 就是第五章）→ 不该报
      'const label = `第十五章·商业化设计`', // ← 正确 → 不该报
      "const quest = '第一章·启程'" // ← 非策划书章节名 → 不该报
    ].join('\n')
    const found = scanForDrift('<synthetic>', stale, expected)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('写成「第五章·游戏系统设计」')
    expect(found[0]).toContain('应为「第四章·游戏系统设计」')
  })

  it('逃生口：带 guard-allow-stale-label 的行不报（供迁移注释引用旧章号）', () => {
    const text = "// 旧版此处写作「第五章·游戏系统设计」 guard-allow-stale-label\n"
    expect(scanForDrift('<synthetic>', text, expected)).toEqual([])
  })

  it('用户可见文案里的章号也走同一守卫（防止只在注释里改对、文案里留错）', () => {
    // 反向断言：确认「游戏系统」章确实是第四章 —— 这条是上面那条的具体化样本，
    // 一旦有人只改注释不改文案，上面的通用扫描就会报出来。
    expect(CHAPTER_LABELS.systems).toBe('第四章·游戏系统设计')
  })
})
