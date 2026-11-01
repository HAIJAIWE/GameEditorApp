import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ImageGenConfig } from '@mobai/shared/config/llm'

// 客户端模块通过 resetModules 动态导入，以保证限流状态（lastCall）在用例间隔离，
// 避免用例串行时累积 2s 间隔拖慢测试。
let generateImage: typeof import('../../src/main/imageGen/client').generateImage
let acquireImageRateLimit: typeof import('../../src/main/imageGen/client').acquireImageRateLimit
let saveImageFromUrl: typeof import('../../src/main/imageGen/save').saveImageFromUrl

beforeEach(async () => {
  vi.resetModules()
  const client = await import('../../src/main/imageGen/client')
  const save = await import('../../src/main/imageGen/save')
  generateImage = client.generateImage
  acquireImageRateLimit = client.acquireImageRateLimit
  saveImageFromUrl = save.saveImageFromUrl
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

let tmpRoot: string
beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'imgentest-'))
})
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function makeConfig(provider: ImageGenConfig['provider']): ImageGenConfig {
  return {
    enabled: true,
    provider,
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model'
  }
}

// ---------------------------------------------------------------------------
// generateImage：OpenAI / Qwen / 豆包 / Generic
// ---------------------------------------------------------------------------

describe('generateImage - 各 provider 成功路径', () => {
  it('OpenAI：返回 data[0].url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ url: 'https://cdn.example.com/a.png' }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('openai'), 'a cat')
    expect(outcome).toEqual({ ok: true, url: 'https://cdn.example.com/a.png' })
  })

  it('OpenAI：fetch 以 POST + 正确 body 发起', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ url: 'https://cdn.example.com/a.png' }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateImage(makeConfig('openai'), 'a cat')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(typeof url).toBe('string')
    expect(init.body).toBeTypeOf('string')
    const body = JSON.parse(init.body as string)
    expect(JSON.stringify(body)).toContain('a cat')
  })

  it('Qwen：返回图像地址（output.results[0].url）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output: { results: [{ url: 'https://cdn.example.com/q.png' }] } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('qwen'), 'a dog')
    expect(outcome).toEqual({ ok: true, url: 'https://cdn.example.com/q.png' })
  })

  it('豆包：返回图像地址', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ url: 'https://cdn.example.com/d.png' }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('doubao'), 'a bird')
    expect(outcome).toEqual({ ok: true, url: 'https://cdn.example.com/d.png' })
  })

  it('Generic：返回图像地址', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ url: 'https://cdn.example.com/g.png' }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('generic'), 'a fish')
    expect(outcome).toEqual({ ok: true, url: 'https://cdn.example.com/g.png' })
  })
})

// ---------------------------------------------------------------------------
// generateImage：前置校验失败
// ---------------------------------------------------------------------------

