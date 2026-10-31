import type { CeshuDocument } from '../reference'
import { deriveRulesetId, getGddScope } from '../model'
import { computeReadiness } from '../readiness'
import { findCouplingGaps } from './ceshuCoupling'
import { escapeCell } from './ceshuHandoffMarkdown'
import { analyzeParallelism, renderParallelismMarkdown } from './ceshuHandoffParallel'
import { handoffVolumeFolderName, handoffVolumeIndexPath } from './ceshuHandoffPaths'
import { buildHandoffPlan, planHandoffDocs, resolveHandoffGenre, type HandoffRenderContext } from './ceshuHandoffPlan'
import { buildRoleIndex, docRoles } from './ceshuHandoffRoles'
import { acceptanceCheck, acceptanceText, HANDOFF_PRECEDENCE, type HandoffVolume } from './ceshuHandoffTypes'
import { HANDOFF_VOLUMES } from './ceshuHandoffVolumes'

/**
 * 交接包的**包级产出**：卷目录、施工总纲、开发体检、开发路线、机读清单。
 *
 * 全部由同一份 `planHandoffDocs` + `buildHandoffPlan` + `analyzeParallelism` 派生，
 * 不新增口径：README 给人，`index.json` 给机器。
 */

/** 渲染卷内目录（`00-架构/README.md`） */
export function renderHandoffVolumeIndex(
  doc: CeshuDocument,
  volume: HandoffVolume,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const status = (context?.plan ?? buildHandoffPlan(doc)).find((item) => item.volume.id === volume.id)
  const genre = resolveHandoffGenre(doc)
  const lines: string[] = []
  lines.push(`# ${String(volume.index).padStart(2, '0')} · ${volume.title}`)
  lines.push('')
  lines.push(`> 生成时间：${generatedAt}`)
  lines.push(
    `> 品类：${String(doc.meta.game_type ?? '未指定')}（${genre.primaryLabel}）${
      genre.composite ? ` ｜ 组合：${genre.tags.join(' + ')}（已按并集追加对应文档）` : ''
    }`
  )
  lines.push('')
  lines.push('## 这一卷做完，游戏能做什么')
  lines.push('')
  lines.push(volume.outcome)
  lines.push('')
  lines.push(`**规模**：${volume.scale}`)
  lines.push('')
  lines.push(
    volume.requires.length === 0
      ? '**前置**：无（可直接开工）'
      : `**前置**：${volume.requires
          .map((id) => {
            const required = HANDOFF_VOLUMES.find((item) => item.id === id)
            return required === undefined ? id : `${String(required.index).padStart(2, '0')} ${required.title}`
          })
          .join('、')}`
  )
  lines.push('')
  lines.push('## 文档顺序（按编号做，不要跳）')
  lines.push('')
  lines.push('| 顺序 | 文档 | 做什么 | 字段 | 可开工 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const item of status?.docs ?? []) {
    const file = item.path.split('/').pop() ?? ''
    const marker = item.applicable ? (item.ready ? '✅' : '⏳') : '—'
    lines.push(
      `| ${String(item.number).padStart(2, '0')} | [${escapeCell(item.doc.title)}](${encodeURI(file)}) | ${escapeCell(item.doc.purpose)} | ${item.fieldFilled}/${item.fieldTotal} | ${marker} |`
    )
  }
  lines.push('')
  if (status !== undefined && status.blockers.length > 0) {
    lines.push('## 本卷校验问题')
    lines.push('')
    for (const message of status.blockers.slice(0, 12)) lines.push(`- ${message}`)
    if (status.blockers.length > 12) lines.push(`- …… 其余 ${status.blockers.length - 12} 条见校验报告`)
    lines.push('')
  }
  lines.push('## 本卷验收（整卷做完逐条打勾）')
  lines.push('')
  for (const item of volume.acceptance) lines.push(`- [ ] ${acceptanceText(item)}`)
  lines.push('')
  lines.push('## 本卷明确不做')
  lines.push('')
  for (const item of volume.outOfScope) lines.push(`- ${item}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * 开发交接体检：把「完整 + 路线清晰」凝成一张导出时快照。
 *
 * 直接服务产品判据——**拿到这份东西，能不能一路做完**。它不新增任何口径，
 * 只是把已存在的四个分析器（完备度 / 门禁 / 并行度 / 可开发性缺口）并排到一个视图里：
 * 设计填了多少、哪些文档能开工、哪些填了却交不了活、下一步先做什么。
 * README 与人看，逻辑与 `HealthPanel` 同源（后者只是同一组数据的结构化呈现）。
 */
export function renderHandoffHealthMarkdown(doc: CeshuDocument, context?: HandoffRenderContext): string {
  const readiness = computeReadiness(doc)
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const planned = context?.planned ?? planHandoffDocs(doc)
  const parallelism = analyzeParallelism(doc, { plan, planned })
  const gaps = findCouplingGaps(doc)

  const stagePct = (filled: number, total: number): number =>
    total === 0 ? 100 : Math.round((filled / total) * 100)
  const conceptPct = stagePct(readiness.concept.required_filled, readiness.concept.required_total)
  const productionPct = stagePct(readiness.production.required_filled, readiness.production.required_total)
  const releasePct = stagePct(readiness.release.required_filled, readiness.release.required_total)
  const filled = readiness.total_required - readiness.total_missing
  const pct = Math.round(readiness.total_ratio * 100)

  const docs = plan.flatMap((volume) => volume.docs)
  const readyCount = docs.filter((item) => item.applicable && item.ready).length
  const blockedCount = docs.filter((item) => item.applicable && !item.ready).length
  const naCount = docs.filter((item) => !item.applicable).length
  const blocked = docs.filter((item) => item.applicable && !item.ready)

  const lines: string[] = []
  lines.push('## 开发体检（导出时快照）')
  lines.push('')
  lines.push('> 一句话判据：**这份包现在能不能一路做完**。')
  lines.push('')
  lines.push(
    `- **设计完成度**：${pct}%（必填 ${filled}/${readiness.total_required}；` +
      `立项 ${conceptPct}% ｜ 研发 ${productionPct}% ｜ 发行 ${releasePct}%）`
  )
  lines.push(
    `- **交接门禁**：${readyCount} 份可开工 ｜ ${blockedCount} 份待补 ｜ ${naCount} 份不适用`
  )
  lines.push(
    `- **并行机会**：${parallelism.waves.length} 波` +
      (parallelism.parallelGroups.length > 0
        ? `；可并行卷：${parallelism.parallelGroups.map((group) => group.join(' + ')).join('、')}`
        : '')
  )
  lines.push(`- **可开发性缺口**：${gaps.length} 个（填了却交不了活，必须补）`)
  lines.push('')

  if (blocked.length > 0) {
    lines.push('### 门禁拦路（待补文档，按编号顺序做）')
    lines.push('')
    for (const item of blocked.slice(0, 12)) {
      const reasons: string[] = []
      if (item.fieldFilled < item.fieldTotal) reasons.push(`缺 ${item.fieldTotal - item.fieldFilled} 字段`)
      if (item.blockers.length > 0) reasons.push(`问题 ${item.blockers.length}`)
      lines.push(`- ⏳ \`${item.path}\` — ${item.doc.title}（${reasons.join('，')}）`)
    }
    if (blocked.length > 12) {
      lines.push(`- …另有 ${blocked.length - 12} 份，见下方「目录与门禁」`)
    }
    lines.push('')
  }

  if (gaps.length > 0) {
    lines.push('### 可开发性缺口（先补这些：硬返工）')
    lines.push('')
    for (const gap of gaps) {
      lines.push(`- ${gap.because}已填，但「${gap.label}」为空——${gap.why}`)
    }
    lines.push('')
  }

  lines.push('### 下一步')
  lines.push('')
  const steps: string[] = []
  if (gaps.length > 0) steps.push('先补「可开发性缺口」（不补则程序只能自己编，必返工）')
  if (blocked.length > 0) steps.push('再补「门禁拦路」文档，按编号顺序做')
  if (parallelism.parallelGroups.length > 0) {
    steps.push(`可并行卷同时开工：${parallelism.parallelGroups.map((group) => group.join(' + ')).join('、')}`)
  }
  if (steps.length === 0) steps.push('设计齐备、门禁全过，可以进入编码——按 `index.json` 顺序做')
  steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`))
  lines.push('')

  return lines.join('\n')
}

/**
 * 开发路线（独立文件 `开发路线.md`）：人进引擎前一眼看完的导航。
 *
 * 与 README 的区别：README 是「施工总纲」（目录树 + 门禁 + 横切 + 全局约束 + 非目标），
 * 这份是**只讲顺序与门禁的精简路线图**——导演照它进引擎，不必先读 1300 行总纲。
 * 数据同源：顺序来自 `planHandoffDocs`、并行来自 `analyzeParallelism`、门禁来自 `buildHandoffPlan`，
 * 不新增口径。
 */
export function renderHandoffRouteMarkdown(doc: CeshuDocument, context?: HandoffRenderContext): string {
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const planned = context?.planned ?? planHandoffDocs(doc)
  const parallelism = analyzeParallelism(doc, { plan, planned })
  const statusById = new Map(plan.flatMap((volume) => volume.docs).map((status) => [status.doc.id, status]))

  const lines: string[] = []
  lines.push(`# ${String(doc.meta.game_name ?? '未命名')} · 开发路线`)
  lines.push('')
  lines.push(
    '> 进游戏引擎开发前，先看这份。它是**施工顺序 + 门禁 + 并行**的导航，不是详细规格——' +
      '详细规格在 `00-架构` … `06-研发` 的文档里，按编号顺序做。'
  )
  lines.push('')
  lines.push('## 施工顺序（一份一份做，做完验收再开下一份）')
  lines.push('')
  for (const item of planned) {
    const status = statusById.get(item.def.id)
    const mark = status === undefined ? '—' : !status.applicable ? '—' : status.ready ? '✅' : '⏳'
    lines.push(`- ${mark} \`${item.path}\` — ${item.def.title}`)
  }
  lines.push('')
  lines.push(renderParallelismMarkdown(parallelism))
  const blocked = plan.flatMap((volume) => volume.docs).filter((status) => status.applicable && !status.ready)
  if (blocked.length > 0) {
    lines.push('## 门禁拦路（先补这些，对应文档才能开工）')
    lines.push('')
    for (const status of blocked.slice(0, 12)) {
      const reasons: string[] = []
      if (status.fieldFilled < status.fieldTotal) reasons.push(`缺 ${status.fieldTotal - status.fieldFilled} 字段`)
      if (status.blockers.length > 0) reasons.push(`问题 ${status.blockers.length}`)
      lines.push(`- ⏳ \`${status.path}\` — ${status.doc.title}（${reasons.join('，')}）`)
    }
    lines.push('')
  }
  lines.push('## 怎么用')
  lines.push('')
  lines.push('- 按上面顺序，一份文档做完、验收通过，再开下一份；')
  lines.push('- 同波可并行的卷（见「并行机会」）可同时开工，跨卷共享字段先约口径；')
  lines.push('- 规则以 `contract.json` 为准，数据只从 `data/snapshot.json` 来，代码里禁止硬编码数值；')
  lines.push('- 设计完成度与可开发性缺口见 `README.md` 的「开发体检」。')
  lines.push('')
  return lines.join('\n')
}

