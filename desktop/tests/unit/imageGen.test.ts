/* eslint-disable @typescript-eslint/no-explicit-any -- 测试中需对响应体形状做宽松断言 */
import { describe, it, expect } from 'vitest'
import {
  checkImageConfig,
  resolveImageConfig,
  buildImageRequest,
  extractImageUrl,
  type ImageGenConfig,
  type ImageProvider
} from '../../src/shared/imageGen'

function baseConfig(overrides: Partial<ImageGenConfig> = {}): ImageGenConfig {
  return {
    enabled: true,
    provider: 'openai',
    apiKey: 'sk-test-key',
    ...overrides
  }
}

describe('checkImageConfig', () => {
  it('enabled=false → API未启用', () => {
    const r = checkImageConfig(baseConfig({ enabled: false }))
    expect(r).toEqual({ ok: false, error: 'API未启用' })
  })

  it('apiKey 空 → 未设置API Key', () => {
    const r = checkImageConfig(baseConfig({ apiKey: '' }))
    expect(r).toEqual({ ok: false, error: '未设置API Key' })
  })

  it('apiKey 为空字符串 → 未设置（对齐 Python `if not config.api_key`）', () => {
    const r = checkImageConfig(baseConfig({ apiKey: '' }))
    expect(r).toEqual({ ok: false, error: '未设置API Key' })
  })

  it('apiKey 为纯空白串在 Python 语义下视为已设置（非空即 truthy）', () => {
    // Python: `if not config.api_key` 对 '   ' 为 False（非空串）→ 通过校验
    const r = checkImageConfig(baseConfig({ apiKey: '   ' }))
    expect(r).toEqual({ ok: true })
  })

  it('正常配置 → ok', () => {
    const r = checkImageConfig(baseConfig())
    expect(r).toEqual({ ok: true })
  })

  it('image 维度覆盖的 apiKey 优先于顶层空 apiKey', () => {
    const r = checkImageConfig(
      baseConfig({
        apiKey: '',
        modelOverrides: { image: { apiKey: 'sk-ov' } }
      })
    )
    expect(r).toEqual({ ok: true })
  })

  it('image 维度覆盖未提供 apiKey 时回退顶层', () => {
    const r = checkImageConfig(
      baseConfig({ modelOverrides: { image: { model: 'x' } } })
    )
    expect(r).toEqual({ ok: true })
  })
})

describe('resolveImageConfig', () => {
  it('无覆盖时取顶层字段', () => {
    const r = resolveImageConfig(
      baseConfig({ apiKey: 'k', baseUrl: 'http://b', model: 'm' })
    )
    expect(r).toEqual({
      provider: 'openai',
      apiKey: 'k',
      baseUrl: 'http://b',
      model: 'm'
    })
  })

  it('image 维度覆盖 model 生效', () => {
    const r = resolveImageConfig(
      baseConfig({ model: 'top', modelOverrides: { image: { model: 'ov' } } })
    )
    expect(r.model).toBe('ov')
  })

  it('image 维度覆盖 apiKey 生效', () => {
    const r = resolveImageConfig(
      baseConfig({ apiKey: 'top', modelOverrides: { image: { apiKey: 'ov' } } })
    )
    expect(r.apiKey).toBe('ov')
  })

  it('image 维度覆盖 baseUrl 生效', () => {
    const r = resolveImageConfig(
      baseConfig({ baseUrl: 'top', modelOverrides: { image: { baseUrl: 'ov' } } })
    )
    expect(r.baseUrl).toBe('ov')
  })

  it('无 modelOverrides 时 model/baseUrl 回退顶层默认值空串', () => {
    const r = resolveImageConfig(baseConfig({ apiKey: 'k' }))
    expect(r.model).toBe('')
    expect(r.baseUrl).toBe('')
  })

  it('modelOverrides 为 undefined 时不报错', () => {
    expect(() => resolveImageConfig(baseConfig())).not.toThrow()
  })

  it('modelOverrides.image 为 undefined 时不报错', () => {
    const r = resolveImageConfig(baseConfig({ modelOverrides: {} }))
    expect(r.apiKey).toBe('sk-test-key')
  })
})

