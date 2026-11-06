import {
  CESHU_TASK_PRIORITIES,
  taskRoleLabelForDoc,
  taskRolesForDoc as specTaskRolesForDoc,
  type CeshuRoleTask,
  type CeshuTaskPlan,
  type CeshuTaskPriority
} from '../workflow'
import { type CeshuDocument, type ChapterKey } from '../reference'
import { displayFieldValue } from '../fields'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  createDefaultCeshu,
  getDocKind,
  getGddScope,
  visibleChaptersForDoc
} from '../model'
import { isMachineDataField } from '../workflow'
import { parseLlmJson } from '../../util/object'

/**
 * 岗位任务生成（2026-10-26）。
 *
 * 此前 `tasks/*.md` 是「按章搬运字段」——那是**阅读清单**，不是任务：
 * 「核心循环：探索→战斗→养成」这一行，程序看了不知道该写什么代码。
 * 这里把整份文档交给 AI，让它拆成各岗位**可执行动作**。
 *
 * 纯逻辑（组提示词 / 解析 / 校验），不碰 IPC 与 LLM：main 的 AI 任务与脚本都能复用。
 */

/** 摘要预算：喂给模型的文档正文上限（字符）。超了就按章截断，而不是把提示词撑爆 */
export const TASK_DIGEST_LIMIT = 8000

/** 单条 detail 的截断长度：够表达「做什么 + 验收点」 */
const FIELD_VALUE_LIMIT = 180

/**
 * 摘要里要跳过的登记项：`version` / `date` 是文档簿记，不是设计输入。
 * 不跳的话，一份完全空白的文档也会因为「版本号：0.1.0 / 日期：2026-10-26」显得有内容。
 */
const DIGEST_SKIP_FIELDS = new Set(['version', 'date'])

/** 每岗任务条数上限（模型偶尔会吐 20 条，超出部分截掉） */
export const TASK_PER_ROLE_LIMIT = 10

/**
 * 文档摘要：按可见章列出**已填**字段（跳过机读数据），逐字段截断，总预算封顶。
 *
 * 为什么不用整份 JSON：24 章全量能到几万字符，既贵又会让模型抓不住重点；
 * 而「只给填了的」天然等于「这个项目真正确定了什么」，正好是拆任务的依据。
 */
export function buildTaskDigest(doc: CeshuDocument, limit: number = TASK_DIGEST_LIMIT): string {
  // 拿同档位的默认文档做基线：值等于默认 ⇒ 用户没动过 ⇒ 不算「设计里确定了什么」
  const baseline = createDefaultCeshu({ scope: getGddScope(doc), docKind: getDocKind(doc) })
  const lines: string[] = []
  let used = 0
  for (const chapter of visibleChaptersForDoc(doc)) {
    const data = chapterDataForDoc(doc, chapter)
    const base = chapterDataForDoc(baseline, chapter)
    const chapterLines: string[] = []
    for (const field of chapterFieldsForDoc(doc, chapter)) {
      // 机读数据（账本/断言/用例）不是设计输入，别占预算
      if (isMachineDataField(chapter as ChapterKey, field.key)) continue
      if (DIGEST_SKIP_FIELDS.has(field.key)) continue
      const value = displayFieldValue(field, data[field.key]).trim()
      if (value === '') continue
      // 与默认值相同 ⇒ 没填过（`sfx_count`/`main_npc_count` 默认 0、状态默认 draft 都走这条）
      if (value === displayFieldValue(field, base[field.key]).trim()) continue
      const clipped = value.length > FIELD_VALUE_LIMIT ? `${value.slice(0, FIELD_VALUE_LIMIT)}…` : value
      chapterLines.push(`- ${field.label}：${clipped}`)
    }
    if (chapterLines.length === 0) continue
    const block = `## ${chapterLabelForDoc(doc, chapter)}（${chapter}）\n${chapterLines.join('\n')}`
    if (used + block.length > limit) {
      lines.push('…（后续章节因篇幅省略）')
      break
    }
    lines.push(block)
    used += block.length
  }
  return lines.length === 0
    ? getDocKind(doc) !== 'game'
      ? '（这份软件设计文档还没有任何已填内容）'
      : '（这份策划书还没有任何已填内容）'
    : lines.join('\n\n')
}

