import type { CeshuColumnDef, CeshuFieldKind } from '../reference'

/**
 * 字段写作契约：把「这个字段该写成什么样」压成一行，直接喂给生成提示词。
 *
 * 为什么单独有这一层（2026-11-10 用户要求「生成内容要质量高、清晰、步骤细节化」）：
 * 只给字段名和类型，模型会本能地写「概述」；整章一次索要 6–33 个字段时，
 * 它更会把每个字段压到几十字（实测整章 33 字段 ⇒ 正文预算被推理吃光 ⇒ 截断归零）。
 * 所以把「该写什么 + 参考量级 + 列/可选值/区间」写进字段清单的每一行，
 * 让模型只看这一行就知道交付标准，而不是靠人在提示词里反复口头强调。
 *
 * 口径与 `packages/shared/src/ceshu/prompts/ceshuAiData.ts` 对齐：
 * - 2026-10-26 起「去字数指标化」——长度只能以「参考量级」出现，绝不当成字数下限。
 *   写死下限必然诱发凑字数注水（空话套话、长篇无数字），而 contentQualityIssues
 *   又会把注水判为低质，两套标准互相拉扯，模型只能两头挨罚。
 * - 禁编造沿用 CESHU_NO_FABRICATION：拿不准的事实性内容写「待确认」，不猜。
 *
 * 纯函数、无 IO：提示词文本本身要能被单测逐字锁住，否则接线后没人知道模型看到的
 * 到底是哪一版口径。
 */

/** 字段清单每一行需要的最小信息（从 CeshuFieldDef 的消费视角裁出来的子集） */
export interface FieldBriefInput {
  key: string
  label: string
  kind: CeshuFieldKind
  /** 没填就无法开工的字段；渲染成「必填 / 选填」两字 */
  required: boolean
  /** 该字段 AI 应产出什么；缺省时给中性默认，不留悬空冒号 */
  aiHint?: string
  /** pipeList 的列契约 */
  columns?: readonly CeshuColumnDef[]
  /** combo / multiCombo 的可选值 */
  values?: readonly string[]
  /** number 下限 / 上限 */
  from?: number
  to?: number
}

/**
 * kind → 中文类型名。
 *
 * 用 `Record<string, string>` 而不是 `Record<CeshuFieldKind, string>`：契约文本里
 * 把短文本叫 `string`，而 ceshuConstants 的联合类型里叫 `text`；两者是同一件事，
 * 提示词层不该因为调用方从旧文档/模板带出 `string` 就渲染成 undefined。
 * checkbox（开关）不在契约枚举里，但 CeshuFieldKind 确实有，缺了它会退回英文 key。
 */
const KIND_LABELS: Readonly<Record<string, string>> = {
  text: '短文本',
  string: '短文本',
  textarea: '多行文本',
  number: '数字',
  combo: '单选',
  multiCombo: '多选',
  checkbox: '开关',
  stringList: '条目列表',
  pipeList: '表格',
  json: '结构化数据'
}

/**
 * 「参考量级」：每个字段类型写多少、写成什么形状。
 *
 * 措辞统一以「参考量级」出现而不是「至少 N 字」，与 2026-10-26 的去字数指标化一致；
 * 多行文本/条目列表/表格额外给出「条数」「行数」这类可核对的形状约束，
 * 因为质量检查看的是「有没有 3 条可执行细节」，不是字数够不够。
 */
const REFERENCE_VOLUMES: Readonly<Record<string, string>> = {
  textarea: '150–400 字，至少 3 条可执行细节',
  stringList: '3–6 条，每条一句可核对的话',
  pipeList: '3–8 行，每行每列都要填',
  text: '20–60 字',
  string: '20–60 字',
  number: '给整数并写清单位/口径',
  json: '给出键名与示例值',
  combo: '从可选值里挑一个，并说明它和本章其他决策怎么对上',
  multiCombo: '从可选值里挑 1–3 个，并说明为什么不是全部',
  checkbox: '只答开 / 关，并用一句话说清依据'
}

/** aiHint 缺省时的中性默认：给方向，不给字数，不逼模型编造 */
const DEFAULT_WRITE_WHAT = '写具体、可核对的结论；能落到步骤、数字或例子上，拿不准的事实写「待确认」'

function kindLabelOf(kind: CeshuFieldKind): string {
  return KIND_LABELS[kind] ?? kind
}

function whatToWrite(aiHint: string | undefined): string {
  const hint = (aiHint ?? '').trim()
  return hint === '' ? DEFAULT_WRITE_WHAT : hint
}

