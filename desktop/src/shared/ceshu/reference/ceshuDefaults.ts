import { SYSTEM_LABELS, type ChapterData, type ChapterKey } from './ceshuConstants'
import { SYSTEM_CONFIG_SCHEMA } from '../model/systemConfigSchema'
// 档 4：每章默认数据已随 defaults 收进 ceshuSchema/<章>.ts，此处只做「聚合 + 动态覆盖」。
import { CHAPTER_SCHEMAS } from '../../ceshuSchema'

function today(): string {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** 按 SYSTEM_CONFIG_SCHEMA 生成某系统的空 config（键顺序与 schema 一致，值全为 ''） */
function emptyConfig(systemKey: string): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const fieldName of Object.keys(SYSTEM_CONFIG_SCHEMA[systemKey])) {
    config[fieldName] = ''
  }
  return config
}

/** 13 个系统均默认 disabled，config 带标准字段（值为空字符串） */
function createDefaultSystems(): Record<string, unknown> {
  const systems: Record<string, unknown> = {}
  for (const [key, label] of Object.entries(SYSTEM_LABELS)) {
    systems[key] = { enabled: false, name: label, config: emptyConfig(key) }
  }
  return systems
}

/**
 * 取全 24 章的默认数据：遍历 `CHAPTER_SCHEMAS` 深拷贝各章 `schema.defaults`。
 *
 * ⚠️ 必须**深拷贝**：直接 `{ ...CHAPTER_SCHEMAS[ch].defaults }` 只做浅拷贝，
 * 各章默认对象会在所有新文档间共享——任何一处就地修改（测试里 `doc.qa.test_case_list = rows`、
 * 未来的迁移脚本）都会污染后续所有文档的默认值。2026-10-24 由「空清单静默」用例被前序用例污染而暴露。
 *
 * 两处动态覆盖保持旧行为（默认值本体来自 schema，但这两项每次新建都该是实时/全新的）：
 * - `meta.date` / `meta.version`：文档创建时间与初始版本号，不应冻结成生成时的字面值；
 * - `systems`：13 个系统每次全新构建（避免共享同一份 config 引用）。
 */
export function createDefaultChapters(): Record<ChapterKey, ChapterData> {
  const out: Partial<Record<ChapterKey, ChapterData>> = {}
  for (const [key, schema] of Object.entries(CHAPTER_SCHEMAS)) {
    out[key as ChapterKey] = structuredClone(schema.defaults ?? {})
  }
  out.meta = { ...(out.meta as ChapterData), date: today(), version: '0.1.0' }
  out.systems = createDefaultSystems()
  return out as Record<ChapterKey, ChapterData>
}
