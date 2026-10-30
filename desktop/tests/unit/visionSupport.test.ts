import { describe, expect, it } from 'vitest'

import {
  isVisionMode,
  modelSupportsVision,
  resolveVisionSupport,
  stripDataUrlPrefix
} from '../../src/shared/util/ui/visionSupport'

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

describe('resolveVisionSupport（用户设定优先，auto 才回落 allowlist）', () => {
  it("auto：等同 allowlist 判定", () => {
    expect(resolveVisionSupport('gpt-4o', 'auto')).toBe(true)
    expect(resolveVisionSupport('qwen3:8b', 'auto')).toBe(false)
    // 未传设定（旧配置 / 调用方没传）按 auto 处理
    expect(resolveVisionSupport('gpt-4o', undefined)).toBe(true)
    expect(resolveVisionSupport('qwen3:8b', undefined)).toBe(false)
  })

  it("on：强制发图（allowlist 未收录的视觉模型也能开）", () => {
    expect(resolveVisionSupport('my-own-vlm:latest', 'on')).toBe(true)
    // 甚至对空模型名也成立——用户明确表示「发」，由服务端决定
    expect(resolveVisionSupport('', 'on')).toBe(true)
  })

  it("off：强制不发（模型自称支持但实际会 400 时用）", () => {
    expect(resolveVisionSupport('gpt-4o', 'off')).toBe(false)
    expect(resolveVisionSupport('llava:13b', 'off')).toBe(false)
  })

  it('isVisionMode 只认三个合法值（外部输入兜底）', () => {
    expect(isVisionMode('auto')).toBe(true)
    expect(isVisionMode('on')).toBe(true)
    expect(isVisionMode('off')).toBe(true)
    expect(isVisionMode('ON')).toBe(false)
    expect(isVisionMode('')).toBe(false)
    expect(isVisionMode(undefined)).toBe(false)
    expect(isVisionMode(1)).toBe(false)
  })
})
