import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 单元测试 + 集成测试（集成 = 真实存储/文件系统，仍可在 Node 下跑，无需 Electron）
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node'
  }
})