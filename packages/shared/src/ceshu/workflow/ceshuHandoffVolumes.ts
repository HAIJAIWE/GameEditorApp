import type { ChapterKey } from '../reference'
import { docsOfVolume } from './ceshuHandoffDocs'
import type { HandoffAcceptance, HandoffDocField, HandoffVolume, HandoffVolumeId } from './ceshuHandoffTypes'

/**
 * 卷定义。`keyFields` 不手写第二份——从 `HANDOFF_DOCS` 派生，避免文档与卷口径漂移。
 */

interface VolumeMeta {
  id: HandoffVolumeId
  index: number
  folder: string
  title: string
  outcome: string
  requires: HandoffVolumeId[]
  chapters: ChapterKey[]
  acceptance: HandoffAcceptance[]
  outOfScope: string[]
  scale: string
}

const VOLUME_META: readonly VolumeMeta[] = [
  {
    id: 'architecture',
    index: 0,
    folder: '架构',
    title: '架构卷（骨架）',
    outcome: '工程能启动、能按数据表建库并载入、能按状态机在场景间切换、能存读档；还没有玩法内容。',
    requires: [],
    chapters: ['meta', 'tech', 'gameplay'],
    acceptance: [
      { text: '工程可编译运行，进主菜单不崩', check: 'test', how: '真跑构建并启动，进主菜单后退回桌面，全程不崩' },
      { text: '按数据表建表，并能从数据文件载入（不是硬编码）', check: 'data' },
      {
        text: '状态机能走完一圈：主菜单 → 游戏 → 结算 → 回主菜单',
        check: 'test',
        how: '自动化脚本按状态机转移逐条跑完整一圈'
      },
      { text: '存档能写能读；删掉存档后能回到初始状态', check: 'test', how: '写档 → 重启 → 读档；再删档重启回初始' }
    ],
    outOfScope: ['具体关卡与敌人', '战斗/玩法数值', '美术与音频资源', '联网与付费'],
    scale: '骨架工程 + 1 个空场景'
  },
  {
    id: 'core_loop',
    index: 1,
    folder: '核心玩法',
    title: '核心玩法卷（第一条可玩链路）',
    outcome: '能完整玩一局：进入 → 操作 → 反馈 → 结算 → 再来一局，数值来自参数表。',
    requires: ['architecture'],
    chapters: ['gameplay', 'combat', 'numeric'],
    acceptance: [
      { text: '一局能从头玩到尾，不卡死、不空转', check: 'test', how: '真玩一局到结算，中途不卡死不空转' },
      {
        text: '所有玩法数值来自参数表常量，代码里没有魔法数字',
        check: 'field',
        fields: [{ chapter: 'numeric', field: 'numeric_parameters' }]
      },
      { text: 'numeric_assertions 逐条复算通过（允许容差内）', check: 'assertion' },
      { text: '操作 1 秒内有可见反馈', check: 'test', how: '打日志测「输入事件 → 首帧反馈」的耗时，逐项确认 ≤1000ms' }
    ],
    outOfScope: ['多关卡内容', '成长与经济系统', '完整 UI 皮肤'],
    scale: '1 个可玩场景 + 1 套结算'
  },
  {
    id: 'content',
    index: 2,
    folder: '内容',
    title: '内容卷（关卡与敌人）',
    outcome: '全部关卡可按配置表生成，难度曲线与配置一致，不需要为每关改代码。',
    requires: ['core_loop'],
    chapters: ['level_design', 'story'],
    acceptance: [
      { text: '新增一关只改数据表，不改代码', check: 'data', match: '关卡' },
      { text: '每关的敌人编队/奖励与配置表逐项一致', check: 'data', match: '关卡' },
      { text: '难度系数与 difficulty_curve 同向（首关最低、Boss 最高）', check: 'field', fields: [{ chapter: 'level_design', field: 'difficulty_curve_points' }] }
    ],
    outOfScope: ['新玩法机制', '剧情演出与配音', '活动/赛季内容'],
    scale: '按 content_estimate 的关卡数批量生产'
  },
  {
    id: 'systems',
    index: 3,
    folder: '系统',
    title: '系统卷（装备、成长、经济）',
    outcome: '装备/成长/经济三套系统能独立跑通，资源闭环可复算，词条与强化有明确规则。',
    requires: ['core_loop'],
    chapters: ['systems', 'economy', 'numeric'],
    acceptance: [
      { text: '每个启用的系统都有配置表且能被代码读取', check: 'field', fields: [{ chapter: 'systems', field: 'battle.config.turn_mode' }] },
      { text: '新手前 10 分钟的收支与账本一致（误差在容差内）', check: 'field', fields: [{ chapter: 'economy', field: 'ledger' }] },
      { text: '装备/词条的数值来源可追到参数表', check: 'field', fields: [{ chapter: 'numeric', field: 'numeric_parameters' }] }
    ],
    outOfScope: ['付费与商业化', '赛季重置', '跨服交易'],
    scale: '1 套经济闭环 + 1 条成长线 + 1 套装备规则'
  },
  {
    id: 'interface',
    index: 4,
    folder: '界面',
    title: '界面卷（UI 与交互）',
    outcome: '每个核心流程都能在界面上走通，反馈符合规范，不出现「点了没反应」。',
    requires: ['core_loop'],
    chapters: ['uiux', 'accessibility'],
    acceptance: [
      { text: 'core_flows 每条流程都能从头走到出口', check: 'field', fields: [{ chapter: 'uiux', field: 'core_flows' }] },
      { text: '所有 ≥3 秒的等待都有可见进度或倒计时', check: 'field', fields: [{ chapter: 'uiux', field: 'feedback_rules' }] },
      { text: '破坏性操作 100% 有二次确认', check: 'field', fields: [{ chapter: 'uiux', field: 'usability_standards' }] },
      { text: '色盲模式下关键信息不丢（不只靠颜色区分）', check: 'test', how: '开色盲模式（或灰度滤镜）逐屏检查，关键信息不能只靠颜色' }
    ],
    outOfScope: ['视觉皮肤与动效打磨', '多语言文案翻译'],
    scale: '按 core_flows 的流程数排期'
  },
  {
    id: 'polish',
    index: 5,
    folder: '打磨',
    title: '打磨卷（性能、埋点、本地化）',
    outcome: '在目标机型上达标，可出包；埋点能回答「玩家卡在哪」。',
    requires: ['content', 'systems', 'interface'],
    chapters: ['performance', 'analytics', 'accessibility'],
    acceptance: [
      { text: '目标机型最低档稳定达标（帧率/内存不超预算）', check: 'test', how: '在最低档机型跑 performance_budget 的测法，连续 10 分钟不掉帧、内存不超上限' },
      { text: '关键埋点可在日志里看到，字段与表一致', check: 'test', how: '跑核心流程，在日志里逐个找到 event_tracking 的事件名与字段' },
      { text: '首发语言的界面无截断、无乱码', check: 'test', how: '用首发语言把所有界面走一遍，截图比对截断/乱码/溢出' }
    ],
    outOfScope: ['长线运营活动', '海外发行合规（另立专项）'],
    scale: '按 target_devices 的机型数 × 场景数'
  },
  {
    id: 'engineering',
    index: 6,
    folder: '研发',
    title: '研发实施卷（落地任务）',
    outcome: '把前面所有设计翻译成可执行的研发任务清单：按阶段排期，每条任务带依赖、交付物与验收，程序照单施工。',
    requires: ['architecture', 'core_loop', 'content', 'systems', 'interface', 'polish'],
    chapters: [],
    acceptance: [
      {
        text: '任务按「框架 → 玩法 → 系统 → 内容 → 界面 → 打磨」排序，每阶段可独立验收',
        check: 'field',
        fields: [{ chapter: 'tech', field: 'milestones' }]
      },
      { text: '每条任务都有依赖、交付物与可判定验收', check: 'manual', how: '逐条检查：依赖列不为空，交付物必须能被别人验收（不是「已完成」这种自述）' },
      { text: '每条任务都能追到一份设计文档', check: 'field', fields: [{ chapter: 'gameplay', field: 'state_machine' }] }
    ],
    outOfScope: ['具体代码实现细节（模块/接口由程序定）', '人力与预算排期（见资源章）'],
    scale: '按阶段数（6 段）× 每段任务数'
  }
] as const

/** 卷定义：`keyFields` 由文档派生，不手写第二份 */
export const HANDOFF_VOLUMES: readonly HandoffVolume[] = VOLUME_META.map((meta) => {
  const seen = new Set<string>()
  const keyFields: HandoffDocField[] = []
  for (const doc of docsOfVolume(meta.id)) {
    for (const item of doc.fields) {
      const id = `${item.chapter}.${item.field}`
      if (seen.has(id)) continue
      seen.add(id)
      keyFields.push(item)
    }
  }
  return { ...meta, keyFields }
})
