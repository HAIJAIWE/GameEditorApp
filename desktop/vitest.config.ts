import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 单元测试 + 集成测试（集成 = 真实存储/文件系统，仍可在 Node 下跑，无需 Electron）
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',

    /**
     * 跨运行持久化「模块转换结果」缓存（默认关闭）。
     *
     * 本仓库单次运行要转换的模块图很大（实测冷跑聚合 transform ≈ 78s，占
     * vitest 自报耗时的 39%），且**每次运行都全量重来**。vitest 按 CPU 数并发
     * fork（20 核机上约 19 路同时跑），转换开销把宿主占满后，新 worker 连启动握手
     * 都会超时，表现为：
     *   `[vitest-pool]: Failed to start forks worker … Timeout waiting for worker to respond`
     * 此时**整个测试文件静默不执行**（实测一次：windowState + fieldTemplateStore
     * 两个文件未跑，测试数 1344 → 1305，退出码非 0 但无任何用例失败信息）。
     *
     * 该失败在 vitest 里**没有可配的超时旋钮**（只有 hookTimeout/teardownTimeout），
     * 唯一杠杆是降低并发——但实测收敛并发（maxForks: 8）在 40 路 CPU 争用下并未
     * 复现该失败，即**无证据有效**，且 wall 由 46s 升到 79s（+72%）。故改用 vitest
     * 自身推荐的转换缓存：直接缩短 worker 启动路径，不动并发度。
     * 缓存落在 `node_modules/.vitest-cache`（随依赖重装自然失效，无需 .gitignore）。
     */
    fsModuleCache: true,

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
    hookTimeout: 30000
  }
})
