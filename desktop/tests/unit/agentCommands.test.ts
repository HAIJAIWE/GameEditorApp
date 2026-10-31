import { describe, expect, it } from 'vitest'

import { parseDigitalCommands, type DigitalCommand } from '../../src/shared/agent/tools'

const COMMANDS: DigitalCommand[] = [
  { id: 'new', label: '新建对话', hint: '清空当前记录' },
  { id: 'preset', label: '切换预设', hint: '切到下一个预设' },
  { id: 'capabilities', label: '能力清单', hint: '查看工具与风险等级', enabled: false }
]

describe('parseDigitalCommands（斜杠命令匹配）', () => {
  it('不以 / 开头：不激活', () => {
    expect(parseDigitalCommands(COMMANDS, '你好')).toEqual({ query: null, matches: [] })
    expect(parseDigitalCommands(COMMANDS, '')).toEqual({ query: null, matches: [] })
  })

  it('仅 /：返回全部可用项（enabled:false 不出现）', () => {
    const { query, matches } = parseDigitalCommands(COMMANDS, '/')
    expect(query).toBe('')
    expect(matches.map((command) => command.id)).toEqual(['new', 'preset'])
  })

  it('按 id / label / hint 不区分大小写包含匹配', () => {
    expect(parseDigitalCommands(COMMANDS, '/new').matches.map((command) => command.id)).toEqual(['new'])
    expect(parseDigitalCommands(COMMANDS, '/预设').matches.map((command) => command.id)).toEqual(['preset'])
    // hint 命中：'清空当前记录' 含「清空」
    expect(parseDigitalCommands(COMMANDS, '/清空').matches.map((command) => command.id)).toEqual(['new'])
  })

  it('无匹配：matches 为空（调用方据此不弹菜单，允许当普通消息发送）', () => {
    expect(parseDigitalCommands(COMMANDS, '/nope').matches).toEqual([])
  })

  it('禁用项即使查询命中也不返回', () => {
    expect(parseDigitalCommands(COMMANDS, '/capabilities').matches).toEqual([])
  })
})
