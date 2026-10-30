import { hasStoredLlmConfig, loadLlmConfig } from '../../shared/config/llm/llmConfig'

/**
 * 启动时把 LLM 非敏感配置镜像推给主进程（M0 / DD-0）。
 *
 * ## 为什么必须有这次推送
 * 主进程**读不到 localStorage**（渲染层与主进程之间只有 IPC），
 * `main/ipc.ts` 里 `llmConfigMirror` 是它唯一的非敏感配置来源。
 * M0 之前渲染层**只在用户改过设置时**才推（`SettingsPanel.commitLlm`），
 * 于是**配过的用户重启后镜像也归零** —— 他明明配过，AI 调用却落进「未配置」分支。
 *
 * ## 为什么放 `main.tsx` 顶层而不是 `App.tsx` 的 `useEffect`
 * 1. **时序最早**：早于任何组件挂载、早于任何 AI 调用；
 * 2. **避开 StrictMode 双跑**：`useEffect` 在 dev 下双跑，`main.tsx` 顶层代码不双跑
 *    （`llm:configure` 虽幂等，但未来加埋点会双计）；
 * 3. 不动 `App.tsx`（全仓最重的共享接线文件，少改一处少一分回归面）。
 *
 * ## ⚠️ 为什么「没配过」时**不推**（守卫，勿删）
 * 主进程用 `llmConfigMirror === null` 表达「用户从没配置过」这个**事实**，
 * 并据此在 `main/llm/client.ts::generate` 里抛 `LLM_MESSAGES.notConfigured`
 * —— 那条文案同时给出「配云端」与「一键保密」两条路，是 M0 引导的落点。
 *
 * 若此处无条件推送，`loadLlmConfig()` 在键缺失时会返回 `DEFAULT_LLM_CONFIG`
 * （`enabled: false`、`provider: 'deepseek'`），镜像于是**恒非 null**：
 * 1. `notConfigured` 那道闸**永不成立 = 死代码**，用户改收到 `LLM_MESSAGES.disabled`
 *    「未启用 API，请先勾选『启用 API』」—— 告知一个他从没开过的开关被关了，正是 M0 要消灭的误导；
 * 2. 更糟：`resolveLlmTier(DEFAULT_LLM_CONFIG)` 因 `provider==='deepseek'` 判成 `'cloud'`
 *    ⇒ 未配置用户点「一键生成」会**先弹云端花钱确认**、确认后才收到「未配置」，
 *    等于要求他为从未配置的档位做付费决策。
 * 两处判据都建立在「null ⇔ 没配过」上，故跳过推送即是在**修复**它们。
 *
 * 判据复用 `hasStoredLlmConfig()`（而非自己判键是否存在），保证与
 * `SettingsPanel` 判引导态用的是**同一个函数** ⇒ 两处不会漂移。
 *
 * ## 失败语义：fail-closed，且**静默**
 * 推送失败**绝不能阻断启动**（本函数在 `createRoot` 之前跑，抛错会导致白屏）。
 * 镜像为 `null` 有**两种**成因，**都**导向「未配置 ⇒ 给指引」，即 fail-closed：
 * - **(a) 从没配过**（守卫跳过）—— **正常路径**，不是错误；
 * - **(b) 推送失败**（下方 catch）—— 真异常，但同样不外泄：启动期无法向用户呈现提示，
 *   硬塞 console 噪声只会掩盖真实错误。宁可不给 AI 能力，也不猜用户配置。
 */
export function pushLlmConfigMirror(): Promise<void> {
  // 从没配过 ⇒ 不推，好让主进程的 `config === undefined` 真的等价于「从没配置过」（见上）
  if (!hasStoredLlmConfig()) return Promise.resolve()
  try {
    return window.mbApi.llm
      .configure({ config: loadLlmConfig() })
      .then(() => undefined)
      .catch(() => undefined)
  } catch {
    /*
     * 同步抛错兜底：`window.mbApi` 由 preload 注入，若在**无 preload 的浏览器**
     * 里直接打开构建产物（本项目的 preview 静态验证就是这种形态），
     * `window.mbApi.llm.configure` 会同步抛 `TypeError` —— 那种情况下
     * `.catch()` 根本来不及接管，而本函数在 `createRoot` 之前抛 ⇒ 整页白屏。
     * 「推送是尽力而为」这条契约要求**任何**失败形态都不外泄。
     */
    return Promise.resolve()
  }
}
