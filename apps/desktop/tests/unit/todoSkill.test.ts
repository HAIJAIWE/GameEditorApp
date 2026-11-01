/**
 * `system.todo_write` 技能单测（对齐 dsh tool-todo 的整表替换 + 校验语义）。
 */
import { describe, expect, it } from 'vitest'

import { createTodoSkill, formatTodoList, normalizeTodoList } from '@mobai/agent-core/skills/todoSkill'

describe('normalizeTodoList', () => {
  it('规范化合法清单（去空白、保留顺序）', () => {
    const todos = normalizeTodoList(
      [
        { content: '  读取策划书  ', status: 'completed' },
        { content: '补全战斗章', status: 'in_progress' },
        { content: '导出交付包', status: 'pending' }
      ],
      false
    )
    expect(todos).toEqual([
      { content: '读取策划书', status: 'completed' },
      { content: '补全战斗章', status: 'in_progress' },
      { content: '导出交付包', status: 'pending' }
    ])
  })

  it('非数组 → 抛错', () => {
    expect(() => normalizeTodoList('nope', false)).toThrow(/数组/)
  })

  it('content 为空 → 抛错', () => {
    expect(() => normalizeTodoList([{ content: '   ', status: 'pending' }], false)).toThrow(/非空/)
  })

  it('content 重复 → 抛错', () => {
    expect(() =>
      normalizeTodoList(
        [
          { content: 'A', status: 'pending' },
          { content: 'A', status: 'completed' }
        ],
        false
      )
    ).toThrow(/重复/)
  })

  it('status 非法 → 抛错', () => {
    expect(() => normalizeTodoList([{ content: 'A', status: 'done' }], false)).toThrow(/status 非法/)
  })

  it('默认最多一个 in_progress；并发模式放开', () => {
    const raw = [
      { content: 'A', status: 'in_progress' },
      { content: 'B', status: 'in_progress' }
    ]
    expect(() => normalizeTodoList(raw, false)).toThrow(/in_progress/)
    expect(normalizeTodoList(raw, true)).toHaveLength(2)
  })
})

describe('formatTodoList', () => {
  it('按序号 + 中文状态渲染', () => {
    expect(
      formatTodoList([
        { content: 'A', status: 'pending' },
        { content: 'B', status: 'in_progress' },
        { content: 'C', status: 'completed' }
      ])
    ).toBe('1. [待办] A\n2. [进行中] B\n3. [已完成] C')
  })
})

describe('createTodoSkill', () => {
  it('合法调用 → success，message 含清单与进度，data 带计数', async () => {
    const skill = createTodoSkill()
    const result = await skill.execute(
      {
        todos: [
          { content: 'A', status: 'completed' },
          { content: 'B', status: 'in_progress' },
          { content: 'C', status: 'pending' }
        ]
      },
      {}
    )
    expect(result.success).toBe(true)
    expect(result.message).toContain('当前任务清单（共 3 项）')
    expect(result.message).toContain('[已完成] A')
    expect(result.message).toContain('1 待办 / 1 进行中 / 1 完成')
    expect(result.data).toEqual({
      todos: [
        { content: 'A', status: 'completed' },
        { content: 'B', status: 'in_progress' },
        { content: 'C', status: 'pending' }
      ],
      counts: { pending: 1, inProgress: 1, completed: 1 }
    })
  })

  it('非法清单 → success=false（不抛给循环）', async () => {
    const skill = createTodoSkill()
    const result = await skill.execute({ todos: [{ content: '', status: 'pending' }] }, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/非空/)
  })

  it('技能 id 与参数 schema 形状正确', () => {
    const skill = createTodoSkill()
    expect(skill.id).toBe('system.todo_write')
    const schema = skill.parametersSchema
    expect(schema?.type).toBe('object')
    expect(schema?.required).toContain('todos')
    expect(schema?.properties.todos.type).toBe('array')
  })
})
