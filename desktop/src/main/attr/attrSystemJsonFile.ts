import { readFile, rename, writeFile } from 'node:fs/promises'

import { parseAttrSystemFile, serializeAttrSystem, type AttrSystem } from '../../shared/ceshu/reference/attrSystem'

/**
 * 属性系统 JSON 导入 / 导出：
 * - 导出：与 旧版 `AttributeSystem.to_dict()` 同构的平铺对象（属性名 → 定义，formula 为公式文本），
 *   indent=2 + 中文不转义；原子写（临时文件 + rename）。旧版 导出前不校验，这里同样不校验。
 * - 导入：读文件 → 解析；结构与公式异常以 warnings 上报并尽力保留数据。
 */

export async function exportAttrSystemJsonFile(
  filePath: string,
  system: AttrSystem
): Promise<{ filePath: string }> {
  const content = JSON.stringify(serializeAttrSystem(system), null, 2)
  const tempPath = `${filePath}.tmp`
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, filePath)
  } catch (error) {
    throw new Error(
      `写入属性系统文件失败：${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  return { filePath }
}

export async function importAttrSystemJsonFile(
  filePath: string
): Promise<{ system: AttrSystem; warnings: string[] }> {
  let text: string
  try {
    text = await readFile(filePath, 'utf-8')
  } catch (error) {
    throw new Error(
      `读取属性系统文件失败：${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('属性系统文件内容损坏（JSON 解析失败）')
  }
  return parseAttrSystemFile(raw)
}