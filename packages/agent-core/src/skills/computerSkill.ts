/**
 * `system.computer` 内置技能：截屏 / 屏幕信息 / 鼠标（移动·点击·滚轮·拖拽）/ 键盘（Windows）。
 *
 * 实现：通过系统脚本驱动 `System.Windows.Forms` + `user32.dll`（截屏用 Drawing，
 * 鼠标用 SetCursorPos + mouse_event，输入用 SendKeys），**不引原生模块**。
 * 脚本经 `-EncodedCommand`（base64 UTF-16LE）传入，避免引号/中文转义地狱。
 *
 * ## 坐标口径（多屏）
 * 所有坐标都是**虚拟桌面**坐标（= 所有显示器拼成的那个大矩形，左上角可能为负）。
 * 多屏时模型自己算不准原点，故提供 `screen` 动作先取边界与每块屏的矩形；
 * `screenshot` 抓的也是整个虚拟桌面，与坐标口径一致。
 *
 * ## 风险
 * `SYSTEM`（每次调用审批）。能操作任意窗口，是**全库最高危**能力——请谨慎开启。
 * 平台：仅 Windows；其他平台 `EUNSUPPORTED`。
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

const ACTIONS = ['screenshot', 'screen', 'click', 'move', 'scroll', 'drag', 'type', 'key'] as const

/** 一次滚轮的格数上限（防止一个 delta 把页面滚到底） */
const MAX_SCROLL_NOTCHES = 50
/** 拖拽插值步数范围（步数太少像瞬移，太多慢且抖动） */
const DRAG_STEPS_MIN = 2
const DRAG_STEPS_MAX = 40
const DRAG_STEPS_DEFAULT = 12

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

/**
 * user32 的鼠标封装（C# 内联编译）。
 *
 * `dwData` 用 `int` 而不是 `uint`：滚轮的格数是**有符号**的（负数 = 下滚），
 * 声明成 uint 就得在调用点手写补码，容易错。DWORD 的位模式与 int 一致，marshaling 无碍。
 */
const MB_MOUSE_CLASS = [
  'Add-Type @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class MbMouse {',
  '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
  '  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, int e);',
  '}',
  '"@'
]

/** MOUSEEVENTF_* 常量（user32 的定义，避免脚本里出现魔数） */
const MOUSEEVENTF = {
  LEFTDOWN: '0x02',
  LEFTUP: '0x04',
  WHEEL: '0x0800'
} as const

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

/**
 * 屏幕信息脚本：输出 JSON（虚拟桌面边界 + 每块显示器的矩形）。
 *
 * 多屏时 `VirtualScreen.Left/Top` 常为负（副屏在主屏左侧/上方），
 * 模型拿到这份 JSON 才能把"第 2 块屏中间"换算成正确坐标。
 */
export function buildScreenInfoScript(): string {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$v = [System.Windows.Forms.SystemInformation]::VirtualScreen',
    '$mons = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {',
    '  [pscustomobject]@{ device = $_.DeviceName; primary = $_.Primary;',
    '    x = $_.Bounds.X; y = $_.Bounds.Y; width = $_.Bounds.Width; height = $_.Bounds.Height }',
    '})',
    '[pscustomobject]@{ virtual = [pscustomobject]@{ x = $v.X; y = $v.Y; width = $v.Width; height = $v.Height };',
    '  monitors = $mons } | ConvertTo-Json -Depth 4 -Compress'
  ].join('\n')
}

/** 左键点击脚本 */
export function buildClickScript(x: number, y: number): string {
  return [
    ...MB_MOUSE_CLASS,
    `[MbMouse]::SetCursorPos(${x}, ${y}) | Out-Null`,
    `[MbMouse]::mouse_event(${MOUSEEVENTF.LEFTDOWN}, 0, 0, 0, 0)`,
    `[MbMouse]::mouse_event(${MOUSEEVENTF.LEFTUP}, 0, 0, 0, 0)`,
    "Write-Output 'ok'"
  ].join('\n')
}

/** 移动光标脚本（不点击；用于悬停触发 tooltip / hover 菜单） */
export function buildMoveScript(x: number, y: number): string {
  return [...MB_MOUSE_CLASS, `[MbMouse]::SetCursorPos(${x}, ${y}) | Out-Null`, "Write-Output 'ok'"].join('\n')
}

/**
 * 滚轮脚本：先把光标移到 (x,y) 再滚（滚轮作用于**光标下方**的窗口）。
 *
 * @param notches 格数，正 = 上滚、负 = 下滚；一格 = 120（Windows 的 WHEEL_DELTA）
 */
