import { describe, expect, it } from 'vitest'

import { encodeLspMessage, LspMessageReader } from '../../src/main/agent/lsp/framing'

describe('LSP 分帧（Content-Length）', () => {
  it('encode 生成 Content-Length + body（按字节计）', () => {
    const frame = encodeLspMessage({ a: 1 }).toString('utf8')
    expect(frame.startsWith('Content-Length: 7\r\n\r\n')).toBe(true)
    expect(frame.endsWith('{"a":1}')).toBe(true)
  })

  it('中文按字节计长度（不被字符数误导）', () => {
    const frame = encodeLspMessage({ text: '你好' })
    // {"text":"你好"} 的 UTF-8 字节数 = 6 + 6 = 12
    const header = frame.subarray(0, frame.indexOf('\r\n\r\n')).toString('ascii')
    expect(header).toBe(`Content-Length: ${Buffer.byteLength('{"text":"你好"}', 'utf8')}`)
  })

  it('reader 解析半包 + 完整帧', () => {
    const messages: unknown[] = []
    const reader = new LspMessageReader((m) => messages.push(m))
    const frame = encodeLspMessage({ hello: 'world' })
    reader.push(frame.subarray(0, 5))
    expect(messages).toHaveLength(0)
    reader.push(frame.subarray(5))
    expect(messages).toEqual([{ hello: 'world' }])
  })

  it('reader 一次 chunk 解析多帧', () => {
    const messages: unknown[] = []
    const reader = new LspMessageReader((m) => messages.push(m))
    reader.push(Buffer.concat([encodeLspMessage({ n: 1 }), encodeLspMessage({ n: 2 })]))
    expect(messages).toEqual([{ n: 1 }, { n: 2 }])
  })
})
