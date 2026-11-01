/**
 * `system.tech_doc` 内置技能：技术设计文档（TDD / Technical Design Document）的读写。
 *
 * 与 `system.ceshu`（GDD 策划书）分工：策划书说「游戏是什么」，技术设计文档说「**怎么实现**」。
 * 文档存 `<库>/tech/<name>.md`（产品侧工件，与代码工作区 `<库>/code` 分开）。
 *
 * 能力：
 * - outline：返回标准章节大纲 + 写作指引（模型照着写，产出结构一致）
 * - write：按 name 保存整篇 markdown（自动建目录）
 * - read：读取已有文档
 * - list：列出已存在的技术设计文档
 *
 * 风险：outline/read/list = READ_ONLY；write = DATA_WRITE（走审批）。
 */

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { techDocOutline } from '../../../shared/agent/techDoc/techDocSchema'

const ACTIONS = ['outline', 'read', 'write', 'list', 'delete'] as const

/** 单篇文档上限（字符） */
export const TECH_DOC_MAX_CHARS = 200_000

export interface TechDocSkillOptions {
  /** 技术设计文档目录（`<库>/tech`） */
  root: () => string
}

/** 文档名安全校验：非空、不含路径分隔符与非法字符、非 `.`/`..` */
export function isSafeDocName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false
  if (name.includes('/') || name.includes('\\')) return false
  if (/[<>:"|?*]/.test(name)) return false
  // 拒绝控制字符（< 32）；显式遍历而非正则，避免 no-control-regex
  for (const char of name) {
    if (char.charCodeAt(0) < 32) return false
  }
  return true
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `tech_doc 失败：${message}`, error }
}

export function createTechDocSkill(options: TechDocSkillOptions): SkillProtocol {
  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return fail(`未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, 'EBADACTION')
    }
    const root = options.root()

    if (action === 'outline') {
      return { success: true, message: techDocOutline(), data: { sections: '标准 9 章' } }
    }

    if (action === 'list') {
      try {
        const entries = await readdir(root)
        const docs = entries.filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3))
        if (docs.length === 0) return { success: true, message: '当前没有技术设计文档。', data: { docs: [] } }
        return { success: true, message: `技术设计文档（${docs.length}）：\n${docs.join('\n')}`, data: { docs } }
      } catch {
        return { success: true, message: '当前没有技术设计文档。', data: { docs: [] } }
      }
    }

    const name = typeof params.name === 'string' ? params.name.trim() : ''
    if (!isSafeDocName(name)) {
      return fail('name 非法（不能为空、不能含路径分隔符或 <>:"|?*）', 'EBADNAME')
    }
    const path = join(root, `${name}.md`)

    if (action === 'delete') {
      try {
        await unlink(path)
        return { success: true, message: `已删除 ${name}`, data: { name } }
      } catch {
        return fail(`未找到文档：${name}`, 'ENOTFOUND')
      }
    }

    if (action === 'read') {
      try {
        const content = await readFile(path, 'utf8')
        return { success: true, message: content, data: { name } }
      } catch {
        return fail(`未找到文档：${name}`, 'ENOTFOUND')
      }
    }

    // write
    const content = typeof params.content === 'string' ? params.content : ''
    if (content.trim() === '') return fail('content 不能为空', 'EBADARG')
    if (content.length > TECH_DOC_MAX_CHARS) {
      return fail(`content 超过上限 ${TECH_DOC_MAX_CHARS} 字符`, 'ETOOBIG')
    }
    try {
      await mkdir(root, { recursive: true })
      await writeFile(path, content, 'utf8')
      return { success: true, message: `已保存技术设计文档 ${name}（${content.length} 字符）`, data: { name } }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EWRITE')
    }
  }

  return {
    id: 'system.tech_doc',
    description:
      '技术设计文档（怎么实现，区别于策划书 GDD）：outline=返回标准章节大纲与写作指引 / '
      + 'write=按 name 保存整篇 markdown / read=读取 / list=列出 / delete=删除。文档存 <库>/tech/<name>.md。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        name: { type: 'string', description: '文档名（不含扩展名，不含路径分隔符）' },
        content: { type: 'string', description: 'write 时的完整 markdown' }
      },
      required: ['action']
    },
    tags: ['system', 'design'],
    execute: run
  }
}
