/**
 * 实现契约 / 构建清单（implementation manifest）——「策划书 → 编码 agent 实现」的桥。
 *
 * 为什么需要：GDD 说的是**做什么、为什么**（叙事顺序），不是**怎么建**（构建顺序）。
 * 编码 agent 直接读 GDD，会按文档顺序堆设定、自己拍技术决策，每次产出不同。
 * 本模块把 GDD 里**已可执行**的部分（状态机、启用系统、核心循环、验收标准）如实抽出来，
 * 排成**垂直切片优先**的构建清单；文档里没有的工程决策**如实标成「空缺」**，不编。
 *
 * 边界：只派生，不臆造。UI/导出如何用由消费方决定。
 */
import { type CeshuDocument } from '../reference'
import { chapterDataForDoc, getDocKind, isPlainObject } from '../model'
import { splitRow, toRows } from '../workflow'

export interface StateTransition {
  from: string
  event: string
  effect: string
  next: string
}

export interface ManifestModule {
  key: string
  name: string
  params: Array<{ key: string; value: string }>
}

export interface BuildStep {
  order: number
  title: string
  detail: string
}

export interface AcceptanceItem {
  source: string
  criterion: string
}

export interface ImplementationManifest {
  meta: { gameName: string; gameType: string; scope: string }
  /** 垂直切片优先的构建顺序（刻意不等于文档顺序） */
  buildOrder: BuildStep[]
  coreLoop: { summary: string; steps: string[] }
  stateMachine: StateTransition[]
  modules: ManifestModule[]
  acceptance: AcceptanceItem[]
  /** 文档里缺、编码前必须补的决策/材料 */
  pending: string[]
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 从文档派生实现契约（纯函数，不改入参） */
export function buildImplementationManifest(doc: CeshuDocument): ImplementationManifest {
  const meta = doc.meta as Record<string, unknown>
  const manifest: ImplementationManifest = {
    meta: {
      gameName: readText(meta.game_name),
      gameType: readText(meta.game_type),
      scope: readText(meta.gdd_scope) || 'full'
    },
    buildOrder: [],
    coreLoop: { summary: '', steps: [] },
    stateMachine: [],
    modules: [],
    acceptance: [],
    pending: []
  }

  // 本清单面向游戏项目；应用档字段语义不同，暂不做（如实说明，不硬凑）
  if (getDocKind(doc) !== 'game') {
    manifest.pending.push('应用档的构建清单暂未实现（本清单面向游戏项目）')
    return manifest
  }

  // 核心循环
  const gameplay = chapterDataForDoc(doc, 'gameplay')
  manifest.coreLoop.summary = readText(gameplay.core_loop)
  manifest.coreLoop.steps = toRows(gameplay.core_loop_points)

  // 状态机（状态|触发事件|结算效果|新状态）
  for (const row of toRows(gameplay.state_machine)) {
    const cells = splitRow(row)
    if (cells.length < 4) continue
    if (cells.slice(0, 4).every((cell) => cell === '')) continue
    manifest.stateMachine.push({
      from: cells[0] ?? '',
      event: cells[1] ?? '',
      effect: cells[2] ?? '',
      next: cells[3] ?? ''
    })
  }

  // 已启用系统 → 数据实体与参数
  const systems = chapterDataForDoc(doc, 'systems')
  for (const [key, value] of Object.entries(systems)) {
    if (!isPlainObject(value)) continue
    const entry = value as Record<string, unknown>
    if (entry.enabled !== true) continue
    const config = isPlainObject(entry.config) ? (entry.config as Record<string, unknown>) : {}
    const params = Object.entries(config)
      .map(([paramKey, paramValue]) => ({ key: paramKey, value: readText(paramValue) }))
      .filter((param) => param.value !== '')
    manifest.modules.push({ key, name: readText(entry.name) || key, params })
  }

  // 验收标准：MVP 里程碑的「验收」列（第 4 列，可判定）
  const mvp = chapterDataForDoc(doc, 'mvp')
  for (const row of toRows(mvp.milestones)) {
    const cells = splitRow(row)
    const name = cells[0] ?? ''
    const acceptance = cells[3] ?? ''
    if (acceptance === '') continue
    manifest.acceptance.push({ source: `MVP 里程碑：${name || '未命名'}`, criterion: acceptance })
  }

  // 垂直切片优先的构建顺序（非文档顺序）
  manifest.buildOrder = [
    {
      order: 1,
      title: '数据层：实体与字段',
      detail: manifest.modules.length > 0 ? `按 ${manifest.modules.length} 个已启用系统建实体与字段` : '未启用系统，先定数据实体'
    },
    {
      order: 2,
      title: '状态机骨架',
      detail:
        manifest.stateMachine.length > 0
          ? `按 ${manifest.stateMachine.length} 条转移实现状态机（含异常路径）`
          : '缺状态机，先补 gameplay.state_machine'
    },
    {
      order: 3,
      title: '核心循环跑通一局',
      detail:
        manifest.coreLoop.steps.length > 0
          ? `按 ${manifest.coreLoop.steps.length} 步核心循环做出最小可玩闭环`
          : '缺核心循环步骤'
    },
    {
      order: 4,
      title: '验收',
      detail: manifest.acceptance.length > 0 ? `按 ${manifest.acceptance.length} 条验收标准判定完成` : '缺可判定验收标准'
    }
  ]

  // 空缺与待决策（不回避，直接列出来）
  if (manifest.stateMachine.length === 0) manifest.pending.push('缺状态机（gameplay.state_machine 未填）：核心循环的状态转移无法确定')
  if (manifest.modules.length === 0) manifest.pending.push('未启用任何系统（systems）：数据实体无法确定')
  if (manifest.acceptance.length === 0) manifest.pending.push('缺可判定验收标准（mvp.milestones 验收列）')
  const tech = chapterDataForDoc(doc, 'tech')
  if (readText(tech.engine) === '') manifest.pending.push('未定引擎/技术栈（tech.engine）')
  manifest.pending.push('工程规格（语言/框架/架构/持久化/网络/构建管线）需在实现阶段确定；本清单只覆盖游戏设计的可执行部分')

  return manifest
}

/** 渲染成 JSON（给程序 / 编码 agent 机读；结构即 ImplementationManifest） */
export function renderImplementationManifestJson(manifest: ImplementationManifest): string {
  return JSON.stringify(manifest, null, 2)
}

/** 渲染成 Markdown（给人看，也给编码 agent 当上下文） */
export function renderImplementationManifestMarkdown(manifest: ImplementationManifest): string {
  const lines: string[] = []
  lines.push(`# 实现契约（构建清单）— ${manifest.meta.gameName || '未命名'}`)
  lines.push('')
  lines.push(`> 游戏类型：${manifest.meta.gameType || '未填'}｜档位：${manifest.meta.scope}`)
  lines.push('')

  lines.push('## 一、构建顺序（垂直切片优先，非文档顺序）')
  for (const step of manifest.buildOrder) lines.push(`${step.order}. **${step.title}** — ${step.detail}`)
  lines.push('')

  lines.push('## 二、核心循环')
  lines.push(manifest.coreLoop.summary || '（未填）')
  for (const step of manifest.coreLoop.steps) lines.push(`- ${step}`)
  lines.push('')

  lines.push('## 三、状态转移表')
  if (manifest.stateMachine.length === 0) {
    lines.push('（缺：gameplay.state_machine 未填）')
  } else {
    lines.push('| 状态 | 触发事件 | 结算效果 | 新状态 |')
    lines.push('|---|---|---|---|')
    for (const t of manifest.stateMachine) lines.push(`| ${t.from} | ${t.event} | ${t.effect} | ${t.next} |`)
  }
  lines.push('')

  lines.push('## 四、系统模块（数据实体）')
  if (manifest.modules.length === 0) {
    lines.push('（未启用任何系统）')
  } else {
    for (const mod of manifest.modules) {
      lines.push(`### ${mod.name}（${mod.key}）`)
      for (const param of mod.params) lines.push(`- ${param.key}: ${param.value}`)
    }
  }
  lines.push('')

  lines.push('## 五、验收标准')
  if (manifest.acceptance.length === 0) {
    lines.push('（缺可判定验收标准）')
  } else {
    for (const item of manifest.acceptance) lines.push(`- [ ] ${item.criterion}（来源：${item.source}）`)
  }
  lines.push('')

  lines.push('## 六、空缺与待决策')
  for (const item of manifest.pending) lines.push(`- ⚠️ ${item}`)
  lines.push('')

  return lines.join('\n')
}
