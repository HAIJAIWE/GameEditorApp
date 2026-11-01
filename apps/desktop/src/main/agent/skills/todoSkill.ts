/**
 * `system.todo_write` 内置技能（对齐 dsh `tool-todo` 的模型侧任务清单工具）。
 *
 * 目的：让智能体在**多步任务**里先列计划、再逐条推进，并把进度显式化——
 * 既降低长任务的「目标漂移」，也让用户在工具卡里直接看到 checklist。
 *
 * 语义（对齐 dsh）：
 * - **整表替换**：每次调用用完整列表覆盖旧列表（不是增量 patch），避免模型与真实状态分叉；
 * - 状态三态：`pending` / `in_progress` / `completed`；
 * - 校验：content 非空且唯一；默认**同一时刻最多一个 `in_progress`**（并发型 agent 可放开）。
 *
 * 与 dsh 的差异：dsh 把清单写进 `session.append('todo/write')` 事件并由投影注入提示词；
 * 我们是内存消息模型——工具结果（清单文本）本身就在 `messages` 里，模型下一轮天然可见，
 * 故 v1 不做额外的提示词注入（后续可加「当前清单」常驻块，防压缩后丢失）。
 */

import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** 任务状态（与 dsh `TodoItem.status` 同值域） */
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

/** 单条任务 */
export interface TodoItem {
  content: string
  status: TodoStatus
}

const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed']

/** 状态标签（中文展示） */
const STATUS_LABELS: Readonly<Record<TodoStatus, string>> = {
  pending: '待办',
  in_progress: '进行中',
  completed: '已完成'
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

/**
 * 校验并规范化模型传入的清单（对齐 dsh `toTodoList`）：
 * content 去空白后非空且唯一；status 合法；非并发模式最多一个 in_progress。
 * 任何不合法都抛错，由 execute 收敛为 `success:false`（不把畸形输入静默吞掉）。
 */
export function normalizeTodoList(raw: unknown, allowParallelInProgress: boolean): TodoItem[] {
  if (!Array.isArray(raw)) throw new Error('todos 必须是数组')
  const todos: TodoItem[] = []
  const seen = new Set<string>()
  let active = 0
  for (const item of raw) {
    if (item === null || typeof item !== 'object') throw new Error('todos 的每一项必须是对象')
    const record = item as Record<string, unknown>
    const content = typeof record.content === 'string' ? record.content.trim() : ''
    if (content === '') throw new Error('todo 的 content 必须是非空字符串')
    if (seen.has(content)) throw new Error(`todo 内容重复：${JSON.stringify(content)}`)
    seen.add(content)
    if (!isTodoStatus(record.status)) {
      throw new Error(`todo 的 status 非法：${String(record.status)}（支持 ${STATUSES.join(' / ')}）`)
    }
    if (record.status === 'in_progress') active += 1
    todos.push({ content, status: record.status })
  }
  if (!allowParallelInProgress && active > 1) {
    throw new Error(`最多只能有一个任务处于 in_progress（当前 ${active} 个）`)
  }
  return todos
}

/** 把清单渲染成模型/用户可读的多行文本 */
export function formatTodoList(todos: readonly TodoItem[]): string {
  return todos.map((todo, index) => `${index + 1}. [${STATUS_LABELS[todo.status]}] ${todo.content}`).join('\n')
}

/** 统计各状态数量 */
function countByStatus(todos: readonly TodoItem[]): { pending: number; inProgress: number; completed: number } {
  let pending = 0
  let inProgress = 0
  let completed = 0
  for (const todo of todos) {
    if (todo.status === 'pending') pending += 1
    else if (todo.status === 'in_progress') inProgress += 1
    else completed += 1
  }
  return { pending, inProgress, completed }
}

export interface TodoSkillOptions {
  /** 是否允许多个 in_progress 并存（并发型 agent 打开；默认关，对齐 dsh 单活跃纪律） */
  allowParallelInProgress?: boolean
}

/**
 * 创建 `system.todo_write` 技能。
 */
export function createTodoSkill(options: TodoSkillOptions = {}): SkillProtocol {
  const allowParallel = options.allowParallelInProgress ?? false
  return {
    id: 'system.todo_write',
    description:
      '维护任务清单以规划多步工作并展示进度（简单单步任务可跳过）。开始前为每个具体步骤加一条 todo；'
      + '有任务进行中时保持其 in_progress（默认同一时刻仅一个）；完成后立即标记 completed。'
      + '每次调用用**完整列表**替换旧列表（不是增量修改）。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: '完整任务列表，替换旧列表',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: '任务内容（简短祈使句）' },
              status: {
                type: 'string',
                enum: [...STATUSES],
                description: 'pending（未开始）/ in_progress（进行中）/ completed（已完成）'
              }
            },
            required: ['content', 'status']
          }
        }
      },
      required: ['todos']
    },
    tags: ['system', 'planning'],
    async execute(params): Promise<SkillResult> {
      try {
        const todos = normalizeTodoList(params.todos, allowParallel)
        const counts = countByStatus(todos)
        return {
          success: true,
          message:
            `当前任务清单（共 ${todos.length} 项）：\n${formatTodoList(todos)}\n`
            + `进度：${counts.pending} 待办 / ${counts.inProgress} 进行中 / ${counts.completed} 完成`,
          data: { todos, counts }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: `todo_write 失败：${message}`, error: message }
      }
    }
  }
}
