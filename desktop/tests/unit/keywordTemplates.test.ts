import { describe, expect, it } from 'vitest'

import {
  DEFAULT_KEYWORD_TEMPLATES,
  KEYWORD_TEMPLATES_SETTING_KEY,
  KEYWORD_TEMPLATE_TYPE_OPTIONS,
  defaultTemplateFor,
  isKnownTemplateKind,
  isTemplateEdited,
  keywordTemplateTypeLabel,
  parseKeywordTemplates,
  serializeKeywordTemplates,
  templateTextFor,
  withTemplateText
} from '../../src/shared/keywordTemplates'
import type { KeywordTemplates } from '../../src/shared/keywordTemplates'
import {
  IMAGE_EXTENSIONS,
  IMAGE_REFERENCE_FIELDS,
  UNUSED_PREVIEW_LIMIT,
  collectReferencedImagePaths,
  diffUnusedImages,
  imagePathKey,
  isImagePath,
  previewUnused,
  resolveImagePath,
  summarizeScan
} from '../../src/shared/cleanupImages'
import type { ItemRecord } from '../../src/shared/types'

/* ================= 关键词模板：与 Python 真源的一致性 ================= */

describe('keywordTemplates：类型选项对齐 advanced.py:235', () => {
  it('恰好 5 项，顺序与 PyQt 的 addItems 一致', () => {
    expect(KEYWORD_TEMPLATE_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      'skill',
      'role',
      'monster',
      'equip',
      'item'
    ])
  })

  it('中文标签正确', () => {
    expect(KEYWORD_TEMPLATE_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      '技能',
      '角色',
      '怪物',
      '装备',
      '道具'
    ])
  })

  it('未知类型回落成id 本身（不留空标签）', () => {
    expect(keywordTemplateTypeLabel('skill')).toBe('技能')
    expect(keywordTemplateTypeLabel('nonexistent')).toBe('nonexistent')
  })
})

describe('keywordTemplates：默认模板对齐 settings.py:311-523', () => {
  it('默认表有 10 类（比面板可编辑的 5 类多，PyQt 里另5 类是死数据）', () => {
    expect(Object.keys(DEFAULT_KEYWORD_TEMPLATES).sort()).toEqual([
      'achievement',
      'dialog',
      'equip',
      'item',
      'monster',
      'role',
      'skill',
      'story',
      'talent',
      'task'
    ])
  })

  it('每条默认模板都非空，且含【】小节与「输出要求」', () => {
    for (const [kind, text] of Object.entries(DEFAULT_KEYWORD_TEMPLATES)) {
      expect(text.length, `${kind} 不应为空`).toBeGreaterThan(50)
      expect(text, `${kind} 应含【输出要求】`).toContain('【输出要求】')
    }
  })

  it('skill 模板保留 {name} 等占位变量（变量名对齐 JSON 字段，不做重命名）', () => {
    const skill = DEFAULT_KEYWORD_TEMPLATES.skill
    expect(skill.startsWith('你是顶级游戏技能文案专家。')).toBe(true)
    expect(skill).toContain('- 名称(name): {name}')
    expect(skill).toContain('- 伤害类型(damage_type): {damage_type}')
    expect(skill.trimEnd().endsWith('语言风格：生动、有画面感，符合游戏设定。')).toBe(true)
  })

  it('achievement 是最短的一条（3 个数据字段），与 Python 一致', () => {
    const lengths = Object.entries(DEFAULT_KEYWORD_TEMPLATES).map(([kind, text]) => [kind, text.length] as const)
    const shortest = lengths.reduce((min, cur) => (cur[1] < min[1] ? cur : min))
    expect(shortest[0]).toBe('achievement')
  })

  it('defaultTemplateFor：已知类型给全文，未知类型给空串（对齐 templates.get(k, "")）', () => {
    expect(defaultTemplateFor('role')).toBe(DEFAULT_KEYWORD_TEMPLATES.role)
    expect(defaultTemplateFor('nonexistent')).toBe('')
  })

  it('isKnownTemplateKind 覆盖 10 类', () => {
    expect(isKnownTemplateKind('talent')).toBe(true)
    expect(isKnownTemplateKind('nonexistent')).toBe(false)
  })
})

