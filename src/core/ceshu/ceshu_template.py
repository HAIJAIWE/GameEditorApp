"""策划书模板加载器 — 管理 44 种游戏类型 18 章 GDD 模板

模板文件优先从内置数据读取（src/core/ceshu/data/ceshu_templates.json，
纳入版本控制），兼容旧路径 data/templates/ceshu_templates.json。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from common.logger import get_logger


class CeshuTemplate:
    """模板加载器，延迟加载 + 缓存"""

    _instance: Optional[CeshuTemplate] = None
    _templates: list = []
    _loaded: bool = False

    def __new__(cls) -> CeshuTemplate:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def _templates_path(self) -> Path:
        """模板文件路径（内置优先，兼容旧路径）"""
        bundled = Path(__file__).resolve().parent / "data" / "ceshu_templates.json"
        if bundled.exists():
            return bundled
        # 兼容旧版安装：data/templates/ceshu_templates.json
        return Path(__file__).resolve().parent.parent.parent.parent / "data" / "templates" / "ceshu_templates.json"

    def load_templates(self, force: bool = False) -> list:
        """加载所有模板（首次调用从文件读取，之后用缓存）"""
        if self._loaded and not force:
            return self._templates

        path = self._templates_path
        if not path.exists():
            get_logger().warning(f"模板文件不存在: {path}")
            self._templates = []
            self._loaded = True
            return []

        try:
            with open(path, encoding="utf-8") as f:
                self._templates = json.load(f)
            self._loaded = True
            get_logger().info(f"已加载 {len(self._templates)} 个策划书模板")
        except Exception as e:
            get_logger().error(f"加载模板失败: {e}")
            self._templates = []

        return self._templates

    def get_template(self, name: str) -> Optional[dict]:
        """按名称获取单个模板"""
        self.load_templates()
        for t in self._templates:
            if t.get("name") == name:
                return t
        return None

    def list_template_names(self) -> list:
        """列出所有模板名称"""
        self.load_templates()
        return [t.get("name", "未知") for t in self._templates]

    def list_by_category(self) -> dict:
        """按分类列出模板"""
        self.load_templates()
        cats: dict = {}
        for t in self._templates:
            cat = t.get("category", "其他")
            cats.setdefault(cat, []).append(t.get("name", "未知"))
        return cats

    def get_template_preview(self, name: str) -> dict:
        """获取模板预览信息（名称/类型/简介/预设游戏系统数）"""
        tmpl = self.get_template(name)
        if not tmpl:
            return {}
        data = tmpl.get("data", {})
        systems = data.get("systems", {})
        enabled_count = sum(1 for v in systems.values() if isinstance(v, dict) and v.get("enabled"))
        return {
            "name": name,
            "game_type": data.get("meta", {}).get("game_type", ""),
            "summary": data.get("meta", {}).get("positioning", ""),
            "enabled_systems": enabled_count,
            "total_systems": len(systems),
        }
