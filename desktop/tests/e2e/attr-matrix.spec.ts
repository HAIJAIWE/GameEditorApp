import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('关系矩阵与游戏配置导出：改系数 → 公式/示例值联动 → 筛选清空 → 保存 → 导出文件结构断言', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-matrix-e2e-'))
  const fixtureDir = mkdtempSync(join(tmpdir(), 'mb-attr-matrix-out-'))
  const exportPath = join(fixtureDir, 'game_attr_config.json')
  const launch = (): ReturnType<typeof electron.launch> =>
    electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..', '..'),
      env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
    })

  const app = await launch()
  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()
    await window.getByTestId('open-attr-system').click()
    await expect(window.getByTestId('attr-system-panel')).toBeVisible()

    // 切到关系矩阵：默认集 13 行（派生 7 + 战斗 6）× 4 列基础属性
    await window.getByTestId('attr-view-matrix').click()
    await expect(window.getByTestId('attr-matrix')).toBeVisible()
    await expect(window.getByTestId('matrix-summary')).toHaveText('13 行 × 4 列')
    await expect(window.getByTestId('matrix-cell-HP-力量')).toHaveValue('10')

    // 改 HP 力量系数 10 → 12；切回列表：公式文本与示例值联动（10*12 + 10*20 + 10*5 = 370）
    await window.getByTestId('matrix-cell-HP-力量').fill('12')
    await window.getByTestId('attr-view-list').click()
    await expect(window.getByTestId('attr-formula-4')).toHaveValue('= 力量*12 + 体质*20 + 敏捷*5')
    await expect(window.getByTestId('attr-preview-4')).toHaveText('370')

    // 筛选「战斗属性」（6 行）；清空系数只作用于筛选行（派生行不受影响）
    await window.getByTestId('attr-view-matrix').click()
    await window.getByTestId('matrix-filter').selectOption('combat')
    await expect(window.getByTestId('matrix-summary')).toHaveText('6 行 × 4 列')
    await window.getByTestId('matrix-clear').click()
    await window.getByTestId('matrix-filter').selectOption('all')
    await window.getByTestId('attr-view-list').click()
    await expect(window.getByTestId('attr-formula-11')).toHaveValue('= 5') // 暴击率：系数清空，常数项 5 保留
    await expect(window.getByTestId('attr-formula-4')).toHaveValue('= 力量*12 + 体质*20 + 敏捷*5')

    // 保存（矩阵编辑走既有草稿/校验链路）
    await window.getByTestId('attr-save').click()
    await expect(window.getByTestId('attr-notice')).toContainText('已保存')

    // 导出游戏配置：原生保存对话框无法自动化，直接走 IPC（导出已保存系统）
    const exported = await window.evaluate(async (path) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            attrSystem: {
              get: () => Promise<unknown>
              exportGameConfig: (req: { path: string; system: unknown }) => Promise<{ filePath: string }>
            }
          }
        }
      ).mbApi
      const system = await api.attrSystem.get()
      return api.attrSystem.exportGameConfig({ path, system })
    }, exportPath)
    expect(exported.filePath).toBe(exportPath)

    const config = JSON.parse(readFileSync(exportPath, 'utf-8')) as {
      version: string
      base_attributes: Array<Record<string, unknown>>
      derived_formulas: Record<string, { type: string; base: number; coefficients: Record<string, number>; min: number | null; max: number | null }>
      calculation_order: string[]
      attribute_constraints: Record<string, { min: number; max: number | null }>
    }
    expect(config.version).toBe('1.0')
    expect(config.base_attributes).toHaveLength(4)
    expect(config.base_attributes[0]).toEqual({ name: '力量', display_name: '力量', min: 0, max: null, default: 10 })
    expect(config.derived_formulas['HP']).toEqual({
      type: 'linear',
      base: 0,
      coefficients: { 力量: 12, 体质: 20, 敏捷: 5 },
      min: 0,
      max: null
    })
    // 战斗属性系数已被矩阵清空（常数项保留）
    expect(config.derived_formulas['暴击率']).toEqual({ type: 'linear', base: 5, coefficients: {}, min: 0, max: 100 })
    expect(config.calculation_order).toHaveLength(17)
    expect(config.calculation_order.indexOf('力量')).toBeLessThan(config.calculation_order.indexOf('HP'))
    expect(config.attribute_constraints['暴击率']).toEqual({ min: 0, max: 100 })

    // 非法系统（悬空依赖）：主进程拒绝导出并给出中文错误
    const message = await window.evaluate(async (path) => {
      const api = (
        globalThis as unknown as {
          mbApi: { attrSystem: { exportGameConfig: (req: { path: string; system: unknown }) => Promise<unknown> } }
        }
      ).mbApi
      try {
        await api.attrSystem.exportGameConfig({
          path,
          system: {
            attributes: {
              A: {
                name: 'A',
                type: 'derived',
                category: '派生属性',
                displayName: 'A',
                minValue: 0,
                maxValue: null,
                defaultValue: 0,
                formula: { coefficients: { 不存在: 2 }, baseValue: 0 }
              }
            }
          }
        })
        return 'no-error'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }, join(fixtureDir, 'invalid.json'))
    expect(message).toContain('依赖了不存在的属性')

    // UI 入口就绪（保存对话框部分以 IPC 覆盖）
    await expect(window.getByTestId('attr-export-game')).toBeEnabled()
  } finally {
    await app.close()
  }
})