/**
 * `system.lsp` 内置技能（对齐 dsh `tool-lsp` 的四个只读导航操作）。
 *
 * 让智能体**精确导航代码**：跳转定义、查找引用、查实现、读悬停文档。文本搜索说不清时用它，
 * 或在改动前确认符号的精确位置。
 *
 * 语言服务器由部署自备（`<库>/lsp.json` 声明扩展名 → 命令），我们不随附。
 * 坐标：模型给 **1-based** 行列，内部转 LSP 的 **0-based**。
 * 风险：只读（`TOOL_RISK_MAP['system.lsp'] = READ_ONLY`），免审批。
 */

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { LspClient, type LspServerSpec } from '../lsp/lspClient'
import { resolveInsideRoot } from './fsContainment'

const ACTIONS = ['definition', 'references', 'implementation', 'hover'] as const
type LspAction = (typeof ACTIONS)[number]

const METHOD: Record<LspAction, string> = {
  definition: 'textDocument/definition',
  references: 'textDocument/references',
  implementation: 'textDocument/implementation',
  hover: 'textDocument/hover'
}

/** 扩展名 → LSP languageId（服务器据此选语言；未识别的回 plaintext） */
const LANGUAGE_IDS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.lua': 'lua',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.css': 'css',
  '.html': 'html'
}

const DEFAULT_TIMEOUT_MS = 15_000
/** 结果条数上限（防大仓库 references 刷屏） */
const MAX_LOCATIONS = 100

export interface LspSkillOptions {
  root: () => string
  resolveServer: (filePath: string) => LspServerSpec | null
  timeoutMs?: number
}

interface LspPos {
  line: number
  character: number
}

interface LspRange {
  start: LspPos
}

interface LspLocation {
  uri: string
  range: LspRange
}

interface LspLocationLink {
  targetUri: string
  targetRange: LspRange
  targetSelectionRange?: LspRange
}

function toPos(raw: unknown): LspPos | null {
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as { line?: unknown; character?: unknown }
  if (typeof record.line !== 'number' || typeof record.character !== 'number') return null
  return { line: record.line, character: record.character }
}

function safeFilePath(uri: string): string {
  try {
    return fileURLToPath(uri)
  } catch {
    return uri
  }
}

/** 一条 Location / LocationLink → `path:line:col`（1-based 展示） */
function formatLocation(loc: LspLocation | LspLocationLink): string {
  const uri = 'uri' in loc ? loc.uri : loc.targetUri
  const range = 'range' in loc ? loc.range : loc.targetSelectionRange ?? loc.targetRange
  const pos = toPos(range.start)
  const path = safeFilePath(uri)
  return pos === null ? path : `${path}:${pos.line + 1}:${pos.character + 1}`
}

/** Hover → 纯文本（contents 可能是 string / MarkupContent / MarkedString[]） */
function formatHover(result: unknown): string {
  if (result === null || typeof result !== 'object') return ''
  const contents = (result as { contents?: unknown }).contents
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        if (typeof item === 'string') return item
        if (item !== null && typeof item === 'object') {
          const value = (item as { value?: unknown }).value
          return typeof value === 'string' ? value : ''
        }
        return ''
      })
      .filter((text) => text !== '')
      .join('\n\n')
  }
  if (contents !== null && typeof contents === 'object') {
    const value = (contents as { value?: unknown }).value
    return typeof value === 'string' ? value : ''
  }
  return ''
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `lsp 失败：${message}`, error }
}

export function createLspSkill(options: LspSkillOptions): SkillProtocol {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as LspAction)) {
      return fail(`未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, 'EBADACTION')
    }
    const line = typeof params.line === 'number' ? params.line : Number.parseInt(String(params.line ?? ''), 10)
    const character =
      typeof params.character === 'number' ? params.character : Number.parseInt(String(params.character ?? ''), 10)
    if (!Number.isInteger(line) || line < 1 || !Number.isInteger(character) || character < 1) {
      return fail('line / character 必须是 ≥1 的整数（1-based）', 'EBADARG')
    }

    let abs: string
    try {
      abs = await resolveInsideRoot(options.root(), typeof params.path === 'string' ? params.path : '')
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EESCAPE')
    }

    const spec = options.resolveServer(abs)
    if (spec === null) {
      return fail(`该文件类型未配置语言服务器（在 <库>/lsp.json 声明 ${extname(abs) || '该扩展名'} 的服务器）`, 'ENOSERVER')
    }

    let content: string
    try {
      content = await readFile(abs, 'utf8')
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EREAD')
    }

    const uri = pathToFileURL(abs).toString()
    const languageId = LANGUAGE_IDS[extname(abs).toLowerCase()] ?? 'plaintext'
    const client = new LspClient(spec, options.root())
    try {
      await client.start(timeoutMs)
      client.notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text: content } })
      const position = { line: line - 1, character: character - 1 }
      const method = METHOD[action as LspAction]
      const requestParams =
        action === 'references'
          ? { textDocument: { uri }, position, context: { includeDeclaration: true } }
          : { textDocument: { uri }, position }
      const result = await client.request(method, requestParams, timeoutMs)

      if (action === 'hover') {
        const text = formatHover(result)
        return { success: true, message: text === '' ? '（无悬停信息）' : text, data: result }
      }

      const list: unknown[] = result === null || result === undefined ? [] : Array.isArray(result) ? result : [result]
      if (list.length === 0) return { success: true, message: '（未找到结果）', data: [] }
      const lines = list.slice(0, MAX_LOCATIONS).map((loc) => formatLocation(loc as LspLocation | LspLocationLink))
      const more = list.length > MAX_LOCATIONS ? `\n…（另有 ${list.length - MAX_LOCATIONS} 处未显示）` : ''
      return { success: true, message: `${action}（${list.length} 处）：\n${lines.join('\n')}${more}`, data: list }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const stderr = client.stderrText()
      return fail(stderr === '' ? message : `${message}\n${stderr.slice(0, 500)}`, 'ELSP')
    } finally {
      await client.stop()
    }
  }

  return {
    id: 'system.lsp',
    description:
      '精确代码导航（只读）：definition=跳转定义 / references=查找引用（含声明）/ '
      + 'implementation=查找实现 / hover=悬停文档。坐标为 1-based 行列。'
      + '文本搜索说不清或改动前确认符号位置时用；语言服务器需在 <库>/lsp.json 配置。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '导航操作' },
        path: { type: 'string', description: '文件路径（相对工作区根）' },
        line: { type: 'integer', description: '行号（1-based）' },
        character: { type: 'integer', description: '列号（1-based，UTF-16）' }
      },
      required: ['action', 'path', 'line', 'character']
    },
    tags: ['system', 'lsp'],
    execute: run
  }
}
