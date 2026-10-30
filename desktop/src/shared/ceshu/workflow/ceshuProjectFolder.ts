import {
  CHAPTER_LABELS,
  enabledModuleChapters,
  isChapterKey,
  type CeshuDocument,
  type CeshuFieldDef,
  type ChapterData,
  type ChapterKey
} from '../reference/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../fields/ceshuFields'
import { displayFieldValue } from '../fields/ceshuFieldDisplay'
import {
  computeEnabledEditors,
  createDefaultCeshu,
  getGameType,
  getGddScope,
  visibleChaptersForDoc
} from '../model/ceshuModel'
import { CESHU_ROLE_LABELS, CESHU_ROLE_ORDER, renderRoleTasksMarkdown, type CeshuTaskPlan } from './ceshuTasks'

/**
 * 项目文件夹（文件夹 = 工作单元的存储层，2026-10-26）。
 *
 * 结构（**设计文档与数值分开**，避免 Markdown 存表格丢结构）：
 * ```
 * config.json          # 配置：游戏/品类/阶段/模块/岗位
 * design/<章>.md        # 文字设计（text/textarea/combo）—— 人读、可手改
 * data/<章>.json        # 数值/表格（pipeList/stringList/multiCombo/number/checkbox/json）—— 结构化不丢
 * data/tasks.json       # AI 生成的岗位任务计划（原始结构）
 * tasks/<岗位>.md       # 岗位任务（由文档派生）
 * prototype/demo.html   # 可玩原型（单文件 HTML，AI 生成）
 * ```
 * `buildProjectFolder` / `projectFilesToDoc` 是**无损往返**：doc → 文件 → doc 保留已填内容。
 */
export interface ProjectFolder {
  files: Record<string, string>
}

/** 结构化字段类型：进 `data/*.json`（Markdown 存会丢结构）；其余进 `design/*.md`（文字） */
const STRUCTURED_KINDS: ReadonlySet<CeshuFieldDef['kind']> = new Set([
  'pipeList',
  'stringList',
  'multiCombo',
  'checkbox',
  'number',
  'json'
])

