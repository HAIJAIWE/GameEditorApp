import type { CeshuDocument } from '../reference/ceshuConstants'
import { planHandoffDocs, type PlannedHandoffDoc } from './ceshuHandoffPlan'
import type { HandoffDoc } from './ceshuHandoffTypes'

/**
 * 交接文档的**消费角色**：谁该读它、谁照着它干活。
 *
 * 文档正文是「给 AI 读的规格」，角色是「给团队分派的归属」——两者会一起变但改动动机不同
 * （加字段 ≠ 换负责人）。分开存，守卫测试保证每份文档都有归属。
 */

/** 交接文档的**消费角色**（谁该读它、谁照着它干活） */
export type HandoffRole =
  | 'producer'
  | 'systems'
  | 'numeric'
  | 'content'
  | 'narrative'
  | 'tech'
  | 'art'
  | 'audio'
  | 'ui'
  | 'qa'
  | 'ops'

export const HANDOFF_ROLE_LABELS: Record<HandoffRole, string> = {
  producer: '制作人 / 主策',
  systems: '系统策划',
  numeric: '数值策划',
  content: '关卡与内容策划',
  narrative: '叙事策划',
  tech: '技术负责人',
  art: '美术',
  audio: '音频',
  ui: 'UI / 交互',
  qa: '测试',
  ops: '运营 / 本地化'
}

/**
 * 每份文档的负责角色。
 *
 * 为什么单独一张表：文档正文是「给 AI 读的规格」，角色是「给团队分派的归属」——
 * 两者会一起变但改动动机不同（加字段 ≠ 换负责人）。分开存，守卫测试保证每份文档都有归属，
 * 不会出现「没人认领的文档」（那种文档最后通常没人读）。
 */
const DOC_ROLES: Record<string, HandoffRole[]> = {
  'arch-scope': ['producer', 'tech'],
  'arch-stack': ['tech'],
  'arch-data': ['tech', 'systems'],
  'arch-state': ['tech', 'systems'],
  'arch-save': ['tech'],
  'arch-api': ['tech'],
  'arch-scaffold': ['tech'],
  'tech-server': ['tech', 'ops'],
  'core-loop': ['producer', 'systems', 'content'],
  'core-input': ['systems', 'ui'],
  'core-combat': ['systems', 'numeric'],
  'core-numeric': ['numeric'],
  'content-levels': ['content'],
  'content-curve': ['content', 'numeric'],
  'content-enemy': ['content', 'art'],
  'content-branch': ['narrative'],
  'content-idle': ['systems', 'numeric'],
  'content-waves': ['content', 'numeric'],
  'content-build': ['systems', 'content'],
  'content-map': ['content', 'art'],
  'sys-equipment': ['systems', 'numeric'],
  'sys-growth': ['systems', 'numeric'],
  'sys-economy': ['systems', 'numeric'],
  'sys-skill': ['systems', 'numeric'],
  'sys-gacha': ['systems', 'ops'],
  'sys-social': ['systems', 'ops'],
  'sys-sim': ['systems', 'numeric'],
  'sys-quest': ['systems', 'content'],
  'sys-content': ['content', 'systems'],
  'sys-customization': ['art', 'systems'],
  'ui-flow': ['ui', 'systems'],
  'ui-feedback': ['ui', 'qa'],
  'polish-perf': ['tech', 'qa'],
  'polish-analytics': ['ops', 'tech'],
  'polish-l10n': ['ops', 'ui'],
  'audio-impl': ['audio', 'tech'],
  'art-asset': ['art', 'tech'],
  'eng-wbs': ['tech', 'producer']
}

/** 该文档的负责角色（缺省空数组，守卫测试保证不会缺） */
export function docRoles(def: HandoffDoc): HandoffRole[] {
  return DOC_ROLES[def.id] ?? []
}

/** 角色 → 该角色要读的文档（按角色分派的索引） */
export interface HandoffRoleEntry {
  role: HandoffRole
  label: string
  docs: PlannedHandoffDoc[]
}

/**
 * 按角色分派：每个角色拿到自己该读的文档清单。
 *
 * 解决的是「文档有了，但没人知道自己该看哪几份」——美术只关心美术/敌人/地图，
 * 程序只关心架构/状态机/存档，测试只关心验收与性能。README 里给这张表，
 * 比让人从 26 份里挑要现实得多。
 */
export function buildRoleIndex(doc: CeshuDocument): HandoffRoleEntry[] {
  const planned = planHandoffDocs(doc)
  return (Object.keys(HANDOFF_ROLE_LABELS) as HandoffRole[]).map((role) => ({
    role,
    label: HANDOFF_ROLE_LABELS[role],
    docs: planned.filter((item) => docRoles(item.def).includes(role))
  }))
}
