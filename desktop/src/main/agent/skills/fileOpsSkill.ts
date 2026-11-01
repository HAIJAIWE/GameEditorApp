/**
 * `system.file_ops` 内置技能（对齐 dsh `tool-fs` + `fs-sandbox`，取可用子集）。
 *
 * 让智能体在**工作区根目录内**读写/检索文件——这是「能做编程开发」的地基。
 *
 * 两条硬约束（与 dsh 同构）：
 * 1. **路径围栏**：所有路径先解析为绝对路径，再用 `isPathUnder` 校验必须位于工作区内
 *    （词法 + 文件身份双判定，防 `../` 穿越与 Windows 别名绕过）。越界抛 `PathEscapeError`。
 * 2. **沙箱策略**：`read-only` 拒绝一切变更（写/改/删/建目录/复制/移动）；`workspace-write`
 *    允许工作区内变更。策略来自 `MB_SANDBOX_POLICY`（与子智能体 CLI 沙箱同源）。
 *
 * 风险分级（见 `TOOL_RISK_MAP['system.file_ops']`）：read/list = READ_ONLY（免审批），
 * 其余 = FILE_SYSTEM（走审批门）。
 *
 * 与 dsh 的差异：dsh 的读取不受围栏限制（只有写入受限）；我们**读写都限制在工作区**，
 * 更保守（避免读到任意系统文件）。
 */

