import { describe, expect, it } from 'vitest'

import {
  buildToolFace,
  DEFAULT_TOOL_GROUP,
  faceLimitFor,
  groupToolCatalog,
  resolveRoutingPolicy,
  resolveToolGroup,
  TOOL_FACE_LIMITS,
  TOOL_GROUP_LABELS,
  TOOL_GROUP_MAP,
  TOOL_GROUP_ORDER
} from '../../src/shared/agent/toolGroups'
import type { SkillProtocol } from '../../src/shared/agent/protocol'

/**
 * M3 工具面分组与按档位限量（G2 + DD-3 + DD-4）的纯逻辑单测。
 *
 * 契约：
 * - 分组按**三个真实场景**（数据编辑 / 策划书创作 / 系统与协作）切，不照搬 Python 的 12 槽位；
 * - 本地档工具面 ≤8、云端 ≤15（DD-3）；
 * - 路由策略：本地=显式选（explicit）、云端=可软路由（soft，显式可压过）（DD-4）；
 * - 目录文本**每工具一行、不含参数明细**（渐进披露，与 M2/G7 同源）。
 */

function makeSkill(id: string, description = '描述'): SkillProtocol {
  return {
    id,
    description,
    version: '1.0.0',
    execute: () => ({ success: true, message: '' })
  }
}

/** 造 n 个未登记工具（用未在 `TOOL_GROUP_MAP` 里的 id，走兜底分组） */
function manySkills(n: number): SkillProtocol[] {
  return Array.from({ length: n }, (_, index) => makeSkill(`system.fake_${index + 1}`))
}

describe('M3 分组表与档位预算', () => {
  it('三个真实场景的分组与标签齐备', () => {
    expect([...TOOL_GROUP_ORDER].sort()).toEqual(['ceshu', 'data', 'system'])
    expect(TOOL_GROUP_LABELS.data).toBe('数据编辑')
    expect(TOOL_GROUP_LABELS.ceshu).toBe('策划书创作')
    expect(TOOL_GROUP_LABELS.system).toBe('系统与协作')
  })

  it('已注册工具全部登记分组（防漏登记漂移）', () => {
    // 与 `main/stores.ts::buildStores` 注册的 5 个技能一一对应；新增技能须同步登记本表
    for (const id of [
      'system.game_data',
      'system.ceshu',
      'system.code',
      'tool.rollback_ai_changes',
      'tool.ask_user'
    ]) {
      expect(TOOL_GROUP_MAP[id]).toBeDefined()
    }
  })

  it('resolveToolGroup：未登记工具回退「系统与协作」', () => {
    expect(resolveToolGroup('system.game_data')).toBe('data')
    expect(resolveToolGroup('system.ceshu')).toBe('ceshu')
    expect(resolveToolGroup('tool.rollback_ai_changes')).toBe('system')
    expect(resolveToolGroup('system.unknown_thing')).toBe(DEFAULT_TOOL_GROUP)
  })

  it('faceLimitFor：本地 8 / 云端 15；unconfigured 按最保守的本地预算', () => {
    expect(TOOL_FACE_LIMITS.local).toBe(8)
    expect(TOOL_FACE_LIMITS.cloud).toBe(15)
    expect(faceLimitFor('local')).toBe(8)
    expect(faceLimitFor('cloud')).toBe(15)
    expect(faceLimitFor('unconfigured')).toBe(8)
  })

  it('resolveRoutingPolicy：云端可软路由，本地/未配置一律显式', () => {
    expect(resolveRoutingPolicy('cloud')).toBe('soft')
    expect(resolveRoutingPolicy('local')).toBe('explicit')
    expect(resolveRoutingPolicy('unconfigured')).toBe('explicit')
  })
})

