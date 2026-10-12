import { join } from 'node:path'

import { _electron as electron, expect, type Page } from '@playwright/test'

/**
 * E2E 共享启动器：把原先复制粘贴在 51 个规格里的内联 Electron 启动代码收敛到一处。
 *
 * 行为与原内联写法**逐字等价**：
 * - `cwd` 固定为仓库根 `desktop/`（本文件位于 `tests/e2e/helpers/`，故上跳三级）；
 * - 通过 `MB_USER_DATA_DIR` 把用户数据指向调用方提供的隔离临时目录；
 * - `args` 为 `['.', ...ELECTRON_SAFE_ARGS]`（安全参数见下方常量说明）。
 *
 * `ELECTRON_SAFE_ARGS` 的作用（2026-10-12 补，评估文档 P1#7）：Windows 本地（含沙箱环境）
 * 直接启动时 GPU 进程会崩（`Target crashed`），无头/容器 CI 同样需要这些参数。
 * 与 `npm run` 真起 GUI 用的参数一致，唯一区别是这里不传 `--disable-gpu` 之外的东西。
 *
 * `extraEnv` 用于少数需要额外环境变量的规格（如桩 ollama 的 `MB_OLLAMA_HOST` /
 * `MB_OLLAMA_MODEL`），默认不注入任何额外变量，即与多数派写法一致。
 */
/** 启动参数：禁用 GPU 与沙箱——本地 Windows 与无头 CI 都依赖它避免 GPU 进程崩溃 */
const ELECTRON_SAFE_ARGS = ['--disable-gpu', '--no-sandbox', '--disable-gpu-sandbox', '--disable-software-rasterizer']

export async function launchApp(userDataDir: string, extraEnv: Record<string, string | undefined> = {}) {
  return electron.launch({
    args: ['.', ...ELECTRON_SAFE_ARGS],
    cwd: join(__dirname, '..', '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir, ...extraEnv }
  })
}

/**
 * 就绪门禁：等待新 IA 的默认落地页——策划书首页面板可见。
 *
 * 旧 IA 的 `heading '数据表预览'` 锚点已随左侧栏 / 顶层数据表视图一并下线；
 * 新 IA 默认落策划书首页（`ceshuHomeVisible` 初始为 `true`），其面板根节点
 * 带 `data-testid="ceshu-home-panel"`，故以此作为统一就绪判据。
 *
 * 失败时给出可读断言消息，便于一眼区分「新 IA 首页未就绪」与普通超时。
 */
export async function waitReady(window: Page): Promise<void> {
  await expect(
    window.getByTestId('ceshu-home-panel'),
    '策划书首页未就绪（新 IA 默认落 ceshu-home-panel）——Electron 可能未进入默认首页，或首页组件未渲染'
  ).toBeVisible()
}
