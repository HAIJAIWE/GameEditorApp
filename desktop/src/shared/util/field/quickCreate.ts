/**
 * 快速创建模板。
 *
 * ## 为什么是纯数据 + 纯函数，且不需要新 IPC
 * 模板是**静态常量**（无主进程状态），渲染层像其它 `shared/*` 常量一样直接 import 即可；
 * 真正落库走**已有的** `data:createItem`（id 由 `DataService.createItem` 用 `randomUUID()` 生成），
 * 所以本模块不引入新通道 —— 避免为静态数据造一条 IPC。
 *
 * ## 与 旧版 的一处**刻意差异**（不是漏迁）
 * 旧版 `QuickCreateDialog._on_create` 里有段死代码：
 * `plural = self.data_manager.config.get_type_schema(); data_type + "s"` —— 拼接结果被丢弃、
 * 后面的 `for` 循环 `break` 也没任何作用。本移植**不复制这个 bug**，落库只做
 * 「生成 id + 拷贝 defaults」，语义与 旧版 实际行为一致。
 *
 * ## 类型键口径
 * 键是**单数** `DataTypeDef.id`（`role`/`skill`/`monster`…），与 `items.type` 存法一致；
 * 不是 pluralKey。
 */

/** 单个快速创建模板 */
export interface QuickCreateTemplate {
  /** 模板名（卡片标题） */
  name: string
  /** 模板说明（卡片副标题） */
  desc: string
  /** 套用后写入条目的默认字段值 */
  defaults: Readonly<Record<string, string>>
}

