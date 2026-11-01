import { describe, expect, it } from 'vitest'

import { nextCronTime, parseCron } from '@mobai/agent-core/schedule/cron'

describe('parseCron（5 字段）', () => {
  it('*/n 展开分钟集合', () => {
    const fields = parseCron('*/5 * * * *')
    expect(fields).not.toBeNull()
    expect(fields?.minutes.size).toBe(12)
    expect(fields?.minutes.has(0)).toBe(true)
    expect(fields?.minutes.has(5)).toBe(true)
    expect(fields?.minutes.has(7)).toBe(false)
  })

  it('范围与枚举', () => {
    const fields = parseCron('0 9-18 * * 1,3,5')
    expect(fields?.hours.has(9)).toBe(true)
    expect(fields?.hours.has(18)).toBe(true)
    expect(fields?.hours.has(19)).toBe(false)
    expect([...(fields?.weekdays ?? [])].sort()).toEqual([1, 3, 5])
  })

  it('非法输入返回 null', () => {
    expect(parseCron('bad')).toBeNull()
    expect(parseCron('60 * * * *')).toBeNull()
    expect(parseCron('* * * *')).toBeNull()
    expect(parseCron('*/0 * * * *')).toBeNull()
  })
})

describe('nextCronTime', () => {
  it('*/5 * * * * 从 10:02 推到 10:05', () => {
    const fields = parseCron('*/5 * * * *')
    expect(fields).not.toBeNull()
    const from = Date.parse('2026-11-01T10:02:00+08:00')
    const next = nextCronTime(fields!, from)
    expect(next).not.toBeNull()
    const date = new Date(next as number)
    expect(date.getMinutes()).toBe(5)
    expect(date.getHours()).toBe(10)
  })

  it('0 9 * * 1 从周日推到周一 9:00', () => {
    const fields = parseCron('0 9 * * 1')
    expect(fields).not.toBeNull()
    const from = Date.parse('2026-11-01T12:00:00+08:00') // 周日
    const next = nextCronTime(fields!, from)
    expect(next).not.toBeNull()
    const date = new Date(next as number)
    expect(date.getDay()).toBe(1)
    expect(date.getDate()).toBe(2)
    expect(date.getHours()).toBe(9)
  })
})
