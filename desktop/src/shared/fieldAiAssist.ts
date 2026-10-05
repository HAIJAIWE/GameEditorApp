/**
 * 数据编辑器里 AI 辅助按钮的**提示词组装**与**纯模板逻辑**。
 *
 * 对齐 Python 真源：
 * - `features/_ai_image.py::generate_desc_only`（desc 类字段的「AI生成」）
 * - `ui/widgets/dynamic_form.py::_on_auto_generate_image_info`（图片字段的「自动生成」）
 * - `ui/widgets/dynamic_form.py::_on_ai_analyze_image`（图片标签的「AI分析」）
 *
 * 全部为纯函数，不碰 Electron / 网络 —— 可直接 vitest，也可被主进程 IPC 与渲染层共用。
 */

/* ============================================================
   一、desc 类字段的「AI生成」
   ============================================================ */

/** 不参与上下文的字段（对齐 PyQt `generate_desc_only` 的排除清单） */
export const DESC_CONTEXT_EXCLUDED_FIELDS: readonly string[] = ['desc', 'description', 'image', 'id']

/** 单个上下文字段值的最大长度（防止长文本把 prompt 撑爆；对齐 PyQt 无上限，此处为 TS 侧自加的保护） */
const CONTEXT_VALUE_MAX = 200

/** 单条上下文行的最大长度 */
const CONTEXT_LINE_MAX = 260

/** 上下文里最多取几个字段（按表单顺序，取前面的；防字段极多的类型把 prompt 撑爆） */
const CONTEXT_FIELD_LIMIT = 20

/**
 * 组装上下文块。
 *
 * 对齐 PyQt `generate_desc_only`：
 * ```
 * context_parts = [f"数据类型：{data_type}"]
 * for key, value in form_data.items():
 *     if value and key not in ('desc', 'description', 'image', 'id'):
 *         context_parts.append(f"{key}：{value}")
 * context = "\n".join(context_parts)
 * ```
 *
 * 与 PyQt 的两处**有意差异**（都写明理由）：
 * 1. **跳过数组/对象值**：`form_data` 里可能有 `tags` 数组、`multiselect` 引用列表。
 *    PyQt 的 `f"{value}"` 会把它们直接塞成 `['a', 'b']`，模型读到的是 Python 字面量。
 *    TS 侧改为跳过并在末尾给一行「（另有 N 个列表字段未纳入上下文）」，
 *    **不猜怎么把引用列表描述成句子** —— 那是编造。
 * 2. **值截断 + 字段数上限**：PyQt 无上限，一个 3000 字的 desc 字段能让 prompt 爆炸。
 */
export function buildDescContext(dataType: string, formData: Record<string, unknown>): string {
  const parts: string[] = [`数据类型：${dataType}`]
  let skippedLists = 0
  let taken = 0
  for (const [key, value] of Object.entries(formData)) {
    if (DESC_CONTEXT_EXCLUDED_FIELDS.includes(key)) continue
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'object') {
      skippedLists += 1
      continue
    }
    if (taken >= CONTEXT_FIELD_LIMIT) break
    const text = typeof value === 'string' ? value : String(value)
    const clipped = text.length > CONTEXT_VALUE_MAX ? `${text.slice(0, CONTEXT_VALUE_MAX)}…` : text
    const line = `${key}：${clipped}`
    parts.push(line.length > CONTEXT_LINE_MAX ? `${line.slice(0, CONTEXT_LINE_MAX)}…` : line)
    taken += 1
  }
  if (skippedLists > 0) {
    parts.push(`（另有 ${skippedLists} 个列表/对象字段未纳入上下文）`)
  }
  return parts.join('\n')
}

/**
 * desc 生成提示词 —— **逐字对齐** Python `features/_ai_image.py:296-323`
 * 的 `prompt = f"""..."""`。改动前请先核 Python 真源。
 */
