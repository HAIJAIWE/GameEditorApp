/**
 * 策划书「复刻演练」——不配模型也能验证「契约 → 生成 → 导入 → 校验」全链路。
 *
 * ## 用途
 * 2026-10-23 配置体检后搭：契约覆盖率、「写对」指标、禁编造约束都只被
 * 单测验证过，从未被**真实的 AI 产出**验证。本脚本让人（或任何一个外部
 * AI）扮演消费者：
 *
 *   阶段 1 `prompt`：按游戏类型造默认文档，用项目自己的
 *   `buildBundleConsumePrompt(doc, 'draft')` 生成提示词——外部 AI 拿到的
 *   就是这份；写手按它产出 `{章: {字段: 值}}` JSON；
 *   阶段 2 `apply`：把 JSON 粘回来，走与「导入 AI 结果」面板**同一条**
 *   `parseCeshuPatch` → `applyCeshuPatch` → `validateCeshu` → `computeReadiness`
 *   管道，输出机器校验报告。
 *
 * ## 用法
 *   npx tsx scripts/ceshuRehearsal.ts prompt --type rpg --name 星露种田 --out /tmp/p1.txt
 *   npx tsx scripts/ceshuRehearsal.ts apply --patch /tmp/p1.json --type rpg --name 星露种田
 *
 * 判据全是机器可复算的：必填缺失、跨章一致性、内容重复、术语一致性、
 * 内容质量（空话/长句/数字）、三阶段必填覆盖。人只看报告就能判断「这份产出
 * 能不能用、契约有没有起作用」。
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { buildBundleConsumePrompt, BUNDLE_CONSUME_TASK_LABELS, type BundleConsumeTask } from '../src/shared/ceshu/prompts'
import { buildCeshuBundle } from '../src/shared/ceshu/workflow'
import { applyCeshuPatch, parseCeshuPatch } from '../src/shared/ceshu/data'
import { createDefaultCeshu } from '../src/shared/ceshu/model'
import { computeReadiness } from '../src/shared/ceshu/readiness'
import { validateCeshu } from '../src/shared/ceshu/validation'
import { CHAPTER_LABELS, type CeshuDocument } from '../src/shared/ceshu/reference'

/** 演练案例的游戏类型预设（影响 meta.game_type 与风格，其余全靠提示词驱动） */
const TYPE_PRESETS: Record<string, { gameType: string; style: string }> = {
  rpg: { gameType: 'RPG', style: '像素风' },
  roguelike: { gameType: 'Roguelike', style: '暗黑风' },
  casual: { gameType: 'Casual', style: 'Q版' },
  slg: { gameType: 'SLG', style: '写实风' }
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const [command, ...rest] = argv
  const flags: Record<string, string> = {}
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.replace(/^--/, '') ?? ''
    flags[key] = rest[index + 1] ?? ''
  }
  return { command: command ?? '', flags }
}

function buildDoc(type: string, name: string): CeshuDocument {
  const preset = TYPE_PRESETS[type] ?? TYPE_PRESETS.rpg
  const doc = createDefaultCeshu({ scope: 'full', name })
  doc.meta.game_type = preset.gameType
  doc.style = preset.style
  return doc
}

function runPrompt(flags: Record<string, string>): void {
  const type = flags.type ?? 'rpg'
  const name = flags.name ?? '未命名项目'
  const task = (flags.task ?? 'draft') as BundleConsumeTask
  const doc = buildDoc(type, name)
  const prompt = buildBundleConsumePrompt(buildCeshuBundle(doc), task)
  const out = flags.out ?? `/tmp/ceshu-rehearsal-${type}.prompt.txt`
  writeFileSync(out, prompt, 'utf8')
  console.log(`提示词已写入 ${out}（${prompt.length} 字符）`)
  console.log(`游戏类型: ${doc.meta.game_type} | 风格: ${doc.style} | 文档: ${name} | 任务: ${BUNDLE_CONSUME_TASK_LABELS[task]}`)
  console.log('把它交给任何外部 AI（或人），按契约产出 {章: {字段: 值}} JSON，然后进入 apply 阶段。')
}

