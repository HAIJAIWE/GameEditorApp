import { TECH_DOC_SECTIONS } from './techDocSchema'

/**
 * TDD **按节 AI 生成**的提示词构造器（2026-11-10）。
 *
 * 背景：渲染层（TechDocPanel）把 AI 生成的一段 markdown **正文**直接塞进文档对应小节，
 * 所以提示词必须同时解决两件实测事故：
 *   1. 模型不知道要写多长 ⇒ 只写三四行空话。这里写死长度下限（本仓反复踩过）。
 *   2. 模型习惯输出「好的，以下是……## 标题」或整段 JSON ⇒ 塞进文档后出现重复标题 / 脏 JSON。
 *      这里给出显式输出契约（只输出正文、用 `### ` 分块）。
 *
 * 纯函数、零 IO：同样的入参永远产出同一段提示词，便于单测与回放。
 */

/** 单条 GDD 素材：label = 字段名，chapter = 来源章（策划书小节名），value = 已填内容 */
export interface TechDocSectionMaterials {
  label: string
  chapter: string
  value: string
}

/** 构造「生成某一节」提示词的入参 */
export interface TechDocSectionPromptInput {
  gameName: string
  sectionId: string
  materials: readonly TechDocSectionMaterials[]
  /** 已写完的其它节：用来做交叉引用与去重 */
  written?: readonly { title: string; body: string }[]
  /** 用户在界面上补的额外要求（可为空） */
  extra?: string
}

/**
 * 本节生成所用的角色设定（作为 system prompt）。
 *
 * 刻意写成「施工图工程师」而不是「写作助手」：外测显示称呼一变成「作家 / 助手」，
 * 模型就回去复述 GDD 的设计描述（GDD=what、TDD=how，复述等于这一节没写）。
 * 每句都对应一条可验收的行为，避免「专业 / 严谨」这类无法落地的形容词。
 */
export const TECH_DOC_ENGINEER_PERSONA: string = [
  '你是资深技术设计工程师，负责把项目的策划书（GDD）翻译成技术设计文档（TDD）里可直接施工的实现规格。',
  '策划书是既定事实：它描述「要什么」，你只回答「怎么实现」，不得改写、扩写或复述其中的设计描述。',
  '你写的每一段都要能让工程师直接照着开写代码：给出数据结构与字段类型、函数/接口签名、错误码、边界条件与性能预算。',
  '宁可写具体到字段名和函数名一级，也不要写「做好优化」「保证稳定」这类无法验收的空话。',
  '与策划书冲突、或策划书没有交代的实现细节，不要编造，用「待确认：<具体问题>」显式标出。',
  '只输出被要求的那一节正文，不输出文档标题、目录、前言或其它章节。'
].join('\n')

/** 素材为空时的兜底提示（要能独立成立，因为整节可能真的没有 GDD 内容可参考） */
const NO_MATERIALS_HINT = '本节暂无 GDD 素材，请按工程常识给出最小可行设计，并在开头标注待确认项。'

/** 非标准章节的通用指引：宁可给出通用规格，也不要让一次误传把整节生成打挂 */
const UNKNOWN_SECTION_GUIDANCE =
  '（该节不在标准 9 节之内）按工程常识给出可执行的实现规格，缺信息处用「待确认」标出。'

/** 空游戏名时的占位，避免 prompt 里出现「游戏名：」这种半句话 */
const FALLBACK_GAME_NAME = '（未命名项目）'

/** 二级标题行（用于界定本节正文的结束位置；`### ` 三级小标题不算边界） */
const NEXT_LEVEL_TWO_HEADING = /^\s*##\s/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 按 Unicode 码点计字数：中文按字计，与「不少于 N 字」的口径一致 */
function countChars(text: string): number {
  return [...text.trim()].length
}

/** 把 sectionId 解析成标题 + 写作指引；不在标准 9 节里时用 id 兜底 */
function resolveSection(sectionId: string): { title: string; guidance: string } {
  const id = sectionId.trim()
  if (id === '') throw new Error('buildTechDocSectionPrompt：sectionId 不能为空')
  const standard = TECH_DOC_SECTIONS.find((section) => section.id === id)
  if (standard !== undefined) return { title: standard.title, guidance: standard.guidance }
  return { title: id, guidance: UNKNOWN_SECTION_GUIDANCE }
}

/** 渲染 GDD 素材：逐条一行，值是多行时压成一行（否则 markdown 列表项会被折断） */
function renderMaterials(materials: readonly TechDocSectionMaterials[]): string {
  const header = '## GDD 素材（策划书里与本节相关的已填内容）'
  if (materials.length === 0) return `${header}\n${NO_MATERIALS_HINT}`
  const lines: string[] = [header]
  for (const item of materials) {
    const label = item.label.trim() === '' ? '未命名字段' : item.label.trim()
    const chapter = item.chapter.trim() === '' ? '未知来源' : item.chapter.trim()
    const value = item.value.trim().replace(/\s*\r?\n\s*/g, ' ')
    if (value === '') continue
    lines.push(`- **${label}**（来自 ${chapter}）：${value}`)
  }
  return lines.join('\n')
}

