"""DigitalPanel 跨 mixin 共享状态声明

DigitalPanel 由若干 mixin 组合而成（界面 / 工作区 / 任务 / 输入 / 对话 / 主题），
mixin 之间通过实例属性共享状态；这些属性统一在此声明，使 mypy 在各 mixin
上下文中也能解析 self.*。本类仅作类型声明，不承载运行时代码。
"""
from __future__ import annotations

from typing import Any, Optional

from PyQt6.QtWidgets import QVBoxLayout, QWidget

from ui.digital_employee_workers import AgentWorker


class DigitalPanelState(QWidget):
    """DigitalPanel 各 mixin 的公共基类（声明共享属性与跨 mixin 方法签名）"""

    # ─ 依赖注入 ──
    _logger: Any
    _brain: Any
    _agent_manager: Any
    _workspace_mgr: Any
    _renderer: Any

    # ── 运行状态 ──
    _worker: Optional[AgentWorker]
    _extra: dict
    _cmd_popup_visible: bool
    _current_task_id: Optional[str]
    _current_conv_id: str
    _task_histories: dict[str, list[dict]]
    _general_history: list[dict]
    _stream_buffer: list[str]
    _step_id_counter: int
    _step_states: dict[int, bool]
    _step_data: dict[int, dict]

    # ── 信号与界面控件（在 _build_* / _apply_* 中创建）──
    question_asked: Any
    _title_bar: Any
    _popout_btn: Any
    _draft_btn: Any
    _clear_btn: Any
    _info_label: Any
    _gen_label: Any
    _workspace_combo: Any
    _task_panel: Any
    _task_title_label: Any
    _task_badge: Any
    _task_rows: Any
    _task_placeholder: Any
    _status_dot: Any
    _status_text: Any
    _status_progress: Any
    _status_bar: Any
    _chat_display: Any
    _compose: Any
    _input_edit: Any
    _send_btn: Any
    _model_btn: Any
    _team_btn: Any
    _cmd_popup: Any
    _slash_commands: Any
    _thinking_id: Any

    # ── 跨 mixin 方法签名声明（实现见对应 mixin；MRO 下真实实现优先于此处）──
    # STUBS
    def _load_history(self):
        raise NotImplementedError
    def _setup_ui(self):
        raise NotImplementedError
    def _build_header_row(self, root: QVBoxLayout):
        raise NotImplementedError
    def _minimize_window(self):
        raise NotImplementedError
    def _build_task_panel(self, root: QVBoxLayout):
        raise NotImplementedError
    def _connect_task_watcher(self):
        raise NotImplementedError
    def _toggle_task_panel(self):
        raise NotImplementedError
    def _refresh_workspace_list(self):
        raise NotImplementedError
    def reload_for_workspace(self):
        raise NotImplementedError
    def _on_workspace_changed(self, index: int):
        raise NotImplementedError
    def _on_workspace_menu(self, pos):
        raise NotImplementedError
    def _open_popup(self):
        raise NotImplementedError
    def _show_clear_menu(self):
        raise NotImplementedError
    def _show_draft_menu(self):
        raise NotImplementedError
    def _draft_dir(self):
        raise NotImplementedError
    def _save_draft(self):
        raise NotImplementedError
    def _load_draft(self):
        raise NotImplementedError
    def _load_draft_from(self, path: str):
        raise NotImplementedError
    def _list_drafts(self) -> list:
        raise NotImplementedError
    def _autosave_draft(self):
        raise NotImplementedError
    def _new_chat(self):
        raise NotImplementedError
    def _clear_current_chat(self):
        raise NotImplementedError
    def _clear_all_history(self):
        raise NotImplementedError
    def _on_tasks_changed(self, tasks):
        raise NotImplementedError
    def _safe_invoke(self, fn, *args, **kwargs):
        raise NotImplementedError
    def _on_asked_question(self, qid: str, questions: list):
        raise NotImplementedError
    def _show_question_dialog(self, qid: str, questions: list):
        raise NotImplementedError
    def _refresh_task_panel(self):
        raise NotImplementedError
    def _update_task_panel_height(self):
        raise NotImplementedError
    def _build_status_bar(self, root: QVBoxLayout):
        raise NotImplementedError
    def _set_status(self, text: str, progress: str = "", busy: bool = False):
        raise NotImplementedError
    def _build_chat_area(self, root: QVBoxLayout):
        raise NotImplementedError
    def _record_bubble(self, entry: dict):
        raise NotImplementedError
    def _switch_to_task(self, task_id: str):
        raise NotImplementedError
    def _switch_to_general(self):
        raise NotImplementedError
    def _on_task_status_changed(self, task_id: str, new_status: str):
        raise NotImplementedError
    def _on_task_deleted(self, task_id: str):
        raise NotImplementedError
    def _update_task_badge(self):
        raise NotImplementedError
    def _build_input_area(self, root: QVBoxLayout):
        raise NotImplementedError
    def _setup_style(self):
        raise NotImplementedError
    def set_embedded_mode(self, embedded: bool = True):
        raise NotImplementedError
    def _refresh_team_btn(self):
        raise NotImplementedError
    def _open_team_dialog(self):
        raise NotImplementedError
    def _refresh_model_btn(self):
        raise NotImplementedError
    def _show_model_menu(self):
        raise NotImplementedError
    def _on_model_selected(self, provider, model):
        raise NotImplementedError
    def _on_input_changed(self, text: str):
        raise NotImplementedError
    def _on_cmd_selected(self, item):
        raise NotImplementedError
    def _load_slash_commands(self):
        raise NotImplementedError
    def _event_filter_cmd_popup(self, obj, event):
        raise NotImplementedError
    def _gather_editor_context(self) -> dict:
        raise NotImplementedError
    def _send_message(self):
        raise NotImplementedError
    def _on_progress(self, event_type: str, data: dict):
        raise NotImplementedError
    def _on_finished(self, result: dict):
        raise NotImplementedError
    def _add_plan_bubble(self, plan_text: str):
        raise NotImplementedError
    def _format_results(self, results: dict) -> str:
        raise NotImplementedError
    def _is_dark_mode(self) -> bool:
        raise NotImplementedError
    def _add_user_bubble(self, text: str):
        raise NotImplementedError
    def _add_assistant_bubble(self, text: str):
        raise NotImplementedError
    def _add_system_message(self, text: str):
        raise NotImplementedError
    def _add_error_message(self, text: str):
        raise NotImplementedError
    def _scroll_to_bottom(self):
        raise NotImplementedError
    def _add_collapsible_step(self, title: str, detail: str, step_id: int, error: bool = False):
        raise NotImplementedError
    def _rebuild_chat(self):
        raise NotImplementedError
    def _flush_stream_step(self):
        raise NotImplementedError
    def _rollback_conversation(self, conv_id: str):
        raise NotImplementedError
    def _event_filter_chat_and_workspace(self, obj, event):
        raise NotImplementedError
    def _cancel_worker(self):
        raise NotImplementedError
    def _restore_send_button(self):
        raise NotImplementedError
    def _add_thinking_indicator(self):
        raise NotImplementedError
    def _remove_thinking_indicator(self):
        raise NotImplementedError
    def show_memory_context(self):
        raise NotImplementedError
    def send_welcome(self):
        raise NotImplementedError
    def _theme_menu_qss(self) -> str:
        raise NotImplementedError
    def _apply_chat_theme(self):
        raise NotImplementedError
    def _apply_chat_display_theme(self, colors):
        raise NotImplementedError
    def _apply_workspace_combo_theme(self, colors):
        raise NotImplementedError
    def _apply_task_labels_theme(self, colors):
        raise NotImplementedError
    def _apply_input_area_theme(self, colors, dark):
        raise NotImplementedError
    def _apply_task_panel_theme(self, colors):
        raise NotImplementedError
    def _apply_misc_widgets_theme(self, colors):
        raise NotImplementedError
    def _on_theme_changed_panel(self, theme=None, **kwargs):
        raise NotImplementedError
