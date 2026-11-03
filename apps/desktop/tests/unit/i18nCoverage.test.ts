import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * i18n 覆盖率**棘轮**：界面文件里"注释之外还硬编码中文"的数量只许降、不许升。
 *
 * ## 为什么需要棘轮而不是"全绿才算完"
 * 界面文案迁移是逐文件进行的（约 150 个文件、两千多处）。要求"一次迁完"等于永远不开始；
 * 而没有守卫的渐进迁移一定会反弹——新写的组件顺手写中文，三个月后又回到原点。
 * 棘轮给的是一个**单调下降的数字**：每迁一个文件就把 `BASELINE` 减一，
 * 想加新的硬编码中文必须先减掉一个旧的。
 *
 * ## 判据（刻意宽松）
 * - 只看 `renderer/src` 与 `packages/client-ui/src`（UI 层）；主进程/agent 的提示词与
 *   错误文案是**中文优先的产品语言**，不在本守卫范围；
 * - 先剥掉块注释与行注释，再看是否还有 CJK —— 注释里的中文不算债；
 * - 只要**有一个**字面量中文就算"未迁移"。不做逐串精确统计：数字越精细越容易被
 *   "改个标点"这类无意义改动刷分。
 *
 * ## 已知粗糙处
 * `//` 剥离会误伤字符串里的 URL（`https://…`），但只影响"是否命中 CJK"的判断，
 * 对棘轮无害。
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')

const SCAN_ROOTS = [
  'apps/desktop/src/renderer/src',
  'packages/client-ui/src'
]

/**
 * 当前基线（2026-11-01，侧栏项 / 主区页签迁完后）。**只许减**。
 *
 * 迁移一个文件 → 把这个数字减 1 并提交；想新增硬编码中文 → 先迁掉一个。
 */
const BASELINE = 12

const CJK = /[\u4e00-\u9fa5]/u

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name)) out.push(full)
  }
  return out
}

/** 去掉块注释与行注释后，是否还有中文 */
function hasHardcodedChinese(source: string): boolean {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '')
  return CJK.test(withoutComments)
}

describe('i18n 覆盖率棘轮', () => {
  const files = SCAN_ROOTS.flatMap((root) => walk(resolve(REPO_ROOT, root)))
  const pending = files.filter((file) => hasHardcodedChinese(readFileSync(file, 'utf8')))

  it('扫描范围非空（防止路径写错导致守卫静默通过）', () => {
    expect(files.length).toBeGreaterThan(150)
  })

  it(`硬编码中文的文件数不得超过基线 ${BASELINE}（只许降不许升）`, () => {
    const sample = pending.slice(0, 8).map((file) => relative(REPO_ROOT, file))
    expect(
      pending.length,
      `还有 ${pending.length} 个文件含硬编码中文（基线 ${BASELINE}）。\n` +
        `迁移一个就把 BASELINE 减 1；新增中文文案请走 t('…')。\n` +
        `前几个：\n${sample.join('\n')}`
    ).toBeLessThanOrEqual(BASELINE)
  })
})
