import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/** 迁移后（v5.0）文档中本用例断言到的字段形状 */
interface MigratedDoc {
  version: string
  combat: { damage_formula: string; combat_mode: string; combat_pace: string }
  market_analysis: { competitors: Array<{ name: string }> }
  monetization: { payment_model: string; pricing_tiers: string[]; vip_system: string; season_pass: string }
  story: { npc_list: unknown }
  economy: { currency_types: Array<{ name: string }>; source_sink: string }
  audio: { sfx_list: unknown }
  risk_handling: { risk_matrix: unknown; contingency_plan: string }
  accessibility: { language_list: unknown }
  mvp: { milestones: unknown }
  vision: { business_model: string }
  systems: { battle: { config: { damage_formula: string } } }
}

/**
 * W33 迁移工具（v4.0 → v5.0 策划书数据迁移）端到端验收。
 * 场景：磁盘预置一份 v4.0（9 章）旧策划书 → 启动 → 加载时经 normalizeCeshu 自动迁移；
 * 断言版本升级为 5.0、各条派生规则生效、旧 9 章原样保留，且旧文档仍出现在列表。
 */
test('迁移工具：v4.0 旧策划书加载时自动迁移到 v5.0 并派生新章节字段', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-migration-e2e-'))
  const ceshuDir = join(userDataDir, 'ceshu')
  mkdirSync(ceshuDir, { recursive: true })

  const docId = 'a1b2c3d4'
  const v4Doc = {
    version: '4.0',
    ceshu_id: docId,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    parent_id: '',
    version_label: 'v1.0',
    is_active: true,
    version_note: '',
    style: '',
    module_type: '',
    meta: { game_name: '旧版迁移E2E', game_type: 'rpg', gdd_scope: 'full' },
    vision: { competitive_analysis: ['竞品甲', '竞品乙'], business_model: '买断制' },
    worldview: { character_network: [{ name: '张三' }] },
    systems: {
      battle: { enabled: true, name: '战斗', config: { damage_formula: 'ATK-DEF', turn_mode: 'turn_based', combat_pace: 'medium' } },
      economy: {
        enabled: true,
        name: '经济',
        config: {
          currency_types: '金币, 钻石',
          source_mechanisms: '任务奖励',
          inflation_control: '回收机制',
          payment_system: '内购',
          recharge_tiers: '6元, 30元',
          vip_system: false,
          season_pass: true
        }
      }
    },
    resources: {
      audio_assets: ['bgm1.mp3'],
      risk_matrix: [{ risk: 'A' }],
      contingency_plan: '备用方案',
      localization: ['zh-CN']
    },
    tech: { milestones: [{ name: 'M1' }] }
  }
  writeFileSync(join(ceshuDir, `${docId}.json`), JSON.stringify(v4Doc), 'utf-8')

  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 回读：加载路径已把 v4.0 迁移为 v5.0
    const doc = (await window.evaluate(async (id) => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { get: (req: { id: string }) => Promise<Record<string, unknown>> } }
        }
      ).mbApi
      return api.ceshu.get({ id })
    }, docId)) as unknown as MigratedDoc

    expect(doc.version).toBe('5.0')

    // 派生：systems.battle.config → combat
    expect(doc.combat.damage_formula).toBe('ATK-DEF')
    expect(doc.combat.combat_mode).toBe('turn_based')
    expect(doc.combat.combat_pace).toBe('medium')
    // 派生：vision → market_analysis / monetization（business_model 优先于 payment_system）
    expect(doc.market_analysis.competitors[0].name).toBe('竞品甲')
    expect(doc.monetization.payment_model).toBe('买断制')
    // 派生：worldview → story（原 characters 已并入 story）
    expect(doc.story.npc_list).toEqual([{ name: '张三' }])
    // 派生：systems.economy.config → economy / monetization
    expect(doc.economy.currency_types[0].name).toBe('金币')
    expect(doc.economy.source_sink).toBe('任务奖励')
    expect(doc.monetization.pricing_tiers).toEqual(['6元', '30元'])
    expect(doc.monetization.vip_system).toBe('未启用')
    expect(doc.monetization.season_pass).toBe('启用')
    // 派生：resources → audio / risk_handling / accessibility
    expect(doc.audio.sfx_list).toEqual(['bgm1.mp3'])
    expect(doc.risk_handling.risk_matrix).toEqual([{ risk: 'A' }])
    expect(doc.risk_handling.contingency_plan).toBe('备用方案')
    expect(doc.accessibility.language_list).toEqual(['zh-CN'])
    // 派生：tech.milestones → mvp.milestones
    expect(doc.mvp.milestones).toEqual([{ name: 'M1' }])
    // 旧 9 章原样保留
    expect(doc.vision.business_model).toBe('买断制')
    expect(doc.systems.battle.config.damage_formula).toBe('ATK-DEF')

    // UI：旧文档仍出现在策划书首页卡片
    await expect(window.getByTestId('home-card').filter({ hasText: '旧版迁移E2E' })).toBeVisible()
  } finally {
    await app.close()
  }
})
