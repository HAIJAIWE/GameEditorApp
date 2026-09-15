"""工作区切换与对话草稿（保存/加载/清理） —— DigitalPanel 的 DigitalPanelWorkspaceMixin 部分

自 digital_employee.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PyQt6.QtCore import (
    QTimer,
)
from PyQt6.QtWidgets import (
    QInputDialog,
    QMenu,
    QMessageBox,
)

from common.logger import get_logger
from ui.digital_panel_state import DigitalPanelState

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()



class DigitalPanelWorkspaceMixin(DigitalPanelState):
    """工作区切换与对话草稿（保存/加载/清理）"""

    def _load_history(self):
        """加载并显示历史对话"""
        if not self._brain or not hasattr(self._brain, 'memory'):
            return
        history = self._brain.memory.load_recent_conversations(10)
        if not history:
            return
        for entry in history:
            self._add_user_bubble(entry.get("user", ""))
            self._add_assistant_bubble(entry.get("assistant", ""))
    def _refresh_workspace_list(self):
        """刷新工作区下拉列表"""
        self._workspace_combo.blockSignals(True)
        self._workspace_combo.clear()
        workspaces = self._workspace_mgr.list_workspaces()
        for ws in workspaces:
            label = f" {'● ' if ws['active'] else '  '}{ws['name']}"
            self._workspace_combo.addItem(label, ws['id'])
            if ws['active']:
                self._workspace_combo.setCurrentIndex(self._workspace_combo.count() - 1)
        # 分隔 + 新建工作区
        self._workspace_combo.insertSeparator(self._workspace_combo.count())
        self._workspace_combo.addItem("  新建工作区...", "__new__")
        self._workspace_combo.blockSignals(False)
    def reload_for_workspace(self):
        self._refresh_workspace_list()
        if self._brain and hasattr(self._brain, 'reload_workspace'):
            self._brain.reload_workspace()
    def _on_workspace_changed(self, index: int):
        """切换工作区"""
        if index < 0:
            return
        ws_id = self._workspace_combo.itemData(index)
        if ws_id == "__new__":
            name, ok = QInputDialog.getText(self, "新建工作区", "工作区名称（例：新项目）:")
            if ok and name.strip():
                self._workspace_mgr.create_workspace(name.strip(), persona=f"# {name.strip()}")
                self._refresh_workspace_list()
            else:
                self._refresh_workspace_list()  # 恢复到当前工作区
            return
        if not ws_id or ws_id == self._workspace_mgr.current:
            return
        self._workspace_mgr.switch_workspace(ws_id)
        # 通知 brain 重载新工作区的记忆和身份
        if self._brain and hasattr(self._brain, 'reload_workspace'):
            self._brain.reload_workspace()
            self._chat_display.clear()
            QTimer.singleShot(100, self._load_history)
            if self._brain and hasattr(self._brain, 'memory') and hasattr(self._brain.memory, 'clear_session'):
                self._brain.memory.clear_session()
        self._refresh_workspace_list()
        self._logger.info(f"工作区已切换至: {ws_id}")
    def _on_workspace_menu(self, pos):
        """右键菜单：删除工作区"""
        combo = self._workspace_combo
        # 获取下拉列表视图中当前鼠标下的项
        view = combo.view()
        index = view.indexAt(pos)
        if not index.isValid():
            return
        ws_id = combo.itemData(index.row())
        if not ws_id or ws_id in ("__new__",):
            return
        if ws_id == "default":
            return  # 默认工作区不可删

        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())
        delete_action = menu.addAction(f"删除「{combo.itemText(index.row()).strip()}」")
        action = menu.exec(view.mapToGlobal(pos))
        if action == delete_action:
            reply = QMessageBox.question(
                self, "确认删除",
                f"确定要删除工作区「{ws_id}」吗？\n所有对话记录和策划案将被永久删除。",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply == QMessageBox.StandardButton.Yes:
                # 如果要删的是当前工作区，先切到 default
                if ws_id == self._workspace_mgr.current:
                    self._workspace_mgr.switch_workspace("default")
                    if self._brain and hasattr(self._brain, 'reload_workspace'):
                        self._brain.reload_workspace()
                ok = self._workspace_mgr.delete_workspace(ws_id)
                if ok:
                    self._refresh_workspace_list()
                    self._logger.info(f"已删除工作区: {ws_id}")
                else:
                    QMessageBox.warning(self, "删除失败",
                        f"无法删除工作区「{ws_id}」。")
    def _open_popup(self):
        from ui.digital_employee import DigitalEmployeePopup  # 延迟导入：避免与 digital_employee 循环导入

        theme_name = "默认"
        p = self.parent()
        while p:
            if hasattr(p, 'current_theme'):
                theme_name = p.current_theme
                break
            p = p.parent()
        popup = DigitalEmployeePopup(self._brain, self.parent(), self._extra.get("data_manager"), theme_name)
        popup.show()
    def _show_clear_menu(self):
        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())

        new_action = menu.addAction("新建对话")
        new_action.triggered.connect(self._new_chat)

        menu.addSeparator()

        clear_action = menu.addAction("清空当前对话")
        clear_action.triggered.connect(self._clear_current_chat)

        clear_all = menu.addAction("删除全部聊天记录")
        clear_all.triggered.connect(self._clear_all_history)

        pos = self._clear_btn.mapToGlobal(self._clear_btn.rect().bottomLeft())
        menu.exec(pos)
    def _show_draft_menu(self):
        """草稿管理菜单"""
        from PyQt6.QtWidgets import QMenu
        menu = QMenu(self)
        menu.setStyleSheet(self._theme_menu_qss())

        save_action = menu.addAction("💾 保存当前对话为草稿")
        save_action.triggered.connect(self._save_draft)

        load_action = menu.addAction("📂 从草稿恢复对话")
        load_action.triggered.connect(self._load_draft)

        menu.addSeparator()

        # 列出已有草稿（最多 5 个最近的）
        drafts = self._list_drafts()
        if drafts:
            recent_menu = menu.addMenu("最近草稿")
            for d in drafts[:5]:
                action = recent_menu.addAction(f"{d['name']} ({d['time']})")
                action.triggered.connect(lambda checked, p=d['path']: self._load_draft_from(p))

        pos = self._draft_btn.mapToGlobal(self._draft_btn.rect().bottomLeft())
        menu.exec(pos)
    def _draft_dir(self):
        """草稿保存目录"""
        d = Path(__file__).resolve().parent.parent.parent / "data" / "drafts"
        d.mkdir(parents=True, exist_ok=True)
        return d
    def _save_draft(self):
        """保存当前对话为草稿"""
        import datetime
        import json

        from PyQt6.QtWidgets import QInputDialog

        # 获取草稿名
        default_name = f"对话草稿_{datetime.datetime.now().strftime('%m%d_%H%M')}"
        name, ok = QInputDialog.getText(self, "保存草稿", "草稿名称:", text=default_name)
        if not ok or not name.strip():
            return
        name = name.strip()

        # 收集对话内容
        content = self._chat_display.toHtml()
        history = list(self._general_history) if hasattr(self, '_general_history') else []

        draft = {
            "name": name,
            "time": datetime.datetime.now().isoformat(),
            "content_html": content,
            "history": history,
        }

        path = self._draft_dir() / f"{name}.json"
        try:
            path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
            self._add_system_message(f"💾 草稿已保存: {name}")
        except Exception as e:
            self._add_system_message(f"❌ 保存草稿失败: {e}")
    def _load_draft(self):
        """从草稿恢复对话"""
        from PyQt6.QtWidgets import QFileDialog
        path, _ = QFileDialog.getOpenFileName(
            self, "选择草稿文件", str(self._draft_dir()), "草稿文件 (*.json)"
        )
        if path:
            self._load_draft_from(path)
    def _load_draft_from(self, path: str):
        """从指定路径加载草稿"""
        import json
        try:
            draft = json.loads(Path(path).read_text(encoding='utf-8'))
            self._chat_display.setHtml(draft.get("content_html", ""))
            if hasattr(self, '_general_history') and draft.get("history"):
                self._general_history = list(draft["history"])
            self._add_system_message(f"📂 已恢复草稿: {draft.get('name', '未命名')}")
        except Exception as e:
            self._add_system_message(f"❌ 恢复草稿失败: {e}")
    def _list_drafts(self) -> list:
        """列出所有草稿"""
        import json
        drafts = []
        for p in self._draft_dir().glob("*.json"):
            try:
                d = json.loads(p.read_text(encoding='utf-8'))
                time_str = d.get("time", "")[:16].replace("T", " ")
                drafts.append({
                    "name": d.get("name", p.stem),
                    "time": time_str,
                    "path": str(p),
                })
            except Exception:
                continue
        drafts.sort(key=lambda x: x["time"], reverse=True)
        return drafts
    def _autosave_draft(self):
        """自动保存当前对话（每次发送后调用，覆盖式）"""
        import datetime
        import json
        try:
            content = self._chat_display.toHtml()
            history = list(self._general_history) if hasattr(self, '_general_history') else []
            draft = {
                "name": "自动草稿",
                "time": datetime.datetime.now().isoformat(),
                "content_html": content,
                "history": history,
            }
            path = self._draft_dir() / "_autosave.json"
            path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception:
            pass  # 自动保存失败不影响主流程
    def _new_chat(self):
        if self._current_task_id is not None:
            self._switch_to_general()
        self._chat_display.clear()
        self._general_history.clear()
        self._add_system_message("🆕 新对话已开始")
    def _clear_current_chat(self):
        self._chat_display.clear()
        if self._current_task_id is None:
            self._general_history.clear()
        else:
            self._task_histories.pop(self._current_task_id, None)
        self._add_system_message("当前对话已清空")
    def _clear_all_history(self):
        reply = QMessageBox.question(
            self, "确认删除",
            "确定要删除所有聊天记录吗？\n此操作不可恢复。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        self._chat_display.clear()
        self._general_history.clear()
        self._task_histories.clear()
        self._current_task_id = None
        self._update_task_badge()
        try:
            import os
            log_file = self._workspace_mgr.memory_dir / "conversation_log.jsonl"
            if log_file.exists():
                os.remove(log_file)
        except OSError as e:
            logger.warning(f"操作失败: {e}")
        try:
            if self._brain and hasattr(self._brain, 'memory'):
                self._brain.memory.clear_session()
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        self._add_system_message("所有聊天记录已清除")
