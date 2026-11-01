import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { scanPackage } from './packageBoundary'

/**
 * 包边界守卫：`packages/agent-core` **不得反向依赖 app**。
 *
 * ## 为什么这条守卫必须有（A3 的教训）
 * 把 `main/agent` 搬进 `packages/agent-core` 时，包内残留了 5 处 `@app/*`
 * （取消表、LLM 客户端、两个技能的业务服务类型）。tsc 当时**全绿**——因为 app 的
 * `paths` 恰好能解析 `@app/*`。也就是说：目录搬了、包名改了，**边界仍然是假的**，
 * 包内任何文件都能顺手拿到宿主的一切，且没有任何机制会在腐化时报警。
 *
 * 后来这 5 处换成了 `ports.ts` 的端口，`@app` 别名也一并删掉（现在写了就解析不了）。
 * 但"删掉别名"只挡住 `@app/*` 一种写法，挡不住 `../../../apps/desktop/src/main/...`
 * 这种相对路径逃逸。本文件把两个方向都钉死，让边界从"约定"变成"用例"。
 *
 * 扫描逻辑与 `client-ui` 共用 `./packageBoundary`（复制两份必然漂移）。
 */

const PKG_SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../packages/agent-core/src')

describe('agent-core 包边界：不得反向依赖 app', () => {
  const scan = scanPackage(PKG_SRC)

  it('扫描范围非空（防止守卫因路径写错而静默通过）', () => {
    expect(scan.files.length).toBeGreaterThan(50)
  })

  it('不存在 `@app` 前缀的模块说明符', () => {
    expect(scan.hostAliases).toEqual([])
  })

  it('相对路径不得逃出 packages/agent-core/src', () => {
    expect(scan.escapes).toEqual([])
  })

  it('只允许依赖 @mobai/shared（不得反向引 @mobai/client-ui 等上层包）', () => {
    expect(scan.mobai).toEqual(['@mobai/shared'])
  })

  /**
   * 第三方依赖面 = 显式清单。
   *
   * 这 7 个是"宿主集成层"的既定事实（为什么不能清掉见 `ports.ts` 与提交说明），
   * 但它们**必须是有意为之**：新增一个运行时依赖意味着包又长出一条外部腿，
   * 应当先想清楚是留在包内、还是收进 `shared`。所以这里不写"至少包含"，
   * 而是**全等**——多一个就红，让"顺手 import 个 lodash"在 CI 就停下。
   *
   * 本条第一次写就抓到一个漏项：`documentSkill` 里那句
   * `await import('pdfjs-dist/legacy/build/pdf.mjs')`（动态 import，扫 `from '…'`
   * 的粗糙 grep 看不见）。这正是"清单要机器守、不能靠人列"的理由。
   *
   * 注意：`packages/agent-core/package.json` **刻意不声明**这些依赖
   * （声明会让 npm 把它们 hoist 到仓库根，打断 apps/desktop 的 electron
   * postinstall 与 electron-builder 的打包假设）。清单的权威落点就是本条用例。
   */
  it('第三方依赖面是显式清单（新增需有意为之）', () => {
    expect(scan.external).toEqual([
      'better-sqlite3',
      'electron',
      'exceljs',
      'jszip',
      'pdfjs-dist',
      'quickjs-emscripten',
      'vectra'
    ])
  })
})
