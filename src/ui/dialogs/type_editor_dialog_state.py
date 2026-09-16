"""TypeEditorDialog 各 mixin 的公共基类（声明共享属性与跨 mixin 方法签名）

AI 辅助方法在 type_editor_ai.py（TypeEditorAIMixin）中实现；mixin 通过本类
声明的属性与签名访问对话框状态与既有方法，实现仍由主类提供（MRO 下真实实现优先）。
本类不承载运行时代码。
"""
from __future__ import annotations

from typing import Any

from PyQt6.QtWidgets import QDialog

from core.type_schema import TypeField, TypeSchema


class TypeEditorDialogState(QDialog):
    """TypeEditorDialog 与各 mixin 的公共基类（仅声明属性与签名）"""

    # ─ 状态 ─
    schema: Any
    data_type: Any
    _dirty: bool
    _original_key: Any
    _suppress_change: bool
    _current_type_index: int
    _current_field_index: int
    _groups: Any
    _selected_color: Any

    # ── 界面控件 ──
    type_list: Any
    field_list: Any
    field_editor_layout: Any
    layout_editor: Any
    current_field_editor: Any
    color_btn: Any
    ai_suggest_btn: Any
    analyze_data_btn: Any
    add_type_btn: Any
    del_type_btn: Any
    add_field_btn: Any
    del_field_btn: Any
    add_section_btn: Any
    del_section_btn: Any
    auto_btn: Any

    # ── 跨 mixin 方法签名声明（实现见对应 mixin / 主类）──
    # STUBS
    def _build_tools_bar(self, main_layout) -> None:
        raise NotImplementedError
    def _build_left_panel(self, splitter) -> None:
        raise NotImplementedError
    def _build_right_panel(self, splitter) -> None:
        raise NotImplementedError
    def _build_bottom_bar(self, main_layout) -> None:
        raise NotImplementedError
    def setup_ui(self):
        raise NotImplementedError
    def pick_color(self):
        raise NotImplementedError
    def _update_color_button(self):
        raise NotImplementedError
    def on_type_selected(self, row):
        raise NotImplementedError
    def on_field_selected(self, row):
        raise NotImplementedError
    def _clear_field_editor(self):
        raise NotImplementedError
    def _show_placeholder(self):
        raise NotImplementedError
    def _show_field_editor(self, field: TypeField):
        raise NotImplementedError
    def add_type(self):
        raise NotImplementedError
    def delete_type(self):
        raise NotImplementedError
    def add_field(self):
        raise NotImplementedError
    def delete_field(self):
        raise NotImplementedError
    def move_field(self, direction):
        raise NotImplementedError
    def _rebuild_type_list(self):
        raise NotImplementedError
    def _refresh_field_list(self):
        raise NotImplementedError
    def _mark_dirty(self):
        raise NotImplementedError
    def get_schema(self) -> TypeSchema:
        raise NotImplementedError
    def accept(self):
        raise NotImplementedError
    def _save_layout(self):
        raise NotImplementedError
    def _update_layout_editor(self, t):
        raise NotImplementedError
    @staticmethod
    def edit(schema: TypeSchema, library_name: str, parent=None) -> bool:
        raise NotImplementedError
