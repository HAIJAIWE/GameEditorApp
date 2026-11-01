/**
 * shared/schema/core —— 数据类型 schema 核心：表单分组布局、类型查询、新类型模板。
 *
 * 输入 schema（zod）与内置类型表属于 `.../schema/adapters`，本入口不再转发。
 * 外部一律从这里 import（`.../core`），不要再深插目录内文件。
 */

export { COMPLEX_FIELD_TYPES, FORM_GROUPS, buildFormLayout, isComplexFieldType } from './formSections'
export type { FormLayout, FormSection, FormSectionDef } from './formSections'
export { getTypeById, getTypeByLegacyKey } from './typeSchema'
export { TYPE_TEMPLATES, TYPE_TEMPLATE_NAMES, TYPE_TEMPLATE_SECTIONS, buildNewTypeDraft } from './typeTemplates'
export type { TemplateSectionSuggestion } from './typeTemplates'
