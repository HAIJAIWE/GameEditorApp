import base from './electron.vite.config'
import { defineConfig } from 'vite'

/**
 * 渲染层独立 dev 服务器 —— **可选 workaround，不是官方开发入口**。
 *
 * 正常开发仍用 `npm run dev`（electron-vite）。仅在遇到下面这个问题时才用它：
 *
 *   现象：`npm run dev` 在 vite 依赖预优化阶段拉起 electron，GPU 进程 100% 访问
 *        冲突崩溃（Windows + 特定显卡驱动组合上复现，根因未定位到 Electron 层）。
 *   绕过：先单独起渲染层 dev 服务器，等它 ready 后再手动起 electron——
 *        两者的进程派生顺序不同，就不会踩到崩溃点。
 *
 * 用法（两条命令，各占一个终端）：
 *   1) cd desktop && npx vite --config vite.renderer.config.ts
 *   2) cd desktop && ELECTRON_RENDERER_URL=http://localhost:5173 \
 *        NODE_ENV_ELECTRON_VITE=development \
 *        node_modules/.bin/electron . --disable-gpu --no-sandbox
 *
 * 注意：
 *   - 若宿主环境设了 `ELECTRON_RUN_AS_NODE=1`，第 2 条会退化成「用 node 跑主进程」，
 *     必须 `env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS` 清掉再启动；
 *   - `root` 必须显式指定为 `src/renderer`（electron-vite 的默认约定）——这里只复用
 *     它的 renderer 配置，不经过 electron-vite 的进程派生逻辑。
 */
export default defineConfig({
  ...base.renderer,
  root: 'src/renderer'
})
