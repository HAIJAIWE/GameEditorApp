import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts', 'tests/**/*.ts', '*.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['spikes/**/*.mjs'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    // 浏览器预览工具（Node 跑静态服务器 + 注入 window.mbApi 桩 + Edge 截图驱动）
    files: ['preview/**/*.mjs', 'preview/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    // 一次性脚本（Node CommonJS，用 require/__dirname）
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs'
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },

  // ==========================================================================
  // src/shared/ 分层边界（契约见 src/shared/README.md）
  //
  // 分层：contract(留根) / domain/* / config / service / util
  // 允许方向：domain → contract|config|service|util|同域；config|util → contract|同层
  // 禁止方向：domain ↔ domain（跨业务域）、util|config → domain
  //
  // ⚠️ pattern 匹配的是 import 语句里的**原始字符串**（不做路径解析），因此 `shared/`
  // 这类字面前缀只在跨出 shared 时才出现在路径里（`src/main` → `'../shared/domain/…'`）。
  // shared 内部一律是相对路径（`'../ceshu/x'`），故域间规则用 `domain/<peer>/**` +
  // 逐级上跳前缀来锚定，避免漏判。
  // ==========================================================================
  ...[
    // 规则 1：各业务域之间禁止互相 import（4 个业务域各锁一次）
    { dir: 'ceshu', peers: ['attr', 'type', 'agent'] },
    { dir: 'attr', peers: ['ceshu', 'type', 'agent'] },
    { dir: 'type', peers: ['ceshu', 'attr', 'agent'] },
    { dir: 'agent', peers: ['ceshu', 'attr', 'type'] }
  ].map(({ dir, peers }) => ({
    files: [`src/shared/domain/${dir}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: peers.flatMap((peer) => [
                `**/domain/${peer}/**`,
                `../${peer}/**`,
                `../../${peer}/**`,
                `../../../${peer}/**`
              ]),
              message:
                `shared/domain/${dir}/ 禁止 import 其它业务域（${peers.join(' / ')}）。` +
                '请通过 contract 层（types.ts / schemas.ts / ipc.ts）解耦。'
            }
          ]
        }
      ]
    }
  })),
  // 规则 2：util 是纯工具层，禁止依赖任何业务域
  {
    files: ['src/shared/util/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/**'],
              message: 'shared/util/ 是纯工具层，禁止 import 任何业务域（domain/**）。'
            }
          ]
        }
      ]
    }
  },
  // 规则 3：config 只负责设置持久化，禁止依赖任何业务域
  {
    files: ['src/shared/config/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/**'],
              message: 'shared/config/ 只负责设置持久化，禁止 import 任何业务域（domain/**）。'
            }
          ]
        }
      ]
    }
  },
  // 规则 4：主进程不得直接 import 业务域，应走 shared/api.ts 契约门面。
  //
  // 粒度说明：仓库无 path alias，`src/main/**` 对 shared 的引用一律是 `../../shared/<name>`
  // 形态的相对路径（实测 83 条），因此这里锚定 `domain/<域>/` 分区前缀。
  // 尚未归区的历史平铺文件（`shared/ceshuModel.ts` 等）不在本规则约束范围内——
  // 它们属于渐进式迁移的存量，等迁入 `domain/` 后自动纳入本规则。
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/shared/domain/**'],
              message:
                'src/main/ 禁止直接 import 业务域（shared/domain/**）；请通过 shared/api.ts 契约门面调用。'
            }
          ]
        }
      ]
    }
  },
  // 规则 5：agent skills（工具层）禁止反向依赖「编排层 / 运行时」
  // —— 把 agent-framework-design.md §7.2 不变量 ① 变成机器可执行的守卫
  //
  // 分层：skills(工具层) ← dispatcher(编排层) ← brainService + transports(运行时)
  // skills 位于最底层，只可被编排层单向引用；反向 import 会形成循环依赖并使分层腐化。
  //
  // ⚠️ 粒度（实测取证）：只禁编排层/运行时这 5 个文件，**不禁 Store**
  // （`operationLogStore` / `sessionStore` / `memoryStore` / `preferenceStore`）。
  // 因为 `rollbackSkill` 现依赖 `../operationLogStore`（工具→存储），属既有事实，
  // 不在 §7.2 不变量范围内；若一并禁止会直接打断构建。
  //
  // ⚠️ 覆盖警告：flat config 同名规则**整体覆盖**而非合并，本条会盖掉规则 4 对
  // skills 文件的配置，故此处必须重复声明 `**/shared/domain/**`，否则规则 4 在这批文件上失效。
  {
    files: ['src/main/agent/skills/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/shared/domain/**'],
              message:
                'src/main/ 禁止直接 import 业务域（shared/domain/**）；请通过 shared/api.ts 契约门面调用。'
            },
            {
              group: [
                '**/agent/dispatcher',
                '**/agent/brainService',
                '**/agent/approvalBroker',
                '**/agent/qualityJudge',
                '**/agent/operationRecorder',
                '../dispatcher',
                '../brainService',
                '../approvalBroker',
                '../qualityJudge',
                '../operationRecorder'
              ],
              message:
                'agent/skills/ 是工具层，禁止反向 import 编排层/运行时（dispatcher · brainService · approvalBroker · qualityJudge · operationRecorder）。' +
                '依赖方向只能是「编排层 → 工具层」，见 agent-framework-design.md §7.2 不变量①。'
            }
          ]
        }
      ]
    }
  }
)