"""游戏风格术语管理器 — 根据游戏风格动态替换字段标签术语

加载 data/templates/game_styles.json，提供术语替换功能。
例如：仙侠风格下 "生命加成%" → "气血加成%"，科幻风格下 → "HP加成%"
"""
from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Optional

from common.logger import get_logger

# 概念别名 — 字段标签中常用的简写形式，映射到 game_styles.json 的概念 key
# 这些简写会被当作额外的源术语参与替换
_CONCEPT_ALIASES: dict[str, list[str]] = {
    "hp":          ["生命", "生命值", "血量", "体力"],
    "mp":          ["法力", "魔力", "蓝量", "灵力"],
    "attack":      ["攻击", "攻击力", "火力", "物理攻击"],
    "defense":     ["防御", "防御力", "护甲", "根骨"],
    "speed":       ["速度", "身法", "机动"],
    "level":       ["等级", "境界"],
    "exp":         ["经验", "修为", "经验值"],
    "skill":       ["技能", "功法"],
    "equip":       ["装备", "法宝"],
    "item":        ["道具", "灵材", "物资"],
    "monster":     ["怪物", "妖兽", "敌对单位"],
    "boss":        ["首领", "大妖", "BOSS"],
    "quest":       ["任务", "历练"],
    "guild":       ["公会", "宗门", "军团"],
    "currency_primary": ["金币", "灵石", "信用点"],
    "currency_premium": ["钻石", "元宝"],
    "critical":    ["暴击"],
    "dodge":       ["闪避"],
    "hit":         ["命中"],
    "cooldown":    ["冷却"],
    "damage":      ["伤害"],
    "heal":        ["治疗"],
    "shield":      ["护盾"],
}


@dataclass
class GameStyle:
    """单个游戏风格定义"""
    id: str
    name: str
    description: str = ""
    terminology: dict[str, str] = field(default_factory=dict)
    worldview_keywords: list[str] = field(default_factory=list)
    narrative_style: str = ""


