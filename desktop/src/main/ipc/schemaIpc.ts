import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  schemaSaveInputSchema,
  fieldTemplateNameInputSchema,
  fieldTemplateSaveInputSchema,
  fieldIdSuggestInputSchema
} from '../../shared/schemas'
import { TYPE_TEMPLATE_NAMES } from '../../shared/typeTemplates'
import { buildFieldIdPrompt, parseFieldIdCandidates } from '../../shared/util/fieldIdAi'
import { runSingleShotTask } from '../agent/runTask'
import { estimateTokens } from '../../shared/agent/budget'

export function registerSchemaIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const { typeSchemaStore, fieldTemplates, llmClient } = deps
  handle('schema:list', undefined, () => typeSchemaStore.getTypes())
  handle('schema:save', schemaSaveInputSchema, (req) => typeSchemaStore.saveTypes(req.types))
  // 用户自定义字段模板（存完整 TypeFieldDef[]，非 Python 那样只存标签）
  handle('schema:listFieldTemplates', undefined, () => ({
    builtin: [...TYPE_TEMPLATE_NAMES],
    custom: fieldTemplates.listNames()
  }))
  handle('schema:getFieldTemplate', fieldTemplateNameInputSchema, (req) => ({
    fields: fieldTemplates.get(req.name)
  }))
  handle('schema:saveFieldTemplate', fieldTemplateSaveInputSchema, (req) => {
    fieldTemplates.save(req.name, req.fields)
    return { name: req.name }
  })
  handle('schema:deleteFieldTemplate', fieldTemplateNameInputSchema, (req) => ({
    deleted: fieldTemplates.remove(req.name)
  }))
  /**
   * 字段 ID 的 AI 候选：术语表未收录时由用户显式点击触发。
   * 模型给出但清洗后不合法的候选会被丢弃，绝不产出垃圾。
   *
   * 走 `runSingleShotTask`（与其他单发 AI 一致）：登记取消归属，面板点「停止」→
   * `task:cancel` 中断在途生成；此前这里裸调 `generate`，用户点了没反应、只能等超时。
   */
  handle('schema:suggestFieldIds', fieldIdSuggestInputSchema, async (req, event) => {
    const built = buildFieldIdPrompt(req.label, req.existingNames, {
      typeName: req.typeName,
      fieldType: req.fieldType
    })
    const callOpts = await llm.llmCallOptions()
    const isCloud = llm.isCloudCall(callOpts)
    const task = await runSingleShotTask({
      isCloud,
      estimatedTokens: estimateTokens(built.system + built.prompt),
      // 轻量辅助任务（产出字段名候选），归 review 档
      taskType: 'review',
      senderId: event.sender.id,
      run: async (signal) => {
        const { model, content } = await llmClient.generate(built.system, built.prompt, {
          ...callOpts,
          ...(signal !== undefined ? { signal } : {})
        })
        return { value: { model, candidates: parseFieldIdCandidates(content, req.existingNames) }, model }
      }
    })
    return task.value
  })
}
