import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

import {
  applyCustomTemplateUpdate,
  buildTemplateExportFile,
  createCustomTemplate,
  filterCustomTemplates,
  normalizeTemplateCategory,
  parseTemplateCategoryFile,
  parseTemplatesImportFile,
  safeTemplateCategory,
  serializeTemplateCategoryFile,
  type CeshuCustomTemplate,
  type CustomTemplateDraft,
  type CustomTemplateUpdate
} from '../../shared/ceshu/reference/ceshuCustomTemplates'
import { formatLocalTimestamp } from '../../shared/ceshu/model/ceshuModel'

/**
 * 自定义模板存储：每个分类一个 JSON 文件（<dir>/<category>.json，结构 {"templates": [...]}），
 * 与 早期版本 data/custom_templates/<category>.json 同构。
 * 写操作经串行队列 + 「临时文件 + rename」原子替换（唯一写者）。
 * 相对 旧版 的改进：损坏文件抛中文错误（含文件名），而非静默当作空列表（避免后续写入覆盖丢模板）。
 */
export class CeshuTemplateStore {
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly dir: string) {}

  /** 列出模板（可选按章节筛选；不传或空串返回全部分类，按创建时间升序） */
  list(chapterKey?: string): CeshuCustomTemplate[] {
    return filterCustomTemplates(this.flatten(), chapterKey)
  }

  /** 新建模板（名称必填；章节为空归入 global 分类） */
  save(draft: CustomTemplateDraft): Promise<CeshuCustomTemplate> {
    return this.enqueueWrite(() => {
      const template = createCustomTemplate(draft, formatLocalTimestamp())
      const category = normalizeTemplateCategory(template.chapter_key)
      const existing = this.readCategory(category)
      this.writeCategory(category, [...existing, template])
      return template
    })
  }

  /** 删除模板（跨分类查找；不存在返回 deleted=false，不写盘） */
  remove(templateId: string): Promise<{ deleted: boolean }> {
    return this.enqueueWrite(() => {
      if (!templateId) return { deleted: false }
      for (const [category, templates] of Object.entries(this.readAll())) {
        const next = templates.filter((template) => template.id !== templateId)
        if (next.length === templates.length) continue
        this.writeCategory(category, next)
        return { deleted: true }
      }
      return { deleted: false }
    })
  }

  /**
   * 更新模板：
   * 跨分类查找 → 字段归一化（名称传入但为空视为失败）→ 章节变化时迁移分类文件。
   */
  update(templateId: string, fields: CustomTemplateUpdate): Promise<{ updated: boolean }> {
    return this.enqueueWrite(() => {
      if (!templateId) return { updated: false }
      const all = this.readAll()
      for (const [category, templates] of Object.entries(all)) {
        const target = templates.find((template) => template.id === templateId)
        if (!target) continue
        const next = applyCustomTemplateUpdate(target, fields, formatLocalTimestamp())
        if (!next) return { updated: false }
        const nextCategory = normalizeTemplateCategory(next.chapter_key)
        if (nextCategory === category) {
          this.writeCategory(category, templates.map((item) => (item.id === templateId ? next : item)))
        } else {
          this.writeCategory(
            category,
            templates.filter((item) => item.id !== templateId)
          )
          this.writeCategory(nextCategory, [...this.readCategory(nextCategory), next])
        }
        return { updated: true }
      }
      return { updated: false }
    })
  }

  /** 导出全部自定义模板为 JSON */
  exportAll(outputPath: string): Promise<{ filePath: string; count: number }> {
    return this.enqueueWrite(() => {
      const payload = buildTemplateExportFile(this.readAll(), formatLocalTimestamp())
      const filePath = extname(outputPath).toLowerCase() === '.json' ? outputPath : `${outputPath}.json`
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { filePath, count: payload.templates.length }
    })
  }

  /**
   * 从 JSON 导入模板：
   * 支持 `{"templates": [...]}` 与裸数组；同 id 已存在时默认跳过（overwrite=true 先删除再写入）。
   */
  importFrom(inputPath: string, overwrite = false): Promise<{ imported: number; skipped: number }> {
    return this.enqueueWrite(() => {
      if (!existsSync(inputPath)) {
        throw new Error(`模板文件不存在：${inputPath}`)
      }
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(inputPath, 'utf-8'))
      } catch {
        throw new Error(`模板文件内容损坏（JSON 解析失败）：${basename(inputPath)}`)
      }
      const parsed = parseTemplatesImportFile(raw, formatLocalTimestamp())
      const all = this.readAll()
      const existingIds = new Set(Object.values(all).flat().map((template) => template.id))
      const buckets = new Map<string, CeshuCustomTemplate[]>()
      let imported = 0
      let skipped = parsed.skipped

      for (const template of parsed.templates) {
        const duplicate = existingIds.has(template.id)
        if (duplicate && !overwrite) {
          skipped += 1
          continue
        }
        const category = normalizeTemplateCategory(template.chapter_key)
        const bucket = buckets.get(category) ?? []
        if (duplicate) {
          // 覆盖：从原分类移除旧条目（旧分类可能与本条目标分类不同）
          for (const [oldCategory, list] of Object.entries(all)) {
            if (list.some((item) => item.id === template.id)) {
              all[oldCategory] = list.filter((item) => item.id !== template.id)
            }
          }
        }
        bucket.push(template)
        buckets.set(category, bucket)
        imported += 1
      }

      // 覆盖模式先落盘被摘除的分类，再逐分类追加
      if (overwrite) {
        for (const [category, list] of Object.entries(all)) {
          this.writeCategory(category, list)
        }
      }
      for (const [category, list] of buckets) {
        const existing = this.readCategory(category)
        this.writeCategory(category, [...existing, ...list])
      }
      return { imported, skipped }
    })
  }

  /** 展平所有分类 */
  private flatten(): CeshuCustomTemplate[] {
    return Object.values(this.readAll()).flat()
  }

  private readAll(): Record<string, CeshuCustomTemplate[]> {
    let files: string[]
    try {
      files = readdirSync(this.dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw new Error(`读取模板目录失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    const result: Record<string, CeshuCustomTemplate[]> = {}
    for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
      result[basename(file, '.json')] = this.readCategoryFile(join(this.dir, file), file)
    }
    return result
  }

  private readCategory(category: string): CeshuCustomTemplate[] {
    const file = `${safeTemplateCategory(category)}.json`
    const path = join(this.dir, file)
    if (!existsSync(path)) return []
    return this.readCategoryFile(path, file)
  }

  private readCategoryFile(path: string, displayName: string): CeshuCustomTemplate[] {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch (error) {
      throw new Error(`读取模板文件失败（${displayName}）：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }
    try {
      return parseTemplateCategoryFile(JSON.parse(text))
    } catch {
      throw new Error(`模板文件内容损坏（JSON 解析失败）：${displayName}`)
    }
  }

  private writeCategory(category: string, templates: CeshuCustomTemplate[]): void {
    mkdirSync(this.dir, { recursive: true })
    const path = join(this.dir, `${safeTemplateCategory(category)}.json`)
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, JSON.stringify(serializeTemplateCategoryFile(templates), null, 2), 'utf-8')
    renameSync(tmpPath, path)
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}