/** 已写完的其它节：只给标题与体量，让模型交叉引用而不是重复展开 */
function renderWritten(
  written: readonly { title: string; body: string }[],
  currentTitle: string
): string {
  const entries = written.filter((item) => {
    const title = item.title.trim()
    return title !== '' && title !== currentTitle
  })
  if (entries.length === 0) {
    return '## 已写完的其它节\n（其它节尚未写入：本节可独立成立，不必做交叉引用。）'
  }
  const lines: string[] = ['## 已写完的其它节（只引用它们的标题，不要重复展开它们已写过的内容）']
  for (const item of entries) lines.push(`- ${item.title.trim()}（已写 ${countChars(item.body)} 字）`)
  return lines.join('\n')
}

/**
 * 长度下限块。
 *
 * 这是本项目「AI 生成内容过少」的直接对策：不给数字，模型按「一段话」写 3 行；
 * 给了数字且说明不能凑字数，才会被迫补字段 / 接口一级的细节。
 */
const LENGTH_CONTRACT: string = [
  '## 长度下限（硬性，不达标视为未完成）',
  '- 每个二级小节不少于 120 字，本节全文不少于 600 字。',
  '- 口径说明：这里的「二级小节」指正文里的每个 `### ` 三级小标题块（文档层是 `## 节` → `### 小节` 两级）。',
  '- 宁可写具体到字段 / 函数签名 / 错误码一级，也不要写空话凑字数；凑数的段落直接删掉。'
].join('\n')

/**
 * 输出契约块。
 *
 * 渲染层把这段回复当**正文**原样拼进 `## <节标题>` 之下，所以这里必须禁止三件事：
 * 自报节标题（会出现两个标题）、整段 JSON（面板是 markdown 渲染）、用围栏包全文（正文变代码块）。
 */
function renderOutputContract(title: string): string {
  return [
    '## 输出契约（必须遵守）',
    `- 只输出本节 markdown 正文：不要重写节标题（即不要输出字面的「## ${title}」），也不要写其它节的标题。`,
    '- 用 `### ` 三级小标题把正文分块，每块讲一件实现上的事（一个数据结构、一组接口、一条流程）。',
    '- 不要输出整段 JSON，也不要「好的，以下是……」这类开场白；需要结构化数据时用 markdown 表格或代码小块。',
    '- 只有具体的代码 / JSON 片段才用代码围栏（三个反引号），不要用围栏把整篇正文包起来。'
  ].join('\n')
}

/**
 * 构造某一节的生成请求。
 *
 * 返回 `{ system, prompt }`：system 恒为 `TECH_DOC_ENGINEER_PERSONA`，
 * prompt 按「项目 → 写作指引 → GDD 素材 → 已写完的其它节 → 长度下限 → 输出契约 → 额外要求」排列。
 * 顺序是有讲究的：素材与指引必须在长度契约之前，否则模型会盯着字数写废话而不是盯着素材写规格。
 */
export function buildTechDocSectionPrompt(
  input: TechDocSectionPromptInput
): { system: string; prompt: string } {
  const { title, guidance } = resolveSection(input.sectionId)
  const gameName = input.gameName.trim() === '' ? FALLBACK_GAME_NAME : input.gameName.trim()
  // 只有「有内容」的素材才算素材：全空列表要和空列表一样走兜底提示，
  // 否则 prompt 里会出现一串「- **引擎**（来自 技术规格）：」的空条目。
  const materials = input.materials.filter((item) => item.value.trim() !== '')
  const blocks: string[] = [
    `## 项目\n游戏名：${gameName}\n本节：${title}`,
    `## 本节写作指引\n${guidance}`,
    renderMaterials(materials),
    renderWritten(input.written ?? [], title),
    LENGTH_CONTRACT,
    renderOutputContract(title)
  ]
  const extra = (input.extra ?? '').trim()
  if (extra !== '') blocks.push(`## 额外要求\n${extra}`)
  return { system: TECH_DOC_ENGINEER_PERSONA, prompt: blocks.join('\n\n') }
}

/**
 * 清理模型输出里最常见的三种脏东西（2026-11-10 实测：分节生成时它们会把文档写坏）。
 *
 * 1. **整篇围栏**：模型把整段正文包在围栏里 ⇒ 正文会变成代码块；
 * 2. **自报节标题**：模型回「## 架构总览」再写正文 ⇒ 拼进标题之下会变成两个同名标题；
 * 3. **开场白**：回「好的，以下是……」，这一段会被当成正文第一段渲染。
 *
 * 只做确定性剥离，不做语义改写：剥不掉的东西宁可留着（人也看得见），不要静默删掉正文。
 */
