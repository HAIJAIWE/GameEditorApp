/**
 * 12 种内置数据类型定义（自 早期版本 core/defaults/rpg_schema v2.4 匹平迁移）。
 * 本文件是「内置默认 schema」；运行期实际使用的主进程 TypeSchemaStore 可加载用户编辑后的
 * type_schema.json（缺省即以此为准），相关纯函数均按传入的 types 列表工作。
 * - id：单数键（新架构内部与存储使用）
 * - pluralKey：旧版数据文件的复数键（存量数据导入映射用）
 * - aiContext（AI 生成上下文）暂不迁移，留待 AI 阶段统一设计
 */

import type { DataTypeDef, FieldType, TypeFieldDef } from '../../types'

function field(name: string, label: string, type: FieldType, extra: Partial<TypeFieldDef> = {}): TypeFieldDef {
  return { name, label, type, editable: true, ...extra }
}

/** ID 系统字段（所有类型共有） */
function idField(): TypeFieldDef {
  return field('id', 'ID:', 'entry', { editable: false })
}

export const BUILTIN_DATA_TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#2196F3',
    formFields: [
      idField(),
      field('name', '角色名称:', 'entry'),
      field('job', '职业:', 'combobox', { values: ['战士', '弓箭手', '法师', '枪手'] }),
      field('race', '种族:', 'combobox', { values: ['人类', '精灵', '兽人', '矮人', '亡灵', '恶魔'] }),
      field('faction', '势力:', 'combobox', { values: ['联盟', '部落', '中立', '邪恶', '善良'] }),
      field('attr_list', '属性列表:', 'attrpanel'),
      field('skills', '技能列表:', 'multiselect', { refType: 'skills' }),
      field('talents', '天赋列表:', 'multiselect', { refType: 'talents' }),
      field('buffs', 'Buff列表:', 'multiselect', { refType: 'buffs' }),
      field('mechanism', '特殊机制:', 'desc'),
      field('category', '分类:', 'combobox', { values: ['坦克', '输出', '辅助', '治疗', '控制'] }),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: ['{职业} {种族}，来自{势力}。', '强大的{职业}。', '{种族} {职业}。']
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc'),
      field('image_tags', '图片标签:', 'image_tags')
    ]
  },
  {
    id: 'job',
    name: '职业',
    pluralKey: 'jobs',
    color: '#9C27B0',
    formFields: [
      idField(),
      field('name', '职业名称:', 'entry'),
      field('job_tier', '职业层级:', 'combobox', { values: ['基础', '进阶'] }),
      field('base_job_from', '来源基础职业:', 'combobox', { values: ['战士', '弓箭手', '法师', '枪手', '无'] }),
      field('type', '职业定位:', 'combobox', { values: ['坦克', '输出', '法师', '治疗', '辅助', '控制'] }),
      field('desc', '职业描述:', 'desc'),
      field('weapons', '可用武器:', 'tags'),
      field('hp_bonus', '生命加成%:', 'spinbox', { from: -50, to: 100 }),
      field('mp_bonus', '法力加成%:', 'spinbox', { from: -50, to: 100 }),
      field('atk_bonus', '攻击加成%:', 'spinbox', { from: -50, to: 100 }),
      field('def_bonus', '防御加成%:', 'spinbox', { from: -50, to: 100 }),
      field('attr_list', '属性列表:', 'attrtable'),
      field('mechanism', '专属机制:', 'desc'),
      field('resource_type', '资源类型:', 'combobox', {
        values: ['法力', '怒气', '能量', '连击点', '无消耗', '生命值', '灵魂碎片', '符文']
      }),
      field('core_skills', '核心技能:', 'multiselect', { refType: 'skills' }),
      field('passives', '被动技能:', 'multiselect', { refType: 'skills' }),
      field('difficulty', '上手难度:', 'combobox', { values: ['新手', '简单', '普通', '困难', '专家', '大师'] }),
      field('playstyle', '玩法风格:', 'tags'),
      field('inherent_buffs', '固有Buff:', 'multiselect', { refType: 'buffs' }),
      field('growth_type', '成长倾向:', 'combobox', { values: ['均衡型', '血量型', '攻击型', '法力型', '防御型'] }),
      field('skill_types', '推荐技能类型:', 'tags'),
      field('unlock_condition', '解锁条件:', 'entry'),
      field('evolve_jobs', '可转职为:', 'entry'),
      field('tags', '标签:', 'tags')
    ]
  },
  {
    id: 'monster',
    name: '怪物',
    pluralKey: 'monsters',
    color: '#FF9800',
    formFields: [
      idField(),
      field('name', '怪物名称:', 'entry'),
      field('level', '等级:', 'spinbox', { from: 1, to: 100 }),
      field('type', '类型:', 'combobox', { values: ['野兽', '亡灵', '恶魔', '元素', '机械', '龙类', '人类'] }),
      field('category', '分类:', 'combobox', { values: ['普通', '精英', 'Boss', '稀有', '事件怪'] }),
      field('difficulty', '难度:', 'combobox', { values: ['简单', '普通', '困难', '精英', '首领'] }),
      field('behavior', '行为:', 'combobox', { values: ['攻击性', '防御性', '游荡', '召唤', '治疗', '逃跑'] }),
      field('attr_list', '属性列表:', 'attrpanel'),
      field('skills', '技能列表:', 'multiselect', { refType: 'skills' }),
      field('talents', '天赋列表:', 'multiselect', { refType: 'talents' }),
      field('buffs', 'Buff列表:', 'multiselect', { refType: 'buffs' }),
      field('mechanism', '特殊机制:', 'desc'),
      field('equip_drops', '装备掉落:', 'droptable'),
      field('item_drops', '道具掉落:', 'droptable'),
      field('title_drops', '称号掉落:', 'droptable'),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: ['{等级}级{类型}怪物，{难度}难度，{行为}行为。', '{类型}怪物，等级{等级}，分类{分类}，难度{难度}。']
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc'),
      field('image_tags', '图片标签:', 'image_tags')
    ]
  },
  {
    id: 'equip',
    name: '装备',
    pluralKey: 'equips',
    color: '#9C27B0',
    formFields: [
      idField(),
      field('name', '装备名称:', 'entry'),
      field('part', '部位:', 'combobox', {
        values: ['武器', '头盔', '胸甲', '护腿', '靴子', '手套', '戒指', '项链', '披风']
      }),
      field('rare', '稀有度:', 'combobox', { values: ['普通', '优秀', '稀有', '史诗', '传说'] }),
      field('job', '适用职业:', 'combobox', { values: ['战士', '弓箭手', '法师', '枪手', '所有'] }),
      field('effect', '效果类型:', 'combobox', {
        values: ['攻击加成', '防御加成', '生命加成', '法力加成', '暴击率', '闪避率', '魔法抗性']
      }),
      field('category', '分类:', 'combobox', { values: ['攻击', '防御', '辅助', '控制', '特殊'] }),
      field('tags', '标签:', 'tags'),
      field('value', '数值:', 'spinbox', { from: 0, to: 9999 }),
      field('buffs', '关联Buff:', 'multiselect', { refType: 'buffs' }),
      field('template', '描述模板:', 'template', {
        values: [
          '{部位}，{稀有}品质，为{职业}提供{数值}点{效果类型}。',
          '{效果类型}装备，部位{部位}，适合{职业}，效果{效果类型}，数值{数值}。',
          '{稀有}品质{部位}，{分类}装备，适用于{职业}。'
        ]
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc'),
      field('image_tags', '图片标签:', 'image_tags')
    ]
  },
  {
    id: 'skill',
    name: '技能',
    pluralKey: 'skills',
    color: '#4CAF50',
    formFields: [
      idField(),
      field('name', '技能名称:', 'entry'),
      field('type', '类型:', 'combobox', { values: ['攻击', '治疗', '防御', '控制', '增益', '减益', '被动'] }),
      field('value', '基础数值:', 'spinbox', { from: 0, to: 9999 }),
      field('damage_type', '伤害类型:', 'combobox', { values: ['物理伤害', '法术伤害', '真伤'] }),
      field('multiplier', '倍率:', 'combobox', { values: ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0'] }),
      field('cd', '冷却:', 'spinbox', { from: 0, to: 99 }),
      field('target', '目标:', 'combobox', {
        values: ['单体敌人', '群体敌人', '单体友方', '全体友方', '自身', '所有目标']
      }),
      field('consume', '消耗类型:', 'combobox', { values: ['无消耗', '法力', '体力', '怒气', '生命值'] }),
      field('effect', '效果类型:', 'combobox', {
        values: ['直接伤害', '持续伤害', '护盾', '眩晕', '中毒', '燃烧', '减速']
      }),
      field('buffs', '关联Buff:', 'multiselect', { refType: 'buffs' }),
      field('category', '分类:', 'combobox', { values: ['攻击', '防御', '辅助', '控制', '特殊'] }),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: [
          '[经典四属性] {技能名}，{类型}技能，向{目标}造成{数值}点伤害，消耗{消耗}。',
          '[物理/魔法] {技能名}，{类型}，{分类}技能，物理攻击{数值}，冷却{冷却}秒。'
        ]
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc'),
      field('image_tags', '图片标签:', 'image_tags')
    ]
  },
  {
    id: 'talent',
    name: '天赋',
    pluralKey: 'talents',
    color: '#E91E63',
    formFields: [
      idField(),
      field('name', '天赋名称:', 'entry'),
      field('owner', '归属角色:', 'entry'),
      field('type', '天赋类型:', 'combobox', { values: ['战斗', '生存', '探索', '社交', '制造'] }),
      field('level', '天赋等级:', 'spinbox', { from: 1, to: 20 }),
      field('rarity', '稀有度:', 'combobox', { values: ['普通', '优秀', '稀有', '史诗', '传说', '神话'] }),
      field('effect_type', '效果类型:', 'combobox', {
        values: ['属性提升', '技能增强', '被动触发', '条件激活', '光环效果']
      }),
      field('value', '数值:', 'spinbox', { from: 0, to: 9999 }),
      field('unlock_condition', '解锁条件:', 'entry'),
      field('category', '分类:', 'combobox', { values: ['主动', '被动', '增益', '减益'] }),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: [
          '{天赋名称}，{天赋类型}天赋，{稀有}品质，{效果类型}。',
          '{分类}天赋，{稀有}品质，等级{等级}，效果{效果类型}，数值{数值}。',
          '归属{归属角色}的{天赋类型}天赋，{效果类型}，等级{等级}。'
        ]
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc'),
      field('image_tags', '图片标签:', 'image_tags')
    ]
  },
  {
    id: 'item',
    name: '道具',
    pluralKey: 'items',
    color: '#F44336',
    formFields: [
      idField(),
      field('name', '道具名称:', 'entry'),
      field('type', '类型:', 'combobox', { values: ['消耗品', '材料', '任务道具', '特殊道具', '钥匙'] }),
      field('rare', '稀有度:', 'combobox', { values: ['普通', '优秀', '稀有', '史诗', '传说'] }),
      field('effect', '效果类型:', 'combobox', {
        values: ['攻击加成', '防御加成', '生命加成', '法力加成', '暴击率', '闪避率', '魔法抗性']
      }),
      field('category', '分类:', 'combobox', { values: ['攻击', '防御', '辅助', '控制', '特殊'] }),
      field('tags', '标签:', 'tags'),
      field('value', '数值:', 'spinbox', { from: 0, to: 9999 }),
      field('buffs', '关联Buff:', 'multiselect', { refType: 'buffs' }),
      field('template', '描述模板:', 'template', {
        values: [
          '{类型}道具，{稀有}品质，提供{数值}点{效果类型}。',
          '{分类}道具，类型{类型}，稀有度{稀有}，效果{效果类型}。',
          '{稀有}品质{类型}，{分类}类道具，数值{数值}。'
        ]
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc'),
      field('image_tags', '图片标签:', 'image_tags')
    ]
  },
  {
    id: 'achievement',
    name: '成就',
    pluralKey: 'achievements',
    color: '#FFD700',
    formFields: [
      idField(),
      field('name', '成就名称:', 'entry'),
      field('description', '成就描述:', 'achievement_desc'),
      field('condition', '达成条件:', 'entry'),
      field('reward', '奖励:', 'entry')
    ]
  },
  {
    id: 'buff',
    name: 'Buff',
    pluralKey: 'buffs',
    color: '#2196F3',
    formFields: [
      idField(),
      field('name', 'Buff名称:', 'entry'),
      field('type', '效果类型:', 'combobox', { values: ['正面增益', '负面减益'] }),
      field('effect_type', '效果类别:', 'combobox', {
        values: ['属性提升', '属性降低', '持续伤害', '持续治疗', '免疫', '眩晕', '沉默', '减速', '加速', '护盾']
      }),
      field('value', '数值:', 'spinbox', { from: -9999, to: 9999 }),
      field('duration', '持续时间(秒):', 'spinbox', { from: 0, to: 999 }),
      field('tick_interval', '跳数间隔(秒):', 'spinbox', { from: 0, to: 60 }),
      field('stackable', '是否可叠加:', 'combobox', { values: ['不可叠加', '可叠加', '可叠加（次数限制）'] }),
      field('max_stacks', '最大叠加层数:', 'spinbox', { from: 1, to: 99 }),
      field('dispel_type', '驱散类型:', 'combobox', { values: ['不可驱散', '魔法驱散', '净化', '所有'] }),
      field('source', '来源类型:', 'combobox', { values: ['技能', '天赋', '装备', '道具', '环境', '其他'] }),
      field('category', '分类:', 'combobox', { values: ['战斗', '探索', '社交', '环境'] }),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: [
          '{效果类型} {Buff名称}，{数值}数值，持续{持续时间}秒。',
          '{效果类型}，{Buff名称}，来源{来源类型}，{是否可叠加}。',
          '{分类}类Buff，{效果类型}，数值{数值}，持续时间{持续时间}秒。'
        ]
      }),
      field('desc', '描述:', 'desc')
    ]
  },
  {
    id: 'story',
    name: '剧情',
    pluralKey: 'stories',
    color: '#795548',
    formFields: [
      idField(),
      field('name', '剧情名称:', 'entry'),
      field('type', '剧情类型:', 'combobox', { values: ['主线', '支线', '事件', '结局'] }),
      field('order', '剧情顺序:', 'spinbox', { from: 0, to: 999 }),
      field('scene', '场景名称:', 'entry'),
      field('content', '剧情内容:', 'content'),
      field('dialog_ids', '关联对话(逗号分隔):', 'entry'),
      field('prev_story', '前置剧情:', 'entry'),
      field('next_story', '后续剧情:', 'entry'),
      field('branches', '分支剧情(每行一个ID):', 'content'),
      field('condition', '解锁条件:', 'entry'),
      field('event', '完成事件:', 'entry'),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: ['{剧情名称}在{场景}发生，类型为{剧情类型}', '剧情顺序{剧情顺序}：{剧情内容}', '分支剧情：{分支剧情}']
      }),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image'),
      field('image_desc', '图片描述:', 'image_desc')
    ]
  },
  {
    id: 'task',
    name: '任务',
    pluralKey: 'tasks',
    color: '#FF5722',
    formFields: [
      idField(),
      field('name', '任务名称:', 'entry'),
      field('type', '任务类型:', 'combobox', { values: ['主线', '支线', '日常', '活动', '隐藏'] }),
      field('difficulty', '难度:', 'combobox', { values: ['简单', '普通', '困难', '精英', '首领'] }),
      field('level', '等级:', 'spinbox', { from: 1, to: 100 }),
      field('reward', '奖励:', 'entry'),
      field('dialog_id', '对话ID:', 'dialog'),
      field('category', '分类:', 'combobox', { values: ['攻击', '防御', '辅助', '控制', '特殊'] }),
      field('tags', '标签:', 'tags'),
      field('desc', '描述:', 'desc'),
      field('image', '图片:', 'image')
    ]
  },
  {
    id: 'dialog',
    name: '对话',
    pluralKey: 'dialogs',
    color: '#00BCD4',
    formFields: [
      idField(),
      field('name', '对话名称:', 'entry'),
      field('speaker', '说话者:', 'entry'),
      field('content', '对话内容:', 'content'),
      field('next_dialog', '后续对话:', 'entry'),
      field('options', '对话选项(每行一个):', 'content'),
      field('condition', '触发条件:', 'entry'),
      field('event', '触发事件:', 'entry'),
      field('tags', '标签:', 'tags'),
      field('template', '描述模板:', 'template', {
        values: ['{说话者}说：{对话内容}', '对话场景：{场景}', '{角色}的台词：{内容}']
      }),
      field('desc', '描述:', 'desc')
    ]
  }
]