export function buildDescPrompt(dataType: string, context: string): string {
  return `【角色】
你是一位游戏文案创作专家，擅长用精炼、有感染力的中文写出令人印象深刻的游戏描述。

【上下文】
用户正在为奇幻RPG游戏制作${dataType}数据，需要一段专业描述。

【指令】
根据以下信息生成一段描述：

${context}

【风格要求】
- 50-100字，精炼有力
- 有画面感和代入感，让读者能在脑海中"看到"这个${dataType}
- 突出核心特点和定位，避免套话（不要用"非常强大""独一无二"等空洞形容词）
- 如果是角色/怪物，暗示其性格或行为模式
- 如果是技能/装备/道具，强调其独特效果和使用场景
- 只输出描述文本，不要加任何前缀说明

【输出】
直接输出中文描述文本，不要用引号包裹。`
}

/* ============================================================
   二、图片字段的「自动生成」（**纯字符串模板，不调 AI**）
   ============================================================ */

/** 自动生成的图片标签上限（对齐 PyQt `_on_ai_analyze_image` 的 `result.strip()[:200]`） */
export const IMAGE_TAGS_MAX = 200

/**
 * 「自动生成」填入 `image_desc` / `image_tags` 的文本。
 *
 * 对齐 Python `dynamic_form.py::_on_auto_generate_image_info`：
 * ```python
 * name = data.get('name', '')
 * info = {'desc': f'{name}的图片描述', 'tags': f'{name},图片,游戏'}
 * ```
 *
 * **注意这是一个纯字符串模板，不调用任何 AI**（PyQt 按钮名叫「自动生成」但没接 AI，
 * 容易被误读）。TS 侧保持同样语义，但按钮文案明确叫「自动填充」以免误导 ——
 * 判定在 `autoFillLabel()`。
 *
 * name 为空时回落为类型名占位，避免产出「的图片描述」这种半截句子。
 */
export function buildAutoImageInfo(name: string, typeLabel: string): { desc: string; tags: string } {
  const subject = name.trim() === '' ? typeLabel.trim() === '' ? '未命名' : typeLabel.trim() : name.trim()
  return { desc: `${subject}的图片描述`, tags: `${subject},图片,游戏` }
}

/** 「自动填充」按钮文案（明示不调 AI，避免用户以为点了会消耗 API） */
export function autoFillLabel(): string {
  return '自动填充'
}

/** 「AI分析」提示词 —— 对齐 Python `dynamic_form.py::_on_ai_analyze_image` 的 prompt */
export function buildImageTagsPrompt(imagePath: string): string {
  return `请描述这张图片的内容，提取主要视觉元素作为标签: ${imagePath}`
}

/**
 * 把 AI 返回的标签结果清洗成可写入 tags 字段的文本。
 *
 * 对齐 PyQt `_on_ai_analyze_image`：
 * ```python
 * new_tags = result.strip()[:200]
 * widget.setText(f"{current}{', ' if current else ''}{new_tags}")
 * ```
 * —— 追加到现有内容后面（不是替换），分隔符是 `, `。
 *
 * **多行结果压成单行**：模型常回「火焰, 岩石\n烟雾, 魔法」这类多行结果，
 * 直接写入会让 tags 字段出现换行、破坏「逗号分隔」的语义。这里把换行/连续空白压成分隔符。
 */
export function mergeImageTagsResult(current: string, result: string): string {
  // 先把换行与连续标点压平：模型常回「火焰, 岩石\n烟雾, 魔法」这类多行结果，
  // 直接写入会让 tags 字段出现换行、破坏「逗号分隔」的语义。
  // **再剔除空段**：纯空白的结果会被压成 `,`，若不剔除就会写出「已有, ,」这种脏值。
  const flat = result
    .replace(/[\r\n]+/g, ',')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(',')
    .replace(/,+/g, ',')
  const clipped = flat.slice(0, IMAGE_TAGS_MAX)
  const base = current.trim()
  if (clipped === '') return base
  return base === '' ? clipped : `${base}, ${clipped}`
}