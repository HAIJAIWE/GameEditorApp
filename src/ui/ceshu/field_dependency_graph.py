"""N14: 字段依赖关系图可视化对话框

使用 QGraphicsView + QGraphicsScene 绘制 18 章节之间的字段级依赖关系：
- 节点：每个相关章节一个矩形节点，颜色按违规状态着色
  - 绿色：所有依赖正常
  - 黄色：存在警告（仅一侧字段已填写）
  - 红色：存在违规（字段值冲突）
- 边：source → target 表示 source 依赖 target
  - 实线：一致性依赖（consistency）
  - 虚线：派生依赖（derived）
  - 点线：引用依赖（reference）
- 交互：点击节点显示该章节所有依赖详情
- 底部按钮：检查依赖 / 导出图片 / 关闭

复用 system_dependency_graph.py 的绘图风格（节点尺寸、分层、箭头）。
"""
from __future__ import annotations

from PyQt6.QtCore import QPointF, QRectF, QSize, Qt
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QPainter,
    QPainterPath,
    QPen,
    QPixmap,
)
from PyQt6.QtWidgets import (
    QDialog,
    QFileDialog,
    QGraphicsLineItem,
    QGraphicsPathItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsTextItem,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)

from core.ceshu.ceshu_model import CHAPTER_LABELS
from core.ceshu.field_dependencies import (
    DEP_TYPE_CONSISTENCY,
    DEP_TYPE_DERIVED,
    DEP_TYPE_REFERENCE,
    FIELD_DEPENDENCIES,
    STATUS_OK,
    STATUS_VIOLATION,
    STATUS_WARNING,
    build_dependency_graph,
    check_field_dependencies,
    get_chapter_violation_summary,
    get_dependencies_for_chapter,
)
from ui.themes import theme_color

# 节点尺寸（与 system_dependency_graph 风格一致）
_NODE_W = 130
_NODE_H = 50
_LAYER_GAP = 100
_NODE_GAP = 30

# 依赖类型 → 线型
_DEP_PEN_STYLE = {
    DEP_TYPE_CONSISTENCY: Qt.PenStyle.SolidLine,
    DEP_TYPE_DERIVED: Qt.PenStyle.DashLine,
    DEP_TYPE_REFERENCE: Qt.PenStyle.DotLine,
}

# 状态 → 节点颜色
_STATUS_COLORS = {
    STATUS_OK:        ("#81c784", "#2e7d32"),  # 绿
    STATUS_WARNING:   ("#fff176", "#f57f17"),  # 黄
    STATUS_VIOLATION: ("#e57373", "#c62828"),  # 红
}


def _layered_layout(graph: dict) -> dict[str, QPointF]:
    """计算各章节节点的二维位置（按依赖层级分层）。

    Args:
        graph: build_dependency_graph() 返回的邻接表 {chapter: [targets]}

    Returns:
        {chapter: QPointF(x, y)}
    """
    # 计算每个节点的层级（最长依赖链长度）
    level: dict[str, int] = {}

    def compute_level(node: str, visited: set) -> int:
        if node in level:
            return level[node]
        if node in visited:
            return 0  # 防循环
        visited.add(node)
        deps = graph.get(node, [])
        if not deps:
            level[node] = 0
            return 0
        lv = 1 + max((compute_level(d, visited) for d in deps if d in graph), default=-1)
        level[node] = max(lv, 0)
        return level[node]

    for n in graph:
        compute_level(n, set())

    # 按层级分组
    if not level:
        return {}
    max_lv = max(level.values())
    layers: list[list[str]] = [[] for _ in range(max_lv + 1)]
    for n, lv in level.items():
        layers[lv].append(n)
    for layer in layers:
        layer.sort()

    # 计算节点位置
    max_layer_width = max((len(layer) for layer in layers), default=1)
    scene_width = max(800, max_layer_width * (_NODE_W + _NODE_GAP) + 100)
    positions: dict[str, QPointF] = {}
    for layer_idx, layer in enumerate(layers):
        y = 30 + layer_idx * (_NODE_H + _LAYER_GAP)
        layer_width = len(layer) * (_NODE_W + _NODE_GAP) - _NODE_GAP
        start_x = (scene_width - layer_width) / 2
        for i, node_key in enumerate(layer):
            x = start_x + i * (_NODE_W + _NODE_GAP)
            positions[node_key] = QPointF(x, y)
    return positions


