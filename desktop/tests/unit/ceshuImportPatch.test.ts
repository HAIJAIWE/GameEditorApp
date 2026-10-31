import { describe, expect, it } from 'vitest'

import {
  applyCeshuPatch,
  parseCeshuIssues,
  parseCeshuPatch,
  previewPatchValue
} from '../../src/shared/ceshu/data'
import { createDefaultCeshu } from '../../src/shared/ceshu/model'

function makeDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  doc.meta.positioning = '旧定位'
  return doc
}

describe('parseCeshuPatch：解析外部 AI 的增量 JSON', () => {
  it('合法补丁：带字段标签、旧值与变化标记', () => {
    const doc = makeDoc()
    const result = parseCeshuPatch('{"meta": {"positioning": "新定位"}}', doc)

    expect(result.errors).toEqual([])
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      chapter: 'meta',
      fieldKey: 'positioning',
      fieldLabel: '一句话定位',
      value: '新定位',
      previous: '旧定位',
      changed: true
    })
  })

  it('容错：markdown 代码块与尾逗号', () => {
    const doc = makeDoc()
    const fenced = parseCeshuPatch('```json\n{"meta": {"positioning": "甲",},}\n```', doc)
    expect(fenced.errors).toEqual([])
    expect(fenced.items[0]?.value).toBe('甲')
  })

  it('值没变 → changed=false（应用时跳过）', () => {
    const doc = makeDoc()
    const result = parseCeshuPatch('{"meta": {"positioning": "旧定位"}}', doc)
    expect(result.items[0]?.changed).toBe(false)
  })

  it('未知章节 / 未知字段 → 进 errors 并跳过，不猜', () => {
    const doc = makeDoc()
    const result = parseCeshuPatch('{"不存在的章": {"x": "y"}, "meta": {"nope": "y"}}', doc)
    expect(result.items).toEqual([])
    expect(result.errors.some((error) => error.includes('未知章节'))).toBe(true)
    expect(result.errors.some((error) => error.includes('没有字段「nope」'))).toBe(true)
  })

  it('空值不应用（不覆盖已有内容）', () => {
    const doc = makeDoc()
    const result = parseCeshuPatch('{"meta": {"positioning": "", "tags": []}}', doc)
    expect(result.items).toEqual([])
    expect(result.errors.some((error) => error.includes('没有可应用的字段'))).toBe(true)
  })

  it('点路径字段（user_personas.primary）能正确读写旧值', () => {
    const doc = makeDoc()
    doc.vision.user_personas = { primary: '旧用户' }
    const result = parseCeshuPatch('{"vision": {"user_personas.primary": "新用户"}}', doc)
    expect(result.items[0]).toMatchObject({
      fieldKey: 'user_personas.primary',
      previous: '旧用户',
      changed: true
    })
  })

  it('审阅结果（issues）明确拒绝并给出引导', () => {
    const result = parseCeshuPatch('{"issues": [{"chapter": "meta"}]}', makeDoc())
    expect(result.items).toEqual([])
    expect(result.errors[0]).toContain('审阅结果')
  })

  it('空内容 / 非 JSON → 中文错误', () => {
    expect(parseCeshuPatch('   ', makeDoc()).errors[0]).toContain('内容为空')
    expect(parseCeshuPatch('这不是 JSON', makeDoc()).errors[0]).toContain('无法解析')
  })
})

describe('parseCeshuIssues：解析审阅问题清单（只读）', () => {
  it('合法清单：字段齐全，error 为 null', () => {
    const result = parseCeshuIssues(
      '{"issues":[{"chapter":"meta","field":"positioning","severity":"high","message":"定位过于笼统","suggestion":"补一句目标用户与核心玩法"}]}'
    )
    expect(result.error).toBeNull()
    expect(result.issues).toEqual([
      {
        chapter: 'meta',
        field: 'positioning',
        severity: 'high',
        message: '定位过于笼统',
        suggestion: '补一句目标用户与核心玩法'
      }
    ])
  })

  it('severity 归一化：只保留 high/medium/low，其他值降为 medium；缺省字段补空串', () => {
    const result = parseCeshuIssues(
      '{"issues":[{"message":"甲","severity":"CRITICAL"},{"message":"乙","severity":"high"},{"message":"丙"}]}'
    )
    expect(result.issues.map((issue) => issue.severity)).toEqual(['medium', 'high', 'medium'])
    expect(result.issues[0]).toMatchObject({ chapter: '', field: '', suggestion: '' })
  })

  it('非对象元素 / 缺 message 的条目跳过，不污染清单', () => {
    const result = parseCeshuIssues('{"issues":["字符串", 42, null, {"message":"  "},{"message":"有效"}]}')
    expect(result.error).toBeNull()
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.message).toBe('有效')
  })

  it('不是审阅结果（缺 issues 数组）→ 中文错误', () => {
    expect(parseCeshuIssues('{"meta":{"positioning":"x"}}').error).toBe('这不是审阅结果：缺少 issues 数组')
    expect(parseCeshuIssues('{"issues":"x"}').error).toBe('这不是审阅结果：缺少 issues 数组')
  })

  it('容错：markdown 代码块与尾逗号', () => {
    const result = parseCeshuIssues('```json\n{"issues":[{"message":"甲","severity":"low",},],}\n```')
    expect(result.error).toBeNull()
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ message: '甲', severity: 'low' })
  })

  it('空内容 / 非 JSON → 中文错误', () => {
    expect(parseCeshuIssues('   ').error).toContain('内容为空')
    expect(parseCeshuIssues('这不是 JSON').error).toContain('无法解析')
  })
})

describe('applyCeshuPatch：按章应用（非破坏）', () => {
  it('只写 changed 项；返回涉及章节与计数；不改原文档', () => {
    const doc = makeDoc()
    const parsed = parseCeshuPatch(
      '{"meta": {"positioning": "新定位"}, "story": {"main_plot": "新主线"}}',
      doc
    )
    const result = applyCeshuPatch(doc, parsed.items)

    expect(result.applied).toBe(2)
    expect(result.chapters).toEqual(['meta', 'story'])
    expect(result.doc.meta.positioning).toBe('新定位')
    expect(result.doc.story.main_plot).toBe('新主线')
    // 原文档不变（纯函数）
    expect(doc.meta.positioning).toBe('旧定位')
  })

  it('changed=false 的项不写、不列入章节', () => {
    const doc = makeDoc()
    const parsed = parseCeshuPatch('{"meta": {"positioning": "旧定位"}}', doc)
    const result = applyCeshuPatch(doc, parsed.items)
    expect(result.applied).toBe(0)
    expect(result.chapters).toEqual([])
  })

  it('点路径写入会补齐中间对象', () => {
    const doc = makeDoc()
    const parsed = parseCeshuPatch('{"vision": {"user_personas.primary": "新用户"}}', doc)
    const result = applyCeshuPatch(doc, parsed.items)
    expect(result.doc.vision.user_personas).toMatchObject({ primary: '新用户' })
  })
})

describe('previewPatchValue：预览截断', () => {
  it('长文本截断加省略号；对象转紧凑 JSON；空值有占位', () => {
    expect(previewPatchValue('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`)
    expect(previewPatchValue({ a: 1 })).toBe('{"a":1}')
    expect(previewPatchValue(undefined)).toBe('（空）')
  })
})