/** 快速创建模板表：数据类型（单数 id）→ 该类型下的模板列表 */
export const TEMPLATE_DEFS: Readonly<Record<string, readonly QuickCreateTemplate[]>> = {
  role: [
    { name: '战士', desc: '近战物理输出，高生命高防御', defaults: {
      name: '新战士', job: '战士', race: '人类', faction: '联盟', category: '近战输出', mechanism: '' } },
    { name: '法师', desc: '远程魔法输出，高魔攻低防御', defaults: {
      name: '新法师', job: '法师', race: '精灵', faction: '中立', category: '法术输出', mechanism: '' } },
    { name: '刺客', desc: '高暴击高速度，低生命', defaults: {
      name: '新刺客', job: '刺客', race: '亡灵', faction: '邪恶', category: '爆发', mechanism: '' } },
    { name: '牧师', desc: '辅助治疗，中等防御', defaults: {
      name: '新牧师', job: '牧师', race: '人类', faction: '善良', category: '治疗', mechanism: '' } },
    { name: '骑士', desc: '超高防御和生命，可治疗', defaults: {
      name: '新骑士', job: '骑士', race: '人类', faction: '联盟', category: '坦克', mechanism: '' } },
    { name: '全能型', desc: '各项属性均衡，适应多种场景', defaults: {
      name: '冒险者', job: '冒险者', race: '人类', faction: '中立', category: '全能', mechanism: '' } }
  ],
  job: [
    { name: '战士职业', desc: '物理近战职业模板', defaults: {
      name: '战士职业', job_tier: '基础', base_job_from: '无', type: '坦克', difficulty: '简单',
      resource_type: '怒气', growth_type: '血量型' } },
    { name: '法师职业', desc: '魔法远程职业模板', defaults: {
      name: '法师职业', job_tier: '基础', base_job_from: '无', type: '输出', difficulty: '普通',
      resource_type: '法力', growth_type: '法力型' } },
    { name: '牧师职业', desc: '治疗/增益职业模板', defaults: {
      name: '牧师职业', job_tier: '基础', base_job_from: '无', type: '治疗', difficulty: '普通',
      resource_type: '法力', growth_type: '均衡型' } },
    { name: '弓箭手职业', desc: '物理远程职业模板', defaults: {
      name: '弓箭手职业', job_tier: '基础', base_job_from: '无', type: '输出', difficulty: '普通',
      resource_type: '能量', growth_type: '攻击型' } }
  ],
  monster: [
    { name: '普通怪', desc: '基础小怪，低属性', defaults: {
      name: '野猪', level: '1', type: '野兽', category: '普通', difficulty: '简单', behavior: '游荡' } },
    { name: '精英怪', desc: '强化版小怪，中等属性', defaults: {
      name: '狂暴野猪', level: '5', type: '野兽', category: '精英', difficulty: '困难', behavior: '攻击性' } },
    { name: 'Boss', desc: '首领级怪物，高属性多技能', defaults: {
      name: '暗黑领主', level: '10', type: '恶魔', category: 'Boss', difficulty: '首领', behavior: '攻击性' } },
    { name: '召唤物', desc: '由技能召唤的临时单位', defaults: {
      name: '火元素', level: '1', type: '元素', category: '事件怪', difficulty: '简单', behavior: '防御性' } },
    { name: '稀有怪', desc: '特殊稀有怪物，有特殊掉落', defaults: {
      name: '黄金龙', level: '8', type: '龙类', category: '稀有', difficulty: '精英', behavior: '游荡' } }
  ],
  skill: [
    { name: '单体攻击', desc: '对单个目标造成伤害', defaults: {
      name: '斩击', type: '攻击', damage_type: '物理伤害', target: '单体敌人', consume: '无消耗',
      effect: '直接伤害', category: '单体攻击' } },
    { name: '范围攻击', desc: '对多个目标造成伤害', defaults: {
      name: '烈焰风暴', type: '攻击', damage_type: '法术伤害', target: '群体敌人', consume: '法力',
      effect: '直接伤害', category: '群体攻击' } },
    { name: 'Buff技能', desc: '增强己方属性', defaults: {
      name: '铁壁护盾', type: '增益', damage_type: '真伤', target: '全体友方', consume: '法力',
      effect: '护盾', category: '防御增益' } },
    { name: 'Debuff技能', desc: '削弱敌方属性', defaults: {
      name: '寒冰诅咒', type: '减益', damage_type: '真伤', target: '群体敌人', consume: '法力',
      effect: '减速', category: '控制限制' } },
    { name: '被动技能', desc: '永久生效的被动能力', defaults: {
      name: '再生之心', type: '被动', damage_type: '真伤', target: '自身', consume: '无消耗',
      effect: '直接伤害', category: '被动光环' } },
    { name: '治疗技能', desc: '恢复己方生命值', defaults: {
      name: '圣光术', type: '治疗', damage_type: '真伤', target: '单体友方', consume: '法力',
      effect: '直接伤害', category: '单体治疗' } },
    { name: '控制技能', desc: '眩晕/沉默/减速等控制效果', defaults: {
      name: '雷霆一击', type: '控制', damage_type: '真伤', target: '单体敌人', consume: '法力',
      effect: '眩晕', category: '控制限制' } },
    { name: '终极技能', desc: '高消耗强力技能，长冷却', defaults: {
      name: '末日审判', type: '攻击', damage_type: '真伤', target: '所有目标', consume: '生命值',
      effect: '直接伤害', category: '群体攻击' } }
  ],
  equip: [
    { name: '武器', desc: '增加攻击力', defaults: {
      name: '铁剑', part: '武器', rare: '普通', job: '战士', effect: '攻击加成', category: '近战物理' } },
    { name: '防具', desc: '增加防御力', defaults: {
      name: '皮甲', part: '胸甲', rare: '普通', job: '战士', effect: '防御加成', category: '近战物理' } },
    { name: '饰品', desc: '增加特殊属性', defaults: {
      name: '敏捷戒指', part: '戒指', rare: '稀有', job: '所有', effect: '暴击率', category: '远程物理' } },
    { name: '法器', desc: '增加魔法相关属性', defaults: {
      name: '智慧法杖', part: '武器', rare: '史诗', job: '法师', effect: '法力加成', category: '元素魔法' } }
  ],
  item: [
    { name: '回血药', desc: '恢复生命值的消耗品', defaults: {
      name: '红药水', type: '消耗品', rare: '普通', effect: '回血', category: '恢复类', value: '50', buffs: '' } },
    { name: '回蓝药', desc: '恢复法力值的消耗品', defaults: {
      name: '蓝药水', type: '消耗品', rare: '普通', effect: '回蓝', category: '恢复类', value: '30', buffs: '' } },
    { name: '强化石', desc: '强化装备的消耗材料', defaults: {
      name: '强化石', type: '材料', rare: '稀有', effect: '强化', category: '强化类', value: '100', buffs: '' } },
    { name: '任务物品', desc: '用于推进剧情的特殊物品', defaults: {
      name: '神秘信件', type: '任务', rare: '普通', effect: '解锁剧情', category: '任务类', value: '0', buffs: '' } },
    { name: '稀有材料', desc: '打造高级装备的核心材料', defaults: {
      name: '龙鳞碎片', type: '材料', rare: '史诗', effect: '锻造', category: '材料类', value: '500', buffs: '' } }
  ],
  buff: [
    { name: '攻击Buff', desc: '增加攻击力，持续一定回合', defaults: {
      name: '攻击强化', type: '增益', effect_type: '数值加成', value: '15', duration: '3', tick_interval: '0',
      stackable: '否', max_stacks: '1', dispel_type: '可驱散', source: '技能', category: '战斗增益' } },
    { name: '防御Buff', desc: '增加防御力，持续一定回合', defaults: {
      name: '铁壁', type: '增益', effect_type: '数值加成', value: '20', duration: '3', tick_interval: '0',
      stackable: '否', max_stacks: '1', dispel_type: '可驱散', source: '技能', category: '战斗增益' } },
    { name: '持续伤害', desc: '每回合造成持续伤害', defaults: {
      name: '灼烧', type: '减益', effect_type: '持续伤害', value: '10', duration: '3', tick_interval: '1',
      stackable: '可叠加', max_stacks: '3', dispel_type: '可驱散', source: '技能', category: '持续效果' } },
    { name: '光环Buff', desc: '被动光环效果，永久持续', defaults: {
      name: '勇气光环', type: '增益', effect_type: '百分比加成', value: '10', duration: '0', tick_interval: '0',
      stackable: '否', max_stacks: '1', dispel_type: '不可驱散', source: '被动', category: '光环' } },
    { name: '控制效果', desc: '使目标无法行动', defaults: {
      name: '眩晕', type: '减益', effect_type: '控制', value: '1', duration: '1', tick_interval: '0',
      stackable: '否', max_stacks: '1', dispel_type: '可驱散', source: '技能', category: '控制' } }
  ],
  talent: [
    { name: '攻击天赋', desc: '提升角色的物理/法术攻击力', defaults: {
      name: '武器精通', owner: '战士', type: '战斗', level: '1', rarity: '普通', effect_type: '数值加成',
      value: '10', unlock_condition: '无', category: '战斗攻击' } },
    { name: '防御天赋', desc: '提升角色的生存能力', defaults: {
      name: '钢铁之躯', owner: '骑士', type: '战斗', level: '1', rarity: '普通', effect_type: '数值加成',
      value: '15', unlock_condition: '无', category: '战斗防御' } },
    { name: '探索天赋', desc: '提升移动速度和探索能力', defaults: {
      name: '疾步', owner: '所有', type: '冒险', level: '5', rarity: '稀有', effect_type: '百分比加成',
      value: '10', unlock_condition: '角色等级5', category: '移动探索' } },
    { name: '生存天赋', desc: '提升生命上限和回复速度', defaults: {
      name: '顽强', owner: '所有', type: '生存', level: '3', rarity: '普通', effect_type: '百分比加成',
      value: '15', unlock_condition: '无', category: '生存能力' } },
    { name: '社交天赋', desc: '降低商店价格，提升任务奖励', defaults: {
      name: '魅力', owner: '所有', type: '社交', level: '1', rarity: '稀有', effect_type: '百分比加成',
      value: '10', unlock_condition: '无', category: '社交互动' } }
  ],
  achievement: [
    { name: '首次击杀', desc: '击败第一个敌人获得', defaults: {
      name: '初出茅庐', description: '首次击败怪物', condition: 'monster_kill >= 1', reward: '金币x100' } },
    { name: '收集成就', desc: '收集指定数量的物品', defaults: {
      name: '收藏家', description: '收集100件不同物品', condition: 'item_unique >= 100', reward: '称号: 收藏家' } },
    { name: '探索成就', desc: '探索地图完成度', defaults: {
      name: '冒险家', description: '探索所有地图区域', condition: 'map_explored >= 100%', reward: '称号: 冒险家' } },
    { name: '等级成就', desc: '达到指定等级', defaults: {
      name: '登峰造极', description: '角色达到最高等级', condition: 'player_level >= 100', reward: '称号: 传奇' } }
  ],
  story: [
    { name: '开场剧情', desc: '游戏开场介绍世界背景', defaults: {
      name: '序幕·命运的召唤', type: '主线', order: '1', scene: '新手村·广场', content: '', dialog_ids: '',
      prev_story: '', next_story: '', branches: '', condition: '无', event: '无' } },
    { name: '分支剧情', desc: '根据选择产生不同走向', defaults: {
      name: '抉择·光与暗', type: '分支', order: '5', scene: '营地·夜晚', content: '', dialog_ids: '',
      prev_story: '', next_story: '', branches: '', condition: '选择阵营', event: '阵营变更' } },
    { name: '支线剧情', desc: '与主线无关的独立剧情', defaults: {
      name: '神秘的委托', type: '支线', order: '3', scene: '酒馆·黄昏', content: '', dialog_ids: '',
      prev_story: '', next_story: '', branches: '', condition: '与NPC对话', event: '解锁任务' } },
    { name: '高潮剧情', desc: '游戏重要转折点', defaults: {
      name: '终章·决战之时', type: '主线', order: '100', scene: '最终战场', content: '', dialog_ids: '',
      prev_story: '', next_story: '', branches: '', condition: '完成前置主线', event: '解锁结局' } }
  ],
  task: [
    { name: '击杀任务', desc: '击杀指定怪物', defaults: {
      name: '清除野猪', type: '日常', difficulty: '简单', level: '1', reward: '金币x50', dialog_id: '',
      category: '战斗击杀' } },
    { name: '收集任务', desc: '收集指定物品', defaults: {
      name: '采集药草', type: '日常', difficulty: '简单', level: '1', reward: '红药水x3', dialog_id: '',
      category: '物品收集' } },
    { name: '主线任务', desc: '推动主线剧情发展', defaults: {
      name: '第一章·启程', type: '主线', difficulty: '普通', level: '1', reward: '成长礼包', dialog_id: '',
      category: '对话交互' } },
    { name: '探索任务', desc: '探索指定区域', defaults: {
      name: '探索遗迹', type: '支线', difficulty: '困难', level: '10', reward: '宝箱开启', dialog_id: '',
      category: '探索发现' } },
    { name: '护送任务', desc: '保护目标到达指定地点', defaults: {
      name: '护送商队', type: '支线', difficulty: '普通', level: '5', reward: '金币x200', dialog_id: '',
      category: '护送保护' } },
    { name: '解谜任务', desc: '破解机关或谜题', defaults: {
      name: '古代机关', type: '支线', difficulty: '精英', level: '15', reward: '智慧法杖', dialog_id: '',
      category: '解谜挑战' } }
  ],
  dialog: [
    { name: '打招呼', desc: 'NPC开场问候对话', defaults: {
      name: '热情的问候', speaker: '村民', content: '勇者大人！您终于来了！', next_dialog: '', options: '',
      condition: '无', event: '无' } },
    { name: '任务对话', desc: 'NPC委托任务的对话', defaults: {
      name: '紧急委托', speaker: '村长', content: '村子附近的野猪越来越多了，能帮我们清理一下吗？',
      next_dialog: '', options: '接受任务|拒绝', condition: '无', event: '触发任务:清除野猪' } },
    { name: '多选对话', desc: '带有多个选项的对话', defaults: {
      name: '命运的分岔', speaker: '神秘人', content: '你想获得力量，还是自由？', next_dialog: '',
      options: '追求力量|渴望自由|什么都不选', condition: '无', event: '分支选择' } },
    { name: '商店对话', desc: '商人NPC的对话', defaults: {
      name: '武器店老板', speaker: '铁匠', content: '来看看我的新货！都是上好的装备！', next_dialog: '',
      options: '购买|出售|离开', condition: '无', event: '打开商店' } },
    { name: '结局对话', desc: '游戏结局的对话', defaults: {
      name: '告别', speaker: '国王', content: '你的名字将被永远铭记在这片大陆上。', next_dialog: '',
      options: '', condition: '完成最终Boss战', event: '播放结局动画' } }
  ]
}

