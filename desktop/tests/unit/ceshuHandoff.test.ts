import { describe, expect, it } from 'vitest'

import { renderCeshuMarkdown } from '../../src/main/ceshu/export/doc/markdown'
import type { CeshuDocument } from '../../src/shared/ceshu/reference/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshu/fields/ceshuFields'
import {
  HANDOFF_DOCS,
  HANDOFF_VOLUMES,
  HANDOFF_ROLE_LABELS,
  buildHandoffPlan,
  buildRoleIndex,
  docRoles,
  docsOfVolume,
  handoffVolumeFolderName,
  handoffVolumeIndexPath,
  planHandoffDocs,
  docLayer,
  acceptanceCheck,
  acceptanceText,
  analyzeParallelism,
  renderHandoffDoc,
  renderHandoffIndex,
  renderHandoffHealthMarkdown,
  renderHandoffRouteMarkdown,
  renderHandoffManifest,
  renderHandoffVolumeIndex,
  resolveHandoffGenre
} from '../../src/shared/ceshu/workflow/ceshuHandoff'
import { buildHandoffFiles } from '../../src/main/ceshu/export/delivery/handoff'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'
import { SYSTEM_CONFIG_SCHEMA } from '../../src/shared/ceshu/model/systemConfigSchema'

/**
 * 开发交接包的**分卷 + 分文档 + 品类适配**（2026-10-27 第三轮）。
 *
 * 用户的两点判断：
 * ①「每个设计文档都有该做的事，顺序开发」（卷文件夹 + 编号文档）；
 * ②「游戏类型都不一样…自定义/组合品类能不能生成？无非是多了系统或玩法」。
 *
 * 钉住：
 * 1. 目录结构闭合：卷号/文档号连续、路径前缀正确、卷的 keyFields 由文档派生；
 * 2. **字段与系统 key 必须真实存在**（防「永远未填写」的假字段）；
 * 3. **品类裁剪**：视觉小说不出现「敌人与 Boss / 技能与 Buff」，但出现「剧情分支与结局」；
 *    组合品类（SLG+卡牌+Roguelike）取并集，多出「联盟与对抗 / 抽卡与卡池」；
 *    裁剪后编号**从 1 连续**（不留断号）；
 * 4. 门禁可算，校验问题只归相关文档；文档里有「要实现什么（按类分）」。
 */

function makeDoc(overrides: Partial<CeshuDocument['meta']> = {}): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  doc.meta.game_type = 'RPG'
  Object.assign(doc.meta, overrides)
  return doc
}

const TS = '2026-10-27 12:00:00'

const idsOf = (doc: CeshuDocument): string[] => planHandoffDocs(doc).map((item) => item.def.id)

