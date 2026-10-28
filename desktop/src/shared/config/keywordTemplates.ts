/**
 * 关键词模板配置（迁移 旧版 `src/features/advanced:206-306` 的
 * `show_keyword_template_config`），**纯逻辑层，零 React / 零 fs / 零 IPC**。
 *
 * ## 真源与本模块的对应关系
 *
 * | 旧版 | 本模块 |
 * |---|---|
 * | `config/settings:311-523` `_get_default_keyword_templates()` | `DEFAULT_KEYWORD_TEMPLATES`（10 项，逐字照抄） |
 * | `advanced:235` `data_type_combo.addItems([...])` | `KEYWORD_TEMPLATE_TYPE_OPTIONS`（5 项，面板可见的类型） |
 * | `advanced:273` `config.keyword_templates[data_type] = template_text` | `withTemplateText()` +面板「保存」 |
 * | `advanced:279-281` `reset_template()` 读默认 | `defaultTemplateFor()` + 面板「重置默认」 |
 *
 * ## 三个**已核实**的 旧版 事实（不是转述，是逐行读过源码的结论）
 *
 * 1. **默认模板有 10 类，但对话框只暴露 5 类**。
 *    `_get_default_keyword_templates()` 返回 skill/role/monster/equip/talent/item/
 *    task/dialog/story/achievement共 **10** 个键；而 `advanced:235` 的下拉框只加了
 *    `["skill", "role", "monster", "equip", "item"]` **5** 项。
 *    → 本模块**两份都如实保留**：默认表10 项（重置的真相来源）、
 *      `KEYWORD_TEMPLATE_TYPE_OPTIONS` 5 项。
 *      其余 5 类在 旧版 里就是**不可编辑的死数据**，这里也不给它们造入口。
 * 2. **旧版 的「保存」只改内存，不落盘**。`advanced:272-273` 的注释自己都写了
 *    「（可以后续添加保存到文件的功能）」——全仓 grep `keyword_templates` 只有
 *    `settings:185`（内存初始化）与 `advanced:273`（内存赋值），
 *    `KEYWORD_TEMPLATES_FILENAME`（`constants:132`）**被定义了却从无任何写入点**，
 *    且**没有任何读取方**。
 *    → TS侧改为**真的落 localStorage**（`mb.keywordTemplates`），这是**修正**不是抄错。
 * 3. **旧版 的「重置默认」只回填文本框、不保存**，用户还得再点一次「保存」才生效。
 *    → 本模块保留这个语义（`defaultTemplateFor()` 是纯取值，不写状态），
 *      面板上如实写明「重置后需点保存才生效」，避免用户以为已经还原了。
 *
 * ## 存储口径（本模块**不碰** storage）
 *
 * 本模块只收发**一个 JSON 字符串**，存储调用交由调用方（面板用既有
 * `settingsStore.ts` 的 `readJsonSetting`/`writeJsonSetting`）。
 * 这样纯逻辑能在 Node 下直接单测，也避免 shared 反向依赖具体存储实现。
 */

/** 面板可编辑的数据类型（严格对齐 `advanced:235` 的 5 项，顺序一致） */
export const KEYWORD_TEMPLATE_TYPE_OPTIONS = [
  { value: 'skill', label: '技能' },
  { value: 'role', label: '角色' },
  { value: 'monster', label: '怪物' },
  { value: 'equip', label: '装备' },
  { value: 'item', label: '道具' }
] as const

/** 可编辑类型的 id 联合（由上面的选项派生，避免两处手写漂移） */
export type KeywordTemplateType = (typeof KEYWORD_TEMPLATE_TYPE_OPTIONS)[number]['value']

/** 全部默认模板的键（10 类，比可编辑的 5 类多——见文件头第1 条） */
export type KeywordTemplateKind = KeywordTemplateType | 'talent' | 'task' | 'dialog' | 'story' | 'achievement'

/** 模板表：类型 id → 提示词全文 */
export type KeywordTemplates = Partial<Record<KeywordTemplateKind, string>>