/**
 * number 的区间措辞。只对 number 生效：其它类型带 from/to 多半是复用字段定义时的残留，
 * 渲染出来反而会让模型以为要给个数值区间。
 */
function rangeText(brief: FieldBriefInput): string {
  if (brief.kind !== 'number') return ''
  const from = brief.from
  const to = brief.to
  if (from === undefined && to === undefined) return ''
  if (from !== undefined && to !== undefined) return `区间：${from}–${to}`
  return from !== undefined ? `区间：≥ ${from}` : `区间：≤ ${to}`
}

/**
 * 字段清单的一行：`- 战斗节奏（core_combat_rhythm · 多行文本 · 必填）：该写什么；参考量级：…；列：…`
 *
 * 为什么用一行而不是多行：模型是按「行」抓字段清单的，一行一个字段能让它
 * 在长清单里也不丢字段；列/可选值/区间紧跟在该字段同一行，避免它把列契约错配给别的字段。
 */
export function fieldBriefLine(brief: FieldBriefInput): string {
  const label = brief.label.trim() === '' ? brief.key : brief.label.trim()
  const segments: string[] = [whatToWrite(brief.aiHint), `参考量级：${referenceVolume(brief.kind)}`]
  const columns = (brief.columns ?? []).map((column) => (column.label.trim() === '' ? column.key : column.label.trim()))
  if (columns.length > 0) segments.push(`列：${columns.join(' | ')}`)
  const values = (brief.values ?? []).map((value) => value.trim()).filter((value) => value !== '')
  if (values.length > 0) segments.push(`可选值：${values.join(' / ')}`)
  const range = rangeText(brief)
  if (range !== '') segments.push(range)
  const requiredText = brief.required ? '必填' : '选填'
  return `- ${label}（${brief.key} · ${kindLabelOf(brief.kind)} · ${requiredText}）：${segments.join('；')}`
}

/** 整段字段清单：一行一个字段，末尾不留空行（空输入返回空串，别让调用方拿到「一个空行」） */
export function buildFieldBriefBlock(briefs: readonly FieldBriefInput[]): string {
  return briefs.map((brief) => fieldBriefLine(brief)).join('\n')
}

/** 单个字段的「参考量级」措辞；未知 kind 给中性兜底，绝不返回空串 */
export function referenceVolume(kind: CeshuFieldKind): string {
  return REFERENCE_VOLUMES[kind] ?? '写具体、可核对的结论'
}

/**
 * 细节与步骤要求（交付标准）——字段清单之前的整段硬约束。
 *
 * 为什么这些点必须写在提示词里（2026-11-10 用户要求「生成内容要质量高、清晰、步骤细节化」）：
 * 只写「要具体」等于没写——模型无法自己定义「具体」。这里把四件事拆成可判定的动作：
 * 参考量级（形状而非字数）、编号步骤（输入→动作→判定条件→异常处理）、
 * 数字锚点（阈值/时长/概率/成本 + 怎么判定达成）、取舍（为什么不选另一种）。
 * 四条对应的正是仓库既有的质量检查口径（contentQualityIssues 的「空话/无数字/无失败路径」），
 * 提示词与检查同向，模型才不会被两套标准拉扯。
 */
export const CESHU_DETAIL_REQUIREMENTS: string = [
  '细节与步骤要求（交付标准）：',
  '1. 每个字段写具体、可验证的内容——参考量级见字段清单，它只是「参考量级」不是字数下限：宁可短而实，不要为凑字数注水；出现「丰富多样」「沉浸式体验」这类空话、或长篇却没有一个数字的段落，会被判为低质。',
  '2. 凡是流程 / 规则 / 系统类内容，必须写成编号步骤：每步写清 输入 → 动作 → 判定条件 → 失败/异常怎么处理，不要只写成功路径。',
  '3. 至少给一个数字锚点（阈值 / 时长 / 概率 / 成本），并紧接着写清怎么判定达成——不写「体验流畅」，写「3 步内完成核心操作、帧率 ≥ 30」。数值断言表的「断言」列只写断言名（如「A2 御剑冲刺灵力消耗」），来源/依据写进表达式或备注，名称里不要加括号说明——下游按名字复算，带后缀会认不出。',
  '4. 写取舍：关键决策补一句「为什么不选另一种」，避免看起来像拍脑袋。',
  '5. 拿不准的事实性内容（竞品名、外部数字等），按禁编造口径写「待确认」并注明将在哪章补齐，不要猜也不要编。',
  '6. 一行一个动作、一句话一件事：编号步骤用「- 」分行，单句尽量不超过 40 字，别把多个动作或条件用分号塞进一句（长句占比过高会被判低质）。'
].join('\n')