import { copyFile, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { PathEscapeError, resolveInsideRoot } from './fsContainment'

/** 单次读取上限（字符） */
export const FILE_READ_MAX_CHARS = 200_000
/** 单次写入上限（字符） */
export const FILE_WRITE_MAX_CHARS = 1_000_000
/** 列表返回条目上限 */
export const FILE_LIST_MAX_ENTRIES = 500

export type FileOpsPolicy = 'read-only' | 'workspace-write'

export interface FileOpsSkillOptions {
  /** 工作区根目录（动态读取，支持运行时切换） */
  root: () => string
  /** 沙箱策略（缺省 workspace-write） */
  policy?: FileOpsPolicy
}

const READ_ACTIONS = new Set(['read', 'list'])
const MUTATING_ACTIONS = new Set(['write', 'edit', 'delete', 'mkdir', 'copy', 'move'])

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 把异常收敛成 SkillResult（围栏错误单独标注） */
function fail(error: unknown): SkillResult {
  const message = error instanceof Error ? error.message : String(error)
  return { success: false, message: `file_ops 失败：${message}`, error: message }
}

export function createFileOpsSkill(options: FileOpsSkillOptions): SkillProtocol {
  const rootFn = options.root
  const policy: FileOpsPolicy = options.policy ?? 'workspace-write'

  async function readAction(params: Record<string, unknown>): Promise<SkillResult> {
    const abs = await resolveInsideRoot(rootFn(), asString(params.path))
    const info = await stat(abs)
    if (info.isDirectory()) {
      return { success: false, message: '目标是目录，请用 list 查看目录内容', error: 'EISDIR' }
    }
    const raw = await readFile(abs, 'utf8')
    const truncated = raw.length > FILE_READ_MAX_CHARS
    const content = truncated ? raw.slice(0, FILE_READ_MAX_CHARS) : raw
    return {
      success: true,
      message: truncated
        ? `已读取（截断到 ${FILE_READ_MAX_CHARS} 字符，原 ${raw.length} 字符）：\n${content}`
        : content,
      data: { path: params.path, bytes: raw.length, truncated }
    }
  }

  async function listAction(params: Record<string, unknown>): Promise<SkillResult> {
    const abs = await resolveInsideRoot(rootFn(), asString(params.path) === '' ? '.' : asString(params.path))
    const entries = await readdir(abs, { withFileTypes: true })
    const shown = entries.slice(0, FILE_LIST_MAX_ENTRIES)
    const lines = shown.map((entry) => `${entry.isDirectory() ? '[D]' : '[F]'} ${entry.name}`)
    const more = entries.length > shown.length ? `\n…（另有 ${entries.length - shown.length} 项未显示）` : ''
    return {
      success: true,
      message: `目录 ${asString(params.path) || '.'}（${entries.length} 项）：\n${lines.join('\n')}${more}`,
      data: { path: params.path, count: entries.length }
    }
  }

  async function writeAction(params: Record<string, unknown>): Promise<SkillResult> {
    const abs = await resolveInsideRoot(rootFn(), asString(params.path))
    const content = asString(params.content)
    if (content.length > FILE_WRITE_MAX_CHARS) {
      return { success: false, message: `写入内容超过上限 ${FILE_WRITE_MAX_CHARS} 字符`, error: 'ETOOBIG' }
    }
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
    return {
      success: true,
      message: `已写入 ${params.path}（${content.length} 字符）`,
      data: { path: params.path, chars: content.length }
    }
  }

  async function editAction(params: Record<string, unknown>): Promise<SkillResult> {
    const abs = await resolveInsideRoot(rootFn(), asString(params.path))
    const oldText = asString(params.old_text)
    const newText = asString(params.new_text)
    if (oldText === '') return { success: false, message: 'edit 需要 old_text', error: 'EBADARG' }
    const raw = await readFile(abs, 'utf8')
    const first = raw.indexOf(oldText)
    if (first < 0) return { success: false, message: `未找到待替换文本（${params.path}）`, error: 'ENOTFOUND' }
    const second = raw.indexOf(oldText, first + oldText.length)
    if (second >= 0) {
      return { success: false, message: '待替换文本出现多次，请提供更长的唯一上下文', error: 'EAMBIGUOUS' }
    }
    const next = raw.slice(0, first) + newText + raw.slice(first + oldText.length)
    await writeFile(abs, next, 'utf8')
    return { success: true, message: `已编辑 ${params.path}`, data: { path: params.path } }
  }

  async function deleteAction(params: Record<string, unknown>): Promise<SkillResult> {
    const abs = await resolveInsideRoot(rootFn(), asString(params.path))
    const info = await stat(abs)
    if (info.isDirectory()) {
      if (params.recursive !== true) {
        return { success: false, message: '目标是目录，删除需显式 recursive: true', error: 'EISDIR' }
      }
      await rm(abs, { recursive: true, force: true })
    } else {
      await unlink(abs)
    }
    return { success: true, message: `已删除 ${params.path}`, data: { path: params.path } }
  }

  async function mkdirAction(params: Record<string, unknown>): Promise<SkillResult> {
    const abs = await resolveInsideRoot(rootFn(), asString(params.path))
    await mkdir(abs, { recursive: true })
    return { success: true, message: `已创建目录 ${params.path}`, data: { path: params.path } }
  }

  async function transferAction(params: Record<string, unknown>, move: boolean): Promise<SkillResult> {
    const from = await resolveInsideRoot(rootFn(), asString(params.from))
    const to = await resolveInsideRoot(rootFn(), asString(params.to))
    await mkdir(dirname(to), { recursive: true })
    if (move) await rename(from, to)
    else await copyFile(from, to)
    return {
      success: true,
      message: `${move ? '已移动' : '已复制'} ${params.from} → ${params.to}`,
      data: { from: params.from, to: params.to }
    }
  }

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = asString(params.action)
    if (!READ_ACTIONS.has(action) && !MUTATING_ACTIONS.has(action)) {
      return { success: false, message: `未知 action: ${action}`, error: 'EBADACTION' }
    }
    // 沙箱：只读模式拒绝一切变更
    if (policy === 'read-only' && MUTATING_ACTIONS.has(action)) {
      return { success: false, message: `沙箱为 read-only，拒绝 ${action}`, error: 'FS_SANDBOX_DENIED' }
    }
    try {
      switch (action) {
        case 'read':
          return await readAction(params)
        case 'list':
          return await listAction(params)
        case 'write':
          return await writeAction(params)
        case 'edit':
          return await editAction(params)
        case 'delete':
          return await deleteAction(params)
        case 'mkdir':
          return await mkdirAction(params)
        case 'copy':
          return await transferAction(params, false)
        case 'move':
          return await transferAction(params, true)
        default:
          return { success: false, message: `未实现的 action: ${action}`, error: 'EBADACTION' }
      }
    } catch (error) {
      if (error instanceof PathEscapeError) return fail(error)
      return fail(error)
    }
  }

  return {
    id: 'system.file_ops',
    description:
      '在工作区内读写文件：read（读文本）/ list（列目录）/ write（写文件，自动建父目录）/ '
      + 'edit（用唯一 old_text 替换为 new_text）/ delete（删除，目录需 recursive）/ '
      + 'mkdir / copy / move。所有路径必须位于工作区内。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'list', 'write', 'edit', 'delete', 'mkdir', 'copy', 'move'],
          description: '操作类型'
        },
        path: { type: 'string', description: '目标路径（相对工作区根；read/list/write/edit/delete/mkdir 用）' },
        content: { type: 'string', description: 'write 的文件内容' },
        old_text: { type: 'string', description: 'edit 的待替换文本（须唯一出现）' },
        new_text: { type: 'string', description: 'edit 的替换文本' },
        from: { type: 'string', description: 'copy/move 的源路径' },
        to: { type: 'string', description: 'copy/move 的目标路径' },
        recursive: { type: 'boolean', description: 'delete 目录时需 true' }
      },
      required: ['action']
    },
    tags: ['system', 'fs'],
    execute: run
  }
}
