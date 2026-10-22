import { CESHU_WRITING_STANDARD } from './ceshuAiData'
import type { CeshuBundle } from './ceshuBundle'
import { isEmptyRequiredValue } from './ceshuModel'

/**
 * 机读轨（bundle JSON）的**消费端提示词**生成器。
 *
 * ## 使用场景
 * 用户把策划书双轨导出后，拿 `<name>.json` 去喂**任意外部 AI**（云端对话、
 * 团队自建管线）。外部 AI 不认识我们的 schema，本模块把「 schema 语义 + 字段契约
 * + 输出格式 + 写作规范」组装成一段可直接粘贴的提示词：JSON 跟在提示词后面一起发，
 * AI 就能按契约起草或审阅，并返回**可回填的增量 JSON**。
 *
 * ## 三种任务
 * - `draft`：按契约补全空缺字段（返回 `{章: {字段: 值}}` 增量）；
 * - `review`：审阅全文找矛盾/重复/不可执行（返回 issues 列表）；
 * - `reviewPending`：只审 `status=ai_draft` 的字段（返回 issues 列表）。
 *   全文审又慢又容易发散，而人最常问的是「AI 刚写的这几段有没有问题」。
 *
 * 纯函数：输入 bundle，输出字符串；不碰文件与网络。
 */

export type BundleConsumeTask = 'draft' | 'draftAll' | 'review' | 'reviewPending'

export const BUNDLE_CONSUME_TASK_LABELS: Record<BundleConsumeTask, string> = {
  draft: '按契约起草空缺字段',
  draftAll: '全字段起草（含可选）',
  review: '审阅全文找问题',
  reviewPending: '只审待审字段'
}

/** 任务顺序（面板按钮与 rehearsal 脚本共用：由窄到宽） */
export const BUNDLE_CONSUME_TASKS: readonly BundleConsumeTask[] = ['draft', 'draftAll', 'reviewPending', 'review']

/** 契约语义说明（外部 AI 的「字段字典」；措辞保持稳定，测试锚点） */
const CONTRACT_LEGEND = [
  '字段契约语义（每个字段的这些键是给机器看的规则，不是内容）：',
  '- required=true：必填，不能为空；',
  '- aiDraftable=false：该字段由人确定，你不要生成或修改它；',
  '- aiHint：这个字段应该产出什么（生成时遵守）；',
  '- reviewHint：人审时看什么（审阅时作为检查点）；',
  '- status=ai_draft：AI 草稿待审；status=approved：已批准；无 status：尚未涉及。'
].join('\n')

/** 生成「按契约起草」提示词 */
function buildDraftPrompt(bundle: CeshuBundle): string {
  const pending = collectEmptyFields(bundle)
  const pendingLines =
    pending.length > 0
      ? pending.map((item) => `- ${item.where}：${item.hint}`).join('\n')
      : '（当前没有空的必填字段；如确需补充，只处理 aiHint 指向明显不足的字段）'
  return [
    '你是游戏策划助手。请根据我随后提供的策划书结构化数据（JSON），按字段契约补全内容。',
    '',
    CONTRACT_LEGEND,
    '',
    '本次要补全的空缺字段：',
    pendingLines,
    '',
    '输出要求：',
    '1. 只输出 JSON，不要任何解释、不要 markdown 代码块；',
    '2. 输出「增量」：形如 {"章节key": {"字段key": 值}}，只包含你生成/改写的字段；',
    '3. 值类型遵循字段 kind：字符串/数组/数字/对象，与 JSON 里该字段现有值的类型一致；',
    '4. aiDraftable=false 的字段一律不输出；',
    '5. 不要重复 JSON 里已有非空内容，只补空缺与明显不足处。',
    '',
    CESHU_WRITING_STANDARD,
    '',
    `以下是策划书结构化数据（schema: ${bundle.schema}），请基于它工作：`
  ].join('\n')
}

/**
 * 生成「全字段起草」提示词（draftAll：2026-10-23 复刻演练需要「看完整效果」时加）。
 * 与 draft 的差别只有两点：清单收**全部**空缺字段（不限必填）；明确要求可选字段
 * 也按契约写、但宁精勿滥（可选长文不凑字数——「写对」优先于「写满」）。
 */
