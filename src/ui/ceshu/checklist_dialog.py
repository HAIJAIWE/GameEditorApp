"""N11: GDD 完备性检查清单对话框 — 预制作就绪检查

UI 结构:
- 顶部: 就绪度大数字 + 进度条 + 通过/失败/警告统计
- 左侧: 6 大类折叠树
- 右侧: 选中类别的检查项列表
  - 每项: 状态图标 + 标题 + 描述 + 检查结果消息
  - 必须项用红色标记
- 底部: 导出报告 / 一键修复（调用 auto_fill_required）/ 关闭
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QStackedWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from core.ceshu.ceshu_checklist import (
    ALL_CATEGORIES,
    STATUS_FAIL,
    STATUS_MANUAL,
    STATUS_NA,
    STATUS_PASS,
    STATUS_WARNING,
    ChecklistItem,
    ChecklistReport,
    ChecklistResult,
    get_items_by_category,
    run_checklist,
)

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# === 状态图标与颜色映射 ===
_STATUS_META: dict[str, dict] = {
    STATUS_PASS:    {"icon": "✅", "color": "#22C55E", "label": "通过"},
    STATUS_FAIL:    {"icon": "❌", "color": "#EF4444", "label": "失败"},
    STATUS_WARNING: {"icon": "⚠️", "color": "#F59E0B", "label": "警告"},
    STATUS_MANUAL:  {"icon": "👤", "color": "#6B7280", "label": "人工核查"},
    STATUS_NA:      {"icon": "➖", "color": "#9CA3AF", "label": "不适用"},
}


class ChecklistDialog(QDialog):
    """N11: GDD 完备性检查清单对话框"""

    def __init__(self, model: CeshuModel, parent: QWidget | None = None) -> None:
        """初始化检查清单对话框。

        Args:
            model: CeshuModel 实例。
            parent: 父控件。
        """
        super().__init__(parent)
        self._model = model
        self._report: ChecklistReport = run_checklist(model)
        self._items_by_cat: dict[str, list[ChecklistItem]] = {
            cat: get_items_by_category(cat) for cat in ALL_CATEGORIES
        }
        self._setup_ui()
        self._apply_theme()

    # ── UI 构建 ──

    def _setup_ui(self) -> None:
        """初始化对话框界面。"""
        self.setWindowTitle("N11 GDD 完备性检查清单")
        self.resize(1000, 720)
        self.setMinimumSize(800, 600)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        layout.addWidget(self._build_top_card())
        layout.addWidget(self._build_main_splitter(), 1)
        layout.addLayout(self._build_bottom_buttons())

    def _build_top_card(self) -> QWidget:
        """构建顶部卡片: 就绪度大数字 + 进度条 + 统计。"""
        card = QFrame()
        card.setObjectName("topCard")
        top_layout = QHBoxLayout(card)
        top_layout.setContentsMargins(20, 16, 20, 16)
        top_layout.setSpacing(20)

        # 就绪度大数字
        score = self._report.readiness_score
        ready = self._report.is_production_ready
        score_color = "#22C55E" if ready else ("#F59E0B" if score >= 50 else "#EF4444")
        self._score_label = QLabel(f"{score:.0f}")
        self._score_label.setFont(QFont("Microsoft YaHei", 36, QFont.Weight.Bold))
        self._score_label.setStyleSheet(
            f"color: {score_color}; background: transparent;")
        self._score_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._score_label.setFixedWidth(110)
        top_layout.addWidget(self._score_label)

        # 右侧: 状态文本 + 进度条 + 统计
        info_layout = QVBoxLayout()
        info_layout.setSpacing(6)

        ready_text = "✅ 制作就绪" if ready else "❌ 未就绪"
        self._status_label = QLabel(ready_text)
        self._status_label.setFont(QFont("Microsoft YaHei", 16, QFont.Weight.Bold))
        self._status_label.setStyleSheet(
            f"color: {score_color}; background: transparent;")
        info_layout.addWidget(self._status_label)

        # 进度条
        self._progress = QProgressBar()
        self._progress.setRange(0, 100)
        self._progress.setValue(int(score))
        self._progress.setFixedHeight(14)
        self._progress.setTextVisible(False)
        self._progress.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: 1px solid {theme_color('border')};
                border-radius: 7px;
            }}
            QProgressBar::chunk {{
                background: {score_color};
                border-radius: 6px;
            }}
        """)
        info_layout.addWidget(self._progress)

        # 统计行
        stat_text = (
            f"通过 {self._report.passed}  ·  "
            f"失败 {self._report.failed}  ·  "
            f"警告 {self._report.warnings}  ·  "
            f"人工 {self._report.manual}  ·  "
            f"共 {self._report.total_items} 项"
        )
        self._stat_label = QLabel(stat_text)
        self._stat_label.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        info_layout.addWidget(self._stat_label)

        info_layout.addStretch()
        top_layout.addLayout(info_layout, 1)
        return card

    def _build_main_splitter(self) -> QWidget:
        """构建主体: 左侧类别树 + 右侧检查项列表。"""
        from PyQt6.QtWidgets import QSplitter
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左侧: 6 大类折叠树
        self._tree = QTreeWidget()
        self._tree.setHeaderHidden(True)
        self._tree.setFixedWidth(220)
        self._tree.itemClicked.connect(self._on_category_clicked)
        self._populate_category_tree()
        splitter.addWidget(self._tree)

        # 右侧: 检查项列表（QScrollArea 包裹）
        self._stack = QStackedWidget()
        self._item_widgets: dict[str, QWidget] = {}
        for cat in ALL_CATEGORIES:
            page = self._build_category_page(cat)
            self._stack.addWidget(page)
            self._item_widgets[cat] = page
        # 默认显示第一类
        if ALL_CATEGORIES:
            self._stack.setCurrentWidget(self._item_widgets[ALL_CATEGORIES[0]])
            # 同步选中树的第一项
            top_item = self._tree.topLevelItem(0)
            if top_item:
                top_item.setSelected(True)
        splitter.addWidget(self._stack)
        splitter.setSizes([220, 780])
        return splitter

    def _populate_category_tree(self) -> None:
        """填充左侧类别树（含每类统计）。"""
        for cat in ALL_CATEGORIES:
            items = self._items_by_cat.get(cat, [])
            # 计算该类下通过率
            cat_item_ids = {it.id for it in items}
            cat_results = [r for r in self._report.results if r.item_id in cat_item_ids]
            passed = sum(1 for r in cat_results if r.status == STATUS_PASS)
            total = len(cat_results)
            label = f"{cat}  ({passed}/{total})"
            tree_item = QTreeWidgetItem([label])
            tree_item.setData(0, Qt.ItemDataRole.UserRole, cat)
            # 失败项标红
            failed = sum(1 for r in cat_results if r.status == STATUS_FAIL)
            if failed > 0:
                tree_item.setForeground(0, QColor("#EF4444"))
            self._tree.addTopLevelItem(tree_item)

    def _build_category_page(self, category: str) -> QWidget:
        """构建单个类别的检查项列表页。"""
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        container = QWidget()
        container_layout = QVBoxLayout(container)
        container_layout.setContentsMargins(8, 8, 8, 8)
        container_layout.setSpacing(8)

        # 类别标题
        title = QLabel(category)
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(
            f"color: {theme_color('fg')}; background: transparent;")
        container_layout.addWidget(title)

        # 各检查项卡片
        items = self._items_by_cat.get(category, [])
        result_map = {r.item_id: r for r in self._report.results}
        for item in items:
            result = result_map.get(item.id)
            card = self._build_item_card(item, result)
            container_layout.addWidget(card)

        container_layout.addStretch()
        scroll.setWidget(container)
        return scroll

    def _build_item_card(self, item: ChecklistItem,
                         result: ChecklistResult | None) -> QFrame:
        """构建单个检查项卡片。"""
        card = QFrame()
        card.setObjectName("itemCard")
        card.setFrameShape(QFrame.Shape.Box)
        card.setLineWidth(1)

        layout = QHBoxLayout(card)
        layout.setContentsMargins(12, 8, 12, 8)
        layout.setSpacing(10)

        # 状态图标
        status = result.status if result else STATUS_MANUAL
        meta = _STATUS_META.get(status, _STATUS_META[STATUS_MANUAL])
        icon_label = QLabel(meta["icon"])
        icon_label.setFixedSize(28, 28)
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_label.setStyleSheet(
            f"background: {meta['color']}22; color: {meta['color']}; "
            f"border-radius: 14px; font-size: 14px; border: none;")
        layout.addWidget(icon_label)

        # 中间: 标题 + 描述 + 消息
        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        # 标题行（含必需项标记）
        title_text = item.title
        if item.required:
            title_text = f"<span style='color:#EF4444'>*</span> {title_text}"
        title_label = QLabel(title_text)
        title_label.setTextFormat(Qt.TextFormat.RichText)
        title_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        title_label.setStyleSheet(
            f"color: {theme_color('fg')}; background: transparent; border: none;")
        info_layout.addWidget(title_label)

        desc_label = QLabel(item.description)
        desc_label.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; "
            f"font-size: 11px; border: none;")
        desc_label.setWordWrap(True)
        info_layout.addWidget(desc_label)

        msg = result.message if result else "未运行检查"
        msg_label = QLabel(msg)
        msg_label.setStyleSheet(
            f"color: {meta['color']}; background: transparent; "
            f"font-size: 11px; border: none;")
        msg_label.setWordWrap(True)
        info_layout.addWidget(msg_label)

        layout.addLayout(info_layout, 1)

        # 右侧: 必需/建议 标签
        badge_text = "必需" if item.required else "建议"
        badge_color = "#EF4444" if item.required else "#6B7280"
        badge = QLabel(badge_text)
        badge.setFixedWidth(40)
        badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        badge.setStyleSheet(
            f"background: {badge_color}22; color: {badge_color}; "
            f"padding: 2px 6px; border-radius: 8px; font-size: 10px; border: none;")
        layout.addWidget(badge)

        return card

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行: 导出报告 / 一键修复 / 关闭。"""
        row = QHBoxLayout()
        row.addStretch()

        self._btn_export = QPushButton("导出报告")
        self._btn_export.clicked.connect(self._on_export)
        self._btn_export.setToolTip("导出检查报告为 Markdown 文件")
        row.addWidget(self._btn_export)

        self._btn_fix = QPushButton("一键修复")
        self._btn_fix.clicked.connect(self._on_auto_fix)
        self._btn_fix.setToolTip("调用 auto_fill_required 自动填充空必填字段")
        row.addWidget(self._btn_fix)

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.accept)
        row.addWidget(self._btn_close)
        return row

    # ── 事件回调 ──

    def _on_category_clicked(self, item: QTreeWidgetItem, _) -> None:
        """点击左侧类别树项时切换右侧页面。"""
        cat = item.data(0, Qt.ItemDataRole.UserRole)
        if cat and cat in self._item_widgets:
            self._stack.setCurrentWidget(self._item_widgets[cat])

    def _on_export(self) -> None:
        """导出 Markdown 报告。"""
        md = self._build_markdown()
        path, _ = QFileDialog.getSaveFileName(
            self, "导出检查报告",
            f"GDD_Checklist_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md",
            "Markdown 文件 (*.md)",
        )
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            QMessageBox.information(self, "导出成功", f"检查报告已导出到:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))

    def _on_auto_fix(self) -> None:
        """一键修复: 调用 auto_fill_required 并重新检查。"""
        if not hasattr(self._model, "auto_fill_required"):
            QMessageBox.warning(self, "一键修复", "当前模型不支持 auto_fill_required")
            return
        filled = self._model.auto_fill_required()
        # 重新运行检查
        self._report = run_checklist(self._model)
        # 刷新 UI
        self._refresh_ui()
        QMessageBox.information(
            self, "一键修复完成",
            f"已自动填充 {filled} 个空必填字段，请人工复核填充内容的合理性。")

    def _refresh_ui(self) -> None:
        """刷新整个对话框的 UI（重新构建顶部卡片与列表页）。"""
        # 重建顶部卡片数据
        score = self._report.readiness_score
        ready = self._report.is_production_ready
        score_color = "#22C55E" if ready else ("#F59E0B" if score >= 50 else "#EF4444")
        self._score_label.setText(f"{score:.0f}")
        self._score_label.setStyleSheet(
            f"color: {score_color}; background: transparent;")
        ready_text = "✅ 制作就绪" if ready else "❌ 未就绪"
        self._status_label.setText(ready_text)
        self._status_label.setStyleSheet(
            f"color: {score_color}; background: transparent;")
        self._progress.setValue(int(score))
        stat_text = (
            f"通过 {self._report.passed}  ·  "
            f"失败 {self._report.failed}  ·  "
            f"警告 {self._report.warnings}  ·  "
            f"人工 {self._report.manual}  ·  "
            f"共 {self._report.total_items} 项"
        )
        self._stat_label.setText(stat_text)

        # 重建左侧树
        self._tree.clear()
        self._populate_category_tree()
        # 重建右侧各页
        # 简单做法: 移除旧页面，重新构建
        while self._stack.count() > 0:
            w = self._stack.widget(0)
            if w is not None:
                self._stack.removeWidget(w)
                w.deleteLater()
        self._item_widgets.clear()
        for cat in ALL_CATEGORIES:
            page = self._build_category_page(cat)
            self._stack.addWidget(page)
            self._item_widgets[cat] = page
        if ALL_CATEGORIES:
            self._stack.setCurrentWidget(self._item_widgets[ALL_CATEGORIES[0]])
            top_item = self._tree.topLevelItem(0)
            if top_item:
                top_item.setSelected(True)

    def _build_markdown(self) -> str:
        """生成 Markdown 报告文本。"""
        lines = [
            "# GDD 完备性检查报告",
            "",
            f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"**游戏名称**: {self._model.meta.get('game_name', '未命名')}",
            f"**就绪状态**: {'✅ 制作就绪' if self._report.is_production_ready else '❌ 未就绪'}",
            f"**就绪度评分**: {self._report.readiness_score:.1f} / 100",
            "",
            "## 统计摘要",
            "",
            f"- 总检查项: {self._report.total_items}",
            f"- 通过: {self._report.passed}",
            f"- 失败: {self._report.failed}",
            f"- 警告: {self._report.warnings}",
            f"- 人工核查: {self._report.manual}",
            f"- 不适用: {self._report.not_applicable}",
            "",
        ]
        # 按类别分组
        for cat in ALL_CATEGORIES:
            items = self._items_by_cat.get(cat, [])
            if not items:
                continue
            lines.append(f"## {cat}")
            lines.append("")
            lines.append("| 状态 | 标题 | 类型 | 检查消息 |")
            lines.append("|------|------|------|----------|")
            result_map = {r.item_id: r for r in self._report.results}
            for item in items:
                r = result_map.get(item.id)
                status = r.status if r else STATUS_MANUAL
                meta = _STATUS_META.get(status, _STATUS_META[STATUS_MANUAL])
                req_text = "必需" if item.required else "建议"
                msg = (r.message if r else "未运行").replace("|", "\\|")
                lines.append(f"| {meta['icon']} {meta['label']} | {item.title} | {req_text} | {msg} |")
            lines.append("")
        return "\n".join(lines)

    def _apply_theme(self) -> None:
        """应用对话框整体主题样式。"""
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'
        self.setStyleSheet(f"""
            QDialog {{ background: {theme_color('bg') or '#1a1a1a'}; }}
            QFrame#topCard {{
                background: {bg};
                border: 1px solid {border};
                border-radius: 10px;
            }}
            QFrame#itemCard {{
                background: {bg};
                border: 1px solid {border};
                border-radius: 8px;
            }}
            QTreeWidget {{
                background: {bg};
                border: 1px solid {border};
                border-radius: 8px;
                color: {fg};
                font-size: 13px;
                padding: 4px;
            }}
            QTreeWidget::item {{
                padding: 6px 4px;
            }}
            QTreeWidget::item:selected {{
                background: {theme_color('accent_light', '#3a3a5a')};
                color: {theme_color('accent', '#4f8cf7')};
            }}
            QPushButton {{
                border: 1px solid {theme_color('accent', '#4f8cf7')};
                color: {theme_color('accent', '#4f8cf7')};
                border-radius: 6px;
                padding: 7px 18px;
                font-size: 12px;
                background: {bg};
            }}
            QPushButton:hover {{ background: {theme_color('accent_light', '#3a3a5a')}; }}
            QScrollArea {{ background: transparent; border: none; }}
        """)
