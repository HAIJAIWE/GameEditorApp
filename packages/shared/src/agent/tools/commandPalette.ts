/**
 * 全局命令面板的纯逻辑层（零 React、零宿主依赖，可在 Node 下直接单测）。
 *
 * 为什么把「拍平 / 过滤 / 环形移动」抽出来：这三件事是面板的全部判断逻辑，
 * 留在组件里就只能靠 jsdom 断言，而它们本质是纯函数（尤其子序列匹配最容易写错）。
 * 组件只负责「把结果画出来 + 接键盘」，逻辑的正确性由本文件的单测兜住。
 *
 * 设计取舍：
 * - **拍平 + 全局去重**：命令/面板/页签是三类能力，但用户眼里只有「一条能干的事」；
 *   同一 id 出现两次（如某插件既声明命令又声明同名面板）只留先到的那条，
 *   否则列表里会出现两条点下去效果相同、只有分组标题不同的行。
 * - **过滤三路命中**：label 子串 / id 子串 / label 子序列。子序列是为了让
 *   「插件」能命中「插件中心」这类中文短查询（逐字按序出现即可，不要求连续）。
 * - `run` 在纯逻辑层只是**占位**：本文件不持有宿主，真实动作由消费方按 `group` 接回
 *   （见 `renderer/src/plugins/commandPalettePlugin.tsx` 的 `runItem`）。
 */

/** 命令面板条目（组内按来源原顺序排列） */
export interface PaletteItem {
  id: string
  label: string
  /** 行尾的次要信息（这里用能力 id，便于用户确认「点的是哪一个」） */
  hint?: string
  /**
   * 分组标识（**符号**，不是展示文案）：渲染层用 `GROUP_KEYS` 映射到 i18n 键再翻译。
   * 用符号而不是中文，是为了让逻辑层与语言解耦——比较/分组只认稳定 id。
   */
  group: 'command' | 'panel' | 'mainView' | 'conversation'
  run: () => void
}

/** 拍平输入：三类能力的**只读投影**（不依赖宿主类型，任何宿主都能对接） */
export interface PaletteSources {
  commands: Array<{ id: string; label?: string }>
  panels: Array<{ id: string; title?: string }>
  mainViews: Array<{ id: string; label?: string }>
}

/** 纯逻辑层不持有宿主：占位动作，由消费方覆写 */
const NOOP = (): void => undefined

/**
 * 把三类能力拍平成条目：label 缺省用 id，按 id 全局去重（同一 id 只留第一条），
 * 组内保持来源原顺序（命令 → 面板 → 页签）。
 */
export function buildPaletteItems(sources: PaletteSources): PaletteItem[] {
  const out: PaletteItem[] = []
  const seen = new Set<string>()

  const push = (id: string, label: string | undefined, group: PaletteItem['group']): void => {
    if (seen.has(id)) return
    seen.add(id)
    out.push({ id, label: label === undefined || label === '' ? id : label, hint: id, group, run: NOOP })
  }

  for (const command of sources.commands) push(command.id, command.label, 'command')
  for (const panel of sources.panels) push(panel.id, panel.title, 'panel')
  for (const view of sources.mainViews) push(view.id, view.label, 'mainView')
  return out
}

/** 子序列匹配：needle 的字符按序出现在 haystack 中（不要求连续） */
function isSubsequence(haystack: string, needle: string): boolean {
  if (needle === '') return true
  let cursor = 0
  for (const char of haystack) {
    if (char === needle[cursor]) {
      cursor += 1
      if (cursor === needle.length) return true
    }
  }
  return false
}

/**
 * 过滤条目：空查询原样返回（同一数组，避免每次输入空串都造新引用）；
 * 否则大小写不敏感，命中 label 子串 / id 子串 / label 子序列之一即保留。
 *
 * 查询先 trim：只敲空格时若当成「有查询」，列表会莫名其妙变空。
 */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return items
  return items.filter((item) => {
    const label = item.label.toLowerCase()
    return label.includes(needle) || item.id.toLowerCase().includes(needle) || isSubsequence(label, needle)
  })
}

/** 环形移动高亮（列表首尾相接）；空列表固定 0，避免 `% 0` 得 NaN */
export function movePaletteIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  const next = (index + delta) % length
  return next < 0 ? next + length : next
}
