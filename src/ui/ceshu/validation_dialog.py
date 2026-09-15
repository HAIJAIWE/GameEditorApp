"""v5.0 工业级校验报告对话框

可视化展示 CeshuModel.validate() 返回的错误列表：
- 🔴 必填字段缺失
- 🟠 一致性冲突（硬冲突）
- 🟡 一致性警告（软警告）
- 🔵 依赖缺失

附带章节完成度进度条（来自 CeshuModel.chapter_progress()）。
支持导出 Markdown 报告（可分享/归档）。
"""
from __future__ import annotations

from datetime import datetime

from PyQt6.QtCore import QSize, Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
)

from ui.themes import theme_color

# 错误分类关键字（与 ceshu_model.validate() 输出保持一致）
_CATEGORY_REQUIRED = "必填项"
_CATEGORY_CONFLICT = "一致性冲突"
_CATEGORY_WARNING = "一致性警告"
_CATEGORY_DEP = "依赖缺失"


def _categorize(error: str) -> str:
    """将单条错误归类"""
    if _CATEGORY_DEP in error:
        return "dep"
    if _CATEGORY_CONFLICT in error:
        return "conflict"
    if _CATEGORY_WARNING in error:
        return "warning"
    if _CATEGORY_REQUIRED in error:
        return "required"
    return "other"


_CATEGORY_META = {
    "required": {
        "title": "必填字段缺失",
        "icon": "🔴",
        "color": "#e57373",
        "tip": "影响工业级 GDD 完整性，必须修复",
    },
    "conflict": {
        "title": "一致性冲突",
        "icon": "🟠",
        "color": "#ffb74d",
        "tip": "章节间硬冲突，会导致执行歧义",
    },
    "warning": {
        "title": "一致性警告",
        "icon": "🟡",
        "color": "#fff176",
        "tip": "软警告，建议统一以提升一致性",
    },
    "dep": {
        "title": "依赖缺失",
        "icon": "🔵",
        "color": "#64b5f6",
        "tip": "启用的系统依赖未启用，运行时会出错",
    },
    "other": {
        "title": "其他问题",
        "icon": "⚪",
        "color": "#bdbdbd",
        "tip": "未分类问题",
    },
}


