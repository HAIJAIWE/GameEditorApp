import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { zh } from '@mobai/shared/i18n'

/**
 * i18n 占位符守卫：`t('key', {…})` 必须给齐模板里的 `{name}` 参数。
 *
 * ## 为什么需要（而不是靠肉眼）
 * 2026-11-09 真实前端实测看到质量门告警是「…倒退：{sections}，建议重生成」——
 * 文案模板写 `{sections}`、调用处传 `chapters`，插值按设计「缺参保留原样」，
 * 于是**界面上直接印出一个大括号占位符**。这不是崩溃，所以没人报错、没人测出来：
 * 52 处调用里 15 处参数名对不上（chapter/section、chapters/sections 两类）。
 *
 * ## 判据
 * 只做一件事：把 `zh` 基准表里每条文案的 `{参数}` 抽出来，和调用处的**对象键**比对。
 * - 只认字面量键（`t('k')`）；动态键无从静态检查，跳过；
 * - 参数对象可以是 `{ a, b }` 简写或 `{ a: x }`，两种都算提供；
 * - 多给参数不报错（多传只是没用上），**少给才报错**——少给就是界面上多一个 `{x}`。
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')

const SCAN_ROOTS = ['apps/desktop/src/renderer/src', 'packages/client-ui/src']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name)) out.push(full)
  }
  return out
}

/** 从 `open`（指向 `{`）开始找配对的 `}`（忽略字符串/模板字符串内的括号，够用即可） */
function matchingBrace(source: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (quote !== null) {
      if (char === '\\') i += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 对象字面量里出现的键（`a` 简写与 `a: …` 都算） */
function objectKeys(source: string): string[] {
  const keys = new Set<string>()
  // 顶层逗号切分太脆（值里可能有对象/数组），这里只做「键名 + 冒号」与「裸标识符」两种扫描。
  for (const match of source.matchAll(/(?:^|[{,])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gu)) keys.add(match[1])
  for (const match of source.matchAll(/(?:^|[{,])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?=[,}])/gu)) keys.add(match[1])
  return [...keys]
}

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/gu

interface Violation {
  file: string
  line: number
  key: string
  missing: string[]
}

function collectViolations(): Violation[] {
  const files = SCAN_ROOTS.map((root) => join(REPO_ROOT, root)).flatMap((root) => walk(root))
  const violations: Violation[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/gu)) {
      const key = match[1]
      const template: unknown = (zh as Record<string, string>)[key]
      if (typeof template !== 'string') continue
      const required = [...template.matchAll(PLACEHOLDER)].map((item) => item[1])
      if (required.length === 0) continue
      const callStart = match.index + match[0].length
      const argsHead = source.slice(callStart).match(/^\s*,\s*\{/u)
      const provided = argsHead === null ? [] : objectKeys(source.slice(argsHead.index! + argsHead[0].length - 1, matchingBrace(source, callStart + argsHead[0].length - 1) + 1))
      const missing = [...new Set(required)].filter((name) => !provided.includes(name))
      if (missing.length > 0) {
        violations.push({
          file: relative(REPO_ROOT, file),
          line: source.slice(0, match.index).split('\n').length,
          key,
          missing
        })
      }
    }
  }
  return violations
}

describe('i18n 占位符守卫（调用侧必须给齐模板里的 {参数}）', () => {
  const violations = collectViolations()

  it('扫描到足够多的界面文件（防止路径写错导致守卫静默通过）', () => {
    const count = SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root))).length
    expect(count).toBeGreaterThan(100)
  })

  it('没有「模板要 {a}、调用处的键叫 b」这类对不上', () => {
    const sample = violations.map((item) => `${item.file}:${item.line} ${item.key} 缺 {${item.missing.join(',')}}`)
    expect(violations.length, `有 ${violations.length} 处占位符对不上（界面会直接显示 {x}）：\n${sample.join('\n')}`).toBe(0)
  })

  it('副作用自检：故意造一个对不上的样例，守卫要能抓到', () => {
    const template = zh['aiFull.verdictWarn']
    const required = [...template.matchAll(PLACEHOLDER)].map((item) => item[1])
    expect(required).toContain('sections')
    const provided = objectKeys("{ count: 1, chapters: 'x' }")
    expect(provided).toContain('count')
    expect(provided).not.toContain('sections')
    expect(required.filter((name) => !provided.includes(name))).toEqual(['sections'])
  })
})
