import { useCallback, useMemo, useState } from 'react'

import DataEditorTab from './DataEditorTab'
import type { ReferenceTarget } from './ReferencesPanel'
import type { DataTypeDef } from '../../../shared/types'
import { buildTypeLabelMap } from '../utils/typeLabels'
import { readSetting, writeSetting } from '../../../shared/config/settingsStore'

/**
 * 数据编辑面板（中间窗口「数据编辑」页签）——**纯数据编辑器**的全屏形态。
 *
 * ## 为什么要有这个页签
 * 数据编辑器原本只是策疏视图里可收起的「数据栏」侧面板：按当前策划书启用的
 * 游戏系统出页签，空间逼仄。但「配数据」本身就是重活（14 种类型、成百上千
 * 条条目），把它从策划书里解放出来成为独立页签，与「策划书 / 代码 / 浏览器」
 * 并列——四页签对应四种工作形态：写策划 → 配数据 → 看代码 → 预览。
 *
 * ## 与数据栏的分工
 * - 本面板：**全部数据类型**（不依赖策划书启用了什么），选中即编，直连 SQLite；
 * - 数据栏：策疏上下文里的对照编辑（带数量约束、跳转定位、AI 生成入口）。
 * 两者共用同一个 `DataEditorTab`，不存在两套编辑逻辑。
 */

/** 当前选中类型的持久化键（与 theme/gameStyle 同款的 mb. 命名空间） */
const ACTIVE_TYPE_KEY = 'mb.dataEditorType'

interface DataEditorPanelProps {
  /** 全部数据类型定义（条目表单按 type 取 formFields） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（字段标签术语替换；'' = 原始术语） */
  gameStyle: string
  /** 打开「字段结构编辑器」编辑当前数据类型 */
  onEditType: (typeId: string) => void
  /** 打开「数据关联预览」查看某条目引用关系 */
  onShowReferences: (target: ReferenceTarget) => void
}

export default function DataEditorPanel({
  types,
  gameStyle,
  onEditType,
  onShowReferences
}: DataEditorPanelProps): React.JSX.Element {
  const [activeType, setActiveType] = useState<string>(() => {
    const stored = readSetting(ACTIVE_TYPE_KEY)
    return stored !== null && types.some((t) => t.id === stored) ? stored : (types[0]?.id ?? '')
  })

  const selectType = useCallback((typeId: string): void => {
    setActiveType(typeId)
    writeSetting(ACTIVE_TYPE_KEY, typeId)
  }, [])

  /** 类型清单按 id 排序，保证展示顺序稳定（schema 顺序不保证） */
  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.id.localeCompare(b.id)), [types])

  /** 同名类型消歧义（role/character 都叫「角色」这类旧库遗留；规则见 utils/typeLabels） */
  const typeLabels = useMemo(() => buildTypeLabelMap(sortedTypes), [sortedTypes])

  if (sortedTypes.length === 0) {
    return (
      <div className="data-editor-panel" data-testid="data-editor-panel">
        <div className="data-editor-empty">当前库没有数据类型，请先在「工具 → 类型编辑器」创建</div>
      </div>
    )
  }

  return (
    <div className="data-editor-panel" data-testid="data-editor-panel">
      {/* 左：全部数据类型（不依赖策划书启用状态） */}
      <aside className="data-editor-types" data-testid="data-editor-types">
        <div className="data-editor-types-head">数据类型</div>
        <div className="data-editor-types-body">
          {sortedTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`data-editor-type${activeType === type.id ? ' active' : ''}`}
              title={`${type.name}（${type.id}）`}
              data-testid="data-editor-type"
              onClick={() => selectType(type.id)}
            >
              {typeLabels.get(type.id) ?? type.name}
            </button>
          ))}
        </div>
      </aside>

      {/* 右：当前类型的条目编辑（与策疏数据栏同一个组件） */}
      <section className="data-editor-main">
        {activeType !== '' && (
          <DataEditorTab
            key={activeType}
            type={activeType}
            types={types}
            gameStyle={gameStyle}
            onEditType={onEditType}
            onShowReferences={onShowReferences}
          />
        )}
      </section>
    </div>
  )
}