class _FieldNodeItem(QGraphicsRectItem):
    """字段依赖图节点 — 圆角矩形 + 居中文字"""

    def __init__(self, key: str, label: str, x: float, y: float, status: str):
        super().__init__(0, 0, _NODE_W, _NODE_H)
        self.setPos(x, y)
        self._key = key
        self._label = label
        self._status = status

        fill_hex, border_hex = _STATUS_COLORS.get(status, _STATUS_COLORS[STATUS_OK])
        self.setBrush(QBrush(QColor(fill_hex)))
        self.setPen(QPen(QColor(border_hex), 2))
        self.setFlag(QGraphicsRectItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setZValue(2)

        # 标签文字（章节简称，去掉"第X章·"前缀以适配节点宽度）
        short_label = label.split("·", 1)[-1] if "·" in label else label
        text_item = QGraphicsTextItem(short_label, self)
        text_item.setDefaultTextColor(QColor("white"))
        text_item.setFont(QFont("Microsoft YaHei", 9, QFont.Weight.Bold))
        text_rect = text_item.boundingRect()
        text_item.setPos(
            (_NODE_W - text_rect.width()) / 2,
            (_NODE_H - text_rect.height()) / 2,
        )


class FieldDependencyGraphDialog(QDialog):
    """字段依赖关系图对话框"""

    def __init__(self, model=None, parent=None):
        super().__init__(parent)
        self._model = model
        self.setWindowTitle("字段依赖关系图")
        self.setMinimumSize(QSize(960, 700))
        self._node_items: dict[str, _FieldNodeItem] = {}
        self._node_positions: dict[str, QPointF] = {}
        self._chapter_status: dict[str, str] = {}
        self._setup_ui()
        self._apply_theme()
        self._render_graph()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(8)

        title = QLabel("🔗 字段依赖关系图（跨章节字段级依赖）")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        # 图例
        legend_row = QHBoxLayout()
        legend_row.setSpacing(16)
        for color, label in [
            ("#81c784", "● 正常"),
            ("#fff176", "● 警告（仅一侧填写）"),
            ("#e57373", "● 违规（值冲突）"),
        ]:
            lbl = QLabel(f"<span style='color:{color};font-size:14px;'>●</span> "
                         f"<span style='font-size:11px;'>{label}</span>")
            lbl.setTextFormat(Qt.TextFormat.RichText)
            lbl.setStyleSheet("border: none; background: transparent;")
            legend_row.addWidget(lbl)
        legend_row.addStretch()
        # 线型说明
        line_legend = QLabel("— 一致性  ⋯ 派生  ····· 引用")
        line_legend.setStyleSheet(
            f"color: {theme_color('hint')}; font-size: 11px; "
            "border: none; background: transparent;"
        )
        legend_row.addWidget(line_legend)
        layout.addLayout(legend_row)

        # 图形视图
        self._view = QGraphicsView()
        self._view.setRenderHint(QPainter.RenderHint.Antialiasing)
        self._view.setBackgroundBrush(QBrush(QColor(theme_color("bg"))))
        self._view.setStyleSheet(f"""
            QGraphicsView {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        layout.addWidget(self._view)

        # 详情区
        self._detail_label = QLabel("点击节点查看该章节的字段依赖详情")
        self._detail_label.setStyleSheet(f"""
            background: {theme_color('input_bg')};
            color: {theme_color('fg')};
            border: 1px solid {theme_color('border')};
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
        """)
        self._detail_label.setWordWrap(True)
        self._detail_label.setMinimumHeight(80)
        self._detail_label.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        layout.addWidget(self._detail_label)

        # 底部按钮
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        btn_check = QPushButton("检查依赖")
        btn_check.clicked.connect(self._on_check)
        btn_row.addWidget(btn_check)
        btn_export = QPushButton("导出图片")
        btn_export.clicked.connect(self._on_export_image)
        btn_row.addWidget(btn_export)
        btn_close = QPushButton("关闭")
        btn_close.clicked.connect(self.accept)
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

    def _render_graph(self) -> None:
        """渲染依赖关系图"""
        scene = QGraphicsScene(self)
        scene.selectionChanged.connect(self._on_selection_changed)
        self._view.setScene(scene)
        self._node_items.clear()

        graph = build_dependency_graph()
        if not graph:
            return
        self._node_positions = _layered_layout(graph)

        # 计算各章节违规状态
        if self._model is not None:
            self._chapter_status = get_chapter_violation_summary(self._model)
        else:
            self._chapter_status = {}

        # 绘制边（source → target）
        for src, targets in graph.items():
            if src not in self._node_positions:
                continue
            src_pos = self._node_positions[src]
            src_center = QPointF(src_pos.x() + _NODE_W / 2, src_pos.y() + _NODE_H / 2)
            for dst in targets:
                if dst not in self._node_positions:
                    continue
                dst_pos = self._node_positions[dst]
                dst_center = QPointF(dst_pos.x() + _NODE_W / 2, dst_pos.y() + _NODE_H / 2)
                # 找到对应的依赖类型
                dep_type = self._find_dep_type(src, dst)
                self._add_edge(scene, src_center, dst_center, dep_type)

        # 绘制节点
        for node_key, pos in self._node_positions.items():
            label = CHAPTER_LABELS.get(node_key, node_key)
            status = self._chapter_status.get(node_key, STATUS_OK)
            item = _FieldNodeItem(node_key, label, pos.x(), pos.y(), status)
            scene.addItem(item)
            self._node_items[node_key] = item

        # 调整场景矩形
        max_y = max((p.y() for p in self._node_positions.values()), default=0)
        max_x = max((p.x() for p in self._node_positions.values()), default=0)
        scene.setSceneRect(QRectF(0, 0, max(max_x + _NODE_W + 50, 800),
                                  max_y + _NODE_H + 50))

    def _find_dep_type(self, src: str, dst: str) -> str:
        """查找 src → dst 的依赖类型（取第一条匹配）"""
        for dep in FIELD_DEPENDENCIES:
            if dep.source_chapter == src and dep.target_chapter == dst:
                return dep.dependency_type
        return DEP_TYPE_CONSISTENCY

    def _add_edge(self, scene: QGraphicsScene, src: QPointF, dst: QPointF,
                  dep_type: str) -> None:
        """绘制带箭头的边（线型由依赖类型决定）"""
        pen_style = _DEP_PEN_STYLE.get(dep_type, Qt.PenStyle.SolidLine)
        line = QGraphicsLineItem(src.x(), src.y(), dst.x(), dst.y())
        line_pen = QPen(QColor(theme_color("hint")), 1.5, pen_style)
        line.setPen(line_pen)
        line.setZValue(1)
        scene.addItem(line)
        self._add_arrow_head(scene, src, dst, line_pen.color())

    def _add_arrow_head(self, scene: QGraphicsScene, src: QPointF, dst: QPointF,
                        color: QColor) -> None:
        """在 dst 端添加箭头三角形"""
        dx = dst.x() - src.x()
        dy = dst.y() - src.y()
        length = (dx * dx + dy * dy) ** 0.5
        if length < 1:
            return
        ux = dx / length
        uy = dy / length
        arrow_size = 10
        tip = QPointF(dst.x() - ux * _NODE_W / 2.5, dst.y() - uy * _NODE_H / 2.5)
        left = QPointF(
            tip.x() - ux * arrow_size - uy * arrow_size * 0.5,
            tip.y() - uy * arrow_size + ux * arrow_size * 0.5,
        )
        right = QPointF(
            tip.x() - ux * arrow_size + uy * arrow_size * 0.5,
            tip.y() - uy * arrow_size - ux * arrow_size * 0.5,
        )
        path = QPainterPath()
        path.moveTo(tip)
        path.lineTo(left)
        path.lineTo(right)
        path.closeSubpath()
        arrow = QGraphicsPathItem(path)
        arrow.setBrush(QBrush(color))
        arrow.setPen(QPen(color, 1))
        arrow.setZValue(1)
        scene.addItem(arrow)

    def _on_selection_changed(self) -> None:
        """节点选中时显示详情"""
        selected = [k for k, item in self._node_items.items() if item.isSelected()]
        if not selected:
            return
        self._show_chapter_details(selected[0])

    def _show_chapter_details(self, chapter_key: str) -> None:
        """显示指定章节的依赖详情"""
        deps = get_dependencies_for_chapter(chapter_key)
        label = CHAPTER_LABELS.get(chapter_key, chapter_key)
        if not deps:
            self._detail_label.setText(f"<b>{label}</b><br/>（无字段依赖关系）")
            return
        lines = [f"<b>{label}</b> — 共 {len(deps)} 条依赖：<ul>"]
        for dep in deps:
            arrow = "→" if dep.source_chapter == chapter_key else "←"
            other = dep.target_chapter if dep.source_chapter == chapter_key else dep.source_chapter
            other_label = CHAPTER_LABELS.get(other, other)
            type_label = {"consistency": "一致性", "derived": "派生",
                          "reference": "引用"}.get(dep.dependency_type, dep.dependency_type)
            lines.append(
                f"<li>{arrow} <b>{other_label}</b> "
                f"（{type_label}）{dep.description}</li>"
            )
        lines.append("</ul>")
        self._detail_label.setText("".join(lines))

    def mousePressEvent(self, event) -> None:  # noqa: N802
        """重写鼠标事件以处理节点点击（场景事件转发）"""
        super().mousePressEvent(event)

    def _on_check(self) -> None:
        """检查所有字段依赖"""
        if self._model is None:
            QMessageBox.information(self, "检查依赖", "未加载策划书模型")
            return
        results = check_field_dependencies(self._model)
        ok_count = sum(1 for r in results if r["status"] == STATUS_OK)
        warn_count = sum(1 for r in results if r["status"] == STATUS_WARNING)
        viol_count = sum(1 for r in results if r["status"] == STATUS_VIOLATION)
        # 刷新节点状态
        self._chapter_status = get_chapter_violation_summary(self._model)
        for node_key, item in self._node_items.items():
            status = self._chapter_status.get(node_key, STATUS_OK)
            fill_hex, border_hex = _STATUS_COLORS.get(status, _STATUS_COLORS[STATUS_OK])
            item.setBrush(QBrush(QColor(fill_hex)))
            item.setPen(QPen(QColor(border_hex), 2))
        # 汇总消息
        msg = (f"字段依赖检查完成：\n\n"
               f"✅ 正常: {ok_count} 条\n"
               f"⚠️  警告: {warn_count} 条\n"
               f"❌ 违规: {viol_count} 条\n\n"
               f"共 {len(results)} 条依赖关系")
        if viol_count:
            msg += "\n\n违规详情：\n"
            for r in results:
                if r["status"] == STATUS_VIOLATION:
                    msg += f"• {r['message']}\n"
        QMessageBox.information(self, "字段依赖检查", msg)

    def _on_export_image(self) -> None:
        """导出当前图形为 PNG 图片"""
        scene = self._view.scene()
        if scene is None:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "导出字段依赖关系图", "field_dependencies.png", "PNG 图片 (*.png)")
        if not path:
            return
        rect = scene.sceneRect().toRect()
        if rect.width() < 1 or rect.height() < 1:
            QMessageBox.warning(self, "导出失败", "场景为空")
            return
        pixmap = QPixmap(rect.width(), rect.height())
        pixmap.fill(QColor(theme_color("bg")))
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        scene.render(painter, QRectF(0, 0, rect.width(), rect.height()), QRectF(rect))
        painter.end()
        if pixmap.save(path, "PNG"):
            QMessageBox.information(self, "导出成功", f"图片已保存到:\n{path}")
        else:
            QMessageBox.critical(self, "导出失败", f"无法保存图片到:\n{path}")

    def _apply_theme(self) -> None:
        self.setStyleSheet(f"""
            QDialog {{ background: {theme_color('bg')}; color: {theme_color('fg')}; }}
            QLabel {{ color: {theme_color('fg')}; }}
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
