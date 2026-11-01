import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** 按 Node 解析结果定位依赖目录（npm hoist 会把它在 `apps/desktop/node_modules` 与根之间挪） */
const nodeRequire = createRequire(import.meta.url)
const pkgDir = (specifier: string): string => dirname(nodeRequire.resolve(`${specifier}/package.json`))

export default defineConfig({
  resolve: {
    /**
     * 测试环境的解析别名。
     *
     * - `@mobai/*`：两个包都在 `apps/desktop` 之外，没有别名 vitest 找不到（包内只导出源码）。
     * - 其余运行时依赖：**测试不 externalize**，同一个包可能被 shared / agent-core / app
     *   各解析出一份（类型实例不互认、native 模块重复初始化）。显式收敛到 app 的
     *   node_modules 才是单实例——生产构建由 `externalizeDepsPlugin()` 负责同一件事，
     *   见 `electron.vite.config.ts` 的说明。
     */
    alias: {
      '@mobai/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
      '@mobai/agent-core': fileURLToPath(new URL('../../packages/agent-core/src', import.meta.url)),
      '@mobai/client-ui': fileURLToPath(new URL('../../packages/client-ui/src', import.meta.url)),
      zod: pkgDir('zod'),
      'pinyin-pro': fileURLToPath(new URL('./node_modules/pinyin-pro', import.meta.url)),
      // 包内 .tsx 的 react 也必须收敛到 app 这一份，否则 hooks 会拿到第二个 React
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
      'quickjs-emscripten': fileURLToPath(new URL('./node_modules/quickjs-emscripten', import.meta.url)),
      vectra: fileURLToPath(new URL('./node_modules/vectra', import.meta.url)),
      jszip: fileURLToPath(new URL('./node_modules/jszip', import.meta.url)),
      exceljs: fileURLToPath(new URL('./node_modules/exceljs', import.meta.url)),
      'better-sqlite3': fileURLToPath(new URL('./node_modules/better-sqlite3', import.meta.url)),
      'pdfjs-dist': fileURLToPath(new URL('./node_modules/pdfjs-dist', import.meta.url)),
      electron: fileURLToPath(new URL('./node_modules/electron', import.meta.url))
    }
  },
  /**
   * JSX 走自动运行时（`react/jsx-runtime`）。
   *
   * 根 `tsconfig.json` 是纯 references 文件（没有 compilerOptions），esbuild 读不到
   * `jsx: react-jsx`，会回落到 classic 转换 —— 于是 `.tsx` 测试报 `React is not defined`。
   * 这里显式声明，避免把 `jsx` 配置塞进根 tsconfig 影响构建链。
   */
  esbuild: { jsx: 'automatic' },
  test: {
    // 单元测试 + 集成测试（集成 = 真实存储/文件系统，仍可在 Node 下跑，无需 Electron）
    // `.tsx` = DOM 组件测试（jsdom 环境，文件头用 `@vitest-environment jsdom` 指定）
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts'
    ],
    environment: 'node',

    /**
     * 跨运行持久化「模块转换结果」缓存（默认关闭）。
     *
     * 本仓库单次运行要转换的模块图很大（实测冷跑聚合 transform ≈ 78s，占
     * vitest 自报耗时的 39%），且**每次运行都全量重来**。缓存落在
     * `node_modules/.vitest-cache`（随依赖重装自然失效，无需 .gitignore）。
     */
    fsModuleCache: true,

    /**
     * 🔴 **不隔离 + 限定 4 个 worker（2026-10-18 实测换来的）**。
     *
     * 原本用默认配置：`isolate: true` ⇒ **每个测试文件起一个进程**（本仓 134 个）。
     * 在装有实时防护的本机（火绒）上，进程创建被逐个扫描，启动握手会超过 vitest
     * **硬编码的 60 秒** `START_TIMEOUT`（`dist/chunks/index-*.js` 里 `START_TIMEOUT = 6e4`，
     * **无配置项**，`poolOptions.*.startTimeout` 在 v5 已不存在），于是报
     * `[vitest-pool]: Failed to start forks worker … Timeout waiting for worker to respond`，
     * 而**那个文件整份不执行、且不计入统计**：
     *
     * | 配置 | 实测 |
     * | --- | --- |
     * | 默认（每文件一进程） | 连跑 8 轮有 **7 轮**丢文件：测试数 1936–2046 漂移，`Errors 9`，wall 最高 81s |
     * | `--maxWorkers=6`（仍隔离） | 3 轮里仍有 1 轮丢文件（wall 81s）——**只降并发不够** |
     * | **`isolate:false` + `maxWorkers:4`** | **6/6 全量 2046、exit 0、wall 7–8s** |
     * | `isolate:false` + `maxWorkers:1`（最坏共享） | 2/2 全量 2046、wall 21s —— 证明关隔离未引入状态泄漏 |
     *
     * ⚠️ 该失败**退出码非 0**（CI 能兜住），但终端摘要仍打印「N passed」——
     * **只看摘要会误判为全绿**。核对方式：`Test Files … (134)` + `Tests … (2046)`，数字少了就是丢文件。
     * 排查顺序依赖问题时可用 `npm test -- --isolate` 临时恢复隔离。
     */
    isolate: false,
    maxWorkers: 4,

    /**
     * hook 上限放宽（默认 10000ms 对本仓库偏紧）。
     *
     * 用例大量做真实文件系统 / SQLite I/O，afterAll/afterEach 常需递归删除临时目录；
     * Windows 上这类清理会被 I/O 争用拖过 10s，表现为 `Hook timed out in 10000ms`——
     * **与断言语义无关**，却会把整个测试文件记成 Failed Suites（实测还原：
     * tests/unit/backupStore.test.ts 的 afterAll rmSync）。
     *
     * 只放宽 hook，**用例级 testTimeout 保持默认**（真挂死的用例仍能快速暴露）；
     * 个别故意跑满沙箱预算的用例自带用例级超时（见 tests/unit/jsSandbox.test.ts）。
     */
    hookTimeout: 30000,

    /**
     * 覆盖率基线（P1#4）：先出一次全量数字，暂不设门禁。
     * 用 v8 provider（随 vitest 5 安装 `@vitest/coverage-v8`），reporter 同时给
     * 终端文本 + JSON（供脚本聚合）+ HTML（供人工下钻）。
     * 先不写 thresholds——门禁要在看到真实分布后再定，避免误杀。
     */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'text-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      // 只统计应用源码，排除测试、配置、构建产物与第三方
      exclude: [
        'tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.ts',
        '**/*.d.ts',
        'out/**',
        'coverage/**',
        'node_modules/**'
      ]
    }
  }
})
