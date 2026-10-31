import { chapterOrdinalCn, type CeshuDocument, type ChapterKey } from '../reference'
import { fieldLabelOf } from '../fields'
import { isFilledValue, visibleChaptersForDoc } from '../model'

/**
 * 字段联动检查（可开发性缺口）。
 *
 * ## 为什么需要
 * 完备度只回答「字段填了没」。但**填了也可能没法实现**：
 * 写了伤害公式却没写命中判定、给了性能预算却没给画质档位、选了联机却没定同步模型——
 * 这些文档在完备度上是绿的，交给程序却开不了工。
 *
 * 这里用**声明式规则**表达「A 填了，B 就不能空」，不解析散文、不做语义猜测：
 * 规则本身就是可评审的（谁都能看懂、能改），也不会因为措辞变化而误报。
 *
 * ## 与校验的关系
 * 挂在 `CESHU_CHECKS` 最后一项（`fieldCoupling`），产出「可开发性缺口」文案；
 * 与 `validateCeshu` 的其他检查同一条出口，校验面板直接可见。
 */

export interface CouplingTrigger {
  chapter: ChapterKey
  field: string
  /** 这些值视为「不触发」（如联机形态为 none 时不该要求协议表） */
  notValues?: readonly string[]
}

export interface CouplingRequirement {
  chapter: ChapterKey
  field: string
  /** 为什么缺了就没法实现（直接进报错文案） */
  why: string
}

export interface CouplingRule {
  when: CouplingTrigger
  require: readonly CouplingRequirement[]
}

/**
 * 规则表：每条都对应一次真实返工。
 *
 * 判断标准：**缺了这条，实现方只能自己编**。编出来的东西和设计意图不一致，就是返工。
 * 所以只收「必须由设计侧定」的联动，不收「程序可以自己决定」的（如 shader 方案）。
 */
export const COUPLING_RULES: readonly CouplingRule[] = [
  {
    when: { chapter: 'combat', field: 'damage_formula' },
    require: [
      {
        chapter: 'combat',
        field: 'hit_detection',
        why: '没有判定形状/无敌帧，攻击「打没打中」只能由程序自己拍'
      }
    ]
  },
  {
    when: { chapter: 'performance', field: 'performance_budget' },
    require: [
      {
        chapter: 'performance',
        field: 'quality_tiers',
        why: '没有画质档位，低端机该降什么没有依据，掉帧时只能临时砍'
      }
    ]
  },
  {
    when: { chapter: 'gameplay', field: 'core_loop' },
    require: [
      {
        chapter: 'gameplay',
        field: 'state_machine',
        why: '没有状态机，核心循环落不到场景流程上（谁在什么时候切到哪个状态）'
      }
    ]
  },
  {
    when: { chapter: 'economy', field: 'currency_types' },
    require: [
      {
        chapter: 'economy',
        field: 'source_sink',
        why: '有货币但没有产出/回收，经济无法闭环，通胀只能事后救火'
      }
    ]
  },
  {
    when: { chapter: 'audio', field: 'sfx_list' },
    require: [
      {
        chapter: 'audio',
        field: 'sfx_events',
        why: '有音效清单但没有事件映射，程序不知道「什么操作播哪个音」'
      }
    ]
  },
  {
    when: { chapter: 'art', field: 'art_style' },
    require: [
      {
        chapter: 'art',
        field: 'asset_spec',
        why: '有美术风格但没有资产规格（尺寸/格式/命名），交付与导入会乱'
      }
    ]
  },
  {
    when: { chapter: 'level_design', field: 'level_table' },
    require: [
      {
        chapter: 'level_design',
        field: 'content_estimate',
        why: '有关卡表但没有内容量估算，工期与人力没法排'
      }
    ]
  },
  {
    when: { chapter: 'tech', field: 'online_mode', notValues: ['none', ''] },
    require: [
      {
        chapter: 'tech',
        field: 'net_protocol',
        why: '选了联机却没有协议表，客户端与服务端各写一套消息，对接才发现对不上'
      },
      {
        chapter: 'tech',
        field: 'sync_model',
        why: '选了联机却没有同步模型，一致性无法保证，后期改架构等于重写'
      }
    ]
  }
]

export interface CouplingGap {
  chapter: ChapterKey
  field: string
  label: string
  /** 触发规则的那个字段（已填） */
  because: string
  why: string
}

function valueOf(doc: CeshuDocument, chapter: ChapterKey, field: string): unknown {
  const data = doc[chapter] as Record<string, unknown> | undefined
  return data?.[field]
}

/** 找出所有可开发性缺口（只在可见章里查：轻量档不催没显示的章） */
export function findCouplingGaps(doc: CeshuDocument): CouplingGap[] {
  const visible = new Set(visibleChaptersForDoc(doc))
  const gaps: CouplingGap[] = []
  for (const rule of COUPLING_RULES) {
    if (!visible.has(rule.when.chapter)) continue
    const trigger = valueOf(doc, rule.when.chapter, rule.when.field)
    if (!isFilledValue(trigger)) continue
    if (rule.when.notValues !== undefined && rule.when.notValues.includes(String(trigger))) continue
    for (const need of rule.require) {
      if (!visible.has(need.chapter)) continue
      if (isFilledValue(valueOf(doc, need.chapter, need.field))) continue
      gaps.push({
        chapter: need.chapter,
        field: need.field,
        label: fieldLabelOf(need.chapter, need.field),
        because: `第${chapterOrdinalCn(rule.when.chapter)}章「${fieldLabelOf(
          rule.when.chapter,
          rule.when.field
        )}」`,
        why: need.why
      })
    }
  }
  return gaps
}

/** 可开发性缺口 → 校验文案（与 `validateCeshu` 同一条出口） */
export function couplingMessages(doc: CeshuDocument): string[] {
  return findCouplingGaps(doc).map(
    (gap) => `可开发性缺口：${gap.because}已填，但「${gap.label}」为空——${gap.why}`
  )
}
