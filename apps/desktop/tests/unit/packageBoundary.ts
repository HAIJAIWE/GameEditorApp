import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * 包边界扫描器（测试辅助，**不是**测试文件）。
 *
 * 两个包（`agent-core` / `client-ui`）的守卫用例需要同一套判定：
 * 「包内文件的 import 有没有跑到包外去」。复制两份扫描逻辑就会漂移
 * （一份漏了动态 import、另一份漏了 `export … from`），故收敛到一处。
 *
 * 判定只看**方向**，不看具体文件名：
 * 1. 相对路径解析后必须仍在包目录内；
 * 2. 不得出现宿主别名（`@app`）；
 * 3. 第三方包名 / `@mobai/*` 子包由调用方给白名单，**全等**比对。
 */

export interface PackageScan {
  /** 包内全部 `.ts` / `.tsx` 的绝对路径 */
  files: string[]
  /** 逃出包目录的相对引用（`文件 → 说明符`） */
  escapes: string[]
  /** 命中的宿主别名（`@app` 前缀） */
  hostAliases: string[]
  /** 用到的第三方包名（已去重排序，不含 `node:` 与 `@mobai/*`） */
  external: string[]
  /** 用到的 `@mobai/*` 子包名（已去重排序） */
  mobai: string[]
}

/**
 * 抽取一个文件里的模块说明符。
 *
 * 覆盖包内实际出现的全部形态：
 * - `import x from '…'` / `export … from '…'`（静态）
 * - `import '…'`（副作用）
 * - `import('…')`（动态；`documentSkill` 的 pdfjs 就是这一种，
 *   只扫 `from '…'` 的粗糙 grep 会漏）
 */
export function specifiersOf(source: string): string[] {
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

/** 递归收集 `.ts` / `.tsx`（包内无子包、无 symlink，不需要防环） */
function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectSources(full))
    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) out.push(full)
  }
  return out
}

/** 取包名：`@scope/name` 两段，其余取首段 */
function packageNameOf(spec: string): string {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split('/')[0] ?? spec)
}

/** 扫描一个包目录（传 `packages/<pkg>/src` 的绝对路径） */
export function scanPackage(pkgSrc: string): PackageScan {
  const files = collectSources(pkgSrc)
  const escapes: string[] = []
  const hostAliases: string[] = []
  const external = new Set<string>()
  const mobai = new Set<string>()

  for (const file of files) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      if (spec === '@app' || spec.startsWith('@app/')) {
        hostAliases.push(`${relative(pkgSrc, file)} → ${spec}`)
        continue
      }
      if (spec.startsWith('.')) {
        const target = resolve(file, '..', spec)
        if (target !== pkgSrc && !target.startsWith(pkgSrc + sep)) {
          escapes.push(`${relative(pkgSrc, file)} → ${spec}`)
        }
        continue
      }
      if (spec.startsWith('node:')) continue
      const name = packageNameOf(spec)
      if (name.startsWith('@mobai/')) mobai.add(name)
      else external.add(name)
    }
  }

  return {
    files,
    escapes,
    hostAliases,
    external: [...external].sort(),
    mobai: [...mobai].sort()
  }
}
