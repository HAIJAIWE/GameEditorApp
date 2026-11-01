import { describe, expect, it } from 'vitest'
import { buildTimeContextBlock } from '@mobai/agent-core/agentService/domainContext'

describe('buildTimeContextBlock（对齐 dsh time-context）', () => {
  it('输出日期、时间与星期', () => {
    // 2026-11-01 是周日
    const block = buildTimeContextBlock(new Date(2026, 10, 1, 9, 5))
    expect(block).toContain('2026-11-01')
    expect(block).toContain('09:05')
    expect(block).toContain('周日')
    expect(block.startsWith('【当前时间】')).toBe(true)
  })

  it('月/日/时/分补零', () => {
    const block = buildTimeContextBlock(new Date(2026, 0, 3, 7, 8))
    expect(block).toContain('2026-01-03')
    expect(block).toContain('07:08')
  })
})
