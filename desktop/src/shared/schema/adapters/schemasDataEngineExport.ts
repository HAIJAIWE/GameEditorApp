/**
 * `schemasData` 拆分件：**引擎代码导出**（`engine:export*` 通道）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/**
 * 引擎代码导出：目标引擎 + 目标路径（缺扩展名时导出侧按引擎补）。
 * 五个目标 = `lua` + 对齐 旧版 `features/engine_export` 的四个引擎
 * （Unity/Unreal/Godot/Cocos2d 产物分别为 `.cs` / `.h` / `.gd` / `.json`）。
 */
export const engineTargetSchema = z.enum(['lua', 'unity', 'unreal', 'godot', 'cocos2d'])

export const engineExportInputSchema = z.object({
  engine: engineTargetSchema,
  path: z.string().min(1),
  /**
   * 「缺失图片即阻断」：开启时，引用到的库内图片若有缺失，导出前直接抛错、不落盘
   * （避免导出一个「数据在、图缺几张」的半成品，AI 覆盖游戏活文件时尤其危险）。
   * 默认关：保持旧行为（拷得到的拷、找不到的记 missing 不阻断）。
   */
  blockOnMissingImages: z.boolean().default(false)
})

/** 引擎代码导出（E2）：选择导出文件路径（`engine` 决定默认扩展名与过滤器标题）。
 * - `defaultName`：无记忆路径时的默认文件名（可选，记忆路径存在时冗余）。
 * - `defaultPath`：上次导出路径（按引擎记忆，回填到 SaveDialog，免得每次重选游戏文件）。
 *   二者皆可缺省——都缺时回落到 `GameData`。 */
export const engineExportFileDialogInputSchema = z.object({
  defaultName: z.string().min(1).max(120).optional(),
  engine: engineTargetSchema.default('lua'),
  defaultPath: z.string().min(1).max(4096).optional()
})

export type EngineExportInput = z.infer<typeof engineExportInputSchema>
export type EngineExportFileDialogInput = z.infer<typeof engineExportFileDialogInputSchema>
