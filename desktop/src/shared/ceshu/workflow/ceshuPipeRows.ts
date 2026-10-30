/**
 * 管道行（pipeList）通用解析工具——收敛 ceshu 子系统里散落在 4 个文件、
 * 各自重写的 `row.split('|')` / `toRows` / `EPSILON`。
 *
 * pipeList 是本项目数值 / 账本 / 用例 / 验收旅程等表格字段的存储形态：一个数组，
 * 每个元素是 `列1|列2|列3` 这样的字符串。列位置的约定集中在此处，改一处列结构
 * 不必再同步多处（改造前这些拆分逻辑在 ceshuNumericAssert / ceshuEvidence /
 * ceshuDemoPrompt / ceshuValidation 里各写各的）。
 */
import { type CeshuColumnDef } from '../reference/ceshuConstants'
import { isPlainObject } from '../../util/guards'

/** 浮点比较容差（数值复算、账本对账共用；防病态相等判定） */
export const EPSILON = 1e-9

/** 管道行数组 → 非空字符串数组（过滤非字符串与空串；其余形态返回空数组） */
export function toRows(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
}

/**
 * 管道行数组 → 字符串行，**兼容对象行**（`colKey: 值}` → 按列顺序拼回 `a|b|c`）。
 *
 * 为什么需要它（2026-10-26 修一个静默失效的真 bug）：
 * pipeList 有**两种半**存储形态——无 `columns` 存字符串行，有 `columns` 存对象行。
 * 表单保存遵循该规则，但下游的**校验 / 复算管道**（数值断言、账本、用例、原型验收、
 * 设计主张、Demo 提示词）此前一律用 `toRows`，它只认字符串。于是给 `numeric_assertions`
 * 之类字段补上 `columns`（本该是零风险的展示增强）后，表单写出的对象行在复算里
 * **全部被静默跳过**：不报错、不告警，断言面板看起来「通过」，实则一条都没算。
 *
 * 收口在这一层的理由：形态差异只与字段定义有关，而所有消费方都拿得到 `CeshuFieldDef`；
 * 让每个消费方各自判断形态，就是把「知道列顺序」这件事复制到 6 个地方。
 */
export function toRowStrings(
  value: unknown,
  columns: readonly CeshuColumnDef[] = []
): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (isPlainObject(item)) {
        /*
         * 有列定义 → 按**列顺序**取值（顺序即语义，不能靠对象键序）；
         * 无列定义 → 按对象自身的值顺序拼（老模板/老数据里的对象行，如
         * ` type: '角色', count: 50 }`）。口径与渲染层 `joinPipeList` 逐字一致——
         * 两处不一致会造出「界面显示对了、校验读不到」这种最难查的偏差。
         */
        const values = columns.length > 0 ? columns.map((col) => item[col.key]) : Object.values(item)
        return values.map(scalarText).join(' | ')
      }
      return ''
    })
    .filter((row) => row !== '')
}

/** 单元格值 → 文本（与导出层 `formatScalar` 同口径：null/undefined 为空串，其余 String） */
function scalarText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

/** 单行按 `|` 拆分并 trim */
export function splitRow(row: string): string[] {
  return row.split('|').map((column) => column.trim())
}

/** 取管道行第 N 列（越界返回空串） */
export function column(row: string, index: number): string {
  return (row.split('|')[index] ?? '').trim()
}
