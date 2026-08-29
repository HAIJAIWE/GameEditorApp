"""团队管理对话框 — 单tab：团队管理 + 成员工具配置 + 智能体定义"""
from __future__ import annotations

from common.logger import get_logger
from ui.themes import theme_color

logger = get_logger()

from typing import Optional
import uuid

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QCheckBox,
    QDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.agent.agents.agent_manager import AgentDefinition, AgentManager, Team


class TeamDialog(QDialog):
    """团队管理对话框 — 团队 + 成员工具配置 + 智能体定义管理"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._agent_manager = AgentManager()
        self._dispatcher = None
        # 尝试通过父窗口获取 dispatcher（用于获取 MCP/skills 列表）
        self._init_dispatcher()

        self._editing_team_id: Optional[str] = None
        # 自定义提示词: agent_id → 自定义 prompt 文本
        self._custom_prompts: dict[str, str] = {}
        # 成员工具覆盖: agent_id → 团队内可用工具列表（None=使用默认）
        self._member_tools: dict[str, Optional[list[str]]] = {}

        self.setWindowTitle("团队 & 智能体管理")
        self.setMinimumSize(860, 620)
        self.setModal(True)

        self._setup_ui()
        self._load_teams()

    def _init_dispatcher(self):
        try:
            mw = self.parent()
            if hasattr(mw, 'agent_brain') and mw.agent_brain:
                self._dispatcher = mw.agent_brain.dispatcher
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    # ════════════════════════════════════════════════════════════
    # UI 构建
    # ════════════════════════════════════════════════════════════

    def _setup_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(8)

        main_layout = QHBoxLayout()
        main_layout.setSpacing(12)

        # ── 左侧：团队列表 ──
        left_panel = QVBoxLayout()
        left_panel.setSpacing(6)
        left_panel.addWidget(QLabel("我的团队"))
        self._team_list = QListWidget()
        self._team_list.setMinimumWidth(160)
        self._team_list.setStyleSheet("""
            QListWidget { background: palette(window); border: 1px solid palette(mid); border-radius: 6px; font-size: 13px; padding: 4px; }
            QListWidget::item { padding: 6px 8px; border-radius: 4px; }
            QListWidget::item:selected { background: palette(highlight); color: palette(highlighted-text); }
            QListWidget::item:hover:!selected { background: palette(midlight); }
        """)
        self._team_list.currentRowChanged.connect(self._on_team_selected)
        left_panel.addWidget(self._team_list)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(4)
        self._new_team_btn = QPushButton("新建")
        self._new_team_btn.clicked.connect(self._new_team)
        self._del_team_btn = QPushButton("删除")
        self._del_team_btn.clicked.connect(self._delete_team)
        self._del_team_btn.setEnabled(False)
        btn_row.addWidget(self._new_team_btn)
        btn_row.addWidget(self._del_team_btn)
        left_panel.addLayout(btn_row)
        main_layout.addLayout(left_panel, 1)

        # ── 右侧：主编辑区 ──
        right_panel = QVBoxLayout()
        right_panel.setSpacing(6)

        # 团队名称
        name_row = QHBoxLayout()
        name_row.addWidget(QLabel("团队名称:"))
        self._team_name_input = QLineEdit()
        self._team_name_input.setPlaceholderText("输入团队名称...")
        name_row.addWidget(self._team_name_input)
        right_panel.addLayout(name_row)

        # 团队描述
        self._team_desc_input = QTextEdit()
        self._team_desc_input.setPlaceholderText("团队描述（可选）...")
        self._team_desc_input.setMaximumHeight(50)
        right_panel.addWidget(self._team_desc_input)

        # 团队成员
        right_panel.addWidget(QLabel("团队成员（勾选启用）:"))
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("border: 1px solid palette(mid); border-radius: 6px;")
        scroll_content = QWidget()
        self._member_layout = QVBoxLayout(scroll_content)
        self._member_layout.setSpacing(4)
        self._member_layout.setContentsMargins(8, 8, 8, 8)
        scroll.setWidget(scroll_content)
        right_panel.addWidget(scroll, 1)

        # 底部按钮行
        bottom_row = QHBoxLayout()
        bottom_row.setSpacing(6)

        self._manage_agents_btn = QPushButton("管理智能体定义")
        self._manage_agents_btn.setStyleSheet("font-size: 11px; padding: 3px 8px;")
        self._manage_agents_btn.clicked.connect(self._open_agent_manager)
        bottom_row.addWidget(self._manage_agents_btn)

        bottom_row.addStretch()

        self._use_solo_btn = QPushButton("切换到个人模式")
        self._use_solo_btn.clicked.connect(self._switch_to_solo)
        bottom_row.addWidget(self._use_solo_btn)

        self._save_team_btn = QPushButton("保存团队")
        self._save_team_btn.clicked.connect(self._save_team)
        bottom_row.addWidget(self._save_team_btn)

        self._use_team_btn = QPushButton("使用此团队")
        self._use_team_btn.clicked.connect(self._use_team)
        self._use_team_btn.setEnabled(False)
        bottom_row.addWidget(self._use_team_btn)

        right_panel.addLayout(bottom_row)
        main_layout.addLayout(right_panel, 2)
        root.addLayout(main_layout)

        # 底栏状态
        status_layout = QHBoxLayout()
        self._status_label = QLabel()
        self._status_label.setStyleSheet("color: palette(mid); font-size: 11px;")
        status_layout.addWidget(self._status_label)
        status_layout.addStretch()
        root.addLayout(status_layout)
        self._update_status()

    # ════════════════════════════════════════════════════════════
    # 成员行
    # ════════════════════════════════════════════════════════════

    def _rebuild_member_rows(self, selected_ids: set = None,
                             member_tools: dict[str, list[str]] = None):
        """重建成员列表，每行: [勾选] 图标名称 [编辑提示词] [配置工具]"""
        if selected_ids is None:
            selected_ids = set()
        if member_tools is None:
            member_tools = {}

        # 清空
        while self._member_layout.count():
            item = self._member_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        for agent in self._agent_manager.list_default_agents():
            if agent.id == "boss":
                continue
            row = QHBoxLayout()
            row.setSpacing(6)

            cb = QCheckBox(f"{agent.icon} {agent.name}")
            cb.setToolTip(agent.description)
            cb.setChecked(agent.id in selected_ids)
            cb.agent_id = agent.id
            row.addWidget(cb)

            # 编辑提示词
            prompt_btn = QPushButton("编辑提示词")
            prompt_btn.setFixedWidth(80)
            prompt_btn.setStyleSheet("font-size: 11px; padding: 2px 6px;")
            prompt_btn.clicked.connect(lambda checked, aid=agent.id: self._edit_prompt(aid))
            row.addWidget(prompt_btn)

            # 配置工具
            tool_btn = QPushButton("配置工具")
            tool_btn.setFixedWidth(80)
            tool_btn.setStyleSheet("font-size: 11px; padding: 2px 6px;")
            tool_btn.clicked.connect(lambda checked, aid=agent.id: self._configure_tools(aid))
            row.addWidget(tool_btn)

            # 显示已选工具数
            selected = self._member_tools.get(agent.id)
            if selected is not None:
                count_label = QLabel(f"已选 {len(selected)} 个工具")
                count_label.setStyleSheet(f"color: {theme_color('accent')}; font-size: 10px;")
            elif agent.id in member_tools:
                selected_tools = member_tools[agent.id]
                self._member_tools[agent.id] = list(selected_tools)
                count_label = QLabel(f"已选 {len(selected_tools)} 个工具")
                count_label.setStyleSheet(f"color: {theme_color('accent')}; font-size: 10px;")
            else:
                count_label = QLabel(f"默认 ({len(agent.tools)} 个)")
                count_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 10px;")
            count_label.agent_id = agent.id
            row.addWidget(count_label)

            row.addStretch()
            self._member_layout.addLayout(row)

        self._member_layout.addStretch()

    # ════════════════════════════════════════════════════════════
    # 编辑提示词
    # ════════════════════════════════════════════════════════════

    def _edit_prompt(self, agent_id: str):
        agent = self._agent_manager.get_agent(agent_id)
        if not agent:
            return
        current_prompt = self._custom_prompts.get(agent_id, agent.system_prompt)

        dlg = QDialog(self)
        dlg.setWindowTitle(f"编辑 {agent.icon} {agent.name} 提示词")
        dlg.setMinimumSize(520, 380)
        ly = QVBoxLayout(dlg)
        ly.addWidget(QLabel(f"默认工具: {', '.join(agent.tools)}"))
        ly.addWidget(QLabel("系统提示词（仅保存在当前团队配置中）:"))
        editor = QTextEdit()
        editor.setPlainText(current_prompt)
        editor.setStyleSheet("font-family: Consolas, monospace; font-size: 12px;")
        ly.addWidget(editor, 1)
        br = QHBoxLayout()
        br.addStretch()
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(dlg.reject)
        br.addWidget(cancel_btn)
        ok_btn = QPushButton("保存")
        ok_btn.clicked.connect(dlg.accept)
        br.addWidget(ok_btn)
        ly.addLayout(br)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            t = editor.toPlainText().strip()
            if t:
                self._custom_prompts[agent_id] = t
            elif agent_id in self._custom_prompts:
                del self._custom_prompts[agent_id]

    # ════════════════════════════════════════════════════════════
    # 配置工具
    # ════════════════════════════════════════════════════════════

    def _configure_tools(self, agent_id: str):
        """打开工具配置对话框"""
        agent = self._agent_manager.get_agent(agent_id)
        if not agent:
            return

        # 收集所有可用工具
        all_tools = self._collect_all_tools()

        # 当前已选工具（团队覆盖 or 默认）
        current = self._member_tools.get(agent_id)
        if current is None:
            current = list(agent.tools)

        dlg = QDialog(self)
        dlg.setWindowTitle(f"配置 {agent.icon} {agent.name} 工具")
        dlg.setMinimumSize(480, 500)
        ly = QVBoxLayout(dlg)

        ly.addWidget(QLabel(f"为「{agent.name}」选择在团队中可用的工具："))

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        cl = QVBoxLayout(content)
        cl.setSpacing(2)

        checks: dict[str, QCheckBox] = {}
        for category, tools in all_tools.items():
            if not tools:
                continue
            group = QGroupBox(category)
            gl = QVBoxLayout(group)
            gl.setSpacing(2)
            for name, desc in tools:
                cb = QCheckBox(name)
                if desc:
                    cb.setToolTip(desc)
                cb.setChecked(name in current)
                checks[name] = cb
                gl.addWidget(cb)
            cl.addWidget(group)

        cl.addStretch()
        scroll.setWidget(content)
        ly.addWidget(scroll, 1)

        # 底部按钮
        btn_layout = QHBoxLayout()
        reset_btn = QPushButton("重置为默认")
        reset_btn.clicked.connect(lambda: self._reset_member_tools(agent_id, checks, dlg))
        btn_layout.addWidget(reset_btn)
        btn_layout.addStretch()
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(dlg.reject)
        btn_layout.addWidget(cancel_btn)
        ok_btn = QPushButton("确定")
        ok_btn.clicked.connect(dlg.accept)
        btn_layout.addWidget(ok_btn)
        ly.addLayout(btn_layout)

        if dlg.exec() == QDialog.DialogCode.Accepted:
            selected = [name for name, cb in checks.items() if cb.isChecked()]
            # 判断是否等于默认工具集 — 如果等于则存 None（不覆盖）
            if set(selected) == set(agent.tools):
                self._member_tools.pop(agent_id, None)
            else:
                self._member_tools[agent_id] = selected
            # 刷新标签
            self._refresh_tool_labels()

    def _reset_member_tools(self, agent_id: str, checks: dict[str, QCheckBox], dlg: QDialog):
        """重置为默认工具"""
        agent = self._agent_manager.get_agent(agent_id)
        if not agent:
            return
        for name, cb in checks.items():
            cb.setChecked(name in agent.tools)

    def _collect_all_tools(self) -> dict[str, list[tuple]]:
        """收集所有可用工具，按分类返回 {分类名: [(工具名, 描述), ...]}"""
        result: dict[str, list[tuple]] = {}

        # 1. 系统工具 — 从 DEFAULT_AGENTS 收集
        sys_tools: dict[str, str] = {}
        for agent_def in self._agent_manager.list_default_agents():
            for t in agent_def.tools:
                if t not in sys_tools:
                    sys_tools[t] = f"由 {agent_def.icon}{agent_def.name} 管理"
        # 补充已知系统工具的描述
        desc_map = {
            "system.game_data": "创建/更新/删除/查询游戏数据",
            "system.batch_data": "批量导入/导出/替换数据",
            "system.schema_edit": "管理数据类型和字段结构",
            "system.ceshu": "游戏数值平衡计算和测试",
            "system.export_doc": "导出策划文档",
            "system.game_balance": "数值体系设计和分析",
            "system.web_search": "搜索引擎查询",
            "system.web_fetch": "获取网页内容",
            "system.browser": "浏览器自动化操作",
            "system.image_gen": "根据提示词生成图片",
            "system.image_analyze": "分析已有图片内容",
            "system.code": "读取/写入/编辑代码文件",
            "system.git": "Git 版本控制操作",
            "system.shell": "执行 Shell 命令",
            "system.system": "系统级文件操作",
            "system.ask_user": "向用户提问",
            "system.todo": "待办事项管理",
            "system.ui_control": "界面交互控制",
            "system.ui_preview": "界面预览",
        }
        for t in sys_tools:
            if t in desc_map:
                sys_tools[t] = desc_map[t]
        result["系统工具"] = sorted(
            (name, desc) for name, desc in sys_tools.items()
        )

        # 2. Skills — 从 dispatcher 获取
        skill_list = []
        if self._dispatcher:
            try:
                for s in self._dispatcher.list_skills:
                    if s.get("source") == "skill":
                        skill_list.append((s["name"], s.get("description", "")))
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        if skill_list:
            result["技能 (Skills)"] = sorted(skill_list)

        # 3. MCP 工具 — 从 dispatcher 获取
        mcp_list = []
        if self._dispatcher:
            try:
                for s in self._dispatcher.list_skills:
                    if s.get("source") == "mcp":
                        mcp_list.append((s["name"], s.get("description", "")))
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        if mcp_list:
            result["MCP 工具"] = sorted(mcp_list)

        return result

    def _refresh_tool_labels(self):
        """更新所有成员行的工具计数标签"""
        for i in range(self._member_layout.count()):
            item = self._member_layout.itemAt(i)
            if not item or not item.layout():
                continue
            layout = item.layout()
            for j in range(layout.count()):
                w = layout.itemAt(j).widget()
                if w and isinstance(w, QLabel) and hasattr(w, 'agent_id'):
                    agent_id = w.agent_id
                    selected = self._member_tools.get(agent_id)
                    if selected is not None:
                        w.setText(f"已选 {len(selected)} 个工具")
                        w.setStyleSheet(f"color: {theme_color('accent')}; font-size: 10px;")
                    else:
                        agent = self._agent_manager.get_agent(agent_id)
                        count = len(agent.tools) if agent else 0
                        w.setText(f"默认 ({count} 个)")
                        w.setStyleSheet(f"color: {theme_color('hint')}; font-size: 10px;")

    def _get_checked_member_ids(self) -> list[str]:
        ids = []
        for i in range(self._member_layout.count()):
            item = self._member_layout.itemAt(i)
            if not item or not item.layout():
                continue
            for j in range(item.layout().count()):
                w = item.layout().itemAt(j).widget()
                if w and isinstance(w, QCheckBox) and w.isChecked():
                    ids.append(w.agent_id)
        return ids

    # ════════════════════════════════════════════════════════════
    # 智能体定义管理弹窗
    # ════════════════════════════════════════════════════════════

    def _open_agent_manager(self):
        """打开智能体定义管理对话框（创建/编辑/删除自定义智能体）"""
        dlg = QDialog(self)
        dlg.setWindowTitle("管理智能体定义")
        dlg.setMinimumSize(700, 500)
        ly = QHBoxLayout(dlg)

        # 左侧列表
        left = QVBoxLayout()
        left.addWidget(QLabel("所有智能体"))
        agent_list = QListWidget()
        agent_list.setMinimumWidth(150)
        left.addWidget(agent_list)

        abr = QHBoxLayout()
        new_btn = QPushButton("+ 新建")
        del_btn = QPushButton("删除")
        abr.addWidget(new_btn)
        abr.addWidget(del_btn)
        left.addLayout(abr)
        ly.addLayout(left, 1)

        # 右侧编辑区
        right = QVBoxLayout()
        info_group = QGroupBox("基本信息")
        info_form = QVBoxLayout(info_group)

        id_row = QHBoxLayout()
        id_row.addWidget(QLabel("ID:"))
        id_input = QLineEdit()
        id_input.setReadOnly(True)
        id_row.addWidget(id_input)
        info_form.addLayout(id_row)

        name_row = QHBoxLayout()
        name_row.addWidget(QLabel("名称:"))
        name_input = QLineEdit()
        name_row.addWidget(name_input)
        name_row.addWidget(QLabel("图标:"))
        icon_input = QLineEdit()
        icon_input.setPlaceholderText("🤖")
        icon_input.setMaximumWidth(50)
        name_row.addWidget(icon_input)
        info_form.addLayout(name_row)

        desc_row = QHBoxLayout()
        desc_row.addWidget(QLabel("描述:"))
        desc_input = QLineEdit()
        desc_row.addWidget(desc_input)
        info_form.addLayout(desc_row)

        info_form.addWidget(QLabel("系统提示词:"))
        prompt_input = QTextEdit()
        prompt_input.setStyleSheet("font-family: Consolas, monospace; font-size: 12px;")
        prompt_input.setMinimumHeight(100)
        info_form.addWidget(prompt_input)
        right.addWidget(info_group)

        # 工具选择
        tools_group = QGroupBox("可用工具")
        tl = QVBoxLayout(tools_group)
        tool_count_label = QLabel("已选 0 个工具")
        tl.addWidget(tool_count_label)
        tool_scroll = QScrollArea()
        tool_scroll.setWidgetResizable(True)
        tc = QWidget()
        tcl = QVBoxLayout(tc)
        tcl.setSpacing(2)
        all_tools = self._collect_all_tools()
        tool_checks: dict[str, QCheckBox] = {}
        for cat, tools in all_tools.items():
            for name, desc in tools:
                cb = QCheckBox(name)
                if desc:
                    cb.setToolTip(desc)
                def _on_toggle(checked, cb=cb, label=tool_count_label, checks=tool_checks):
                    count = sum(1 for c in checks.values() if c.isChecked())
                    label.setText(f"已选 {count} 个工具")
                cb.toggled.connect(_on_toggle)
                tool_checks[name] = cb
                tcl.addWidget(cb)
        tcl.addStretch()
        tool_scroll.setWidget(tc)
        tl.addWidget(tool_scroll)
        right.addWidget(tools_group, 1)

        save_btn = QPushButton("保存智能体")
        right.addWidget(save_btn)

        ly.addLayout(right, 2)

        # 辅助: 加载列表
        editing_agent_id: list[Optional[str]] = [None]

        def load_list():
            agent_list.blockSignals(True)
            agent_list.clear()
            for agent in self._agent_manager.list_agents():
                item = QListWidgetItem(f"{agent.icon}  {agent.name}")
                item.setData(Qt.ItemDataRole.UserRole, agent.id)
                item.setToolTip(f"{agent.description}")
                agent_list.addItem(item)
            agent_list.blockSignals(False)
            if agent_list.count() > 0:
                agent_list.setCurrentRow(0)

        def set_enabled(enabled: bool):
            for w in [name_input, icon_input, desc_input, prompt_input, save_btn]:
                w.setEnabled(enabled)
            for cb in tool_checks.values():
                cb.setEnabled(enabled)

        def on_select(row):
            if row < 0:
                set_enabled(False)
                return
            item = agent_list.item(row)
            if not item:
                return
            aid = item.data(Qt.ItemDataRole.UserRole)
            agent = self._agent_manager.get_agent(aid)
            if not agent:
                return
            editing_agent_id[0] = agent.id
            id_input.setText(agent.id)
            name_input.setText(agent.name)
            icon_input.setText(agent.icon)
            desc_input.setText(agent.description)
            prompt_input.setPlainText(agent.system_prompt)
            for n, cb in tool_checks.items():
                cb.setChecked(n in agent.tools)
            count = sum(1 for c in tool_checks.values() if c.isChecked())
            tool_count_label.setText(f"已选 {count} 个工具")
            set_enabled(True)

        agent_list.currentRowChanged.connect(on_select)

        def add_new():
            count = len(self._agent_manager.list_agents())
            aid = f"custom_{count + 1}"
            agent = AgentDefinition(
                id=aid, name="新智能体", icon="🤖",
                description="自定义智能体",
                system_prompt="你是自定义智能体，根据你的工具列表完成任务。",
                tools=[],
            )
            self._agent_manager.register_agent(agent)
            load_list()
            for i in range(agent_list.count()):
                if agent_list.item(i).data(Qt.ItemDataRole.UserRole) == aid:
                    agent_list.setCurrentRow(i)
                    break

        new_btn.clicked.connect(add_new)

        def delete_agent():
            if not editing_agent_id[0]:
                return
            if not editing_agent_id[0].startswith("custom_"):
                QMessageBox.warning(dlg, "提示", "不能删除默认智能体")
                return
            agent = self._agent_manager.get_agent(editing_agent_id[0])
            r = QMessageBox.question(dlg, "确认删除",
                                     f"删除智能体「{agent.name}」？")
            if r == QMessageBox.StandardButton.Yes:
                self._agent_manager.unregister_agent(editing_agent_id[0])
                editing_agent_id[0] = None
                load_list()

        del_btn.clicked.connect(delete_agent)

        def save_agent():
            if not editing_agent_id[0]:
                return
            name = name_input.text().strip()
            if not name:
                QMessageBox.warning(dlg, "提示", "名称不能为空")
                return
            icon = icon_input.text().strip() or "🤖"
            desc = desc_input.text().strip()
            prompt = prompt_input.toPlainText().strip()
            tools = [n for n, cb in tool_checks.items() if cb.isChecked()]
            updated = AgentDefinition(
                id=editing_agent_id[0], name=name, description=desc,
                icon=icon, system_prompt=prompt, tools=tools,
            )
            self._agent_manager.register_agent(updated)
            load_list()
            QMessageBox.information(dlg, "成功", f"智能体「{name}」已保存")

        save_btn.clicked.connect(save_agent)

        load_list()
        dlg.exec()

        # 关闭后刷新主界面成员行（因为可能新建了自定义智能体）
        if self._editing_team_id:
            team = self._agent_manager.get_team(self._editing_team_id)
            if team:
                member_ids = {m.id for m in team.members}
                self._rebuild_member_rows(
                    member_ids,
                    member_tools=self._member_tools,
                )

    # ════════════════════════════════════════════════════════════
    # 团队数据操作
    # ════════════════════════════════════════════════════════════

    def _load_teams(self):
        self._team_list.blockSignals(True)
        self._team_list.clear()
        for team in self._agent_manager.list_teams():
            item = QListWidgetItem(f"👥 {team.name}")
            item.setData(Qt.ItemDataRole.UserRole, team.id)
            self._team_list.addItem(item)
        self._team_list.blockSignals(False)

    def _on_team_selected(self, row: int):
        if row < 0:
            self._clear_form()
            self._del_team_btn.setEnabled(False)
            self._use_team_btn.setEnabled(False)
            return
        item = self._team_list.item(row)
        team_id = item.data(Qt.ItemDataRole.UserRole)
        team = self._agent_manager.get_team(team_id)
        if not team:
            return
        self._editing_team_id = team.id
        self._team_name_input.setText(team.name)
        self._team_desc_input.setPlainText(team.description)
        member_ids = {m.id for m in team.members}
        self._custom_prompts = dict(team.custom_prompts)
        self._member_tools = {}
        # 恢复 member_tools（None=不覆盖，跟 AgentDefinition 默认一致）
        for mid, tools in team.member_tools.items():
            self._member_tools[mid] = list(tools)
        self._rebuild_member_rows(member_ids, member_tools=team.member_tools)
        self._del_team_btn.setEnabled(True)
        self._use_team_btn.setEnabled(True)
        self._update_status()

    def _clear_form(self):
        self._editing_team_id = None
        self._team_name_input.clear()
        self._team_desc_input.clear()
        self._rebuild_member_rows()
        self._custom_prompts.clear()
        self._member_tools.clear()
        self._update_status()

    def _new_team(self):
        self._editing_team_id = None
        self._team_name_input.clear()
        self._team_desc_input.clear()
        self._team_name_input.setFocus()
        self._rebuild_member_rows({"data_operator", "planner", "analyst"})
        self._del_team_btn.setEnabled(False)
        self._use_team_btn.setEnabled(False)
        self._custom_prompts.clear()
        self._member_tools.clear()
        self._update_status()

    def _delete_team(self):
        if not self._editing_team_id:
            return
        team = self._agent_manager.get_team(self._editing_team_id)
        if not team:
            return
        r = QMessageBox.question(self, "确认删除", f"删除团队「{team.name}」？")
        if r == QMessageBox.StandardButton.Yes:
            self._agent_manager.delete_team(self._editing_team_id)
            self._load_teams()
            self._clear_form()

    def _save_team(self):
        name = self._team_name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "提示", "请输入团队名称")
            return
        member_ids = self._get_checked_member_ids()
        if not member_ids:
            QMessageBox.warning(self, "提示", "请至少选择一个成员")
            return
        members = []
        for mid in member_ids:
            a = self._agent_manager.get_agent(mid)
            if a:
                members.append(a)
        cp = dict(self._custom_prompts)
        # 保存 member_tools: 只存有覆盖的（None 的不存）
        mt = {}
        for mid, tools in self._member_tools.items():
            if tools is not None:
                mt[mid] = list(tools)

        if self._editing_team_id:
            team = Team(id=self._editing_team_id, name=name,
                        description=self._team_desc_input.toPlainText().strip(),
                        members=members, custom_prompts=cp, member_tools=mt)
            self._agent_manager.update_team(team)
        else:
            team_id = f"team_{uuid.uuid4().hex[:8]}"
            team = Team(id=team_id, name=name,
                        description=self._team_desc_input.toPlainText().strip(),
                        members=members, custom_prompts=cp, member_tools=mt)
            self._agent_manager.create_team(team)
        self._load_teams()
        self._select_team(team.id)
        QMessageBox.information(self, "成功", f"团队「{name}」已保存")

    def _use_team(self):
        if not self._editing_team_id:
            return
        self._save_team_no_msg()
        self._agent_manager.set_current_team(self._editing_team_id)
        self.accept()

    def _switch_to_solo(self):
        self._agent_manager.set_current_team(None)
        self.accept()

    def _save_team_no_msg(self):
        name = self._team_name_input.text().strip()
        if not name:
            return
        member_ids = self._get_checked_member_ids()
        members = []
        for mid in member_ids:
            a = self._agent_manager.get_agent(mid)
            if a:
                members.append(a)
        cp = dict(self._custom_prompts)
        mt = {}
        for mid, tools in self._member_tools.items():
            if tools is not None:
                mt[mid] = list(tools)
        if self._editing_team_id:
            team = Team(id=self._editing_team_id, name=name,
                        description=self._team_desc_input.toPlainText().strip(),
                        members=members, custom_prompts=cp, member_tools=mt)
            self._agent_manager.update_team(team)
            self._load_teams()

    def _select_team(self, team_id: str):
        for i in range(self._team_list.count()):
            item = self._team_list.item(i)
            if item.data(Qt.ItemDataRole.UserRole) == team_id:
                self._team_list.setCurrentRow(i)
                break

    def _update_status(self):
        if self._agent_manager.is_team_mode():
            team = self._agent_manager.get_current_team()
            name = team.name if team else "?"
            self._status_label.setText(f"当前: 🤝 团队模式 — {name}")
        else:
            self._status_label.setText("当前: 👤 个人模式")
