/**
 * 系统钥匙串（Electron `safeStorage`）里的 **secret 名**清单。
 *
 * ## 为什么不并进 `settingsStore.ts` 的 `SETTINGS_KEYS`
 * `SETTINGS_KEYS` 登记的是 **localStorage 设置键**（一律 `mb.` 前缀），它的用途是
 * 「导出 / 导入 / 重置全部设置」时按前缀枚举。而 secret 名有两处根本不同：
 * - 没有 `mb.` 前缀（`imageGen.apiKey` 而不是 `mb.imageGen.apiKey`）；
 * - **不落 localStorage**，它是 `userData/secrets.enc` 里的条目键。
 * 混进同一张表会让「按 `mb.` 前缀枚举 localStorage」的逻辑把 secret 名当成设置键处理，
 * 是最容易出错的形态，故独立成文件、只此一处真源。
 *
 * ## 命名规则（由主进程 `isValidSecretName` 兜底校验）
 * 只允许字母数字与 `. _ -`，长度 1~64，禁止 `..`。
 * 采用「领域.字段」点分层级，将来加 `llm.apiKey`、`ceshuReview.apiKey` 可自然扩展。
 */
export const SECRET_NAMES = {
  /**
   * AI 生图面板的 API Key。
   * 迁移背景：E22 把生图 apiKey 以**明文**存进了 localStorage 的 `mb.imageGenConfig`，
   * 现改为本进程 `safeStorage` 加密落盘；旧明文的一次性搬迁见 `shared/secretMigration.ts`。
   */
  imageGenApiKey: 'imageGen.apiKey'
} as const

/** 本仓已登记的 secret 名（联合类型，供需要类型安全的地方引用） */
export type SecretName = (typeof SECRET_NAMES)[keyof typeof SECRET_NAMES]
