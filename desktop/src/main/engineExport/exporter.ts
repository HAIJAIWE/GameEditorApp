import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { DataTypeDef, ItemRecord } from '../../shared/types'

import { bucketize, ENGINE_EXTENSIONS as KIND_EXTENSIONS, ENGINE_RENDERERS, type EngineKind } from './engines'
import { renderLuaGameData } from './lua'

/** 支持的目标引擎：`lua` + 四个对齐 PyQt `features/engine_export.py` 的引擎 */
export type EngineTarget = 'lua' | EngineKind

/** 引擎 → 产物扩展名（`.lua` 之外四个来自 `./engines`） */
const ENGINE_EXTENSIONS: Record<EngineTarget, string> = {
  lua: '.lua',
  ...KIND_EXTENSIONS
}

export interface EngineExportOptions {
  engine: EngineTarget
  targetPath: string
}

export interface EngineExportResult {
  filePath: string
  engine: EngineTarget
  bytes: number
  /** 覆盖前备份的上一版路径；首次导出（目标不存在）时为 undefined */
  backupPath?: string
}

/** 目标引擎是否受支持（IPC 侧另有 zod 枚举兜底，这里给主进程内部调用方一个判据） */
export function isEngineTarget(value: string): value is EngineTarget {
  return value in ENGINE_EXTENSIONS
}

/**
 * 引擎数据导出：按引擎渲染 → 覆盖前备份上一版 → 临时文件 + rename 原子写盘 → 返回结果。
 * - 渲染为纯函数（返回 string），落盘与扩展名兜底集中在此
 * - 原子写：先写 `<filePath>.tmp` 再 rename，成功后不残留临时文件
 * - 覆盖前备份：导出目标是游戏活文件、AI 生成可能出错，先 `copyFileSync` 到
 *   `<filePath>.bak` 留一份可回滚；首次导出（目标不存在）不备份
 * - `bytes === Buffer.byteLength(content)`（UTF-8 字节数）
 *
 * 五个目标各走各的渲染器（`lua` 独立模块，其余四个在 `./engines`）。
 * 此前这里只有 `lua` 一个分支，菜单里「导出为 Unity/Unreal/Godot/Cocos2d 格式」
 * 四项全都落到 `.lua` —— 文案与产物不符，已修正。
 */
export async function exportEngineData(
  records: ItemRecord[],
  types: DataTypeDef[],
  options: EngineExportOptions
): Promise<EngineExportResult> {
  if (!isEngineTarget(options.engine)) {
    throw new Error(`目标引擎不支持：${options.engine}`)
  }

  const filePath = ensureExtension(options.targetPath, ENGINE_EXTENSIONS[options.engine])
  const content =
    options.engine === 'lua'
      ? renderLuaGameData(records, types)
      : ENGINE_RENDERERS[options.engine](bucketize(records, types))

  // 覆盖前备份上一版：目标已存在才备份（首次导出无旧版可留）。
  let backupPath: string | undefined
  if (existsSync(filePath)) {
    backupPath = `${filePath}.bak`
    copyFileSync(filePath, backupPath)
  }

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

  return { filePath, engine: options.engine, bytes: Buffer.byteLength(content, 'utf-8'), backupPath }
}

/** 目标路径缺少正确扩展名时补上（对话框已带默认扩展名，此处兜底） */
function ensureExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`
}
