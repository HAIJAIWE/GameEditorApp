import { CESHU_CHAPTER_FIELDS } from '../fields/ceshuFields'
import type { CeshuDocument } from '../reference/ceshuConstants'
import { visibleChaptersForDoc } from '../model/ceshuModel'

/**
 * 原型过期判定（2026-10-26）。
 *
 * 原型（`prototype/demo.html`）是按设计文档生成的一次性产物，生成要花 token。
 * 文档后来改了，原型却还是旧的——用户看到「能玩的原型」会误以为它反映最新设计。
 * 这里用「设计内容指纹」把这件事显式化：生成时记下指纹，打开时重算比对，
 * 不一致就提示「原型可能过期」，而不是偷偷让旧原型冒充最新。
 *
 * 指纹**只覆盖章节内容**（`visibleChaptersForDoc` 里各章的键值），刻意排除：
 * - `demo_html` / `demo_source_fingerprint`：原型本身不该影响「设计是否变了」；
 * - `updated_at` / `created_at` / 版本链：保存原型会刷新 `updated_at`，
 *   若纳入就会「一生成完立刻报过期」。
 *
 * 键按字典序拼接，避免对象键插入顺序不同造成误判。
 */

/** FNV-1a 32 位哈希（稳定、无依赖，渲染层与 Node 都能跑；不是加密用途） */
function hashString(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 设计内容指纹：只取可见章节的键值（含 schema 外的扩展键），按 `章.键` 字典序拼接后哈希。
 * 任一章的任一字段变了，指纹就变——这是「原型是否过期」的唯一判据。
 */
export function fingerprintCeshuDesign(doc: CeshuDocument): string {
  const parts: string[] = []
  for (const chapter of visibleChaptersForDoc(doc)) {
    const data = (doc[chapter] ?? {}) as Record<string, unknown>
    // 已知字段键 ∪ schema 外扩展键，统一排序，保证同一内容永远得到同一指纹
    const keys = new Set<string>([
      ...(CESHU_CHAPTER_FIELDS[chapter] ?? []).map((field) => field.key),
      ...Object.keys(data)
    ])
    for (const key of [...keys].sort()) {
      const value = data[key]
      if (value === undefined) continue
      parts.push(`${chapter}.${key}=${JSON.stringify(value) ?? ''}`)
    }
  }
  return hashString(parts.join('\n'))
}

/**
 * 原型是否可能过期：有原型、有生成时指纹、且当前文档指纹与它不一致。
 *
 * 缺指纹（老原型，生成本功能之前产的）时**不报**——没有基准就下结论只会误报。
 */
export function isPrototypeStale(doc: CeshuDocument): boolean {
  const html = doc.demo_html ?? ''
  const stored = doc.demo_source_fingerprint ?? ''
  if (html.trim() === '' || stored === '') return false
  return fingerprintCeshuDesign(doc) !== stored
}
