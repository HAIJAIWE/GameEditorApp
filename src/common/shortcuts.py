from collections.abc import Callable
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Optional


@dataclass
class Shortcut:
    key_sequence: str
    action_id: str
    description: str = ""
    category: str = "general"
    enabled: bool = True


DEFAULT_SHORTCUTS: dict[str, Shortcut] = {
    "file_new": Shortcut("Ctrl+N", "file_new", "新建文件", "file"),
    "file_open": Shortcut("Ctrl+O", "file_open", "打开文件", "file"),
    "file_save": Shortcut("Ctrl+S", "file_save", "保存", "file"),
    "file_save_as": Shortcut("Ctrl+Shift+S", "file_save_as", "另存为", "file"),
    "file_close": Shortcut("Ctrl+W", "file_close", "关闭当前标签", "file"),
    "file_quit": Shortcut("Alt+F4", "file_quit", "退出程序", "file"),
    "edit_undo": Shortcut("Ctrl+Z", "edit_undo", "撤销", "edit"),
    "edit_redo": Shortcut("Ctrl+Y", "edit_redo", "重做", "edit"),
    "edit_cut": Shortcut("Ctrl+X", "edit_cut", "剪切", "edit"),
    "edit_copy": Shortcut("Ctrl+C", "edit_copy", "复制", "edit"),
    "edit_paste": Shortcut("Ctrl+V", "edit_paste", "粘贴", "edit"),
    "edit_select_all": Shortcut("Ctrl+A", "edit_select_all", "全选", "edit"),
    "edit_find": Shortcut("Ctrl+F", "edit_find", "查找", "edit"),
    "edit_replace": Shortcut("Ctrl+H", "edit_replace", "替换", "edit"),
    "edit_delete": Shortcut("Delete", "edit_delete", "删除当前项", "edit"),
    "edit_duplicate": Shortcut("Ctrl+D", "edit_duplicate", "复制当前项", "edit"),
    "data_refresh": Shortcut("F5", "data_refresh", "刷新数据", "data"),
    "data_rename": Shortcut("F2", "data_rename", "重命名当前项（列表聚焦时）", "data"),
    "data_search": Shortcut("Ctrl+Shift+F", "data_search", "全局搜索", "data"),
    "data_validate": Shortcut("F7", "data_validate", "数据验证", "data"),
    "data_export": Shortcut("Ctrl+E", "data_export", "导出数据", "data"),
    "data_import": Shortcut("Ctrl+I", "data_import", "导入数据", "data"),
    "view_zoom_in": Shortcut("Ctrl+=", "view_zoom_in", "放大", "view"),
    "view_zoom_out": Shortcut("Ctrl+-", "view_zoom_out", "缩小", "view"),
    "view_zoom_reset": Shortcut("Ctrl+0", "view_zoom_reset", "重置缩放", "view"),
    "view_fullscreen": Shortcut("F11", "view_fullscreen", "全屏", "view"),
    "view_toggle_theme": Shortcut("Ctrl+T", "view_toggle_theme", "切换主题", "view"),
    "ai_assistant": Shortcut("Ctrl+Space", "ai_assistant", "AI助手", "ai"),
    "ai_quick_ask": Shortcut("Ctrl+Shift+Space", "ai_quick_ask", "快速提问", "ai"),
    "panel_data": Shortcut("Ctrl+1", "panel_data", "数据面板", "navigation"),
    "panel_planning": Shortcut("Ctrl+2", "panel_planning", "策划面板", "navigation"),
    "panel_settings": Shortcut("Ctrl+,", "panel_settings", "设置", "navigation"),
    "nav_previous": Shortcut("Ctrl+PageUp", "nav_previous", "上一个标签", "navigation"),
    "nav_next": Shortcut("Ctrl+PageDown", "nav_next", "下一个标签", "navigation"),
}


class ShortcutManager:
    _instance: Optional[ShortcutManager] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._shortcuts: dict[str, Shortcut] = {}
        self._handlers: dict[str, Callable[[], None]] = {}
        self._bindings: dict[str, Any] = {}
        self.reset_to_defaults()

    def reset_to_defaults(self):
        self._shortcuts = {
            sid: Shortcut(s.key_sequence, s.action_id, s.description, s.category)
            for sid, s in DEFAULT_SHORTCUTS.items()
        }

    def register_handler(self, action_id: str, handler: Callable[[], None]):
        self._handlers[action_id] = handler

    def unregister_handler(self, action_id: str):
        self._handlers.pop(action_id, None)

    def bind_to_widget(self, widget: Any, shortcut_id: str):
        shortcut = self._shortcuts.get(shortcut_id)
        if shortcut and shortcut.enabled:
            widget.setShortcut(shortcut.key_sequence)
            self._bindings[shortcut_id] = widget

    def get_shortcut(self, shortcut_id: str) -> Optional[Shortcut]:
        return self._shortcuts.get(shortcut_id)

    def get_key_sequence(self, shortcut_id: str) -> Optional[str]:
        s = self._shortcuts.get(shortcut_id)
        return s.key_sequence if s else None

    def set_key_sequence(self, shortcut_id: str, key_sequence: str):
        if shortcut_id in self._shortcuts:
            self._shortcuts[shortcut_id].key_sequence = key_sequence
            self._update_binding(shortcut_id)

    def set_enabled(self, shortcut_id: str, enabled: bool):
        if shortcut_id in self._shortcuts:
            self._shortcuts[shortcut_id].enabled = enabled
            self._update_binding(shortcut_id)

    def _update_binding(self, shortcut_id: str):
        widget = self._bindings.get(shortcut_id)
        if widget and self._shortcuts[shortcut_id].enabled:
            widget.setShortcut(self._shortcuts[shortcut_id].key_sequence)

    def execute(self, shortcut_id: str) -> bool:
        handler = self._handlers.get(shortcut_id)
        if handler:
            handler()
            return True
        return False

    def get_all_shortcuts(self) -> list[dict]:
        categories: dict[str, list[dict]] = {}
        for sid, s in self._shortcuts.items():
            entry = {
                "id": sid,
                "keys": s.key_sequence,
                "description": s.description,
                "enabled": s.enabled,
            }
            categories.setdefault(s.category, []).append(entry)
        return [
            {"category": cat, "shortcuts": items}
            for cat, items in sorted(categories.items())
        ]

    def find_conflicts(self) -> list[dict[str, str]]:
        conflicts: list[dict[str, str]] = []
        seen: dict[str, str] = {}
        for sid, s in self._shortcuts.items():
            if not s.enabled:
                continue
            if s.key_sequence in seen:
                conflicts.append({
                    "keys": s.key_sequence,
                    "action_a": seen[s.key_sequence],
                    "action_b": sid,
                })
            else:
                seen[s.key_sequence] = sid
        return conflicts

    def export_config(self, filepath: str):
        config = {
            sid: {
                "keys": s.key_sequence,
                "enabled": s.enabled,
            }
            for sid, s in self._shortcuts.items()
        }
        Path(filepath).write_text(
            json.dumps(config, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    def import_config(self, filepath: str):
        content = Path(filepath).read_text(encoding="utf-8")
        config = json.loads(content)
        for sid, data in config.items():
            if sid in self._shortcuts:
                if "keys" in data:
                    self._shortcuts[sid].key_sequence = data["keys"]
                if "enabled" in data:
                    self._shortcuts[sid].enabled = data["enabled"]


def get_shortcut_manager() -> ShortcutManager:
    return ShortcutManager()
