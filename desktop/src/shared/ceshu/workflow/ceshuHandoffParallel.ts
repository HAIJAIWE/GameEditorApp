import type { CeshuDocument } from '../reference'
import { handoffVolumeFolderName } from './ceshuHandoffPaths'
import { planHandoffDocs, type HandoffRenderContext } from './ceshuHandoffPlan'
import type { HandoffVolume, HandoffVolumeId } from './ceshuHandoffTypes'
import { HANDOFF_VOLUMES } from './ceshuHandoffVolumes'

/**
 * 并行度：哪些卷/文档可以同时开工。
 *
 * 卷依赖图不是链——`内容 / 系统 / 界面` 三卷都只依赖核心玩法，彼此不依赖，可以同时开工。
 * 这里按 `requires` 分波，并标出同波跨卷共享字段（并行前必须先约口径）。
 */

export interface ParallelWave {
  index: number
  volumes: Array<{ id: HandoffVolumeId; folder: string; title: string }>
  /** 本波可开工的文档（相对路径，按卷顺序） */
  docs: string[]
}

export interface ParallelismPlan {
  /** 按卷依赖深度分波：同波可同时开工 */
  waves: ParallelWave[]
  /** 同波内共享字段的文档对：并行前先约定口径，否则两边各写一套 */
  conflicts: Array<{ a: string; b: string; fields: string[] }>
  /** 可并行的卷组合（同一波里多于一个卷） */
  parallelGroups: HandoffVolumeId[][]
  /** 最长依赖链（按文档数计；**没有工时数据，不叫关键路径**） */
  longestChain: string[]
}

/**
 * 算并行度。
 *
 * ## 为什么需要
 * `sequence` 是严格串行的一条链，但卷依赖图不是链：`内容 / 系统 / 界面` 三卷
 * 都只依赖核心玩法，彼此不依赖——完全可以同时开工。串行做完等于把工期拉长一倍。
 *
 * ## 判据
 * - **卷级**：`requires` 为空 = 第 1 波；否则 = 依赖里最深的波 + 1。同波可并行。
 * - **文档级**：同波内两份文档若共享字段（`章.字段`），并行前必须先约定口径，
 *   否则同一份数值两边各写一套，合并时才发现对不上。
 * - **最长链**：按文档数算（不是工时），用来回答「最短也要走几步」。
 */