/** 数据类型显示名（下拉框用；与 `TEMPLATE_DEFS` 的键一一对应） */
export const DATA_TYPE_LABELS: Readonly<Record<string, string>> = {
  role: '角色', job: '职业', monster: '怪物',
  skill: '技能', equip: '装备', item: '道具',
  buff: 'Buff', talent: '天赋', achievement: '成就',
  story: '剧情', task: '任务', dialog: '对话'
}

/** 有模板的数据类型（按 `TEMPLATE_DEFS` 声明序） */
export function listQuickCreateTypes(): string[] {
  return Object.keys(TEMPLATE_DEFS)
}

/** 某类型的模板列表；未知类型返回空数组（不抛） */
export function listQuickCreateTemplates(type: string): readonly QuickCreateTemplate[] {
  return TEMPLATE_DEFS[type] ?? []
}

/** 类型的显示名；未收录时退回键本身（不返回空串，避免下拉框出现空白项） */
export function quickCreateTypeLabel(type: string): string {
  return DATA_TYPE_LABELS[type] ?? type
}

/**
 * 与当前 schema 求交：只保留 schema 里真实存在的类型。
 *
 * **为什么必须求交**：`DataService.createItem` **不校验 type**，若拿一个 schema 里没有的类型
 * 去创建，会落进一条「无类型定义」的孤儿条目（列表与表单都认不出来）。
 * 旧版 原实现就是从 `get_type_schema()` 取类型（只列存在的），这里把该约束显式化。
 */
export function filterQuickCreateTypes(availableTypeIds: readonly string[]): string[] {
  const available = new Set(availableTypeIds)
  return listQuickCreateTypes().filter((type) => available.has(type))
}
