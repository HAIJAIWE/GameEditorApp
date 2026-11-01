import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * 共享包（`packages/shared` / `packages/agent-core`）走路径别名，不打进 apps/desktop 的相对路径。
 *
 * ## 运行时依赖只别名 `zod` / `pinyin-pro`
 * 这两个要"单实例"（shared / agent-core / app 三处都 import 同一份），别名 = 从 app 的
 * node_modules 取并打进 bundle，历史如此，保持。
 *
 * ## 其余依赖**刻意不别名**（electron / better-sqlite3 / jszip / exceljs / vectra /
 * quickjs-emscripten / pdfjs-dist）
 * `externalizeDepsPlugin()` 已按 apps/desktop 的 dependencies 把它们标成 external，
 * 运行时从 `apps/desktop/node_modules` 解析，本来就是单实例。加别名会把它们**打进**
 * `out/main/index.js`——尤其 quickjs-emscripten 带 wasm 资源，打包后加载路径易碎，
 * 而这条路径只有 `system.code` 走到，e2e 覆盖不到。保持 external 才是迁移前的行为。
 *
 * vitest 那边另有别名（见 `vitest.config.ts`）：测试环境不 externalize，需要显式收敛到
 * 同一份，否则 shared / agent-core / app 各拿一份类型实例会互相不认。
 */
const sharedAlias = {
  '@mobai/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
  '@mobai/agent-core': fileURLToPath(new URL('../../packages/agent-core/src', import.meta.url)),
  zod: fileURLToPath(new URL('./node_modules/zod', import.meta.url)),
  'pinyin-pro': fileURLToPath(new URL('./node_modules/pinyin-pro', import.meta.url))
}

/**
 * 开发模式下剥离 CSP meta：
 * @vitejs/plugin-react 的 Fast Refresh 会注入内联脚本，与严格 CSP 冲突。
 * 生产构建保留 index.html 中的严格 CSP。
 */
function stripCspInDev(): Plugin {
  return {
    name: 'strip-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html: string): string {
      return html.replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>\s*/i, '')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    plugins: [react(), stripCspInDev()],
    resolve: { alias: sharedAlias }
  }
})