export function buildScrollScript(x: number, y: number, notches: number): string {
  return [
    ...MB_MOUSE_CLASS,
    `[MbMouse]::SetCursorPos(${x}, ${y}) | Out-Null`,
    `[MbMouse]::mouse_event(${MOUSEEVENTF.WHEEL}, 0, 0, ${notches} * 120, 0)`,
    "Write-Output 'ok'"
  ].join('\n')
}

/**
 * 拖拽脚本：按下 → 插值移动 → 松开。
 *
 * 为什么不直接 "SetCursorPos 到终点再松开"：多数 UI（拖放区、滑块、画布）
 * 靠 `mousemove` 事件流判定拖拽，瞬移会被当成"点了一下终点"，拖拽根本不触发。
 * 故按 `steps` 线性插值并每步 `Start-Sleep` 一小会儿。
 */
export function buildDragScript(fromX: number, fromY: number, toX: number, toY: number, steps: number): string {
  return [
    ...MB_MOUSE_CLASS,
    `[MbMouse]::SetCursorPos(${fromX}, ${fromY}) | Out-Null`,
    'Start-Sleep -Milliseconds 30',
    `[MbMouse]::mouse_event(${MOUSEEVENTF.LEFTDOWN}, 0, 0, 0, 0)`,
    `$fx = ${fromX}; $fy = ${fromY}; $tx = ${toX}; $ty = ${toY}; $n = ${steps}`,
    'for ($i = 1; $i -le $n; $i++) {',
    '  $x = [int]($fx + ($tx - $fx) * $i / $n)',
    '  $y = [int]($fy + ($ty - $fy) * $i / $n)',
    '  [MbMouse]::SetCursorPos($x, $y) | Out-Null',
    '  Start-Sleep -Milliseconds 8',
    '}',
    `[MbMouse]::mouse_event(${MOUSEEVENTF.LEFTUP}, 0, 0, 0, 0)`,
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

/** 取整数参数（容忍模型传字符串）；非法返回 null */
function intParam(params: Record<string, unknown>, key: string): number | null {
  const raw = params[key]
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(value) ? Math.trunc(value) : null
}

/** 屏幕信息（`screen` 动作的返回形状） */
export interface ScreenInfo {
  virtual: { x: number; y: number; width: number; height: number }
  monitors: Array<{ device: string; primary: boolean; x: number; y: number; width: number; height: number }>
}

/** 解析 `screen` 的 JSON 输出；结构不对返回 null（由调用方报 ESCRIPT） */
export function parseScreenInfo(stdout: string): ScreenInfo | null {
  const text = stdout.trim()
  if (text === '') return null
  try {
    const parsed = JSON.parse(text) as Partial<ScreenInfo>
    const v = parsed.virtual
    if (v === undefined || typeof v.x !== 'number' || typeof v.width !== 'number') return null
    const monitors = Array.isArray(parsed.monitors) ? parsed.monitors : []
    return {
      virtual: { x: v.x, y: v.y ?? 0, width: v.width, height: v.height ?? 0 },
      monitors: monitors.filter(
        (m): m is ScreenInfo['monitors'][number] =>
          m !== null && typeof m === 'object' && typeof (m as { device?: unknown }).device === 'string'
      )
    }
  } catch {
    return null
  }
}

export function createComputerSkill(options: ComputerSkillOptions): SkillProtocol {
  const runScript = options.runScript ?? defaultRunScript

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return fail(`未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, SKILL_ERRORS.BAD_ACTION)
    }
    if (process.platform !== 'win32') {
      return fail('computer-use 目前仅支持 Windows', SKILL_ERRORS.UNSUPPORTED)
    }

    let script: string
    let message: string
    let data: Record<string, unknown> = { action }

    if (action === 'screenshot') {
      const dir = join(options.root(), '.mb-shots')
      mkdirSync(dir, { recursive: true })
      const path = join(dir, `${Date.now()}.png`)
      script = buildScreenshotScript(path)
      message = `已截屏：.mb-shots/${path.split(/[\\/]/).pop() ?? ''}（相对工作区）`
    } else if (action === 'screen') {
      script = buildScreenInfoScript()
      message = '已读取屏幕信息'
    } else if (action === 'click') {
      const x = intParam(params, 'x')
      const y = intParam(params, 'y')
      if (x === null || y === null) return fail('click 需要数字 x/y', SKILL_ERRORS.BAD_ARG)
      script = buildClickScript(x, y)
      message = `已点击 (${x}, ${y})`
    } else if (action === 'move') {
      const x = intParam(params, 'x')
      const y = intParam(params, 'y')
      if (x === null || y === null) return fail('move 需要数字 x/y', SKILL_ERRORS.BAD_ARG)
      script = buildMoveScript(x, y)
      message = `光标已移到 (${x}, ${y})`
    } else if (action === 'scroll') {
      const x = intParam(params, 'x')
      const y = intParam(params, 'y')
      if (x === null || y === null) return fail('scroll 需要数字 x/y（滚轮作用于光标下的窗口）', SKILL_ERRORS.BAD_ARG)
      const rawDelta = intParam(params, 'delta')
      const notches = rawDelta === null ? 3 : rawDelta
      if (notches === 0) return fail('scroll 的 delta 不能为 0（正=上滚，负=下滚）', SKILL_ERRORS.BAD_ARG)
      const clamped = Math.max(-MAX_SCROLL_NOTCHES, Math.min(MAX_SCROLL_NOTCHES, notches))
      script = buildScrollScript(x, y, clamped)
      message = `已在 (${x}, ${y}) 滚动 ${clamped} 格（${clamped > 0 ? '上' : '下'}）`
    } else if (action === 'drag') {
      const fromX = intParam(params, 'from_x')
      const fromY = intParam(params, 'from_y')
      const toX = intParam(params, 'to_x')
      const toY = intParam(params, 'to_y')
      if (fromX === null || fromY === null || toX === null || toY === null) {
        return fail('drag 需要数字 from_x/from_y/to_x/to_y', SKILL_ERRORS.BAD_ARG)
      }
      const rawSteps = intParam(params, 'steps')
      const steps = Math.max(DRAG_STEPS_MIN, Math.min(DRAG_STEPS_MAX, rawSteps ?? DRAG_STEPS_DEFAULT))
      script = buildDragScript(fromX, fromY, toX, toY, steps)
      message = `已拖拽 (${fromX}, ${fromY}) → (${toX}, ${toY})，${steps} 步`
    } else if (action === 'type') {
      const text = typeof params.text === 'string' ? params.text : ''
      if (text === '') return fail('type 需要 text', SKILL_ERRORS.BAD_ARG)
      script = buildTypeScript(text)
      message = `已输入 ${text.length} 字符`
    } else {
      const keys = typeof params.keys === 'string' ? params.keys : ''
      if (keys === '') return fail('key 需要 keys（SendKeys 语法，如 ^c / {ENTER}）', SKILL_ERRORS.BAD_ARG)
      script = buildTypeScript(keys, true)
      message = `已发送按键：${keys}`
    }

    const result = await runScript(script)
    if (result.code !== 0) {
      return fail(`脚本退出码 ${result.code}${result.stderr !== '' ? `：${result.stderr.slice(0, 300)}` : ''}`, SKILL_ERRORS.SCRIPT)
    }
    if (action === 'screen') {
      const info = parseScreenInfo(result.stdout)
      if (info === null) return fail('screen 输出无法解析（预期 JSON）', SKILL_ERRORS.SCRIPT)
      data = { action, ...info }
      message =
        `屏幕：虚拟桌面 ${info.virtual.width}×${info.virtual.height} @ (${info.virtual.x}, ${info.virtual.y})，`
        + `${info.monitors.length} 块显示器`
    }
    return { success: true, message, data }
  }

  return {
    id: 'system.computer',
    description:
      '桌面控制（Windows，最高危）：screenshot=全屏截图 / screen=取屏幕边界与各显示器矩形（多屏先取这个） / '
      + 'click=左键点击(x,y) / move=移动光标(x,y) / scroll=滚轮(x,y,delta 正上负下) / '
      + 'drag=拖拽(from_x,from_y,to_x,to_y) / type=键盘输入文本 / key=发送按键（SendKeys 语法）。'
      + '坐标一律为虚拟桌面坐标。能操作任意窗口，每次调用都需确认。',
    version: '0.2.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        x: { type: 'integer', description: 'click / move / scroll 的横坐标（虚拟桌面）' },
        y: { type: 'integer', description: 'click / move / scroll 的纵坐标（虚拟桌面）' },
        delta: { type: 'integer', description: 'scroll 的格数：正=上滚，负=下滚（缺省 3）' },
        from_x: { type: 'integer', description: 'drag 起点横坐标' },
        from_y: { type: 'integer', description: 'drag 起点纵坐标' },
        to_x: { type: 'integer', description: 'drag 终点横坐标' },
        to_y: { type: 'integer', description: 'drag 终点纵坐标' },
        steps: { type: 'integer', description: 'drag 插值步数（2–40，缺省 12）' },
        text: { type: 'string', description: 'type 的文本' },
        keys: { type: 'string', description: 'key 的 SendKeys 序列（如 ^c、{ENTER}）' }
      },
      required: ['action']
    },
    tags: ['system', 'computer'],
    execute: run
  }
}
