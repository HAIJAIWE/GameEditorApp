import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FieldTemplateStore, MAX_TEMPLATE_NAME } from '../../src/main/schema/fieldTemplateStore'
import type { TypeFieldDef } from '@mobai/shared/types'

function field(name: string, type: TypeFieldDef['type'] = 'entry'): TypeFieldDef {
  return { name, label: `${name}:`, type, editable: true }
}

describe('FieldTemplateStore：保存 / 读取 / 删除', () => {
  let dir: string
  let file: string
  let store: FieldTemplateStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fieldtpl-'))
    file = join(dir, 'field_templates.json')
    store = new FieldTemplateStore(file)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('初始为空（文件不存在不报错）', () => {
    expect(store.listNames()).toEqual([])
    expect(store.get('x')).toBeNull()
  })

  it('保存后可读回，且是完整字段定义（不只标签）', () => {
    const fields = [field('name'), { ...field('level', 'spinbox'), from: 1, to: 99 }]
    store.save('我的技能模板', fields)
    const read = store.get('我的技能模板')
    expect(read).toHaveLength(2)
    expect(read?.[1]).toMatchObject({ name: 'level', type: 'spinbox', from: 1, to: 99 })
  })

  it('落盘后新实例能加载（持久化生效）', () => {
    store.save('T1', [field('a')])
    expect(existsSync(file)).toBe(true)
    const reloaded = new FieldTemplateStore(file)
    expect(reloaded.listNames()).toEqual(['T1'])
  })

  it('同名保存即覆盖', () => {
    store.save('T', [field('a')])
    store.save('T', [field('a'), field('b')])
    expect(store.get('T')).toHaveLength(2)
  })

  it('删除：存在返回 true，不存在返回 false', () => {
    store.save('T', [field('a')])
    expect(store.remove('T')).toBe(true)
    expect(store.get('T')).toBeNull()
    expect(store.remove('不存在')).toBe(false)
  })

  it('listNames 排序稳定（中文按拼音序）', () => {
    store.save('乙', [field('a')])
    store.save('甲', [field('a')])
    expect(store.listNames()).toEqual(['甲', '乙'])
  })

  it('返回的字段是副本：改返回值不污染存储', () => {
    store.save('T', [field('a')])
    const read = store.get('T')
    read?.push(field('b'))
    expect(store.get('T')).toHaveLength(1)
  })
})

describe('FieldTemplateStore：校验（宁缺勿错）', () => {
  let dir: string
  let store: FieldTemplateStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fieldtpl-'))
    store = new FieldTemplateStore(join(dir, 'field_templates.json'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('名称为空 / 纯空白 → 报错', () => {
    expect(() => store.save('', [field('a')])).toThrow('模板名称不能为空')
    expect(() => store.save('   ', [field('a')])).toThrow('模板名称不能为空')
  })

  it('名称含路径分隔符 → 报错（防路径穿越）', () => {
    expect(() => store.save('a/b', [field('a')])).toThrow('路径分隔符')
    expect(() => store.save('a\\b', [field('a')])).toThrow('路径分隔符')
  })

  it('名称超长 → 报错', () => {
    expect(() => store.save('x'.repeat(MAX_TEMPLATE_NAME + 1), [field('a')])).toThrow('不能超过')
  })

  it('字段为空数组 → 报错（不许存空模板）', () => {
    expect(() => store.save('T', [])).toThrow('至少要包含一个字段')
  })

  it('字段名重复 → 报错', () => {
    expect(() => store.save('T', [field('a'), field('a')])).toThrow('字段名重复')
  })

  it('不支持的字段类型 → 报错', () => {
    expect(() => store.save('T', [field('a', 'textarea' as TypeFieldDef['type'])])).toThrow('不支持的字段类型')
  })
})

describe('FieldTemplateStore：损坏文件的兜底', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fieldtpl-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('JSON 损坏 → 抛中文错误（由 IPC 转错误响应，不静默）', () => {
    const file = join(dir, 'field_templates.json')
    writeFileSync(file, '{ broken', 'utf-8')
    expect(() => new FieldTemplateStore(file).listNames()).toThrow('读取字段模板文件失败')
  })

  it('结构不对的条目被丢弃，好条目仍可用（一个坏模板不毁掉全部）', () => {
    const file = join(dir, 'field_templates.json')
    writeFileSync(
      file,
      JSON.stringify({ 好的: [field('a')], 坏的: 'not-an-array', 空的: [] }),
      'utf-8'
    )
    const store = new FieldTemplateStore(file)
    expect(store.listNames()).toEqual(['好的'])
  })

  it('落盘内容是 JSON 对象，键即模板名', () => {
    const file = join(dir, 'field_templates.json')
    const store = new FieldTemplateStore(file)
    store.save('T', [field('a')])
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    expect(Object.keys(raw)).toEqual(['T'])
  })
})
