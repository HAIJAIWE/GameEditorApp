/**
 * 纯工具：通用类型守卫。
 *
 * 分层归属：`shared/util/` —— 不依赖任何业务域，main / renderer / 任意 domain 均可 import。
 *
 * 历史说明：本函数原定义在 `shared/ceshuModel.ts`（ceshu 业务域），导致
 *   - `shared/attrSystem.ts` → `ceshuModel`（attr → ceshu 跨业务域违规）
 * 为消除该跨域边而迁至此处。`ceshuModel` 保留 re-export 以兼容既有 50+ 处调用方。
 */

/** 值是否为「纯对象」（排除 null 与数组） */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
