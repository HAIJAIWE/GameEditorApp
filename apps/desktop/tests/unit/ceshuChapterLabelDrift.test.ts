import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APP_CHAPTER_LABELS, APP_CHAPTER_NAMES } from '@mobai/shared/appSchema'
import { CHAPTER_LABELS, CHAPTER_NAMES } from '@mobai/shared/ceshu/reference'

/**
 * 守卫：**章节标签必须是纯主题式，源码与常量里不得出现编号章节式「N. 名称」。**
 *
 * 依据（`docs/template-crosscheck-real-docs.md`）：真实设计/决策文档（Rust RFC / K8s KEP /
 * Google 设计文档 / MADR ADR / PEP / Model Card）一律用 Context、Goals、Design 这类主题小标题，
 * 不编号成章。故游戏 `CHAPTER_LABELS` 与应用 `APP_CHAPTER_LABELS` 都应是纯主题名（如「战斗系统设计」），
 * 不带「N. 」前缀；导出标题与目录也不再叠加章号。
 *
 * 本守卫做两件事：
 *  1. 断言两套标签值都没有前导「N. 」；
 *  2. 扫描 `apps/desktop/src` 源码，凡出现「<数字>. <已知章节名>」即报——防止有人又把编号写回
 *     （含用户可见文案与注释；历史对照注释加 `guard-allow-stale-label` 逃生口）。
 */

const SRC_ROOT = join(import.meta.dirname, '../../src')

/** 已知章节名（游戏 + 应用），按长度降序避免短名先匹配吞掉长名，转成正则分支 */
const NAME_SET = new Set([...Object.values(CHAPTER_NAMES), ...Object.values(APP_CHAPTER_NAMES)])
const NAME_ALTERNATION = [...NAME_SET]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

/** 标签是否带前导数字（用于断言标签不应出现） */
function hasLeadingOrdinal(label: string): boolean {
  return /^\d+\.\s/.test(label)
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

/** 扫描一段源码文本，返回编号章节式标签的漂移描述（file 仅用于报错定位） */
function scanForNumberedLabel(file: string, text: string): string[] {
  const offenders: string[] = []
  const pattern = new RegExp(`(\\d+)\\.\\s*(${NAME_ALTERNATION})`, 'g')
  const lines = text.split('\n')
  for (const matched of text.matchAll(pattern)) {
    const [, ordinal, name] = matched
    const lineNo = text.slice(0, matched.index).split('\n').length
    // 逃生口：迁移/历史注释里需要**引用旧编号**作对照时，在那一行加
    // `guard-allow-stale-label` 标记即可（仅限注释里的历史说明，不得用于用户可见文案）。
    if (lines[lineNo - 1]?.includes('guard-allow-stale-label')) continue
    offenders.push(`${file}:${lineNo} 出现编号章节式标签「${ordinal}. ${name}」——标签应为纯主题式「${name}」`)
  }
  return offenders
}

describe('章节标签纯主题式守卫（无「N. 名称」编号）', () => {
  it('游戏 CHAPTER_LABELS 全部不带前导编号', () => {
    for (const [key, label] of Object.entries(CHAPTER_LABELS)) {
      expect(hasLeadingOrdinal(label), `${key} 标签「${label}」不应带「N. 」前缀`).toBe(false)
    }
  })

  it('应用 APP_CHAPTER_LABELS 全部不带前导编号', () => {
    for (const [key, label] of Object.entries(APP_CHAPTER_LABELS)) {
      expect(hasLeadingOrdinal(label), `${key} 标签「${label}」不应带「N. 」前缀`).toBe(false)
    }
  })

  it('章节基础名 CHAPTER_NAMES / APP_CHAPTER_NAMES 本身也不带编号', () => {
    for (const [key, name] of Object.entries(CHAPTER_NAMES)) {
      expect(hasLeadingOrdinal(name), `${key} 基础名「${name}」不应带「N. 」前缀`).toBe(false)
    }
    for (const [key, name] of Object.entries(APP_CHAPTER_NAMES)) {
      expect(hasLeadingOrdinal(name), `${key} 基础名「${name}」不应带「N. 」前缀`).toBe(false)
    }
  })

  it('src 下不存在「N. <章节名>」写法（防止再把编号写回源码）', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_ROOT)) {
      offenders.push(...scanForNumberedLabel(file, readFileSync(file, 'utf-8')))
    }
    expect(offenders, `发现编号章节式标签：\n${offenders.join('\n')}`).toEqual([])
  })

  it('自证有效：喂进「5. 游戏系统设计」这类编号写法必须报出来，且不误伤纯主题标签', () => {
    // 这条防的是「守卫永远为绿」——没有它，上面那条断言可能因为正则写错而恒过。
    const stale = [
      "const s = '在「5. 游戏系统设计」勾选要做的系统后'", // ← 编号写法 → 必须报
      '// 跳到 游戏系统设计', // ← 纯主题 → 不该报
      'const label = `商业化设计`', // ← 纯主题 → 不该报
      "const quest = '1. 启程'" // ← 非策划书章节名 → 不该报
    ].join('\n')
    const found = scanForNumberedLabel('<synthetic>', stale)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('「5. 游戏系统设计」')
  })

  it('逃生口：带 guard-allow-stale-label 的行不报（供迁移注释引用旧编号）', () => {
    const text = '// 旧版此处写作「5. 游戏系统设计」 guard-allow-stale-label\n'
    expect(scanForNumberedLabel('<synthetic>', text)).toEqual([])
  })
})
