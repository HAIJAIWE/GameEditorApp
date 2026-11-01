import { rename, writeFile } from 'node:fs/promises'

import { buildAttrGameConfig, validateAttrSystem, type AttrSystem } from '@mobai/shared/attrSystem'

/**
 * 属性系统 → 游戏引擎配置导出：
 * - 输出与 旧版 同构的 JSON（version "1.0" / base_attributes / derived_formulas / calculation_order / attribute_constraints）
 * - 导出前做领域校验（依赖存在 / 环依赖 / min≤max / 数值合法），非法系统拒绝导出
 * - 原子写：临时文件 + rename
 */
export async function exportAttrGameConfigFile(filePath: string, system: AttrSystem): Promise<{ filePath: string }> {
  const errors = validateAttrSystem(system)
  if (errors.length > 0) {
    throw new Error(`属性系统校验失败，无法导出游戏配置：\n${errors.join('\n')}`)
  }
  const content = JSON.stringify(buildAttrGameConfig(system), null, 2)
  const tempPath = `${filePath}.tmp`
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, filePath)
  } catch (error) {
    throw new Error(`写入游戏配置文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  return { filePath }
}