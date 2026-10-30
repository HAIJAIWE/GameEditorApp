/**
 * 章节 `art` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshu/ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshu/ceshuConstants'

export const ART_FIELDS: CeshuFieldDef[] = [
  {
    key: 'art_style',
    label: '美术风格',
    kind: 'textarea',
    aiHint: '产出美术风格描述：整体风格定位 + 表现手法（像素/水墨/写实3D等）+ 关键视觉特征；须具体到可验收',
    reviewHint: '是否有明确风格定位词；是否含表现手法与关键特征；是否出现「精致」「好看」等空话'
  },
  {
    key: 'color_system',
    label: '色彩体系',
    kind: 'textarea',
    aiHint: '产出色彩体系：主色/辅助色/强调色/背景色四类，每类给色名或色值，附使用比例或场景',
    reviewHint: '是否覆盖主/辅/强调/背景四类；每类是否给色名或色值；有无使用场景或比例说明'
  },
  {
    key: 'typography',
    label: '字体排版',
    kind: 'textarea',
    aiHint: '一段概述：字体排版的整体风格与选型原则；各场景字体与授权情况走「要点」逐条列',
    reviewHint: '是否按标题/正文/UI 分场景给具体字体名；是否提及授权风险；理由是否与 art_style 匹配'
  },
  {
    key: 'vfx',
    label: '特效风格',
    kind: 'textarea',
    aiHint: '一段概述：特效的整体风格定位；各特效类型与视觉语言走「要点」逐条列',
    reviewHint: '是否列出特效类型清单；每类是否有视觉语言描述；是否与整体美术风格一致'
  },
  {
    key: 'character_design',
    label: '角色设计要点',
    kind: 'stringList',
    aiHint: '3-5 条角色设计要点：造型/配色/辨识度/与世界观的一致性；只写可执行的约束（如「主角剪影在 64px 下仍可辨」）',
    reviewHint: '是否可执行（不是「要好看」）；主角与敌人是否易区分；是否与本章美术风格字段一致'
  },
  {
    key: 'environment_design',
    label: '场景设计要点',
    kind: 'stringList',
    aiHint: '3-5 条场景设计要点：区域划分/光照氛围/可交互元素密度/性能约束（同屏面数或贴图规格）',
    reviewHint: '是否给出可量化的性能约束；场景是否服务玩法（不只是背景板）；是否与关卡模板对应'
  },
  {
    key: 'ui_design_language',
    label: 'UI 设计语言',
    kind: 'textarea',
    aiHint: 'UI 设计语言：风格基调、主色/辅色（给色值或色相范围）、字体层级、圆角/描边等可复用规则，3-5 条能直接落到组件上的约束',
    reviewHint: '是否给的是可复用规则而不是形容词；是否考虑对比度与无障碍；是否与交互设计（第十八章）一致'
  },
  {
    key: 'animation',
    label: '动画规格',
    kind: 'stringList',
    aiHint: '3-5 条动画规格：角色动作套数、帧数或时长、是否骨骼动画、受击/死亡/技能的特效衔接要求',
    reviewHint: '规格是否能被美术直接执行（帧数/时长）；动作数量是否与战斗手段匹配；是否考虑移动端性能'
  },
  {
    key: 'multi_resolution',
    label: '多分辨率适配',
    kind: 'textarea',
    aiHint: '目标分辨率与适配策略：基准分辨率、UI 锚点与缩放规则、超宽/窄屏处理、安全区；给 2-3 档典型分辨率下的表现',
    reviewHint: '是否覆盖超宽屏与刘海屏；UI 是否会遮住关键操作区；是否与目标机型（第十四章）一致'
  },
  /*
   * 2026-10-28 角色评审补的字段：美术风格只回答「长什么样」，不回答「文件怎么交付」。
   * 没有这张表，程序只能自己猜尺寸/格式、换平台或接外包时对不上，命名也各叫一套，
   * 找文件靠中文名——这是美术与程序之间最容易扯皮、又最该一张表钉死的地方。
   */
  {
    key: 'asset_spec',
    label: '资产规格',
    kind: 'pipeList',
    columns: [
      { key: 'type', label: '类型' },
      { key: 'size', label: '尺寸' },
      { key: 'format', label: '格式' },
      { key: 'naming', label: '命名' },
      { key: 'note', label: '备注' }
    ],
    aiHint:
      '每行一种资产类型：类型|尺寸（含各分辨率档位）|格式（引擎要求的文件格式/压缩/Atlas）|命名规则（前缀+用途+序号，可机读，不靠中文名找文件）|备注（导入设置/最大尺寸/是否可九宫）；至少覆盖 角色立绘/头像、UI 图标、场景贴图、特效、字体；尺寸要与 multi_resolution 的分辨率档位对齐',
    reviewHint:
      '每种资产是否都有尺寸与格式（缺失即视为未定）；命名是否可机读（不靠中文名找文件）；导入设置是否写明（压缩/Atlas/最大尺寸）；尺寸是否与 multi_resolution 档位对齐'
  }
]

