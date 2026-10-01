import { Ollama } from 'ollama'

/**
 * 本地 LLM 客户端（ollama）：Phase 1 预演选型。
 * - 服务未启动/无模型时给出中文可操作提示，不阻塞应用其余功能；
 * - 主机：MB_OLLAMA_HOST（默认 http://127.0.0.1:11434）；模型：MB_OLLAMA_MODEL 或列表第一个。
 */

export interface LlmStatus {
  available: boolean
  models: string[]
  message: string
}

const DEFAULT_HOST = 'http://127.0.0.1:11434'

function resolveHost(): string {
  return process.env['MB_OLLAMA_HOST'] ?? DEFAULT_HOST
}

function resolveModel(models: string[]): string | undefined {
  const preferred = process.env['MB_OLLAMA_MODEL']
  if (preferred) return preferred
  return models[0]
}

export class LlmClient {
  /** 探测本地服务与模型可用性（不抛错，供状态提示用） */
  async status(): Promise<LlmStatus> {
    try {
      const client = new Ollama({ host: resolveHost() })
      const list = await client.list()
      const models = list.models.map((model) => model.name).sort()
      if (models.length === 0) {
        return {
          available: false,
          models,
          message: '未检测到本地模型，请先执行 ollama pull（如 ollama pull qwen3:8b）后重试'
        }
      }
      return { available: true, models, message: `本地模型 ${models.length} 个` }
    } catch {
      return {
        available: false,
        models: [],
        message: `未检测到本地 Ollama 服务，请先启动（ollama serve，地址 ${resolveHost()}）后重试`
      }
    }
  }

  /** 调用 LLM 生成文本；失败抛中文错误（UI 直接展示） */
  async generate(system: string, prompt: string): Promise<{ model: string; content: string }> {
    const status = await this.status()
    if (!status.available) {
      throw new Error(status.message)
    }
    const model = resolveModel(status.models)
    if (!model) {
      throw new Error('未检测到可用模型，请先 ollama pull 拉取模型')
    }
    try {
      const client = new Ollama({ host: resolveHost() })
      const response = await client.generate({
        model,
        system,
        prompt,
        options: { temperature: 0.7 }
      })
      return { model, content: response.response ?? '' }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`AI 调用失败：${detail.slice(0, 120)}`, { cause: error })
    }
  }
}