class ValidationReportDialog(QDialog):
    """校验报告对话框 — 分类展示错误 + 章节完成度进度条"""

    def __init__(self, model, parent=None):
        super().__init__(parent)
        self._model = model
        self.setWindowTitle("工业级校验报告")
        self.setMinimumSize(QSize(720, 560))
        self._setup_ui()
        self._apply_theme()

    # ── UI 构建 ──

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(10)

        # 顶部标题
        title = QLabel("工业级 GDD 校验报告")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        # 收集校验结果
        errors = self._model.validate() if self._model else []
        progress = self._model.chapter_progress() if self._model else {}

        # 顶部统计行
        stats = self._build_stats(errors)
        layout.addWidget(stats)

        # 中部：错误分类树
        layout.addWidget(self._build_errors_section(errors))

        # 底部：章节完成度
        layout.addWidget(self._build_progress_section(progress))

        # 关闭按钮
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        # v5.0 优化C: 一键修复必填项按钮（仅当有必填字段错误时显示）
        required_count = sum(1 for e in errors if _CATEGORY_REQUIRED in e)
        if required_count > 0 and self._model is not None:
            btn_fix = QPushButton(f"🤖 一键修复 {required_count} 项必填字段")
            btn_fix.clicked.connect(self._on_auto_fix)
            btn_fix.setStyleSheet("""
                QPushButton {
                    background: #ff7043;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 14px;
                    font-size: 12px;
                }
                QPushButton:hover { background: #f4511e; }
            """)
            btn_row.addWidget(btn_fix)
        btn_export = QPushButton("导出 Markdown")
        btn_export.clicked.connect(self._on_export_md)
        btn_row.addWidget(btn_export)
        btn_close = QPushButton("关闭")
        btn_close.clicked.connect(self.accept)
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

        # 缓存校验结果供导出使用
        self._errors = errors
        self._progress = progress

    def _build_stats(self, errors: list) -> QFrame:
        """顶部统计卡片：总错误数 + 各分类计数"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
                padding: 8px;
            }}
        """)
        h = QHBoxLayout(frame)
        h.setContentsMargins(12, 8, 12, 8)
        h.setSpacing(16)

        # 按分类统计
        counts = {"required": 0, "conflict": 0, "warning": 0, "dep": 0, "other": 0}
        for e in errors:
            counts[_categorize(e)] += 1

        # 总错误数（大数字）
        total = len(errors)
        total_label = QLabel(f"<div style='font-size:24px;font-weight:bold;color:{'#e57373' if total else '#81c784'}'>{total}</div>"
                             f"<div style='font-size:11px;color:{theme_color('hint')}'>问题总数</div>")
        total_label.setTextFormat(Qt.TextFormat.RichText)
        h.addWidget(total_label)

        # 分隔
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.VLine)
        sep.setStyleSheet(f"color: {theme_color('border')};")
        h.addWidget(sep)

        # 各分类计数
        for cat in ["required", "conflict", "warning", "dep"]:
            meta = _CATEGORY_META[cat]
            cnt = counts[cat]
            color = meta["color"]
            label = QLabel(
                f"<div style='font-size:18px;font-weight:bold;color:{color};'>{cnt}</div>"
                f"<div style='font-size:10px;color:{theme_color('hint')}'>{meta['icon']} {meta['title']}</div>"
            )
            label.setTextFormat(Qt.TextFormat.RichText)
            h.addWidget(label)

        h.addStretch()

        # 状态结论
        if total == 0:
            status_text = "<span style='color:#81c784;font-weight:bold'>✓ 校验通过</span>"
            status_sub = "<span style='color:#81c784'>已达工业级 GDD 完整性标准</span>"
        else:
            status_text = "<span style='color:#e57373;font-weight:bold'>⚠ 校验未通过</span>"
            status_sub = f"<span style='color:{theme_color('hint')}'>请按优先级修复（红 > 橙 > 蓝 > 黄）</span>"
        status_label = QLabel(
            f"<div style='font-size:13px;'>{status_text}</div>"
            f"<div style='font-size:11px;'>{status_sub}</div>"
        )
        status_label.setTextFormat(Qt.TextFormat.RichText)
        h.addWidget(status_label)

        return frame

    def _build_errors_section(self, errors: list) -> QFrame:
        """错误分类树"""
        frame = QFrame()
        v = QVBoxLayout(frame)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        header = QLabel("问题清单（按分类）")
        header.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        v.addWidget(header)

        tree = QTreeWidget()
        tree.setHeaderLabels(["问题详情", "分类"])
        tree_header = tree.header()
        if tree_header is not None:
            tree_header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
            tree_header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        tree.setAlternatingRowColors(True)
        v.addWidget(tree)

        # 按分类分组
        groups: dict[str, list[str]] = {}
        for e in errors:
            cat = _categorize(e)
            groups.setdefault(cat, []).append(e)

        # 按优先级顺序添加分类节点
        for cat in ["required", "conflict", "dep", "warning", "other"]:
            if cat not in groups:
                continue
            meta = _CATEGORY_META[cat]
            err_list = groups[cat]
            cat_item = QTreeWidgetItem([
                f"{meta['icon']} {meta['title']} ({len(err_list)})",
                meta["title"],
            ])
            cat_item.setForeground(0, QColor(meta["color"]))
            f = QFont()
            f.setBold(True)
            cat_item.setFont(0, f)
            cat_item.setToolTip(0, meta["tip"])
            # 子节点：每条错误
            for err in err_list:
                child = QTreeWidgetItem([err, ""])
                child.setForeground(0, QColor(theme_color("fg")))
                cat_item.addChild(child)
            tree.addTopLevelItem(cat_item)
            cat_item.setExpanded(True)

        # 无错误时显示提示
        if not errors:
            ok_item = QTreeWidgetItem(["✓ 没有发现问题，策划书结构完整", ""])
            ok_item.setForeground(0, QColor("#81c784"))
            f = QFont()
            f.setBold(True)
            ok_item.setFont(0, f)
            tree.addTopLevelItem(ok_item)

        return frame

    def _build_progress_section(self, progress: dict) -> QFrame:
        """章节完成度进度条"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
                padding: 6px;
            }}
        """)
        v = QVBoxLayout(frame)
        v.setContentsMargins(10, 6, 10, 6)
        v.setSpacing(4)

        header_row = QHBoxLayout()
        header = QLabel("章节完成度")
        header.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        header_row.addWidget(header)

        total_pct = int((progress.get("total", 0) or 0) * 100)
        total_color = "#81c784" if total_pct >= 80 else ("#fff176" if total_pct >= 50 else "#e57373")
        total_label = QLabel(
            f"<span style='color:{total_color};font-weight:bold;font-size:13px;'>总进度 {total_pct}%</span>"
        )
        total_label.setTextFormat(Qt.TextFormat.RichText)
        header_row.addStretch()
        header_row.addWidget(total_label)
        v.addLayout(header_row)

        # 总进度条
        total_bar = QProgressBar()
        total_bar.setRange(0, 100)
        total_bar.setValue(total_pct)
        total_bar.setTextVisible(False)
        total_bar.setFixedHeight(8)
        total_bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: none;
                border-radius: 4px;
            }}
            QProgressBar::chunk {{
                background: {total_color};
                border-radius: 4px;
            }}
        """)
        v.addWidget(total_bar)

        # 各章节进度（紧凑双列）
        from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
        col_row: QHBoxLayout | None = None
        for i, key in enumerate(CHAPTER_KEYS):
            if i % 2 == 0:
                col_row = QHBoxLayout()
                col_row.setSpacing(8)
                v.addLayout(col_row)
            pct = int((progress.get(key, 0) or 0) * 100)
            color = "#81c784" if pct >= 80 else ("#fff176" if pct >= 50 else "#e57373")
            cell = self._build_progress_cell(CHAPTER_LABELS.get(key, key), pct, color)
            col_row.addWidget(cell) if col_row else None

        return frame

    def _build_progress_cell(self, name: str, pct: int, color: str) -> QFrame:
        """单章节进度格：名称 + 微型进度条"""
        cell = QFrame()
        v = QVBoxLayout(cell)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(2)

        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        name_label = QLabel(name)
        name_label.setStyleSheet(f"color: {theme_color('fg')}; font-size: 11px; border: none; background: transparent;")
        row.addWidget(name_label)
        row.addStretch()
        pct_label = QLabel(f"{pct}%")
        pct_label.setStyleSheet(f"color: {color}; font-size: 11px; font-weight: bold; border: none; background: transparent;")
        row.addWidget(pct_label)
        v.addLayout(row)

        bar = QProgressBar()
        bar.setRange(0, 100)
        bar.setValue(pct)
        bar.setTextVisible(False)
        bar.setFixedHeight(5)
        bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: none;
                border-radius: 2px;
            }}
            QProgressBar::chunk {{
                background: {color};
                border-radius: 2px;
            }}
        """)
        v.addWidget(bar)

        return cell

    def _apply_theme(self) -> None:
        self.setStyleSheet(f"""
            QDialog {{ background: {theme_color('bg')}; color: {theme_color('fg')}; }}
            QLabel {{ color: {theme_color('fg')}; }}
            QTreeWidget {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
                color: {theme_color('fg')};
                font-size: 12px;
            }}
            QTreeWidget::item {{ padding: 4px 2px; }}
            QPushButton {{
                background: {theme_color('accent')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 6px 18px;
                font-size: 12px;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)

    # ── v5.0 优化A: Markdown 导出 ──

    def _on_auto_fix(self) -> None:
        """v5.0 优化C: 一键修复必填字段（本地智能占位）"""
        if not self._model:
            return
        reply = QMessageBox.question(
            self, "一键修复必填字段",
            "将为所有空的必填字段生成智能占位值（基于游戏类型/风格推导）。\n\n"
            "注意：\n"
            "• 这是本地规则推导，非 LLM 生成\n"
            "• 占位值仅用于通过校验，需后续细化\n"
            "• 已有内容不会被覆盖\n\n"
            "确定继续？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        try:
            filled = self._model.auto_fill_required()
            # 通知编辑器刷新
            parent = self.parent()
            if parent is not None and hasattr(parent, '_on_preset_applied'):
                # 复用预设应用的刷新逻辑（hasattr 收窄后属性可安全访问）
                parent._on_preset_applied("__auto_fix__")
            elif parent is not None and hasattr(parent, '_chapter_panel'):
                parent._chapter_panel.refresh_progress()
            QMessageBox.information(
                self, "修复完成",
                f"已自动填充 {filled} 个必填字段。\n\n"
                f"建议：\n"
                f"• 重新点击\"校验\"查看新报告\n"
                f"• 进入各章节细化占位内容\n"
                f"• 保存策划书以保留填充结果")
            # 关闭当前对话框，让用户重新校验
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, "修复失败", str(e))

    def _on_export_md(self) -> None:
        """导出校验报告为 Markdown 文件"""
        if not self._model:
            QMessageBox.information(self, "导出", "无策划书数据")
            return
        game_name = self._model.meta.get("game_name", "未命名")
        vlabel = self._model.version_label or "v1.0"
        safe_name = "".join(c for c in game_name if c.isalnum() or c in "._-") or "ceshu"
        default_name = f"{safe_name}_{vlabel}_校验报告.md"

        path, _ = QFileDialog.getSaveFileName(
            self, "导出校验报告", default_name, "Markdown 文件 (*.md)")
        if not path:
            return
        try:
            md = self._build_markdown()
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            QMessageBox.information(
                self, "导出成功",
                f"校验报告已导出到:\n{path}\n\n"
                f"包含完整性评分、问题清单、章节完成度。")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))

    def _build_markdown(self) -> str:
        """生成 Markdown 格式的校验报告"""
        from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS

        m = self._model
        game_name = m.meta.get("game_name", "未命名")
        vlabel = m.version_label or "v1.0"
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        total_pct = int((self._progress.get("total", 0) or 0) * 100)

        # 评分：100 - 错误数*3（最低0）
        score = max(0, 100 - len(self._errors) * 3)

        lines = []
        lines.append("# 工业级 GDD 校验报告")
        lines.append("")
        lines.append(f"**项目名称**: {game_name}  ")
        lines.append(f"**版本**: {vlabel}  ")
        lines.append(f"**生成时间**: {now}  ")
        lines.append(f"**完整性评分**: **{score}/100** ({'✓ 通过' if score >= 80 else '⚠ 待改进' if score >= 50 else '✗ 不合格'})  ")
        lines.append(f"**总进度**: {total_pct}%  ")
        lines.append("")

        # 摘要
        lines.append("## 摘要")
        lines.append("")
        counts = {"required": 0, "conflict": 0, "warning": 0, "dep": 0, "other": 0}
        for e in self._errors:
            counts[_categorize(e)] += 1
        lines.append(f"- 问题总数: **{len(self._errors)}**")
        for cat in ["required", "conflict", "warning", "dep", "other"]:
            meta = _CATEGORY_META[cat]
            lines.append(f"- {meta['icon']} {meta['title']}: {counts[cat]}")
        lines.append("")

        # 问题清单
        if self._errors:
            lines.append("## 问题清单")
            lines.append("")
            groups: dict[str, list[str]] = {}
            for e in self._errors:
                groups.setdefault(_categorize(e), []).append(e)
            for cat in ["required", "conflict", "dep", "warning", "other"]:
                if cat not in groups:
                    continue
                meta = _CATEGORY_META[cat]
                lines.append(f"### {meta['icon']} {meta['title']} ({len(groups[cat])})")
                lines.append("")
                lines.append(f"> {meta['tip']}")
                lines.append("")
                for err in groups[cat]:
                    lines.append(f"- {err}")
                lines.append("")
        else:
            lines.append("## ✓ 校验通过")
            lines.append("")
            lines.append("策划书结构完整，达到工业级 GDD 完整性标准。")
            lines.append("")

        # 章节完成度
        lines.append("## 章节完成度")
        lines.append("")
        lines.append("| 章节 | 完成度 | 状态 |")
        lines.append("|------|--------|------|")
        for key in CHAPTER_KEYS:
            pct = int((self._progress.get(key, 0) or 0) * 100)
            status = "✓" if pct >= 80 else ("⚠" if pct >= 50 else "✗")
            lines.append(f"| {CHAPTER_LABELS.get(key, key)} | {pct}% | {status} |")
        lines.append("")

        # 结论
        lines.append("## 结论与建议")
        lines.append("")
        if not self._errors:
            lines.append("策划书已达工业级 GDD 完整性标准，可进入开发评审阶段。")
        else:
            lines.append("按优先级修复（红 > 橙 > 蓝 > 黄）：")
            lines.append("")
            lines.append("1. **必填字段**: 优先补全元信息、产品愿景、核心玩法等基础章节")
            lines.append("2. **一致性冲突**: 章节间硬冲突会导致执行歧义，必须解决")
            lines.append("3. **依赖缺失**: 启用的系统需补齐依赖系统，否则运行时报错")
            lines.append("4. **一致性警告**: 软警告，建议统一以提升 GDD 一致性")
        lines.append("")
        lines.append("---")
        lines.append("*本报告由 GameEditorApp v5.0 工业级校验引擎生成*")

        return "\n".join(lines)
