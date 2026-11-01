/**
 * shared/i18n —— 中英双语文案：语言类型/归一化、文案表、翻译与覆盖率。
 *
 * 外部一律从这里 import（`.../i18n`），不要再深插目录内文件。
 *
 * ## 边界
 * 纯 TS，**零 React、零 fs**：渲染层用 `@mobai/client-ui` 的 `useT()`，
 * 主进程直接 `translate(locale, key)`。
 *
 * ## 迁移现状
 * 界面文案仍在逐文件迁移中（约 200 个文件硬编码中文）。
 * 覆盖率棘轮见 `apps/desktop/tests/unit/i18nCoverage.test.ts`。
 */

export * from './locale'
export * from './catalog'
export * from './translate'
