import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import {
  createCustomTemplate,
  filterCustomTemplates,
  normalizeTemplateCategory,
  parseTemplateCategoryFile,
  safeTemplateCategory,
  serializeTemplateCategoryFile,
  type CeshuCustomTemplate,
  type CustomTemplateDraft
} from '../../shared/ceshuCustomTemplates'
import { formatLocalTimestamp } from '../../shared/ceshuModel'

/**
 * 自定义模板存储：每个分类一个 JSON 文件（<dir>/<category>.json，结构 {"templates": [...]}），
 * 与 Python 版 data/custom_templates/<category>.json 同构。
 * 写操作经串行队列 + 「临时文件 + rename」原子替换（唯一写者）。
 * 相对 Python 的改进：损坏文件抛中文错误（含文件名），而非静默当作空列表（避免后续写入覆盖丢模板）。
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

  /** 展平所有分类（分类顺序按文件名排序，与 Python `sorted(glob("*.json"))` 一致） */
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