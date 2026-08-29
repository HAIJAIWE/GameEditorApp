"""默认 RPG 类型 schema 工厂

从 type_schema.py 外置，让 type_schema.py 聚焦数据类定义。
被 LibraryManager / TypeEditor / PlanningMigration 共享调用。

每个数据类型一个 _build_<type>_def() 构建函数（2026-08-28 重构拆分）。
"""
from __future__ import annotations

from core.type_schema import TypeDef, TypeField, TypeSchema


def _build_role_def() -> TypeDef:
    return TypeDef(
                id="role", name="角色", plural_key="roles", color="#2196F3",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="角色名称:", type="entry"),
                    TypeField(name="job", label="职业:", type="combobox",
                              values=["战士", "弓箭手", "法师", "枪手"]),
                    TypeField(name="race", label="种族:", type="combobox",
                              values=["人类", "精灵", "兽人", "矮人", "亡灵", "恶魔"]),
                    TypeField(name="faction", label="势力:", type="combobox",
                              values=["联盟", "部落", "中立", "邪恶", "善良"]),
                    TypeField(name="skills", label="技能列表:", type="multiselect", ref_type="skills"),
                    TypeField(name="talents", label="天赋列表:", type="multiselect", ref_type="talents"),
                    TypeField(name="buffs", label="Buff列表:", type="multiselect", ref_type="buffs"),
                    TypeField(name="mechanism", label="特殊机制:", type="desc"),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["坦克", "输出", "辅助", "治疗", "控制"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "{职业} {种族}，来自{势力}。",
                                  "强大的{职业}。",
                                  "{种族} {职业}。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                    TypeField(name="image_tags", label="图片标签:", type="image_tags"),
                ],
                ai_context={
                    "role_description": "你是一位资深角色设计师，擅长构建有血有肉的角色人设，精通种族文化、职业定位和背景故事创作。",
                    "field_descriptions": """- name（角色名称）: 奇幻风格的中文名，如"亚瑟·光刃"
- job（职业）: 战士 / 法师 / 牧师 / 刺客 / 弓箭手 / 骑士 / 召唤师
- race（种族）: 人类 / 精灵 / 兽人 / 矮人 / 亡灵 / 恶魔
- faction（派系）: 联盟 / 部落 / 中立 / 邪恶 / 善良
- skills（技能列表）: JSON数组，每项{"name":"技能名","count":等级}，从技能库选择
- talents（天赋列表）: JSON数组，每项{"name":"天赋名","count":等级}，从天赋库选择
- buffs（Buff列表）: JSON数组，从Buff库选择
- mechanism（特殊机制）: 文本，描述角色的独特被动或触发条件，40-80字
- category（定位分类）: 坦克 / 输出 / 辅助 / 治疗 / 控制
- tags（标签）: 逗号分隔
- desc（角色描述）: 80-150字背景故事""",
                    "special_notes": "不同职业的hp/atk/def要有明显差异！技能和天赋选择必须与职业匹配（战士选近战、法师选法术）。技能数量3-6个，天赋2-4个。",
                    "json_example": [
                        {"id": "JueSe001", "name": "亚瑟·光刃", "job": "战士", "race": "人类", "faction": "联盟", "hp": 1500, "mp": 200, "atk": 220, "def": 180, "skills": [{"name": "圣剑斩击", "count": 5}, {"name": "盾牌格挡", "count": 3}, {"name": "战吼", "count": 2}], "talents": [{"name": "钢铁意志", "count": 3}, {"name": "战斗直觉", "count": 2}], "attr_list": [{"name": "暴击率", "value": 5}], "mechanism": "每当生命值低于30%时，下一次攻击必定暴击，且获得50%减伤持续3秒。", "category": "坦克", "tags": "人类,联盟,圣光", "desc": "王国的第一骑士，手持祖传圣剑守护人民。"},
                        {"id": "JueSe002", "name": "艾琳·月歌", "job": "法师", "race": "精灵", "faction": "中立", "hp": 600, "mp": 1200, "atk": 260, "def": 50, "skills": [{"name": "奥术飞弹", "count": 5}, {"name": "冰霜新星", "count": 4}, {"name": "传送门", "count": 2}, {"name": "法力护盾", "count": 3}], "talents": [{"name": "元素亲和", "count": 4}, {"name": "奥术精通", "count": 3}, {"name": "月光祝福", "count": 2}], "attr_list": [{"name": "施法速度", "value": 10}], "mechanism": "夜间施法消耗降低20%，且所有冰霜系技能有15%概率不消耗法力。", "category": "输出", "tags": "精灵,奥术,学者", "desc": "来自远古森林的精灵学者，精通失传的上古魔法。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个角色，要求：
1. 角色名称要有辨识度，符合其种族和职业设定
2. 职业定位清晰（坦克/输出/辅助/治疗/控制之一）
3. 属性数值平衡，有明确的优势和劣势
4. 技能选择3-6个且必须与职业定位匹配，每个带等级(1-max)
5. 天赋选择2-4个且与技能形成协同效应，每个带等级
6. 设计1个独特机制增强角色辨识度
7. 种族和派系设定要自洽""",
                }
            )


def _build_job_def() -> TypeDef:
    return TypeDef(
                id="job", name="职业", plural_key="jobs", color="#9C27B0",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="职业名称:", type="entry"),
                    TypeField(name="job_tier", label="职业层级:", type="combobox",
                              values=["基础", "进阶"]),
                    TypeField(name="base_job_from", label="来源基础职业:", type="combobox",
                              values=["战士", "弓箭手", "法师", "枪手", "无"]),
                    TypeField(name="type", label="职业定位:", type="combobox",
                              values=["坦克", "输出", "法师", "治疗", "辅助", "控制"]),
                    TypeField(name="desc", label="职业描述:", type="desc"),
                    TypeField(name="weapons", label="可用武器:", type="tags"),
                    TypeField(name="hp_bonus", label="生命加成%:", type="spinbox", from_=-50, to=100),
                    TypeField(name="mp_bonus", label="法力加成%:", type="spinbox", from_=-50, to=100),
                    TypeField(name="atk_bonus", label="攻击加成%:", type="spinbox", from_=-50, to=100),
                    TypeField(name="def_bonus", label="防御加成%:", type="spinbox", from_=-50, to=100),
                    TypeField(name="attr_list", label="属性列表:", type="attrtable"),
                    TypeField(name="mechanism", label="专属机制:", type="desc"),
                    TypeField(name="resource_type", label="资源类型:", type="combobox",
                              values=["法力", "怒气", "能量", "连击点", "无消耗", "生命值", "灵魂碎片", "符文"]),
                    TypeField(name="core_skills", label="核心技能:", type="multiselect", ref_type="skills"),
                    TypeField(name="passives", label="被动技能:", type="multiselect", ref_type="skills"),
                    TypeField(name="difficulty", label="上手难度:", type="combobox",
                              values=["新手", "简单", "普通", "困难", "专家", "大师"]),
                    TypeField(name="playstyle", label="玩法风格:", type="tags"),
                    TypeField(name="inherent_buffs", label="固有Buff:", type="multiselect", ref_type="buffs"),
                    TypeField(name="growth_type", label="成长倾向:", type="combobox",
                              values=["均衡型", "血量型", "攻击型", "法力型", "防御型"]),
                    TypeField(name="skill_types", label="推荐技能类型:", type="tags"),
                    TypeField(name="unlock_condition", label="解锁条件:", type="entry"),
                    TypeField(name="evolve_jobs", label="可转职为:", type="entry"),
                    TypeField(name="tags", label="标签:", type="tags"),
                ],
                ai_context={
                    "role_description": "你是一位RPG游戏职业系统设计师，负责设计职业树结构。包含基础职业（Level 1可选）和进阶职业（转职后获得）。进阶职业继承基础职业的加成并叠加自己的特色。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如ZhiYe001(战士), ZhiYe002(弓箭手)
- name（职业名称）: 简洁的中文名
- job_tier（职业层级）: "基础" = Level 1可选的起始职业 / "进阶" = 转职后的高级职业
- base_job_from（来源基础职业）: 进阶职业必须填写来自哪个基础职业，基础职业选"无"
- type（职业定位）: 坦克 / 输出 / 法师 / 治疗 / 辅助 / 控制
- desc（职业描述）: 30-60字，说明核心特点和玩法风格
- weapons（可用武器）: 逗号分隔，如"剑,斧,盾"
- hp/mp/atk/def_bonus（百分比加成）: -50到100的整数，进阶职业在基础职业之上叠加
- mechanism（专属机制）: 该职业独有的核心战斗机制，如"怒气系统：攻击积累怒气，消耗怒气释放强力技能"
- resource_type（资源类型）: 法力/怒气/能量/连击点/无消耗/生命值/灵魂碎片/符文
- core_skills（核心技能）: 标志性技能，2-4个，从技能库多选
- passives（被动技能）: 职业被动，1-3个，从技能库多选
- difficulty（上手难度）: 新手/简单/普通/困难/专家/大师
- playstyle（玩法风格）: 逗号分隔，如"爆发,近战,单点秒杀"
- inherent_buffs（固有Buff）: 职业自带的常驻Buff效果，从Buff库多选
- growth_type（成长倾向）: 均衡型/血量型/攻击型/法力型/防御型
- skill_types（推荐技能类型）: 逗号分隔
- unlock_condition（解锁条件）: 基础职业用"初始可选"，进阶职业用"等级20+完成XX任务"
- evolve_jobs（可转职为）: 只有基础职业需要填，逗号分隔或"无"
- tags（标签）: 逗号分隔""",
                    "special_notes": "职业树：4种基础职业(对应4武器) → 转职 → 4种进阶职业！进阶加成额外叠加在基础职业之上！战士→狂战士 / 弓箭手→神射手 / 法师→元素师 / 枪手→猎魔人。",
                    "json_example": [
                        {
                            "id": "ZhiYe001",
                            "name": "战士",
                            "job_tier": "基础",
                            "base_job_from": "无",
                            "type": "坦克",
                            "desc": "近战物理职业，高生存能力，使用剑斧盾在前线保护队友。",
                            "weapons": "剑,斧,盾,枪",
                            "hp_bonus": 30,
                            "mp_bonus": -20,
                            "atk_bonus": 10,
                            "def_bonus": 20,
                            "mechanism": "嘲讽吸收伤害，格挡反击，物理减伤被动",
                            "resource_type": "怒气",
                            "core_skills": [],
                            "passives": [],
                            "difficulty": "简单",
                            "playstyle": "前排,抗伤,嘲讽,格挡",
                            "inherent_buffs": [],
                            "growth_type": "血量型",
                            "skill_types": "近战,物理,防御",
                            "unlock_condition": "初始可选",
                            "evolve_jobs": "狂战士,圣骑士,武器大师",
                            "tags": "近战,物理,坦克,新手友好"
                        },
                        {
                            "id": "ZhiYe002",
                            "name": "狂战士",
                            "job_tier": "进阶",
                            "base_job_from": "战士",
                            "type": "输出",
                            "desc": "战士的进阶路线，牺牲防御换取极致攻击力，以血换血的疯狂战斗风格。",
                            "weapons": "双手斧,巨剑,战锤",
                            "hp_bonus": 15,
                            "mp_bonus": -10,
                            "atk_bonus": 25,
                            "def_bonus": -10,
                            "mechanism": "血怒：血量越低攻速越快伤害越高，每损失10%生命攻速+5%",
                            "resource_type": "生命值",
                            "core_skills": [],
                            "passives": [],
                            "difficulty": "困难",
                            "playstyle": "爆发,血怒,高风险,近战",
                            "inherent_buffs": [],
                            "growth_type": "攻击型",
                            "skill_types": "狂暴,近战,爆发",
                            "unlock_condition": "等级20 + 完成狂暴试炼任务",
                            "evolve_jobs": "无",
                            "tags": "进阶,狂暴,高伤害,高风险"
                        },
                        {
                            "id": "ZhiYe003",
                            "name": "圣骑士",
                            "job_tier": "进阶",
                            "base_job_from": "战士",
                            "type": "坦克",
                            "desc": "战士与牧师结合的进阶路线，获得神圣力量，能攻能守能治疗的完美坦克。",
                            "weapons": "剑盾,锤盾,长枪",
                            "hp_bonus": 10,
                            "mp_bonus": 25,
                            "atk_bonus": -5,
                            "def_bonus": 15,
                            "mechanism": "圣光庇护：周围队友获得减伤光环，自身治疗量+20%",
                            "resource_type": "法力",
                            "core_skills": [],
                            "passives": [],
                            "difficulty": "普通",
                            "playstyle": "光环,半坦,治疗,辅助",
                            "inherent_buffs": [],
                            "growth_type": "均衡型",
                            "skill_types": "神圣,防御,治疗",
                            "unlock_condition": "等级20 + 加入光明教会阵营",
                            "evolve_jobs": "无",
                            "tags": "进阶,神圣,全能,团队核心"
                        }
                    ],
                    "default_prompt": """请为RPG游戏设计一个职业（需明确是基础还是进阶），要求：
1. 先确定层级：基础职业(Level1) 或 进阶职业(转职用)
2. 如果是进阶职业：必须指定 base_job_from（来自哪个基础职业）
3. ID用类型拼音+数字，如ZhiYe001(战士), ZhiYe002(狂战士)
4. 进阶职业的百分比加成会**额外叠加**在基础职业上
5. 基础职业要定义 evolve_jobs（可转职为什么进阶职业）
6. 进阶职业要有明确的解锁条件（通常比基础职业难）
7. ★每职业必须设计1个专属机制（mechanism），这是职业的灵魂！
8. 属性列表(attr_list)添加自定义额外属性，每项{"name":"属性名","value":数值}
9. 明确资源类型（法力/怒气/能量等），影响战斗节奏
10. 保持简洁：只定义加成百分比和机制特色"""
                }
            )


def _build_monster_def() -> TypeDef:
    return TypeDef(
                id="monster", name="怪物", plural_key="monsters", color="#FF9800",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="怪物名称:", type="entry"),
                    TypeField(name="level", label="等级:", type="spinbox", from_=1, to=100),
                    TypeField(name="type", label="类型:", type="combobox",
                              values=["野兽", "亡灵", "恶魔", "元素", "机械", "龙类", "人类"]),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["普通", "精英", "Boss", "稀有", "事件怪"]),
                    TypeField(name="difficulty", label="难度:", type="combobox",
                              values=["简单", "普通", "困难", "精英", "首领"]),
                    TypeField(name="behavior", label="行为:", type="combobox",
                              values=["攻击性", "防御性", "游荡", "召唤", "治疗", "逃跑"]),
                    TypeField(name="skills", label="技能列表:", type="multiselect", ref_type="skills"),
                    TypeField(name="talents", label="天赋列表:", type="multiselect", ref_type="talents"),
                    TypeField(name="buffs", label="Buff列表:", type="multiselect", ref_type="buffs"),
                    TypeField(name="mechanism", label="特殊机制:", type="desc"),
                    TypeField(name="equip_drops", label="装备掉落:", type="droptable"),
                    TypeField(name="item_drops", label="道具掉落:", type="droptable"),
                    TypeField(name="title_drops", label="称号掉落:", type="droptable"),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "{等级}级{类型}怪物，{难度}难度，{行为}行为。",
                                  "{类型}怪物，等级{等级}，分类{分类}，难度{难度}。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                    TypeField(name="image_tags", label="图片标签:", type="image_tags"),
                ],
                ai_context={
                    "role_description": "你是一位资深怪物设计师，熟悉各种奇幻生物的生态设计、Boss战机制和难度曲线。",
                    "field_descriptions": """- name（怪物名称）: 奇幻风格的中文名
- level（等级）: 整数，普通怪1-30，精英15-50，Boss 30-100
- type（种族类型）: 野兽 / 亡灵 / 恶魔 / 元素 / 机械 / 龙类 / 人类
- category（稀有度分类）: 普通 / 精英 / Boss / 稀有 / 事件怪
- difficulty（难度）: 简单 / 普通 / 困难 / 精英 / 首领
- behavior（行为模式）: 攻击性 / 防御性 / 游荡 / 召唤 / 治疗 / 逃跑
- skills（技能列表）: JSON数组，每项{"name":"技能名","count":等级}
- talents（天赋列表）: JSON数组，每项{"name":"天赋名","count":等级}
- buffs（Buff列表）: JSON数组，从Buff库选择
- mechanism（特殊机制）: 文本，描述怪物的独特被动或触发条件
- equip_drops（装备掉落）: JSON数组，每项{"name","rate","count_min","count_max"}
- item_drops（道具掉落）: JSON数组，每项{"name","rate","count_min","count_max"}
- title_drops（称号掉落）: JSON数组，每项{"name","rate","count_min","count_max"}，击败后获得称号
- tags（标签）: 逗号分隔
- desc（怪物描述）: 60-120字""",
                    "special_notes": "高等级怪物的属性必须显著高于低等级！Boss数值是普通怪的5-10倍！Boss必配1-3件装备+称号掉落，精英配1-2个技能。",
                    "json_example": [
                        {"id": "GuaiWu001", "name": "暗影吞噬者", "level": 45, "type": "恶魔", "category": "Boss", "difficulty": "首领", "behavior": "攻击性", "skills": [{"name": "暗影撕咬", "count": 3}, {"name": "灵魂收割", "count": 2}], "talents": [{"name": "暗影之核", "count": 4}], "attr_list": [{"name": "暗影抗性", "value": 40}], "mechanism": "每次击杀单位后恢复10%最大生命值，且下一次攻击伤害翻倍。", "equip_drops": [{"name": "暗影之刃", "rate": 30, "count_min": 1, "count_max": 1}], "item_drops": [{"name": "暗影精华", "rate": 80, "count_min": 2, "count_max": 5}], "title_drops": [{"name": "暗影征服者", "rate": 15, "count_min": 1, "count_max": 1}], "tags": "恶魔,暗影,Boss", "desc": "从深渊裂缝中诞生的恐怖恶魔。"},
                        {"id": "GW002", "name": "森林狼", "level": 8, "type": "野兽", "category": "普通", "difficulty": "简单", "behavior": "防御性", "skills": [], "talents": [], "attr_list": [], "mechanism": "", "equip_drops": [], "item_drops": [{"name": "狼皮", "rate": 40, "count_min": 1, "count_max": 2}], "title_drops": [], "tags": "野兽,森林,群居", "desc": "森林中最常见的捕食者。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个怪物，要求：
1. 怪物名称具有游戏感（根据等级设计普通名或Boss名）
2. 等级与属性成正比，低等级怪物数值保守
3. 行为模式多样化
4. 难度标注准确（简单→首领梯度合理）
5. 技能/天赋选择匹配怪物定位（Boss多带、精英少量、普通可空）
6. Boss必配1-3件装备+称号掉落，普通怪仅配道具掉落
7. 设计1个独特机制增强怪物辨识度""",
                }
            )


def _build_equip_def() -> TypeDef:
    return TypeDef(
                id="equip", name="装备", plural_key="equips", color="#9C27B0",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="装备名称:", type="entry"),
                    TypeField(name="part", label="部位:", type="combobox",
                              values=["武器", "头盔", "胸甲", "护腿", "靴子", "手套", "戒指", "项链", "披风"]),
                    TypeField(name="rare", label="稀有度:", type="combobox",
                              values=["普通", "优秀", "稀有", "史诗", "传说"]),
                    TypeField(name="job", label="适用职业:", type="combobox",
                              values=["战士", "弓箭手", "法师", "枪手", "所有"]),
                    TypeField(name="effect", label="效果类型:", type="combobox",
                              values=["攻击加成", "防御加成", "生命加成", "法力加成", "暴击率", "闪避率", "魔法抗性"]),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["攻击", "防御", "辅助", "控制", "特殊"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="value", label="数值:", type="spinbox", from_=0, to=9999),
                    TypeField(name="buffs", label="关联Buff:", type="multiselect", ref_type="buffs"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "{部位}，{稀有}品质，为{职业}提供{数值}点{效果类型}。",
                                  "{效果类型}装备，部位{部位}，适合{职业}，效果{效果类型}，数值{数值}。",
                                  "{稀有}品质{部位}，{分类}装备，适用于{职业}。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                    TypeField(name="image_tags", label="图片标签:", type="image_tags"),
                ],
                ai_context={
                    "role_description": "你是一位资深装备系统设计师，精通装备数值体系、稀有度梯度、套装效果和职业适配，能设计出有吸引力的装备系统。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如ZB001(龙息战甲), ZB002(猎人短弓)
- name（装备名称）: 奇幻风格的中文名，如"龙息战甲"
- part（装备部位）: 武器 / 头盔 / 胸甲 / 护腿 / 靴子 / 手套 / 戒指 / 项链 / 披风
- rare（稀有度）: 普通 / 优秀 / 稀有 / 史诗 / 传说
- job（适用职业）: 战士 / 弓箭手 / 法师 / 枪手 / 所有
- effect（装备效果）: 攻击加成 / 防御加成 / 生命加成 / 法力加成 / 暴击率 / 闪避率 / 魔法抗性 / 套装效果
- category（定位分类）: 攻击 / 防御 / 辅助 / 控制 / 特殊
- tags（标签）: 逗号分隔，如"龙族,火焰,传说"
- value（属性数值）: 整数，普通10-50，传说100-500
- desc（装备描述）: 50-100字，描述外观和来历""",
                    "special_notes": "稀有度越高数值越大！传说级装备的value应为普通级的5-10倍！",
                    "json_example": [
                        {"id": "ZB001", "name": "龙息战甲", "part": "胸甲", "rare": "传说", "job": "战士", "effect": "防御加成", "category": "防御", "tags": "龙族,火焰,传说", "value": 350, "desc": "用上古火龙鳞片锻造的铠甲，灼热如龙息，穿戴者仿佛继承了火龙的不灭意志。"},
                        {"id": "ZhuangBe002", "name": "猎人短弓", "part": "武器", "rare": "优秀", "job": "弓箭手", "effect": "攻击加成", "category": "攻击", "tags": "木质,精灵,轻便", "value": 45, "desc": "精灵工匠为新手猎人打造的短弓，轻便灵巧，适合快速射击和移动战斗。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一件装备，要求：
1. 装备名称体现稀有度和属性特点
2. 部位与属性加成逻辑一致（武器+攻击、胸甲+防御、戒指+暴击等）
3. 稀有度梯度合理（普通→传说的数值递增）
4. 有职业适配性，某些装备限定特定职业
5. 传说级装备有独特的特殊效果描述""",
                }
            )


def _build_skill_def() -> TypeDef:
    return TypeDef(
                id="skill", name="技能", plural_key="skills", color="#4CAF50",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="技能名称:", type="entry"),
                    TypeField(name="type", label="类型:", type="combobox",
                              values=["攻击", "治疗", "防御", "控制", "增益", "减益", "被动"]),
                    TypeField(name="value", label="基础数值:", type="spinbox", from_=0, to=9999),
                    TypeField(name="damage_type", label="伤害类型:", type="combobox",
                              values=["物理伤害", "法术伤害", "真伤"]),
                    TypeField(name="multiplier", label="倍率:", type="combobox",
                              values=["0.5", "1.0", "1.5", "2.0", "2.5", "3.0"]),
                    TypeField(name="cd", label="冷却:", type="spinbox", from_=0, to=99),
                    TypeField(name="target", label="目标:", type="combobox",
                              values=["单体敌人", "群体敌人", "单体友方", "全体友方", "自身", "所有目标"]),
                    TypeField(name="consume", label="消耗类型:", type="combobox",
                              values=["无消耗", "法力", "体力", "怒气", "生命值"]),
                    TypeField(name="effect", label="效果类型:", type="combobox",
                              values=["直接伤害", "持续伤害", "护盾", "眩晕", "中毒", "燃烧", "减速"]),
                    TypeField(name="buffs", label="关联Buff:", type="multiselect", ref_type="buffs"),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["攻击", "防御", "辅助", "控制", "特殊"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "[经典四属性] {技能名}，{类型}技能，向{目标}造成{数值}点伤害，消耗{消耗}。",
                                  "[物理/魔法] {技能名}，{类型}，{分类}技能，物理攻击{数值}，冷却{冷却}秒。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                    TypeField(name="image_tags", label="图片标签:", type="image_tags"),
                ],
                ai_context={
                    "role_description": "你是一位资深技能设计师，精通技能数值体系、技能类型分类、冷却和消耗机制设计，能设计出有特色的技能系统。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如JiNeng001(烈焰风暴), JiNeng002(精准斩击)
- name（技能名称）: 奇幻风格的中文名，如"烈焰风暴"
- type（技能类型）: 攻击 / 治疗 / 防御 / 控制 / 增益 / 减益 / 被动
- value（基础数值）: 整数，攻击技能20-500，治疗30-300，防御10-200
- damage_type（伤害类型）: 物理伤害 / 法术伤害 / 真伤
- multiplier（倍率）: 0.5 / 1.0 / 1.5 / 2.0 / 2.5 / 3.0
- cd（冷却时间）: 整数秒，0-99秒
- target（目标）: 单体敌人 / 群体敌人 / 单体友方 / 全体友方 / 自身 / 所有目标
- consume（消耗类型）: 无消耗 / 法力 / 体力 / 怒气 / 生命值
- effect（效果类型）: 直接伤害 / 持续伤害 / 护盾 / 眩晕 / 中毒 / 燃烧 / 减速
- category（定位分类）: 攻击 / 防御 / 辅助 / 控制 / 特殊
- tags（标签）: 逗号分隔，如"火焰,范围,AOE"
- desc（技能描述）: 50-100字，描述技能效果和视觉表现""",
                    "special_notes": "不同类型技能的数值要有明显差异，不能所有技能相同！攻击技能cd越高数值越大！",
                    "json_example": [
                        {"id": "JiNeng001", "name": "烈焰风暴", "type": "攻击", "value": 300, "damage_type": "法术伤害", "multiplier": "2.0", "cd": 15, "target": "群体敌人", "consume": "法力", "effect": "直接伤害", "category": "攻击", "tags": "火焰,范围,AOE", "desc": "召唤一股炽热的火焰风暴席卷战场，对所有敌人造成大量火焰伤害，灼烧的余烬在空中飞舞。"},
                        {"id": "JiNeng002", "name": "精准斩击", "type": "攻击", "value": 120, "damage_type": "物理伤害", "multiplier": "1.5", "cd": 3, "target": "单体敌人", "consume": "无消耗", "effect": "直接伤害", "category": "攻击", "tags": "物理,单体,快速", "desc": "快速精准的挥砍，集中力量于一点造成物理伤害，冷却短可频繁使用。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个技能，要求：
1. 技能名称要有辨识度和画面感
2. 技能类型明确分类（攻击/治疗/防御/控制/增益/减益/被动）
3. 冷却时间和消耗机制合理，强力技能cd长、消耗大
4. 目标范围与威力匹配（AOE单体伤害低于群体技能）
5. 有独特的技能机制增加战斗策略性""",
                }
            )


def _build_talent_def() -> TypeDef:
    return TypeDef(
                id="talent", name="天赋", plural_key="talents", color="#E91E63",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="天赋名称:", type="entry"),
                    TypeField(name="owner", label="归属角色:", type="entry"),
                    TypeField(name="type", label="天赋类型:", type="combobox",
                              values=["战斗", "生存", "探索", "社交", "制造"]),
                    TypeField(name="level", label="天赋等级:", type="spinbox", from_=1, to=20),
                    TypeField(name="rarity", label="稀有度:", type="combobox",
                              values=["普通", "优秀", "稀有", "史诗", "传说", "神话"]),
                    TypeField(name="effect_type", label="效果类型:", type="combobox",
                              values=["属性提升", "技能增强", "被动触发", "条件激活", "光环效果"]),
                    TypeField(name="value", label="数值:", type="spinbox", from_=0, to=9999),
                    TypeField(name="unlock_condition", label="解锁条件:", type="entry"),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["主动", "被动", "增益", "减益"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "{天赋名称}，{天赋类型}天赋，{稀有}品质，{效果类型}。",
                                  "{分类}天赋，{稀有}品质，等级{等级}，效果{效果类型}，数值{数值}。",
                                  "归属{归属角色}的{天赋类型}天赋，{效果类型}，等级{等级}。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                    TypeField(name="image_tags", label="图片标签:", type="image_tags"),
                ],
                ai_context={
                    "role_description": "你是一位资深天赋系统设计师，精通天赋树架构、被动效果设计、角色成长路线规划，能设计出有深度的天赋系统。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如TianFu001(烈焰之心), TianFu002(自然亲和)
- name（天赋名称）: 中文名，如"烈焰之心"
- owner（归属角色）: 角色名，可留空表示通用天赋
- type（天赋类型）: 战斗 / 生存 / 探索 / 社交 / 制造
- level（天赋等级）: 整数，1-20
- rarity（稀有度）: 普通 / 优秀 / 稀有 / 史诗 / 传说 / 神话
- effect_type（效果类型）: 属性提升 / 技能增强 / 被动触发 / 条件激活 / 光环效果
- value（属性数值）: 整数，普通1-10，神话100-500
- unlock_condition（解锁条件）: 如"角色等级≥20"或"完成任务×"，可留空
- category（定位分类）: 主动 / 被动 / 增益 / 减益
- tags（标签）: 逗号分隔，如"火焰,被动,战斗"
- desc（天赋描述）: 40-80字，描述天赋效果和激活条件""",
                    "special_notes": "天赋等级和稀有度要匹配，神话级天赋value必须显著高于普通级！注意天赋之间的协同效应！",
                    "json_example": [
                        {"id": "TianFu001", "name": "烈焰之心", "owner": "", "type": "战斗", "level": 15, "rarity": "史诗", "effect_type": "技能增强", "value": 80, "unlock_condition": "角色等级≥15且职业为法师", "category": "被动", "tags": "火焰,被动,战斗", "desc": "拥有此天赋的角色，火焰类技能伤害提升20%，并在施放时有概率触发二次爆炸。"},
                        {"id": "TianFu002", "name": "自然亲和", "owner": "", "type": "探索", "level": 8, "rarity": "稀有", "effect_type": "被动触发", "value": 30, "unlock_condition": "", "category": "增益", "tags": "自然,探索,采集", "desc": "在森林和草地区域移动速度提升30%，采集草药和矿石时有概率获得双倍材料。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个天赋，要求：
1. 天赋名称有辨识度和记忆点
2. 天赋类型明确（战斗/生存/探索/社交/制造）
3. 稀有度和等级匹配，梯度合理
4. 效果类型多样化（属性提升/技能增强/被动触发等）
5. 解锁条件与天赋强度匹配
6. 考虑天赋之间的搭配和协同效果""",
                }
            )


def _build_item_def() -> TypeDef:
    return TypeDef(
                id="item", name="道具", plural_key="items", color="#F44336",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="道具名称:", type="entry"),
                    TypeField(name="type", label="类型:", type="combobox",
                              values=["消耗品", "材料", "任务道具", "特殊道具", "钥匙"]),
                    TypeField(name="rare", label="稀有度:", type="combobox",
                              values=["普通", "优秀", "稀有", "史诗", "传说"]),
                    TypeField(name="effect", label="效果类型:", type="combobox",
                              values=["攻击加成", "防御加成", "生命加成", "法力加成", "暴击率", "闪避率", "魔法抗性"]),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["攻击", "防御", "辅助", "控制", "特殊"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="value", label="数值:", type="spinbox", from_=0, to=9999),
                    TypeField(name="buffs", label="关联Buff:", type="multiselect", ref_type="buffs"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "{类型}道具，{稀有}品质，提供{数值}点{效果类型}。",
                                  "{分类}道具，类型{类型}，稀有度{稀有}，效果{效果类型}。",
                                  "{稀有}品质{类型}，{分类}类道具，数值{数值}。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                    TypeField(name="image_tags", label="图片标签:", type="image_tags"),
                ],
                ai_context={
                    "role_description": "你是一位资深道具系统设计师，精通消耗品、材料、任务道具的设计，熟悉道具经济体系和玩家使用场景。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如DaoJu001(强效生命药水), DaoJu002(月光草)
- name（道具名称）: 中文名称，如"强效生命药水"
- type（道具类型）: 消耗品 / 材料 / 任务道具 / 特殊道具 / 钥匙
- rare（稀有度）: 普通 / 优秀 / 稀有 / 史诗 / 传说
- effect（使用效果）: 回复生命 / 回复法力 / 提升攻击 / 提升防御 / 解除异常 / 传送 / 复活
- category（定位分类）: 恢复 / 强化 / 功能 / 任务
- tags（标签）: 逗号分隔，如"药水,战斗,消耗品"
- value（效果数值）: 整数，普通30-100，传说300-1000
- desc（道具描述）: 30-60字，说明用途和来源""",
                    "special_notes": "消耗品类道具必须标注具体效果类型和数值！",
                    "json_example": [
                        {"id": "DaoJu001", "name": "强效生命药水", "type": "消耗品", "rare": "稀有", "effect": "回复生命", "category": "恢复", "tags": "药水,战斗,恢复", "value": 500, "desc": "由高级炼金术士调配的红色药水，能在战斗中快速恢复大量生命值。"},
                        {"id": "DaoJu002", "name": "月光草", "type": "材料", "rare": "普通", "effect": "回复法力", "category": "功能", "tags": "草药,采集,夜间", "value": 10, "desc": "只有在月光下才会绽放的稀有草药，是制作法力药水的核心材料。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个道具，要求：
1. 道具名称直观，玩家一看就知道用途
2. 类型明确（消耗品/材料/任务道具/货币/配方）
3. 品质和稀有度与道具效果匹配
4. 如果是消耗品，明确使用效果和数值
5. 考虑道具之间的合成或升级关系""",
                }
            )


def _build_achievement_def() -> TypeDef:
    return TypeDef(
                id="achievement", name="成就", plural_key="achievements", color="#FFD700",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="成就名称:", type="entry"),
                    TypeField(name="description", label="成就描述:", type="achievement_desc"),
                    TypeField(name="condition", label="达成条件:", type="entry"),
                    TypeField(name="reward", label="奖励:", type="entry"),
                ],
                ai_context={
                    "role_description": "你是一位成就系统设计师，擅长设计有挑战性且有成就感的成就体系，精通难度递进和奖励匹配。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如ChengJiu001(初出茅庐), ChengJiu002(屠龙勇士)
- name（成就名称）: 中文名，如"初出茅庐"
- description（成就描述）: 30-60字，说明达成后的感受
- condition（达成条件）: 具体条件，如"击败第一个Boss"
- reward（成就奖励）: 如"称号「冒险者」, 金币×1000" """,
                    "special_notes": "重要！成就的描述字段是description不是desc！条件要具体可衡量！",
                    "json_example": [
                        {"id": "ChengJiu001", "name": "初出茅庐", "description": "第一次踏入冒险的世界，未知的前方既让人紧张又令人兴奋。", "condition": "击败第一个怪物", "reward": "称号「冒险者」, 金币×100"},
                        {"id": "ChengJiu002", "name": "屠龙勇士", "description": "传说中的巨龙在你面前轰然倒下，从此你的名字将永远被吟游诗人传唱。", "condition": "单人击败任意龙类Boss", "reward": "称号「屠龙者」, 传说武器×1"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个成就，要求：
1. 成就名称有纪念意义或幽默感
2. 达成条件明确，玩家知道如何解锁
3. 成就难度梯度合理（简单→极难）
4. 奖励与难度匹配
5. 可以设计隐藏成就增加探索乐趣
6. 描述简洁有力，让人有成就感""",
                }
            )


def _build_buff_def() -> TypeDef:
    return TypeDef(
                id="buff", name="Buff", plural_key="buffs", color="#2196F3",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="Buff名称:", type="entry"),
                    TypeField(name="type", label="效果类型:", type="combobox",
                              values=["正面增益", "负面减益"]),
                    TypeField(name="effect_type", label="效果类别:", type="combobox",
                              values=["属性提升", "属性降低", "持续伤害", "持续治疗", "免疫", "眩晕", "沉默", "减速", "加速", "护盾"]),
                    TypeField(name="value", label="数值:", type="spinbox", from_=-9999, to=9999),
                    TypeField(name="duration", label="持续时间(秒):", type="spinbox", from_=0, to=999),
                    TypeField(name="tick_interval", label="跳数间隔(秒):", type="spinbox", from_=0, to=60),
                    TypeField(name="stackable", label="是否可叠加:", type="combobox",
                              values=["不可叠加", "可叠加", "可叠加（次数限制）"]),
                    TypeField(name="max_stacks", label="最大叠加层数:", type="spinbox", from_=1, to=99),
                    TypeField(name="dispel_type", label="驱散类型:", type="combobox",
                              values=["不可驱散", "魔法驱散", "净化", "所有"]),
                    TypeField(name="source", label="来源类型:", type="combobox",
                              values=["技能", "天赋", "装备", "道具", "环境", "其他"]),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["战斗", "探索", "社交", "环境"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=[
                                  "{效果类型} {Buff名称}，{数值}数值，持续{持续时间}秒。",
                                  "{效果类型}，{Buff名称}，来源{来源类型}，{是否可叠加}。",
                                  "{分类}类Buff，{效果类型}，数值{数值}，持续时间{持续时间}秒。"
                              ]),
                    TypeField(name="desc", label="描述:", type="desc"),
                ],
                ai_context={
                    "role_description": "你是一位资深Buff/Debuff系统设计师，精通状态效果设计、数值平衡、叠加机制和驱散规则。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如Buff001(烈焰之怒), Buff002(虚弱诅咒)
- name（Buff名称）: 中文名，如"烈焰之怒"、"虚弱诅咒"
- type（效果类型）: 正面增益（Buff）/ 负面减益（Debuff）
- effect_type（效果类别）: 属性提升 / 属性降低 / 持续伤害 / 持续治疗 / 免疫 / 眩晕 / 沉默 / 减速 / 加速 / 护盾
- value（数值）: 整数，正数表示增益，负数表示减益
- duration（持续时间）: 秒，0表示永久
- tick_interval（跳数间隔）: 秒，用于持续伤害/治疗效果，0表示无跳数
- stackable（是否可叠加）: 不可叠加 / 可叠加 / 可叠加（次数限制）
- max_stacks（最大叠加层数）: 1-99，仅当可叠加时有效
- dispel_type（驱散类型）: 不可驱散 / 魔法驱散 / 净化 / 所有
- source（来源类型）: 技能 / 天赋 / 装备 / 道具 / 环境 / 其他
- icon（图标）: 图标路径
- category（分类）: 战斗 / 探索 / 社交 / 环境
- tags（标签）: 逗号分隔，如"火焰,增益,攻击"
- desc（Buff描述）: 40-80字，描述效果和视觉表现""",
                    "special_notes": "正面Buff和负面Debuff要区分清楚！持续伤害/治疗需要设置tick_interval！不可驱散的Buff通常是Boss技能或特殊机制！",
                    "json_example": [
                        {"id": "Buff001", "name": "烈焰之怒", "type": "正面增益", "effect_type": "属性提升", "value": 50, "duration": 15, "tick_interval": 0, "stackable": "可叠加（次数限制）", "max_stacks": 5, "dispel_type": "魔法驱散", "source": "技能", "category": "战斗", "tags": "火焰,增益,攻击", "desc": "获得火焰之力，攻击力大幅提升，每次攻击有概率附带额外火焰伤害。"},
                        {"id": "Buff002", "name": "虚弱诅咒", "type": "负面减益", "effect_type": "属性降低", "value": -30, "duration": 10, "tick_interval": 0, "stackable": "不可叠加", "max_stacks": 1, "dispel_type": "净化", "source": "技能", "category": "战斗", "tags": "诅咒,减益,削弱", "desc": "被暗影力量侵蚀，全属性降低30%，持续10秒，可被净化效果移除。"},
                        {"id": "Buff003", "name": "剧毒之伤", "type": "负面减益", "effect_type": "持续伤害", "value": -25, "duration": 8, "tick_interval": 2, "stackable": "可叠加（次数限制）", "max_stacks": 3, "dispel_type": "所有", "source": "技能", "category": "战斗", "tags": "毒素,持续伤害,减益", "desc": "身中剧毒，每2秒受到25点毒素伤害，持续8秒，最多叠加3层。"},
                        {"id": "Buff004", "name": "生命泉涌", "type": "正面增益", "effect_type": "持续治疗", "value": 30, "duration": 12, "tick_interval": 3, "stackable": "不可叠加", "max_stacks": 1, "dispel_type": "不可驱散", "source": "道具", "category": "战斗", "tags": "生命,持续治疗,增益", "desc": "饮用生命泉水，每3秒恢复30点生命值，持续12秒，效果不可被驱散。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个Buff/Debuff，要求：
1. 名称直观体现效果类型（增益用积极词汇，减益用消极词汇）
2. 效果类型与数值匹配（增益用正数，减益用负数）
3. 持续时间与强度成反比（强力效果时间短，弱效果时间长）
4. 考虑叠加机制对战斗的影响
5. 驱散类型要平衡（不可驱散的效果必须有限制）
6. 持续伤害/治疗效果需要设置合理的跳数间隔""",
                }
            )


def _build_story_def() -> TypeDef:
    return TypeDef(
                id="story", name="剧情", plural_key="stories", color="#795548",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="剧情名称:", type="entry"),
                    TypeField(name="type", label="剧情类型:", type="combobox",
                              values=["主线", "支线", "事件", "结局"]),
                    TypeField(name="order", label="剧情顺序:", type="spinbox", from_=0, to=999),
                    TypeField(name="scene", label="场景名称:", type="entry"),
                    TypeField(name="content", label="剧情内容:", type="content"),
                    TypeField(name="dialog_ids", label="关联对话(逗号分隔):", type="entry"),
                    TypeField(name="prev_story", label="前置剧情:", type="entry"),
                    TypeField(name="next_story", label="后续剧情:", type="entry"),
                    TypeField(name="branches", label="分支剧情(每行一个ID):", type="content"),
                    TypeField(name="condition", label="解锁条件:", type="entry"),
                    TypeField(name="event", label="完成事件:", type="entry"),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=["{剧情名称}在{场景}发生，类型为{剧情类型}", "剧情顺序{剧情顺序}：{剧情内容}", "分支剧情：{分支剧情}"]),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                    TypeField(name="image_desc", label="图片描述:", type="image_desc"),
                ],
                ai_context={
                    "role_description": "你是一位游戏叙事设计师，擅长构建引人入胜的剧情主线，精通章节结构、转折设计和世界观叙事。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如JuQing001(第一章：觉醒)
- name（剧情名称）: 中文名，如"第一章：觉醒"
- type（剧情类型）: 主线 / 支线 / 事件 / 结局
- order（剧情顺序）: 整数，1起
- scene（场景名称）: 如"王都广场"、"暗影森林"
- content（剧情内容）: 详细剧情文本，150-500字
- dialog_ids（关联对话）: 逗号分隔的对话名称，可留空
- prev_story（前置剧情）: 前置剧情名称，可留空
- next_story（后续剧情）: 后续剧情名称，可留空
- branches（分支剧情）: 每行一个分支剧情名称，可留空
- condition（解锁条件）: 如"完成前置任务×"，可留空
- event（完成事件）: 剧情完成后触发的事件，可留空
- tags（标签）: 逗号分隔，如"主线,王国,战争"
- desc（剧情描述）: 50-100字剧情梗概""",
                    "special_notes": "主线剧情要连贯！前后剧情通过prev_story和next_story串联！",
                    "json_example": [
                        {"id": "JQ001", "name": "第一章：觉醒", "type": "主线", "order": 1, "scene": "王都广场", "content": "千年庆典的钟声敲响之际，一道漆黑裂缝撕裂了王都上空的天幕。古老的封印正在崩解...", "dialog_ids": "", "prev_story": "", "next_story": "第二章：远征", "branches": "", "condition": "", "event": "解锁王都地图所有区域", "tags": "主线,王国,封印", "desc": "王国千年庆典当天，异世界的裂缝突然出现，主角的命运齿轮开始转动。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一段剧情，要求：
1. 有明确的冲突和转折，避免平淡叙事
2. 角色动机合理，行为符合人设
3. 章节结构清晰（开端/发展/高潮/结局）
4. 关键事件有触发条件和完成条件
5. 与游戏世界观一致，不破坏已有设定
6. 为后续剧情留伏笔和扩展空间""",
                }
            )


def _build_task_def() -> TypeDef:
    return TypeDef(
                id="task", name="任务", plural_key="tasks", color="#FF5722",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="任务名称:", type="entry"),
                    TypeField(name="type", label="任务类型:", type="combobox",
                              values=["主线", "支线", "日常", "活动", "隐藏"]),
                    TypeField(name="difficulty", label="难度:", type="combobox",
                              values=["简单", "普通", "困难", "精英", "首领"]),
                    TypeField(name="level", label="等级:", type="spinbox", from_=1, to=100),
                    TypeField(name="reward", label="奖励:", type="entry"),
                    TypeField(name="dialog_id", label="对话ID:", type="dialog"),
                    TypeField(name="category", label="分类:", type="combobox",
                              values=["攻击", "防御", "辅助", "控制", "特殊"]),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="desc", label="描述:", type="desc"),
                    TypeField(name="image", label="图片:", type="image"),
                ],
                ai_context={
                    "role_description": "你是一位资深任务设计师，擅长设计有驱动力的任务链，精通主线/支线/日常任务的节奏控制和奖励设计。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如RenWu001(拯救村庄)
- name（任务名称）: 中文名，如"拯救村庄"
- type（任务类型）: 主线 / 支线 / 日常 / 活动 / 隐藏
- difficulty（难度）: 简单 / 普通 / 困难 / 精英 / 首领
- level（等级要求）: 整数，1-100
- reward（任务奖励）: 描述奖励内容，如"金币×500, 经验×2000"
- dialog_id（关联对话ID）: 可留空，填写关联对话的名称
- category（定位分类）: 战斗 / 收集 / 护送 / 探索 / 对话
- tags（标签）: 逗号分隔，如"新手,村庄,战斗"
- desc（任务描述）: 50-100字，说明任务背景和目标""",
                    "special_notes": "主线任务要有剧情连贯性！任务奖励要和难度匹配！",
                    "json_example": [
                        {"id": "RenWu001", "name": "拯救村庄", "type": "主线", "difficulty": "普通", "level": 5, "reward": "金币×500, 经验×2000", "dialog_id": "", "category": "战斗", "tags": "新手,村庄,哥布林", "desc": "新手村的村民被哥布林袭击，需要冒险者前往洞穴清除威胁并救出被掳走的村民。"},
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一个任务，要求：
1. 任务名称概括核心目标，副标题增加叙事感
2. 任务类型多样化（主线/支线/日常/隐藏等）
3. 目标描述清晰，玩家能明确知道要做什么
4. 难度与奖励成正比
5. NPC和地点名称与世界观一致
6. 可以有任务链的前置和后续关联""",
                }
            )


def _build_dialog_def() -> TypeDef:
    return TypeDef(
                id="dialog", name="对话", plural_key="dialogs", color="#00BCD4",
                form_fields=[
                    TypeField(name="id", label="ID:", type="entry", editable=False),
                    TypeField(name="name", label="对话名称:", type="entry"),
                    TypeField(name="speaker", label="说话者:", type="entry"),
                    TypeField(name="content", label="对话内容:", type="content"),
                    TypeField(name="next_dialog", label="后续对话:", type="entry"),
                    TypeField(name="options", label="对话选项(每行一个):", type="content"),
                    TypeField(name="condition", label="触发条件:", type="entry"),
                    TypeField(name="event", label="触发事件:", type="entry"),
                    TypeField(name="tags", label="标签:", type="tags"),
                    TypeField(name="template", label="描述模板:", type="template",
                              values=["{说话者}说：{对话内容}", "对话场景：{场景}", "{角色}的台词：{内容}"]),
                    TypeField(name="desc", label="描述:", type="desc"),
                ],
                ai_context={
                    "role_description": "你是一位游戏文案专家，擅长为NPC设计有性格的对话，精通对话选项设计和分支叙事。",
                    "field_descriptions": """- id（ID）: 类型拼音+数字，如DuiHua001(村长_初次见面)
- name（对话名称）: 中文标识，如"村长_初次见面"
- speaker（说话者）: 角色名，如"村长"
- content（对话内容）: 完整对话文本，50-200字
- next_dialog（后续对话）: 关联的下一段对话名称，可留空
- options（对话选项）: 每行一个选项，格式"选项文本→结果对话名"
- condition（触发条件）: 如"完成前置任务×"或"等级≥10"，可留空
- event（触发事件）: 如"开启战斗"或"获得道具×"，可留空
- tags（标签）: 逗号分隔，如"主线,村庄,NPC"
- desc（对话描述）: 20-50字对话摘要""",
                    "special_notes": "对话内容要有角色个性！不同角色说话风格要不同！",
                    "json_example": [
                        {"id": "DuiHua001", "name": "村长_初次见面", "speaker": "村长", "content": "年轻的冒险者啊，你来得正好！近来村外的洞穴中出现了凶残的哥布林，已经有三个村民失踪了。我们需要有人去调查。", "next_dialog": "", "options": "好的，我去看看→村长_接受任务\\n我还没准备好→村长_再考虑", "condition": "", "event": "", "tags": "主线,村庄,NPC", "desc": "玩家首次到达村庄时，与焦虑的村长对话，触发第一个主线任务。"}
                    ],
                    "default_prompt": """请为奇幻RPG游戏设计一段NPC对话，要求：
1. 对话有明确的叙事目的（推进剧情/提供情报/触发任务）
2. NPC性格通过语言风格体现（粗犷/优雅/神秘/狡黠）
3. 对话选项给玩家有意义的选择
4. 选项有不同后果（影响好感度/剧情走向/获得不同奖励）
5. 对话长度适中，不要冗长""",
                }
            )


def create_default_rpg_schema() -> TypeSchema:
    """创建默认RPG类型模式（11种数据类型：含职业）v1.8 - 完整策划方案"""
    return TypeSchema(
        version="2.4",
        types=[
            _build_role_def(),
            _build_job_def(),
            _build_monster_def(),
            _build_equip_def(),
            _build_skill_def(),
            _build_talent_def(),
            _build_item_def(),
            _build_achievement_def(),
            _build_buff_def(),
            _build_story_def(),
            _build_task_def(),
            _build_dialog_def(),
        ],
    )