describe('M3 buildToolFace：装配与限量', () => {
  it('工具数在上限内：全量暴露、不截断、策略随档位', () => {
    const skills = [
      makeSkill('system.game_data', '查询游戏数据'),
      makeSkill('system.ceshu', '编辑策划书'),
      makeSkill('system.code', '执行代码')
    ]
    const local = buildToolFace(skills, 'local')
    expect(local.exposed).toHaveLength(3)
    expect(local.truncated).toBe(false)
    expect(local.policy).toBe('explicit')
    expect(local.limit).toBe(8)
    expect(local.total).toBe(3)

    const cloud = buildToolFace(skills, 'cloud')
    expect(cloud.policy).toBe('soft')
    expect(cloud.limit).toBe(15)
  })

  it('本地档超 8 个即截断（云端 15 的额度不动）', () => {
    const skills = manySkills(10)
    const local = buildToolFace(skills, 'local')
    expect(local.exposed).toHaveLength(8)
    expect(local.truncated).toBe(true)

    const cloud = buildToolFace(skills, 'cloud')
    expect(cloud.exposed).toHaveLength(10)
    expect(cloud.truncated).toBe(false)
  })

  it('显式选择（DD-4）压过软路由，并按注册顺序保留', () => {
    const skills = [makeSkill('system.a'), makeSkill('system.b'), makeSkill('system.c')]
    const face = buildToolFace(skills, 'cloud', ['system.c', 'system.a'])
    expect(face.policy).toBe('explicit')
    expect(face.exposed.map((skill) => skill.id)).toEqual(['system.a', 'system.c'])
  })

  it('显式选择为空数组 ⇒ 不生效，回落到档位策略', () => {
    const face = buildToolFace([makeSkill('system.a')], 'cloud', ['', '  '])
    expect(face.policy).toBe('soft')
    expect(face.exposed).toHaveLength(1)
  })

  it('显式选择仍尊重上限（超限标记 truncated，不静默丢弃）', () => {
    const skills = Array.from({ length: 10 }, (_, index) => makeSkill(`system.pick_${index + 1}`))
    const face = buildToolFace(skills, 'local', skills.map((skill) => skill.id))
    expect(face.exposed).toHaveLength(8)
    expect(face.truncated).toBe(true)
  })
})

describe('M3 目录文本：按场景分组 + 渐进披露', () => {
  it('按固定组序输出组标题，且每工具仅一行、无参数明细', () => {
    const skills = [
      makeSkill('system.ceshu', '编辑策划书章节'),
      makeSkill('system.game_data', '查询游戏数据表'),
      makeSkill('system.code', '在沙箱执行代码')
    ]
    const catalog = groupToolCatalog(skills, 'local', 'explicit')
    const lines = catalog.split('\n')

    // 组标题顺序 = TOOL_GROUP_ORDER（data → ceshu → system）
    const headers = lines.filter((line) => line.startsWith('### '))
    expect(headers).toEqual([
      `### ${TOOL_GROUP_LABELS.data}`,
      `### ${TOOL_GROUP_LABELS.ceshu}`,
      `### ${TOOL_GROUP_LABELS.system}`
    ])
    // 每工具一行，含 id，且不含参数块（渐进披露：参数走 function-calling schema）
    expect(catalog).toContain('- system.game_data: 查询游戏数据表')
    expect(catalog).not.toContain('action')
    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(3)
  })

  it('档位口径写进抬头：本地=只使用清单内工具 / 云端=可自动挑选', () => {
    const skills = [makeSkill('system.game_data', '查询游戏数据')]
    expect(groupToolCatalog(skills, 'local', 'explicit')).toContain('本地档工具面')
    expect(groupToolCatalog(skills, 'local', 'explicit')).toContain('只使用这份清单')
    expect(groupToolCatalog(skills, 'cloud', 'soft')).toContain('云端档工具面')
    expect(groupToolCatalog(skills, 'cloud', 'soft')).toContain('自动挑选')
  })

  it('空工具集 ⇒ 空目录（调用方据此不注入该段）', () => {
    expect(groupToolCatalog([], 'local', 'explicit')).toBe('')
  })
})
