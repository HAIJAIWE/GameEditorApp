import { getQuickJS } from 'quickjs-emscripten'

/**
 * JS 沙箱（Phase 1 预演 → 后续成为安全服务基础）：
 * 在 WASM 化的 QuickJS 虚拟机中执行不可信代码（如 LLM 生成代码）。
 *
 * 设计要点（对齐"白名单式沙箱"目标）：
 * - 默认不向沙箱暴露任何宿主能力（无 require / process / fs / 网络）；
 * - CPU：中断处理器 + 超时截止时间；内存：setMemoryLimit；
 * - 返回值经 JSON 序列化跨边界，避免句柄泄漏。
 *
 * 备选方案记录：isolated-vm 隔离更强，但为原生模块（需按 Electron ABI 重建、
 * 编译链依赖 VS Build Tools），在冻结式迁移下成本更高，故选 WASM 方案。
 */

export interface SandboxOptions {
  /** 执行超时（毫秒），默认 2000 */
  timeoutMs?: number
  /** 内存上限（MB），默认 64 */
  memoryLimitMb?: number
}

export interface SandboxResult<T = unknown> {
  ok: boolean
  value?: T
  error?: string
}

export async function runInSandbox<T = unknown>(code: string, options: SandboxOptions = {}): Promise<SandboxResult<T>> {
  const { timeoutMs = 2000, memoryLimitMb = 64 } = options

  const QuickJS = await getQuickJS()
  const runtime = QuickJS.newRuntime()
  runtime.setMemoryLimit(memoryLimitMb * 1024 * 1024)
  runtime.setMaxStackSize(1024 * 1024)

  const deadline = Date.now() + timeoutMs
  runtime.setInterruptHandler(() => Date.now() > deadline)

  const context = runtime.newContext()
  try {
    // 用户代码需 return 一个可 JSON 序列化的值
    const script = `(function () { "use strict"; const __v = (function () { ${code} })(); return JSON.stringify(__v === undefined ? null : __v); })()`
    const result = context.evalCode(script)

    if (result.error) {
      const dumped = context.dump(result.error) as { name?: string; message?: string } | string
      result.error.dispose()
      const message = typeof dumped === 'string' ? dumped : (dumped.message ?? dumped.name ?? '未知错误')
      return { ok: false, error: message }
    }

    const json = context.dump(result.value) as string
    result.value.dispose()
    return { ok: true, value: JSON.parse(json) as T }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    context.dispose()
    runtime.dispose()
  }
}