describe('generateImage - 前置校验', () => {
  it('enabled=false：不发起请求直接返回错误', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const cfg = { ...makeConfig('openai'), enabled: false }
    const outcome = await generateImage(cfg, 'x')
    expect(outcome.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('apiKey 为空：不发起请求直接返回错误', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const cfg = { ...makeConfig('openai'), apiKey: '' }
    const outcome = await generateImage(cfg, 'x')
    expect(outcome.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// generateImage：HTTP 失败 / 重试 / 网络错误
// ---------------------------------------------------------------------------

describe('generateImage - 失败与重试', () => {
  it('HTTP 非 200：返回含 HTTP 的错误且不重试', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('err', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('openai'), 'x')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('HTTP')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('网络异常：重试直至第 3 次成功', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('network down 1')
      })
      .mockImplementationOnce(() => {
        throw new Error('network down 2')
      })
      .mockImplementationOnce(async () =>
        jsonResponse({ data: [{ url: 'https://cdn.example.com/ok.png' }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('openai'), 'x')
    expect(outcome).toEqual({ ok: true, url: 'https://cdn.example.com/ok.png' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('网络异常耗尽 3 次：返回网络错误', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('openai'), 'x')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('网络错误')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('响应中无图像地址：返回对应错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('openai'), 'x')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('响应中未找到图像地址')
  })

  it('buildImageRequest 失败（generic 缺 baseUrl/model）：直接返回构建错误', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const cfg = { ...makeConfig('generic'), baseUrl: undefined }
    const outcome = await generateImage(cfg, 'x')
    expect(outcome.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// generateImage：b64_json（OpenAI）间接验证 extractImageUrl
// ---------------------------------------------------------------------------

describe('generateImage - b64_json', () => {
  it('OpenAI 返回 b64_json 也能取到地址', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ b64_json: 'AAA' }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await generateImage(makeConfig('openai'), 'x')
    expect(outcome).toEqual({ ok: true, url: 'AAA' })
  })
})

// ---------------------------------------------------------------------------
// acquireImageRateLimit
// ---------------------------------------------------------------------------

describe('acquireImageRateLimit', () => {
  it('连续两次调用至少间隔 MIN_INTERVAL（≈2s）', async () => {
    const t0 = Date.now()
    await acquireImageRateLimit()
    await acquireImageRateLimit()
    const elapsed = Date.now() - t0
    expect(elapsed).toBeGreaterThanOrEqual(1900)
  })
})

// ---------------------------------------------------------------------------
// saveImageFromUrl
// ---------------------------------------------------------------------------

describe('saveImageFromUrl - 成功', () => {
  it('默认文件名带 .png，内容一致', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from('fakepng-bytes'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.png', dir)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const saved = outcome.path
      expect(saved).toBe(path.join(dir, path.basename(saved)))
      const written = fs.readFileSync(saved)
      expect(written.toString()).toBe('fakepng-bytes')
      expect(saved.endsWith('.png')).toBe(true)
    }
  })

  it('按 URL 扩展名采用 .jpg', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from('jpgbytes'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.jpg?token=1', dir)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.path.endsWith('.jpg')).toBe(true)  })

  it('显式 filename 原样使用', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from('abc'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.png', dir, 'custom.png')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.path).toBe(path.join(dir, 'custom.png'))
  })
})

describe('saveImageFromUrl - 失败与原子性', () => {
  it('下载 HTTP 非 200：返回错误，不残留正式文件', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi.fn().mockResolvedValue(new Response('err', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.png', dir)
    expect(outcome.ok).toBe(false)
    const files = fs.readdirSync(dir)
    expect(files.filter((f) => !f.startsWith('.img_'))).toHaveLength(0)
  })

  it('原子写：最终文件存在且临时文件已清理', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from('data'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.png', dir)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const saved = outcome.path
      expect(fs.existsSync(saved)).toBe(true)
      const tmpFiles = fs.readdirSync(dir).filter((f) => f.startsWith('.img_'))
      expect(tmpFiles).toHaveLength(0)
    }
  })

  it('下载抛网络异常：返回错误并清理临时文件', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi.fn().mockImplementation(() => {
      throw new Error('download boom')
    })
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.png', dir)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('下载图像失败')
    const tmpFiles = fs.readdirSync(dir).filter((f) => f.startsWith('.img_'))
    expect(tmpFiles).toHaveLength(0)
  })

  it('路径穿越（filename 含 ..）：文件名被剥离，文件仍落在目标目录内', async () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'save-'))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from('safe'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await saveImageFromUrl('https://x/y.png', dir, '../escape.png')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      // 安全不变式：落盘路径必须仍在 dir 之内，且不含任何目录分隔符
      expect(path.dirname(outcome.path)).toBe(path.resolve(dir))
      expect(path.basename(outcome.path)).toBe('escape.png')
      expect(fs.existsSync(outcome.path)).toBe(true)
    }
    // 目录外不应产生任何文件
    expect(fs.existsSync(path.join(path.dirname(path.resolve(dir)), 'escape.png'))).toBe(false)
  })
})
