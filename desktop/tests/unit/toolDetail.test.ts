import { describe, expect, it } from 'vitest'

import { DIFF_ROW_LIMIT, TOOL_ARGS_LIMIT, diffRows, formatToolArgs } from '../../src/shared/agent/toolDetail'

describe('formatToolArgs：参数文本整理', () => {
  it('空 / 纯空白 → 空文本，不标记 JSON', () => {
    expect(formatToolArgs()).toEqual({ text: '', isJson: false })
    expect(formatToolArgs('  \n\t ')).toEqual({ text: '', isJson: false })
  })

  it('合法 JSON → 两空格缩进美化', () => {
    expect(formatToolArgs('{"action":"list","limit":2}')).toEqual({
      text: '{\n  "action": "list",\n  "limit": 2\n}',
      isJson: true
    })
  })

  it('非法 JSON → 原样返回（纯文本参数不该被吃掉）', () => {
    expect(formatToolArgs('run --path a/b')).toEqual({ text: 'run --path a/b', isJson: false })
  })

  it('超长 → 截到上限并追加截断标注', () => {
    const long = 'x'.repeat(TOOL_ARGS_LIMIT + 100)
    const formatted = formatToolArgs(long)
    expect(formatted.text).toBe(`${'x'.repeat(TOOL_ARGS_LIMIT)}\n…（已截断）`)
    expect(formatted.isJson).toBe(false)
  })
})

describe('diffRows：unified diff 行切分', () => {
  it('普通输出（哪怕有 - 开头的列表行）→ null', () => {
    expect(diffRows('共 2 条数据\n- 法师\n- 战士')).toBeNull()
    expect(diffRows(undefined)).toBeNull()
    expect(diffRows('')).toBeNull()
  })

  it('只有 @@ 也认作 diff（无文件头的片段补丁）', () => {
    expect(diffRows('@@ -1,2 +1,2 @@\n-a\n+b')).toEqual([
      { kind: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { kind: 'del', text: '-a' },
      { kind: 'add', text: '+b' }
    ])
  })

  it('增 / 删 / 上下文分别归类，行首符号原样保留', () => {
    expect(diffRows('@@ -1 +1 @@\n ctx\n-old\n+new\n tail')).toEqual([
      { kind: 'hunk', text: '@@ -1 +1 @@' },
      { kind: 'ctx', text: ' ctx' },
      { kind: 'del', text: '-old' },
      { kind: 'add', text: '+new' },
      { kind: 'ctx', text: ' tail' }
    ])
  })

  it('+++ / --- 文件头归 hunk，不当增删行', () => {
    expect(diffRows('--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b')).toEqual([
      { kind: 'hunk', text: '--- a/x.ts' },
      { kind: 'hunk', text: '+++ b/x.ts' },
      { kind: 'hunk', text: '@@ -1 +1 @@' },
      { kind: 'del', text: '-a' },
      { kind: 'add', text: '+b' }
    ])
  })

  it(`超 ${DIFF_ROW_LIMIT} 行 → 截断并追加一条 hunk 标注`, () => {
    const lines = ['@@ -1 +1 @@', ...Array.from({ length: DIFF_ROW_LIMIT + 200 }, () => ' ctx')]
    const rows = diffRows(lines.join('\n'))
    expect(rows).toHaveLength(DIFF_ROW_LIMIT + 1)
    expect(rows?.at(-1)).toEqual({ kind: 'hunk', text: '…（已截断）' })
  })
})
