import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import { llmConfigureInputSchema, llmStatusInputSchema, llmGenerateInputSchema, llmTestConnectionInputSchema } from '../../shared/schema/schemas'

export function registerLlmIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const { llmClient } = deps
  handle('llm:configure', llmConfigureInputSchema, (req) => {
    llm.setConfigMirror(req.config)
    return { ok: true }
  })
  handle('llm:status', llmStatusInputSchema, async () => llmClient.status(await llm.llmCallOptions()))
  handle('llm:generate', llmGenerateInputSchema, async (req) =>
    llmClient.generate(req.system, req.prompt, await llm.llmCallOptions())
  )
  handle('llm:testConnection', llmTestConnectionInputSchema, async () => {
    const callOpts = await llm.llmCallOptions()
    return llmClient.testConnection(callOpts)
  })
}