function runApply(flags: Record<string, string>): void {
  const patchPath = flags.patch ?? ''
  const type = flags.type ?? 'rpg'
  const name = flags.name ?? '未命名项目'
  const raw = readFileSync(patchPath, 'utf8')
  const baseDoc = buildDoc(type, name)

  // 与「导入 AI 结果」面板同一条管道：先解析预览，再应用
  const parsed = parseCeshuPatch(raw, baseDoc)
  const lines: string[] = []
  lines.push('# 策划书复刻演练 · 机器校验报告')
  lines.push('')
  lines.push(`- 游戏类型: ${baseDoc.meta.game_type} | 风格: ${baseDoc.style}`)
  lines.push(`- 输入: ${patchPath}（${raw.length} 字符）`)
  lines.push('')

  if (parsed.items.length === 0) {
    lines.push('## 解析结果：没有任何可应用字段')
    for (const error of parsed.errors) lines.push(`- ❌ ${error}`)
    writeFileSync(flags.out ?? '/tmp/ceshu-rehearsal-report.md', lines.join('\n'), 'utf8')
    console.log(lines.join('\n'))
    return
  }

  const changed = parsed.items.filter((item) => item.changed).length
  lines.push(`## 解析结果: ${parsed.items.length} 个字段可应用（其中 ${changed} 个与现有值不同）`)
  for (const error of parsed.errors) lines.push(`- ⚠️ ${error}`)
  lines.push('')

  const { doc, chapters } = applyCeshuPatch(baseDoc, parsed.items)
  const errors = validateCeshu(doc)
  const readiness = computeReadiness(doc, errors)

  lines.push(`## 应用范围: ${chapters.length} 个章（${chapters.map((c) => CHAPTER_LABELS[c]).join('、')}）`)
  lines.push('')
  lines.push('## 校验（validateCeshu）')
  lines.push('')
  if (errors.length === 0) {
    lines.push('✅ 全部通过')
  } else {
    const errorCount = errors.filter((e) => e.includes('为必填项') || e.includes('格式异常') || e.includes('一致性冲突')).length
    lines.push(`共 ${errors.length} 条（约 ${errorCount} 条硬错误，其余为提示）`)
    lines.push('')
    for (const error of errors) lines.push(`- ${error}`)
  }
  lines.push('')
  lines.push('## 完备度（computeReadiness）')
  lines.push('')
  lines.push(`- 立项阶段必填 ${readiness.concept.required_filled}/${readiness.concept.required_total}（缺口 ${readiness.concept.missing_count}）`)
  lines.push(`- 研发阶段必填 ${readiness.production.required_filled}/${readiness.production.required_total}`)
  lines.push(`- 发行阶段必填 ${readiness.release.required_filled}/${readiness.release.required_total}`)
  lines.push('')
  for (const step of readiness.next_steps) lines.push(`- ${step}`)
  lines.push('')
  lines.push('## 待审字段（ai_draft）分布')
  lines.push('')
  const status = doc.meta.field_status as Record<string, Record<string, { status?: string }>> | undefined
  let pending = 0
  for (const [, fields] of Object.entries(status ?? {})) {
    for (const [, value] of Object.entries(fields)) {
      if (value?.status === 'ai_draft') pending += 1
    }
  }
  lines.push(pending > 0 ? `- ${pending} 个字段被标记为 AI 草稿待审` : '- 无（本脚本不走面板，不写 field_status）')

  const out = flags.out ?? '/tmp/ceshu-rehearsal-report.md'
  writeFileSync(out, lines.join('\n'), 'utf8')
  console.log(`报告已写入 ${out}`)
  console.log(`可应用 ${parsed.items.length} 字段 | 校验 ${errors.length} 条 | 立项必填 ${readiness.concept.required_filled}/${readiness.concept.required_total}`)
}

function main(): void {
  const { command, flags } = parseArgs(process.argv.slice(2))
  if (command === 'prompt') {
    runPrompt(flags)
    return
  }
  if (command === 'apply') {
    runApply(flags)
    return
  }
  console.log('用法: prompt --type <rpg|roguelike|casual|slg> --name <名称> --out <文件>')
  console.log('      apply --patch <JSON 文件> --type <类型> --name <名称> [--out <报告文件>]')
}

main()