describe('目录结构：卷 → 文档', () => {
  it('7 个卷文件夹，编号从 0 连续', () => {
    expect(HANDOFF_VOLUMES.map((volume) => volume.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(HANDOFF_VOLUMES.map((volume) => handoffVolumeFolderName(volume))).toEqual([
      '00-架构',
      '01-核心玩法',
      '02-内容',
      '03-系统',
      '04-界面',
      '05-打磨',
      '06-研发'
    ])
  })

  it('每卷的文档号从 1 连续、不重复（目录层）', () => {
    for (const volume of HANDOFF_VOLUMES) {
      const docs = docsOfVolume(volume.id)
      expect(docs.length).toBeGreaterThan(0)
      expect(docs.map((doc) => doc.order)).toEqual(docs.map((_doc, index) => index + 1))
    }
  })

  it('文档 id 全局唯一', () => {
    const ids = HANDOFF_DOCS.map((doc) => doc.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('路径 = 卷文件夹/编号-标题.md（编号按品类裁剪后重排）', () => {
    const planned = planHandoffDocs(makeDoc())
    expect(planned[0]?.path).toBe('00-架构/01-范围与平台.md')
    const equip = planned.find((item) => item.def.id === 'sys-equipment')
    expect(equip?.path).toBe('03-系统/01-装备与词条.md')
  })

  it('卷的 keyFields 由文档派生（不手写第二份）', () => {
    for (const volume of HANDOFF_VOLUMES) {
      const derived = new Set(
        docsOfVolume(volume.id).flatMap((doc) => doc.fields.map((field) => `${field.chapter}.${field.field}`))
      )
      const actual = new Set(volume.keyFields.map((field) => `${field.chapter}.${field.field}`))
      expect(actual).toEqual(derived)
    }
  })

  it('前置卷只能指向更早的卷（可顺序推进）', () => {
    for (const volume of HANDOFF_VOLUMES) {
      for (const required of volume.requires) {
        const target = HANDOFF_VOLUMES.find((item) => item.id === required)!
        expect(target.index).toBeLessThan(volume.index)
      }
    }
  })
})

describe('目录内容：字段与系统 key 必须真实存在（防假字段）', () => {
  it('每份文档的字段 key 都在 schema 里', () => {
    const offenders: string[] = []
    for (const doc of HANDOFF_DOCS) {
      for (const item of doc.fields) {
        const exists = (CESHU_CHAPTER_FIELDS[item.chapter] ?? []).some((field) => field.key === item.field)
        if (!exists) offenders.push(`${doc.id}: ${item.chapter}.${item.field}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('每份文档的系统 key 都在 SYSTEM_CONFIG_SCHEMA 里', () => {
    const offenders: string[] = []
    for (const doc of HANDOFF_DOCS) {
      for (const system of doc.systems ?? []) {
        if (SYSTEM_CONFIG_SCHEMA[system.key] === undefined) offenders.push(`${doc.id}: ${system.key}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('每份文档都有 purpose / 验收 / 至少一个字段或系统', () => {
    for (const doc of HANDOFF_DOCS) {
      expect(doc.purpose.length).toBeGreaterThan(8)
      expect(doc.acceptance.length).toBeGreaterThan(0)
      expect(doc.fields.length + (doc.systems ?? []).length).toBeGreaterThan(0)
    }
  })
})

describe('品类适配：game_type + game_type_tags', () => {
  it('单一品类：RPG → 动作档案，出现「敌人与 Boss」「技能与 Buff」', () => {
    const genre = resolveHandoffGenre(makeDoc())
    expect(genre.primary).toBe('action')
    expect(genre.composite).toBe(false)

    const ids = idsOf(makeDoc())
    expect(ids).toContain('content-enemy')
    expect(ids).toContain('sys-skill')
    // 别的品类专属文档不出现
    expect(ids).not.toContain('content-branch')
    expect(ids).not.toContain('sys-gacha')
  })

  it('视觉小说：去掉战斗两份，追加「剧情分支与结局」', () => {
    const doc = makeDoc({ game_type: '视觉小说' })
    const genre = resolveHandoffGenre(doc)
    expect(genre.primary).toBe('narrative')

    const ids = idsOf(doc)
    expect(ids).not.toContain('content-enemy')
    expect(ids).not.toContain('sys-skill')
    // 没有战斗就没有伤害公式
    expect(ids).not.toContain('core-combat')
    expect(ids).toContain('content-branch')
  })

  it('组合品类：SLG + 卡牌 + Roguelike → 取并集（多出联盟/抽卡，仍保留敌人与技能）', () => {
    const doc = makeDoc({ game_type: 'SLG', game_type_tags: ['卡牌', 'Roguelike'] })
    const genre = resolveHandoffGenre(doc)
    expect(genre.composite).toBe(true)
    expect(genre.profiles).toEqual(['strategy', 'card', 'roguelike'])

    const ids = idsOf(doc)
    // strategy → 联盟与对抗；card → 抽卡与卡池
    expect(ids).toContain('sys-social')
    expect(ids).toContain('sys-gacha')
    // 三个档案都在战斗组 ⇒ 敌人/技能保留
    expect(ids).toContain('content-enemy')
    expect(ids).toContain('sys-skill')
  })

  it('组合品类不重复：标签与主类型相同不额外增加档案', () => {
    const genre = resolveHandoffGenre(makeDoc({ game_type: 'RPG', game_type_tags: ['RPG', 'ARPG'] }))
    // RPG 与 ARPG 都是 action ⇒ 只有一个档案
    expect(genre.profiles).toEqual(['action'])
    expect(genre.composite).toBe(false)
  })

  it('未知类型（generic）：品类专属全出（宁可多给，不漏关键规格）', () => {
    const doc = makeDoc({ game_type: '' })
    const genre = resolveHandoffGenre(doc)
    expect(genre.primary).toBe('generic')
    // 品类专属不筛，但**条件文档**仍按项目事实判定（未填联机/音频 ⇒ 不出现）
    const expected = HANDOFF_DOCS.filter((item) => docLayer(item) !== 'conditional').length
    expect(idsOf(doc)).toHaveLength(expected)
  })

  it('裁剪后编号从 1 连续（视觉小说的内容卷不留断号）', () => {
    const doc = makeDoc({ game_type: '视觉小说' })
    const content = planHandoffDocs(doc).filter((item) => item.volume.id === 'content')
    expect(content.map((item) => item.number)).toEqual([1, 2, 3])
    expect(content.map((item) => item.def.title)).toEqual(['关卡配置表', '难度曲线与首关', '剧情分支与结局'])
    // 路径里的编号同步重排（原目录 order 4 的剧情分支现在是 03）
    expect(content[2]?.path).toBe('02-内容/03-剧情分支与结局.md')
  })
})

describe('角色分派：每份文档都有负责人', () => {
  it('每份文档至少一个角色（没有「没人认领」的文档）', () => {
    const orphans = HANDOFF_DOCS.filter((doc) => docRoles(doc).length === 0).map((doc) => doc.id)
    expect(orphans).toEqual([])
  })

  it('角色索引：每个角色都有标签，且文档不重复归到同一角色两次', () => {
    const index = buildRoleIndex(makeDoc())
    expect(index.map((entry) => entry.role).sort()).toEqual(Object.keys(HANDOFF_ROLE_LABELS).sort())
    for (const entry of index) {
      const ids = entry.docs.map((item) => item.def.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('技术负责人读架构三份；美术读敌人/地图；测试读反馈/性能', () => {
    const index = buildRoleIndex(makeDoc())
    const tech = index.find((entry) => entry.role === 'tech')!
    const techIds = tech.docs.map((item) => item.def.id)
    expect(techIds).toContain('arch-stack')
    expect(techIds).toContain('arch-save')

    const art = index.find((entry) => entry.role === 'art')!
    expect(art.docs.map((item) => item.def.id)).toContain('content-enemy')

    const qa = index.find((entry) => entry.role === 'qa')!
    const qaIds = qa.docs.map((item) => item.def.id)
    expect(qaIds).toContain('ui-feedback')
    expect(qaIds).toContain('polish-perf')
  })

  it('文档头写出负责角色', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-stack')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('> 负责角色：技术负责人')
  })

  it('文档头写出「来源章」回链（章名 + gdd 锚点）', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-stack')!
    const md = renderHandoffDoc(doc, planned, TS)
    // tech 是「第十章」，但锚点是 ch11（meta 占 ch1）——锚点不能用 chapterNumber 推
    expect(md).toContain('> 来源：第十章·技术规格（gdd.md#ch11）')
  })

  it('来源锚点在 gdd.md 里真实存在（目录与回链不脱钩）', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-stack')!
    const md = renderHandoffDoc(doc, planned, TS)
    const gdd = renderCeshuMarkdown(doc)
    const anchor = /gdd\.md#(ch\d+)/.exec(md)?.[1]
    expect(anchor).toBeDefined()
    expect(gdd).toContain(`<a id="${anchor}"></a>`)
  })

  it('README 带「按角色看」索引', () => {
    const md = renderHandoffIndex(makeDoc(), TS)
    expect(md).toContain('## 按角色看（谁该读哪些文档）')
    expect(md).toContain('### 技术负责人')
    expect(md).toContain('00-架构/02-引擎与技术栈.md')
  })
})

describe('品类追问：验收随品类变', () => {
  it('战斗类文档带上该品类的数值/取舍追问', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'core-combat')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('## 本作类型的额外检查点')
    expect(md).toContain('**动作 / 战斗导向**')
    expect(md).toContain('数值：TTK 与伤害公式是否闭合')
  })

  it('组合品类逐档案列追问（策略 + 卡牌两套）', () => {
    const doc = makeDoc({ game_type: 'SLG', game_type_tags: ['卡牌'] })
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'core-numeric')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('**策略 / 竞技（兵团 / 英雄）**')
    expect(md).toContain('**卡牌**')
  })

  it('没有品类追问的文档不出现该段（不凑段落）', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-save')!
    expect(renderHandoffDoc(doc, planned, TS)).not.toContain('## 本作类型的额外检查点')
  })
})

describe('条件文档：由项目事实决定出现（不是品类）', () => {
  it('纯单机不出现「服务端与联机」', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'none'
    expect(idsOf(doc)).not.toContain('tech-server')
  })

  it('联机形态非纯单机 → 出现，且排进架构卷末尾', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'co_op'
    const planned = planHandoffDocs(doc).filter((item) => item.volume.id === 'architecture')
    expect(planned.map((item) => item.def.id)).toContain('tech-server')
    expect(planned.map((item) => item.def.id)).toContain('arch-scaffold')
    expect(planned[planned.length - 1]?.def.id).toBe('tech-server')
    expect(planned.find((item) => item.def.id === 'arch-scaffold')?.path).toBe('00-架构/07-工程脚手架.md')
    expect(planned[planned.length - 1]?.path).toBe('00-架构/08-服务端与联机.md')
  })

  it('有音频引擎才出现「音频实现」', () => {
    const doc = makeDoc()
    expect(idsOf(doc)).not.toContain('audio-impl')
    doc.audio.audio_engine = 'Wwise'
    expect(idsOf(doc)).toContain('audio-impl')
  })

  it('有音效清单也算（不只看引擎）', () => {
    const doc = makeDoc()
    doc.audio.sfx_list = [{ category: 'UI', count: '80', description: '点击/确认' }]
    expect(idsOf(doc)).toContain('audio-impl')
  })

  it('层级三档：通用基线 / 品类专属 / 条件文档', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'mmo'
    doc.audio.audio_engine = 'Wwise'
    doc.art.art_style = '国风水墨 3D 渲染'
    const planned = planHandoffDocs(doc)
    const baseline = planned.filter((item) => item.layer === 'baseline')
    const genre = planned.filter((item) => item.layer === 'genre')
    const conditional = planned.filter((item) => item.layer === 'conditional')
    // 通用基线是主体，品类与条件只是增量
    expect(baseline.length).toBeGreaterThan(genre.length + conditional.length)
    expect(genre.map((item) => item.def.id).sort()).toEqual(['content-enemy', 'core-combat', 'sys-skill'])
    expect(conditional.map((item) => item.def.id).sort()).toEqual(['art-asset', 'audio-impl', 'tech-server'])
  })

  it('docLayer 判定优先级：有 when 就是条件文档', () => {
    const byId = (id: string) => HANDOFF_DOCS.find((doc) => doc.id === id)!
    expect(docLayer(byId('arch-scope'))).toBe('baseline')
    expect(docLayer(byId('content-enemy'))).toBe('genre')
    expect(docLayer(byId('tech-server'))).toBe('conditional')
  })

  it('音频实现带「音效事件映射」表（事件 → 音效，程序照它接）', () => {
    const doc = makeDoc()
    doc.audio.audio_engine = 'Wwise'
    doc.audio.sfx_events = [{ event: 'ui.click', sfx: 'sfx_ui_01', volume: '0.7', concurrency: '1' }]
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'audio-impl')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('| 事件 | 音效 id | 音量 | 并发上限 |')
    expect(md).toContain('| ui.click | sfx_ui_01 | 0.7 | 1 |')
  })

  it('服务端文档带「网络协议表」（含权威端一列，客户端说了算要被抓出来）', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'co_op'
    doc.tech.net_protocol = [{ message: 'combat_damage', direction: 'C→S', frequency: '每次攻击', authority: '服务端' }]
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'tech-server')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('| 消息 | 方向 | 频率 | 权威端 |')
    expect(md).toContain('| combat_damage | C→S | 每次攻击 | 服务端 |')
  })

  it('有美术风格才出现「资产规格与导入」', () => {
    const doc = makeDoc()
    expect(idsOf(doc)).not.toContain('art-asset')
    doc.art.art_style = '国风水墨 3D 渲染'
    expect(idsOf(doc)).toContain('art-asset')
  })

  it('资产规格文档带「资产规格表」（类型/尺寸/格式/命名/备注，美术与程序的交付合同）', () => {
    const doc = makeDoc()
    doc.art.art_style = '国风水墨 3D 渲染'
    doc.art.asset_spec = [
      { type: '角色立绘', size: '2048×4096', format: 'PNG（透明）', naming: 'char_<id>_pose<01>', note: '移动端 LOD 降 1024²' },
      { type: 'UI 图标', size: '256×256', format: 'PNG + Atlas', naming: 'icon_<sys>_<name>', note: '九宫拉伸走 slice' }
    ]
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'art-asset')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('| 类型 | 尺寸 | 格式 | 命名 | 备注 |')
    expect(md).toContain('| 角色立绘 | 2048×4096 | PNG（透明） | char_<id>_pose<01> | 移动端 LOD 降 1024² |')
    expect(md).toContain('| UI 图标 | 256×256 | PNG + Atlas | icon_<sys>_<name> | 九宫拉伸走 slice |')
    expect(md).toContain('> 负责角色：美术、技术负责人')
  })

  it('文档头标注层级；README 给出构成统计', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'mmo'
    const server = planHandoffDocs(doc).find((item) => item.def.id === 'tech-server')!
    expect(renderHandoffDoc(doc, server, TS)).toContain('> 层级：条件文档（由项目事实决定）')

    const md = renderHandoffIndex(doc, TS)
    expect(md).toContain('文档构成：**通用基线')
    expect(md).toContain('条件文档 +')
  })
})