describe('buildImageRequest - openai', () => {
  const cfg = baseConfig({ provider: 'openai' })

  it('url 精确匹配', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.url).toBe('https://api.openai.com/v1/images/generations')
  })

  it('body 形状精确匹配（默认模型 dall-e-3）', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.body).toEqual({
      model: 'dall-e-3',
      prompt: 'a cat',
      n: 1,
      size: '1024x1024'
    })
  })

  it('headers 含 Bearer 鉴权', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test-key'
    })
  })

  it('使用 image 维度覆盖的 model', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'openai', modelOverrides: { image: { model: 'gpt-image-1' } } }),
      'x'
    ) as any
    expect(r.body.model).toBe('gpt-image-1')
  })
})

describe('buildImageRequest - qwen', () => {
  const cfg = baseConfig({ provider: 'qwen' })

  it('url 精确匹配 dashscope', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.url).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'
    )
  })

  it('body 形状精确匹配（默认模型 qwen-vl）', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.body).toEqual({
      model: 'qwen-vl',
      input: { prompt: 'a cat' },
      parameters: { size: '1024x1024' }
    })
  })

  it('使用 image 维度覆盖的 model', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'qwen', modelOverrides: { image: { model: 'qwen-vl-max' } } }),
      'x'
    ) as any
    expect(r.body.model).toBe('qwen-vl-max')
  })
})

describe('buildImageRequest - doubao', () => {
  const cfg = baseConfig({ provider: 'doubao', model: 'doubao-seedream' })

  it('url 精确匹配 ark', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.url).toBe('https://ark.cn-beijing.volces.com/api/v1/images/generations')
  })

  it('body 使用 config.model（经覆盖解析）', () => {
    const r = buildImageRequest(cfg, 'a cat') as any
    expect(r.body).toEqual({
      model: 'doubao-seedream',
      prompt: 'a cat',
      n: 1,
      size: '1024x1024'
    })
  })

  it('model 为空时仍发出空 model（对齐 Python）', () => {
    const r = buildImageRequest(baseConfig({ provider: 'doubao' }), 'x') as any
    expect(r.body.model).toBe('')
  })

  it('image 维度覆盖 model 生效', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'doubao', model: 'top', modelOverrides: { image: { model: 'ov' } } }),
      'x'
    ) as any
    expect(r.body.model).toBe('ov')
  })
})

describe('buildImageRequest - generic', () => {
  it('url 拼接 baseUrl + /images/generations（无尾部斜杠）', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'generic', model: 'm', baseUrl: 'https://x.com' }),
      'x'
    ) as any
    expect(r.url).toBe('https://x.com/images/generations')
  })

  it('url 处理 baseUrl 尾部斜杠', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'generic', model: 'm', baseUrl: 'https://x.com/' }),
      'x'
    ) as any
    expect(r.url).toBe('https://x.com/images/generations')
  })

  it('multiple 尾部斜杠去重', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'generic', model: 'm', baseUrl: 'https://x.com///' }),
      'x'
    ) as any
    expect(r.url).toBe('https://x.com/images/generations')
  })

  it('body 形状精确匹配', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'generic', model: 'm', baseUrl: 'https://x.com' }),
      'p'
    ) as any
    expect(r.body).toEqual({ model: 'm', prompt: 'p', n: 1, size: '1024x1024' })
  })

  it('缺 baseUrl → error', () => {
    const r = buildImageRequest(baseConfig({ provider: 'generic', model: 'm' }), 'x')
    expect(r).toEqual({ error: '不支持的provider: generic' })
  })

  it('缺 model → error', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'generic', baseUrl: 'https://x.com' }),
      'x'
    )
    expect(r).toEqual({ error: '不支持的provider: generic' })
  })

  it('image 维度覆盖的 model/baseUrl 生效', () => {
    const r = buildImageRequest(
      baseConfig({
        provider: 'generic',
        modelOverrides: { image: { model: 'ov-m', baseUrl: 'https://ov.com' } }
      }),
      'x'
    ) as any
    expect(r.body.model).toBe('ov-m')
    expect(r.url).toBe('https://ov.com/images/generations')
  })
})

