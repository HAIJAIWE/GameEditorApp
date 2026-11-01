/**
 * 路径围栏（对齐 dsh `fs-sandbox/src/containment.ts`）。
 *
 * 目标：把 agent 的文件读写限制在**工作区根目录**内，防止 `../` 穿越、绝对路径越界、
 * 以及 Windows 8.3 短名 / 大小写别名绕过。
 *
 * 两段判定（与 dsh 同构）：
 * 1. **词法快速路径**：把两个路径规范化后按分隔符前缀比较（Windows 忽略大小写）；
 * 2. **文件身份兜底**：词法不匹配时，向上遍历目标的已存在祖先，比较 `dev/ino` 与根是否同一实体
 *    ——识别 8.3 短名、大小写等别名，但不把围栏弱化成纯文本近似。
 *
 * 为什么需要身份兜底：Windows 上 `C:\PROGRA~1` 与 `C:\Program Files` 是同一目录但字符串不同，
 * 只做词法比较会误判越界或漏判。
 */

import type { BigIntStats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

const MISSING_CODES: ReadonlySet<string | undefined> = new Set(['ENOENT', 'ENOTDIR'])

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return MISSING_CODES.has(code)
}

function comparablePath(path: string, caseSensitive: boolean): string {
  return caseSensitive ? path : path.toLowerCase()
}

function isLexicallyUnder(path: string, root: string, caseSensitive: boolean): boolean {
  const target = comparablePath(path, caseSensitive)
  const base = comparablePath(root, caseSensitive)
  if (target === base) return true
  const prefix = base.endsWith(sep) ? base : base + sep
  return target.startsWith(prefix)
}

async function statIfPresent(path: string): Promise<BigIntStats | undefined> {
  try {
    return await stat(path, { bigint: true })
  } catch (error: unknown) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

/**
 * 判断目标是否就是根目录或位于其下。
 * @param path 目标绝对路径（可含尚不存在的尾部段）
 * @param root 工作区根绝对路径
 * @param caseSensitive 词法比较是否区分大小写（默认按平台：Windows 不区分）
 */
export async function isPathUnder(
  path: string,
  root: string,
  caseSensitive = process.platform !== 'win32'
): Promise<boolean> {
  if (isLexicallyUnder(path, root, caseSensitive)) return true

  const rootInfo = await statIfPresent(root)
  if (rootInfo === undefined) return false

  let ancestor = path
  while (true) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo !== undefined && sameIdentity(ancestorInfo, rootInfo)) return true
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}

/** 围栏拒绝错误（技能据此返回 `success:false`，文案含「越界」便于模型纠正） */
export class PathEscapeError extends Error {
  constructor(target: string) {
    super(`路径越界（必须位于工作区内）：${target}`)
    this.name = 'PathEscapeError'
  }
}

/**
 * 把相对/绝对路径解析为工作区内的绝对路径，并做围栏校验。
 * @throws PathEscapeError 越界时
 */
export async function resolveInsideRoot(root: string, target: string): Promise<string> {
  const abs = resolve(root, target)
  if (!(await isPathUnder(abs, root))) throw new PathEscapeError(abs)
  return abs
}