function buildDraftAllPrompt(bundle: CeshuBundle): string {
  const pending = collectEmptyFields(bundle, false)
  const pendingLines = pending.map((item) => `- ${item.where}：${item.hint}`).join('\n')
  return [
    '你是游戏策划助手。请根据我随后提供的策划书结构化数据（JSON），按字段契约补全内容。',
    '',
    CONTRACT_LEGEND,
    '',
    '本次要补全的空缺字段（含必填与可选，全部都要给）：',
    pendingLines,
    '',
    '输出要求：',
    '1. 只输出 JSON，不要任何解释、不要 markdown 代码块；',
    '2. 输出「增量」：形如 {"章节key": {"字段key": 值}}，只包含你生成/改写的字段；',
    '3. 值类型遵循字段 kind：字符串/数组/数字/对象，与 JSON 里该字段现有值的类型一致；',
    '4. aiDraftable=false 的字段一律不输出；',
    '5. 不要重复 JSON 里已有非空内容，只补空缺与明显不足处；',
    '6. 可选字段同样按契约写，但宁精勿滥：写不出实质内容就给最短的合格答案，不要为填满而注水。',
    '',
    CESHU_WRITING_STANDARD,
    '',
    `以下是策划书结构化数据（schema: ${bundle.schema}），请基于它工作：`
  ].join('\n')
}

/** 生成「审阅全文」提示词 */
function buildReviewPrompt(bundle: CeshuBundle): string {
  const drafts = collectDraftFields(bundle)
  const draftLines =
    drafts.length > 0
      ? drafts.map((item) => `- ${item}`).join('\n')
      : '（没有标记为 ai_draft 的字段）'
  const validationLines =
    bundle.validation.errors.length > 0
      ? bundle.validation.errors.map((error) => `- ${error}`).join('\n')
      : '（内置校验未发现问题）'
  return [
    '你是资深游戏策划审阅专家。请审阅我随后提供的策划书结构化数据（JSON），找出真问题。',
    '',
    CONTRACT_LEGEND,
    '',
    '重点审阅：',
    '1. 逻辑矛盾：前后章节设定互相冲突（如战斗模式、货币、里程碑不一致）；',
    '2. 内容重复：语义重叠的字段写了同一件事（附重复度供参考）；',
    '3. 不可执行：只有口号没有具体规则/数字/例子，落地时无法照做；',
    '4. 契约违背：必填为空、人定字段被写了内容。',
    '',
    '待审草稿（status=ai_draft，优先看这些）：',
    draftLines,
    '',
    '内置校验已发现的问题：',
    validationLines,
    '',
    '输出要求：',
    '1. 只输出 JSON，不要任何解释、不要 markdown 代码块；',
    '2. 格式：{"issues": [{"chapter": "章节key", "field": "字段key", "severity": "high|medium|low", "message": "问题是什么", "suggestion": "怎么改"}]}；',
    '3. 没有问题就输出 {"issues": []}，不要为了凑数编造；',
    '4. message/suggestion 用中文，具体到可执行，不写空话。',
    '',
    `以下是策划书结构化数据（schema: ${bundle.schema}），请审阅：`
  ].join('\n')
}

