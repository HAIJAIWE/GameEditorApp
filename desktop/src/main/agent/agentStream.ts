/**
 * 流式响应行泵 + HTTP 错误归一 —— 两个传输层（Ollama NDJSON / OpenAI SSE）共用的底座。
 *
 * ## 为什么单独抽一层
 * 改前 `ollamaTransport.ts` 与 `openAiTransport.ts` 各写了一遍「`getReader()` → `TextDecoder`
 * → 缓冲区切 `\n` → 逐行回调」，两份实现除分隔协议外完全相同，却有**实质差异**：
 * Ollama 那份没有 `finally { reader.releaseLock() }`（抛错时锁不释放），云端那份有。
 * 这类「复制出来的细微漂移」无法靠测试发现（两条路径各自都能过），只能靠消除重复来消除。
 *
 * ## 契约
 * - **只做切行，不解释内容**：NDJSON 与 SSE 的差异（`data:` 前缀 / `[DONE]` / 空行）留在各传输层。
 * - **尾行不丢**：流末尾若无换行符，剩余缓冲区仍会回调一次（对齐逐行实现的收尾调用）。
 * - **`\r\n` 容忍**：切行保留 `\r`，由各传输层的 `trim()` 吸收（两档服务端都实测出现过 CRLF）。
 * - **异常不吞**：`onLine` 抛出会立即中断读取并向上冒泡（传输层据此把 `error` 字段转成中文错误）。
 * - **提前退出即断流**：退出时 `finally` 会 `cancel()` 底层流（不只是 `releaseLock()`）——
 *   只解锁的话云端仍在生成、仍在计费，而我们早已不要这段输出。
 */

/** 逐行读取响应体；读完（或抛错）后必定释放 reader 锁 */
export async function pumpLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        onLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
      }
    }
    // flush：`stream:true` 的解码器可能持有跨 chunk 的多字节残片，末尾必须冲出来
    buffer += decoder.decode()
    if (buffer !== '') onLine(buffer)
  } finally {
    /*
     * 提前退出（`onLine` 抛错）时**必须显式 cancel**，不能只 `releaseLock()`：
     * 释放锁只是把 reader 摘下来，底层连接仍在被服务端推数据 —— 云端 SSE 意味着
     * 它还在生成、还在计费，而我们早就不要了。
     * 已读完的流上 `cancel()` 是 no-op；已 errored 的流会返回 rejected promise，故吞掉。
     */
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/**
 * HTTP 非 2xx 统一收敛为可读中文错误（两档一致的状态码 + 响应体摘要格式）。
 *
 * 摘要截断长度取 200：云端报错常在 JSON 里带 `param` / `code` 等定位信息，
 * 截太短会把最有用的那段切掉；截太长会把整页 HTML 错误页塞进气泡。
 */
export async function assertHttpOk(response: Response, label: string): Promise<void> {
  if (response.ok) return
  const detail = await response.text().catch(() => '')
  const trimmed = detail.trim().replace(/\s+/g, ' ')
  throw new Error(trimmed === '' ? `${label}（HTTP ${response.status}）` : `${label}（HTTP ${response.status}）：${trimmed.slice(0, 200)}`)
}

/**
 * 是否是「取消」导致的异常 —— 实现下沉在 `shared/abort.ts`（循环层/单发生成也要用，禁止反向 import）。
 * 这里 re-export 保持传输层的既有 import 站点不变。
 */
export { isAbortError } from '../../shared/abort'