describe('keywordTemplates：JSON 收发容错', () => {
  it('存储键落在 mb. 命名空间', () => {
    expect(KEYWORD_TEMPLATES_SETTING_KEY.startsWith('mb.')).toBe(true)
  })

  it('null / 空串 → 全默认', () => {
    expect(parseKeywordTemplates(null)).toEqual(DEFAULT_KEYWORD_TEMPLATES)
    expect(parseKeywordTemplates('')).toEqual(DEFAULT_KEYWORD_TEMPLATES)
  })

  it('非法 JSON → 全默认（不抛）', () => {
    expect(parseKeywordTemplates('{ not json')).toEqual(DEFAULT_KEYWORD_TEMPLATES)
  })

  it('非对象 JSON（数组/数字/字符串/null）→ 全默认', () => {
    for (const raw of ['[1,2]', '42', '"hello"', 'null']) {
      expect(parseKeywordTemplates(raw), raw).toEqual(DEFAULT_KEYWORD_TEMPLATES)
    }
  })

  it('部分覆盖：只有给定键被改，其余仍回落默认', () => {
    const parsed = parseKeywordTemplates(JSON.stringify({ skill: '我的技能模板' }))
    expect(parsed.skill).toBe('我的技能模板')
    expect(parsed.role).toBe(DEFAULT_KEYWORD_TEMPLATES.role)
    expect(parsed.talent).toBe(DEFAULT_KEYWORD_TEMPLATES.talent)
  })

  it('坏字段类型被忽略（数字/null 不覆盖成字符串）', () => {
    const parsed = parseKeywordTemplates(JSON.stringify({ skill: 123, role: null, item: 'ok' }))
    expect(parsed.skill).toBe(DEFAULT_KEYWORD_TEMPLATES.skill)
    expect(parsed.role).toBe(DEFAULT_KEYWORD_TEMPLATES.role)
    expect(parsed.item).toBe('ok')
  })

  it('未知键被保留（用户自建的类型不该被静默丢弃）', () => {
    const parsed = parseKeywordTemplates(JSON.stringify({ myType: 'x' }))
    expect((parsed as Record<string, string>).myType).toBe('x')
  })

  it('serialize→parse 往返幂等', () => {
    const table: KeywordTemplates = { skill: 'A', role: 'B' }
    const round = parseKeywordTemplates(serializeKeywordTemplates(table))
    expect(round.skill).toBe('A')
    expect(round.role).toBe('B')
  })

  it('serialize 键排序稳定（同一状态落盘结果可比对）', () => {
    const a = serializeKeywordTemplates({ role: 'R', skill: 'S' })
    const b = serializeKeywordTemplates({ skill: 'S', role: 'R' })
    expect(a).toBe(b)
  })

  it('serialize 丢弃非字符串字段', () => {
    const raw = serializeKeywordTemplates({ skill: 'S' } as KeywordTemplates & { bad: unknown })
    expect(raw).toBe('{"skill":"S"}')
  })
})

describe('keywordTemplates：读写辅助', () => {
  it('templateTextFor：无记录时回落默认模板', () => {
    expect(templateTextFor({}, 'skill')).toBe(DEFAULT_KEYWORD_TEMPLATES.skill)
  })

  it('templateTextFor：空串是合法值（用户清空模板），不被默认覆盖', () => {
    expect(templateTextFor({ skill: '' }, 'skill')).toBe('')
  })

  it('withTemplateText 不改入参（纯函数）', () => {
    const before: KeywordTemplates = { skill: 'A' }
    const after = withTemplateText(before, 'role', 'B')
    expect(before.role).toBeUndefined()
    expect(after.role).toBe('B')
    expect(after.skill).toBe('A')
  })

  it('isTemplateEdited：与默认一致 = 未改；清空过 = 已改', () => {
    expect(isTemplateEdited({}, 'skill')).toBe(false)
    expect(isTemplateEdited({ skill: DEFAULT_KEYWORD_TEMPLATES.skill }, 'skill')).toBe(false)
    expect(isTemplateEdited({ skill: '改了' }, 'skill')).toBe(true)
    expect(isTemplateEdited({ skill: '' }, 'skill')).toBe(true)
  })
})

/* ================= 清理未使用图片：扫描逻辑 ================= */

function item(type: string, id: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data: { ...data, id }, createdAt: '', updatedAt: '' }
}

