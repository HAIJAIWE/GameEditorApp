import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

import {
  createDefaultAttrSystem,
  parseAttrSystemFile,
  serializeAttrSystem,
  validateAttrSystem,
  type AttrSystem
} from '../../shared/attrSystem'

/**
 * 属性系统存储（本模块内唯一写者）。
 * - 文件：<userData>/attr_system.json（与 Python 版 <库目录>/attr_system.json 同构）
 * - 缺省文件时以内置默认属性系统为种子（仅在用户保存后落盘）
 * - 保存前做领域校验（依赖存在性 / 环依赖 / min≤max / 数值合法性），原子写：临时文件 + rename
 */
export class AttrSystemStore {
  private cache: AttrSystem | null = null

  constructor(private readonly filePath: string) {}

  /** 当前生效的属性系统（懒加载；文件损坏时抛中文错误，由 IPC 统一转为错误响应） */
  getSystem(): AttrSystem {
    if (!this.cache) {
      this.cache = this.load()
    }
    return structuredClone(this.cache)
  }

  /** 保存整个属性系统（属性库编辑器提交入口）；返回落盘后的系统 */
  saveSystem(system: AttrSystem): AttrSystem {
    const errors = validateAttrSystem(system)
    if (errors.length > 0) {
      throw new Error(`属性系统校验失败：\n${errors.join('\n')}`)
    }
    const payload = serializeAttrSystem(system)
    const tempPath = `${this.filePath}.tmp`
    try {
      writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8')
      renameSync(tempPath, this.filePath)
    } catch (error) {
      throw new Error(`写入属性系统文件失败：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }
    this.cache = structuredClone(system)
    return structuredClone(this.cache)
  }

  private load(): AttrSystem {
    if (!existsSync(this.filePath)) {
      return createDefaultAttrSystem()
    }
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch (error) {
      throw new Error(
        `读取属性系统文件失败（${this.filePath}）：${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    return parseAttrSystemFile(raw).system
  }
}