/**
 * localStorage 键（`settingsStore.ts` 的 `mb.` 命名空间）。
 *
 * ⚠️ **需主理人接线**：在 `settingsStore.ts` 的 `SETTINGS_KEYS` 里补一行
 * `keywordTemplates: 'mb.keywordTemplates'`，否则「导出全部设置 / 重置全部设置」
 * （`exportSettings`/`resetAllSettings`）不会覆盖这个键。
 * 本模块**刻意不 import `settingsStore.ts`**，也不自己声明 `StorageLike`——
 * 键名以常量形式导出，登记与否由主理人决定，此处不产生耦合。
 */
export const KEYWORD_TEMPLATES_SETTING_KEY = 'mb.keywordTemplates'

/**
 * 默认关键词模板 —— 逐字照抄 `config/settings:314-522`
 * 的 `_get_default_keyword_templates()` 返回值（10 类）。
 *
 * 变量名（`{name}` / `{hp}` / `{tags}` …）与 JSON 字段名对齐，是 旧版 侧的既有约定，
 * 本模块**原样保留**（不做变量名校验，也不重命名）。
 *
 * ⚠️ 这些字符串是**提示词正文**，会被直接送进大模型上下文；改动会改变 AI 生成结果，
 * 故此处不做任何「顺手优化」。
 */
