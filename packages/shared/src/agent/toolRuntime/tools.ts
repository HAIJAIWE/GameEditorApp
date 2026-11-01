/**
 * 工具注册表（对齐 dsh `core/tools` 的 `ToolsService`）。
 *
 * 关键约束：`schemas()` **只白名单** `name / description / parameters`——
 * `timeoutMs` / `isConcurrencySafe` / 展示投影这些"执行器元数据"**永不发给模型**。
 * 这是 dsh 明确的边界，也是防止模型利用内部预算做试探的防线。
 *
 * @module agent/tools/tools
 */

import type { ToolFunctionSchema } from '../config'
import type { ToolDefinition } from './contracts'

/** 工具注册表 */
export class ToolsService {
  private readonly tools = new Map<string, ToolDefinition>()

  /** 定义工具（恒等返回，便于 `defineTool({...})` 写法） */
  defineTool(definition: ToolDefinition): ToolDefinition {
    return definition
  }

  /** 注册；名称为空时拒绝 */
  register(definition: ToolDefinition): boolean {
    if (definition.name.trim() === '') return false
    this.tools.set(definition.name, definition)
    return true
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  /**
   * 可执行查询。
   *
   * 本仓暂无 per-step scope 限制，`scope` 参数为将来预留（与 dsh 同签名）。
   * @param name - 工具名
   */
  executable(name: string, _scope?: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  /** 模型可见的工具声明：**只白名单** name/description/parameters */
  schemas(): ToolFunctionSchema[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }

  clear(): void {
    this.tools.clear()
  }

  get count(): number {
    return this.tools.size
  }
}
