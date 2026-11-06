import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { buildContract } from '@mobai/shared/ceshu/validation'
import {
  buildProjectFolder,
  taskRoleLabelForDoc,
  taskRolesForDoc
} from '@mobai/shared/ceshu/workflow'
import { deriveRulesetId, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import {
  APP_CHAPTER_LABELS,
  APP_META_KEY,
  APP_PARTS,
  APP_ROLE_CHAPTERS,
  appChapterAi,
  appPartDisplayName,
  appPartOf
} from '@mobai/shared/appSchema'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'
import { buildJsonSnapshot } from '../../../data/snapshotExport'

import { renderCeshuBundleJson } from './bundle'
import { renderCeshuMarkdown } from '../doc/markdown'

/**
 * **应用档开发交接包**（SDD）。
 *
 * ## 为什么不复用游戏的 7 卷 11 文档分卷
 * `HANDOFF_DOCS` / `HANDOFF_VOLUMES` / `HANDOFF_ROLE_LABELS` 是一整套游戏研发
 * 施工图（核心循环 / 装备与词条 / 品类裁剪 / 11 个游戏角色）。软件设计文档没有
 * 「品类」「核心循环」，硬套会产出「伤害公式」式的假内容。SDD 交接包改按**规格
 * 自己的分区与章表**组织：需求 → 产品 → 技术 → 质量 → 交付，一章一份设计文件，
 * 岗位用 APP_ROLES（产品/前端/后端/测试/运维）。
 *
 * ## 包内结构
 * ```
 * <项目名>-交接包/
 *   README.md            # 施工总纲：按 SDD 分区的章节目录 + 岗位责任 + 门禁
 *   开发路线.md          # 按分区的实施顺序与每章负责人
 *   index.json           # 机读清单：档位/分区/章/岗位/源文件（给 agent 调度）
 *   design/<章>.md       # 逐章设计内容（与项目文件夹同源）
 *   data/<章>.json       # 章内结构化字段
 *   tasks/<岗位>.md      # 按岗位拆分的可执行任务
 *   gdd.md               # 完整软件设计文档（人读；文件名沿用导出契约）
 *   bundle.json          # 机读字段 + 契约
 *   contract.json        # 规则集 / 参数 / 断言
 *   prototype/demo.html  # 界面原型（若已生成）
 * ```
 *
 * ⚠️ 不发明新数据：章节与岗位文件复用 `buildProjectFolder`，机读包/契约/快照
 * 与游戏档交接包同源，本文件只负责 SDD 口径的装箱与总纲。
 */

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const

function projectName(doc: CeshuDocument): string {
  const meta = doc.meta as Record<string, unknown>
  const raw = typeof meta.project_name === 'string' && meta.project_name.trim() !== ''
    ? meta.project_name
    : meta.game_name
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : '未命名软件设计文档'
}

function platformText(doc: CeshuDocument): string {
  const meta = doc.meta as Record<string, unknown>
  return Array.isArray(meta.platform)
    ? meta.platform.filter((item): item is string => typeof item === 'string').join('、')
    : ''
}

/** 章节目录（按 SDD 分区，章号连续） */
function chapterDirectory(doc: CeshuDocument): string {
  const visible = new Set(visibleChaptersForDoc(doc))
  const lines: string[] = []
  APP_PARTS.forEach((part, index) => {
    const chapters = part.chapters.filter((key) => visible.has(key))
    if (chapters.length === 0) return
    lines.push(`### ${CN[index] ?? index + 1}、${part.label}`, '')
    for (const key of chapters) {
      lines.push(`- [${APP_CHAPTER_LABELS[key] ?? key}](design/${key}.md) · 负责：${appChapterAi(key).agentId}`)
    }
    lines.push('')
  })
  return lines.join('\n').trim()
}

/** 岗位责任表 */
function roleTable(doc: CeshuDocument): string {
  const lines = ['| 岗位 | 任务清单 | 主要依据章 |', '|------|----------|------------|']
  for (const role of taskRolesForDoc(doc)) {
    const chapters = (APP_ROLE_CHAPTERS[role] ?? [])
      .map((key) => APP_CHAPTER_LABELS[key] ?? key)
      .join('、')
    lines.push(`| ${taskRoleLabelForDoc(doc, role)} | [tasks/${role}.md](tasks/${role}.md) | ${chapters || '—'} |`)
  }
  return lines.join('\n')
}

function renderReadme(doc: CeshuDocument, generatedAt: string): string {
  const platform = platformText(doc)
  return [
    `# ${projectName(doc)} · 开发交接包（软件设计文档）`,
    '',
    `> 文档类型: 软件设计文档（SDD） | 生成时间: ${generatedAt}`,
    ...(platform !== '' ? [`> 目标平台: ${platform}`] : []),
    '',
    '本包把同一份软件设计文档**按分区与岗位重排**，供开发团队按章派工、逐章验收。',
    '`gdd.md` 是完整文档（人读/检索），`design/` 是逐章正文，`tasks/` 是各岗位可执行任务。',
    '',
    '## 包内结构',
    '',
    '- `gdd.md` — 完整软件设计文档',
    '- `design/<章>.md` — 逐章设计内容（含字段与填报要求）',
    '- `data/<章>.json` — 章内结构化字段（表/清单等机读内容）',
    '- `tasks/<岗位>.md` — 按岗位拆分的可执行任务',
    '- `bundle.json` / `contract.json` — 机读字段与契约',
    '- `index.json` — 机读清单（分区/章/岗位/源文件，供 agent 调度）',
    '',
    '## 章节目录（按分区）',
    '',
    chapterDirectory(doc),
    '',
    '## 岗位与责任',
    '',
    roleTable(doc),
    '',
    '## 门禁',
    '',
    '1. 每章的必填字段填齐、且「明确不做」给出边界后才进入实现；',
    '2. 接口与数据模型的字段口径在正文、`bundle.json`、`contract.json` 中保持一致；',
    '3. 测试用例与验收条件可判定；关键设计决策写明「为什么不选另一种」；',
    '4. 拿不准的事实写「待确认」，不要编造竞品、性能或市场数字。'
  ].join('\n')
}

/** 机读清单：给外部 agent 调度用，形状稳定、不含游戏专属字段 */
function renderManifest(doc: CeshuDocument, generatedAt: string): string {
  const visible = visibleChaptersForDoc(doc)
  const parts = APP_PARTS.map((part, index) => ({
    key: part.key,
    label: part.label,
    displayName: appPartDisplayName(part),
    order: index + 1,
    chapters: part.chapters.filter((key) => visible.includes(key))
  }))
  const chapters = visible.map((key, index) => ({
    key,
    label: APP_CHAPTER_LABELS[key] ?? key,
    part: key === APP_META_KEY ? 'meta' : appPartOf(key),
    order: index,
    agentId: appChapterAi(key).agentId,
    aiHint: appChapterAi(key).aiHint,
    file: `design/${key}.md`
  }))
  const roles = taskRolesForDoc(doc).map((key) => ({
    key,
    label: taskRoleLabelForDoc(doc, key),
    taskFile: `tasks/${key}.md`,
    chapters: APP_ROLE_CHAPTERS[key] ?? []
  }))
  return `${JSON.stringify({
    schema: 'mb-app-handoff/v1',
    docKind: 'application',
    docNoun: '软件设计文档',
    generatedAt,
    projectName: projectName(doc),
    platform: platformText(doc),
    rulesetId: deriveRulesetId(doc),
    sourceFile: 'gdd.md',
    parts,
    chapters,
    roles
  }, null, 2)}\n`
}

/** 开发路线：按分区顺序，标注每章负责人与验收锚点 */
function renderRoute(doc: CeshuDocument): string {
  const visible = new Set(visibleChaptersForDoc(doc))
  const lines = [`# ${projectName(doc)} · 开发路线`, '', '按分区顺序推进；每章的「完成」= 必填字段填齐且可判定。', '']
  APP_PARTS.forEach((part, index) => {
    const chapters = part.chapters.filter((key) => visible.has(key))
    if (chapters.length === 0) return
    lines.push(`## ${CN[index] ?? index + 1}、${part.label}`, '')
    for (const key of chapters) {
      lines.push(`- [${APP_CHAPTER_LABELS[key] ?? key}](design/${key}.md) — 负责：${appChapterAi(key).agentId}；要求：${appChapterAi(key).aiHint}`)
    }
    lines.push('')
  })
  lines.push('## 并行与交付', '')
  lines.push('- 产品/前端/后端按上表并行；接口与数据模型定稿后再铺实现。')
  lines.push('- 测试章的用例与发布章的回滚路径是上线门禁，不后置补写。')
  return lines.join('\n')
}

/** 组装应用档交接包全部文件（纯函数，不落盘） */
export function buildAppHandoffFiles(
  doc: CeshuDocument,
  extras: { generatedAt: string; types?: DataTypeDef[]; items?: ItemRecord[] }
): Record<string, string> {
  const files: Record<string, string> = {}

  // 逐章正文 / 结构化数据 / 岗位任务与「项目文件夹」同源，避免两边口径漂移
  for (const [path, content] of Object.entries(buildProjectFolder(doc).files)) {
    if (path.startsWith('design/') || path.startsWith('data/') || path.startsWith('tasks/')) {
      files[path] = content
    }
  }

  files['README.md'] = renderReadme(doc, extras.generatedAt)
  files['index.json'] = renderManifest(doc, extras.generatedAt)
  files['开发路线.md'] = renderRoute(doc)
  files['gdd.md'] =
    '> 本文件是**完整软件设计文档**（人读 / 检索）。实现请看 `design/` 逐章正文与 `tasks/` 岗位任务。\n\n' +
    renderCeshuMarkdown(doc)
  files['bundle.json'] = renderCeshuBundleJson(doc)
  files['contract.json'] = `${JSON.stringify(buildContract(doc), null, 2)}\n`

  // 应用档不启用游戏数据编辑，但保留了通用数据表能力时仍照常装箱
  if (extras.types !== undefined && extras.types.length > 0) {
    files['schema.json'] = `${JSON.stringify({ schema: 'mb-type-schema/v1', types: extras.types }, null, 2)}\n`
  }
  if (extras.types !== undefined && extras.items !== undefined) {
    files['data/snapshot.json'] = buildJsonSnapshot(extras.items, extras.types)
  }

  const demo = doc.demo_html
  if (typeof demo === 'string' && demo.trim() !== '') {
    files['prototype/demo.html'] = demo
  }

  return files
}
