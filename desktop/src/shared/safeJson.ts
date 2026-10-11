/**
 * 容错 JSON 解析。
 *
 * 与散落在各 store 里的 `try { JSON.parse } catch {}` 不同，这里集中成一个
 * 有显式 fallback 的入口，避免「吞异常却返回 undefined 导致下游崩」的写法
 * （例如 `row.data` 损坏时直接返回空对象而不是抛，调用方无需再判空）。
 *
 * 适用场景：读「信任边界内但可能损坏」的数据——自有 SQLite / 本地文件 /
 * 备份等。对外来不可信输入不要静默容错，应走 schema 校验报错。
 *
 * @param text   待解析字符串
 * @param fallback 解析失败（语法错/截断/非 JSON）时返回的值，默认 null
 */
export function safeJsonParse(text: string, fallback: unknown = null): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}
