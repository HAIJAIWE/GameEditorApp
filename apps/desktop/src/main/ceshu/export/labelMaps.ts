/**
 * 导出层的中文标签映射。
 *
 * 2026-11-09 实测真实导出：Excel 概览 Sheet 的「风格」印的是 `xianxia`、「模块类型」印的是 `rpg`，
 * 而同一个文档在 renderer 里显示的是「仙侠」「RPG」——导出件交给别人看时，裸 key 等于没写。
 *
 * 为什么不复用提示词模块里的 `STYLE_LABEL_TO_KEY` / `TYPE_LABEL_TO_KEY`：
 * 那两个表在 `@mobai/shared/ceshu/prompts` 里（方向是「中文 → key」），反向查还要处理
 * 「休闲 / 放置 都映射 casual」这类多对一；而且导出层一旦 import prompts，就会把整坨 AI
 * 提示词常量牵进主进程导出路径。也不直接 import `@mobai/shared/config/game`——
 * 那会把 settings/localStorage 基座一起拉进导出路径。这里只维护一张导出件需要的小表，
 * 由 `apps/desktop/tests/unit/ceshuExportLabelMaps.test.ts` 守卫「GAME_STYLES 的每个 id 都有中文名」。
 */

/** 风格 id → 中文名（前 6 项与 `GAME_STYLES` 的 id/name 严格一致，测试守卫） */
const STYLE_LABELS: Record<string, string> = {
  xianxia: '仙侠',
  wuxia: '武侠',
  scifi: '科幻',
  fantasy: '奇幻',
  modern: '现代',
  pixel: '像素/复古',
  // 以下是全量生成 / AI 会写进 doc.style 的别名（不在 GAME_STYLES 里）
  'sci-fi': '科幻',
  realistic: '现代 / 写实',
  post_apoc: '末日',
  anime: '二次元',
  dark: '暗黑',
  cyberpunk: '赛博朋克',
  steampunk: '蒸汽朋克'
}

/**
 * 风格 id → 中文名。认不出来时回退原值：
 * 导出件宁可留一个可疑的 key，也不要变成空单元格。
 */
export function styleLabelOf(style: unknown): string {
  const key = typeof style === 'string' ? style.trim() : ''
  if (!key) return '—'
  return STYLE_LABELS[key] ?? key
}

/** module_type key → 中文品类名 */
const MODULE_TYPE_LABELS: Record<string, string> = {
  rpg: 'RPG（角色扮演）',
  mmorpg: 'MMORPG（大型多人在线）',
  arpg: 'ARPG（动作角色扮演）',
  slg: 'SLG（策略）',
  fps: 'FPS（第一人称射击）',
  tps: 'TPS（第三人称射击）',
  moba: 'MOBA',
  survival: '生存建造',
  card: '卡牌',
  strategy: '策略',
  roguelike: 'Roguelike',
  open_world: '开放世界',
  tower_defense: '塔防',
  simulation: '模拟经营',
  sim: '模拟经营',
  idle: '放置',
  casual: '休闲益智',
  puzzle: '解谜',
  action: '动作',
  platformer: '平台跳跃',
  party: '派对'
}

/**
 * 品类名：优先用 module_type 的中文名，其次用 meta.game_type（用户填的通常已是中文），
 * 最后才回退大写的 key。
 *
 * 为什么需要这个顺序：新建文档时 module_type 可能是空串（只有 meta.game_type 有值），
 * 而一键全量生成的文档反过来——module_type 写死了（`plan.typeKey`），meta.game_type 才是中文原文。
 */
export function genreLabelOf(moduleType: unknown, gameType: unknown): string {
  const key = typeof moduleType === 'string' ? moduleType.trim() : ''
  const type = typeof gameType === 'string' ? gameType.trim() : ''
  const label = key ? MODULE_TYPE_LABELS[key.toLowerCase()] : undefined
  if (label) return label
  if (type) return type
  return key ? key.toUpperCase() : '—'
}
