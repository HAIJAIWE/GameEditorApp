/**
 * 语言服务器配置解析（对齐 dsh `lsp-stdio` 的「部署自备服务器」取向）。
 *
 * 我们**不随附任何语言服务器**；用户在库根目录写 `<库>/lsp.json` 声明扩展名 → 命令映射：
 *
 * ```json
 * { "servers": { ".ts": { "command": "typescript-language-server", "args": ["--stdio"] } } }
 * ```
 *
 * 未配置的扩展名返回 `null`（技能据此回「未配置语言服务器」，不报错崩）。
 */

import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

import type { LspServerSpec } from './lspClient'

/** 配置文件（库根目录下） */
export const LSP_CONFIG_FILE = 'lsp.json'

interface LspServerEntry {
  command?: unknown
  args?: unknown
}

interface LspConfigShape {
  servers?: Record<string, LspServerEntry> | null
}

/** 读取 `<库>/lsp.json` 并按扩展名解析服务器；每次调用现读（小文件，保证改配置即生效） */
export function createLspServerResolver(libDir: string): (filePath: string) => LspServerSpec | null {
  return (filePath) => {
    let parsed: LspConfigShape
    try {
      parsed = JSON.parse(readFileSync(join(libDir, LSP_CONFIG_FILE), 'utf8')) as LspConfigShape
    } catch {
      return null
    }
    const servers = parsed.servers
    if (servers === undefined || servers === null || typeof servers !== 'object') return null
    const ext = extname(filePath).toLowerCase()
    const entry = servers[ext]
    if (entry === undefined || entry === null || typeof entry !== 'object') return null
    const command = typeof entry.command === 'string' ? entry.command.trim() : ''
    if (command === '') return null
    const args = Array.isArray(entry.args)
      ? entry.args.filter((arg): arg is string => typeof arg === 'string')
      : []
    return { command, args }
  }
}
