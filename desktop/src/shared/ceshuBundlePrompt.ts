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
 * ## 两种任务
 * - `draft`：按契约补全空缺字段（返回 `{章: {字段: 值}}` 增量）；
 * - `review`：审阅内容找矛盾/重复/不可执行（返回 issues 列表）。
 *
 * 纯函数：输入 bundle，输出字符串；不碰文件与网络。
 */

export type BundleConsumeTask = 'draft' | 'review'

export const BUNDLE_CONSUME_TASK_LABELS: Record<BundleConsumeTask, string> = {
  draft: '按契约起草空缺字段',
  review: '审阅全文找问题'
}

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

/** 收集空的必填/契约字段（draft 任务的聚焦清单） */
function collectEmptyFields(bundle: CeshuBundle): Array<{ where: string; hint: string }> {
  const items: Array<{ where: string; hint: string }> = []
  for (const chapter of bundle.chapters) {
    for (const field of chapter.fields) {
      if (field.required !== true) continue
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

/** 生成消费提示词（纯函数；bundle 来自 `buildCeshuBundle` 或解析导出 JSON） */
export function buildBundleConsumePrompt(bundle: CeshuBundle, task: BundleConsumeTask): string {
  return task === 'draft' ? buildDraftPrompt(bundle) : buildReviewPrompt(bundle)
}

/** 使用说明（面板展示；说明「提示词 + JSON 一起发」的用法） */
export const BUNDLE_CONSUME_USAGE = [
  '用法：',
  '1. 用「双轨」格式导出策划书，得到 <名称>.md（人读）和 <名称>.json（机读）；',
  '2. 复制上方提示词，连同 <名称>.json 的完整内容，一起发给任意 AI；',
  '3. AI 会按字段契约返回增量 JSON（起草）或问题清单（审阅）；',
  '4. 把结果合入策划书后保存——保存即结算字段审核状态。'
].join('\n')