export const DEFAULT_KEYWORD_TEMPLATES: Readonly<Record<KeywordTemplateKind, string>> = {
  skill: `你是顶级游戏技能文案专家。请基于以下数据生成技能描述：

【技能数据】
- 名称(name): {name}
- 类型(type): {type}
- 基础数值(value): {value}
- 伤害类型(damage_type): {damage_type}
- 倍率(multiplier): {multiplier}
- 冷却(cd): {cd}秒
- 目标(target): {target}
- 消耗类型(consume): {consume}
- 效果(effect): {effect}
- 分类(category): {category}
- 标签(tags): {tags}

【输出要求】
1. 技能的详细描述（150-250字，必须包含数值和效果的具体说明）
2. 使用时的视觉特效描写（30-50字）
3. 技能在战斗中的战术定位（20-30字）
4. 不要重复输入数据中的字段值，要用自然语言融合表达
语言风格：生动、有画面感，符合游戏设定。`,
  role: `你是顶级游戏角色设计师。请基于以下数据生成角色介绍：

【角色数据】
- 名称(name): {name}
- 职业(job): {job}
- 种族(race): {race}
- 势力(faction): {faction}
- 生命(hp): {hp}
- 法力(mp): {mp}
- 攻击(atk): {atk}
- 防御(def): {def}
- 定位(category): {category}
- 技能列表(skills): {skills}
- 标签(tags): {tags}

【输出要求】
1. 角色的背景故事（250-400字，必须有冲突或成长弧线）
2. 性格特点和行为习惯（3-5个要点）
3. 外貌特征描写（80-120字，包括标志性外貌细节）
4. 角色在团队中的定位和战术价值（50-80字）
5. 携带技能的描写和战斗风格分析（40-60字，将skills转化为自然语言描述）
6. 不要平铺属性列表，要通过故事展现角色特点
语言风格：有深度、有情感，符合角色扮演游戏设定。`,
  monster: `你是顶级游戏怪物设计师。请基于以下数据生成怪物设定：

【怪物数据】
- 名称(name): {name}
- 等级(level): {level}
- 类型(type): {type}
- 分类(category): {category}
- 难度(difficulty): {difficulty}
- 行为(behavior): {behavior}
- 生命(hp): {hp}
- 攻击(atk): {atk}
- 防御(def): {def}
- 经验(exp): {exp}
- 装备掉落(equip_drops): {equip_drops}
- 道具掉落(item_drops): {item_drops}
- 标签(tags): {tags}

【输出要求】
1. 怪物的外观详细描写（150-200字，包括体型、颜色、关键特征）
2. 怪物的生态来源和传说背景（100-150字）
3. 怪物的核心战斗机制和特殊技能（80-120字，不要只列数值）
4. 怪物的栖息环境和出现条件（40-60字）
5. 掉落物品的描述性说明（将equip_drops和item_drops转化为自然语言，30-50字）
6. 击败怪物的战术建议（30-50字）
7. 不要直接复制属性数字，要用描述性语言体现强弱
语言风格：有冲击力、有恐怖感或史诗感，突出怪物特点。`,
  equip: `你是顶级游戏装备设计师。请基于以下数据生成装备介绍：

【装备数据】
- 名称(name): {name}
- 部位(part): {part}
- 稀有度(rare): {rare}
- 适用职业(job): {job}
- 效果(effect): {effect}
- 分类(category): {category}
- 数值(value): {value}
- 标签(tags): {tags}

【输出要求】
1. 装备的外观详细描述（材质、造型、特殊光泽/纹路，80-120字）
2. 装备的背景故事和来源传说（100-150字）
3. 装备效果和属性的自然语言说明（60-100字，不要说"+XX点XX"）
4. 装备的稀有度表现（为什么它是这个稀有度，30-50字）
5. 装备佩戴时的视觉效果（20-30字）
6. 描述要有质感、有价值感，传说装备要有史诗感
语言风格：有质感、有价值感，根据稀有度调整措辞。`,
  talent: `你是顶级游戏天赋设计师。请基于以下数据生成天赋描述：

【天赋数据】
- 名称(name): {name}
- 归属角色(owner): {owner}
- 类型(type): {type}
- 等级(level): {level}
- 稀有度(rarity): {rarity}
- 效果类型(effect_type): {effect_type}
- 数值(value): {value}
- 解锁条件(unlock_condition): {unlock_condition}
- 分类(category): {category}
- 标签(tags): {tags}

【输出要求】
1. 天赋的效果详细描述（80-120字，用具体百分比或数值说明影响）
2. 天赋的获得方式和背景故事（60-100字）
3. 天赋在战斗/探索中的实际表现（40-60字）
4. 与其它天赋的协同效果（30-50字，如适用）
5. 不要写成技能描述，天赋强调的是"被动特性"或"常驻效果"
语言风格：专业、有深度，突出天赋的独特性和稀有感。`,
  item: `你是顶级游戏道具设计师。请基于以下数据生成道具介绍：

【道具数据】
- 名称(name): {name}
- 类型(type): {type}
- 稀有度(rare): {rare}
- 效果(effect): {effect}
- 分类(category): {category}
- 数值(value): {value}
- 标签(tags): {tags}

【输出要求】
1. 道具的外观描写（材质、颜色、形状，40-60字）
2. 道具的来源和背景（40-60字）
3. 道具效果的详细说明和使用方式（60-100字）
4. 使用限制和注意事项（20-40字）
5. 道具的市场价值和稀有度说明（20-30字）
6. 消耗品要强调使用时的感官体验
语言风格：简洁实用，突出道具的价值和特点。`,
  task: `你是顶级游戏任务设计师。请基于以下数据生成任务描述：

【任务数据】
- 名称(name): {name}
- 类型(type): {type}
- 难度(difficulty): {difficulty}
- 等级(level): {level}
- 奖励(reward): {reward}
- 分类(category): {category}
- 标签(tags): {tags}

【输出要求】
1. 任务的剧情背景和触发场景（80-120字）
2. 任务目标和完成流程描述（60-100字，分步骤说明）
3. 任务中的关键NPC和互动细节（40-60字）
4. 奖励的描述性说明（不要说"奖励=XXX"，要用叙事方式）
5. 任务失败或替代方案（20-30字，如适用）
6. 突出任务的叙事驱动，让玩家有情感投入的欲望
语言风格：引导性强，让玩家有探索和完成的欲望。`,
  dialog: `你是顶级游戏对话编剧。请基于以下数据润色对话内容：

【对话数据】
- 名称(name): {name}
- 说话者(speaker): {speaker}
- 内容(content): {content}
- 选项(options): {options}
- 触发条件(condition): {condition}
- 标签(tags): {tags}

【输出要求】
1. 根据说话者身份优化对话语气和措辞（保留原意）
2. 为对话添加语气词和动作描述（用括号标注，如（压低声音）、（握紧拳头））
3. 对话选项要有差异化后果的暗示
4. 保持对话长度适中，单条不超过100字
5. 不同说话者要有明显的语气区分
语言风格：根据角色性格定制，战士豪迈、法师文雅、商人圆滑、贵族傲慢。`,
  story: `你是顶级游戏剧情设计师。请基于以下数据生成剧情描述：

【剧情数据】
- 名称(name): {name}
- 类型(type): {type}
- 章节顺序(order): {order}
- 场景(scene): {scene}
- 内容(content): {content}
- 前置剧情(prev_story): {prev_story}
- 后续剧情(next_story): {next_story}
- 分支(branches): {branches}
- 解锁条件(condition): {condition}
- 标签(tags): {tags}

【输出要求】
1. 剧情的完整叙事描述（200-300字，包括场景氛围、角色情绪、关键事件）
2. 剧情转折点和情感高潮的描写（60-80字）
3. 分支选项的后果暗示（每个分支20-30字）
4. 与前后章节的叙事衔接说明（30-50字）
5. 不要写游戏攻略式的流程说明，要写出文学性的叙事体验
语言风格：文学性强，有电影镜头感，能调动玩家情绪。`,
  achievement: `你是顶级游戏成就设计师。请基于以下数据生成成就展示文案：

【成就数据】
- 名称(name): {name}
- 达成条件(condition): {condition}
- 奖励(reward): {reward}

【输出要求】
1. 成就的展示文案（20-30字，有纪念意义或幽默感）
2. 成就解锁时的弹出提示文案（10-15字）
3. 成就的背景含义（为什么这个行为值得被纪念，30-40字）
4. 不要直接重复达成条件，要转化为有成就感的口号式表达
语言风格：有仪式感、有纪念意义，让玩家觉得"这值得炫耀"。`
}

