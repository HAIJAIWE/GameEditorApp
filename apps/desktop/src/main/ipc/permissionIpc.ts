import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { PERMISSION_MODES, permissionPolicyHolder, type PermissionMode } from '@mobai/shared/agent/config'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'

const FILE_NAME = 'permission-mode.json'

function filePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

/** 从 userData 读持久化的权限档位（损坏/缺失回退默认 full） */
export async function loadPermissionMode(): Promise<PermissionMode> {
  try {
    const raw = await readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as { mode?: unknown }
    if (typeof parsed.mode === 'string' && (PERMISSION_MODES as readonly string[]).includes(parsed.mode)) {
      return parsed.mode as PermissionMode
    }
  } catch {
    // 无文件或 JSON 损坏：用默认 full（等同当前行为，不静默降级到更危险的档位）
  }
  return 'full'
}

/** 落盘 + 灌进共享持有者（调度器与确认门实时读它） */
export async function savePermissionMode(mode: PermissionMode): Promise<void> {
  permissionPolicyHolder.set(mode)
  try {
    await writeFile(filePath(), JSON.stringify({ mode }, null, 2), 'utf8')
  } catch {
    // 持久化失败不阻断运行，内存态已经更新
  }
}

/** 启动时把上次档位灌进共享持有者（渲染层不一定会推） */
export async function initPermissionMode(): Promise<void> {
  permissionPolicyHolder.set(await loadPermissionMode())
}

export function registerPermissionIpc(_deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('agent:getPermissionMode', undefined, async () => ({ mode: await loadPermissionMode() }))
  handle('agent:setPermissionMode', undefined, async (req) => {
    const mode = (req as { mode?: unknown }).mode
    if (typeof mode !== 'string' || !(PERMISSION_MODES as readonly string[]).includes(mode)) {
      return { ok: false, error: `未知权限档位: ${String(mode)}` }
    }
    await savePermissionMode(mode as PermissionMode)
    return { ok: true }
  })
}