export function analyzeParallelism(
  doc: CeshuDocument,
  context?: HandoffRenderContext
): ParallelismPlan {
  const planned = context?.planned ?? planHandoffDocs(doc)
  const presentVolumes = HANDOFF_VOLUMES.filter((volume) =>
    planned.some((item) => item.volume.id === volume.id)
  )
  const presentIds = new Set(presentVolumes.map((volume) => volume.id))
  const requiredOf = (volume: HandoffVolume): HandoffVolumeId[] =>
    volume.requires.filter((id) => presentIds.has(id))

  // 波次：反复取「依赖已全部就绪」的卷，直到没有可推进的（防环）
  const waveOf = new Map<HandoffVolumeId, number>()
  let pending = [...presentVolumes]
  for (let guard = 0; pending.length > 0 && guard < 20; guard += 1) {
    const ready = pending.filter((volume) => requiredOf(volume).every((id) => waveOf.has(id)))
    if (ready.length === 0) break
    for (const volume of ready) {
      const requires = requiredOf(volume)
      waveOf.set(
        volume.id,
        requires.length === 0 ? 0 : 1 + Math.max(...requires.map((id) => waveOf.get(id) ?? 0))
      )
    }
    pending = pending.filter((volume) => !waveOf.has(volume.id))
  }

  const waveCount = presentVolumes.reduce((max, volume) => Math.max(max, waveOf.get(volume.id) ?? 0), -1) + 1
  const waves: ParallelWave[] = []
  for (let index = 0; index < waveCount; index += 1) {
    const volumes = presentVolumes.filter((volume) => (waveOf.get(volume.id) ?? 0) === index)
    if (volumes.length === 0) continue
    waves.push({
      index,
      volumes: volumes.map((volume) => ({
        id: volume.id,
        folder: handoffVolumeFolderName(volume),
        title: volume.title
      })),
      docs: planned
        .filter((item) => (waveOf.get(item.volume.id) ?? 0) === index)
        .map((item) => item.path)
    })
  }

  // 冲突：同波内两份文档共享字段
  const conflicts: ParallelismPlan['conflicts'] = []
  for (const wave of waves) {
    const inWave = planned.filter((item) => wave.docs.includes(item.path))
    for (let i = 0; i < inWave.length; i += 1) {
      for (let j = i + 1; j < inWave.length; j += 1) {
        const left = inWave[i]
        const right = inWave[j]
        // 同卷内本来就是顺序关系（`next` 链），共享字段是预期行为，不算并行冲突
        if (left.volume.id === right.volume.id) continue
        const leftKeys = new Set(left.def.fields.map((item) => `${item.chapter}.${item.field}`))
        const shared = [
          ...new Set(
            right.def.fields
              .map((item) => `${item.chapter}.${item.field}`)
              .filter((key) => leftKeys.has(key))
          )
        ]
        if (shared.length > 0) conflicts.push({ a: left.path, b: right.path, fields: shared })
      }
    }
  }

  const parallelGroups = waves
    .filter((wave) => wave.volumes.length > 1)
    .map((wave) => wave.volumes.map((volume) => volume.id))

  // 最长链：同「就绪即推进」，取依赖链里文档数最多的一条
  const chainOf = new Map<HandoffVolumeId, string[]>()
  pending = [...presentVolumes]
  for (let guard = 0; pending.length > 0 && guard < 20; guard += 1) {
    const ready = pending.filter((volume) => requiredOf(volume).every((id) => chainOf.has(id)))
    if (ready.length === 0) break
    for (const volume of ready) {
      const own = planned.filter((item) => item.volume.id === volume.id).map((item) => item.path)
      let best: string[] = []
      for (const id of requiredOf(volume)) {
        const candidate = chainOf.get(id) ?? []
        if (candidate.length > best.length) best = candidate
      }
      chainOf.set(volume.id, [...best, ...own])
    }
    pending = pending.filter((volume) => !chainOf.has(volume.id))
  }
  const longestChain = [...chainOf.values()].sort((left, right) => right.length - left.length)[0] ?? []

  return { waves, conflicts, parallelGroups, longestChain }
}

/** 并行度 → Markdown（总纲与面板共用） */
export function renderParallelismMarkdown(plan: ParallelismPlan): string {
  const lines: string[] = []
  lines.push('### 并行机会（同波可同时开工）')
  lines.push('')
  if (plan.waves.length === 0) {
    lines.push('- 当前没有可开工的文档。')
    return lines.join('\n')
  }
  for (const wave of plan.waves) {
    const folders = wave.volumes.map((volume) => `\`${volume.folder}\``).join('、')
    lines.push(`- **第 ${wave.index + 1} 波**：${folders}（${wave.docs.length} 份文档）`)
  }
  lines.push('')
  if (plan.parallelGroups.length > 0) {
    lines.push('**可以并行的卷**：')
    lines.push('')
    for (const group of plan.parallelGroups) lines.push(`- ${group.join(' + ')}`)
    lines.push('')
  }
  if (plan.conflicts.length > 0) {
    lines.push('**并行前先约口径（同波跨卷共享字段）**')
    lines.push('')
    for (const conflict of plan.conflicts.slice(0, 8)) {
      lines.push(`- \`${conflict.a}\` ↔ \`${conflict.b}\`：${conflict.fields.join('、')}`)
    }
    if (plan.conflicts.length > 8) {
      lines.push(`- …另有 ${plan.conflicts.length - 8} 对，见 \`index.json\` 的 \`parallelism.conflicts\``)
    }
    lines.push('')
  } else if (plan.parallelGroups.length > 0) {
    lines.push('同波各卷没有共享字段，可以放心并行。')
    lines.push('')
  }
  return lines.join('\n')
}
