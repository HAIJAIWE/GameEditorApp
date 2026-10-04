import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildPersonalizedContext,
  extractPreferences,
  PREFERENCE_KEYWORDS
} from '../../src/shared/agent/personalization'
import { FeedbackStore, PreferenceStore, createPersonalizationStores } from '../../src/main/agent/preferenceStore'

describe('personalization：extractPreferences（关键词 → 偏好键值）', () => {
  it('空评论返回空对象', () => {
    expect(extractPreferences('')).toEqual({})
    expect(extractPreferences('这个回答不错')).toEqual({})
  })

  it('命中单个关键词', () => {
    expect(extractPreferences('我更喜欢 python')).toEqual({ language: 'python' })
    expect(extractPreferences('我用 vscode 写代码')).toEqual({ code_editor: 'vscode' })
    expect(extractPreferences('归档放桌面')).toEqual({ archive_dir: '桌面' })
  })

  it('命中多个关键词（去重到同一键只保留一个值）', () => {
    const prefs = extractPreferences('我用 python 和 vscode，归档在文档里')
    expect(prefs).toEqual({
      language: 'python',
      code_editor: 'vscode',
      archive_dir: '文档'
    })
  })

  it('大小写不敏感', () => {
    expect(extractPreferences('I USE PYTHON AND VSCODE')).toEqual({
      language: 'python',
      code_editor: 'vscode'
    })
  })

  it('go 的两种表述都映射到 go', () => {
    expect(extractPreferences('写 go 语言')).toEqual({ language: 'go' })
    expect(extractPreferences('golang 不错')).toEqual({ language: 'go' })
  })

  it('未命中任何关键词时不发明偏好', () => {
    expect(extractPreferences('谢谢你的帮助，很有用')).toEqual({})
  })

  it('关键词表覆盖了语言/编辑器/归档三类', () => {
    const keys = new Set(PREFERENCE_KEYWORDS.map(([, key]) => key))
    expect([...keys].sort()).toEqual(['archive_dir', 'code_editor', 'language'])
  })
})

describe('personalization：buildPersonalizedContext（偏好 → 提示词片段）', () => {
  it('空偏好返回空串（调用方据此跳过注入）', () => {
    expect(buildPersonalizedContext({})).toBe('')
  })

  it('单条偏好拼出带标题的片段', () => {
    const block = buildPersonalizedContext({ language: 'python' })
    expect(block).toContain('## 用户偏好（来自历史反馈，仅供参考，不要强行套用）')
    expect(block).toContain('- 用户偏好的编程语言：python')
  })

  it('多偏好按键序拼接（纯函数、稳定）', () => {
    const a = buildPersonalizedContext({ language: 'go', code_editor: 'pycharm', archive_dir: '下载' })
    const b = buildPersonalizedContext({ archive_dir: '下载', code_editor: 'pycharm', language: 'go' })
    expect(a).toBe(b)
    expect(a).toContain('- 用户偏好的编程语言：go')
    expect(a).toContain('- 用户偏好的代码编辑器：pycharm')
    expect(a).toContain('- 用户常用的归档目录：下载')
  })

  it('未知键用键名兜底（不崩）', () => {
    expect(buildPersonalizedContext({ unknown_key: 'x' })).toContain('- unknown_key：x')
  })
})

describe('PreferenceStore：JSON 文件持久化', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prefstore-'))
    file = join(dir, 'preferences.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('set / get / getAll 基本读写', () => {
    const store = new PreferenceStore(file)
    store.set('language', 'python')
    store.set('code_editor', 'vscode')
    expect(store.get('language')).toBe('python')
    expect(store.getAll()).toEqual({ language: 'python', code_editor: 'vscode' })
  })

  it('set 后落盘，load 能从磁盘恢复', () => {
    const store = new PreferenceStore(file)
    store.set('language', 'go')
    expect(existsSync(file)).toBe(true)

    const reloaded = new PreferenceStore(file)
    reloaded.load()
    expect(reloaded.get('language')).toBe('go')
  })

  it('load 不抛错：文件不存在保持空', () => {
    const store = new PreferenceStore(join(dir, 'nope.json'))
    expect(() => store.load()).not.toThrow()
    expect(store.getAll()).toEqual({})
  })

  it('load 损坏文件不抛错，从空开始', () => {
    writeFileSync(file, '{ broken json', 'utf-8')
    const store = new PreferenceStore(file)
    expect(() => store.load()).not.toThrow()
    expect(store.getAll()).toEqual({})
  })

  it('delete 移除条目并落盘', () => {
    const store = new PreferenceStore(file)
    store.set('language', 'python')
    store.delete('language')
    expect(store.get('language')).toBeUndefined()
    const reloaded = new PreferenceStore(file)
    reloaded.load()
    expect(reloaded.getAll()).toEqual({})
  })
})

describe('FeedbackStore：反馈记录 + 偏好提炼', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fbstore-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('record 留存记录，getAll 返回副本', () => {
    const prefs = new PreferenceStore(join(dir, 'preferences.json'))
    const fb = new FeedbackStore(join(dir, 'feedback.json'), prefs)
    fb.record(5, '很好')
    const all = fb.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ rating: 5, comment: '很好' })
    expect(all[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('评分 ≥4 且带评论时提炼偏好进 PreferenceStore', () => {
    const prefs = new PreferenceStore(join(dir, 'preferences.json'))
    const fb = new FeedbackStore(join(dir, 'feedback.json'), prefs)
    fb.record(5, '我用 python 和 vscode')
    expect(prefs.get('language')).toBe('python')
    expect(prefs.get('code_editor')).toBe('vscode')
  })

  it('负评（≤2）只留存、不提炼', () => {
    const prefs = new PreferenceStore(join(dir, 'preferences.json'))
    const fb = new FeedbackStore(join(dir, 'feedback.json'), prefs)
    fb.record(1, '我用 python 但你答得不好')
    expect(fb.getAll()).toHaveLength(1)
    expect(prefs.get('language')).toBeUndefined()
  })

  it('高评分但空评论不提炼（无素材）', () => {
    const prefs = new PreferenceStore(join(dir, 'preferences.json'))
    const fb = new FeedbackStore(join(dir, 'feedback.json'), prefs)
    fb.record(5, '   ')
    expect(prefs.getAll()).toEqual({})
  })

  it('记录落盘并能在重建后恢复', () => {
    const file = join(dir, 'feedback.json')
    const prefs1 = new PreferenceStore(join(dir, 'preferences.json'))
    new FeedbackStore(file, prefs1).record(4, '归档在桌面')
    const prefs2 = new PreferenceStore(join(dir, 'preferences.json'))
    prefs2.load()
    const fb2 = new FeedbackStore(file, prefs2)
    fb2.load()
    expect(fb2.getAll()).toHaveLength(1)
    expect(prefs2.get('archive_dir')).toBe('桌面')
  })
})

describe('createPersonalizationStores：随库隔离构造 + 加载', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'perso-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('构造即加载磁盘已有数据，返回 preferences/feedback 两个 store', () => {
    // 预置偏好文件
    writeFileSync(join(dir, 'preferences.json'), JSON.stringify({ language: 'go' }), 'utf-8')
    const stores = createPersonalizationStores(dir)
    expect(stores.preferences.get('language')).toBe('go')
    expect(typeof stores.feedback.record).toBe('function')
  })
})
