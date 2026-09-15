"""策划书风格/模块类型参数化辅助（自 ceshu_skill.py 拆出，逻辑未改动）"""
from __future__ import annotations

# 风格关键词 → style 标识符映射
_STYLE_KEYWORDS = {
    "xianxia": ["仙侠", "修真", "渡劫", "元婴", "化神", "灵气", "宗门", "飞升"],
    "wuxia":   ["武侠", "江湖", "门派", "侠客", "武功", "内力"],
    "sci-fi":  ["科幻", "星际", "未来", "机甲", "AI", "赛博", "太空", "外星"],
    "fantasy": ["奇幻", "魔法", "龙", "精灵", "矮人", "地下城", "中世纪"],
    "post_apoc": ["末世", "废土", "丧尸", "核战", "末日", "避难所"],
    "realistic": ["写实", "现实", "现代", "军事", "历史"],
    "anime":   ["二次元", "动漫", "萌系", "治愈"],
    "dark":    ["暗黑", "哥特", "恐怖", "克苏鲁"],
}

# 模块类型关键词 → module_type 标识符映射
_MODULE_KEYWORDS = {
    "rpg":     ["RPG", "角色扮演", "剧情", "升级"],
    "slg":     ["SLG", "策略", "经营", "建设", "模拟"],
    "moba":    ["MOBA", "推塔", "5v5", "对战"],
    "fps":     ["FPS", "射击", "枪战", "第一人称"],
    "card":    ["卡牌", "抽卡", "集换式"],
    "tower_defense": ["塔防", "防守"],
    "roguelike": ["肉鸽", "roguelike", "永久死亡"],
    "casual":  ["休闲", "益智", "消除"],
    "sandbox": ["沙盒", "开放世界", "建造"],
    "fighting": ["格斗", "对战"],
    "rhythm":  ["音游", "节奏"],
    "mmorpg":  ["MMORPG", "大型多人", "网游"],
}


def _infer_style_module(description: str) -> tuple:
    """从用户描述中推断 style 和 module_type

    Returns:
        (style, module_type): 推断失败返回 ("", "")
    """
    if not description:
        return ("", "")

    desc_lower = description.lower()

    # 推断 style
    style = ""
    for s, keywords in _STYLE_KEYWORDS.items():
        if any(kw in description for kw in keywords):
            style = s
            break

    # 推断 module_type
    module_type = ""
    for m, keywords in _MODULE_KEYWORDS.items():
        if any(kw in description or kw.lower() in desc_lower for kw in keywords):
            module_type = m
            break

    return (style, module_type)


# 风格术语表 — 指导 LLM 生成符合风格的内容
_STYLE_GLOSSARIES = {
    "xianxia": (
        "气血=HP, 灵力=MP, 修为=经验, 渡劫=升级关键节点\n"
        "境界划分: 练气→筑基→金丹→元婴→化神→渡劫→大乘→飞升\n"
        "宗门/门派系统, 法宝=装备, 丹药=消耗品, 功法=技能\n"
        "灵石=货币, 天地人=品质分级, 仙魔妖=阵营"
    ),
    "wuxia": (
        "气血=HP, 内力=MP, 经验=阅历\n"
        "境界: 三流→二流→一流→后天→先天→宗师→大成\n"
        "门派/帮派系统, 兵器=装备, 秘籍=技能书\n"
        "银两=货币, 武功=技能, 经脉=属性系统"
    ),
    "sci-fi": (
        "HP=生命值, MP=能量/护盾, 经验=数据/经验值\n"
        "等级=军衔/阶级, 装备=武器/护甲/模块\n"
        "货币=信用点/星币, 阵营=联邦/帝国/自由联盟\n"
        "技能=战术模块, 消耗品=医疗包/能量电池"
    ),
    "fantasy": (
        "HP=生命值, MP=魔法值, 经验=经验值\n"
        "种族: 人类/精灵/矮人/兽人/龙裔\n"
        "职业: 战士/法师/牧师/盗贼/游侠/圣骑士\n"
        "装备=武器/护甲/饰品, 货币=金币/银币/铜币\n"
        "魔法=元素: 火/水/土/风/光/暗"
    ),
    "post_apoc": (
        "HP=生命值, 辐射值=Radiation, 饥饿度/口渴度\n"
        "资源= scrap(废料)/弹药/食物/水/燃料\n"
        "装备=武器/护甲/防毒面具, 阵营=幸存者/掠夺者/军方\n"
        "技能=生存技能, 消耗品=治疗针/抗辐射药"
    ),
    "realistic": (
        "HP=生命值, 体力=Stamina, 经验=经验值\n"
        "装备=武器/护甲/配件, 货币=游戏币/真实货币\n"
        "等级=军衔/段位, 技能=主动/被动技能"
    ),
}


def _get_style_glossary(style: str) -> str:
    """获取指定风格的术语表"""
    if not style:
        return ""
    return _STYLE_GLOSSARIES.get(style, "")
