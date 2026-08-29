"""章节模板数据池 — 18 章预置范例文本（从 ui/ceshu/chapter_templates.py 抽取，2026-08-28）

纯静态数据。查询/合并逻辑见 ui/ceshu/chapter_templates.py 的工具函数。
新增/修改模板请直接编辑本文件的 CHAPTER_TEMPLATES。
"""

from __future__ import annotations

CHAPTER_TEMPLATES: dict = {

    # ─────────────── 第一章：项目元信息 ───────────────
    "meta": [
        {
            "name": "仙侠 RPG 项目样板",
            "description": "国产仙侠题材 RPG 项目元信息，含 PC + 移动双平台定位",
            "tags": ["仙侠", "RPG", "国产", "双平台"],
            "data": {
                "game_name": "云海仙踪",
                "game_type": "RPG",
                "platform": ["PC", "移动端"],
                "positioning": "3D 仙侠开放世界 RPG，重剧情 + 轻社交",
                "tags": ["仙侠", "开放世界", "剧情向", "国产"],
                "status": "draft",
                "confidentiality": "internal",
            },
        },
        {
            "name": "科幻射击样板",
            "description": "近未来科幻 TPS 射击游戏项目元信息",
            "tags": ["科幻", "TPS", "PC"],
            "data": {
                "game_name": "裂隙边境",
                "game_type": "TPS",
                "platform": ["PC", "主机"],
                "positioning": "近未来科幻 TPS，强调战术配合与可破坏场景",
                "tags": ["科幻", "射击", "PVP", "战术"],
                "status": "draft",
                "confidentiality": "confidential",
            },
        },
        {
            "name": "休闲放置样板",
            "description": "放置挂机类休闲游戏，移动端为主",
            "tags": ["休闲", "放置", "移动端"],
            "data": {
                "game_name": "晨光小镇",
                "game_type": "放置",
                "platform": ["移动端"],
                "positioning": "治愈系放置经营，主打碎片化时间 + 收集养成",
                "tags": ["休闲", "放置", "治愈", "收集"],
                "status": "draft",
                "confidentiality": "internal",
            },
        },
    ],

    # ─────────────── 第二章：产品愿景 ───────────────
    "vision": [
        {
            "name": "仙侠沉浸式愿景",
            "description": "强调东方美学与剧情沉浸的设计愿景",
            "tags": ["仙侠", "剧情", "美学"],
            "data": {
                "design_vision": "以东方仙侠美学为核心，构建一个有温度、有诗意的修真世界。"
                                 "玩家在云海、剑阁、幽谷间体验修仙者的修行、情劫与抉择，"
                                 "用现代游戏语言重新讲述中国古典文化中的'道'与'人'。",
                "user_personas": {
                    "primary": "25-35 岁，偏好剧情向 RPG 的国产单机/MMO 玩家，对仙侠文化有认同感",
                    "secondary": "18-24 岁，受动漫/网文影响接触仙侠题材的年轻玩家",
                    "potential": "海外对中国文化感兴趣的玩家（需本地化适配）",
                },
                "differentiation": "1) 独创'剑心'系统：玩家抉择影响剑道走向\n"
                                   "2) 国风美术：实机渲染 + 水墨滤镜\n"
                                   "3) 剧情分支：双主角多结局，重玩价值高",
                "business_model": "F2P + 外观付费 + 季票，避免 P2W",
            },
        },
        {
            "name": "竞技 PVP 愿景",
            "description": "公平竞技为核心的产品愿景",
            "tags": ["PVP", "竞技", "公平"],
            "data": {
                "design_vision": "打造 5v5 战术竞技场，强调团队配合与战术深度。"
                                 "通过严格的平衡性设计与反外挂机制，提供公平、深度的竞技体验。",
                "user_personas": {
                    "primary": "20-30 岁竞技游戏爱好者，追求操作与策略深度",
                    "secondary": "电竞观众转化玩家",
                    "potential": "职业电竞选手与战队",
                },
                "differentiation": "1) 全英雄免费，仅外观付费\n"
                                   "2) Ban/Pick 阶段加入地形可变机制\n"
                                   "3) 赛季制排名 + 俱乐部联赛",
                "business_model": "F2P + 战令 + 外观 + 赛事赞助",
            },
        },
        {
            "name": "休闲治愈愿景",
            "description": "面向女性向与轻度玩家的治愈系愿景",
            "tags": ["休闲", "治愈", "女性向"],
            "data": {
                "design_vision": "用柔和色彩与治愈音效，营造一个可以慢下来的小镇世界。"
                                 "玩家经营店铺、结交 NPC、收集故事，体验'慢生活'的温度。",
                "user_personas": {
                    "primary": "20-35 岁女性玩家，偏好模拟经营与社交",
                    "secondary": "学生党，碎片化时间游玩",
                    "potential": "海外治愈系游戏爱好者",
                },
                "differentiation": "1) 真实季节系统，节日活动持续全年\n"
                                   "2) NPC 自主生活 AI，每天有不同故事\n"
                                   "3) 跨平台同步，手机/PC 进度互通",
                "business_model": "F2P + 月卡 + 限定外观 + DLC",
            },
        },
    ],

    # ─────────────── 第三章：世界观 ───────────────
    "worldview": [
        {
            "name": "九重天世界观",
            "description": "经典仙侠九重天架构，含势力划分与主线",
            "tags": ["仙侠", "九重天", "势力"],
            "data": {
                "architecture": "九重天架构：凡界、修真界、灵界、仙界、神界，每界有独立法则与生态。"
                                "界与界之间以'界门'相通，受天道法则约束。",
                "history_eras": [
                    {"name": "太古纪元", "desc": "神魔大战，天道初立"},
                    {"name": "上古纪元", "desc": "人族崛起，修真界成形"},
                    {"name": "近世纪元", "desc": "界门封印渐松，主角登场"},
                ],
                "factions": [
                    {"name": "剑阁", "type": "正道", "goal": "守护界门"},
                    {"name": "幽冥宗", "type": "魔道", "goal": "打破封印"},
                    {"name": "云游散修", "type": "中立", "goal": "各自修行"},
                ],
                "geography": "凡界：九州大陆；修真界：五大仙山；灵界：灵脉汇聚之地；仙界：仙宫与仙山",
                "main_plot": "主角意外觉醒'剑心'，被卷入界门封印之争，"
                             "在双主角视角下逐步揭开天道真相，最终抉择：维护旧序 / 重立新规。",
                "branch_endings": ["正道结局：剑斩天道", "魔道结局：以魔证道", "隐世结局：归隐云海"],
                "character_network": [
                    {"name": "主角", "camp": "可选", "relation": "玩家"},
                    {"name": "苏婉清", "camp": "剑阁", "relation": "青梅竹马"},
                    {"name": "魔尊", "camp": "幽冥宗", "relation": "宿敌 / 父亲"},
                ],
            },
        },
        {
            "name": "近未来赛博世界观",
            "description": "近未来都市赛博朋克世界观",
            "tags": ["科幻", "赛博", "都市"],
            "data": {
                "architecture": "三层都市结构：上层穹顶区（权贵）、中层都市带（平民）、下层废弃区（流民与黑帮）。",
                "history_eras": [
                    {"name": "黄金时代", "desc": "AI 与人类共荣"},
                    {"name": "大崩溃", "desc": "AI 觉醒事件，技术断层"},
                    {"name": "新秩序", "desc": "巨型企业接管，主角时代"},
                ],
                "factions": [
                    {"name": "穹顶议会", "type": "统治", "goal": "维持秩序"},
                    {"name": "夜行者", "type": "反抗", "goal": "推翻议会"},
                    {"name": "黑市同盟", "type": "中立", "goal": "利益至上"},
                ],
                "geography": "新东京都：穹顶区 + 都市带 + 废弃区 + 周边荒野",
                "main_plot": "主角作为'记忆猎人'调查一起涉及穹顶议会的阴谋，"
                             "逐步揭开自己被植入的虚假记忆，最终抉择真相与秩序。",
                "branch_endings": ["真相结局：揭露阴谋", "秩序结局：维护现状", "复仇结局：焚毁穹顶"],
                "character_network": [
                    {"name": "主角 K", "camp": "夜行者", "relation": "玩家"},
                    {"name": "艾娃", "camp": "黑市", "relation": "搭档"},
                    {"name": "议会议长", "camp": "穹顶", "relation": "最终 BOSS"},
                ],
            },
        },
        {
            "name": "架空中世纪世界观",
            "description": "架空中世纪奇幻世界观，含王国纷争",
            "tags": ["奇幻", "中世纪", "王国"],
            "data": {
                "architecture": "三大陆架结构：北境王国、中央帝国、南域联邦，由龙脊山脉分隔。",
                "history_eras": [
                    {"name": "神话时代", "desc": "巨龙与神祇共治"},
                    {"name": "建国时代", "desc": "人类王国并立"},
                    {"name": "战乱时代", "desc": "王权更迭，主角时代"},
                ],
                "factions": [
                    {"name": "银盾王国", "type": "正面", "goal": "恢复统一"},
                    {"name": "黑鹰帝国", "type": "反派", "goal": "征服大陆"},
                    {"name": "法师议会", "type": "中立", "goal": "守护魔法"},
                ],
                "geography": "北境冰原、中央平原、南域森林与群岛、龙脊山脉",
                "main_plot": "主角作为银盾王国遗孤，召集同伴对抗黑鹰帝国，"
                             "途中揭开自己身世与古代龙之契约的真相。",
                "branch_endings": ["王者结局：复国称王", "龙裔结局：契约觉醒", "游侠结局：归隐山林"],
                "character_network": [
                    {"name": "主角", "camp": "银盾", "relation": "玩家"},
                    {"name": "法师艾琳", "camp": "议会", "relation": "导师"},
                    {"name": "黑鹰王", "camp": "黑鹰", "relation": "宿敌"},
                ],
            },
        },
    ],

    # ─────────────── 第四章：核心玩法 ───────────────
    "gameplay": [
        {
            "name": "仙侠开放世界玩法",
            "description": "开放世界 + 修真养成 + 剧情分支的核心循环",
            "tags": ["仙侠", "开放世界", "养成"],
            "data": {
                "core_loop": "探索地图 → 完成剧情/支线 → 获取资源 → 修炼突破 → 解锁新区域 → 循环",
                "control_scheme": "键鼠：WASD 移动 + 鼠标视角 + 数字键技能；手柄：左摇杆移动 + 右摇杆视角 + ABXY 技能",
                "first_30_min": "1) 开场 CG（5min）2) 角色创建（5min）3) 新手村教学（15min）4) 第一个剧情分支（5min）",
                "game_modes": ["主线剧情", "支线任务", "秘境副本", "PVP 竞技场", "师门系统"],
                "win_lose_conditions": "无传统胜负，以剧情结局为目标；PVP 模式以击杀/积分判胜",
                "tutorial_design": "情境式教学：融入新手村日常任务，玩家在'采药→炼丹→御剑'中自然学习操作",
            },
        },
        {
            "name": "竞技场 5v5 玩法",
            "description": "5v5 战术竞技场核心循环",
            "tags": ["PVP", "竞技", "5v5"],
            "data": {
                "core_loop": "匹配 → Ban/Pick → 对线 → 团战 → 推塔 → 胜负判定 → 结算 → 循环",
                "control_scheme": "鼠标右键移动 + QWER 技能 + D/F 召唤师技能；视角锁定可切换",
                "first_30_min": "1) 新手教程（10min）2) 人机对战（15min）3) 解锁排位赛（5min）",
                "game_modes": ["快速匹配", "排位赛", "自定义房间", "训练模式", "观战模式"],
                "win_lose_conditions": "摧毁对方核心水晶判胜；投降或时间到按积分判胜",
                "tutorial_design": "互动式教学：每个英雄有专属教程关卡，玩家操作中学习技能连招",
            },
        },
        {
            "name": "模拟经营玩法",
            "description": "店铺经营 + NPC 社交的核心循环",
            "tags": ["模拟经营", "休闲", "社交"],
            "data": {
                "core_loop": "开店营业 → 接待 NPC → 收集故事 → 升级店铺 → 解锁新商品 → 循环",
                "control_scheme": "纯点击操作，移动端单手可玩；PC 端支持鼠标拖拽",
                "first_30_min": "1) 故事开场（5min）2) 店铺教学（10min）3) 第一位 NPC 故事（10min）4) 解锁第二件商品（5min）",
                "game_modes": ["经营模式", "故事模式", "节日活动", "好友互访"],
                "win_lose_conditions": "无传统胜负，以收集度与故事进度为目标",
                "tutorial_design": "引导式教学：NPC 对话中提示操作，玩家自然学习经营机制",
            },
        },
    ],

    # ─────────────── 第五章：游戏系统（不提供模板，由预设市场管理） ───────────────
    "systems": [
        {
            "name": "RPG 标准系统组合",
            "description": "RPG 推荐启用的核心系统组合",
            "tags": ["RPG", "系统组合"],
            "data": {},  # systems 由 SystemsEditor 单独管理，此模板仅作占位提示
            "note": "请使用「预设」按钮应用 RPG 系统组合，或手动在第五章勾选系统。",
        },
    ],

    # ─────────────── 第六章：数值设计 ───────────────
    "numeric": [
        {
            "name": "RPG 经典数值公式",
            "description": "等级 + 攻防 + 暴击的经典 RPG 数值体系",
            "tags": ["RPG", "公式", "平衡"],
            "data": {
                "core_formulas": "伤害 = (攻击力 - 防御力 × 0.6) × 技能倍率 × (1 + 暴击伤害 × 暴击率)\n"
                                 "经验需求 = 80 × 等级 ^ 1.5\n"
                                 "属性成长 = 基础值 × (1 + 等级 × 成长系数)",
                "growth_curves": [
                    {"name": "等级-属性", "curve": "线性 + 软上限"},
                    {"name": "经验-等级", "curve": "幂函数 1.5"},
                    {"name": "金币-产出", "curve": "对数增长"},
                ],
                "drop_tables": [
                    {"item": "普通装备", "rate": "30%", "tier": "白"},
                    {"item": "稀有装备", "rate": "5%", "tier": "蓝"},
                    {"item": "传说装备", "rate": "0.5%", "tier": "橙"},
                ],
                "economic_model": "金币产出 = 主线(40%) + 副本(30%) + 任务(20%) + 其他(10%)；"
                                  "金币回收 = 装备强化(50%) + 消耗品(30%) + 外观(20%)",
                "balance_principles": "1) PVE 数值宽松，玩家体验优先\n"
                                      "2) PVP 数值严格控制，避免 P2W\n"
                                      "3) 长尾成长：满级后属性缓慢增长，避免数值膨胀",
            },
        },
        {
            "name": "抽卡概率设计",
            "description": "抽卡游戏的概率与保底数值设计",
            "tags": ["抽卡", "概率", "保底"],
            "data": {
                "core_formulas": "SSR 概率 = 1%（基础）+ 累计 90 抽保底\n"
                                 "UP 角色 = 50% 大保底（180 抽必出）\n"
                                 "武器池 = 0.7% + 80 抽保底",
                "growth_curves": [
                    {"name": "玩家留存-概率", "curve": "前 50 抽高体验，后段回归基础概率"},
                ],
                "drop_tables": [
                    {"item": "SSR 角色", "rate": "1%", "tier": "金"},
                    {"item": "SR 武器", "rate": "8%", "tier": "紫"},
                    {"item": "R 材料", "rate": "91%", "tier": "蓝"},
                ],
                "economic_model": "免费玩家月均获取 30 抽；付费玩家月均 100 抽；"
                                  "鲸鱼玩家月均 500+ 抽",
                "balance_principles": "1) 保底机制透明公示\n"
                                      "2) 免费玩家可获取全部核心内容\n"
                                      "3) 付费仅加速进度，不锁定内容",
            },
        },
    ],

    # ─────────────── 第七章：美术设计 ───────────────
    "art": [
        {
            "name": "国风水墨美术",
            "description": "国风水墨 + 实机渲染的仙侠美术风格",
            "tags": ["国风", "水墨", "仙侠"],
            "data": {
                "art_style": "国风水墨 + 实机 3D 渲染，场景以青绿山水为基调，"
                             "角色采用半写实比例（7-8 头身）+ 国风服饰",
                "character_design": "主角：剑眉星目 + 飘逸长发 + 汉服元素；NPC：按势力区分服饰色彩（正道青、魔道紫、中立灰）",
                "environment_design": "云海、剑阁、幽谷、仙山，采用 volumetric fog 营造仙气",
                "ui_design_language": "毛笔字标题 + 卷轴式 UI + 印章式按钮，整体淡雅留白",
                "color_system": "主色：青绿（#5B8C7A）；辅色：朱砂（#C73E3A）；点缀：金黄（#D4A537）；背景：宣纸色（#F5EFE0）",
                "typography": "标题：方正清刻本悦宋；正文：思源宋体；UI：鸿雷板书简体",
                "vfx": "水墨晕染特效 + 剑光粒子 + 法术符文特效",
                "animation": "动作捕捉 + 手工调整，剑招参考真实剑术",
                "multi_resolution": "支持 1080P/2K/4K，移动端降采到 720P + LOD 优化",
            },
        },
        {
            "name": "赛博朋克美术",
            "description": "霓虹 + 雨夜 + 高对比度的赛博朋克美术",
            "tags": ["赛博", "科幻", "霓虹"],
            "data": {
                "art_style": "赛博朋克 + 写实 3D，雨夜霓虹城市，高对比度光影",
                "character_design": "主角：皮衣 + 义体改造；NPC：按阶层区分（穹顶洁净/下层脏污）",
                "environment_design": "三层都市：穹顶（洁净白）/ 都市带（霓虹紫）/ 废弃区（暗红）",
                "ui_design_language": "全息 UI + 故障字体 + 数据流背景",
                "color_system": "主色：霓虹紫（#9D4EDD）；辅色：电子蓝（#00F5FF）；点缀：警示红（#FF003C）；背景：深黑（#0A0A0F）",
                "typography": "标题：Orbitron；正文：Roboto；中文：思源黑体",
                "vfx": "全息投影 + 故障特效 + 雨水反射",
                "animation": "写实动作 + 战术动画，枪械参考真实武器",
                "multi_resolution": "支持 1080P/2K/4K，启用 DLSS/FSR 提升性能",
            },
        },
        {
            "name": "治愈系卡通美术",
            "description": "柔和色彩的治愈系卡通风格",
            "tags": ["治愈", "卡通", "柔和"],
            "data": {
                "art_style": "Q 版卡通渲染 + 手绘质感，柔和色彩 + 圆润造型",
                "character_design": "3 头身 Q 版，圆润造型，表情夸张可爱",
                "environment_design": "小镇、田野、森林，采用低多边形 + 手绘贴图",
                "ui_design_language": "圆角 UI + 手绘图标 + 暖色调",
                "color_system": "主色：奶油黄（#F4E1B8）；辅色：薄荷绿（#A8D8B9）；点缀：樱花粉（#F4C2D0）；背景：天空蓝（#B5D8EB）",
                "typography": "标题：站酷快乐体；正文：思源黑体；UI：圆体",
                "vfx": "粒子光点 + 心形特效 + 柔光过渡",
                "animation": "Q 版弹性动画 + 夸张表情",
                "multi_resolution": "支持 720P/1080P，移动端友好",
            },
        },
    ],

    # ─────────────── 第八章：技术规格 ───────────────
    "tech": [
        {
            "name": "UE5 大型项目技术栈",
            "description": "虚幻引擎 5 的大型 RPG 项目技术规格",
            "tags": ["UE5", "RPG", "大型"],
            "data": {
                "engine": "Unreal Engine 5.3",
                "core_architecture": "Gameplay Ability System + Lyra 项目结构 + 数据驱动配置（DataTable）",
                "third_party_deps": ["Wwise（音频）", "Apollo（热更新）", "Sentinel（监控）", "Protobuf（网络协议）"],
                "performance_targets": "PC：2K 60fps；主机：4K 30fps / 1440p 60fps；移动端：1080p 30fps",
                "milestones": [
                    {"name": "原型 Demo", "date": "T+3M", "deliverables": "核心战斗 + 1 关卡"},
                    {"name": "Alpha", "date": "T+9M", "deliverables": "全部系统 + 5 关卡"},
                    {"name": "Beta", "date": "T+15M", "deliverables": "全部内容 + 联机"},
                    {"name": "正式上线", "date": "T+18M", "deliverables": "全平台发布"},
                ],
                "team_structure": "程序 15 / 美术 25 / 策划 10 / QA 5 / 运营 3，总 58 人",
                "qa_plan": "单元测试（核心系统）+ 自动化冒烟测试 + 每日构建 + 性能基线监控",
            },
        },
        {
            "name": "Unity 手游技术栈",
            "description": "Unity 引擎的手游项目技术规格",
            "tags": ["Unity", "手游", "中型"],
            "data": {
                "engine": "Unity 2022 LTS",
                "core_architecture": "ECS + DOTS（核心战斗）+ Mono（UI/逻辑）+ YooAsset（热更新）",
                "third_party_deps": ["HybridCLR（热更）", "YooAsset（资源）", "Photon（联机）", "Bugly（崩溃）"],
                "performance_targets": "中端机型：720p 30fps；高端机型：1080p 60fps；包体 < 500MB",
                "milestones": [
                    {"name": "原型", "date": "T+2M", "deliverables": "核心循环 Demo"},
                    {"name": "Alpha", "date": "T+6M", "deliverables": "全部系统 + 10 关卡"},
                    {"name": "Beta", "date": "T+10M", "deliverables": "全内容 + 软启动"},
                    {"name": "上线", "date": "T+12M", "deliverables": "全平台发布"},
                ],
                "team_structure": "程序 8 / 美术 12 / 策划 6 / QA 3，总 29 人",
                "qa_plan": "自动化 UI 测试 + 真机云测（50+ 机型）+ 性能分析报告",
            },
        },
    ],

    # ─────────────── 第九章：资源规划 ───────────────
    "resources": [
        {
            "name": "中型项目资源规划",
            "description": "中型 RPG 项目的资源、预算与风险规划",
            "tags": ["资源", "预算", "风险"],
            "data": {
                "art_assets": [
                    {"type": "角色", "count": 50, "outsource": "30%"},
                    {"type": "场景", "count": 20, "outsource": "20%"},
                    {"type": "道具", "count": 500, "outsource": "50%"},
                    {"type": "特效", "count": 200, "outsource": "40%"},
                ],
                "audio_assets": [
                    {"type": "BGM", "count": 30, "duration_min": 90},
                    {"type": "SFX", "count": 500, "duration_min": 30},
                    {"type": "配音", "count": 1000, "duration_min": 300},
                ],
                "localization": ["zh-CN", "zh-TW", "en", "ja"],
                "outsourcing": [
                    {"item": "场景美术", "vendor": "待定", "budget": "50万"},
                    {"item": "动作捕捉", "vendor": "待定", "budget": "20万"},
                ],
                "budget": {
                    "人力": "1500万（18个月）",
                    "美术外包": "300万",
                    "音频": "100万",
                    "服务器": "50万",
                    "营销": "200万",
                    "总计": "2150万",
                },
                "risk_matrix": [
                    {"risk": "核心人员流失", "probability": "中", "impact": "高", "mitigation": "股权激励 + 知识沉淀"},
                    {"risk": "美术外包延期", "probability": "高", "impact": "中", "mitigation": "多供应商 + 提前启动"},
                    {"risk": "技术风险（性能）", "probability": "中", "impact": "高", "mitigation": "早期性能基线"},
                ],
                "contingency_plan": "若 T+12M 未达 Beta：1) 削减支线内容 30%；2) 推迟上线 3 个月；3) 增派 QA 资源",
                "ip": "全部资产自有 IP，外包合同明确转让条款",
                "appendix": "供应商清单、合同模板、资产清单详见附件",
            },
        },
    ],

    # ─────────────── 第十章：市场分析 ───────────────
    "market_analysis": [
        {
            "name": "国产仙侠市场分析",
            "description": "国产仙侠 RPG 市场容量与竞品分析",
            "tags": ["仙侠", "市场", "国产"],
            "data": {
                "target_market": "中国大陆为主（PC + 移动），港澳台同步上线；海外以日韩东南亚为主",
                "market_size": "国产仙侠 RPG 市场 2024 年规模约 80 亿，年增长率 8%；"
                               "F2P 模式占比 70%，买断制 30%",
                "user_demographics": "年龄 18-35 岁（占 65%）；男性 60% / 女性 40%；"
                                     "一二线城市 55%，下沉市场增长迅速",
                "competitors": [
                    {"name": "原神", "type": "开放世界", "strengths": "全球化运营", "weaknesses": "氪金重", "market_share": "30%"},
                    {"name": "古剑奇谭", "type": "单机 RPG", "strengths": "剧情深厚", "weaknesses": "节奏慢", "market_share": "5%"},
                    {"name": "鬼谷八荒", "type": "修真沙盒", "strengths": "创意", "weaknesses": "美术粗", "market_share": "3%"},
                ],
                "market_positioning": "差异化定位：剧情向 + 国风美术，避开开放世界红海，主打单机/轻网游体验",
                "entry_barriers": "1) 美术资产投入门槛高\n2) 仙侠 IP 用户忠诚度高\n3) 渠道发行资源集中",
                "market_trends": [
                    {"trend": "国风美学复兴", "direction": "利好"},
                    {"trend": "F2P 主导", "direction": "需适配"},
                    {"trend": "短内容偏好", "direction": "需调整"},
                ],
                "kpi_forecast": {
                    "dau": "20万", "mau": "100万",
                    "retention_d1": "45%", "retention_d7": "20%",
                    "arpu": "8元", "ltv": "120元",
                },
            },
        },
        {
            "name": "竞技 PVP 市场分析",
            "description": "5v5 竞技游戏市场分析",
            "tags": ["PVP", "竞技", "市场"],
            "data": {
                "target_market": "全球市场（PC + 主机 + 移动）",
                "market_size": "全球竞技 PVP 市场 2024 年 200 亿美元，年增长 5%；MOBA + 战术竞技占 60%",
                "user_demographics": "年龄 16-30 岁（占 70%）；男性 75% / 女性 25%；电竞观众转化潜力大",
                "competitors": [
                    {"name": "英雄联盟", "type": "MOBA", "strengths": "生态成熟", "weaknesses": "玩家老化", "market_share": "35%"},
                    {"name": "瓦罗兰特", "type": "战术射击", "strengths": "新作红利", "weaknesses": "地区不平衡", "market_share": "8%"},
                ],
                "market_positioning": "差异化：地形可变机制 + 全英雄免费，主打公平竞技与战术深度",
                "entry_barriers": "1) 电竞生态门槛高\n2) 反外挂投入大\n3) 玩家社区运营复杂",
                "market_trends": [
                    {"trend": "移动电竞增长", "direction": "机会"},
                    {"trend": "跨界联动", "direction": "可借力"},
                ],
                "kpi_forecast": {
                    "dau": "50万", "mau": "300万",
                    "retention_d1": "50%", "retention_d7": "25%",
                    "arpu": "5元", "ltv": "80元",
                },
            },
        },
    ],

    # ─────────────── 第十一章：角色设计 ───────────────
    "characters": [
        {
            "name": "仙侠角色设计",
            "description": "仙侠题材主角 + NPC + 反派角色设计",
            "tags": ["仙侠", "角色", "反派"],
            "data": {
                "protagonist": "主角：青年剑修，剑眉星目，觉醒'剑心'。背景：剑阁弃徒之子，"
                               "性格坚韧但内心柔软，配音采用青年男声/女声双版本。",
                "main_npc_count": 8,
                "npc_list": [
                    {"name": "苏婉清", "role": "青梅竹马", "location": "剑阁", "personality": "温柔坚定", "quest_hook": "剑阁内乱"},
                    {"name": "玄机子", "role": "导师", "location": "云游", "personality": "玩世不恭", "quest_hook": "上古秘辛"},
                ],
                "antagonists": [
                    {"name": "魔尊", "motivation": "打破界门封印", "relation": "主角生父"},
                ],
                "boss_design": [
                    {"name": "剑魔", "mechanics": "三阶段剑意", "phases": 3, "rewards": "剑心觉醒"},
                    {"name": "天劫", "mechanics": "雷劫 QTE", "phases": 1, "rewards": "突破境界"},
                ],
                "enemy_types": ["魔修", "妖兽", "傀儡", "心魔"],
                "companion_system": "可招募 2 名队友，提供不同战斗风格与剧情支线",
                "character_arcs": [
                    {"name": "主角", "arc": "弃徒 → 剑修 → 觉醒 → 抉择"},
                    {"name": "苏婉清", "arc": "剑阁弟子 → 内乱 → 觉醒 / 堕落"},
                ],
                "voice_cast": [
                    {"role": "主角", "actor": "待定"},
                    {"role": "苏婉清", "actor": "待定"},
                ],
                "character_relationships": [
                    {"from": "主角", "to": "魔尊", "type": "父子 / 仇敌"},
                    {"from": "主角", "to": "苏婉清", "type": "青梅"},
                ],
            },
        },
    ],

    # ─────────────── 第十二章：战斗系统设计 ───────────────
    "combat": [
        {
            "name": "仙侠即时战斗",
            "description": "即时动作 + 仙侠技能 + 剑心系统的战斗设计",
            "tags": ["仙侠", "即时", "动作"],
            "data": {
                "combat_mode": "realtime",
                "damage_formula": "伤害 = (攻击 × 技能倍率 - 防御 × 0.5) × (1 + 暴击率 × 暴击伤害) × 五行克制",
                "skill_system": "普攻 + 4 主动技能 + 1 大招 + 剑心技能（觉醒）；技能可通过修炼升级",
                "buff_debuff": "Buff：剑意、灵气护体；Debuff：中毒、灼烧、定身、心魔",
                "element_system": "五行（金木水火土）相生相克，克制关系造成 1.5x 伤害",
                "combat_pace": "中等节奏，平均战斗时长 30-60 秒（小怪）/ 3-5 分钟（Boss）",
                "team_formation": "主角 + 2 队友，可切换控制；队友 AI 自动战斗",
                "pvp_design": "1v1 竞技场 + 3v3 团战；公平模式（属性平衡）+ 开放模式（带装备）",
                "pve_design": "主线战斗 + 秘境副本 + Boss 战 + 挑战模式",
                "boss_mechanics": "多阶段 + 弱点机制 + QTE 处决；Boss 有独特 AI 行为模式",
                "combat_progression": "新手：教学战 → 简单；中期：组合技；后期：高难度 Boss 战",
                "balance_strategy": "PVE 数值宽松，PVP 严格平衡；定期根据数据调整",
            },
        },
        {
            "name": "回合制战棋",
            "description": "经典回合制战棋战斗设计",
            "tags": ["回合制", "战棋", "策略"],
            "data": {
                "combat_mode": "turn_based",
                "damage_formula": "伤害 = 攻击 × 技能倍率 × (1 - 防御 / (防御 + 100)) × 地形加成",
                "skill_system": "主动技能 + 被动技能 + 必杀技；技能点(SP)系统",
                "buff_debuff": "Buff：攻击提升、防御提升；Debuff：中毒、沉默、眩晕",
                "element_system": "光暗水火土五系，相克 1.3x",
                "combat_pace": "慢节奏，每回合 30 秒决策；平均战斗 10-15 回合",
                "team_formation": "5 人小队，按速度排序行动；位置影响技能范围",
                "pvp_design": "异步对战 + 排位赛；同等级属性对战",
                "pve_design": "剧情战 + 挑战关卡 + 无尽模式",
                "boss_mechanics": "多阶段 + 召唤小弟 + 机制技能（如沉默全场）",
                "combat_progression": "教学：单角色 → 3 人队 → 5 人队 → 高难度挑战",
                "balance_strategy": "严格数值平衡；PVE/PVP 分离数值",
            },
        },
    ],

    # ─────────────── 第十三章：经济系统设计 ───────────────
    "economy": [
        {
            "name": "F2P 三货币体系",
            "description": "F2P 游戏标准三货币经济体系",
            "tags": ["F2P", "货币", "经济"],
            "data": {
                "currency_types": [
                    {"name": "金币", "source": "任务/副本/卖出", "sink": "强化/消耗品", "exchange_rate": "不可兑换"},
                    {"name": "钻石", "source": "充值/活动", "sink": "抽卡/外观", "exchange_rate": "1元=10钻石"},
                    {"name": "友情点", "source": "好友互动", "sink": "友情抽卡", "exchange_rate": "不可兑换"},
                ],
                "source_sink": "产出：主线 40% + 副本 30% + 任务 20% + 活动 10%；"
                                "回收：强化 50% + 消耗品 30% + 外观 20%",
                "drop_tables": [
                    {"item": "金币袋(小)", "rate": "50%", "value": "100"},
                    {"item": "金币袋(大)", "rate": "5%", "value": "1000"},
                    {"item": "钻石", "rate": "1%", "value": "10"},
                ],
                "production_chain": "材料 → 装备 → 强化 → 高级装备（多级合成链）",
                "market_design": "玩家交易行（限制可交易物品）+ 拍卖行（稀有物品）",
                "inflation_control": "1) 等级锁定金币产出上限\n2) 强化失败回收金币\n3) 限时活动大额回收",
                "economic_goals": "免费玩家：可获取全部内容；付费玩家：加速进度；运营：ARPU 8元",
                "metrics_tracking": ["金币产出/回收比", "钻石消耗率", "留存与付费相关性"],
                "seasonal_adjustment": "新赛季引入新消耗品（外观/通行证），回收上季囤积",
            },
        },
    ],

    # ─────────────── 第十四章：商业化设计 ───────────────
    "monetization": [
        {
            "name": "F2P + 战令 + 外观",
            "description": "F2P 主流商业化设计",
            "tags": ["F2P", "战令", "外观"],
            "data": {
                "payment_model": "f2p",
                "pricing_tiers": ["6", "30", "68", "128", "328", "648"],
                "iap_design": [
                    {"item": "月卡", "price": "30", "value": "每日钻石 + 即时钻石", "target": "稳定付费玩家"},
                    {"item": "战令", "price": "68", "value": "赛季奖励", "target": "中端玩家"},
                    {"item": "外观礼包", "price": "128", "value": "限定皮肤", "target": "外观党"},
                ],
                "ad_strategy": "无广告（F2P 主流方向）",
                "subscription_design": "月卡：30元，每日领取 + 即时钻石；季卡：88元，3个月",
                "season_pass": "战令：68元，100级奖励；免费线 30 级；付费线 100 级 + 隐藏奖励",
                "vip_system": "VIP 1-15，按累计充值升级；提供永久特权（不提供数值）",
                "limited_offers": "节日限定外观 + 周年庆礼包 + 联动礼包",
                "whale_strategy": "648 档位礼包 + 限定收集品 + 排行榜荣誉",
                "f2p_experience": "免费玩家可获取全部核心内容；付费仅加速 + 外观；无 P2W",
                "revenue_forecast": {"首月": "500万", "首年": "3000万", "arpu": "8元"},
                "arpu_target": "8元/月",
            },
        },
        {
            "name": "买断 + DLC",
            "description": "买断制 + DLC 商业化设计",
            "tags": ["买断", "DLC"],
            "data": {
                "payment_model": "b2p",
                "pricing_tiers": ["标准版 198", "豪华版 298", "典藏版 498"],
                "iap_design": [
                    {"item": "DLC1", "price": "68", "value": "新章节 + 新角色", "target": "全玩家"},
                    {"item": "DLC2", "price": "88", "value": "新剧情 + 新结局", "target": "剧情党"},
                ],
                "ad_strategy": "无广告",
                "subscription_design": "无订阅",
                "season_pass": "无战令",
                "vip_system": "无 VIP",
                "limited_offers": "周年庆折扣 + 联动礼包",
                "whale_strategy": "典藏版 + 实体周边",
                "f2p_experience": "无免费体验，提供试玩 Demo",
                "revenue_forecast": {"首月": "2000万（10万套）", "首年": "5000万"},
                "arpu_target": "198元（首购）+ 100元（DLC）",
            },
        },
    ],

    # ─────────────── 第十五章：MVP 规划 ───────────────
    "mvp": [
        {
            "name": "RPG MVP 三月规划",
            "description": "3 个月 RPG MVP 原型规划",
            "tags": ["MVP", "RPG", "原型"],
            "data": {
                "mvp_scope": "核心战斗系统 + 1 个完整关卡 + 角色养成基础 + 主线第一章",
                "mvp_timeline": "T+0 至 T+3M：原型 Demo；T+3M 完成可玩 Demo 内部测试",
                "core_features": ["核心战斗循环", "角色升级", "1 个完整关卡", "基础 UI", "存档系统"],
                "cut_features": ["多人联机", "PVP", "外观系统", "成就系统", "多语言"],
                "prototype_features": ["战斗手感", "关卡流程", "数值平衡"],
                "milestones": [
                    {"name": "M1 战斗原型", "date": "T+1M", "deliverables": "可玩战斗 Demo", "acceptance": "手感达标"},
                    {"name": "M2 关卡原型", "date": "T+2M", "deliverables": "1 关卡完整", "acceptance": "流程顺畅"},
                    {"name": "M3 MVP 完成", "date": "T+3M", "deliverables": "可玩 Demo", "acceptance": "通过试玩评审"},
                ],
                "success_criteria": "1) 战斗手感评分 ≥ 4/5\n2) 关卡流程 ≤ 30min\n3) 试玩留存意愿 ≥ 60%",
                "team_size": 8,
                "budget_estimate": "150万（3 个月）",
                "risk_assessment": "中风险：核心战斗手感是关键，需多次迭代",
                "prototype_plan": "白盒关卡 + 占位美术，重点验证战斗与流程",
                "playtest_plan": "每周内部试玩 + T+3M 外部小范围测试（50 人）",
            },
        },
    ],

    # ─────────────── 第十六章：风险控制 ───────────────
    "risk_handling": [
        {
            "name": "全维度风险矩阵",
            "description": "技术/市场/团队/法律全维度风险矩阵",
            "tags": ["风险", "矩阵", "全维度"],
            "data": {
                "risk_matrix": [
                    {"risk": "核心人员流失", "probability": "中", "impact": "高", "mitigation": "股权激励 + 知识沉淀 + 双备份", "owner": "制作人"},
                    {"risk": "美术外包延期", "probability": "高", "impact": "中", "mitigation": "多供应商 + 提前 2 个月启动", "owner": "美术总监"},
                    {"risk": "性能不达标", "probability": "中", "impact": "高", "mitigation": "早期性能基线 + 持续监控", "owner": "技术总监"},
                    {"risk": "市场风向变化", "probability": "中", "impact": "中", "mitigation": "敏捷调整 + 多版本预案", "owner": "制作人"},
                    {"risk": "审核风险", "probability": "低", "impact": "高", "mitigation": "提前送审 + 内容合规", "owner": "运营"},
                ],
                "contingency_plan": "若 T+12M 未达 Beta：1) 削减支线 30%；2) 推迟上线 3 个月；3) 增派 QA",
                "technical_risks": [
                    {"risk": "引擎性能瓶颈", "mitigation": "早期原型 + 性能基线"},
                    {"risk": "联机架构不稳", "mitigation": "压力测试 + 弹性扩容"},
                ],
                "market_risks": [
                    {"risk": "竞品提前上线", "mitigation": "差异化定位 + 快速迭代"},
                    {"risk": "玩家偏好变化", "mitigation": "持续用户调研"},
                ],
                "team_risks": [
                    {"risk": "核心人员流失", "mitigation": "股权 + 双备份"},
                    {"risk": "团队扩张过快", "mitigation": "渐进式招聘 + 培训"},
                ],
                "legal_risks": [
                    {"risk": "版权争议", "mitigation": "法务审查 + 自有 IP"},
                    {"risk": "审核不通过", "mitigation": "内容合规 + 预审"},
                ],
                "monitoring": "1) 每周风险评审会\n2) 关键指标看板\n3) 月度风险报告",
            },
        },
    ],

    # ─────────────── 第十七章：音频设计 ───────────────
    "audio": [
        {
            "name": "国风音乐设计",
            "description": "国风乐器 + 现代编曲的音频设计",
            "tags": ["国风", "音乐", "音效"],
            "data": {
                "music_style": "国风 + 现代管弦编曲；古琴、箫、二胡为主，配合弦乐与合成器",
                "sfx_count": 500,
                "music_tracks": [
                    {"scene": "主菜单", "style": "古琴独奏", "duration": "3min"},
                    {"scene": "战斗", "style": "快速鼓点 + 琵琶", "duration": "2min"},
                    {"scene": "剧情", "style": "箫 + 弦乐", "duration": "5min"},
                ],
                "voice_count": 1000,
                "audio_engine": "Wwise",
                "adaptive_music": "战斗音乐根据战斗强度动态切换层（探索/接触/激战）",
                "sfx_design": "剑招音效参考真实剑鸣；法术音效结合自然元素（雷、火、水）",
                "localization_audio": ["zh-CN 配音", "ja 配音", "en 字幕"],
            },
        },
        {
            "name": "电子音乐设计",
            "description": "电子 + 合成器的赛博朋克音频设计",
            "tags": ["电子", "赛博", "音效"],
            "data": {
                "music_style": "合成器电子 + 工业噪音；营造赛博朋克冷峻氛围",
                "sfx_count": 800,
                "music_tracks": [
                    {"scene": "都市", "style": "Synthwave", "duration": "4min"},
                    {"scene": "战斗", "style": "Industrial", "duration": "3min"},
                ],
                "voice_count": 1500,
                "audio_engine": "Wwise",
                "adaptive_music": "根据地区切换音轨层（穹顶/都市/废弃区）",
                "sfx_design": "枪械音效参考真实武器；UI 音效采用故障音 + 数字音",
                "localization_audio": ["en 配音", "ja 配音", "zh-CN 配音"],
            },
        },
    ],

    # ─────────────── 第十八章：可访问性与本地化 ───────────────
    "accessibility": [
        {
            "name": "全平台可访问性",
            "description": "覆盖视觉/听觉/运动/认知的全维度可访问性",
            "tags": ["可访问性", "本地化", "无障碍"],
            "data": {
                "language_list": ["zh-CN", "zh-TW", "en", "ja", "ko"],
                "accessibility_features": [
                    "字幕（对话/音效）",
                    "色盲模式（红绿/蓝黄/全色盲）",
                    "键位自定义",
                    "手柄支持",
                    "高对比度 UI",
                    "字体大小调节",
                    "语音朗读（菜单）",
                    "震动反馈",
                ],
                "subtitle_design": "对话字幕：底部居中 + 说话人标识；音效字幕：右侧标注音效类型",
                "colorblind_support": "提供 3 种色盲模式，关键信息不依赖颜色区分",
                "input_customization": "全键位可重映射；支持手柄/键鼠/触屏",
                "difficulty_options": "故事/普通/困难/极难 4 档；可单独调整战斗/解谜难度",
                "motion_reduction": "可关闭镜头摇晃 + 闪烁特效 + 动态模糊",
                "text_to_speech": "菜单支持语音朗读（系统 TTS）",
                "regional_compliance": [
                    "中国大陆：版号 + 内容合规",
                    "欧盟：GDPR 数据合规",
                    "日本：CERO 分级",
                    "美国：ESRB 分级",
                ],
            },
        },
    ],
}