/** 模板类型 id → 中文标签（面板下拉用；未知 id 回落到 id 本身，不留空白项） */
const TYPE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  KEYWORD_TEMPLATE_TYPE_OPTIONS.map((option) => [option.value, option.label])
)

/** 取某个类型的中文标签 */
export function keywordTemplateTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

/** 某一类的默认模板全文；未知类型返回空串（对齐 `templates.get(data_type, "")`） */
export function defaultTemplateFor(type: string): string {
  const record = DEFAULT_KEYWORD_TEMPLATES as Readonly<Record<string, string>>
  return record[type] ?? ''
}

/** 是否是「默认模板里存在」的类型（面板据此决定重置按钮是否可用） */
export function isKnownTemplateKind(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_KEYWORD_TEMPLATES, type)
}

/** 解析一份已落盘的 JSON 字符串为模板表。**任何异常都回落默认值**（不抛） */
export function parseKeywordTemplates(raw: string | null): KeywordTemplates {
  const defaults: KeywordTemplates = { ...DEFAULT_KEYWORD_TEMPLATES }
  if (raw === null || raw === '') {
    return defaults
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaults
  }
  //逐个字段挑出来：只接受字符串值，缺字段/坏类型都回落到默认，避免半个坏数据把模板清空
  const result: KeywordTemplates = { ...defaults }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key as KeywordTemplateKind] = value
    }
  }
  return result
}

/** 把模板表序列化为落盘用的 JSON 字符串（键排序，保证同一状态落盘结果稳定可比对） */
export function serializeKeywordTemplates(templates: KeywordTemplates): string {
  const source = templates as Readonly<Record<string, unknown>>
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(source).sort()) {
    const value = source[key]
    if (typeof value === 'string') {
      sorted[key] = value
    }
  }
  return JSON.stringify(sorted)
}

/** 取某类型当前生效的模板文本（无记录 → 默认模板；都没有 → 空串） */
export function templateTextFor(templates: KeywordTemplates, type: string): string {
  const saved = (templates as Readonly<Record<string, string | undefined>>)[type]
  return typeof saved === 'string' ? saved : defaultTemplateFor(type)
}

/**
 * 返回「把某类型的模板改成text 后的新表」（**纯函数，不改入参**）。
 * 对齐 `advanced:273` 的 `config.keyword_templates[data_type] = template_text`。
 */
export function withTemplateText(templates: KeywordTemplates, type: string, text: string): KeywordTemplates {
  return { ...templates, [type]: text }
}

/** 模板是否被用户改过（与默认模板不一致；空串与「无记录」都算改过） */
export function isTemplateEdited(templates: KeywordTemplates, type: string): boolean {
  return templateTextFor(templates, type) !== defaultTemplateFor(type)
}