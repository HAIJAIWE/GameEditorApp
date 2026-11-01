/**
 * 最小 cron 解析（5 字段：分 时 日 月 周），供 `system.schedule` 的 `cron` 使用。
 *
 * 支持：`*`、星号后接 `/N` 的步长、`a-b`、`a-b/N`、`a,b,c` 及组合。
 * 日与周的语义遵循 cron 惯例：**两者都受限时取「或」**，否则取「与」。
 */

export interface CronFields {
  minutes: Set<number>
  hours: Set<number>
  days: Set<number>
  months: Set<number>
  weekdays: Set<number>
}

/** 解析单个字段为值集合；非法返回 null */
function parseField(field: string, min: number, max: number): Set<number> | null {
  const set = new Set<number>()
  for (const part of field.split(',')) {
    if (part === '') return null
    const stepOnly = /^\*\/(\d+)$/.exec(part)
    if (stepOnly !== null) {
      const step = Number(stepOnly[1])
      if (!Number.isInteger(step) || step <= 0) return null
      for (let value = min; value <= max; value += step) set.add(value)
      continue
    }
    if (part === '*') {
      for (let value = min; value <= max; value += 1) set.add(value)
      continue
    }
    const range = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part)
    if (range !== null) {
      const from = Number(range[1])
      const to = Number(range[2])
      const step = range[3] === undefined ? 1 : Number(range[3])
      if (from > to || step <= 0) return null
      for (let value = from; value <= to; value += step) set.add(value)
      continue
    }
    const single = Number(part)
    if (Number.isInteger(single) && single >= min && single <= max) {
      set.add(single)
      continue
    }
    return null
  }
  return set.size > 0 ? set : null
}

/** 解析 5 字段 cron；非法返回 null */
export function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minutes = parseField(parts[0] ?? '', 0, 59)
  const hours = parseField(parts[1] ?? '', 0, 23)
  const days = parseField(parts[2] ?? '', 1, 31)
  const months = parseField(parts[3] ?? '', 1, 12)
  const weekdays = parseField(parts[4] ?? '', 0, 6)
  if (minutes === null || hours === null || days === null || months === null || weekdays === null) return null
  return { minutes, hours, days, months, weekdays }
}

/**
 * 计算 `from` 之后的下一个匹配时刻（毫秒时间戳）；一年内无匹配返回 null。
 * 从下一分钟开始逐分钟推进（简单可靠；单次最多 527040 步）。
 */
export function nextCronTime(fields: CronFields, from: number): number | null {
  const date = new Date(from)
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() + 1)
  const domRestricted = fields.days.size < 31
  const dowRestricted = fields.weekdays.size < 7

  for (let step = 0; step < 366 * 24 * 60; step += 1) {
    const domOk = fields.days.has(date.getDate())
    const dowOk = fields.weekdays.has(date.getDay())
    const dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk
    if (
      fields.minutes.has(date.getMinutes()) &&
      fields.hours.has(date.getHours()) &&
      fields.months.has(date.getMonth() + 1) &&
      dayOk
    ) {
      return date.getTime()
    }
    date.setMinutes(date.getMinutes() + 1)
  }
  return null
}
