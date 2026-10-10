import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  schemaSaveInputSchema,
  fieldTemplateNameInputSchema,
  fieldTemplateSaveInputSchema,
  fieldIdSuggestInputSchema
} from '../../shared/schemas'
import { TYPE_TEMPLATE_NAMES } from '../../shared/typeTemplates'
import { buildFieldIdPrompt, parseFieldIdCandidates } from '../../shared/fieldIdAi'

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
   */
  handle('schema:suggestFieldIds', fieldIdSuggestInputSchema, async (req) => {
    const built = buildFieldIdPrompt(req.label, req.existingNames, {
      typeName: req.typeName,
      fieldType: req.fieldType
    })
    const { model, content } = await llmClient.generate(built.system, built.prompt, await llm.llmCallOptions())
    return { model, candidates: parseFieldIdCandidates(content, req.existingNames) }
  })
}
