import { describe, expect, it } from 'vitest'

import { modelSupportsVision, stripDataUrlPrefix } from '../../src/shared/util/visionSupport'

describe('modelSupportsVision（保守 allowlist）', () => {
  it('已知视觉模型家族 → true', () => {
    expect(modelSupportsVision('gpt-4o')).toBe(true)
    expect(modelSupportsVision('gpt-4.1-mini')).toBe(true)
    expect(modelSupportsVision('qwen2.5-vl:7b')).toBe(true)
    expect(modelSupportsVision('llava:13b')).toBe(true)
    expect(modelSupportsVision('claude-3-5-sonnet')).toBe(true)
    expect(modelSupportsVision('gemini-1.5-pro')).toBe(true)
  })

  it('文本模型 / 空串 → false（宁可不发，也不发给文本模型）', () => {
    expect(modelSupportsVision('qwen3:8b')).toBe(false)
    expect(modelSupportsVision('deepseek-chat')).toBe(false)
    expect(modelSupportsVision('mistral:7b')).toBe(false)
    expect(modelSupportsVision('')).toBe(false)
  })

  it('stripDataUrlPrefix 去掉 data URL 前缀（Ollama 要裸 base64）', () => {
    expect(stripDataUrlPrefix('data:image/png;base64,AAAA')).toBe('AAAA')
    expect(stripDataUrlPrefix('AAAA')).toBe('AAAA')
  })
})
