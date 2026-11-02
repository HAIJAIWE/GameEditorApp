import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import type { CeshuChapters } from '@mobai/shared/ceshu/reference'
import {
  buildRefOverview,
  formatRefValue,
  REF_NOT_FOUND_TEXT,
  type RefOverview
} from '@mobai/shared/domain/ceshu/dataRef'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'

/**
 * 数据引用概览面板。
 *
 * ## 作用
 * 策划书正文里写 `@data[role.atk]` 时，这里列出**全部引用及其当前真实值**，
 * 有效数/总数一目了然；点某条能跳到对应数据表（`onJump`）。
 * 价值：数值改动后能立刻看到引用处的真实数值，不用来回切页核对。
 *
 * ## 与 旧版 的差异（均已在 shared/dataRef.ts 注明）
 * - **TS 能真正解析出值**：旧版 `data_ref:89` 用单数 `type_key` 直查按复数键建的
 *   `data_manager.data` ⇒ `@data[role.atk]` 在 旧版 里恒为「未找到」。TS 侧已修正。
 * - **不搬 `enabled_editors` 动态编辑器那半边**（`preview_panel:141` `refresh()`）：
 *   那是「按启用系统动态渲染真实编辑器」，与本面板的「引用概览」是两件事，
 *   且 TS 侧编辑器布局另有实现（`core/editor_layout` 208 行仍缺，另案处理）。
 *   只做引用概览 ⇒ 范围清晰、消费者明确。
 *
 * ## 组件约定
 * 不接 `onClose`（浮层头部已有统一「关闭」按钮，同 AgentEditorPanel）。
 */
interface CeshuDataRefsPanelProps {
  /** 整本策划书的章节数据（`CeshuDocument` 本身就是 `CeshuChapters` 映射，故直接传 doc） */
  chapters: CeshuChapters | null
  types: readonly DataTypeDef[]
  /**
   * 关闭（Slice 13 起为**内容槽视图**：没有它就回不到编辑器内容区，是个死路）。
   * 省略 = 不画关闭按钮（保留原「只读嵌入」用法）。
   */
  onClose?: () => void
}

/**
 * ## 刻意不做「点击跳转数据表」
 * 旧版 `render_refs_to_html`（`data_ref:138`）把引用渲染成 `data-ref://` 链接、
 * 点击可跳表。TS 侧**没有这条导航通道**：`CeshuView` 自己不持有跳转处理器，
 * 它是**接收**宿主（`App.tsx:159`）传来的 `jumpTarget`。
 * 而同层的 `FieldDepsPanel` 同样没有跳转能力 ⇒ 凭空加一个按钮就是
 * **「点了没反应的按钮」**（项目铁律禁止）。
 * ⇒ 本面板只做**只读概览**。若日后要跳转，需新开一条
 * `panel → 宿主 setJumpTarget` 的接线（独立立项，不在本轮范围）。
 */
export default function CeshuDataRefsPanel({ chapters, types, onClose }: CeshuDataRefsPanelProps) {
  const t = useT()
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.mbApi.data
      .listAll()
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const overview: RefOverview | null =
    items === null ? null : buildRefOverview(chapters, items, types)

  return (
    <div className="editor" data-testid="ceshu-datarefs-panel">
      <div className="editor-header">
        <div className="editor-title">
          {t('dataRefs.title')}
          <small>{t('dataRefs.subtitle')}</small>
        </div>
        {onClose !== undefined && (
          <button type="button" className="btn slim" data-testid="datarefs-close" onClick={onClose}>
            {t('common.close')}
          </button>
        )}
      </div>

      <div className="editor-body">
        {error !== null && <div className="error-banner">{error}</div>}
        {items === null && error === null && <div className="empty">{t('dataRefs.loading')}</div>}

        {overview !== null && overview.total === 0 && (
          <div className="empty" data-testid="datarefs-empty">
            {t('dataRefs.emptyLine1')}
            <br />
            {t('dataRefs.emptyLine2Before')} <code>@data[type_key.field_name]</code>{' '}
            {t('dataRefs.emptyLine2After')}
            <br />
            {t('dataRefs.emptyExample')} <code>@data[role.atk]</code> {t('dataRefs.or')}{' '}
            <code>@data[skill.fireball.damage]</code>
          </div>
        )}

        {overview !== null && overview.total > 0 && (
          <>
            <div className="item-meta" data-testid="datarefs-summary">
              {t('dataRefs.summary', { total: overview.total, resolved: overview.resolved })}
            </div>

            {overview.groups.map((group) => (
              <div className="form-section" key={group.typeKey} data-testid={`datarefs-group-${group.typeKey}`}>
                <strong>
                  {t('dataRefs.groupTitle', { type: group.typeKey, n: group.refs.length })}
                </strong>
                {group.refs.map((ref, i) => (
                  <div
                    className="qc-stat-row"
                    // 引用没有稳定 id，用 fullPath+序号（同一 fullPath 已在 extract 阶段去重）
                    key={`${ref.fullPath}-${i}`}
                    data-testid={`datarefs-row-${group.typeKey}-${i}`}
                  >
                    <span className="qc-stat-name" data-testid={`datarefs-path-${group.typeKey}-${i}`}>
                      {ref.fullPath}
                    </span>
                    {ref.found ? (
                      <span className="qc-stat-value" data-testid={`datarefs-value-${group.typeKey}-${i}`}>
                        {formatRefValue(ref.value)}
                      </span>
                    ) : (
                      <span className="item-meta" data-testid={`datarefs-missing-${group.typeKey}-${i}`}>
                        （{REF_NOT_FOUND_TEXT}）
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
