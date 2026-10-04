import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { DataTypeDef, ItemRecord } from '../../shared/types'

import { renderLuaGameData } from './lua'

/** 支持的目标引擎（当前仅 Lua）；后续引擎在此追加渲染器即可扩展 */
export type EngineTarget = 'lua'

/** 引擎 → 产物扩展名 */
const ENGINE_EXTENSIONS: Record<EngineTarget, string> = {
  lua: '.lua'
}

export interface EngineExportOptions {
  engine: EngineTarget
  targetPath: string
}

export interface EngineExportResult {
  filePath: string
  engine: EngineTarget
  bytes: number
}

/**
 * 引擎数据导出：按引擎渲染 → 临时文件 + rename 原子写盘 → 返回结果。
 * - 渲染为纯函数（返回 string），落盘与扩展名兜底集中在此
 * - 原子写：先写 `<filePath>.tmp` 再 rename，成功后不残留临时文件
 * - `bytes === Buffer.byteLength(content)`（UTF-8 字节数）
 */
export async function exportEngineData(
  records: ItemRecord[],
  types: DataTypeDef[],
  options: EngineExportOptions
): Promise<EngineExportResult> {
  if (options.engine !== 'lua') {
    throw new Error(`目标引擎不支持：${options.engine}`)
  }

  const filePath = ensureExtension(options.targetPath, ENGINE_EXTENSIONS[options.engine])
  const content = renderLuaGameData(records, types)

  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  try {
    writeFileSync(tmpPath, content, 'utf-8')
    renameSync(tmpPath, filePath)
  } catch (error) {
    throw new Error(`写入引擎数据文件失败：${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }

  return { filePath, engine: options.engine, bytes: Buffer.byteLength(content, 'utf-8') }
}

/** 目标路径缺少正确扩展名时补上（对话框已带默认扩展名，此处兜底） */
function ensureExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`
}