function isStructured(field: CeshuFieldDef): boolean {
  return STRUCTURED_KINDS.has(field.kind)
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function chapterProseMarkdown(doc: CeshuDocument, chapter: ChapterKey): string {
  const fields = (CESHU_CHAPTER_FIELDS[chapter] ?? []).filter((field) => !isStructured(field))
  const data = (doc[chapter] ?? {}) as Record<string, unknown>
  const lines = [`# ${CHAPTER_LABELS[chapter]}`, '']
  for (const field of fields) {
    const value = displayFieldValue(field, data[field.key])
    if (value === '') continue
    lines.push(`## ${field.label}`, '', value, '')
  }
  return `${lines.join('\n').trim()}\n`
}

/**
 * `data/<章>.json` 的内容：**除「文字字段」之外的全部键**。
 *
 * 为什么不只写「结构化字段」：文档可能带 schema 之外的扩展字段（早期版本遗留、插件写入），
 * 只挑已知结构化字段会让它们在文件夹往返里静默消失。这里按「文字字段进 md、其余进 json」
 * 一刀切，schema 外的键也自然落进 json ⇒ 往返无损。
 */
function chapterStructuredData(doc: CeshuDocument, chapter: ChapterKey): Record<string, unknown> | null {
  const proseKeys = new Set(
    (CESHU_CHAPTER_FIELDS[chapter] ?? []).filter((field) => !isStructured(field)).map((field) => field.key)
  )
  const data = (doc[chapter] ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (proseKeys.has(key)) continue
    if (isEmptyValue(value)) continue
    out[key] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * 项目文件夹的目录名：优先游戏名（跨平台去掉路径分隔符与 Windows 保留字符），
 * 空名/全非法时回落 `ceshu-<id>`。导出时用它建子目录，保证「一个游戏一个文件夹」。
 */
export function projectFolderName(doc: CeshuDocument): string {
  const meta = doc.meta as Record<string, unknown>
  const raw = typeof meta.game_name === 'string' ? meta.game_name : ''
  // 控制字符（含换行/制表）在 Windows 文件名里非法，按字符码剔掉，不用正则避免 no-control-regex
  const cleaned = Array.from(raw)
    .map((ch) => (ch.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(ch) ? '_' : ch))
    .join('')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
  return cleaned === '' ? `ceshu-${doc.ceshu_id}` : cleaned
}

export function buildProjectFolder(doc: CeshuDocument): ProjectFolder {  const files: Record<string, string> = {}
  const meta = doc.meta as Record<string, unknown>

  // 配置里带上文档身份与版本链字段：文件夹是**工作单元**，不只存内容——
  // 少了 ceshu_id，同一个文件夹导入两次会变成两份文档；少了 version_label/parent_id，
  // 版本链在往返中静默断掉。
  const config = {
    ceshu_id: doc.ceshu_id,
    version_label: doc.version_label,
    parent_id: doc.parent_id,
    is_active: doc.is_active,
    version_note: doc.version_note,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    /*
     * 规则集标识：**只写显式值**，不写派生值——派生值随 ceshu_id 变，
     * 写进 config 就等于把「现算的东西」固化成事实（改 id 后旧值诈尸成显式值）。
     * 消费方一律用 `deriveRulesetId(doc)`，它缺省回落派生口径。
     */
    ruleset_id: doc.ruleset_id ?? '',
    game_name: typeof meta.game_name === 'string' ? meta.game_name : '',
    game_type: getGameType(doc),
    platform: meta.platform ?? [],
    positioning: typeof meta.positioning === 'string' ? meta.positioning : '',
    business_model: meta.business_model ?? '',
    gdd_scope: getGddScope(doc),
    // 忠实记录**用户的选择**：没勾过就写 null（约定 = 全部模块），
    // 而不是把「缺省=全开」物化成 20 项清单——那会让 lite 项目的 config 看起来像启用了 20 个模块。
    enabled_modules: Array.isArray(meta.enabled_modules) ? enabledModuleChapters(doc) : null,
    // 风格 / 模块类型会被拼进 AI 提示词（ceshuAi）与机读包（ceshuBundle）；
    // 丢了它们，打开导出项目后 AI 就失去风格上下文，生成结果会飘。
    style: doc.style,
    module_type: doc.module_type,
    editor_configs: doc.editor_configs,
    // 生成原型那一刻的设计指纹：跟着项目走，才能在打开时判断原型是否过期
    demo_source_fingerprint: doc.demo_source_fingerprint ?? '',
    roles: CESHU_ROLE_ORDER.map((role) => ({ key: role, label: CESHU_ROLE_LABELS[role] }))
  }
  files['config.json'] = `${JSON.stringify(config, null, 2)}\n`

  for (const chapter of visibleChaptersForDoc(doc)) {
    files[`design/${chapter}.md`] = chapterProseMarkdown(doc, chapter)
    const structured = chapterStructuredData(doc, chapter)
    if (structured !== null) files[`data/${chapter}.json`] = `${JSON.stringify(structured, null, 2)}\n`
  }
  // 岗位任务是 AI 生成的，重新生成要花 token ⇒ 必须跟着项目走，不能只活在内存里
  if (doc.task_plan !== undefined && Object.keys(doc.task_plan).length > 0) {
    files['data/tasks.json'] = `${JSON.stringify(doc.task_plan, null, 2)}\n`
  }
  // 原型同理：生成一次要花 token，且它本身就是交付物（能直接双击打开玩）
  if (typeof doc.demo_html === 'string' && doc.demo_html.trim() !== '') {
    files['prototype/demo.html'] = doc.demo_html
  }
  for (const role of CESHU_ROLE_ORDER) {
    files[`tasks/${role}.md`] = `# ${CESHU_ROLE_LABELS[role]}任务\n\n${renderRoleTasksMarkdown(doc, role)}\n`
  }

  return { files }
}

/** 解析 `design/<章>.md` 的 `## 字段标签` 段落 → 字段键值（文字字段） */
export function parseChapterProse(markdown: string, chapter: ChapterKey): ChapterData {
  const fields = (CESHU_CHAPTER_FIELDS[chapter] ?? []).filter((field) => !isStructured(field))
  const labelToKey = new Map(fields.map((field) => [field.label, field.key]))
  const data: ChapterData = {}
  let key: string | null = null
  let buffer: string[] = []
  const flush = (): void => {
    if (key !== null) {
      const value = buffer.join('\n').trim()
      if (value !== '') data[key] = value
    }
    buffer = []
  }
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      flush()
      key = labelToKey.get(line.slice(3).trim()) ?? null
    } else if (key !== null) {
      buffer.push(line)
    }
  }
  flush()
  return data
}

/** 从文件夹内容还原文档（与 `buildProjectFolder` 无损往返） */
export function projectFilesToDoc(files: Record<string, string>): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })

  if (files['config.json'] !== undefined) {
    const config = JSON.parse(files['config.json']) as Record<string, unknown>
    const meta = doc.meta as Record<string, unknown>
    for (const key of ['game_name', 'game_type', 'positioning', 'business_model']) {
      if (typeof config[key] === 'string') meta[key] = config[key]
    }
    if (Array.isArray(config.platform)) meta.platform = config.platform
    if (config.gdd_scope === 'lite' || config.gdd_scope === 'full') meta.gdd_scope = config.gdd_scope
    if (Array.isArray(config.enabled_modules)) meta.enabled_modules = config.enabled_modules

    // 身份与版本链：config 里没有的（老导出的文件夹）就保留新建时的默认值
    if (typeof config.ceshu_id === 'string' && /^[A-Za-z0-9_-]+$/.test(config.ceshu_id)) {
      doc.ceshu_id = config.ceshu_id
    }
    for (const key of ['version_label', 'parent_id', 'version_note', 'created_at', 'updated_at'] as const) {
      if (typeof config[key] === 'string') doc[key] = config[key]
    }
    if (typeof config.is_active === 'boolean') doc.is_active = config.is_active
    for (const key of ['style', 'module_type'] as const) {
      if (typeof config[key] === 'string') doc[key] = config[key]
    }
    // 规则集标识（只在显式写过时才回填；空串 = 没显式设过，用派生口径）
    if (typeof config.ruleset_id === 'string' && config.ruleset_id.trim() !== '') {
      doc.ruleset_id = config.ruleset_id.trim()
    }
    // 原型生成时的设计指纹（缺省 = 老原型，不做过期判定）
    if (typeof config.demo_source_fingerprint === 'string' && config.demo_source_fingerprint !== '') {
      doc.demo_source_fingerprint = config.demo_source_fingerprint
    }
    if (config.editor_configs !== null && typeof config.editor_configs === 'object') {
      doc.editor_configs = config.editor_configs as Record<string, unknown>
    }
  }

  const target = doc as unknown as Record<string, unknown>
  for (const [path, content] of Object.entries(files)) {
    // `prototype/demo.html` 是单文件原型（不是章节内容）
    if (path === 'prototype/demo.html') {
      if (content.trim() !== '') doc.demo_html = content
      continue
    }
    // `data/tasks.json` 不是章节，是岗位任务计划（`<章>.json` 的正则匹配不到它）
    if (path === 'data/tasks.json') {
      try {
        const plan = JSON.parse(content) as Record<string, unknown>
        if (plan !== null && typeof plan === 'object' && !Array.isArray(plan)) {
          doc.task_plan = plan as CeshuTaskPlan
        }
      } catch {
        // 手改坏了就当作没生成过：岗位任务回落成按章清单，而不是让整个项目打不开
      }
      continue
    }
    const prose = /^design\/(.+)\.md$/.exec(path)
    if (prose !== null) {
      const chapter = prose[1]
      if (!isChapterKey(chapter)) continue
      target[chapter] = { ...(doc[chapter] as object), ...parseChapterProse(content, chapter) }
      continue
    }
    const dataMatch = /^data\/(.+)\.json$/.exec(path)
    if (dataMatch !== null) {
      const chapter = dataMatch[1]
      if (!isChapterKey(chapter)) continue
      const structured = JSON.parse(content) as Record<string, unknown>
      target[chapter] = { ...(doc[chapter] as object), ...structured }
    }
  }

  /*
   * `enabled_editors` 是**派生字段**（由 `systems` 决定），`config.json` 刻意不落盘它。
   * 但载入后必须重算一次：否则从项目文件夹读回的 doc 里它恒为空数组，与「写入后内存里的 doc」
   * 不一致——调用方（如预设市场、数据预览）读 `doc.enabled_editors` 会看到空列表。
   */
  doc.enabled_editors = computeEnabledEditors(doc)

  return doc
}
