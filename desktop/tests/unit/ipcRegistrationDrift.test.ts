import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * 守卫：**契约里的每个 IPC 通道都必须真的被注册**（四级契约的「第五链接」）。
 *
 * ## 为什么需要
 * 四层契约（`schemas.ts` + `shared/ipc.ts` + `service/api.ts` + `preload`）由 tsc 管住，
 * 但**主进程的注册**（各 registrar 里的 `handle(...)`）**没有穷举要求**：
 * `handle<C extends IpcChannel>` 只约束「传入的通道名合法」，不约束「所有通道都被传入」。
 * ⇒ 往 `IpcContract` 加通道、却忘了写 `handle(...)` 时 **tsc 依旧全绿**，
 * 失败只在用户点到该功能时才以 `No handler registered` 暴露——正是本项目最担心的「静默腐化」。
 *
 * ## 做法（与 `docsLedger.test.ts` 同源的源码级守卫）
 * 解析 `shared/ipc.ts` 的契约键 + `main/ipc/*.ts` 的 `handle('...')`，做**双向**集合比对。
 *
 * ⚠️ 解析式守卫的固有风险是「正则失效 ⇒ 守卫静默通过」，故额外加了 **vacuity 断言**
 * （数量下限）：解析器一旦失效会立刻红，而不是悄悄放过。
 */

const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '../..')
const contractPath = join(desktopRoot, 'src/shared/ipc.ts')
const ipcDir = join(desktopRoot, 'src/main/ipc')

/**
 * 已进契约、但**尚未接线**的通道（前向声明）。
 * 每一条都要有明确理由；**接线后请从这里移除**（下方用例会提示）。
 */
const PLANNED_CHANNELS: readonly string[] = [
  'ceshu:aiGenerateField', // 「AI 生成字段」功能（AiFieldButton 在途），主进程实现待接线
  'llm:testConnection' // 设置面板「测试连接」，主进程实现待接线
]

/** IpcContract 的键：`src/shared/ipc.ts` 里 2 空格缩进的带引号字面量 */
function contractChannels(): string[] {
  const source = readFileSync(contractPath, 'utf-8')
  return [...source.matchAll(/^ {2}'([^']+)':/gm)].map((match) => match[1] as string)
}

/** 各 registrar 里 `handle('<channel>'` 的通道名 */
function registeredChannels(): string[] {
  const channels: string[] = []
  for (const file of readdirSync(ipcDir).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(join(ipcDir, file), 'utf-8')
    for (const match of source.matchAll(/\bhandle\('([^']+)'/g)) {
      channels.push(match[1] as string)
    }
  }
  return channels
}

describe('IPC 通道注册守卫（契约 ⟷ registrar 双向比对）', () => {
  it('解析器有效（vacuity 断言：防正则失效后守卫静默通过）', () => {
    expect(contractChannels().length).toBeGreaterThan(100)
    expect(registeredChannels().length).toBeGreaterThan(100)
  })

  it('契约里的通道都已注册（漏注册即红）', () => {
    const registered = new Set(registeredChannels())
    const missing = contractChannels()
      .filter((channel) => !registered.has(channel))
      .filter((channel) => !PLANNED_CHANNELS.includes(channel))
    expect(missing).toEqual([])
  })

  it('没有契约外的「野通道」（handle 写了契约里没有的通道名）', () => {
    const contract = new Set(contractChannels())
    const extra = [...new Set(registeredChannels())].filter((channel) => !contract.has(channel))
    expect(extra).toEqual([])
  })

  it('PLANNED_CHANNELS 已全部接线时请从清单移除（防清单长期腐化）', () => {
    const registered = new Set(registeredChannels())
    const alreadyWired = PLANNED_CHANNELS.filter((channel) => registered.has(channel))
    expect(alreadyWired).toEqual([])
  })
})