/** 生成「只审待审字段」提示词（范围限定 status=ai_draft，避免全文审发散） */
function buildReviewPendingPrompt(bundle: CeshuBundle): string {
  const pending = collectPendingFields(bundle)
  // 没有待审字段时不留空清单：外部 AI 容易自作主张去审别的字段，所以要显式收口
  const pendingLines =
    pending.length > 0
      ? pending
          .map((item) =>
            item.reviewHint !== ''
              ? `- ${item.where}\n  - 人审要点：${item.reviewHint}`
              : `- ${item.where}`
          )
          .join('\n')
      : '（当前没有待审字段）'
  const emptyNotice =
    pending.length > 0
      ? []
      : [
          '当前没有待审字段（JSON 里没有任何 status=ai_draft 的字段）。请直接返回 {"issues": []}，不要审阅其他字段。',
          ''
        ]
  return [
    '你是资深游戏策划审阅专家。本次只审待审字段（status=ai_draft），不要评价已批准字段。',
    '',
    CONTRACT_LEGEND,
    '',
    '待审字段清单（逐条对照「人审要点」检查）：',
    pendingLines,
    '',
    ...emptyNotice,
    '审阅重点：',
    '1. 人审要点：该字段是否达到清单里写明的检查点；',
    '2. 不可执行：只有口号没有具体规则/数字/例子，落地时无法照做；',
    '3. 自相矛盾：与已批准内容或其他章节冲突（只指出冲突，不评价已批准字段本身）。',
    '',
    '输出要求：',
    '1. 只输出 JSON，不要任何解释、不要 markdown 代码块；',
    '2. 格式：{"issues": [{"chapter": "章节key", "field": "字段key", "severity": "high|medium|low", "message": "问题是什么", "suggestion": "怎么改"}]}；',
    '3. chapter/field 只能用上面清单里出现的键：chapter 用该章在 JSON 里的 key，field 用清单括号内的 key；',
    '4. 没有问题就输出 {"issues": []}，不要为了凑数编造；',
    '5. message/suggestion 用中文，具体到可执行，不写空话；建议本身也要符合下面的写作规范。',
    '',
    CESHU_WRITING_STANDARD,
    '',
    `以下是策划书结构化数据（schema: ${bundle.schema}），请只审阅上述待审字段：`
  ].join('\n')
}

/** 收集空的字段（draft 任务的聚焦清单；requiredOnly=false 时收全部空缺，供 draftAll 用） */
function collectEmptyFields(bundle: CeshuBundle, requiredOnly = true): Array<{ where: string; hint: string }> {
  const items: Array<{ where: string; hint: string }> = []
  for (const chapter of bundle.chapters) {
    for (const field of chapter.fields) {
      if (requiredOnly && field.required !== true) continue
      if (field.aiDraftable === false) continue // 人定字段不交给外部 AI
      if (!isEmptyRequiredValue(field.value)) continue
      const hint = field.aiHint !== undefined && field.aiHint !== '' ? field.aiHint : field.reviewHint ?? ''
      items.push({ where: `${chapter.label}（${chapter.key}）· ${field.label}（${field.key}）`, hint })
    }
  }
  return items
}

/** 收集待审草稿字段（review 任务的聚焦清单） */
function collectDraftFields(bundle: CeshuBundle): string[] {
  const items: string[] = []
  for (const chapter of bundle.chapters) {
    for (const field of chapter.fields) {
      if (field.status === 'ai_draft') items.push(`${chapter.label} · ${field.label}（${field.key}）`)
    }
  }
  return items
}

/** 收集待审字段及其人审要点（reviewPending 任务的聚焦清单） */
function collectPendingFields(bundle: CeshuBundle): Array<{ where: string; reviewHint: string }> {
  const items: Array<{ where: string; reviewHint: string }> = []
  for (const chapter of bundle.chapters) {
    for (const field of chapter.fields) {
      if (field.status !== 'ai_draft') continue
      items.push({
        where: `${chapter.label} · ${field.label}（${field.key}）`,
        reviewHint: field.reviewHint ?? ''
      })
    }
  }
  return items
}

/** 生成消费提示词（纯函数；bundle 来自 `buildCeshuBundle` 或解析导出 JSON） */
export function buildBundleConsumePrompt(bundle: CeshuBundle, task: BundleConsumeTask): string {
  switch (task) {
    case 'draft':
      return buildDraftPrompt(bundle)
    case 'draftAll':
      return buildDraftAllPrompt(bundle)
    case 'review':
      return buildReviewPrompt(bundle)
    case 'reviewPending':
      return buildReviewPendingPrompt(bundle)
    default: {
      // 类型已穷尽；兜底防止旧版 UI 状态传进脏值，而不是静默走错分支
      const unreachable: never = task
      return unreachable
    }
  }
}

/** 使用说明（面板展示；说明「提示词 + JSON 一起发」的用法） */
export const BUNDLE_CONSUME_USAGE = [
  '用法：',
  '1. 用「双轨」格式导出策划书，得到 <名称>.md（人读）和 <名称>.json（机读）；',
  '2. 复制上方提示词，连同 <名称>.json 的完整内容，一起发给任意 AI；',
  '3. AI 会按字段契约返回增量 JSON（起草）或问题清单（审阅）；',
  '4. 把结果合入策划书后保存——保存即结算字段审核状态。'
].join('\n')
