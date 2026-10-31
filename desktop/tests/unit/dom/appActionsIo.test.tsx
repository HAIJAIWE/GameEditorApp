// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ImportPreview } from '../../../src/shared/types'
import {
  engineExport,
  exportExcel,
  exportJson,
  exportSnapshot,
  importCsv,
  importJson,
  redo,
  setAppIoPort,
  undo
} from '../../../src/renderer/src/plugins/context'
import { installMbApi } from './render'

const PREVIEW: ImportPreview = {
  kind: 'csv',
  filePath: 'D:/tmp/a.csv',
  totalRows: 2,
  createCount: 2,
  updateCount: 0,
  unchangedCount: 0,
  skipped: 0,
  byType: {},
  records: [],
  truncated: false,
  unknownTypes: {},
  missingIdSources: []
}

let api: ReturnType<typeof installMbApi> | null = null

afterEach(() => {
  api?.restore()
  api = null
  setAppIoPort(null)
  vi.restoreAllMocks()
  localStorage.clear()
})

/** 端口桩：文件 I/O 只通过端口报结果（提示 / 报错 / 刷撤销 / 开预览 / 撤销重做） */
function installPort() {
  const notices: Array<string | null> = []
  const errors: Array<string | null> = []
  const previews: ImportPreview[] = []
  let refreshed = 0
  let undone = 0
  let redone = 0
  setAppIoPort({
    notify: (message) => notices.push(message),
    error: (message) => errors.push(message),
    refreshUndo: () => {
      refreshed += 1
    },
    openPreview: (payload) => previews.push(payload.preview),
    undo: async () => {
      undone += 1
    },
    redo: async () => {
      redone += 1
    }
  })
  return { notices, errors, previews, refreshed: () => refreshed, undone: () => undone, redone: () => redone }
}

describe('文件 I/O 动作（Slice 8e：从 hook 搬进模块 + 端口注入）', () => {
  it('导入 JSON：成功后写提示并刷新撤销', async () => {
    const port = installPort()
    api = installMbApi({
      overrides: {
        'dialog.chooseJsonFile': () => ({ path: 'D:/tmp/data.json' }),
        'data.importLegacy': () => ({
          imported: 3,
          updated: 0,
          skipped: 0,
          unknownTypes: {},
          missingIdSources: []
        })
      }
    })

    await importJson()

    expect(port.notices[port.notices.length - 1]).toContain('新增 3 条')
    expect(port.refreshed()).toBe(1)
  })

  it('导入 JSON：用户取消选文件 → 不写提示、不刷撤销', async () => {
    const port = installPort()
    api = installMbApi({ overrides: { 'dialog.chooseJsonFile': () => ({ path: null }) } })

    await importJson()

    expect(port.notices).toEqual([null])
    expect(port.refreshed()).toBe(0)
  })

  it('导出 JSON：提示里带条数与路径', async () => {
    const port = installPort()
    api = installMbApi({
      overrides: {
        'dialog.chooseSaveJsonFile': () => ({ path: 'D:/tmp/out.json' }),
        'data.exportLegacy': () => ({ totalItems: 7, filePath: 'D:/tmp/out.json' })
      }
    })

    await exportJson()

    expect(port.notices[port.notices.length - 1]).toBe('已导出 7 条数据：D:/tmp/out.json')
  })

  it('导入 CSV：只开预览，不直接落库', async () => {
    const port = installPort()
    api = installMbApi({
      overrides: {
        'dialog.chooseCsvFile': () => ({ path: 'D:/tmp/a.csv' }),
        'data.previewImport': () => ({ previewId: 'p1', preview: PREVIEW })
      }
    })

    await importCsv()

    expect(port.previews).toHaveLength(1)
    expect(port.previews[0]?.filePath).toBe('D:/tmp/a.csv')
  })

  it('导出 Excel：目录取消时不提示', async () => {
    const port = installPort()
    api = installMbApi({ overrides: { 'dialog.chooseExportDir': () => ({ path: null }) } })

    await exportExcel()

    expect(port.notices).toEqual([null])
  })

  it('引擎导出：走引擎专用选择器与导出通道，并记住路径', async () => {
    const port = installPort()
    api = installMbApi({
      overrides: {
        'dialog.chooseEngineExportFile': () => ({ path: 'D:/game/GameData.cs' }),
        'engine.exportData': () => ({ filePath: 'D:/game/GameData.cs', engine: 'unity', bytes: 12 })
      }
    })

    await engineExport('unity')

    expect(api.calls).toContain('dialog.chooseEngineExportFile')
    expect(api.calls).toContain('engine.exportData')
    expect(port.notices[port.notices.length - 1]).toBeTruthy()
    expect(localStorage.getItem('mb.engineExport.lastPath.unity')).toBe('D:/game/GameData.cs')
  })

  it('快照导出：格式进文件名与提示', async () => {
    const port = installPort()
    api = installMbApi({
      overrides: {
        'dialog.chooseDataSnapshotFile': () => ({ path: 'D:/tmp/snap.csv' }),
        'data.exportSnapshot': () => ({
          filePath: 'D:/tmp/snap.csv',
          itemCount: 5,
          typeCount: 2,
          bytes: 99
        })
      }
    })

    await exportSnapshot('csv')

    expect(port.notices[port.notices.length - 1]).toContain('CSV')
  })

  it('出错走 error 端口（不吞异常）', async () => {
    const port = installPort()
    api = installMbApi({
      overrides: {
        'dialog.chooseJsonFile': () => {
          throw new Error('磁盘只读')
        }
      }
    })

    await importJson()

    expect(port.errors[port.errors.length - 1]).toContain('磁盘只读')
  })

  it('撤销 / 重做转交给端口（实现仍住在 useUndoRedo）', async () => {
    const port = installPort()
    await undo()
    await redo()
    expect(port.undone()).toBe(1)
    expect(port.redone()).toBe(1)
  })

  it('端口未注入时不抛错（动作照跑，只是没人收提示）', async () => {
    api = installMbApi({
      overrides: {
        'dialog.chooseSaveJsonFile': () => ({ path: 'D:/tmp/out.json' }),
        'data.exportLegacy': () => ({ totalItems: 1, filePath: 'D:/tmp/out.json' })
      }
    })
    await expect(exportJson()).resolves.toBeUndefined()
  })
})
