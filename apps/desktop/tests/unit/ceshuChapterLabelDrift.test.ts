import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APP_CHAPTER_LABELS, APP_CHAPTER_NAMES } from '@mobai/shared/appSchema'
import { CHAPTER_LABELS, CHAPTER_NAMES } from '@mobai/shared/ceshu/reference'

/**
 * 守卫：**章节标签按档位分派**——游戏档编号式「N. 名称」，应用档纯主题式。
 *
 * 依据 `docs/game-doc-corpus-2026.md`（国内 25 + 国际 25 条游戏文档）：
 * 逐字读过的 11 份里编号派 5 / 主题派 4 / 同页并存 1 / 非模板 1；全 50 条口径 10:3。
 * 游戏策划案（正式交付物 / 可复制模板）多数用「第一章…第八章」或 `1./a./i.` 多级编号，
 * 用户拍板「跟多数人习惯」⇒ 游戏档恢复编号。
 * 应用档（SDD）仍用主题式，依据是 6 个软件文档原文（RFC/KEP/Google/ADR/PEP/ModelCard）。
 *
 * 分流维度是**文档载体**而非地域；同一产品两档不同是有意为之，不是漂移。
 *
 * 本守卫做三件事：
 *  1. 游戏档每个编号章的标签必须等于 `${chapterNumber}. ${name}`，meta 不带号；
 *  2. 应用档所有标签必须无前导编号；
 *  3. 扫描 `apps/desktop/src`，凡出现「<数字>. <已知章节名>」且数字与游戏章号不符即报
 *     （防止源码里硬编码错章号；历史对照注释加 `guard-allow-stale-label` 逃生口）。
 */

const SRC_ROOT = join(import.meta.dirname, '../../src')

/** 已知章节名（游戏 + 应用），按长度降序避免短名先匹配吞掉长名，转成正则分支 */
const NAME_SET = new Set([...Object.values(CHAPTER_NAMES), ...Object.values(APP_CHAPTER_NAMES)])
const NAME_ALTERNATION = [...NAME_SET]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

/** 标签是否带前导数字 */
function hasLeadingOrdinal(label: string): boolean {
  return /^\d+\.\s/.test(label)
}

/** 游戏章名 → 正确章号（由 CHAPTER_LABELS 反查，不另抄一份章号表） */
function gameOrdinals(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, label] of Object.entries(CHAPTER_LABELS)) {
    if (key === 'meta') continue
    const matched = /^(\d+)\.\s*(.+)$/.exec(label)
    if (matched !== null) map.set(matched[2]!.trim(), matched[1]!)
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

/** 扫描源码：只允许「数字与游戏章号一致」的写法；未知名字不误报 */
function scanForDrift(file: string, text: string, expected: Map<string, string>): string[] {
  const offenders: string[] = []
  const pattern = new RegExp(`(\\d+)\\.\\s*(${NAME_ALTERNATION})`, 'g')
  const lines = text.split('\n')
  for (const matched of text.matchAll(pattern)) {
    const [, ordinal, name] = matched
    const lineNo = text.slice(0, matched.index).split('\n').length
    if (lines[lineNo - 1]?.includes('guard-allow-stale-label')) continue
    const hit = name!.trim()
    const correct = expected.get(hit)
    if (correct !== undefined && correct !== ordinal) {
      offenders.push(`${file}:${lineNo} 写成「${ordinal}. ${hit}」，应为「${correct}. ${hit}」`)
    }
  }
  return offenders
}

describe('章节标签按档位分派守卫（游戏编号 / 应用主题式）', () => {
  const expected = gameOrdinals()

  it('游戏档：23 个编号章标签均为「N. 名称」，文档信息段不带号', () => {
    expect(expected.size).toBe(23)
    expect(CHAPTER_LABELS.meta).toBe(CHAPTER_NAMES.meta)
    expect(CHAPTER_LABELS.vision).toBe('1. 产品愿景')
    expect(CHAPTER_LABELS.systems).toBe('4. 游戏系统设计')
    expect(CHAPTER_LABELS.combat).toBe('5. 战斗系统设计')
    expect(CHAPTER_LABELS.performance).toBe('23. 性能与适配')
    for (const [key, label] of Object.entries(CHAPTER_LABELS)) {
      if (key === 'meta') continue
      const name = (CHAPTER_NAMES as Record<string, string>)[key]
      expect(label, `${key} 标签`).toBe(`${expected.get(name)}. ${name}`)
    }
  })

  it('应用档：全部标签无前导编号（软件文档原文口径）', () => {
    for (const [key, label] of Object.entries(APP_CHAPTER_LABELS)) {
      expect(hasLeadingOrdinal(label), `${key} 标签「${label}」不应带编号`).toBe(false)
    }
  })

  it('章节基础名 CHAPTER_NAMES / APP_CHAPTER_NAMES 本身不带编号', () => {
    for (const [key, name] of Object.entries(CHAPTER_NAMES)) {
      expect(hasLeadingOrdinal(name), `${key} 基础名`).toBe(false)
    }
    for (const [key, name] of Object.entries(APP_CHAPTER_NAMES)) {
      expect(hasLeadingOrdinal(name), `${key} 基础名`).toBe(false)
    }
  })

  it('src 下不存在写错章号的「N. <章节名>」', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_ROOT)) {
      offenders.push(...scanForDrift(file, readFileSync(file, 'utf-8'), expected))
    }
    expect(offenders, `发现章号漂移：\n${offenders.join('\n')}`).toEqual([])
  })

  it('自证有效：喂进错章号必须报出来，正确章号与纯主题标签不报', () => {
    const stale = [
      "const s = '在「5. 游戏系统设计」勾选要做的系统后'", // ← 错（游戏系统设计应为 4）
      '// 跳到 5. 战斗系统设计', // ← 正确 → 不报
      'const label = `商业化设计`', // ← 纯主题 → 不报
      "const quest = '1. 启程'" // ← 非章节名 → 不报
    ].join('\n')
    const found = scanForDrift('<synthetic>', stale, expected)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('写成「5. 游戏系统设计」')
    expect(found[0]).toContain('应为「4. 游戏系统设计」')
  })

  it('逃生口：带 guard-allow-stale-label 的行不报', () => {
    const text = '// 旧版此处写作「5. 游戏系统设计」 guard-allow-stale-label\n'
    expect(scanForDrift('<synthetic>', text, expected)).toEqual([])
  })
})
