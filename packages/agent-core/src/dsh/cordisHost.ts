/**
 * dsh 插件的进程内宿主（cordis `Context`）。
 *
 * 背景：dsh 的插件是 **cordis 插件**（`name` + `Config` + `apply(ctx)`），不是我们的
 * `PluginManifest`。但它的运行时依赖面很小——`repeat-tool-reminder` 只 import
 * `@deepseek-ai/cordis` + `@deepseek-ai/schemastery`，并且只用 `ctx.on(...)` 注册
 * 两个事件处理器。所以我们可以**在自己的进程里**给它一个真 `Context`，
 * 用 `ctx.waterfall(...)` 在对应时机触发——插件代码原封不动地跑。
 *
 * 这推翻了原先"零 dsh 依赖"的约定（2026-11-02 用户拍板放开），见
 * `docs/plugin-architecture.md` 的定位段落。
 *
 * @module agent-core/dsh/cordisHost
 */

import { Context } from '@deepseek-ai/cordis'
import * as repeatToolReminder from '@deepseek-ai/dsh-repeat-tool-reminder'

/** cordis 的 `waterfall` 不在公开类型里（挂在 Context 实例上），这里只声明用到的那一小块 */
interface WaterfallContext {
  waterfall(event: string, ...args: unknown[]): Promise<unknown>
}

/** 进程内宿主 */
export interface DshCordisHost {
  readonly ctx: Context
  /**
   * 触发一次 `tools/post-execute` 瀑布，返回插件附加的**提醒文本**。
   * @param input - 工具名、已冻结参数、**会话对象**（dsh 用 WeakMap 以它为链键，
   *   必须是对象且按会话稳定——传字符串会抛 "Invalid value used as weak map key"）
   */
  postExecute(input: { name: string; arguments: unknown; agent: object }): Promise<string[]>
  dispose(): void
}

/** 从 dsh 的 `ContentBlock[]` 里抽文本（只认 `{type:'text'}`） */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (block === null || typeof block !== 'object') return ''
      const record = block as { type?: unknown; text?: unknown }
      return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
    })
    .filter((text) => text !== '')
    .join('\n')
}

/**
 * 创建进程内宿主并挂载 dsh 插件。
 *
 * 目前只挂 `repeat-tool-reminder`（零服务依赖，最安全的第一步）。
 * @returns 宿主句柄
 */
export async function createDshCordisHost(): Promise<DshCordisHost> {
  const ctx = new Context()
  // cordis 接受"命名导出集合"作为插件模块（apply / name / Config）
  // cordis 的 `plugin` 在类型里要求 `Plugin`（类/函数/对象三种形态），这里用结构签名调用，
  // 避免把命名空间模块强转成 `never` 后 config 也变成 `never`
  const mount = (ctx as unknown as { plugin(plugin: unknown, config?: unknown): unknown }).plugin
  mount.call(ctx, repeatToolReminder, {})
  // cordis 的 fiber 挂载是异步的：处理器在下一个微任务才真正注册，
  // 不等这一拍，第一次 waterfall 会静默漏掉插件。
  await Promise.resolve()

  return {
    ctx,
    async postExecute(input) {
      const exec = { name: input.name, arguments: input.arguments, agent: input.agent }
      // 最后一个参数是**最内层 next**：没有其它监听器时返回 accept（不否决、不改写）
      const waterfall = (ctx as unknown as WaterfallContext).waterfall
      if (typeof waterfall !== 'function') return []
      const decision = await waterfall.call(ctx, 'tools/post-execute', exec, { isError: false, content: [] }, () => ({
        kind: 'accept'
      }))
      const contexts = (decision as { additionalContexts?: unknown } | undefined)?.additionalContexts
      if (!Array.isArray(contexts)) return []
      return contexts
        .map((message) => extractText((message as { content?: unknown } | null)?.content))
        .filter((text) => text !== '')
    },
    dispose() {
      const fiber = (ctx as unknown as { fiber?: { dispose?(): void } }).fiber
      fiber?.dispose?.()
    }
  }
}
