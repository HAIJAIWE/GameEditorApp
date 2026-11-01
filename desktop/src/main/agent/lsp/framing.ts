/**
 * LSP 消息分帧（对齐 LSP 规范的 `Content-Length` 头 + JSON body）。
 *
 * LSP 走 `Content-Length: <字节数>\r\n\r\n<utf8 json>`。**必须按字节而非字符**切分——
 * 中文等 UTF-8 多字节内容按字符切会错位。故 Reader 全程用 `Buffer` 累积与切分。
 */

/** 把一条 JSON-RPC 消息编码为 LSP 帧（Buffer） */
export function encodeLspMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, 'ascii')
  return Buffer.concat([header, body])
}

/**
 * 流式解析 LSP 帧。`push(chunk)` 喂入字节；每解析出一条完整消息回调 `onMessage`。
 * 半包留在内部缓冲，等后续 chunk。
 */
export class LspMessageReader {
  private buffer: Buffer = Buffer.alloc(0)

  constructor(private readonly onMessage: (message: unknown) => void) {}

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = /Content-Length:\s*(\d+)/i.exec(header)
      if (match === null) {
        // 头不合法：丢弃到下一个分隔符，避免死循环
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }
      const length = Number.parseInt(match[1] ?? '0', 10)
      const bodyStart = headerEnd + 4
      if (this.buffer.length < bodyStart + length) return // 半包，等更多
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
      this.buffer = this.buffer.subarray(bodyStart + length)
      try {
        this.onMessage(JSON.parse(body))
      } catch {
        // 坏 JSON：跳过该帧，不让整个连接崩掉
      }
    }
  }
}
