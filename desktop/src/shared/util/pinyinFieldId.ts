import { pinyin } from 'pinyin-pro'

import { uniquifyFieldId, type SuggestFieldIdResult } from './fieldId'

/**
 * 中文 → 拼音字段 ID（对齐 旧版 `ui/dialogs/type_editor_field_widget::_chinese_to_pinyin`）。
 *
 * ## 为什么单独一个模块
 * 字段 ID 生成在 旧版 里有**两条独立的路子**，各有自己的按钮：
 * - **英译**（`_auto_translate` → `_translate_game_terms`）：走术语表，`攻击力 → atk`。
 *   TS 侧已由 `shared/fieldId.ts::suggestFieldIds` 承接（且修掉了 旧版 把 ASCII 逐字打碎的缺陷）。
 * - **拼音**（`_auto_pinyin` → `_chinese_to_pinyin`）：走 `pypinyin`，`攻击力 → gong_ji_li`，
 *   **支持任意汉字**（不必在术语表里）。本模块就是补这一条。
 * 两条路都只做「给候选」，不自动覆盖用户已填内容（TS 沿用 `fieldId.ts` 的「只提案不写入」约定）。
 *
 * ## 与 旧版 的一致性
 * `pypinyin.lazy_pinyin(text, style=Style.NORMAL)` → 用 `_` 拼接 → 去除 `[^a-zA-Z0-9_]` →
 * 折叠连续 `_` → 去首尾 `_` → 转小写。本模块用 `pinyin-pro`（`toneType:'none'` 去声调、
 * `nonZh:'consecutive'` 让**连续 ASCII 保持成段**，与 `lazy_pinyin` 对非汉字的行为一致）复现同一口径：
 *
 * | 输入 | 本模块输出 | 说明 |
 * |---|---|---|
 * | `攻击力` | `gong_ji_li` | 逐字取拼音，`_` 连接 |
 * | `斗能` | `dou_neng` | **术语表未收录也能转**（旧版 这里会落 CEDICT 产出 `abbr_surname` 垃圾） |
 * | `hp_max` | `hp_max` | 本就合法的 ID 原样通过（不逐字打碎） |
 * | `HP上限` | `hp_shang_xian` | 与 旧版 `lazy_pinyin` 同（ASCII 段 + 拼音段） |
 * | `生命值%` | `sheng_ming_zhi` | `%` 被清洗掉 |
 *
 * ## 为何不接 CEDICT
 * 旧版 的**英译**在术语表未命中时会回退到 CEDICT 词典 + `jieba` 分词，实测会产出
 * `abbr_surname` / `canada_surname` 这类**看起来像答案的垃圾**。TS 的 `fieldId.ts` 已明确
 * 不接词典、未收录时如实提示；拼音是另一条正交的补救路径（音节确定、可预期），故只补拼音。
 */

/**
 * 把文本转成拼音片段并清洗为**合法 ID 字符**（小写、`_` 连接）。
 *
 * 非汉字部分照常保留（连续 ASCII 成段）；无法转换的空输入返回空串。
 * 注意：本函数**不做**重名规避，也不校验首字符——调用方走 `suggestPinyinFieldId`。
 */
export function chineseToPinyin(text: unknown): string {
  const raw = String(text ?? '').trim()
  if (raw === '') return ''
  const syllables = pinyin(raw, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
  return syllables
    .join('_')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

/**
 * 拼音候选（与 `suggestFieldIds` 同形，便于 UI 统一渲染）。
 *
 * `source` 固定为 `'pinyin'`；`skipped` 恒为空数组（拼音能覆盖任意汉字，不存在「未收录片段」）。
 */
export function suggestPinyinFieldId(
  label: unknown,
  existingNames: readonly string[] = []
): SuggestFieldIdResult {
  const text = String(label ?? '').trim()
  if (text === '') {
    return { suggestions: [], error: '显示名为空，无法生成拼音 ID' }
  }
  const baseId = chineseToPinyin(text)
  if (baseId === '') {
    return {
      suggestions: [],
      error: '无法生成拼音 ID：显示名中没有汉字或字母数字。请手动填写英文 ID。'
    }
  }
  const { id, renamedFrom } = uniquifyFieldId(baseId, existingNames)
  return {
    suggestions: [{ id, source: 'pinyin', skipped: [], renamedFrom }],
    error: null
  }
}
