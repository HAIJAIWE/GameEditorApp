/**
 * 无损 JSON 值：快照 + 深冻结（对齐 dsh `util-values` 的 `snapshotJsonValue` / `deepFreeze`）。
 *
 * 为什么工具参数必须**无损**：执行器要把参数交给工具，也要能把它写进会话日志/回放。
 * 只要有一个值不能 JSON 往返（undefined / 函数 / 循环引用 / NaN / class 实例），
 * 回放就会和直播不一致。所以「不无损」一律**拒绝**，而不是静默丢字段。
 *
 * @module agent/tools/jsonValue
 */

/** JSON 值域（与 `JSON.stringify` 能表达的值一致） */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * 把任意值快照成**独立**的 JSON 值；不能无损表达时返回 `undefined`。
 *
 * 返回的是深拷贝：调用方后续改原对象不会影响快照。
 * @param value - 待快照的任意值
 * @param seen - 循环引用检测（内部递归用）
 * @returns 独立 JSON 值；不可无损表达时为 `undefined`
 */
export function snapshotJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): JsonValue | undefined {
  if (value === null) return null
  const kind = typeof value
  if (kind === 'string' || kind === 'boolean') return value as string | boolean
  if (kind === 'number') {
    // NaN / ±Infinity 会被 JSON.stringify 变成 null —— 那是"静默丢值"，必须拒绝
    return Number.isFinite(value as number) ? (value as number) : undefined
  }
  if (kind !== 'object') return undefined
  const object = value as object
  if (seen.has(object)) return undefined
  seen.add(object)
  try {
    if (Array.isArray(object)) {
      const out: JsonValue[] = []
      for (const item of object) {
        const snapshot = snapshotJsonValue(item, seen)
        if (snapshot === undefined) return undefined
        out.push(snapshot)
      }
      return out
    }
    // 只接受纯对象：Date/Map/Set/class 实例都不是无损 JSON
    const proto: unknown = Object.getPrototypeOf(object)
    if (proto !== Object.prototype && proto !== null) return undefined
    const out: Record<string, JsonValue> = {}
    for (const key of Object.keys(object)) {
      const snapshot = snapshotJsonValue((object as Record<string, unknown>)[key], seen)
      if (snapshot === undefined) return undefined
      out[key] = snapshot
    }
    return out
  } finally {
    seen.delete(object)
  }
}

/**
 * 深冻结（递归 `Object.freeze`）。
 *
 * 快照之后立刻冻结，工具就拿不到"改参数影响别人"的能力——
 * 与 dsh 的 `deepFreeze(detached)` 同一意图。
 * @param value - 待冻结的值
 * @returns 同一个值（已冻结）
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}
