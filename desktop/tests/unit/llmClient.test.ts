import { describe, expect, it } from 'vitest'

import { LlmClient } from '../../src/main/llm/client'

describe('本地 LLM 客户端（ollama）', () => {
  it('服务不可达：状态探测返回可用性 false + 中文可操作提示；generate 抛出同一提示', async () => {
    process.env['MB_OLLAMA_HOST'] = 'http://127.0.0.1:1'
    try {
      const client = new LlmClient()
      const status = await client.status()
      expect(status.available).toBe(false)
      expect(status.models).toEqual([])
      expect(status.message).toContain('Ollama')
      expect(status.message).toContain('ollama serve')

      await expect(client.generate('system', 'prompt')).rejects.toThrow('Ollama')
    } finally {
      delete process.env['MB_OLLAMA_HOST']
    }
  })
})