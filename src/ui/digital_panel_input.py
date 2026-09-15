"""输入区交互、斜杠命令与消息发送 —— DigitalPanel 的 DigitalPanelInputMixin 部分

自 digital_employee.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore import (
    QEvent,
    Qt,
)

from common.logger import get_logger
from ui.digital_employee_workers import AgentWorker
from ui.digital_panel_state import DigitalPanelState

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()



class DigitalPanelInputMixin(DigitalPanelState):
    """输入区交互、斜杠命令与消息发送"""

    def _on_input_changed(self, text: str):
        if text.startswith("/"):
            parts = text.split(" ")
            prefix = parts[0].lower() if len(parts) > 0 else text.lower()
            self._cmd_popup.clear()
            if hasattr(self, '_slash_commands'):
                matches = [(c, d) for c, d in self._slash_commands if c.lower().startswith(prefix)]
                if matches:
                    for cmd, desc in matches:
                        self._cmd_popup.addItem(f"{cmd}  —  {desc}")
                    self._cmd_popup.setVisible(True)
                    self._cmd_popup.setFixedHeight(min(len(matches) * 28 + 8, 160))
                    self._cmd_popup_visible = True
                else:
                    self._cmd_popup.setVisible(False)
                    self._cmd_popup_visible = False
            else:
                self._cmd_popup.setVisible(False)
                self._cmd_popup_visible = False
        else:
            self._cmd_popup.setVisible(False)
            self._cmd_popup_visible = False
    def _on_cmd_selected(self, item):
        cmd = item.text().split("  —")[0].strip()
        self._input_edit.setText(cmd + " ")
        self._input_edit.setFocus()
        self._cmd_popup.setVisible(False)
        self._cmd_popup_visible = False
    def _load_slash_commands(self):
        commands = [
            ("/create <类型> <名称>", "创建角色/怪物/技能等"),
            ("/update <字段> <值>", "修改当前条目属性"),
            ("/delete", "删除当前条目"),
            ("/search <关键词>", "搜索条目"),
            ("/switch <数据类型>", "切换标签页"),
            ("/check", "检查数据一致性"),
            ("/batch <操作>", "批量修改数据"),
            ("/export", "导出当前数据"),
            ("/help", "查看可用指令"),
            ("/write <文件>", "写文件"),
            ("/read <文件>", "读文件"),
            ("/code <描述>", "生成代码"),
            ("/shell <命令>", "执行命令"),
            ("/chat <内容>", "自由对话"),
        ]
        try:
            brain = self._brain
            registry = getattr(brain, 'registry', None)
            if registry and hasattr(registry, 'list_skills'):
                for s in registry.list_skills:
                    name = s.get("name", "")
                    desc = s.get("description", "")[:30]
                    if name:
                        commands.append((f"/{name}", desc))
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self._slash_commands = commands
    def _event_filter_cmd_popup(self, obj, event):
        if obj is self._input_edit and self._cmd_popup_visible and self._cmd_popup.count() > 0:
            if event.type() == QEvent.Type.KeyPress:
                key = event.key()
                if key == Qt.Key.Key_Down:
                    row = self._cmd_popup.currentRow()
                    row = (row + 1) % self._cmd_popup.count()
                    self._cmd_popup.setCurrentRow(row)
                    return True
                elif key == Qt.Key.Key_Up:
                    row = self._cmd_popup.currentRow()
                    row = (row - 1) % self._cmd_popup.count()
                    self._cmd_popup.setCurrentRow(row)
                    return True
                elif key == Qt.Key.Key_Return or key == Qt.Key.Key_Enter:
                    item = self._cmd_popup.currentItem()
                    if item:
                        self._on_cmd_selected(item)
                        return True
                elif key == Qt.Key.Key_Escape:
                    self._cmd_popup.setVisible(False)
                    self._cmd_popup_visible = False
                    return True
        return False
    def _gather_editor_context(self) -> dict:
        """收集当前编辑器上下文，让 AI 感知界面状态"""
        ctx: dict[str, object] = {"visible": True}
        mw = self._extra.get("main_window") if self._extra else None
        if not mw:
            return ctx

        # 布局模式
        if getattr(mw, 'is_three_column_layout', False):
            ctx["layout"] = "三栏布局（左列表|中编辑|右对话）"
        elif getattr(mw, 'tab_widget', None):
            ctx["layout"] = "标签页布局"

        # 当前活跃标签页
        if hasattr(mw, 'tab_widget') and mw.tab_widget:
            idx = mw.tab_widget.currentIndex()
            if idx >= 0:
                ctx["current_tab"] = mw.tab_widget.tabText(idx)

        # 可用数据类型
        if hasattr(mw, 'data_type_combo'):
            combo = mw.data_type_combo
            ctx["data_types"] = [combo.itemText(i) for i in range(min(combo.count(), 12))]

        # 三栏/左右栏模式下的项目列表
        if hasattr(mw, 'project_list') and mw.project_list:
            items = []
            for i in range(min(mw.project_list.count(), 10)):
                item = mw.project_list.item(i)
                if item:
                    items.append(item.text())
            if items:
                ctx["project_list"] = items

        # 当前编辑项
        if hasattr(mw, 'current_editor') and mw.current_editor:
            editor = mw.current_editor
            if hasattr(editor, 'current_item') and editor.current_item:
                item = editor.current_item
                ctx["current_item"] = {
                    "id": item.get("id", "?"),
                    "name": item.get("name", "?"),
                    "type": getattr(editor, 'data_type', '?'),
                }

        # 数据概览
        dm = self._extra.get("data_manager") if self._extra else None
        if dm and dm.data:
            stats = {k: len(v) for k, v in dm.data.items() if isinstance(v, list)}
            if stats:
                ctx["data_stats"] = stats

        return ctx
    def _send_message(self):
        self._cmd_popup.setVisible(False)
        self._cmd_popup_visible = False
        if self._worker and self._worker.isRunning():
            self._cancel_worker()
            return

        user_text = self._input_edit.text().strip()
        if not user_text:
            return
        self._input_edit.clear()
        self._input_edit.setEnabled(False)
        self._add_user_bubble(user_text)

        from ui.themes import theme_color
        self._send_btn.setText("■")
        self._send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('danger')};
                color: {theme_color('danger_hover')};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {theme_color('danger_hover')};
                color: {theme_color('btn_text')};
            }}
        """)
        self._add_thinking_indicator()

        extra = dict(self._extra) if self._extra else {}
        extra["editor_context"] = self._gather_editor_context()

        # 生成会话 ID，用于操作回滚
        import uuid
        self._current_conv_id = uuid.uuid4().hex[:12]
        extra["_conv_id"] = self._current_conv_id

        self._worker = AgentWorker(self._brain, user_text, extra=extra)
        self._worker.progress.connect(self._on_progress)
        self._worker.finished.connect(self._on_finished)
        self._worker.start()
