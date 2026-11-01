import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { scanPackage } from './packageBoundary'

/**
 * 包边界守卫：`packages/client-ui` 必须是**宿主无关**的 UI 内核。
 *
 * ## 为什么（A2 阶段 1）
 * 从 `plugins/host` 搬出来的三个模块（插槽出口 / React 绑定注册 / 应用上下文）
 * 之所以能搬，唯一理由是它们**只依赖 react 与 `@mobai/shared` 的类型**。
 * 这个性质不会被编译器强制：随手 `import { pluginHost } from '.../plugins/context'`
 * 一样能编译通过，然后这个包就变成了"位置在 packages 里的 app 代码"（A3 已验证过的死路）。
 *
 * 所以用三条判据钉住：
 * 1. 相对路径不得逃出 `packages/client-ui/src`；
 * 2. 只允许 `@mobai/shared`（不得引 `@mobai/agent-core`——UI 不该依赖 agent 内核）；
 * 3. 第三方只有 `react` / `react-dom`。
 *
 * 注意：判据是"包内文件的 import 方向"，**不**限制 app 反向依赖本包
 * （app → client-ui 是允许且必然的方向）。
 */

const PKG_SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../packages/client-ui/src')

describe('client-ui 包边界：宿主无关', () => {
  const scan = scanPackage(PKG_SRC)

  it('扫描范围非空', () => {
    expect(scan.files.length).toBeGreaterThan(2)
  })

  it('相对路径不得逃出 packages/client-ui/src', () => {
    expect(scan.escapes).toEqual([])
  })

  it('不得使用宿主别名 @app', () => {
    expect(scan.hostAliases).toEqual([])
  })

  it('只允许依赖 @mobai/shared', () => {
    expect(scan.mobai).toEqual(['@mobai/shared'])
  })

  it('第三方依赖只有 react（新增需有意为之）', () => {
    // 目前三个模块只 import `react`。`react-dom` 的别名已在 vite/vitest 配好
    // （UI 包迟早要 portal），但**还没有文件用它**——真用起来时这条会红，
    // 届时把 'react-dom' 加进来即可，正好是一次"有意为之"的确认。
    expect(scan.external).toEqual(['react'])
  })
})