describe('buildImageRequest - 前置与未知', () => {
  it('前置不过（未启用）→ error', () => {
    const r = buildImageRequest(baseConfig({ enabled: false }), 'x')
    expect(r).toEqual({ error: 'API未启用' })
  })

  it('前置不过（无 key）→ error', () => {
    const r = buildImageRequest(baseConfig({ apiKey: '' }), 'x')
    expect(r).toEqual({ error: '未设置API Key' })
  })

  it('未知 provider → error', () => {
    const r = buildImageRequest(
      baseConfig({ provider: 'unknown' as ImageProvider, model: 'm', baseUrl: 'https://x.com' }),
      'x'
    )
    expect(r).toEqual({ error: '不支持的provider: unknown' })
  })

  it('返回 ImageGenRequest 时带 url/headers/body 三字段', () => {
    const r = buildImageRequest(baseConfig(), 'x') as any
    expect(r).toHaveProperty('url')
    expect(r).toHaveProperty('headers')
    expect(r).toHaveProperty('body')
  })
})

describe('extractImageUrl - openai', () => {
  it('解析 data[0].url', () => {
    const json = { data: [{ url: 'https://img/openai.png' }] }
    expect(extractImageUrl(json, 'openai')).toBe('https://img/openai.png')
  })

  it('含 b64_json 时优先返回 url', () => {
    const json = { data: [{ url: 'https://img/u.png', b64_json: 'BASE64' }] }
    expect(extractImageUrl(json, 'openai')).toBe('https://img/u.png')
  })

  it('无 url 时回退 b64_json', () => {
    const json = { data: [{ b64_json: 'BASE64DATA' }] }
    expect(extractImageUrl(json, 'openai')).toBe('BASE64DATA')
  })

  it('data 为空数组 → null', () => {
    expect(extractImageUrl({ data: [] }, 'openai')).toBeNull()
  })

  it('形状错误（无 data）→ null', () => {
    expect(extractImageUrl({}, 'openai')).toBeNull()
  })

  it('null 输入 → null', () => {
    expect(extractImageUrl(null, 'openai')).toBeNull()
  })
})

describe('extractImageUrl - doubao', () => {
  it('解析 data[0].url（同 openai 形状）', () => {
    const json = { data: [{ url: 'https://img/doubao.png' }] }
    expect(extractImageUrl(json, 'doubao')).toBe('https://img/doubao.png')
  })

  it('data[0] 为空 → null', () => {
    expect(extractImageUrl({ data: [null] }, 'doubao')).toBeNull()
  })
})

describe('extractImageUrl - generic', () => {
  it('解析 data[0].url', () => {
    const json = { data: [{ url: 'https://img/gen.png' }] }
    expect(extractImageUrl(json, 'generic')).toBe('https://img/gen.png')
  })

  it('data[0].b64_json 回退', () => {
    const json = { data: [{ b64_json: 'G' }] }
    expect(extractImageUrl(json, 'generic')).toBe('G')
  })
})

describe('extractImageUrl - qwen', () => {
  it('解析 output.results[0].url', () => {
    const json = { output: { results: [{ url: 'https://img/qwen.png' }] } }
    expect(extractImageUrl(json, 'qwen')).toBe('https://img/qwen.png')
  })

  it('results 为空 → null', () => {
    expect(extractImageUrl({ output: { results: [] } }, 'qwen')).toBeNull()
  })

  it('无 output → null', () => {
    expect(extractImageUrl({}, 'qwen')).toBeNull()
  })

  it('output 存在但 results 缺失 → null', () => {
    expect(extractImageUrl({ output: {} }, 'qwen')).toBeNull()
  })

  it('results[0] 无 url → null', () => {
    expect(extractImageUrl({ output: { results: [{}] } }, 'qwen')).toBeNull()
  })

  it('null 输入 → null', () => {
    expect(extractImageUrl(null, 'qwen')).toBeNull()
  })
})
