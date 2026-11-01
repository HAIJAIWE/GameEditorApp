import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AgentSessionStore } from '../../src/main/agent/session/sessionStore'
import {
  DRAFT_LIST_LIMIT,
  buildDraftFile,
  defaultDraftName,
  draftSummaryOf,
  isDraftFile,
  safeDraftFileName
} from '@mobai/shared/agent/conversation'

/**
 * AI 对话草稿（对齐 旧版 `ui/digital_panel_workspace` 的
 * `_save_draft` / `_load_draft_from` / `_list_drafts`）。
 *
 * 与 旧版 的差异（有意）：旧版 草稿存 `QTextEdit.toHtml()`，
 * TS 存**结构化 messages** —— 恢复时直接灌回面板 state，不需要解析 HTML。
 */

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-agent-draft-'))
}

function userMessage(text: string): Record<string, unknown> {
  return { role: 'user', content: text }
}

describe('草稿：文件名安全化（草稿名直接当文件名用）', () => {
  it('正常中文名原样保留（含空格与连字符 —— 草稿名里很常见）', () => {
    expect(safeDraftFileName('我的 草稿-1')).toBe('我的 草稿-1')
  })

  it('Windows 非法字符替换为下划线，不静默删字', () => {
    expect(safeDraftFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  it('控制字符替换为下划线（不是反向字符范围 —— 那会让 JS 解析期 SyntaxError）', () => {
    const dirty = `ok${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}end`
    expect(safeDraftFileName(dirty)).toBe('ok__end')
  })

  it('末尾的点/空格去掉（Windows 不允许）', () => {
    expect(safeDraftFileName('名字. ')).toBe('名字')
  })

  it('空名 / 全非法 → 回落默认名 对话草稿_MMDD_HHMM', () => {
    expect(safeDraftFileName('')).toBe(defaultDraftName())
    expect(safeDraftFileName('   ')).toBe(defaultDraftName())
  })

  it('默认名格式：对话草稿_MMDD_HHMM', () => {
    const name = defaultDraftName(new Date(2026, 0, 5, 9, 7))
    expect(name).toBe('对话草稿_0105_0907')
  })
})

describe('草稿：文件结构与判别', () => {
  it('buildDraftFile 复用会话的截断规则（与活跃会话同构）', () => {
    const draft = buildDraftFile('测试', [userMessage('你好'), { role: 'assistant', content: '在' }])
    expect(draft.name).toBe('测试')
    expect(draft.time).not.toBe('')
    expect(draft.messages).toHaveLength(2)
  })

  it('isDraftFile 只认 { name: string, messages: array }', () => {
    expect(isDraftFile({ name: 'a', messages: [] })).toBe(true)
    expect(isDraftFile({ name: 1, messages: [] })).toBe(false)
    expect(isDraftFile({ name: 'a' })).toBe(false)
    expect(isDraftFile(null)).toBe(false)
    expect(isDraftFile([])).toBe(false)
  })

  it('draftSummaryOf 带出消息数与路径', () => {
    const draft = buildDraftFile('x', [userMessage('1'), userMessage('2')])
    expect(draftSummaryOf(draft, '/tmp/x.json')).toEqual({
      name: 'x',
      time: draft.time,
      messageCount: 2,
      path: '/tmp/x.json'
    })
  })
})

describe('草稿仓：保存 / 列表 / 读取', () => {
  it('目录不存在时列表为空（不抛错）', () => {
    expect(new AgentSessionStore(makeDir()).listDrafts()).toEqual([])
  })

  it('会话为空时保存 → 抛中文错误（宁可不生成空草稿）', async () => {
    const store = new AgentSessionStore(makeDir())
    await expect(store.saveDraft('空会话')).rejects.toThrow('当前没有可保存的对话')
  })

  it('保存后可列出、可读取，且内容与会话一致', async () => {
    const store = new AgentSessionStore(makeDir())
    await store.save([userMessage('第一条'), { role: 'assistant', content: '回复' }])
    const saved = await store.saveDraft('我的草稿')

    expect(saved.name).toBe('我的草稿')
    expect(saved.messageCount).toBe(2)
    expect(saved.path.endsWith('我的草稿.json')).toBe(true)
    expect(existsSync(saved.path)).toBe(true)

    const drafts = store.listDrafts()
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.name).toBe('我的草稿')

    const loaded = store.readDraft(saved.path)
    expect(loaded.messages[0]?.content).toBe('第一条')
  })

  it('同名保存 → 覆盖同一文件，不产生第二份', async () => {
    const store = new AgentSessionStore(makeDir())
    await store.save([userMessage('v1')])
    await store.saveDraft('同名')
    await store.save([userMessage('v2')])
    await store.saveDraft('同名')

    expect(store.listDrafts()).toHaveLength(1)
    const drafts = store.listDrafts()
    expect(store.readDraft(drafts[0]!.path).messages[0]?.content).toBe('v2')
  })

  it('空名保存 → 落到默认名文件', async () => {
    const store = new AgentSessionStore(makeDir())
    await store.save([userMessage('x')])
    const saved = await store.saveDraft('   ')
    expect(saved.name).toBe(defaultDraftName())
  })

  it('列表上限 DRAFT_LIST_LIMIT，按时间倒序', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await store.save([userMessage('x')])
    // 直接写 8 个草稿文件，time 递增 → 期望取最近 5 个且倒序
    const draftsDir = join(dir, 'drafts')
    mkdirSync(draftsDir, { recursive: true })
    for (let i = 1; i <= 8; i += 1) {
      writeFileSync(
        join(draftsDir, `d${i}.json`),
        JSON.stringify({ name: `d${i}`, time: `2026-01-0${i} 10:00`, messages: [userMessage('m')] }),
        'utf-8'
      )
    }
    const list = store.listDrafts()
    expect(list).toHaveLength(DRAFT_LIST_LIMIT)
    expect(list.map((d) => d.name)).toEqual(['d8', 'd7', 'd6', 'd5', 'd4'])
  })

  it('坏草稿文件被跳过，不影响其余（草稿是辅助功能，不该因一个坏文件就整个不可用）', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await store.save([userMessage('x')])
    await store.saveDraft('好的')
    const draftsDir = join(dir, 'drafts')
    writeFileSync(join(draftsDir, 'broken.json'), '{ 坏 JSON', 'utf-8')
    writeFileSync(join(draftsDir, 'wrong.json'), JSON.stringify({ name: 'x' }), 'utf-8')
    writeFileSync(join(draftsDir, 'ignored.txt'), '不是 json', 'utf-8')

    expect(readdirSync(draftsDir).length).toBe(4)
    const list = store.listDrafts()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('好的')
  })

  it('读取不存在的草稿 / 损坏的草稿 → 中文错误', () => {
    const store = new AgentSessionStore(makeDir())
    expect(() => store.readDraft(join(makeDir(), 'nope.json'))).toThrow('草稿文件不存在')

    const dir = makeDir()
    const draftsDir = join(dir, 'drafts')
    mkdirSync(draftsDir, { recursive: true })
    const broken = join(draftsDir, 'b.json')
    writeFileSync(broken, '{ 坏', 'utf-8')
    expect(() => store.readDraft(broken)).toThrow('草稿文件损坏')
  })
})
