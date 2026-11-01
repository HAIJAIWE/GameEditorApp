import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 包边界守卫：`packages/agent-core` **不得反向依赖 app**。
 *
 * ## 为什么这条守卫必须有（A3 的教训）
 * 把 `main/agent` 搬进 `packages/agent-core` 时，包内残留了 5 处 `@app/*`
 * （取消表、LLM 客户端、两个技能的业务服务类型）。tsc 当时**全绿**——因为 app 的
 * `paths` 恰好能解析 `@app/*`。也就是说：目录搬了、包名改了，**边界仍然是假的**，
 * 包内任何文件都能顺手拿到宿主的一切，且没有任何机制会在腐化时报警。
 *
 * 后来这 5 处换成了 `ports.ts` 的端口，`@app` 别名也一并删掉（现在写了就解析不了）。
 * 但"删掉别名"只挡住 `@app/*` 一种写法，挡不住 `../../../apps/desktop/src/main/...`
 * 这种相对路径逃逸。本文件把**两个方向**都钉死，让边界从"约定"变成"用例"。
 *
 * ## 判据（两条，都不看具体文件名，只看方向）
 * 1. 不出现 `@app` 前缀的模块说明符；
 * 2. 相对路径解析后必须仍在 `packages/agent-core/src` 内。
 *
 * 第三方依赖（electron / better-sqlite3 / vectra / exceljs / jszip / quickjs）**不拦**：
 * 那是"向下"依赖 npm 包，不构成包间循环，属于宿主集成层的既定事实。
 * 端口清单见 `packages/agent-core/src/ports.ts`。
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
/** `apps/desktop/tests/unit/` → 仓库根 → `packages/agent-core/src` */
const PKG_SRC = resolve(HERE, '../../../../packages/agent-core/src')

/** 收集包内全部 `.ts`（递归；无子包/无 symlink，不需要防环） */
function collectTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectTs(full))
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * 抽取一个文件里的模块说明符。
 *
 * 覆盖三种写法（包内实际出现的全部形态）：
 * - `import x from '…'` / `export … from '…'`（静态）
 * - `import '…'`（副作用）
 * - `import('…')`（动态，含类型位置的 `import('…')`）
 */
function specifiersOf(source: string): string[] {
  const found: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) found.push(match[1])
    }
  }
  return found
}

describe('agent-core 包边界：不得反向依赖 app', () => {
  const files = collectTs(PKG_SRC)

  it('扫描范围非空（防止守卫因路径写错而静默通过）', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('不存在 `@app` 前缀的模块说明符', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (spec === '@app' || spec.startsWith('@app/')) {
          offenders.push(`${relative(PKG_SRC, file)} → ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('相对路径不得逃出 packages/agent-core/src', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue
        const target = resolve(file, '..', spec)
        if (target !== PKG_SRC && !target.startsWith(PKG_SRC + sep)) {
          offenders.push(`${relative(PKG_SRC, file)} → ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