/**
 * 机读清单（`index.json`）：给编码智能体**程序化调度**用。
 *
 * ## 为什么 README 不够
 * README 是给人看的 Markdown 表格。智能体要解析它才能知道「有哪些文档、依赖谁、门禁过没过」，
 * 解析失败就退回「凭感觉挑一份」——这是长任务跑偏的常见起点。清单把这些变成 JSON：
 * 每份文档的路径、层级、门禁、上游、**最小上下文**、验收条目（带稳定 id 与判定方式）全在里面。
 *
 * ## 与 README 的关系
 * 两者由同一份 `planHandoffDocs` + `buildHandoffPlan` 派生，不各写一套；README 给人，清单给机器。
 */
export function renderHandoffManifest(
  doc: CeshuDocument,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const planned = context?.planned ?? planHandoffDocs(doc)
  const genre = resolveHandoffGenre(doc)
  const parallelism = analyzeParallelism(doc, context)
  const statusById = new Map(plan.flatMap((item) => item.docs).map((status) => [status.doc.id, status]))

  const docs = planned.map((item, index) => {
    const status = statusById.get(item.def.id)
    const siblings = planned.filter((sibling) => sibling.volume.id === item.volume.id)
    const position = siblings.findIndex((sibling) => sibling.def.id === item.def.id)
    const upstream = position > 0 ? siblings[position - 1] : undefined
    return {
      id: item.def.id,
      path: item.path,
      title: item.def.title,
      volume: item.volume.id,
      number: item.number,
      layer: item.layer,
      purpose: item.def.purpose,
      applicable: status?.applicable ?? true,
      ready: status?.ready ?? false,
      fieldFilled: status?.fieldFilled ?? 0,
      fieldTotal: status?.fieldTotal ?? 0,
      blockers: status?.blockers ?? [],
      dependsOn: upstream === undefined ? [] : [upstream.path],
      // 全局下一份（跨卷也串起来）：顺序开发是整包一条链，不是每卷各走各的
      next: planned[index + 1]?.path ?? null,
      /*
       * 顺序开发：一次只做一份，**不要通读整个包**。
       * 开工只需要「本文档 + contract.json」；进入新卷时先读一次卷目录做定位。
       * 上游是上一轮刚做完的，不需要重读——这也是为什么它不在最小上下文里。
       */
      minimalContext: position === 0 ? [handoffVolumeIndexPath(item.volume), 'contract.json'] : ['contract.json'],
      roles: docRoles(item.def),
      acceptance: item.def.acceptance.map((entry, index) => ({
        id: `${item.def.id}-a${index + 1}`,
        text: acceptanceText(entry),
        check: acceptanceCheck(entry)
      }))
    }
  })

  const manifest = {
    schema: 'mb-handoff-index/1',
    generatedAt,
    /**
     * 顺序开发：不要一次读完整个包。按 `sequence` 逐个做，做完一份、验收通过，再下一份。
     * 这份清单的作用是「排队」和「查门禁」，不是「通读目录」。
     */
    readingPolicy: 'sequential',
    /** 第一份开工的文档（= sequence[0]） */
    start: planned[0]?.path ?? null,
    /** 开发顺序（相对路径数组，按卷 + 卷内编号排好） */
    sequence: planned.map((item) => item.path),
    game: {
      name: String(doc.meta.game_name ?? '未命名'),
      type: String(doc.meta.game_type ?? ''),
      scope: getGddScope(doc),
      rulesetId: deriveRulesetId(doc)
    },
    genre: {
      primary: genre.primary,
      primaryLabel: genre.primaryLabel,
      composite: genre.composite,
      tags: genre.tags
    },
    precedence: [...HANDOFF_PRECEDENCE],
    /** 并行度：同波可同时开工；`conflicts` 是并行前必须先约口径的共享字段 */
    parallelism: {
      waves: parallelism.waves.map((wave) => ({
        index: wave.index,
        volumes: wave.volumes.map((volume) => volume.id),
        docs: wave.docs
      })),
      parallelGroups: parallelism.parallelGroups,
      conflicts: parallelism.conflicts,
      longestChain: parallelism.longestChain
    },
    files: {
      readme: 'README.md',
      gdd: 'gdd.md',
      bundle: 'bundle.json',
      contract: 'contract.json',
      schema: 'schema.json',
      snapshot: 'data/snapshot.json',
      prototype: 'prototype/demo.html'
    },
    volumes: plan.map((item) => ({
      id: item.volume.id,
      index: item.volume.index,
      folder: handoffVolumeFolderName(item.volume),
      title: item.volume.title,
      outcome: item.volume.outcome,
      requires: item.volume.requires,
      gate: {
        fieldFilled: item.keyFieldFilled,
        fieldTotal: item.keyFieldTotal,
        blockers: item.blockers.length,
        ready: item.ready
      }
    })),
    docs
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * 渲染交接包总纲（README）。
 *
 * 给人和智能体都看的第一页：品类、目录树、门禁、数据源约定、横切关注点与全局约束。
 * 关键约定必须写死在这里，否则每份文档都要重复一遍、且迟早不一致。
 */
export function renderHandoffIndex(
  doc: CeshuDocument,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const genre = resolveHandoffGenre(doc)
  const lines: string[] = []
  lines.push(`# ${String(doc.meta.game_name ?? '未命名')} · 开发交接包`)
  lines.push('')
  lines.push(`> 生成时间：${generatedAt}`)
  lines.push(
    `> 定位：${String(doc.meta.positioning ?? '—')} ｜ 类型：${String(doc.meta.game_type ?? '—')} ｜ 平台：${
      Array.isArray(doc.meta.platform) ? doc.meta.platform.join('/') : String(doc.meta.platform ?? '—')
    }`
  )
  lines.push(
    `> 品类档案：${genre.primaryLabel}${genre.composite ? `；组合玩法：${genre.tags.join(' + ')}（取并集，共 ${genre.profiles.length} 套）` : ''}`
  )
  const plannedDocs = context?.planned ?? planHandoffDocs(doc)
  const layerCount = { baseline: 0, genre: 0, conditional: 0 }
  for (const item of plannedDocs) layerCount[item.layer] += 1
  lines.push(
    `> 文档构成：**通用基线 ${layerCount.baseline} 份**（先做这些）；品类专属 +${layerCount.genre} 份；条件文档 +${layerCount.conditional} 份`
  )
  lines.push(
    '> 施工顺序：先把**通用基线**全部做完（这部分与玩法无关，任何游戏都成立）；' +
      '再按标记补「品类专属」与「条件文档」——它们是**决策增量**，不是地基。'
  )
  lines.push('')
  lines.push(renderHandoffHealthMarkdown(doc, { plan, planned: plannedDocs }))
  lines.push('## 怎么用（给编码智能体）')
  lines.push('')
  lines.push('1. **按编号顺序做**：从 `00-架构/01-…` 开始，一份文档做完、验收通过，再打开下一份；')
  lines.push('2. **一次只读一份，按顺序做**：不要通读整个包；顺序见 `index.json` 的 `sequence`（或下面的目录编号）。每份 100–200 行，含「要解决什么 / 要实现什么 / 规则与数据 / 验收 / 明确不做」；')
  lines.push('3. **数据只从 `data/snapshot.json` 来**：那是唯一内容源（表结构 + 全部行），代码里不许硬编码数值；')
  lines.push('4. **规则以 `contract.json` 为准**：规则集标识、参数表、断言、验收旅程都在里面，冲突时以它为准；')
  lines.push('5. **`prototype/demo.html` 是参考实现**（若存在）：手感与反馈照它对齐，但不要照抄临时代码结构。')
  lines.push('')
  lines.push('### 冲突时听谁的（优先级从高到低）')
  lines.push('')
  HANDOFF_PRECEDENCE.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
  lines.push('')
  lines.push('## 目录与门禁')
  lines.push('')
  for (const item of plan) {
    const volume = item.volume
    lines.push(`### ${handoffVolumeFolderName(volume)} ｜ ${volume.outcome}`)
    lines.push('')
    lines.push(
      `前置：${
        volume.requires.length === 0
          ? '无'
          : volume.requires
              .map((id) => {
                const required = HANDOFF_VOLUMES.find((candidate) => candidate.id === id)
                return required === undefined ? id : `${String(required.index).padStart(2, '0')} ${required.folder}`
              })
              .join('、')
      } ｜ 门禁：字段 ${item.keyFieldFilled}/${item.keyFieldTotal} ｜ 阻塞 ${item.blockers.length} ｜ ${item.ready ? '✅ 可开工' : '⏳ 待补'}`
    )
    lines.push('')
    for (const docStatus of item.docs) {
      const hasSystems = (docStatus.doc.systems ?? []).length > 0
      const notes: string[] = []
      if (docStatus.layer === 'genre') notes.push('品类专属')
      if (docStatus.layer === 'conditional') notes.push('条件文档')
      if (docStatus.blockers.length > 0) notes.push(`问题 ${docStatus.blockers.length}`)
      if (hasSystems && docStatus.systemsEnabled.length === 0) notes.push('系统未启用')
      const detail = notes.length > 0 ? `，${notes.join('，')}` : ''
      const marker = docStatus.applicable ? (docStatus.ready ? '✅' : '⏳') : '—'
      lines.push(
        `- ${marker} [\`${docStatus.path}\`](${encodeURI(docStatus.path)}) — ${docStatus.doc.title}（字段 ${docStatus.fieldFilled}/${docStatus.fieldTotal}${detail}）`
      )
    }
    lines.push('')
  }
  lines.push(renderParallelismMarkdown(analyzeParallelism(doc, { plan, planned: plannedDocs })))
  lines.push('## 按角色看（谁该读哪些文档）')
  lines.push('')
  for (const entry of buildRoleIndex(doc)) {
    if (entry.docs.length === 0) continue
    lines.push(`### ${entry.label}（${entry.docs.length} 份）`)
    lines.push('')
    for (const item of entry.docs) {
      lines.push(`- \`${item.path}\` — ${item.def.title}`)
    }
    lines.push('')
  }
  lines.push('## 横切关注点与全局约束（每一份文档都适用）')
  lines.push('')
  /*
   * 横切关注点为什么做成「索引」而不是「第 6 份文档」：
   * 性能 / 存档 / 本地化 / 联机 / 数据管线 已经各有独立文档（见下表）。再写一份汇总文档，
   * 同一字段就成了第二个真源，校验问题还会被重复归属到两份文档（`coveredFields` 判重会失真）。
   * 这里只回答「去哪看 + 每个功能要问什么」；路径从真实规划派生，条件文档没触发就不出现，不给死链。
   */
  lines.push('### 横切关注点（每个功能都要过一遍）')
  lines.push('')
  const crossCutting: Array<{ label: string; id: string; ask: string }> = [
    { label: '性能预算', id: 'polish-perf', ask: '这个功能在最低配机型上掉多少帧？预算里有没有它的份额？' },
    { label: '存档与兼容', id: 'arch-save', ask: '这个功能的状态存不存？旧档缺字段怎么读？' },
    { label: '本地化与无障碍', id: 'polish-l10n', ask: '文案是否全走本地化表？色盲 / 字幕 / 按键重映射覆盖了吗？' },
    { label: '服务端与联机', id: 'tech-server', ask: '这个功能是客户端判定还是服务端判定？掉线怎么恢复？' },
    { label: '数据表与内容管线', id: 'arch-data', ask: '这个功能的数据进表了吗？还是硬编码在代码里？' }
  ]
  const crossRows = crossCutting
    .map((item) => ({ ...item, path: plannedDocs.find((planned) => planned.def.id === item.id)?.path }))
    .filter((item) => item.path !== undefined)
  if (crossRows.length > 0) {
    lines.push('| 关注点 | 看哪份文档 | 每个功能都要问 |')
    lines.push('| --- | --- | --- |')
    for (const row of crossRows) lines.push(`| ${row.label} | \`${row.path ?? ''}\` | ${row.ask} |`)
    lines.push('')
  }
  lines.push('### 全局约束')
  lines.push('')
  lines.push('- 数值只从参数表读，禁止魔法数字；改数值只改数据文件；')
  lines.push('- 所有面向玩家的等待都要有可见进度；所有破坏性操作都要二次确认；')
  lines.push('- 单局可玩性优先于内容量：先让一局好玩，再批量做关卡；')
  lines.push('- 不实现文档「明确不做」里的东西；要加需求，先改策划书再改代码。')
  lines.push('')
  lines.push('## 明确不做（整包范围外）')
  lines.push('')
  const nonGoals = Array.isArray(doc.meta.non_goals) ? (doc.meta.non_goals as string[]) : []
  const cutFeatures = Array.isArray(doc.mvp.cut_features) ? (doc.mvp.cut_features as string[]) : []
  if (nonGoals.length === 0 && cutFeatures.length === 0) {
    lines.push('（策划书未写「范围与非目标」，建议补 `meta.non_goals`，否则实现方会自行扩大范围）')
  } else {
    for (const item of nonGoals) lines.push(`- ${item}`)
    for (const item of cutFeatures) lines.push(`- ${item}（MVP 暂缓）`)
  }
  lines.push('')
  lines.push('## 包内文件')
  lines.push('')
  lines.push('| 文件 | 作用 |')
  lines.push('| --- | --- |')
  lines.push('| `README.md` | 本文件：品类、目录树、门禁、横切关注点与全局约束 |')
  lines.push('| `开发路线.md` | 进引擎前的精简导航：施工顺序 + 门禁 + 并行（**先读这份再开引擎**） |')
  lines.push('| `index.json` | 机读清单：文档 / 依赖 / 门禁 / 最小上下文 / 验收 id（**给智能体调度用，不必解析本文件的表格**） |')
  {
    const firstVolume = HANDOFF_VOLUMES[0]
    const lastVolume = HANDOFF_VOLUMES[HANDOFF_VOLUMES.length - 1]
    const range =
      firstVolume !== undefined && lastVolume !== undefined
        ? `\`${handoffVolumeFolderName(firstVolume)}/\` … \`${handoffVolumeFolderName(lastVolume)}/\``
        : '卷文件夹'
    lines.push(`| ${range} | ${HANDOFF_VOLUMES.length} 个卷文件夹，内含按编号排序的设计文档 |`)
  }
  lines.push('| `gdd.md` | 完整策划书（人读，含所有章节） |')
  lines.push('| `bundle.json` | 机读字段 + 字段契约（给 AI 读） |')
  lines.push('| `contract.json` | 规则集 / 参数 / 断言 / 验收旅程（机器可判） |')
  lines.push('| `schema.json` | 数据表结构（字段名/类型/枚举/上下限；本库有数据表时才有） |')
  lines.push('| `data/snapshot.json` | 数据表全部行（唯一内容源；本库有数据表时才有） |')
  lines.push('| `prototype/demo.html` | 可玩原型（已生成原型时才有） |')
  lines.push('')
  return lines.join('\n')
}
