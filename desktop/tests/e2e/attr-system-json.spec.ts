import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface AttrJsonProbe {
  sourceCount: number
  exportedPath: string
  roundTripCount: number
  roundTripHpCoefficient: number
  roundTripWarnings: number
  warnedCount: number
  warnedWarnings: number
  warnedType: string
  warnedMin: number
  corruptError: string
  missingError: string
}

test('属性系统 JSON 导入导出：往返一致性 + 异常文件警告 + 面板按钮', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-json-e2e-'))
  const exportPath = join(userDataDir, 'exported_attr.json')
  const warningPath = join(userDataDir, 'attr_warnings.json')
  const corruptPath = join(userDataDir, 'attr_corrupt.json')
  const missingPath = join(userDataDir, 'attr_missing.json')

  writeFileSync(
    warningPath,
    JSON.stringify({
      OK: {
        name: 'OK',
        type: 'base',
        category: '基础',
        display_name: 'OK',
        min_value: 0,
        max_value: 100,
        default_value: 10,
        formula: '= 0'
      },
      坏公式: {
        name: '坏公式',
        type: 'derived',
        min_value: '非数字',
        max_value: null,
        default_value: 0,
        formula: '= 力量*'
      },
      怪类型: { type: 'weird', formula: '= 0' }
    }),
    'utf-8'
  )
  writeFileSync(corruptPath, '{not-json', 'utf-8')

  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const probe = (await window.evaluate(
      async (args: { exportPath: string; warningPath: string; corruptPath: string; missingPath: string }) => {
        interface AttrDef {
          name: string
          type: string
          minValue: number
          formula: { coefficients: Record<string, number>; baseValue: number }
        }
        interface AttrSystemShape {
          attributes: Record<string, AttrDef>
        }
        const api = (
          globalThis as unknown as {
            mbApi: {
              attrSystem: {
                get: () => Promise<AttrSystemShape>
                exportJson: (req: { path: string; system: AttrSystemShape }) => Promise<{ filePath: string }>
                importJson: (req: { path: string }) => Promise<{ system: AttrSystemShape; warnings: string[] }>
              }
            }
          }
        ).mbApi

        const source = await api.attrSystem.get()
        const exported = await api.attrSystem.exportJson({ path: args.exportPath, system: source })
        const roundTrip = await api.attrSystem.importJson({ path: args.exportPath })
        const warned = await api.attrSystem.importJson({ path: args.warningPath })

        let corruptError = ''
        try {
          await api.attrSystem.importJson({ path: args.corruptPath })
        } catch (error) {
          corruptError = error instanceof Error ? error.message : String(error)
        }
        let missingError = ''
        try {
          await api.attrSystem.importJson({ path: args.missingPath })
        } catch (error) {
          missingError = error instanceof Error ? error.message : String(error)
        }

        return {
          sourceCount: Object.keys(source.attributes).length,
          exportedPath: exported.filePath,
          roundTripCount: Object.keys(roundTrip.system.attributes).length,
          roundTripHpCoefficient: roundTrip.system.attributes['HP']?.formula.coefficients['力量'] ?? -1,
          roundTripWarnings: roundTrip.warnings.length,
          warnedCount: Object.keys(warned.system.attributes).length,
          warnedWarnings: warned.warnings.length,
          warnedType: warned.system.attributes['怪类型']?.type ?? '',
          warnedMin: warned.system.attributes['坏公式']?.minValue ?? -1,
          corruptError,
          missingError
        } satisfies AttrJsonProbe
      },
      { exportPath, warningPath, corruptPath, missingPath }
    )) as AttrJsonProbe

    expect(probe.sourceCount).toBe(17)
    expect(probe.exportedPath).toBe(exportPath)
    // 往返一致：17 个属性、HP 力量系数 10、无警告
    expect(probe.roundTripCount).toBe(17)
    expect(probe.roundTripHpCoefficient).toBe(10)
    expect(probe.roundTripWarnings).toBe(0)
    // 异常文件：3 条警告 + 尽力保留 3 个属性 + 缺省修正
    expect(probe.warnedCount).toBe(3)
    expect(probe.warnedWarnings).toBe(3)
    expect(probe.warnedType).toBe('base')
    expect(probe.warnedMin).toBe(0)
    expect(probe.corruptError).toContain('损坏')
    expect(probe.missingError).toContain('读取属性系统文件失败')

    // 磁盘结构：旧版 同构平铺对象 + 中文不转义
    const text = readFileSync(exportPath, 'utf-8')
    const raw = JSON.parse(text) as Record<string, { formula: string }>
    expect(Object.keys(raw)).toHaveLength(17)
    expect(raw['HP']?.formula).toBe('= 力量*10 + 体质*20 + 敏捷*5')
    expect(text).not.toContain('\\u')

    // UI：面板提供「导入 JSON / 导出 JSON」入口（新 IA 无侧栏入口：工具菜单）
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-attrSystem').click()
    await expect(window.getByTestId('attr-system-panel')).toBeVisible()
    await expect(window.getByTestId('attr-import-json')).toBeVisible()
    await expect(window.getByTestId('attr-import-json')).toBeEnabled()
    await expect(window.getByTestId('attr-export-json')).toBeVisible()
    await expect(window.getByTestId('attr-export-json')).toBeEnabled()
  } finally {
    await app.close()
  }
})