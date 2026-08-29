"""对话框类 — 数字员工模块的对话框组件"""

from __future__ import annotations

from pathlib import Path

from PyQt6.QtCore import QSize, Qt
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
)

from common.lucide_icon import get_icon

_SKILL_TO_ACTION = {}


def _get_skills_dirs() -> list[Path]:
    """返回所有 skill 目录（core/skills/ 内部工具优先，备选应用级 skills/）"""
    dirs = []
    # 1. 内部核心工具 core/skills/
    app_root = Path(__file__).resolve().parent.parent
    core_skills = app_root / "core" / "skills"
    if core_skills.is_dir():
        dirs.append(core_skills)
    # 2. 应用级 skills/（根目录）
    app_skills = app_root / "skills"
    if app_skills.is_dir():
        dirs.append(app_skills)
    # 3. fallback：模块同目录 skills/
    fallback = Path(__file__).resolve().parent / "skills"
    if fallback.is_dir():
        dirs.append(fallback)
    return dirs


def _parse_frontmatter(text: str) -> dict:
    """简单解析 YAML frontmatter（--- 之间）"""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    end = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end < 0:
        return {}
    meta = {}
    for line in lines[1:end]:
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        k = key.strip()
        v = val.strip().strip('"').strip("'")
        meta[k] = v
    return meta


def load_skill_groups() -> list[tuple[str, list[tuple[str, str, str, str]]]]:
    """加载所有 SKILL.md，支持三种格式：
    1. 合并格式（H3 任务）：## 分组 → ### 任务
    2. 单分组多任务（H2 任务）：frontmatter group → ## 任务
    3. 独立格式：frontmatter 单任务
    """
    groups_map = {}

    def _add_task(group_name, label, action, desc, example):
        if group_name not in groups_map:
            groups_map[group_name] = []
        groups_map[group_name].append((label, action, desc, example))

    def _parse_task_lines(lines, group_name, task_prefix):
        """解析 body 中 ##（H2）或 ###（H3）下的任务"""
        current_task = {}
        for line in lines:
            s = line.strip()
            if not s:
                continue
            if s.startswith(task_prefix):
                level = len(task_prefix)
                if level == 2 and s.startswith("### "):
                    # 解释器略过，此分支给 H2
                    pass
                # 收尾上一个 task
                if current_task.get("label"):
                    _add_task(group_name, current_task["label"],
                             current_task.get("action", ""),
                             current_task.get("desc", ""),
                             current_task.get("example", ""))
                current_task = {"label": s[level:].strip()}
            elif s.startswith("- **") and "**: " in s:
                inner = s[4:]
                key, _, val = inner.partition("**: ")
                k = key.strip().lower()
                if k in ("action", "desc", "example"):
                    current_task[k] = val.strip()
        if current_task.get("label"):
            _add_task(group_name, current_task["label"],
                     current_task.get("action", ""),
                     current_task.get("desc", ""),
                     current_task.get("example", ""))

    for skills_dir in _get_skills_dirs():
        for child in sorted(skills_dir.iterdir()):
            if not child.is_dir():
                continue
            skill_file = child / "SKILL.md"
            if not skill_file.exists():
                continue
            try:
                text = skill_file.read_text(encoding="utf-8")
            except Exception:
                continue

            meta = _parse_frontmatter(text)
            body = _strip_frontmatter(text)
            lines = body.splitlines()

            has_h3 = any(line.strip().startswith("### ") for line in lines)
            has_h2 = any(line.strip().startswith("## ") for line in lines)

            if has_h3:
                # 合并格式：## 分组 → ### 任务
                current_group = meta.get("group", "工具合集")
                current_task = {}
                for line in lines:
                    s = line.strip()
                    if not s:
                        continue
                    if s.startswith("## ") and not s.startswith("### "):
                        if current_task.get("label"):
                            _add_task(current_group, current_task["label"],
                                     current_task.get("action", ""),
                                     current_task.get("desc", ""),
                                     current_task.get("example", ""))
                            current_task = {}
                        current_group = s[3:].strip()
                    elif s.startswith("### "):
                        if current_task.get("label"):
                            _add_task(current_group, current_task["label"],
                                     current_task.get("action", ""),
                                     current_task.get("desc", ""),
                                     current_task.get("example", ""))
                        current_task = {"label": s[4:].strip()}
                    elif s.startswith("- **") and "**: " in s:
                        inner = s[4:]
                        key, _, val = inner.partition("**: ")
                        k = key.strip().lower()
                        if k in ("action", "desc", "example"):
                            current_task[k] = val.strip()
                if current_task.get("label"):
                    _add_task(current_group, current_task["label"],
                             current_task.get("action", ""),
                             current_task.get("desc", ""),
                             current_task.get("example", ""))
            elif has_h2:
                # 单分组多任务格式：frontmatter group → ## 任务
                group_name = meta.get("group", child.name)
                _parse_task_lines(lines, group_name, "## ")
            else:
                # 独立格式：单 skill，用 frontmatter
                label = meta.get("name", child.name)
                action = meta.get("action", child.name)
                desc = meta.get("description", "")
                example = meta.get("example", "")
                group_name = meta.get("group", "下载的工具")
                _add_task(group_name, label, action, desc, example)

    return list(groups_map.items())


