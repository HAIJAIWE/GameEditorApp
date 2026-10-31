import { describe, expect, it } from 'vitest'

import { parseDigitalReferences, type DigitalReference } from '../../src/shared/agent/ui'

const REFS: DigitalReference[] = [
  { id: 'character', name: '角色' },
  { id: 'skill', name: '技能' },
  { id: 'item', name: '道具' }
]

describe('parseDigitalReferences（@ 引用匹配）', () => {
  it('不以 @ 开头：不激活', () => {
    expect(parseDigitalReferences(REFS, '你好')).toEqual({ query: null, matches: [] })
    expect(parseDigitalReferences(REFS, '')).toEqual({ query: null, matches: [] })
  })

  it('仅 @：返回全部候选', () => {
    const { query, matches } = parseDigitalReferences(REFS, '@')
    expect(query).toBe('')
    expect(matches.map((reference) => reference.id)).toEqual(['character', 'skill', 'item'])
  })

  it('按 name / id 不区分大小写匹配', () => {
    expect(parseDigitalReferences(REFS, '@角色').matches.map((reference) => reference.id)).toEqual(['character'])
    expect(parseDigitalReferences(REFS, '@skill').matches.map((reference) => reference.id)).toEqual(['skill'])
  })

  it('token 已以空格结束（已选定）：不再激活', () => {
    expect(parseDigitalReferences(REFS, '@角色 帮我补全')).toEqual({ query: null, matches: [] })
  })

  it('无匹配：matches 为空', () => {
    expect(parseDigitalReferences(REFS, '@不存在').matches).toEqual([])
  })
})
