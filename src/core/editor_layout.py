"""编辑器布局配置管理器 — 管理每个数据类型的编辑器分区/排版/控件配置"""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import threading
from typing import Optional

_LAYOUT_CACHE: Optional[dict] = None
_LOCK = threading.Lock()
_CONFIG_PATH: Optional[Path] = None


def _find_config() -> Path:
    global _CONFIG_PATH
    if _CONFIG_PATH is not None and _CONFIG_PATH.exists():
        return _CONFIG_PATH

    base = Path(__file__).resolve().parent.parent.parent / "data"
    candidate = base / "editor_layouts.json"
    if candidate.exists():
        _CONFIG_PATH = candidate
        return _CONFIG_PATH


    # 首次运行：从随包分发的种子文件初始化运行时配置（src/data/ 为只读种子）
    seed = Path(__file__).resolve().parent.parent / "data" / "editor_layouts.json"
    if seed.exists():
        candidate.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(seed, candidate)
        _CONFIG_PATH = candidate
        return _CONFIG_PATH

    raise FileNotFoundError(f"找不到 editor_layouts.json: {candidate}")


def _load_config(force: bool = False) -> dict:
    global _LAYOUT_CACHE
    if _LAYOUT_CACHE is not None and not force:
        return _LAYOUT_CACHE
    with _LOCK:
        if _LAYOUT_CACHE is not None and not force:
            return _LAYOUT_CACHE
        path = _find_config()
        with open(path, encoding="utf-8") as f:
            _LAYOUT_CACHE = json.load(f)
        return _LAYOUT_CACHE


def _save_config(config: dict):
    global _LAYOUT_CACHE
    path = _find_config()
    with _LOCK:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        _LAYOUT_CACHE = config


class EditorLayout:
    """编辑器布局管理器 — 提供类型的编辑器排版查询和修改"""

    @staticmethod
    def load() -> dict:
        return _load_config()

    @staticmethod
    def reload():
        _load_config(force=True)

    @staticmethod
    def get_groups(data_type: str) -> list[dict]:
        """获取某个类型的分区/组配置"""
        config = _load_config()
        return config.get("types", {}).get(data_type, [])

    @staticmethod
    def get_stat_hints(data_type: str) -> dict:
        config = _load_config()
        return config.get("stat_hints", {}).get(data_type, {})

    @staticmethod
    def get_stat_labels() -> dict:
        config = _load_config()
        return config.get("stat_labels", {})

    @staticmethod
    def set_layout(data_type: str, groups: list[dict]) -> bool:
        """设置某个类型的完整编辑器布局

        groups 格式:
        [
            {
                "title": "基础信息",          # 分区标题
                "icon": "📌",                # 分区图标(emoji)
                "collapsed": false,          # 默认是否折叠
                "fields": ["id", "name"],    # 该分区包含的字段名
                "layout": "grid",            # 可选: grid(双列网格)/默认(form)
                "type": "attribute_panel"    # 可选: 特殊控件类型
            }
        ]
        """
        config = _load_config()
        config.setdefault("types", {})
        config["types"][data_type] = groups
        _save_config(config)
        return True

    @staticmethod
    def add_section(data_type: str, section: dict) -> bool:
        """给某个类型追加一个分区"""
        config = _load_config()
        config.setdefault("types", {})
        sections = config["types"].setdefault(data_type, [])
        sections.append(section)
        _save_config(config)
        return True

    @staticmethod
    def remove_section(data_type: str, section_title: str) -> bool:
        """删除某个类型的指定分区（按标题匹配）"""
        config = _load_config()
        sections = config.get("types", {}).get(data_type, [])
        for i, sec in enumerate(sections):
            if sec.get("title") == section_title:
                sections.pop(i)
                _save_config(config)
                return True
        return False

    @staticmethod
    def add_field_to_section(data_type: str, section_title: str, field_name: str) -> bool:
        """往某个分区的字段列表里追加一个字段名"""
        config = _load_config()
        sections = config.get("types", {}).get(data_type, [])
        for sec in sections:
            if sec.get("title") == section_title:
                fields = sec.setdefault("fields", [])
                if field_name not in fields:
                    fields.append(field_name)
                    _save_config(config)
                    return True
                return True
        return False

    @staticmethod
    def remove_field_from_section(data_type: str, section_title: str, field_name: str) -> bool:
        """从某个分区的字段列表移除一个字段名"""
        config = _load_config()
        sections = config.get("types", {}).get(data_type, [])
        for sec in sections:
            if sec.get("title") == section_title:
                fields = sec.get("fields", [])
                if field_name in fields:
                    fields.remove(field_name)
                    _save_config(config)
                    return True
                return True
        return False

    @staticmethod
    def list_types() -> list[str]:
        """列出所有有自定义布局的类型"""
        config = _load_config()
        return list(config.get("types", {}).keys())

    @staticmethod
    def remove_layout(data_type: str) -> bool:
        """删除某个类型的整个布局配置"""
        config = _load_config()
        if data_type in config.get("types", {}):
            del config["types"][data_type]
            _save_config(config)
            return True
        return False

    @staticmethod
    def create_from_fields(data_type: str, fields: list[dict]) -> list[dict]:
        """根据字段列表自动生成初始的简单布局（全是fields的字段名）

        返回生成的 groups 列表
        """
        field_names = [f.get("name", f.get("id", "")) for f in fields if f.get("name") or f.get("id")]
        if not field_names:
            return []

        groups = [
            {
                "title": "基础信息",
                "icon": "📌",
                "collapsed": False,
                "fields": field_names
            }
        ]
        config = _load_config()
        config.setdefault("types", {})
        config["types"][data_type] = groups
        _save_config(config)
        return groups

    @staticmethod
    def set_stat_hints(data_type: str, hints: dict) -> bool:
        """添加/修改某个类型的属性参考范围"""
        config = _load_config()
        config.setdefault("stat_hints", {})
        config["stat_hints"][data_type] = hints
        _save_config(config)
        return True