const DOCUMENT_FENCE_LANGS = new Set(['', 'markdown', 'md', 'mdx'])

export function sanitizeSectionBody(content: string, sectionTitle: string): string {
  let body = content.trim()
  if (body === '') return ''

  // 整篇围栏：首行是围栏开头（可带语言标记）、末行是收尾围栏时只剥一层
  const fenced = /^```([^\n]*)\n([\s\S]*)\n```$/u.exec(body)
  if (fenced !== null) {
    const lang = (fenced[1] ?? '').trim().toLowerCase()
    const inner = (fenced[2] ?? '').trim()
    // 只剥「包住整篇正文」的围栏：语言标记为空 / markdown / md，且围栏内不是另一个代码块。
    // 标记是 json / ts 这类时，那是正文里的一个代码片段 —— 剥掉会把正文变成裸 JSON。
    if (DOCUMENT_FENCE_LANGS.has(lang) && !inner.startsWith('```')) body = inner
  }

  // 自报节标题：允许序号前缀（「## 2. 架构总览」也算），只要整行就是一个标题
  const title = sectionTitle.trim()
  if (title !== '') {
    const heading = new RegExp('^#{1,2}\\s+(?:\\d+[.、]\\s*)?' + escapeRegExp(title) + '\\s*#*\\s*$', 'u')
    const lines = body.split(/\r?\n/)
    let index = 0
    while (index < lines.length && (lines[index] ?? '').trim() === '') index++
    if (index < lines.length && heading.test((lines[index] ?? '').trim())) {
      body = lines.slice(index + 1).join('\n').trim()
    }
  }

  // 开场白：只在第一行是**短客套句**时剥。
  // 限制行长与「不以标题开头」是刻意的：正文里正常出现的「以下是三层说明。」不该被删。
  const opener = /^(好的[，,：:]|以下是|下面是|当然[，,]|没问题[，,])/u
  const firstLine = (body.split(/\r?\n/, 1)[0] ?? '').trim()
  if (firstLine.length <= 40 && !firstLine.startsWith('#') && opener.test(firstLine)) {
    body = body.split(/\r?\n/).slice(1).join('\n').trim()
  }
  return body.trim()
}

/**
 * 把 TDD 文档里某一节的正文替换成 `body`（纯函数，返回新字符串）。
 *
 * 语义：找到 `## <sectionTitle>` 标题行，把「该标题之后、下一个二级标题（或文末）之前」的内容整段换掉。
 * 这个区间里可能夹着草稿留下的 `> ` 引用行（旧指引），它们属于正文，一并替换——
 * 否则生成的正文后面会拖着旧指引，渲染出来像两段互斥的说明。
 * 找不到该标题行时**追加到文末**（并补上 `## sectionTitle`），让「给还没写的节生成」也能落盘。
 */
export function replaceTechDocSection(markdown: string, sectionTitle: string, body: string): string {
  const title = sectionTitle.trim()
  if (title === '') throw new Error('replaceTechDocSection：sectionTitle 不能为空')
  // 保留原文换行风格：Windows 上落盘的 .md 是 CRLF，混进 LF 会让 git diff 整片变色
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(eol)
  // 允许序号前缀：`techDocOutline()` 产出的标题是「## 2. 架构总览」，
  // 只按 section.title 匹配会把每一节都当成「找不到」而追加到文末（文档里出现两份同节）。
  const headingPattern = new RegExp(`^\\s*##\\s+(?:\\d+[.、]\\s*)?${escapeRegExp(title)}\\s*(?:#+\\s*)?$`)
  const start = lines.findIndex((line) => headingPattern.test(line))
  const normalizedBody = body.trim()
  const bodyLines = normalizedBody === '' ? [] : normalizedBody.split(/\r?\n/)

  if (start === -1) {
    const base = markdown.trimEnd()
    const appended =
      bodyLines.length === 0
        ? `## ${title}`
        : `## ${title}${eol}${eol}${bodyLines.join(eol)}`
    return base === '' ? appended : `${base}${eol}${eol}${appended}`
  }

  const headingLine = lines[start] ?? `## ${title}`
  const nextHeading = lines.findIndex(
    (line, index) => index > start && NEXT_LEVEL_TWO_HEADING.test(line)
  )
  const end = nextHeading === -1 ? lines.length : nextHeading
  const block: string[] = [headingLine]
  if (bodyLines.length > 0) block.push('', ...bodyLines)
  // 后面还有下一节时补一个空行，保持「标题 → 空行 → 正文」的既有排版
  if (end < lines.length) block.push('')
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join(eol)
}
