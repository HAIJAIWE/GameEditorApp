"""N1: 版本对比工具 — Diff 两个策划书版本，高亮变更字段

特性:
- 选择同版本链下的两个版本进行对比
- 章节级 Diff：新增/删除/修改/未变
- 字段级高亮：红/绿/黄三色标注变更
- 统计变更字段数 + 总变更率
- 支持导出 Diff 报告为 Markdown
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
import json
from typing import TYPE_CHECKING, Any

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QSplitter,
    QTextEdit,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# === Diff 类型枚举 ===

class DiffType(StrEnum):
    """字段变更类型枚举。

    继承自 str，因此 ``DiffType.ADDED == "added"`` 仍然成立，
    保证与历史字符串比较代码的向后兼容。
    """
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"
    UNCHANGED = "unchanged"


# 类型 → (展示文案, 颜色) 的统一映射，供树/Markdown/详情共用
DIFF_DISPLAY: dict[DiffType, tuple[str, str]] = {
    DiffType.ADDED: ("✚ 新增", "#22C55E"),
    DiffType.REMOVED: ("✖ 删除", "#EF4444"),
    DiffType.MODIFIED: ("✎ 修改", "#F59E0B"),
    DiffType.UNCHANGED: ("未变", "#888888"),
}


# === Diff 数据结构 ===

@dataclass
class FieldDiff:
    """字段级 Diff"""
    field_path: str          # 字段路径（如 "meta.game_name"）
    field_label: str         # 字段显示名
    old_value: Any
    new_value: Any
    diff_type: DiffType      # 变更类型（继承自 str，向后兼容字符串比较）


@dataclass
class ChapterDiff:
    """章节级 Diff"""
    chapter_key: str
    chapter_label: str
    field_diffs: list[FieldDiff] = field(default_factory=list)
    added_count: int = 0
    removed_count: int = 0
    modified_count: int = 0
    unchanged_count: int = 0

    @property
    def total_changes(self) -> int:
        return self.added_count + self.removed_count + self.modified_count

    @property
    def has_changes(self) -> bool:
        return self.total_changes > 0


@dataclass
class VersionDiff:
    """版本 Diff 报告"""
    old_version_label: str
    new_version_label: str
    old_ceshu_id: str
    new_ceshu_id: str
    chapter_diffs: list[ChapterDiff]
    total_added: int = 0
    total_removed: int = 0
    total_modified: int = 0
    total_unchanged: int = 0

    @property
    def total_changes(self) -> int:
        return self.total_added + self.total_removed + self.total_modified


@dataclass
class FieldRender:
    """单字段的渲染中间数据（由 _iter_changed_renders 产出）。

    old_text/new_text 已经过 _format_value 格式化并按调用方传入的
    max_len 截断；调用方如需进一步转义（如 Markdown 管道符）在此基础上做。
    """
    field_label: str
    old_text: str
    new_text: str
    diff_type: DiffType


# === Diff 计算 ===

def _normalize_value(v: Any) -> str:
    """归一化字段值为字符串（便于比较）"""
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        try:
            return json.dumps(v, ensure_ascii=False, sort_keys=True)
        except Exception:
            return str(v)
    return str(v)


def _flatten_chapter(chapter_data: dict, prefix: str = "") -> dict:
    """把章节字段扁平化为 {field_path: value}"""
    result = {}
    if not isinstance(chapter_data, dict):
        return result
    for k, v in chapter_data.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict) and not _is_leaf_value(v):
            result.update(_flatten_chapter(v, path))
        else:
            result[path] = v
    return result


def _is_leaf_value(d) -> bool:
    """判断字典是否应作为叶节点整体比较（不再继续展开）。

    语义说明：
    - dict 仅当其所有 value 都不是 dict/list 时视为叶节点（即「简单字典」），
      例如 ``{"enabled": True, "name": "battle"}``。
    - list 一律视为叶节点整体比较（在 _flatten_chapter 中由调用处的
      ``isinstance(v, dict)`` 短路，不会进入本函数），从而保留列表顺序
      与重复元素作为整体语义，避免逐元素 diff 引入噪声。
    - 非 dict/list 的标量本身即叶节点，不会进入本函数。
    """
    if not isinstance(d, dict):
        return False
    for v in d.values():
        if isinstance(v, (dict, list)):
            return False
    return True


def _classify_field_diff(old_keys: set, new_keys: set, key: str,
                         old_v: Any, new_v: Any) -> DiffType:
    """统一的 diff 类型分类器。

    判定规则（兼容历史 _diff_chapter_flat 的「空值=新增/删除」语义与
    _diff_systems 的「key 缺失=新增/删除」语义）：

    1. 归一化后两值相等 → UNCHANGED（含双方都为空 / 都缺失的情况）。
    2. key 不在 old_keys 或 旧值归一化为空 → ADDED。
    3. key 不在 new_keys 或 新值归一化为空 → REMOVED。
    4. 否则 → MODIFIED。

    注意：_diff_systems 调用时需对缺失 key 传入 ``None`` 而非默认 False，
    以便分类器能区分「key 缺失」与「key 存在但值为 False」。
    """
    old_str = _normalize_value(old_v)
    new_str = _normalize_value(new_v)
    if old_str == new_str:
        return DiffType.UNCHANGED
    if key not in old_keys or old_str == "":
        return DiffType.ADDED
    if key not in new_keys or new_str == "":
        return DiffType.REMOVED
    return DiffType.MODIFIED


def compute_version_diff(old_model: CeshuModel, new_model: CeshuModel) -> VersionDiff:
    """N1: 计算两个 CeshuModel 版本之间的 Diff

    Args:
        old_model: 旧版本 CeshuModel
        new_model: 新版本 CeshuModel

    Returns:
        VersionDiff 报告
    """
    chapter_diffs: list[ChapterDiff] = []
    total_added = total_removed = total_modified = total_unchanged = 0

    for key in CHAPTER_KEYS:
        label = CHAPTER_LABELS.get(key, key)
        old_data = old_model.get_chapter(key) if hasattr(old_model, 'get_chapter') else {}
        new_data = new_model.get_chapter(key) if hasattr(new_model, 'get_chapter') else {}

        # 快速短路：同一对象引用或相等时直接构造空 diff（避免大章节全量扁平化）
        if old_data is new_data or old_data == new_data:
            ch_diff = ChapterDiff(chapter_key=key, chapter_label=label)
            # 统计未变字段数（用扁平化后的 key 数作为近似）
            try:
                flat = _flatten_chapter(old_data or {})
                ch_diff.unchanged_count = len(flat)
            except Exception:
                ch_diff.unchanged_count = 0
            chapter_diffs.append(ch_diff)
            total_unchanged += ch_diff.unchanged_count
            continue

        # systems 章节按 sys_id 比较
        if key == "systems":
            ch_diff = _diff_systems(key, label, old_data, new_data)
        else:
            ch_diff = _diff_chapter_flat(key, label, old_data, new_data)

        chapter_diffs.append(ch_diff)
        total_added += ch_diff.added_count
        total_removed += ch_diff.removed_count
        total_modified += ch_diff.modified_count
        total_unchanged += ch_diff.unchanged_count

    return VersionDiff(
        old_version_label=getattr(old_model, 'version_label', '旧版本'),
        new_version_label=getattr(new_model, 'version_label', '新版本'),
        old_ceshu_id=getattr(old_model, 'ceshu_id', ''),
        new_ceshu_id=getattr(new_model, 'ceshu_id', ''),
        chapter_diffs=chapter_diffs,
        total_added=total_added,
        total_removed=total_removed,
        total_modified=total_modified,
        total_unchanged=total_unchanged,
    )


def _diff_chapter_flat(chapter_key: str, label: str,
                       old_data: dict, new_data: dict) -> ChapterDiff:
    """普通章节 Diff（扁平化字段比较）"""
    old_flat = _flatten_chapter(old_data or {})
    new_flat = _flatten_chapter(new_data or {})
    old_keys = set(old_flat.keys())
    new_keys = set(new_flat.keys())
    all_keys = old_keys | new_keys

    ch_diff = ChapterDiff(chapter_key=chapter_key, chapter_label=label)
    for k in sorted(all_keys):
        old_v = old_flat.get(k)
        new_v = new_flat.get(k)
        diff_type = _classify_field_diff(old_keys, new_keys, k, old_v, new_v)

        if diff_type is DiffType.ADDED:
            ch_diff.added_count += 1
        elif diff_type is DiffType.REMOVED:
            ch_diff.removed_count += 1
        elif diff_type is DiffType.MODIFIED:
            ch_diff.modified_count += 1
        else:
            ch_diff.unchanged_count += 1

        ch_diff.field_diffs.append(FieldDiff(
            field_path=f"{chapter_key}.{k}",
            field_label=k,
            old_value=old_v,
            new_value=new_v,
            diff_type=diff_type,
        ))
    return ch_diff


def _diff_systems(chapter_key: str, label: str,
                  old_data: dict, new_data: dict) -> ChapterDiff:
    """systems 章节 Diff（按 sys_id 比较 enabled 状态）"""
    ch_diff = ChapterDiff(chapter_key=chapter_key, chapter_label=label)
    old_sys = old_data or {}
    new_sys = new_data or {}
    old_keys = set(old_sys.keys())
    new_keys = set(new_sys.keys())
    all_keys = old_keys | new_keys

    for sys_id in sorted(all_keys):
        old_cfg = old_sys.get(sys_id, {})
        new_cfg = new_sys.get(sys_id, {})
        old_enabled = old_cfg.get("enabled", False) if isinstance(old_cfg, dict) else False
        new_enabled = new_cfg.get("enabled", False) if isinstance(new_cfg, dict) else False
        # 对缺失 key 传 None，让分类器区分「key 缺失」与「key 存在但 enabled=False」
        old_v = old_enabled if sys_id in old_sys else None
        new_v = new_enabled if sys_id in new_sys else None

        diff_type = _classify_field_diff(old_keys, new_keys, sys_id, old_v, new_v)

        if diff_type is DiffType.ADDED:
            ch_diff.added_count += 1
        elif diff_type is DiffType.REMOVED:
            ch_diff.removed_count += 1
        elif diff_type is DiffType.MODIFIED:
            ch_diff.modified_count += 1
        else:
            ch_diff.unchanged_count += 1

        ch_diff.field_diffs.append(FieldDiff(
            field_path=f"systems.{sys_id}.enabled",
            field_label=f"{sys_id} (enabled)",
            old_value=old_enabled,
            new_value=new_enabled,
            diff_type=diff_type,
        ))
    return ch_diff


# === Diff 对话框 ===

class VersionDiffDialog(QDialog):
    """N1: 版本对比对话框

    信号:
        version_selected(str, str): (old_ceshu_id, new_ceshu_id) — 用户选择版本后发出
    """

    version_selected = pyqtSignal(str, str)

    # 颜色
    COLOR_ADDED = "#22C55E"
    COLOR_REMOVED = "#EF4444"
    COLOR_MODIFIED = "#F59E0B"
    COLOR_UNCHANGED = "#888888"

    def __init__(self, ceshu_manager, library: str, current_ceshu_id: str = "",
                 parent=None):
        super().__init__(parent)
        self._manager = ceshu_manager
        self._library = library
        self._current_ceshu_id = current_ceshu_id
        self._versions: list = []
        self._diff: VersionDiff | None = None
        self._setup_ui()
        self._load_versions()

    def _setup_ui(self) -> None:
        """构建对话框的全部控件。

        仅做编排：依次调用各 _build_* 子方法把头部、版本选择器、
        统计标签、主分栏、底部按钮组装到主布局，最后应用主题。
        """
        self.setWindowTitle("N1 版本对比工具 — Diff 两个版本")
        self.resize(1000, 700)
        self.setMinimumSize(800, 550)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        layout.addWidget(self._build_header())
        layout.addLayout(self._build_version_selector())
        layout.addWidget(self._build_stats_label())
        layout.addWidget(self._build_main_splitter(), 1)
        layout.addLayout(self._build_bottom_buttons())

        self._apply_theme()

        # 可访问性：对话框整体描述
        self.setAccessibleName("版本对比工具对话框")
        self.setAccessibleDescription(
            "选择同版本链下的两个策划书版本进行 Diff 对比，红/绿/黄标注删除/新增/修改字段"
        )

    def _build_header(self) -> QWidget:
        """构建顶部标题 + 提示文案。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        title = QLabel("🔍 版本对比工具")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; background: transparent;")
        v.addWidget(title)

        hint = QLabel("选择同版本链下的两个版本进行对比，红/绿/黄标注删除/新增/修改字段。")
        hint.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        v.addWidget(hint)
        return container

    def _build_version_selector(self) -> QHBoxLayout:
        """构建「旧版本/新版本/开始对比」选择行。"""
        sel_row = QHBoxLayout()
        sel_row.setSpacing(8)

        sel_row.addWidget(QLabel("旧版本:"))
        self._combo_old = QComboBox()
        self._combo_old.currentIndexChanged.connect(self._on_selection_changed)
        self._combo_old.setAccessibleName("旧版本选择下拉框")
        self._combo_old.setAccessibleDescription("选择要对比的旧版本策划书")
        sel_row.addWidget(self._combo_old, 1)

        sel_row.addWidget(QLabel("新版本:"))
        self._combo_new = QComboBox()
        self._combo_new.currentIndexChanged.connect(self._on_selection_changed)
        self._combo_new.setAccessibleName("新版本选择下拉框")
        self._combo_new.setAccessibleDescription("选择要对比的新版本策划书")
        sel_row.addWidget(self._combo_new, 1)

        self._btn_compare = QPushButton("开始对比")
        self._btn_compare.clicked.connect(self._on_compare)
        self._btn_compare.setAccessibleName("开始版本对比")
        self._btn_compare.setAccessibleDescription("对所选旧版本与新版本执行 Diff 对比")
        self._btn_compare.setShortcut("Alt+C")
        self._btn_compare.setToolTip("开始对比 (Alt+C)")
        sel_row.addWidget(self._btn_compare)
        return sel_row

    def _build_stats_label(self) -> QLabel:
        """构建对比统计标签（初始为占位文案）。"""
        self._stats_label = QLabel("（请选择版本并点击「开始对比」）")
        self._stats_label.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        return self._stats_label

    def _build_main_splitter(self) -> QSplitter:
        """构建左右分栏：左为章节 Diff 树，右为字段详情。"""
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左：章节树
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)

        tree_label = QLabel("章节 Diff 树")
        tree_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        left_layout.addWidget(tree_label)

        self._tree = QTreeWidget()
        self._tree.setHeaderLabels(["字段", "旧值", "新值", "类型"])
        self._tree.setColumnWidth(0, 280)
        self._tree.setColumnWidth(1, 200)
        self._tree.setColumnWidth(2, 200)
        self._tree.setColumnWidth(3, 80)
        self._tree.itemSelectionChanged.connect(self._on_tree_selected)
        self._tree.setAccessibleName("章节 Diff 树")
        self._tree.setAccessibleDescription("按章节展示字段级变更，红/绿/黄标注删除/新增/修改")
        left_layout.addWidget(self._tree, 1)
        splitter.addWidget(left)

        # 右：字段详情
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(4)

        detail_label = QLabel("字段详情")
        detail_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        right_layout.addWidget(detail_label)

        self._detail = QTextEdit()
        self._detail.setReadOnly(True)
        self._detail.setPlaceholderText("选择左侧字段查看详情...")
        self._detail.setAccessibleName("字段详情面板")
        self._detail.setAccessibleDescription("展示选中字段的旧值、新值与变更类型详情")
        right_layout.addWidget(self._detail, 1)
        splitter.addWidget(right)

        splitter.setSizes([600, 400])
        return splitter

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行（导出 Markdown + 关闭）。"""
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        self._btn_export = QPushButton("导出 Markdown")
        self._btn_export.setEnabled(False)
        self._btn_export.clicked.connect(self._on_export_md)
        self._btn_export.setAccessibleName("导出 Diff 报告为 Markdown 文件")
        self._btn_export.setAccessibleDescription("将当前版本对比结果导出为 .md 文件保存到本地")
        self._btn_export.setShortcut("Alt+E")
        self._btn_export.setToolTip("导出 (Alt+E)")
        btn_row.addWidget(self._btn_export)

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.reject)
        self._btn_close.setAccessibleName("关闭版本对比对话框")
        self._btn_close.setShortcut("Esc")
        btn_row.addWidget(self._btn_close)
        return btn_row

    def _apply_theme(self) -> None:
        """应用深色主题样式表到对话框及子控件。

        从 ceshu_theme 读取 bg/fg/border/accent/hint 等色彩键，
        缺失时回退到内置硬编码色值，保证无主题时仍可读。
        """
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'

        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QComboBox {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 4px 8px; border-radius: 4px;
            }}
            QTreeWidget {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
            }}
            QTreeWidget::item:selected {{
                background: {theme_color('accent', '#4f8cf7')}; color: white;
            }}
            QTextEdit {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
            }}
            QPushButton {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 6px 14px;
                border-radius: 4px;
            }}
            QPushButton:hover {{
                border-color: {theme_color('accent', '#4f8cf7')};
            }}
            QPushButton:disabled {{
                color: {theme_color('hint')};
            }}
        """)

    def _load_versions(self) -> None:
        """加载同版本链下的所有版本。

        流程：
        1. 以当前 ceshu_id 找到其根版本（parent_id 链顶端）。
        2. 调用 manager.list_versions 拉取该链下全部版本。
        3. 填充两个下拉框，默认旧版本=链首、新版本=链尾。

        若 manager 缺失或加载失败，弹出告警并保留空下拉框。
        """
        if not self._manager or not self._current_ceshu_id:
            return
        try:
            # 找到根版本
            cur = self._manager.get_ceshu(self._current_ceshu_id, self._library)
            root_id = cur.parent_id or cur.ceshu_id
            self._versions = self._manager.list_versions(self._library, root_id)
        except Exception as e:
            QMessageBox.warning(self, "加载版本", f"加载版本列表失败: {e}")
            return

        self._combo_old.clear()
        self._combo_new.clear()
        for v in self._versions:
            label = f"{v.get('version_label', 'v?')} - {v.get('name', '未命名')}"
            if v.get("is_active"):
                label += " ★激活"
            cid = v.get("ceshu_id", "")
            self._combo_old.addItem(label, cid)
            self._combo_new.addItem(label, cid)

        # 默认：旧版本选第一个，新版本选最后一个（如果有的话）
        if len(self._versions) >= 2:
            self._combo_old.setCurrentIndex(0)
            self._combo_new.setCurrentIndex(len(self._versions) - 1)

    def _on_selection_changed(self) -> None:
        """下拉框选择变化时，按需启用/禁用「开始对比」按钮。

        仅当旧/新版本均非空且不相同时才允许点击对比。
        """
        old_id = self._combo_old.currentData()
        new_id = self._combo_new.currentData()
        self._btn_compare.setEnabled(old_id != new_id and bool(old_id) and bool(new_id))

    def _on_compare(self) -> None:
        """执行对比"""
        old_id = self._combo_old.currentData()
        new_id = self._combo_new.currentData()
        if not old_id or not new_id or old_id == new_id:
            QMessageBox.information(self, "对比", "请选择两个不同的版本")
            return
        try:
            old_model = self._manager.get_ceshu(old_id, self._library)
            new_model = self._manager.get_ceshu(new_id, self._library)
        except Exception as e:
            QMessageBox.warning(self, "对比", f"加载版本失败: {e}")
            return

        self._diff = compute_version_diff(old_model, new_model)
        self._populate_tree()
        self._update_stats()
        self._btn_export.setEnabled(True)
        self.version_selected.emit(old_id, new_id)

    def _populate_tree(self) -> None:
        """渲染 Diff 树。

        遍历 VersionDiff 的每个章节，先添加章节节点（标注变更总数），
        再通过 _iter_changed_renders 拿到已格式化/截断的字段渲染数据，
        添加为字段子节点。最后默认展开所有有变更的章节。
        """
        self._tree.clear()
        if not self._diff:
            return

        for ch_diff in self._diff.chapter_diffs:
            # 章节节点
            ch_item = QTreeWidgetItem([
                ch_diff.chapter_label,
                "",
                "",
                f"{ch_diff.total_changes} 处变更" if ch_diff.has_changes else "未变",
            ])
            ch_font = ch_item.font(0)
            ch_font.setBold(True)
            ch_item.setFont(0, ch_font)
            ch_color = (self.COLOR_MODIFIED if ch_diff.has_changes
                        else self.COLOR_UNCHANGED)
            ch_item.setForeground(3, QBrush(QColor(ch_color)))

            # 字段子节点（仅展示有变更的）
            for r in self._iter_changed_renders(ch_diff, max_len=80):
                type_text, color = DIFF_DISPLAY[r.diff_type]
                field_item = QTreeWidgetItem([
                    r.field_label,
                    r.old_text,
                    r.new_text,
                    type_text,
                ])
                field_item.setForeground(3, QBrush(QColor(color)))
                field_item.setToolTip(1, r.old_text)
                field_item.setToolTip(2, r.new_text)
                ch_item.addChild(field_item)

            self._tree.addTopLevelItem(ch_item)

        # 默认展开有变更的章节
        for i in range(self._tree.topLevelItemCount()):
            top = self._tree.topLevelItem(i)
            ch_diff = self._diff.chapter_diffs[i]
            if top is not None:
                top.setExpanded(ch_diff.has_changes)

    def _iter_changed_renders(self, ch: ChapterDiff, max_len: int) -> list[FieldRender]:
        """生成章节内所有变更字段的渲染数据。

        Args:
            ch: 章节级 Diff。
            max_len: 旧/新值文案的最大长度，超出则截断并补 ``...``。

        Returns:
            仅包含非 UNCHANGED 字段的 FieldRender 列表，
            其中 old_text/new_text 已 _format_value 格式化并按 max_len 截断。
        """
        renders: list[FieldRender] = []
        for fd in ch.field_diffs:
            if fd.diff_type is DiffType.UNCHANGED:
                continue
            old_text = self._format_value(fd.old_value)
            new_text = self._format_value(fd.new_value)
            if len(old_text) > max_len:
                old_text = old_text[:max_len] + "..."
            if len(new_text) > max_len:
                new_text = new_text[:max_len] + "..."
            renders.append(FieldRender(
                field_label=fd.field_label,
                old_text=old_text,
                new_text=new_text,
                diff_type=fd.diff_type,
            ))
        return renders

    def _format_value(self, v: Any) -> str:
        """格式化字段值。

        - None → ``(空)``
        - bool → ``是`` / ``否``
        - list/dict → JSON 字符串（失败回退 str()）
        - 其它 → str(v)
        """
        if v is None:
            return "(空)"
        if isinstance(v, bool):
            return "是" if v else "否"
        if isinstance(v, (list, dict)):
            try:
                return json.dumps(v, ensure_ascii=False)
            except Exception:
                return str(v)
        return str(v)

    def _update_stats(self) -> None:
        """根据当前 Diff 更新顶部统计标签的 HTML 文案。

        包含旧/新版本名、四类计数（带颜色 span）、总变更率。
        无 Diff 时直接返回。
        """
        if not self._diff:
            return
        d = self._diff
        total = d.total_added + d.total_removed + d.total_modified + d.total_unchanged
        change_rate = (d.total_changes / total * 100) if total > 0 else 0
        self._stats_label.setText(
            f"📊 对比: {d.old_version_label} → {d.new_version_label}  |  "
            f"<span style='color:{self.COLOR_ADDED}'>✚ 新增 {d.total_added}</span>  "
            f"<span style='color:{self.COLOR_REMOVED}'>✖ 删除 {d.total_removed}</span>  "
            f"<span style='color:{self.COLOR_MODIFIED}'>✎ 修改 {d.total_modified}</span>  "
            f"<span style='color:{self.COLOR_UNCHANGED}'>未变 {d.total_unchanged}</span>  |  "
            f"变更率 {change_rate:.1f}%"
        )

    def _on_tree_selected(self) -> None:
        """选中字段，渲染详情。"""
        items = self._tree.selectedItems()
        if not items:
            return
        item = items[0]
        # 检查是否为字段子节点（有父节点）
        parent = item.parent()
        if parent is None:
            # 章节节点
            ch_label = item.text(0)
            self._detail.setHtml(
                f"<h3>{ch_label}</h3>"
                f"<p>{item.text(3)}</p>")
            return

        # 字段节点
        ch_label = parent.text(0)
        field_label = item.text(0)
        old_val = item.toolTip(1) or item.text(1)
        new_val = item.toolTip(2) or item.text(2)
        diff_type = item.text(3)

        color = self.COLOR_MODIFIED
        if "新增" in diff_type:
            color = self.COLOR_ADDED
        elif "删除" in diff_type:
            color = self.COLOR_REMOVED

        # 多行渲染
        old_html = self._escape_html(old_val).replace("\n", "<br>")
        new_html = self._escape_html(new_val).replace("\n", "<br>")

        html = (
            f"<h3 style='color:{color}'>{ch_label} · {field_label}</h3>"
            f"<p><b>变更类型:</b> <span style='color:{color}'>{diff_type}</span></p>"
            f"<p><b>旧值:</b></p>"
            f"<div style='background:{theme_color('border', '#333')};"
            f"padding:8px;border-radius:4px;'>{old_html or '(空)'}</div>"
            f"<p><b>新值:</b></p>"
            f"<div style='background:{theme_color('border', '#333')};"
            f"padding:8px;border-radius:4px;'>{new_html or '(空)'}</div>"
        )
        self._detail.setHtml(html)

    def _escape_html(self, text: str) -> str:
        """转义 HTML 特殊字符（& < >）以防详情面板 XSS/错版。

        空字符串原样返回；仅做三次 replace，不做完整 entity 编码。
        """
        if not text:
            return ""
        return (text.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;"))

    def _on_export_md(self) -> None:
        """导出 Diff 报告为 Markdown"""
        if not self._diff:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "导出 Diff 报告", "版本对比.md", "Markdown 文件 (*.md)")
        if not path:
            return
        try:
            md = self._build_markdown()
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            QMessageBox.information(self, "导出成功", f"Diff 报告已导出:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))

    def _build_markdown(self) -> str:
        """生成完整的 Markdown 版本对比报告。

        报告包含：报告头（版本/时间）、变更统计汇总、按章节列出的
        字段明细表格。字段文案通过 _iter_changed_renders 统一获取，
        在此基础上额外做 Markdown 表格的管道符转义与换行折叠。

        Returns:
            Markdown 格式的多行字符串。
        """
        d = self._diff
        assert d is not None
        lines = [
            "# 版本对比报告",
            "",
            f"- **旧版本**: {d.old_version_label} ({d.old_ceshu_id})",
            f"- **新版本**: {d.new_version_label} ({d.new_ceshu_id})",
            f"- **对比时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## 变更统计",
            "",
            f"- ✚ 新增字段: {d.total_added}",
            f"- ✖ 删除字段: {d.total_removed}",
            f"- ✎ 修改字段: {d.total_modified}",
            f"- 未变字段: {d.total_unchanged}",
            f"- 总变更: {d.total_changes}",
            "",
            "## 章节明细",
            "",
        ]
        for ch in d.chapter_diffs:
            if not ch.has_changes:
                lines.append(f"### {ch.chapter_label} — 未变")
                lines.append("")
                continue
            lines.append(f"### {ch.chapter_label}")
            lines.append("")
            lines.append(f"新增 {ch.added_count} | 删除 {ch.removed_count} | "
                         f"修改 {ch.modified_count} | 未变 {ch.unchanged_count}")
            lines.append("")
            lines.append("| 字段 | 旧值 | 新值 | 类型 |")
            lines.append("|------|------|------|------|")
            for r in self._iter_changed_renders(ch, max_len=60):
                # Markdown 表格需转义管道符、折叠换行
                old_str = r.old_text.replace("\n", " ").replace("|", "\\|")
                new_str = r.new_text.replace("\n", " ").replace("|", "\\|")
                type_text = DIFF_DISPLAY[r.diff_type][0]
                lines.append(f"| {r.field_label} | {old_str} | {new_str} | {type_text} |")
            lines.append("")

        return "\n".join(lines)