describe('cleanupImages：常量对齐 advanced.py:398/402', () => {
  it('引用字段白名单 4 项，顺序一致', () => {
    expect([...IMAGE_REFERENCE_FIELDS]).toEqual(['image', 'icon', 'avatar', 'img'])
  })

  it('图片扩展名白名单 7 项，顺序一致', () => {
    expect([...IMAGE_EXTENSIONS]).toEqual(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'])
  })

  it('isImagePath 大小写不敏感，非白名单返回 false', () => {
    expect(isImagePath('a/b.PNG')).toBe(true)
    expect(isImagePath('a/b.jpeg')).toBe(true)
    expect(isImagePath('a/b.txt')).toBe(false)
    expect(isImagePath('a/png')).toBe(false)
  })
})

describe('cleanupImages：路径解析与比较键', () => {
  it('空/空白输入返回空串', () => {
    expect(resolveImagePath('', '/base')).toBe('')
    expect(resolveImagePath('   ', '/base')).toBe('')
  })

  it('相对路径拼基准目录', () => {
    expect(resolveImagePath('images/a.png', '/lib')).toBe('/lib/images/a.png')
  })

  it('反斜杠统一为正斜杠（Windows 数据文件常见）', () => {
    expect(resolveImagePath('images\\sub\\a.png', 'C:\\lib')).toBe('C:/lib/images/sub/a.png')
  })

  it('绝对路径不拼基准目录', () => {
    expect(resolveImagePath('/abs/a.png', '/lib')).toBe('/abs/a.png')
    expect(resolveImagePath('D:/abs/a.png', '/lib')).toBe('D:/abs/a.png')
  })

  it('消解 . 与 ..（词法）', () => {
    expect(resolveImagePath('./images/./a.png', '/lib')).toBe('/lib/images/a.png')
    expect(resolveImagePath('images/../img/a.png', '/lib')).toBe('/lib/img/a.png')
  })

  it('绝对路径越过根的 .. 被丢弃（等价文件系统）', () => {
    expect(resolveImagePath('/../a.png', '')).toBe('/a.png')
  })

  it('重复斜杠被压掉', () => {
    expect(resolveImagePath('/lib//images///a.png', '')).toBe('/lib/images/a.png')
  })

  it('比较键大小写不敏感（复刻 PyQt WindowsPath 语义）', () => {
    expect(imagePathKey('C:/Lib/A.PNG')).toBe(imagePathKey('c:/lib/a.png'))
  })

  it('两种写法落到同一个键', () => {
    expect(imagePathKey(resolveImagePath('images\\A.PNG', '/lib'))).toBe(
      imagePathKey(resolveImagePath('/lib/images/a.png', ''))
    )
  })
})

describe('cleanupImages：collectReferencedImagePaths', () => {
  const RECORDS = [
    item('skill', 's1', { image: 'images/s1.png' }),
    item('role', 'r1', { icon: 'images/r1.png', avatar: 'images/r1a.png' }),
    item('monster', 'm1', { img: 'images/m1.png', name: '狼' }),
    item('item', 'i1', { desc: '不含图片字段' })
  ]

  it('收集四个白名单字段，去重且按字典序', () => {
    const keys = collectReferencedImagePaths(RECORDS, '/lib')
    expect(keys).toEqual([
      '/lib/images/m1.png',
      '/lib/images/r1.png',
      '/lib/images/r1a.png',
      '/lib/images/s1.png'
    ])
  })

  it('非字符串值不算引用（对齐 isinstance(val, str)）', () => {
    const odd = [item('skill', 'x', { image: 123, icon: null, avatar: ['a.png'], img: { p: 'a.png' } })]
    expect(collectReferencedImagePaths(odd, '/lib')).toEqual([])
  })

  it('空白字符串不算引用（对齐 val.strip()）', () => {
    expect(collectReferencedImagePaths([item('skill', 'x', { image: '   ' })], '/lib')).toEqual([])
  })

  it('同一文件被多条引用 → 只算一次', () => {
    const dup = [item('skill', 'a', { image: 'p.png' }), item('role', 'b', { icon: 'p.png' })]
    expect(collectReferencedImagePaths(dup, '/lib')).toEqual(['/lib/p.png'])
  })

  it('大小写不同的同一路径合并为一条', () => {
    const dup = [item('skill', 'a', { image: 'P.PNG' }), item('role', 'b', { icon: 'p.png' })]
    expect(collectReferencedImagePaths(dup, '/lib')).toHaveLength(1)
  })

  it('额外字段（如 desc）里的图片路径不算引用（口径与 PyQt 一致）', () => {
    expect(collectReferencedImagePaths([item('skill', 'a', { desc: 'images/x.png' })], '/lib')).toEqual([])
  })

  it('data 非对象的条目被跳过而不崩', () => {
    const broken = [{ id: 'x', type: 'skill', data: null, createdAt: '', updatedAt: '' }] as unknown as ItemRecord[]
    expect(collectReferencedImagePaths(broken, '/lib')).toEqual([])
  })
})

describe('cleanupImages：diffUnusedImages', () => {
  it('做差集：目录有 3 张，引用 1 张 → 未使用 2 张', () => {
    const refs = collectReferencedImagePaths([item('skill', 's1', { image: '/lib/a.png' })], '/lib')
    const scan = diffUnusedImages(['/lib/a.png', '/lib/b.png', '/lib/c.png'], refs)
    expect(scan.unused).toEqual(['/lib/b.png', '/lib/c.png'])
    expect(scan.totalCount).toBe(3)
    expect(scan.usedCount).toBe(1)
    expect(scan.danglingRefCount).toBe(0)
  })

  it('全部被引用 → unused 为空', () => {
    const refs = collectReferencedImagePaths([item('skill', 's1', { image: '/lib/a.png' })], '/lib')
    const scan = diffUnusedImages(['/lib/a.png'], refs)
    expect(scan.unused).toEqual([])
    expect(scan.usedCount).toBe(1)
  })

  it('候选清单为空 →全 0（目录里没图）', () => {
    const scan = diffUnusedImages([], [])
    expect(scan).toEqual({ unused: [], totalCount: 0, usedCount: 0, danglingRefCount: 0 })
  })

  it('悬空引用：数据引用了但文件不存在 → 单列，不混进已引用数', () => {
    const refs = collectReferencedImagePaths([item('skill', 's1', { image: '/lib/ghost.png' })], '/lib')
    const scan = diffUnusedImages(['/lib/a.png'], refs)
    expect(scan.unused).toEqual(['/lib/a.png'])
    expect(scan.usedCount).toBe(0)
    expect(scan.danglingRefCount).toBe(1)
  })

  it('大小写不同的引用不会让文件被误判为未使用（安全方向）', () => {
    const refs = collectReferencedImagePaths([item('skill', 's1', { image: '/LIB/A.PNG' })], '')
    const scan = diffUnusedImages(['/lib/a.png'], refs)
    expect(scan.unused).toEqual([])
    expect(scan.usedCount).toBe(1)
  })

  it('候选清单里的重复项被去重（只算一次）', () => {
    const scan = diffUnusedImages(['/lib/a.png', '/lib/a.png'], [])
    expect(scan.unused).toEqual(['/lib/a.png'])
    expect(scan.totalCount).toBe(1)
  })

  it('反向斜杠写法的候选与正斜杠引用能匹配上', () => {
    const refs = collectReferencedImagePaths([item('skill', 's1', { image: '/lib/sub/a.png' })], '/lib')
    const scan = diffUnusedImages(['/lib/sub/a.png'], refs)
    expect(scan.unused).toEqual([])
  })

  it('结果按字典序，便于逐条比对', () => {
    const scan = diffUnusedImages(['/lib/z.png', '/lib/a.png', '/lib/m.png'], [])
    expect(scan.unused).toEqual(['/lib/a.png', '/lib/m.png', '/lib/z.png'])
  })
})

describe('cleanupImages：面板展示辅助', () => {
  const scan = diffUnusedImages(['/lib/a.png', '/lib/b.png'], [])

  it('无未使用图片时的摘要', () => {
    const clean = diffUnusedImages(['/lib/a.png'], ['/lib/a.png'])
    expect(summarizeScan(clean)).toBe('共 1 张图片，已被数据引用 1 张，未发现未使用的图片。')
  })

  it('有未使用图片时的摘要带三个数字', () => {
    expect(summarizeScan(scan)).toBe('共 2 张图片，已被引用 0 张，未使用 2 张。')
  })

  it('摘要附注悬空引用数', () => {
    const dangling = diffUnusedImages(['/lib/a.png'], ['/lib/ghost.png'])
    expect(summarizeScan(dangling)).toContain('另有 1 条引用指向不存在的文件')
  })

  it('previewUnused 短于上限时全部显示', () => {
    expect(previewUnused(['a', 'b'])).toEqual({ shown: ['a', 'b'], hiddenCount: 0 })
  })

  it('previewUnused 超出上限时折叠并给出剩余数', () => {
    const many = Array.from({ length: UNUSED_PREVIEW_LIMIT + 7 }, (_, i) => `p${i}`)
    const preview = previewUnused(many)
    expect(preview.shown).toHaveLength(UNUSED_PREVIEW_LIMIT)
    expect(preview.hiddenCount).toBe(7)
  })
})