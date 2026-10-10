import type { ChapterTemplate } from '../../../ceschu/ceshuTemplates'

export const artTemplates: ChapterTemplate[] = [
    {
      "name": "国风水墨美术",
      "description": "国风水墨 + 实机渲染的仙侠美术风格",
      "tags": [
        "国风",
        "水墨",
        "仙侠"
      ],
      "data": {
        "art_style": "国风水墨 + 实机 3D 渲染，场景以青绿山水为基调，角色采用半写实比例（7-8 头身）+ 国风服饰",
        "character_design": "主角：剑眉星目 + 飘逸长发 + 汉服元素；NPC：按势力区分服饰色彩（正道青、魔道紫、中立灰）",
        "environment_design": "云海、剑阁、幽谷、仙山，采用 volumetric fog 营造仙气",
        "ui_design_language": "毛笔字标题 + 卷轴式 UI + 印章式按钮，整体淡雅留白",
        "color_system": "主色：青绿（#5B8C7A）；辅色：朱砂（#C73E3A）；点缀：金黄（#D4A537）；背景：宣纸色（#F5EFE0）",
        "typography": "标题：方正清刻本悦宋；正文：思源宋体；UI：鸿雷板书简体",
        "vfx": "水墨晕染特效 + 剑光粒子 + 法术符文特效",
        "animation": "动作捕捉 + 手工调整，剑招参考真实剑术",
        "multi_resolution": "支持 1080P/2K/4K，移动端降采到 720P + LOD 优化"
      }
    },
    {
      "name": "赛博朋克美术",
      "description": "霓虹 + 雨夜 + 高对比度的赛博朋克美术",
      "tags": [
        "赛博",
        "科幻",
        "霓虹"
      ],
      "data": {
        "art_style": "赛博朋克 + 写实 3D，雨夜霓虹城市，高对比度光影",
        "character_design": "主角：皮衣 + 义体改造；NPC：按阶层区分（穹顶洁净/下层脏污）",
        "environment_design": "三层都市：穹顶（洁净白）/ 都市带（霓虹紫）/ 废弃区（暗红）",
        "ui_design_language": "全息 UI + 故障字体 + 数据流背景",
        "color_system": "主色：霓虹紫（#9D4EDD）；辅色：电子蓝（#00F5FF）；点缀：警示红（#FF003C）；背景：深黑（#0A0A0F）",
        "typography": "标题：Orbitron；正文：Roboto；中文：思源黑体",
        "vfx": "全息投影 + 故障特效 + 雨水反射",
        "animation": "写实动作 + 战术动画，枪械参考真实武器",
        "multi_resolution": "支持 1080P/2K/4K，启用 DLSS/FSR 提升性能"
      }
    },
    {
      "name": "治愈系卡通美术",
      "description": "柔和色彩的治愈系卡通风格",
      "tags": [
        "治愈",
        "卡通",
        "柔和"
      ],
      "data": {
        "art_style": "Q 版卡通渲染 + 手绘质感，柔和色彩 + 圆润造型",
        "character_design": "3 头身 Q 版，圆润造型，表情夸张可爱",
        "environment_design": "小镇、田野、森林，采用低多边形 + 手绘贴图",
        "ui_design_language": "圆角 UI + 手绘图标 + 暖色调",
        "color_system": "主色：奶油黄（#F4E1B8）；辅色：薄荷绿（#A8D8B9）；点缀：樱花粉（#F4C2D0）；背景：天空蓝（#B5D8EB）",
        "typography": "标题：站酷快乐体；正文：思源黑体；UI：圆体",
        "vfx": "粒子光点 + 心形特效 + 柔光过渡",
        "animation": "Q 版弹性动画 + 夸张表情",
        "multi_resolution": "支持 720P/1080P，移动端友好"
      }
    }
  ]