describe('工程脚手架文档：编码 AI 的起步点（解决「拿了文档不知从哪写」）', () => {
  it('通用基线，任何游戏都出现，且在架构卷', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-scaffold')!
    expect(planned.volume.id).toBe('architecture')
    expect(planned.layer).toBe('baseline')
    expect(docRoles(planned.def)).toEqual(['tech'])
  })

  it('UE5 引擎 → 渲染 Lyra/GAS 脚手架（建工程/目录/入口/构建/首批）', () => {
    const doc = makeDoc()
    doc.tech.engine = 'Unreal Engine 5.3'
    doc.tech.core_architecture = 'Gameplay Ability System + Lyra'
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-scaffold')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('> 检测到引擎：**Unreal Engine 5.3** → 走 **UE5** 脚手架。')
    expect(md).toContain('基于 Lyra 样板新建 C++ 项目')
    expect(md).toContain('### 1. 建工程')
    expect(md).toContain('### 5. 首批落地（顺序）')
    expect(md).toContain('RunUAT BuildCookRun')
  })

  it('Unity 引擎 → 渲染 URP/Addressables 脚手架', () => {
    const doc = makeDoc()
    doc.tech.engine = 'Unity 2022 LTS'
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-scaffold')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('走 **UNITY** 脚手架')
    expect(md).toContain('Unity 2022 LTS 新建项目')
    expect(md).toContain('ScriptableObject')
  })

  it('引擎未填 → 给通用底线并提示先定引擎，不编造具体脚手架', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-scaffold')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('`tech.engine` 未填写或无法识别')
    expect(md).toContain('通用底线')
    expect(md).not.toContain('RunUAT BuildCookRun')
  })
})