def _strip_frontmatter(text: str) -> str:
    """去掉 YAML frontmatter，返回 body 内容"""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return text
    end = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end < 0:
        return text
    return "\n".join(lines[end + 1:])


class TaskSelectorDialog(QDialog):
    """任务选择器 — CodeBuddy 风格"""

    selected_action = None
    selected_params = None

    CATEGORY_ICONS = {
        "数据操作": "▸", "文件操作": "▸", "网络操作": "▸",
        "系统操作": "▸", "代码操作": "▸", "其他": "▸",
    }

    def __init__(self, brain=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("选择任务")
        self.setFixedSize(520, 460)
        self.setModal(True)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Dialog)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self._all_items = []
        self._build_data()
        self._setup_ui()
        self._populate_list("")

    def _build_data(self):
        for group_name, items in load_skill_groups():
            for label, action, desc, example in items:
                self._all_items.append((group_name, label, action, desc, example))
                _SKILL_TO_ACTION[action] = (label, desc, example)

    def _setup_ui(self):
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            c = get_theme_colors()
            _dark = is_dark_theme()
            _bg = c['bg']
            _fg = c['fg']
            _border = c['border']
            _input_bg = c['input_bg']
            _accent = c['accent']
            _hint = c['hint']
            _hover = c.get('menu_bg', _input_bg)
            _danger = c.get('danger', _accent)
            self._hint_color = _hint
        except Exception:
            _dark = True
            _bg, _fg, _border, _input_bg, _accent, _hint, _hover = '#1e1e2e', '#cdd6f4', '#313244', '#313244', '#89b4fa', '#6c7086', '#45475a'
            _danger = '#f38ba8'
            self._hint_color = _hint

        self.setStyleSheet(f"""
            QDialog {{ background: transparent; }}
            #tsContainer {{
                background: {_bg}; border: 1px solid {_border};
                border-radius: 12px;
            }}
            #tsTitle {{ color: {_fg}; font-size: 16px; font-weight: bold; }}
            #tsCloseBtn {{ background: transparent; color: {_hint}; border: none;
                          font-size: 16px; }}
            #tsCloseBtn:hover {{ color: {_danger}; }}
            #tsSearch {{
                background: {_input_bg}; color: {_fg}; border: 1px solid {_border};
                border-radius: 8px; padding: 8px 12px; font-size: 14px;
            }}
            #tsSearch:focus {{ border: 1px solid {_accent}; }}
            #tsList {{
                background: {_bg}; color: {_fg}; border: none;
                border-radius: 8px; font-size: 14px; outline: none;
            }}
            #tsList::item {{ padding: 8px 12px; border-radius: 4px; }}
            #tsList::item:selected {{ background: {_hover}; }}
            #tsList::item:hover {{ background: {_input_bg}; }}
            #tsHint {{ color: {_hint}; font-size: 14px; }}
            #tsRunBtn {{
                background: {_accent}; color: {_bg}; border: none;
                border-radius: 8px; padding: 8px 20px; font-size: 14px; font-weight: bold;
            }}
            #tsRunBtn:hover {{ background: {_accent}cc; }}
            #tsCancelBtn {{
                background: {_input_bg}; color: {_fg}; border: none;
                border-radius: 8px; padding: 8px 16px; font-size: 14px;
            }}
            #tsCancelBtn:hover {{ background: {_hover}; }}
        """)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        container = QFrame()
        container.setObjectName("tsContainer")
        layout = QVBoxLayout(container)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(8)

        # 标题行
        hdr = QHBoxLayout()
        title = QLabel("选择任务")
        title.setObjectName("tsTitle")
        hdr.addWidget(title)
        hdr.addStretch()
        close_btn = QPushButton()
        try:
            from ui.themes import get_theme_colors
            _icon_hint = get_theme_colors()['hint']
        except Exception:
            _icon_hint = '#888'
        close_btn.setIcon(get_icon("x", _icon_hint, 16))
        close_btn.setIconSize(QSize(16, 16))
        close_btn.setFixedSize(28, 28)
        close_btn.setFlat(True)
        close_btn.setObjectName("tsCloseBtn")
        close_btn.setFixedSize(28, 28)
        close_btn.clicked.connect(self.reject)
        hdr.addWidget(close_btn)
        layout.addLayout(hdr)

        # 搜索
        self._search = QLineEdit()
        self._search.setObjectName("tsSearch")
        self._search.setPlaceholderText("搜索任务... 或按 ↑↓ 选择 回车确认 Esc取消")
        self._search.textChanged.connect(self._on_filter)
        layout.addWidget(self._search)

        # 列表
        self._list = QListWidget()
        self._list.setObjectName("tsList")
        self._list.itemClicked.connect(self._on_select)
        self._list.itemDoubleClicked.connect(self._on_confirm)
        self._list.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        layout.addWidget(self._list, stretch=1)

        # 描述区
        self._desc_label = QLabel("")
        self._desc_label.setObjectName("tsHint")
        self._desc_label.setWordWrap(True)
        self._desc_label.setMinimumHeight(36)
        layout.addWidget(self._desc_label)

        # 按钮
        btns = QHBoxLayout()
        btns.addStretch()
        cancel_btn = QPushButton("取消")
        cancel_btn.setObjectName("tsCancelBtn")
        cancel_btn.clicked.connect(self.reject)
        btns.addWidget(cancel_btn)
        run_btn = QPushButton("执行")
        run_btn.setObjectName("tsRunBtn")
        run_btn.clicked.connect(self._on_run)
        btns.addWidget(run_btn)
        layout.addLayout(btns)

        outer.addWidget(container)

    def _populate_list(self, filter_text: str):
        self._list.clear()
        flt = filter_text.lower().strip()
        seen_groups = set()
        for group_name, label, action, desc, example in self._all_items:
            if flt and flt not in label.lower() and flt not in desc.lower() and flt not in action.lower() and flt not in group_name.lower():
                continue
            if group_name not in seen_groups:
                seen_groups.add(group_name)
                icon = self.CATEGORY_ICONS.get(group_name, "▸")
                group_item = QListWidgetItem(f"  {icon}  {group_name[2:]}")
                group_item.setFlags(Qt.ItemFlag.NoItemFlags)
                f = group_item.font()
                f.setBold(True)
                f.setPointSize(10)
                group_item.setFont(f)
                group_item.setForeground(QColor(getattr(self, "_hint_color", "#888888")))
                self._list.addItem(group_item)
            item = QListWidgetItem(f"    {label}")
            item.setData(Qt.ItemDataRole.UserRole, action)
            item.setToolTip(f"{desc}\n示例: {example}")
            self._list.addItem(item)
        if self._list.count() > 0:
            self._list.setCurrentRow(1 if self._list.item(0).data(Qt.ItemDataRole.UserRole) == "__group__" else 0)

    def _on_filter(self, text):
        self._populate_list(text)

    def _on_select(self, item):
        action = item.data(Qt.ItemDataRole.UserRole)
        if action == "__group__": return
        info = _SKILL_TO_ACTION.get(action)
        if info:
            self._desc_label.setText(f"{info[1]}\n示例: {info[2]}")

    def _on_confirm(self, item):
        action = item.data(Qt.ItemDataRole.UserRole)
        if action == "__group__": return
        self.selected_action = action
        self.accept()

    def _on_run(self):
        item = self._list.currentItem()
        if item:
            self._on_confirm(item)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.reject()
        elif event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self._on_run()
        else:
            super().keyPressEvent(event)

    @classmethod
    def pick_task(cls, brain=None, parent=None) -> tuple:
        dlg = cls(brain, parent)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            action = dlg.selected_action
            for group_name, label, a, desc, example in dlg._all_items:
                if a == action:
                    return action, example
        return None, None
