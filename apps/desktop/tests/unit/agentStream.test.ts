import { describe, expect, it } from 'vitest'

import { assertHttpOk, isAbortError, pumpLines } from '@mobai/agent-core/transport/agentStream'

/*
 * 行泵是两个传输层（Ollama NDJSON / OpenAI SSE）共用的底座，改前各写一份且已漂移
 * （本地那份缺 `finally { releaseLock() }`）。这里把「契约」逐条钉住：
 * 尾行不丢、`\r\n` 容忍、异常冒泡、**提前退出要 cancel 底层流**。
 */

/** 用固定分片造一个流；`end:false` 时保持未关闭（模拟仍在产出的 SSE） */
function streamOf(chunks: string[], options: { end?: boolean; onCancel?: () => void } = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index += 1
        return
      }
      if (options.end !== false) controller.close()
    },
    cancel() {
      options.onCancel?.()
    }
  })
}

describe('pumpLines', () => {
  it('按行回调，且尾行无换行符也不丢', async () => {
    const lines: string[] = []
    await pumpLines(streamOf(['a\nb\nc']), (line) => lines.push(line))
    expect(lines).toEqual(['a', 'b', 'c'])
  })

  it('跨 chunk 的半行会拼好再回调（不在 chunk 边界处切断）', async () => {
    const lines: string[] = []
    await pumpLines(streamOf(['he', 'llo\nwo', 'rld\n']), (line) => lines.push(line))
    expect(lines).toEqual(['hello', 'world'])
  })

  it('保留 \\r 由调用方 trim 吸收（两档服务端都实测出现过 CRLF）', async () => {
    const lines: string[] = []
    await pumpLines(streamOf(['a\r\nb\r\n']), (line) => lines.push(line))
    expect(lines).toEqual(['a\r', 'b\r'])
  })

  it('多字节字符被 chunk 切开仍能正确解码', async () => {
    // 「剑」= e5 89 91；把 UTF-8 字节拆到两个 chunk 里
    const bytes = new TextEncoder().encode('剑\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1))
        controller.enqueue(bytes.slice(1))
        controller.close()
      }
    })
    const lines: string[] = []
    await pumpLines(stream, (line) => lines.push(line))
    expect(lines).toEqual(['剑'])
  })

  it('onLine 抛错 → 原样冒泡，并 cancel 底层流（否则云端还在生成、还在计费）', async () => {
    let cancelled = false
    const stream = streamOf(['x\n', 'y\n'], { end: false, onCancel: () => (cancelled = true) })
    await expect(
      pumpLines(stream, () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(cancelled).toBe(true)
  })

  it('正常读完不报错，也不因 cancel 影响结果', async () => {
    const lines: string[] = []
    await expect(pumpLines(streamOf(['only\n']), (line) => lines.push(line))).resolves.toBeUndefined()
    expect(lines).toEqual(['only'])
  })
})

describe('assertHttpOk', () => {
  it('2xx 直接放行', async () => {
    await expect(assertHttpOk(new Response('ok', { status: 200 }), 'AI 调用失败')).resolves.toBeUndefined()
  })

  it('非 2xx → 中文错误带状态码与响应体摘要（截断到 200 字）', async () => {
    const body = 'x'.repeat(500)
    await expect(assertHttpOk(new Response(body, { status: 400 }), 'AI 调用失败')).rejects.toThrow(
      `AI 调用失败（HTTP 400）：${'x'.repeat(200)}`
    )
  })

  it('响应体为空 → 只报状态码（不拼一个空冒号）', async () => {
    await expect(assertHttpOk(new Response('', { status: 503 }), 'AI 调用失败')).rejects.toThrow(
      'AI 调用失败（HTTP 503）'
    )
  })
})

describe('isAbortError（re-export 自 shared/abort）', () => {
  it('认 name=AbortError 与 code=ABORT_ERR 两种真实形态', () => {
    const byName = new Error('aborted')
    byName.name = 'AbortError'
    expect(isAbortError(byName)).toBe(true)
    expect(isAbortError(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }))).toBe(true)
    expect(isAbortError(new Error('ECONNRESET'))).toBe(false)
  })
})