describe('研发实施卷：把设计翻成任务清单（程序侧落地路径）', () => {
  it('eng-wbs 是通用基线文档，在 06-研发 卷，有负责人', () => {
    const planned = planHandoffDocs(makeDoc()).find((item) => item.def.id === 'eng-wbs')!
    expect(planned.volume.id).toBe('engineering')
    expect(planned.layer).toBe('baseline')
    expect(docRoles(planned.def).length).toBeGreaterThan(0)
  })

  it('渲染分阶段任务表（M1–M6），数量从设计派生', () => {
    const doc = makeDoc()
    doc.gameplay.state_machine = ['MainMenu|start|载入|InGame', 'InGame|dead|结算|GameOver']
    doc.tech.data_tables = ['equipment|装备|id,name|≥60', 'enemy|敌人|id,name|≥20']
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'eng-wbs')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('## 研发任务拆解（按阶段，程序照单施工）')
    expect(md).toContain('### M1 · 框架骨架')
    expect(md).toContain('### M6 · 打磨')
    expect(md).toContain('2 条转移的空实现')
    expect(md).toContain('2 张表')
  })
})

describe('工程文档三件套：来源回链 / 方案取舍 / 横切关注点', () => {
  it('横切关注点索引只指向本包真实存在的文档（不给死链）', () => {
    const doc = makeDoc()
    const md = renderHandoffIndex(doc, TS)
    const section = md.slice(md.indexOf('### 横切关注点'), md.indexOf('### 全局约束'))
    expect(section.length).toBeGreaterThan(0)
    const paths = [...section.matchAll(/`([^`]+\.md)`/g)].map((match) => match[1])
    expect(paths.length).toBeGreaterThan(0)
    const plannedPaths = new Set(planHandoffDocs(doc).map((item) => item.path))
    for (const path of paths) expect(plannedPaths.has(path), `死链：${path}`).toBe(true)
  })

  it('纯单机不列「服务端与联机」横切行（条件文档未触发就不出现）', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'none'
    const md = renderHandoffIndex(doc, TS)
    expect(md).toContain('### 横切关注点（每个功能都要过一遍）')
    expect(md).not.toContain('| 服务端与联机 |')
  })

  it('范围与平台带「方案取舍」字段（Alternatives considered 进交接包）', () => {
    const doc = makeDoc()
    doc.meta.alternatives = [
      { decision: '引擎', option: 'Unity', rejected: '包体大 30%', chosen: 'Godot' }
    ]
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-scope')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('方案取舍')
    expect(md).toContain('Godot')
  })
})

describe('机读清单 index.json（给智能体程序化调度）', () => {
  interface Manifest {
    schema: string
    readingPolicy: string
    start: string | null
    sequence: string[]
    precedence: string[]
    volumes: Array<{ id: string }>
    docs: Array<{
      id: string
      path: string
      dependsOn: string[]
      next: string | null
      minimalContext: string[]
      acceptance: Array<{ id: string; text: string; check: string }>
    }>
  }
  const parse = (doc: CeshuDocument): Manifest => JSON.parse(renderHandoffManifest(doc, TS)) as Manifest

  it('与 planned 同源：文档数、路径、卷、优先级全对得上', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc)
    const manifest = parse(doc)
    expect(manifest.schema).toBe('mb-handoff-index/1')
    expect(manifest.docs).toHaveLength(planned.length)
    expect(manifest.docs.map((item) => item.path)).toEqual(planned.map((item) => item.path))
    expect(manifest.volumes.length).toBeGreaterThan(0)
    expect(manifest.precedence.length).toBeGreaterThan(0)
  })

  it('验收 id 全局唯一，判定方式只有 assertion / test / manual', () => {
    const manifest = parse(makeDoc())
    const ids = manifest.docs.flatMap((item) => item.acceptance.map((entry) => entry.id))
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of manifest.docs) {
      for (const entry of item.acceptance) expect(['assertion', 'test', 'manual']).toContain(entry.check)
    }
  })

  it('顺序开发：清单给出 start / sequence / next，链式串好', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc)
    const manifest = parse(doc)
    expect(manifest.readingPolicy).toBe('sequential')
    expect(manifest.start).toBe(planned[0]?.path)
    expect(manifest.sequence).toEqual(planned.map((item) => item.path))
    for (let index = 0; index < manifest.docs.length; index += 1) {
      expect(manifest.docs[index].next).toBe(planned[index + 1]?.path ?? null)
    }
  })

  it('最小上下文只留 1–2 份（顺序开发，不通读整包），且路径真实存在', () => {
    const doc = makeDoc()
    const plannedPaths = new Set(planHandoffDocs(doc).map((item) => item.path))
    // 卷目录是单独生成的（不在 planned 里），也算合法目标
    const volumeReadmes = new Set(HANDOFF_VOLUMES.map((volume) => handoffVolumeIndexPath(volume)))
    for (const item of parse(doc).docs) {
      expect(item.minimalContext).toContain('contract.json')
      expect(item.minimalContext.length).toBeLessThanOrEqual(2)
      for (const path of item.minimalContext) {
        const exists =
          path === 'README.md' || path === 'contract.json' || plannedPaths.has(path) || volumeReadmes.has(path)
        expect(exists, `最小上下文死链：${path}`).toBe(true)
      }
    }
  })

  it('真实文档里至少有一条可机判验收（机制不是摆设）', () => {
    const machine = parse(makeDoc())
      .docs.flatMap((item) => item.acceptance)
      .filter((entry) => entry.check !== 'manual')
    expect(machine.length).toBeGreaterThan(0)
  })

  it('验收条目支持显式判定方式，字符串仍按人工判定', () => {
    expect(acceptanceText('能跑')).toBe('能跑')
    expect(acceptanceCheck('能跑')).toBe('manual')
    expect(acceptanceText({ text: '伤害公式复算通过', check: 'assertion' })).toBe('伤害公式复算通过')
    expect(acceptanceCheck({ text: '伤害公式复算通过', check: 'assertion' })).toBe('assertion')
  })

  it('README 与文档头都写明冲突优先级与最小上下文', () => {
    const doc = makeDoc()
    const readme = renderHandoffIndex(doc, TS)
    expect(readme).toContain('### 冲突时听谁的（优先级从高到低）')
    expect(readme).toContain('contract.json —— 规则 / 参数 / 断言 / 验收旅程')

    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'arch-stack')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('- 开工只读：')
    expect(md).toContain('`contract.json`')
  })
})

describe('并行度：同波可同时开工', () => {
  const waveOfFolder = (plan: ReturnType<typeof analyzeParallelism>, folder: string): number | undefined =>
    plan.waves.find((wave) => wave.volumes.some((volume) => volume.folder === folder))?.index

  it('卷依赖分波：架构 → 核心玩法 → 内容/系统/界面 → 打磨 → 研发', () => {
    const plan = analyzeParallelism(makeDoc())
    expect(waveOfFolder(plan, '00-架构')).toBe(0)
    expect(waveOfFolder(plan, '01-核心玩法')).toBe(1)
    expect(waveOfFolder(plan, '02-内容')).toBe(2)
    expect(waveOfFolder(plan, '03-系统')).toBe(2)
    expect(waveOfFolder(plan, '04-界面')).toBe(2)
    expect(waveOfFolder(plan, '05-打磨')).toBe(3)
    expect(waveOfFolder(plan, '06-研发')).toBe(4)
  })

  it('内容 / 系统 / 界面 三卷可并行', () => {
    const plan = analyzeParallelism(makeDoc())
    expect(
      plan.parallelGroups.some(
        (group) => group.includes('content') && group.includes('systems') && group.includes('interface')
      )
    ).toBe(true)
  })

  it('冲突只报跨卷的（同卷内是顺序关系，不算并行冲突）', () => {
    const plan = analyzeParallelism(makeDoc())
    for (const conflict of plan.conflicts) {
      expect(conflict.fields.length).toBeGreaterThan(0)
      expect(conflict.a).not.toBe(conflict.b)
      // 同卷文档路径前缀相同；报出来就说明筛漏了
      const volumeOf = (path: string): string => path.split('/')[0] ?? ''
      expect(volumeOf(conflict.a)).not.toBe(volumeOf(conflict.b))
    }
  })

  it('最长链从架构卷开始，按文档数计（不是工时）', () => {
    const plan = analyzeParallelism(makeDoc())
    expect(plan.longestChain[0]).toContain('00-架构/')
    expect(plan.longestChain.length).toBeGreaterThan(0)
  })

  it('README 与 index.json 都带并行信息', () => {
    const doc = makeDoc()
    expect(renderHandoffIndex(doc, TS)).toContain('### 并行机会（同波可同时开工）')
    const manifest = JSON.parse(renderHandoffManifest(doc, TS)) as {
      parallelism: { waves: Array<{ volumes: string[] }>; parallelGroups: string[][] }
    }
    expect(manifest.parallelism.waves.length).toBeGreaterThan(0)
    expect(manifest.parallelism.parallelGroups.length).toBeGreaterThan(0)
  })
})

describe('实现层四条底线：渲染 / 物理 / 网络 / 音频', () => {
  it('每块至少有一条可机判验收（不是全人工）', () => {
    const layers: Array<[string, string]> = [
      ['渲染', 'polish-perf'],
      ['物理', 'core-combat'],
      ['网络', 'tech-server'],
      ['音频', 'audio-impl']
    ]
    for (const [label, id] of layers) {
      const def = HANDOFF_DOCS.find((item) => item.id === id)
      expect(def, `缺文档：${id}`).toBeDefined()
      const machine = (def?.acceptance ?? []).some((entry) => acceptanceCheck(entry) !== 'manual')
      expect(machine, `${label}（${id}）没有可机判验收`).toBe(true)
    }
  })

  it('新字段挂到了对应文档上（不是只加进 schema）', () => {
    const fieldsOf = (id: string): string[] =>
      (HANDOFF_DOCS.find((item) => item.id === id)?.fields ?? []).map((item) => `${item.chapter}.${item.field}`)
    expect(fieldsOf('polish-perf')).toContain('performance.quality_tiers')
    expect(fieldsOf('core-combat')).toContain('combat.hit_detection')
    expect(fieldsOf('tech-server')).toContain('tech.sync_model')
  })
})

describe('补齐实现可行性：接口契约 / 配置门禁 / 优化 playbook', () => {
  it('arch-api 接口契约：架构卷基线文档，渲染接口清单与统一约定', () => {
    const planned = planHandoffDocs(makeDoc()).find((item) => item.def.id === 'arch-api')!
    expect(planned.volume.id).toBe('architecture')
    expect(planned.layer).toBe('baseline')
    expect(docRoles(planned.def)).toEqual(['tech'])
    const md = renderHandoffDoc(makeDoc(), planned, TS)
    expect(md).toContain('## 模块接口契约（工作表，程序填完再开工）')
    expect(md).toContain('| 接口 | 输入 | 输出 | 依赖 | 错误码 |')
    expect(md).toContain('模块单向依赖')
  })

  it('配置门禁：系统启用但 config 为空 → 标红（不让空配置悄悄过）', () => {
    const doc = makeDoc()
    const systems = doc.systems as Record<string, { enabled: boolean; name: string; config: Record<string, unknown> }>
    systems.equipment = { enabled: true, name: '装备', config: {} }
    const equip = buildHandoffPlan(doc)
      .flatMap((status) => status.docs)
      .find((item) => item.doc.id === 'sys-equipment')!
    expect(equip.blockers.some((message) => message.includes('配置为空'))).toBe(true)
    expect(equip.ready).toBe(false)

    systems.equipment.config = { slot_count: 6, quality_levels: '凡品/灵品' }
    const filled = buildHandoffPlan(doc)
      .flatMap((status) => status.docs)
      .find((item) => item.doc.id === 'sys-equipment')!
    expect(filled.blockers.some((message) => message.includes('配置为空'))).toBe(false)
  })

  it('性能文档带「超预算排查顺序」playbook', () => {
    const planned = planHandoffDocs(makeDoc()).find((item) => item.def.id === 'polish-perf')!
    const md = renderHandoffDoc(makeDoc(), planned, TS)
    expect(md).toContain('## 超预算排查顺序')
    expect(md).toContain('帧率超标')
    expect(md).toContain('每次优化后复测')
  })
})

describe('系统覆盖：每个启用系统都有可施工文档', () => {
  it('SYSTEM_CONFIG_SCHEMA 的每个系统都被至少一份文档引用', () => {
    const covered = new Set(HANDOFF_DOCS.flatMap((doc) => (doc.systems ?? []).map((system) => system.key)))
    const missing = Object.keys(SYSTEM_CONFIG_SCHEMA).filter((key) => !covered.has(key))
    expect(missing).toEqual([])
  })

  it('任务 / 关卡内容 / 外观三份系统文档存在且在系统卷', () => {
    for (const id of ['sys-quest', 'sys-content', 'sys-customization']) {
      const planned = planHandoffDocs(makeDoc()).find((item) => item.def.id === id)
      expect(planned).toBeDefined()
      expect(planned!.volume.id).toBe('systems')
      expect(docRoles(planned!.def).length).toBeGreaterThan(0)
    }
  })

  it('系统配置部分空时给出填写进度（不硬拦，提示确认）', () => {
    const doc = makeDoc()
    const systems = doc.systems as Record<string, { enabled: boolean; name: string; config: Record<string, unknown> }>
    systems.equipment = { enabled: true, name: '装备', config: { slot_count: 6 } }
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'sys-equipment')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('系统配置：已填 1/')
    expect(md).toContain('未填项可能是有意留空')
  })
})

describe('新增品类专属文档：塔防 / 生存建造 / 开放世界', () => {
  it('塔防 → 波次与塔位', () => {
    const ids = idsOf(makeDoc({ game_type: '塔防' }))
    expect(ids).toContain('content-waves')
    expect(ids).not.toContain('content-branch')
  })

  it('生存建造 → 采集与建造', () => {
    expect(idsOf(makeDoc({ game_type: '生存建造' }))).toContain('content-build')
  })

  it('开放世界 → 地图与兴趣点', () => {
    expect(idsOf(makeDoc({ game_type: '开放世界' }))).toContain('content-map')
  })
})

describe('buildHandoffPlan：门禁', () => {
  it('每卷都带自己的文档状态（文档数与规划一致）', () => {
    const doc = makeDoc()
    const plan = buildHandoffPlan(doc)
    for (const status of plan) {
      const planned = planHandoffDocs(doc).filter((item) => item.volume.id === status.volume.id)
      expect(status.docs).toHaveLength(planned.length)
    }
  })

  it('空文档：所有文档都不可开工', () => {
    const plan = buildHandoffPlan(makeDoc())
    for (const status of plan) {
      for (const doc of status.docs) expect(doc.ready).toBe(false)
    }
  })

  it('填实某份文档的字段：它的字段计数到位', () => {
    const doc = makeDoc()
    doc.gameplay.state_machine = ['MainMenu|start|载入|InGame', 'InGame|dead|结算|GameOver']
    const state = buildHandoffPlan(doc)
      .flatMap((status) => status.docs)
      .find((item) => item.doc.id === 'arch-state')!
    expect(state.fieldFilled).toBe(1)
    expect(state.ready).toBe(state.blockers.length === 0)
  })

  it('校验问题只归相关文档：story 的必填缺失只出现在「敌人与 Boss」', () => {
    const docs = buildHandoffPlan(makeDoc()).flatMap((status) => status.docs)
    const withProtagonist = docs.filter((item) => item.blockers.some((message) => message.includes('protagonist')))
    expect(withProtagonist.map((item) => item.doc.id)).toEqual(['content-enemy'])
  })

  it('系统未启用 ⇒ 文档「不适用」（既不催也不假装完成）', () => {
    const equip = buildHandoffPlan(makeDoc())
      .flatMap((status) => status.docs)
      .find((item) => item.doc.id === 'sys-equipment')!
    expect(equip.systemsEnabled).toEqual([])
    expect(equip.applicable).toBe(false)
    expect(equip.ready).toBe(false)
  })

  it('系统启用后 applicable 为真', () => {
    const doc = makeDoc()
    const systems = doc.systems as Record<string, { enabled: boolean; name: string; config: Record<string, unknown> }>
    systems.equipment = { enabled: true, name: '装备', config: {} }
    const equip = buildHandoffPlan(doc)
      .flatMap((status) => status.docs)
      .find((item) => item.doc.id === 'sys-equipment')!
    expect(equip.systemsEnabled).toEqual(['equipment'])
    expect(equip.applicable).toBe(true)
  })
})

describe('renderHandoffDoc：单份文档', () => {
  it('标题带卷号-文档号，段落齐全（含「要实现什么」）', () => {
    const planned = planHandoffDocs(makeDoc())[0]!
    const md = renderHandoffDoc(makeDoc(), planned, TS)
    expect(md).toContain('# 00-01 · 范围与平台')
    expect(md).toContain('## 这份文档要解决什么')
    expect(md).toContain('## 顺序与依赖')
    expect(md).toContain('## 门禁状态')
    expect(md).toContain('## 要实现什么（按类分）')
    expect(md).toContain('### 数据')
    expect(md).toContain('### 规则')
    expect(md).toContain('## 规则与数据')
    expect(md).toContain('## 验收（做完逐条打勾）')
    expect(md).toContain('## 明确不做')
  })

  it('实现单元：数据类自动派生（表格字段 → 表；系统 → 配置），规则手写', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'sys-equipment')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('配置：装备（equipment）')
    expect(md).toContain('槽位/品质/强化上限从配置读')

    const level = planHandoffDocs(doc).find((item) => item.def.id === 'content-levels')!
    expect(renderHandoffDoc(doc, level, TS)).toContain('表：关卡配置表')
  })

  it('上下游用相对路径互链（第一份无上游、末份无下游）', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).filter((item) => item.volume.id === 'architecture')
    expect(renderHandoffDoc(doc, planned[0]!, TS)).toContain('- 上游：无（本卷第一份）')
    expect(renderHandoffDoc(doc, planned[0]!, TS)).toContain('00-架构/02-引擎与技术栈.md')
    expect(renderHandoffDoc(doc, planned[planned.length - 1]!, TS)).toContain('- 下游：无（本卷最后一份）')
  })

  it('空字段显式标注「未填写」', () => {
    const doc = makeDoc()
    const md = renderHandoffDoc(doc, planHandoffDocs(doc)[0]!, TS)
    expect(md).toContain('（未填写')
    expect(md).toContain('还差：')
  })

  it('表格字段渲染成真表格', () => {
    const doc = makeDoc()
    doc.level_design.level_table = [
      { level: '1-1', encounter: 'slime×2', reward: 'gold×20', difficulty: '0.5', unlock: '默认' }
    ]
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'content-levels')!
    const md = renderHandoffDoc(doc, planned, TS)
    expect(md).toContain('| 关卡 | 敌人编队 | 奖励 | 难度系数 | 解锁条件 |')
    expect(md).toContain('| 1-1 | slime×2 | gold×20 | 0.5 | 默认 |')
  })

  it('系统未启用时说明「可整节跳过」，启用后渲染配置表', () => {
    const doc = makeDoc()
    const planned = planHandoffDocs(doc).find((item) => item.def.id === 'sys-equipment')!
    expect(renderHandoffDoc(doc, planned, TS)).toContain('**未启用**')

    const systems = doc.systems as Record<string, { enabled: boolean; name: string; config: Record<string, unknown> }>
    systems.equipment = {
      enabled: true,
      name: '装备',
      config: { slot_count: 6, equip_types: '武器/防具', set_bonus_enabled: true }
    }
    const enabled = renderHandoffDoc(doc, planned, TS)
    expect(enabled).toContain('| 配置项 | 值 | 可选范围 |')
    expect(enabled).toContain('| 装备槽数 | 6 | 1–15 |')
    expect(enabled).toContain('| 套装效果 | 是 |')
  })
})

describe('renderHandoffVolumeIndex / renderHandoffIndex：目录', () => {
  it('卷内目录列出全部文档并带顺序号', () => {
    const doc = makeDoc()
    const md = renderHandoffVolumeIndex(doc, HANDOFF_VOLUMES[0]!, TS)
    expect(md).toContain('# 00 · 架构卷（骨架）')
    expect(md).toContain('## 文档顺序（按编号做，不要跳）')
    expect(md).toContain('| 01 | [范围与平台](01-%E8%8C%83%E5%9B%B4%E4%B8%8E%E5%B9%B3%E5%8F%B0.md)')
  })

  it('总纲给出品类档案与目录树', () => {
    const md = renderHandoffIndex(makeDoc(), TS)
    expect(md).toContain('品类档案：动作 / 战斗导向')
    expect(md).toContain('### 00-架构 ｜')
    expect(md).toContain('00-架构/01-范围与平台.md')
    expect(md).toContain('03-系统/01-装备与词条.md')
  })

  it('总纲的卷文件夹数量与范围由卷派生（不写死 6）', () => {
    const md = renderHandoffIndex(makeDoc(), TS)
    // 词汇纪律：交接包里的文件夹是「卷」（开发顺序），不是策划书的「章」（设计域）。
    // 混用会让工程师以为有 7 个设计章，故这里锁死「卷文件夹」。
    expect(md).toContain(`${HANDOFF_VOLUMES.length} 个卷文件夹`)
    expect(md).toContain('06-研发')
    expect(md).not.toContain('6 个卷文件夹')
    expect(md).not.toContain('个章节文件夹')
  })

  it('组合品类在总纲里标明「取并集」', () => {
    const md = renderHandoffIndex(makeDoc({ game_type: 'SLG', game_type_tags: ['卡牌'] }), TS)
    expect(md).toContain('组合玩法：卡牌（取并集，共 2 套）')
  })

  it('没写「范围与非目标」时明确提醒', () => {
    const doc = makeDoc()
    doc.meta.non_goals = []
    doc.mvp.cut_features = []
    expect(renderHandoffIndex(doc, TS)).toContain('建议补 `meta.non_goals`')
  })
})

describe('开发交接体检（renderHandoffHealthMarkdown）', () => {
  it('README 顶部含「开发体检」节', () => {
    const md = renderHandoffIndex(makeDoc(), TS)
    expect(md).toContain('## 开发体检（导出时快照）')
    expect(md).toContain('这份包现在能不能一路做完')
  })

  it('含四张核心指标（完成度 / 门禁 / 并行 / 可开发性缺口）', () => {
    const md = renderHandoffHealthMarkdown(makeDoc())
    expect(md).toContain('设计完成度')
    expect(md).toContain('交接门禁')
    expect(md).toContain('并行机会')
    expect(md).toContain('可开发性缺口')
    expect(md).toContain('下一步')
  })

  it('有可开发性缺口时列出具体字段与原因', () => {
    const doc = makeDoc()
    clearCouplingTriggers(doc)
    // 填了伤害公式却没填命中判定 → 触发硬返工缺口（其余触发字段已清空，缺口必为 1）
    doc.combat.damage_formula = '(攻击 - 防御) × 倍率'
    const md = renderHandoffHealthMarkdown(doc)
    expect(md).toContain('可开发性缺口**：1 个')
    expect(md).toContain('命中判定')
    expect(md).toContain('「打没打中」只能由程序自己拍')
  })

  it('无缺口时显示 0 个，不列原因', () => {
    const doc = makeDoc()
    clearCouplingTriggers(doc)
    const md = renderHandoffHealthMarkdown(doc)
    expect(md).toContain('可开发性缺口**：0 个')
    expect(md).not.toContain('只能由程序自己拍')
  })
})

describe('开发路线（renderHandoffRouteMarkdown）', () => {
  it('含顺序链、门禁标记与并行机会', () => {
    const md = renderHandoffRouteMarkdown(makeDoc())
    expect(md).toContain('开发路线')
    expect(md).toContain('施工顺序')
    expect(md).toContain('并行机会')
    // 顺序链每份文档带门禁标记
    expect(/[✅⏳—]/.test(md)).toBe(true)
  })

  it('列出规划文档的相对路径（与 planHandoffDocs 同源）', () => {
    const doc = makeDoc()
    const md = renderHandoffRouteMarkdown(doc)
    const planned = planHandoffDocs(doc)
    expect(planned.length).toBeGreaterThan(0)
    expect(md).toContain(planned[0].path)
  })

  it('导出包含独立 开发路线.md', () => {
    const files = buildHandoffFiles(makeDoc(), { generatedAt: TS })
    expect(Object.keys(files)).toContain('开发路线.md')
    expect(files['开发路线.md']).toContain('施工顺序')
  })
})

/** 清空所有联动触发字段，使默认稿不自带可开发性缺口（便于断言「0 个」） */
function clearCouplingTriggers(doc: CeshuDocument): void {
  doc.combat.damage_formula = ''
  doc.performance.performance_budget = ''
  doc.gameplay.core_loop = ''
  doc.economy.currency_types = ''
  doc.audio.sfx_list = ''
  doc.art.art_style = ''
  doc.level_design.level_table = ''
  doc.tech.online_mode = 'none'
}
