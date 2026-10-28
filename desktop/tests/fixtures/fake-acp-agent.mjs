/**
 * 假 ACP agent（测试 fixture）：按 ndjson 读 JSON-RPC，最小实现 initialize / session/new /
 * session/prompt，并在 prompt 时先发一条 agent_message_chunk 通知、再回 stopReason。
 */
import { createInterface } from 'node:readline'

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  const { id, method } = message

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: 1, agentCapabilities: {} } })
    return
  }
  if (method === 'session/new') {
    send({ jsonrpc: '2.0', id, result: { sessionId: 'sess-1' } })
    return
  }
  if (method === 'session/prompt') {
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ACP 回答' } }
      }
    })
    send({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } })
    return
  }
  if (method === 'session/cancel') return

  if (typeof id === 'number') {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unknown ${String(method)}` } })
  }
})
