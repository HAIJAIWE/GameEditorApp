/**
 * `system.computer` 内置技能（对齐 dsh `computer-use` 的**最小可用子集**）：
 * 截屏 / 鼠标点击 / 键盘输入（Windows）。
 *
 * 实现：通过系统脚本驱动 `System.Windows.Forms` + `user32.dll`（截屏用 Drawing，
 * 点击用 SetCursorPos + mouse_event，输入用 SendKeys），**不引原生模块**。
 * 脚本经 `-EncodedCommand`（base64 UTF-16LE）传入，避免引号/中文转义地狱。
 *
 * 风险：`SYSTEM`（每次调用审批）。能操作任意窗口，是**全库最高危**能力——请谨慎开启。
 * 平台：仅 Windows；其他平台 `EUNSUPPORTED`。
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'

const ACTIONS = ['screenshot', 'click', 'type', 'key'] as const

export interface ComputerSkillOptions {
  /** 截图保存目录（`<工作区>/.mb-shots`） */
  root: () => string
  /** 注入脚本执行（测试可替换）；缺省跑 powershell -EncodedCommand */
  runScript?: (script: string) => Promise<{ stdout: string; stderr: string; code: number }>
}

/** SendKeys 特殊字符 → 转义形式（单次遍历，避免把刚插入的 `{}` 再转义） */
const SENDKEYS_ESCAPE: Record<string, string> = {
  '+': '{+}',
  '^': '{^}',
  '%': '{%}',
  '~': '{~}',
  '(': '{(}',
  ')': '{)}',
  '{': '{{}',
  '}': '{}}',
  '[': '{[}',
  ']': '{]}'
}

/** 把文本转成 SendKeys 安全形式（特殊字符用 `{}` 包裹；逐字符映射，避免正则转义问题） */
export function escapeSendKeys(text: string): string {
  let result = ''
  for (const char of text) {
    result += SENDKEYS_ESCAPE[char] ?? char
  }
  return result
}

/** PowerShell 单引号字符串转义 */
function psQuote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

/** 截屏脚本：抓虚拟桌面全屏并保存 PNG */
export function buildScreenshotScript(path: string): string {
  return [
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
    '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen',
    '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)',
    `$bmp.Save(${psQuote(path)}, [System.Drawing.Imaging.ImageFormat]::Png)`,
    '$g.Dispose(); $bmp.Dispose()',
    "Write-Output 'ok'"
  ].join('\n')
}

/** 左键点击脚本 */
export function buildClickScript(x: number, y: number): string {
  return [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class MbMouse {',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
    '  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);',
    '}',
    '"@',
    `[MbMouse]::SetCursorPos(${x}, ${y}) | Out-Null`,
    '[MbMouse]::mouse_event(0x02, 0, 0, 0, 0)',
    '[MbMouse]::mouse_event(0x04, 0, 0, 0, 0)',
    "Write-Output 'ok'"
  ].join('\n')
}

/** 键盘输入脚本（text 走 SendKeys 转义；raw 表示已是 SendKeys 语法） */
export function buildTypeScript(text: string, raw = false): string {
  const payload = raw ? text : escapeSendKeys(text)
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.SendKeys]::SendWait(${psQuote(payload)})`,
    "Write-Output 'ok'"
  ].join('\n')
}

/** 默认执行器：powershell -NoProfile -NonInteractive -EncodedCommand */
function defaultRunScript(script: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true
      })
    } catch (error) {
      resolve({ stdout: '', stderr: error instanceof Error ? error.message : String(error), code: -1 })
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error: Error) => resolve({ stdout, stderr: error.message, code: -1 }))
    child.on('close', (code: number | null) => resolve({ stdout, stderr, code: code ?? -1 }))
  })
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `computer 失败：${message}`, error }
}

export function createComputerSkill(options: ComputerSkillOptions): SkillProtocol {
  const runScript = options.runScript ?? defaultRunScript

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return fail(`未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, 'EBADACTION')
    }
    if (process.platform !== 'win32') {
      return fail('computer-use 目前仅支持 Windows', 'EUNSUPPORTED')
    }

    let script: string
    let message: string
    if (action === 'screenshot') {
      const dir = join(options.root(), '.mb-shots')
      mkdirSync(dir, { recursive: true })
      const path = join(dir, `${Date.now()}.png`)
      script = buildScreenshotScript(path)
      message = `已截屏：.mb-shots/${path.split(/[\\/]/).pop() ?? ''}（相对工作区）`
    } else if (action === 'click') {
      const x = typeof params.x === 'number' ? params.x : Number.parseInt(String(params.x ?? ''), 10)
      const y = typeof params.y === 'number' ? params.y : Number.parseInt(String(params.y ?? ''), 10)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('click 需要数字 x/y', 'EBADARG')
      script = buildClickScript(Math.trunc(x), Math.trunc(y))
      message = `已点击 (${Math.trunc(x)}, ${Math.trunc(y)})`
    } else if (action === 'type') {
      const text = typeof params.text === 'string' ? params.text : ''
      if (text === '') return fail('type 需要 text', 'EBADARG')
      script = buildTypeScript(text)
      message = `已输入 ${text.length} 字符`
    } else {
      const keys = typeof params.keys === 'string' ? params.keys : ''
      if (keys === '') return fail('key 需要 keys（SendKeys 语法，如 ^c / {ENTER}）', 'EBADARG')
      script = buildTypeScript(keys, true)
      message = `已发送按键：${keys}`
    }

    const result = await runScript(script)
    if (result.code !== 0) {
      return fail(`脚本退出码 ${result.code}${result.stderr !== '' ? `：${result.stderr.slice(0, 300)}` : ''}`, 'ESCRIPT')
    }
    return { success: true, message, data: { action } }
  }

  return {
    id: 'system.computer',
    description:
      '桌面控制（Windows，最高危）：screenshot=全屏截图 / click=左键点击(x,y) / type=键盘输入文本 / '
      + 'key=发送按键（SendKeys 语法）。能操作任意窗口，每次调用都需确认。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        x: { type: 'integer', description: 'click 的横坐标' },
        y: { type: 'integer', description: 'click 的纵坐标' },
        text: { type: 'string', description: 'type 的文本' },
        keys: { type: 'string', description: 'key 的 SendKeys 序列（如 ^c、{ENTER}）' }
      },
      required: ['action']
    },
    tags: ['system', 'computer'],
    execute: run
  }
}
