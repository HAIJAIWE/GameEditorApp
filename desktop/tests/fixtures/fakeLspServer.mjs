// 假 LSP 服务器：仅用于单测 system.lsp（Content-Length 分帧 + 四个只读操作）。
// 从 stdin 读帧、向 stdout 回帧；不依赖任何真实语言服务器。
import process from 'node:process'

let buffer = Buffer.alloc(0)

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, 'ascii')
  process.stdout.write(Buffer.concat([header, body]))
}

function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } })
    return
  }
  if (msg.method === 'textDocument/definition') {
    const uri = msg.params.textDocument.uri
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [{ uri, range: { start: { line: 2, character: 4 }, end: { line: 2, character: 8 } } }]
    })
    return
  }
  if (msg.method === 'textDocument/references') {
    const uri = msg.params.textDocument.uri
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        { uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
        { uri, range: { start: { line: 5, character: 2 }, end: { line: 5, character: 3 } } }
      ]
    })
    return
  }
  if (msg.method === 'textDocument/implementation') {
    const uri = msg.params.textDocument.uri
    send({ jsonrpc: '2.0', id: msg.id, result: [{ uri, range: { start: { line: 7, character: 1 }, end: { line: 7, character: 2 } } }] })
    return
  }
  if (msg.method === 'textDocument/hover') {
    send({ jsonrpc: '2.0', id: msg.id, result: { contents: { kind: 'markdown', value: '**hover text**' } } })
    return
  }
  if (msg.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: msg.id, result: null })
    return
  }
  if (msg.method === 'exit') {
    process.exit(0)
  }
  if (typeof msg.id === 'number') {
    send({ jsonrpc: '2.0', id: msg.id, result: null })
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = buffer.subarray(0, headerEnd).toString('ascii')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4)
      continue
    }
    const length = Number.parseInt(match[1], 10)
    const start = headerEnd + 4
    if (buffer.length < start + length) return
    const body = buffer.subarray(start, start + length).toString('utf8')
    buffer = buffer.subarray(start + length)
    let msg
    try {
      msg = JSON.parse(body)
    } catch {
      continue
    }
    handle(msg)
  }
})
