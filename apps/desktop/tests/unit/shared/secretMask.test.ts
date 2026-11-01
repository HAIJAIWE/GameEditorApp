import { describe, it, expect } from 'vitest'
import { maskSecrets } from '@mobai/shared/util/security/secretMask'

describe('maskSecrets（ui-secret-mask）', () => {
  it('无密钥时原样返回，count 为 0', () => {
    const text = '帮我写一段计算伤害的公式'
    const result = maskSecrets(text)
    expect(result.count).toBe(0)
    expect(result.text).toBe(text)
  })

  it('OpenAI 风格 sk- 密钥整段脱敏', () => {
    const result = maskSecrets('key: sk-abcdefghijklmnopqrstuvwxyz012345')
    expect(result.count).toBe(1)
    expect(result.text).toBe('key: ****')
  })

  it('赋值式敏感字段只脱敏值、保留字段名', () => {
    const result = maskSecrets('password=hunter2 token=abc.def.ghi')
    expect(result.count).toBe(2)
    expect(result.text).toBe('password=**** token=****')
  })

  it('Bearer 令牌保留 scheme 词', () => {
    const result = maskSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI')
    expect(result.count).toBe(1)
    expect(result.text).toContain('Bearer ****')
    expect(result.text).not.toContain('eyJhbGci')
  })

  it('JWT 整段脱敏', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNa6c'
    const result = maskSecrets(jwt)
    expect(result.count).toBe(1)
    expect(result.text).toBe('****')
  })

  it('AWS 访问密钥脱敏', () => {
    const result = maskSecrets('AKIAIOSFODNN7EXAMPLE')
    expect(result.count).toBe(1)
    expect(result.text).toBe('****')
  })

  it('PEM 私钥块整体脱敏（多行）', () => {
    const block = '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANBgkqhki\n-----END PRIVATE KEY-----'
    const result = maskSecrets(block)
    expect(result.count).toBe(1)
    expect(result.text).toBe('****')
  })

  it('多处密钥分别计数', () => {
    const result = maskSecrets('a=sk-111111111111111111111111 b=AKIAIOSFODNN7EXAMPLE')
    expect(result.count).toBe(2)
    expect(result.text).toBe('a=**** b=****')
  })
})
