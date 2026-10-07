import { isPlainObject } from './util/guards'

/**
 * 数据条目「数量约束」纯逻辑 —— 对齐 PyQt `ui/data_tab.py::DataEditorTab._check_count_constraint`。
 *
 * PyQt 行为：新建数据条目时先向上找到 MainWindow 的策划书模型，找出 `systems` 里
 * `data_type` 等于当前类型的那个系统；若其 `config` 里写了数量上限字段（`count` /
 * `<data_type>_count` / `max_count` / `total_count`，取第一个可解析为整数者），
 * 且当前条目数**已达**上限，则弹窗提醒（默认「否」= 取消创建）。约束检查本身失败时
 * 一律放行（Python 里 try/except 兜底返回 True），绝不因为解析异常阻断主流程。
 *
 * 分层归属：`shared/` 纯逻辑（无 Electron / DOM 依赖），渲染层据此在「新建」前给出确认，
 * 主进程将来若需要同一语义可直接复用。
 */

/** 上限字段候选顺序（顺序即优先级，与 Python 列表字面量一致） */
export function countLimitFieldNames(dataType: string): string[] {
  return ['count', `${dataType}_count`, 'max_count', 'total_count']
}

export interface CountConstraint {
  /** 策划书 `systems` 里的系统 key */
  key: string
  /** 系统显示名（缺失/空串时回退 key） */
  name: string
  /** 上限（> 0 才生效） */
  limit: number
}

/**
 * 从系统 `config` 解析数量上限。
 *
 * 只认「整数值」或「十进制整数字符串」。任一候选字段非法就**跳过继续试下一个**；
 * 全部失败返回 null。
 *
 * 与 Python 一致：字段优先级、非法值 `continue` 试下一字段、非字符串非数字一律跳过。
 *
 * ⚠️ **4 处有意偏离 Python**（逐例实测对照 `python -c` 确认；已记入 `docs/migration-audit.md`
 * 的「E51 数量约束：对 Python 的有意偏离」小节）：
 * 1. **布尔不算数字** —— Python `isinstance(True, (int, str))` 为真、`int(True) == 1`，
 *    即 `{count: true}` 会得到上限 1；这里显式跳过（上限字段出现布尔值本身就是数据错误）。
 * 2. **字符串只认 `^[+-]?\d+$`** —— Python 的 `int()` 还接受下划线分隔（`'1_0'` → 10）
 *    与全角数字（`'１２'` → 12）；这里一律拒绝。
 * 3. **JS 无法区分 `3` 与 `3.0`** —— Python 中前者是 `int`（生效）、后者是 `float`（跳过）；
 *    而 `JSON.parse('{"count":3.0}')` 在 JS 里就是数字 `3`，故此处按 3 生效。
 *    这是**语言层不可复现**，不是设计选择。
 * 4. **只取第一个 `data_type` 命中的系统**（同 Python 的 `break`），但匹配时对缺失
 *    `data_type` 的系统**回退到系统 key** —— Python 严格用 `v.get("data_type") == data_type`，
 *    缺字段的系统永不约束。这里与 TS `computeEnabledEditors` 的口径（`data_type ?? key`）对齐，
 *    避免「系统已启用、编辑器也显示了，却查不到对应约束」的静默漏判。
 *
 * 以上 1–3 在策划书第五章的字段类型下**都不可达**（上限来自系统 config 表单，只有整数/文本两种形态）；
 * 第 4 条是刻意的口径统一。
 */
export function resolveCountLimit(config: unknown, dataType: string): number | null {
  if (!isPlainObject(config)) return null
  for (const field of countLimitFieldNames(dataType)) {
    const raw = config[field]
    if (typeof raw === 'number') {
      if (!Number.isInteger(raw)) continue
      return raw
    }
    if (typeof raw === 'string') {
      const text = raw.trim()
      // 等价于 Python int(text)：允许正负号与纯数字，其余抛 ValueError 被跳过
      if (!/^[+-]?\d+$/.test(text)) continue
      const value = Number.parseInt(text, 10)
      if (Number.isFinite(value)) return value
    }
  }
  return null
}

/**
 * 找出约束当前数据类型的系统（`systems` = 策划书第五章章节数据）。
 *
 * 与 Python 一致：只返回**第一个** `data_type` 命中的系统（Python 找到即 break），
 * 命中但上限缺失/非法/≤0 时返回 null（= 不约束）。
 *
 * 与 Python 的唯一差异（**刻意**，已记入 `docs/migration-audit.md` 的「E51 数量约束：对 Python
 * 的有意偏离」小节）：Python 严格用 `v.get("data_type") == data_type` 匹配，缺 `data_type`
 * 的系统永不约束；这里回退到系统 key，与 TS `computeEnabledEditors` 的解析口径
 * （`data_type ?? key`）保持一致，避免「系统已启用、编辑器也显示了，却查不到对应约束」的静默漏判。
 */
export function findCountConstraint(systems: unknown, dataType: string): CountConstraint | null {
  if (!isPlainObject(systems) || dataType === '') return null
  for (const [key, value] of Object.entries(systems)) {
    if (!isPlainObject(value)) continue
    const owner = typeof value.data_type === 'string' && value.data_type !== '' ? value.data_type : key
    if (owner !== dataType) continue
    const limit = resolveCountLimit(value.config, dataType)
    if (limit === null || limit <= 0) return null // Python：命中系统但无有效上限 ⇒ 不约束
    const name = typeof value.name === 'string' && value.name !== '' ? value.name : key
    return { key, name, limit }
  }
  return null
}

/** 当前条目数是否已达/超出上限（Python：`current_count < count_limit` 才放行） */
export function exceedsCountConstraint(current: number, constraint: CountConstraint | null): boolean {
  return constraint !== null && current >= constraint.limit
}

/** 超限提示正文（对齐 Python `QMessageBox.question` 文案；确认按钮语义 = 「继续创建」） */
export function buildCountConstraintMessage(constraint: CountConstraint, current: number): string {
  return (
    `策划书「${constraint.name}」规定数量上限为 ${constraint.limit}，\n` +
    `当前已有 ${current} 个，正在创建第 ${current + 1} 个。\n\n` +
    '是否继续？'
  )
}