/**
 * 参与拆解的岗位 = 全部岗位。
 *
 * 试过按「相关章有没有内容」裁剪，结果不可靠：默认值会污染判断
 * （`audio.sfx_count` 默认是 0，`displayFieldValue` 出来是「0」⇒ 被当成有内容；
 * 而 `art`/`uiux` 默认全空 ⇒ 真美术岗位反被裁掉）。
 * 与其用不可靠的启发式，不如交给模型：提示词已要求「只拆确实写了的系统」，
 * 没有依据的岗位它会返回空数组，代价只是多几个 token。
 */
export function taskRolesForDoc(doc: CeshuDocument): readonly string[] {
  // 单一事实源在 ceshuTasks.ts：游戏档 CESHU_ROLE_ORDER（零回归）、应用档 APP_ROLES。
  return specTaskRolesForDoc(doc)
}

/** 组岗位任务提示词（system + prompt） */
export function buildRoleTaskPrompt(
  doc: CeshuDocument,
  roles: readonly string[] = taskRolesForDoc(doc)
): { system: string; prompt: string } {
  const isApp = getDocKind(doc) !== 'game'
  // 显式传 roles（IPC 允许任意字符串数组）时按该档位白名单过滤，
  // 避免脏 key 混进 JSON 骨架；缺省就用该档位全量岗位。
  const allowed = new Set(specTaskRolesForDoc(doc))
  const effectiveRoles = roles.filter((role) => allowed.has(role))
  const meta = doc.meta as Record<string, unknown>
  const nameRaw = isApp
    ? (typeof meta.project_name === 'string' && meta.project_name !== '' ? meta.project_name : meta.game_name)
    : meta.game_name
  const gameName = typeof nameRaw === 'string' && nameRaw !== '' ? nameRaw : '未命名项目'
  const gameType = typeof meta.game_type === 'string' ? meta.game_type : ''
  const visible = visibleChaptersForDoc(doc)

  const system = isApp
    ? [
        '你是资深技术负责人。任务：读这份软件设计文档，把它拆成**各岗位可执行的任务清单**。',
        '必须遵守：',
        '1. 每条任务必须是**可执行动作**（动词开头：实现/搭建/设计/配置/编写/接入/联调/部署），',
        '   不许出现「理解」「关注」「阅读」「确认某章」这类不是动作的条目；',
        '2. 任务必须能在软件设计文档里找到依据，`source` 填依据章的 key（只能用下面给出的章 key）；',
        '3. **不许发明文档里没有的模块、接口、页面、数据实体**——没写就不拆；',
        '4. 每岗 3-8 条，按优先级分级：P0=不做就无法交付最小可用版本，P1=首个完整版本，P2=打磨优化；',
        '5. title ≤ 20 字且只写动作与对象；detail 写清「做什么 + 验收点」≤ 60 字；',
        '6. 只输出严格 JSON，不要任何解释文字、不要 markdown 代码块以外的内容。'
      ].join('\n')
    : [
        '你是资深游戏制作人。任务：读这份策划书，把它拆成**各岗位可执行的任务清单**。',
        '必须遵守：',
        '1. 每条任务必须是**可执行动作**（动词开头：实现/搭建/绘制/配置/编写/接入/联调/铺量），',
        '   不许出现「理解」「关注」「阅读」「确认某章」这类不是动作的条目；',
        '2. 任务必须能在策划书里找到依据，`source` 填依据章的 key（只能用下面给出的章 key）；',
        '3. **不许发明策划书里没有的系统、玩法、界面、道具**——没写就不拆；',
        `4. 每岗 3-8 条，按优先级分级：P0=不做就没有可玩版本，P1=首个完整版本，P2=打磨优化；`,
        '5. title ≤ 20 字且只写动作与对象；detail 写清「做什么 + 验收点」≤ 60 字；',
        '6. 只输出严格 JSON，不要任何解释文字、不要 markdown 代码块以外的内容。'
      ].join('\n')

  const skeleton = Object.fromEntries(
    effectiveRoles.map((role) => [
      role,
      [{ title: '', detail: '', priority: 'P0', source: visible[0] ?? 'gameplay' }]
    ])
  )

  const prompt = [
    isApp
      ? `项目：${gameName}`
      : `游戏：${gameName}${gameType === '' ? '' : `（品类：${gameType}）`}`,
    `可用章 key：${visible.join(', ')}`,
    '',
    isApp ? '软件设计文档摘要：' : '策划书摘要：',
    buildTaskDigest(doc),
    '',
    '请严格按下面的 JSON 结构输出（键名不可改；没有任务的岗位给空数组）：',
    '```json',
    JSON.stringify(skeleton, null, 2),
    '```',
    '',
    '要求：',
    `- 岗位键只能是：${effectiveRoles.map((role) => `${role}（${taskRoleLabelForDoc(doc, role)}）`).join('、')}；`,
    '- priority 只能是 P0 / P1 / P2；',
    '- source 只能是上面「可用章 key」里的一个；',
    isApp
      ? '- 只拆软件设计文档里确实写了的模块，不要补全成「一个完整应用应该有什么」。'
      : '- 只拆策划书里确实写了的系统，不要补全成「一个完整游戏应该有什么」。'
  ].join('\n')

  return { system, prompt }
}

