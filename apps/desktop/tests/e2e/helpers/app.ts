import { join } from 'node:path'

import { _electron as electron, expect, type Page } from '@playwright/test'

import { INITIAL_LIBRARY_NAME } from '../../../src/main/library/store'
import { localStubLlmConfig } from './llmConfig'

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
    env: { ...inheritedEnv(), MB_USER_DATA_DIR: userDataDir, ...extraEnv }
  })
}

/**
 * 从父进程环境里剔掉会让 Electron **退化或被劫持**的两个变量。
 *
 * ## 为什么必须剔（2026-10-19 实测）
 * 在 Electron 宿主 IDE 里跑 e2e（VS Code / Cursor / WorkBuddy 等）时，父进程环境常带：
 * - `ELECTRON_RUN_AS_NODE=1` —— Electron 会**退化成纯 Node 进程**，不启动 Chromium、
 *   不开调试端口。Playwright 连不上，报的却是 `Error: Process failed to launch!`，
 *   **完全看不出根因**（实测 `electron.exe --version` 只打印 Node 的版本号即可确诊）。
 * - `NODE_OPTIONS=--require=<某个 shim>` —— 该 shim 会被注入到被测应用的**主进程**里，
 *   属于把测试宿主的运行时钩子带进了被测对象，行为不可控。
 *
 * ## 为什么改在这里而不是让每个人记命令
 * 全部 55 个规格都经本函数启动（原先是 51 份内联复制，已收敛）。修在这里 = 一次生效、
 * 跨平台（`env -u` 是 bash 专属写法，Windows 的 cmd 跑 npm script 时不可用），
 * 也不需要每个人知道这个坑。确需保留某个变量时，用 `extraEnv` 显式加回来即可（它后展开）。
 */
function inheritedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env['ELECTRON_RUN_AS_NODE']
  delete env['NODE_OPTIONS']
  return env
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

/**
 * 库作用域下的数据目录 —— e2e 断言落盘位置时的**唯一正确前缀**。
 *
 * ⚠️ A2-1 引入「库」之后，全部 store 都挂在 `<userData>/libraries/<库名>/` 下
 * （见 `main/library/manager.ts::activeDir()` 与 `stores.ts::buildStores(libDir)`），
 * **不再**是 `<userData>/<store>`。历史上有 7 个 spec 仍按旧布局拼路径，
 * 结果把「落盘成功」误判成「没落盘」（报 `ENOENT: ... ceshu/<id>.json`）——
 * 这种误判比测试直接失败更糟：它会让人去修一个并不存在的持久化 bug。
 *
 * 库名从 `INITIAL_LIBRARY_NAME` 派生，避免第二处硬编码「初始库」。
 */
export function libraryDir(userDataDir: string, library: string = INITIAL_LIBRARY_NAME): string {
  return join(userDataDir, 'libraries', library)
}

/**
 * 把 LLM 配置播种为「本地档 + 指定 Ollama 地址」，然后 reload 让主进程收到镜像。
 *
 * ⚠️ 为什么必须播种：`LlmClient`（创作面 51 个调用点）读的是**设置面板的 `StoredLlmConfig`**
 * （渲染层 localStorage `mb.llmConfig`，由 `llmBootstrap.pushLlmConfigMirror()` 推给主进程），
 * 而 `DEFAULT_LLM_CONFIG.provider` 是 `deepseek`、`model` 刻意留空 ⇒ 新 userData 一定是
 * `unconfigured` 档。历史上有用例只设 `MB_OLLAMA_HOST` 就期待走本地 Ollama，
 * 于是永远拿到「尚未配置 AI 服务」，把「未配置」误当成「本地不可达」。
 *
 * 只写必要字段即可：`loadLlmConfig` 会逐字段与 `DEFAULT_LLM_CONFIG` 合并。
 */
export async function seedLocalLlmConfig(window: Page, host: string, model = 'stub:latest'): Promise<void> {
  await window.evaluate(
    ({ config }) => {
      localStorage.setItem('mb.llmConfig', JSON.stringify(config))
    },
    { config: localStubLlmConfig(host, model) }
  )
  await window.reload()
  await waitReady(window)
}