class StyleManager:
    """风格术语管理器（单例）"""

    _instance: Optional[StyleManager] = None
    _styles: dict[str, GameStyle] = {}
    _loaded: bool = False
    _active_style: str = ""  # 当前活跃风格 ID

    def __new__(cls) -> StyleManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def _styles_path(self) -> Path:
        return Path(__file__).resolve().parent.parent.parent / "data" / "templates" / "game_styles.json"

    def load_styles(self, force: bool = False) -> dict[str, GameStyle]:
        """加载所有游戏风格"""
        if self._loaded and not force:
            return self._styles

        path = self._styles_path
        if not path.exists():
            get_logger().warning(f"游戏风格文件不存在: {path}")
            self._styles = {}
            self._loaded = True
            return {}

        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            self._styles = {}
            for item in data:
                style = GameStyle(
                    id=item.get("id", ""),
                    name=item.get("name", ""),
                    description=item.get("description", ""),
                    terminology=item.get("terminology", {}),
                    worldview_keywords=item.get("worldview_keywords", []),
                    narrative_style=item.get("narrative_style", ""),
                )
                self._styles[style.id] = style
            self._loaded = True
            get_logger().info(f"已加载 {len(self._styles)} 个游戏风格")
        except Exception as e:
            get_logger().error(f"加载游戏风格失败: {e}")
            self._styles = {}

        return self._styles

    def get_styles(self) -> dict[str, GameStyle]:
        """获取所有风格"""
        return self.load_styles()

    def list_style_names(self) -> dict[str, str]:
        """返回 {style_id: style_name} 映射"""
        self.load_styles()
        return {sid: s.name for sid, s in self._styles.items()}

    def set_active_style(self, style_id: str) -> None:
        """设置当前活跃风格"""
        self.load_styles()
        if style_id in self._styles or not style_id:
            self._active_style = style_id
        else:
            get_logger().warning(f"未知游戏风格: {style_id}")

    @property
    def active_style(self) -> str:
        return self._active_style

    def get_active_style_name(self) -> str:
        """获取当前风格的显示名"""
        if not self._active_style:
            return ""
        style = self._styles.get(self._active_style)
        return style.name if style else ""

    def _build_cross_style_map(self) -> dict[str, dict[str, str]]:
        """构建跨风格术语映射表

        返回 {concept_key: {style_id: term}} 映射。
        例如 {"hp": {"xianxia": "气血", "scifi": "HP", "fantasy": "生命值", ...}}
        """
        styles = self.load_styles()
        cross_map: dict[str, dict[str, str]] = {}
        for sid, style in styles.items():
            for concept, term in style.terminology.items():
                if concept not in cross_map:
                    cross_map[concept] = {}
                cross_map[concept][sid] = term
        return cross_map

    def _build_replacement_pairs(self, target_sid: str) -> list[tuple]:
        """构建替换对列表 (源术语, 目标术语)

        包含 game_styles.json 的术语 + 概念别名中的简写形式。
        """
        cross_map = self._build_cross_style_map()
        target_style = self.load_styles().get(target_sid)
        if not target_style:
            return []

        replacements: list[tuple] = []

        # 1. 从 game_styles.json 的术语构建替换对
        for _1, style_terms in cross_map.items():
            target_term = style_terms.get(target_sid)
            if not target_term:
                continue
            for other_sid, other_term in style_terms.items():
                if other_sid != target_sid and other_term and other_term != target_term:
                    replacements.append((other_term, target_term))

        # 2. 从概念别名添加替换对
        for concept, aliases in _CONCEPT_ALIASES.items():
            target_term = target_style.terminology.get(concept)
            if not target_term:
                continue
            for alias in aliases:
                # 别名不等于目标术语时才替换
                if alias != target_term:
                    replacements.append((alias, target_term))

        # 按源术语长度降序排序，避免短术语先匹配
        replacements.sort(key=lambda x: len(x[0]), reverse=True)
        return replacements

    def resolve_label(self, label: str, style_id: str = None) -> str:
        """根据游戏风格替换标签中的术语

        会将标签中出现的任何风格的术语或常见简写替换为目标风格的对应术语。
        例如：目标=仙侠时，"生命加成%" → "气血加成%"，"法力加成%" → "灵力加成%"
              目标=科幻时，"生命加成%" → "HP加成%"，"法力加成%" → "能量加成%"

        Args:
            label: 原始标签（如 "生命加成%:"）
            style_id: 风格 ID，为空则用 active_style

        Returns:
            替换后的标签（如 "气血加成%:"）
        """
        if not label:
            return label

        sid = style_id or self._active_style
        if not sid:
            return label

        styles = self.load_styles()
        target_style = styles.get(sid)
        if not target_style or not target_style.terminology:
            return label

        replacements = self._build_replacement_pairs(sid)

        result = label
        for source, target in replacements:
            if source in result:
                result = result.replace(source, target)

        return result

    def resolve_field_label(self, field_label: str, style_id: str = None) -> str:
        """解析字段标签（去掉尾部冒号再处理）

        TypeField.label 通常以 ":" 结尾，如 "生命加成%:"
        """
        if not field_label:
            return field_label

        suffix = ""
        label = field_label
        # 保留尾部的 ":"
        if label.endswith(":"):
            suffix = ":"
            label = label[:-1]

        resolved = self.resolve_label(label, style_id)
        return resolved + suffix

    def infer_style_from_text(self, text: str) -> str:
        """从文本推断游戏风格

        Args:
            text: 用户输入或策划书内容

        Returns:
            推断出的 style_id，无法推断则返回空字符串
        """
        if not text:
            return ""

        self.load_styles()
        scores: dict[str, int] = {}

        for sid, style in self._styles.items():
            score = 0
            # 检查世界观关键词
            for kw in style.worldview_keywords:
                if kw in text:
                    score += 2
            # 检查术语
            for styled_term in style.terminology.values():
                if styled_term and styled_term in text:
                    score += 1
            if score > 0:
                scores[sid] = score

        if not scores:
            return ""

        best = max(scores, key=lambda k: scores[k])
        return best if scores[best] >= 2 else ""

    def get_terminology(self, style_id: str = None) -> dict[str, str]:
        """获取指定风格的术语映射表"""
        sid = style_id or self._active_style
        if not sid:
            return {}
        style = self.load_styles().get(sid)
        return style.terminology if style else {}


# 全局单例
_style_manager: Optional[StyleManager] = None


def get_style_manager() -> StyleManager:
    """获取 StyleManager 单例"""
    global _style_manager
    if _style_manager is None:
        _style_manager = StyleManager()
    return _style_manager
