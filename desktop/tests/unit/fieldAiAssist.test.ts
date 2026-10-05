import { describe, expect, it } from 'vitest'

import {
  autoFillLabel,
  buildAutoImageInfo,
  buildDescContext,
  buildDescPrompt,
  buildImageTagsPrompt,
  DESC_CONTEXT_EXCLUDED_FIELDS,
  IMAGE_TAGS_MAX,
  mergeImageTagsResult
} from '../../src/shared/fieldAiAssist'

describe('desc 生成：上下文组装', () => {
  it('首行永远是数据类型，随后是各字段「键：值」', () => {
    const context = buildDescContext('角色', { name: '亚瑟', level: 3 })
    expect(context).toBe('数据类型：角色\nname：亚瑟\nlevel：3')
  })

  it('排除 desc/description/image/id（对齐 PyQt generate_desc_only 的排除清单）', () => {
    const context = buildDescContext('角色', {
      id: 'r1',
      name: '亚瑟',
      desc: '已有描述不该进上下文',
      description: '同理',
      image: 'C:/a.png'
    })
    expect(DESC_CONTEXT_EXCLUDED_FIELDS).toEqual(['desc', 'description', 'image', 'id'])
    expect(context).toBe('数据类型：角色\nname：亚瑟')
  })

  it('跳过空值与 null/undefined（PyQt 的 `if value` 语义）', () => {
    const context = buildDescContext('角色', { name: '亚瑟', desc2: '', level: null, hp: undefined, atk: 0 })
    // atk=0 是有效数字（PyQt 的 `if value` 会跳过 0，但 0 攻击力是合法数据）
    expect(context).toBe('数据类型：角色\nname：亚瑟\natk：0')
  })

  it('数组/对象字段跳过并在末尾计数（不把 Python 字面量喂给模型）', () => {
    const context = buildDescContext('技能', {
      name: '火球',
      tags: ['火', '远程'],
      refs: { target: 'x' },
      lv: 5
    })
    expect(context).toContain('name：火球')
    expect(context).toContain('lv：5')
    expect(context).not.toContain("['火'")
    expect(context).toContain('（另有 2 个列表/对象字段未纳入上下文）')
  })

  it('超长值截断并加省略号（防 prompt 爆炸），超长行也截断', () => {
    const context = buildDescContext('角色', { bio: 'x'.repeat(500), key: 'y'.repeat(400) })
    // 单值上限 200
    const bioLine = context.split('\n').find((line) => line.startsWith('bio：')) ?? ''
    expect(bioLine.endsWith('…')).toBe(true)
    expect(bioLine.length).toBeLessThanOrEqual('bio：'.length + 200 + 1)
    // 键名本身超长时整行截断到 260
    const keyLine = context.split('\n').find((line) => line.startsWith('key：'.padEnd(300, 'k'))) ?? ''
    const longest = Math.max(...context.split('\n').map((line) => line.length))
    expect(longest).toBeLessThanOrEqual(260)
    expect(keyLine === '' || keyLine.length <= 260).toBe(true)
  })

  it('字段数有上限：超出的不纳入，且不追加计数说明', () => {
    const formData: Record<string, unknown> = {}
    for (let i = 0; i < 30; i += 1) formData[`f${i}`] = i
    const context = buildDescContext('角色', formData)
    const lines = context.split('\n')
    // 1 行类型 + 20 行字段
    expect(lines).toHaveLength(21)
    expect(lines[0]).toBe('数据类型：角色')
  })
})

describe('desc 生成：提示词', () => {
  it('包含类型名、上下文与风格约束（结构对齐 Python features/_ai_image.py:296-323）', () => {
    const prompt = buildDescPrompt('角色', '数据类型：角色\nname：亚瑟')
    expect(prompt).toContain('【角色】')
    expect(prompt).toContain('你是一位游戏文案创作专家')
    expect(prompt).toContain('用户正在为奇幻RPG游戏制作角色数据')
    expect(prompt).toContain('数据类型：角色\nname：亚瑟')
    expect(prompt).toContain('【风格要求】')
    expect(prompt).toContain('50-100字')
    expect(prompt).toContain('只输出描述文本，不要加任何前缀说明')
    expect(prompt).toContain('【输出】')
  })

  it('类型名出现在「制作 X 数据」处，替换后不留旧类型名', () => {
    const a = buildDescPrompt('角色', 'c')
    const b = buildDescPrompt('技能', 'c')
    expect(a).toContain('制作角色数据')
    expect(b).toContain('制作技能数据')
    expect(b).not.toContain('制作角色数据')
  })

  it('上下文为空时仍给出可执行的提示词（不产生「根据以下信息：」后为空）', () => {
    const prompt = buildDescPrompt('道具', '')
    expect(prompt).toContain('用户正在为奇幻RPG游戏制作道具数据')
    expect(prompt.length).toBeGreaterThan(150)
  })
})

describe('图片字段：自动填充（纯模板，不调 AI）', () => {
  it('与 Python _on_auto_generate_image_info 的模板一致', () => {
    expect(buildAutoImageInfo('亚瑟', '角色')).toEqual({
      desc: '亚瑟的图片描述',
      tags: '亚瑟,图片,游戏'
    })
  })

  it('名称为空时回落类型名（不产出「的图片描述」半截句）', () => {
    expect(buildAutoImageInfo('', '角色').desc).toBe('角色的图片描述')
    expect(buildAutoImageInfo('   ', '角色').tags).toBe('角色,图片,游戏')
  })

  it('名称与类型都为空时用「未命名」兜底', () => {
    expect(buildAutoImageInfo('', '').desc).toBe('未命名的图片描述')
  })

  it('按钮文案明确叫「自动填充」且不含「生成」（不误导成调 AI）', () => {
    expect(autoFillLabel()).toBe('自动填充')
    expect(autoFillLabel()).not.toContain('生成')
  })
})

describe('图片标签：AI 分析', () => {
  it('提示词带上图片路径（对齐 Python dynamic_form.py::_on_ai_analyze_image）', () => {
    const prompt = buildImageTagsPrompt('D:/art/hero.png')
    expect(prompt).toBe('请描述这张图片的内容，提取主要视觉元素作为标签: D:/art/hero.png')
  })

  it('追加到现有标签后、分隔符是「, 」（对齐 PyQt 的 setText 拼接）', () => {
    expect(mergeImageTagsResult('已有', '火焰,岩石')).toBe('已有, 火焰,岩石')
  })

  it('现有为空时直接用结果，不留前导分隔符', () => {
    expect(mergeImageTagsResult('', '火焰,岩石')).toBe('火焰,岩石')
    expect(mergeImageTagsResult('   ', '火焰')).toBe('火焰')
  })

  it('多行结果压成单行（不破坏「逗号分隔」语义）', () => {
    expect(mergeImageTagsResult('', '火焰, 岩石\n烟雾, 魔法')).toBe('火焰,岩石,烟雾,魔法')
  })

  it('结果截断到 200 字（对齐 PyQt 的 result.strip()[:200]）', () => {
    const merged = mergeImageTagsResult('', 'x'.repeat(500))
    expect(merged).toHaveLength(IMAGE_TAGS_MAX)
    expect(IMAGE_TAGS_MAX).toBe(200)
  })

  it('空结果保留原值，不把已有标签清掉', () => {
    expect(mergeImageTagsResult('已有', '')).toBe('已有')
    expect(mergeImageTagsResult('已有', '   \n  ')).toBe('已有')
  })
})