function normalizeTask(raw: unknown, visible: ReadonlySet<string>): CeshuRoleTask | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const item = raw as Record<string, unknown>
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  if (title === '') return null
  const detail = typeof item.detail === 'string' ? item.detail.trim() : ''
  const priorityRaw = typeof item.priority === 'string' ? item.priority.trim().toUpperCase() : ''
  const priority: CeshuTaskPriority = (CESHU_TASK_PRIORITIES as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as CeshuTaskPriority)
    : 'P1'
  // source 必须是该文档真实可见的章：AI 编出来的章名会让「依据」变成死链
  const sourceRaw = typeof item.source === 'string' ? item.source.trim() : ''
  // 只要求是该文档可见章（应用章不属于游戏 ChapterKey，用字符串集合判断）
  const source: string = visible.has(sourceRaw) ? sourceRaw : [...visible][0] ?? 'gameplay'
  return { title, detail, priority, source }
}

/**
 * 解析 AI 返回的任务计划。
 * 只保留**已知岗位 + 合法章**，其余丢弃；空标题条目丢掉（AI 常留一条空骨架）。
 */
export function parseRoleTaskPlan(raw: string, doc: CeshuDocument): CeshuTaskPlan {
  const parsed = parseLlmJson(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const source = parsed as Record<string, unknown>
  const visible = new Set(visibleChaptersForDoc(doc))

  const plan: CeshuTaskPlan = {}
  // 白名单按文档档位取：应用档只接受 APP_ROLES 的岗位 key，游戏档仍是 5 个既有岗位
  for (const role of taskRolesForDoc(doc)) {
    const value = source[role]
    if (!Array.isArray(value)) continue
    const tasks: CeshuRoleTask[] = []
    for (const item of value) {
      const task = normalizeTask(item, visible)
      if (task !== null) tasks.push(task)
      if (tasks.length >= TASK_PER_ROLE_LIMIT) break
    }
    if (tasks.length > 0) plan[role] = tasks
  }
  return plan
}

/** 计划是否为空（用于「AI 一条都没拆出来」的提示） */
export function isEmptyTaskPlan(plan: CeshuTaskPlan): boolean {
  return Object.values(plan).every((tasks) => tasks === undefined || tasks.length === 0)
}

/** 统计总条数（UI 提示用） */
export function countTaskPlan(plan: CeshuTaskPlan): number {
  return Object.values(plan).reduce((sum, tasks) => sum + (tasks?.length ?? 0), 0)
}