export const ART_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  typography: {
    points: {
      aiHint: '3-6 条：每条一个用途场景（标题/正文/UI）+ 具体字体名 + 授权情况',
      reviewHint: '是否按场景给到具体字体名；是否提及授权；理由是否与 art_style 匹配'
    },
    notes: {
      aiHint: '要点之外的补充说明：备用字体或本地化字形兼容问题，可留空',
      reviewHint: '补充是否与要点重复；字形兼容问题是否写清'
    }
  },
  vfx: {
    points: {
      aiHint: '3-6 条：每条一类特效 + 视觉语言（粒子/光效/材质）+ 触发场景',
      reviewHint: '每类是否有视觉语言与触发场景；是否与整体美术风格一致；有无「炫酷」这类空话'
    },
    notes: {
      aiHint: '要点之外的补充说明：性能预算或特效管线工具，可留空',
      reviewHint: '补充是否与要点重复；性能预算是否给出量级'
    }
  }
}

export const ART_DEFAULTS: ChapterData = {
  art_style: '',
  character_design: '',
  environment_design: '',
  ui_design_language: '',
  color_system: '',
  typography: '',
  vfx: '',
  animation: '',
  multi_resolution: '',
  asset_spec: []
}

export const ART_TEMPLATES: ChapterTemplate[] = [
  {
    name: '国风水墨美术',
    description: '国风水墨 + 实机渲染的仙侠美术风格',
    tags: [
      '国风',
      '水墨',
      '仙侠'
    ],
    data: {
      art_style: '国风水墨 + 实机 3D 渲染，场景以青绿山水为基调，角色采用半写实比例（7-8 头身）+ 国风服饰',
      character_design: '主角：剑眉星目 + 飘逸长发 + 汉服元素；NPC：按势力区分服饰色彩（正道青、魔道紫、中立灰）',
      environment_design: '云海、剑阁、幽谷、仙山，采用 volumetric fog 营造仙气',
      ui_design_language: '毛笔字标题 + 卷轴式 UI + 印章式按钮，整体淡雅留白',
      color_system: '主色：青绿（#5B8C7A）；辅色：朱砂（#C73E3A）；点缀：金黄（#D4A537）；背景：宣纸色（#F5EFE0）',
      typography: '标题：方正清刻本悦宋；正文：思源宋体；UI：鸿雷板书简体',
      vfx: '水墨晕染特效 + 剑光粒子 + 法术符文特效',
      animation: '动作捕捉 + 手工调整，剑招参考真实剑术',
      multi_resolution: '支持 1080P/2K/4K，移动端降采到 720P + LOD 优化',
      asset_spec: [
        { type: '角色立绘', size: '全身 2048×4096 / 半身 2048×2048', format: 'PNG（透明）/ 骨骼 SpriteSheet 2048²', naming: 'char_<id>_pose<01>', note: '半身 live2d 可拆分；移动端 LOD 降 1024²' },
        { type: '头像', size: '512×512', format: 'PNG（透明）', naming: 'face_<id>_v<01>', note: '圆形遮罩 1:1' },
        { type: 'UI 图标', size: '256×256', format: 'PNG + Atlas（2048²）', naming: 'icon_<sys>_<name>', note: '九宫拉伸的框走 slice 标记' },
        { type: '场景贴图', size: '2048² 可 Tile', format: 'TGA/PVR（压缩）', naming: 'env_<region>_<seq>', note: 'volumetric fog 区域单独 layer' },
        { type: '特效', size: '512×512 Particle', format: 'PNG 序列帧 / 3D 粒子', naming: 'vfx_<cat>_<name>', note: '水墨晕染用 Shader 而非序列帧' },
        { type: '字体', size: '动态合字', format: 'TTF（思源宋体/鸿雷板书）', naming: 'font_<use>', note: '只打包用到的字模，控制包体' }
      ]
    }
  },
  {
    name: '赛博朋克美术',
    description: '霓虹 + 雨夜 + 高对比度的赛博朋克美术',
    tags: [
      '赛博',
      '科幻',
      '霓虹'
    ],
    data: {
      art_style: '赛博朋克 + 写实 3D，雨夜霓虹城市，高对比度光影',
      character_design: '主角：皮衣 + 义体改造；NPC：按阶层区分（穹顶洁净/下层脏污）',
      environment_design: '三层都市：穹顶（洁净白）/ 都市带（霓虹紫）/ 废弃区（暗红）',
      ui_design_language: '全息 UI + 故障字体 + 数据流背景',
      color_system: '主色：霓虹紫（#9D4EDD）；辅色：电子蓝（#00F5FF）；点缀：警示红（#FF003C）；背景：深黑（#0A0A0F）',
      typography: '标题：Orbitron；正文：Roboto；中文：思源黑体',
      vfx: '全息投影 + 故障特效 + 雨水反射',
      animation: '写实动作 + 战术动画，枪械参考真实武器',
      multi_resolution: '支持 1080P/2K/4K，启用 DLSS/FSR 提升性能',
      asset_spec: [
        { type: '角色模型', size: '中模 3 万面 / 高模 15 万面', format: 'FBX（骨骼）+ 贴图 2K² PBR', naming: 'chr_<id>_lod<0-2>', note: '三档 LOD；攻击件单独挂点' },
        { type: '武器', size: '2K² 贴图', format: 'FBX + 法线/AO', naming: 'wpn_<caliber>_<seq>', note: '按口径分资产包' },
        { type: 'UI 图标', size: '256×256', format: 'PNG + Atlas（2048²）', naming: 'icon_<sys>_<name>', note: '故障字体图标单独 layer' },
        { type: '场景贴图', size: '4K² 主贴图', format: 'TGA/BC7 压缩', naming: 'env_<zone>_<seq>', note: '霓虹自发光走 emissive' },
        { type: '特效', size: '1024 粒子', format: 'PNG 序列帧 / Niagara', naming: 'vfx_<cat>_<name>', note: '故障干扰用 UV 抖动' },
        { type: '字体', size: '动态合字', format: 'TTF（思源黑体/Orbitron）', naming: 'font_<use>', note: '只打包用到的字模' }
      ]
    }
  },
  {
    name: '治愈系卡通美术',
    description: '柔和色彩的治愈系卡通风格',
    tags: [
      '治愈',
      '卡通',
      '柔和'
    ],
    data: {
      art_style: 'Q 版卡通渲染 + 手绘质感，柔和色彩 + 圆润造型',
      character_design: '3 头身 Q 版，圆润造型，表情夸张可爱',
      environment_design: '小镇、田野、森林，采用低多边形 + 手绘贴图',
      ui_design_language: '圆角 UI + 手绘图标 + 暖色调',
      color_system: '主色：奶油黄（#F4E1B8）；辅色：薄荷绿（#A8D8B9）；点缀：樱花粉（#F4C2D0）；背景：天空蓝（#B5D8EB）',
      typography: '标题：站酷快乐体；正文：思源黑体；UI：圆体',
      vfx: '粒子光点 + 心形特效 + 柔光过渡',
      animation: 'Q 版弹性动画 + 夸张表情',
      multi_resolution: '支持 720P/1080P，移动端友好',
      asset_spec: [
        { type: '角色', size: '立绘 1024×1024 / 表情 512²', format: 'PNG（透明）SpriteSheet', naming: 'char_<id>_expr<01>', note: '3 头身，表情单独拆 Sheet' },
        { type: 'UI 图标', size: '256×256', format: 'PNG + Atlas（1024²）', naming: 'icon_<sys>_<name>', note: '圆角手绘图标' },
        { type: '场景', size: '1024² Tile', format: 'PNG（手绘）/ 低多边形 FBX', naming: 'env_<region>_<seq>', note: '低多边形顶点色上色' },
        { type: '特效', size: '256 粒子', format: 'PNG 光点序列帧', naming: 'vfx_<cat>_<name>', note: '柔光过渡用加法混合' },
        { type: '字体', size: '动态合字', format: 'TTF（站酷快乐体/圆体）', naming: 'font_<use>', note: '只打包用到的字模' }
      ]
    }
  }
]

export const ART_SCHEMA: ChapterSchema = {
  fields: ART_FIELDS,
  splits: [
  'typography',
  'vfx',
  'ui_design_language',
  'multi_resolution'
],
  splitHints: ART_SPLIT_HINTS,
  defaults: ART_DEFAULTS,
  templates: ART_TEMPLATES
}
