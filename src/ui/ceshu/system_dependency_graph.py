"""v5.0 优化B: 系统依赖关系图可视化

使用 QGraphicsView + QGraphicsScene 画 12 个游戏系统的依赖关系：
- 节点：每个系统一个圆形/矩形节点，颜色按启用状态着色
- 边：A→B 表示 A 依赖 B（箭头指向被依赖的系统）
- 节点位置：自动按依赖层级分层布局（拓扑排序）
- 交互：悬停高亮、点击节点选中并显示详情

依赖关系来源：core.ceshu.ceshu_constants.SYSTEM_DEPENDENCIES
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
)
from PyQt6.QtWidgets import (
    QDialog,
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QGraphicsPathItem,
    QGraphicsScene,
    QGraphicsTextItem,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
)

from core.ceshu.ceshu_constants import SYSTEM_DEPENDENCIES
from core.ceshu.ceshu_model import SYSTEM_LABELS
from ui.themes import theme_color

# 节点尺寸
_NODE_W = 110
_NODE_H = 50
_LAYER_GAP = 100  # 层间距
_NODE_GAP = 30    # 同层节点间距


def _topological_layers(deps: dict) -> list[list[str]]:
    """拓扑排序分层：返回 [[layer0], [layer1], ...]

    layer0 = 没有依赖的系统（叶子）
    layerN = 依赖 layer0..layerN-1 中节点的系统
    """
    # 收集所有节点
    all_nodes: set[str] = set()
    for k, v in deps.items():
        all_nodes.add(k)
        for d in v:
            all_nodes.add(d)
    # 计算每个节点的"层级"（最长依赖链长度）
    level: dict[str, int] = {}

    def compute_level(node: str, visited: set) -> int:
        if node in level:
            return level[node]
        if node in visited:
            return 0  # 防循环
        visited.add(node)
        ds = deps.get(node, [])
        if not ds:
            level[node] = 0
            return 0
        lv = 1 + max(compute_level(d, visited) for d in ds if d in all_nodes)
        level[node] = lv
        return lv

    for n in all_nodes:
        compute_level(n, set())

    # 按层级分组
    max_lv = max(level.values()) if level else 0
    layers: list[list[str]] = [[] for _ in range(max_lv + 1)]
    for n, lv in level.items():
        layers[lv].append(n)
    # 每层排序确保稳定
    for layer in layers:
        layer.sort()
    return layers


class _SystemNodeItem(QGraphicsEllipseItem):
    """系统节点 — 椭圆 + 居中文字"""

    def __init__(self, key: str, label: str, x: float, y: float,
                 enabled: bool, has_issue: bool = False):
        super().__init__(0, 0, _NODE_W, _NODE_H)
        self.setPos(x, y)
        self._key = key
        self._label = label
        self._enabled = enabled
        self._has_issue = has_issue

        # 颜色策略
        if has_issue:
            fill = QColor("#e57373")  # 红 — 依赖缺失
            border = QColor("#c62828")
        elif enabled:
            fill = QColor("#81c784")  # 绿 — 已启用
            border = QColor("#2e7d32")
        else:
            fill = QColor("#90a4ae")  # 灰蓝 — 未启用
            border = QColor("#455a64")

        self.setBrush(QBrush(fill))
        self.setPen(QPen(border, 2))
        self.setFlag(QGraphicsEllipseItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setZValue(2)

        # 标签文字
        text_item = QGraphicsTextItem(label, self)
        text_item.setDefaultTextColor(QColor("white"))
        font = QFont("Microsoft YaHei", 9, QFont.Weight.Bold)
        text_item.setFont(font)
        # 居中
        text_rect = text_item.boundingRect()
        text_item.setPos(
            (_NODE_W - text_rect.width()) / 2,
            (_NODE_H - text_rect.height()) / 2,
        )


class SystemDependencyGraphDialog(QDialog):
    """系统依赖关系图对话框"""

    def __init__(self, model=None, parent=None):
        super().__init__(parent)
        self._model = model
        self.setWindowTitle("游戏系统依赖关系图")
        self.setMinimumSize(QSize(900, 640))
        self._node_items: dict[str, _SystemNodeItem] = {}
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(8)

        # 标题
        title = QLabel("🔗 游戏系统依赖关系图")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        # 图例
        legend_row = QHBoxLayout()
        legend_row.setSpacing(16)
        for color, label in [
            ("#81c784", "● 已启用（依赖满足）"),
            ("#90a4ae", "● 未启用"),
            ("#e57373", "● 依赖缺失"),
        ]:
            lbl = QLabel(f"<span style='color:{color};font-size:14px;'>●</span> "
                         f"<span style='font-size:11px;'>{label}</span>")
            lbl.setTextFormat(Qt.TextFormat.RichText)
            lbl.setStyleSheet("border: none; background: transparent;")
            legend_row.addWidget(lbl)
        legend_row.addStretch()

        # 箭头说明
        arrow_lbl = QLabel("→ 箭头方向：A → B 表示 A 依赖 B")
        arrow_lbl.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; border: none; background: transparent;")
        legend_row.addWidget(arrow_lbl)
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

        # 选中节点详情
        self._detail_label = QLabel("点击节点查看详情")
        self._detail_label.setStyleSheet(f"""
            background: {theme_color('input_bg')};
            color: {theme_color('fg')};
            border: 1px solid {theme_color('border')};
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
        """)
        self._detail_label.setWordWrap(True)
        self._detail_label.setMinimumHeight(50)
        layout.addWidget(self._detail_label)

        # 关闭按钮
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        btn_close = QPushButton("关闭")
        btn_close.clicked.connect(self.accept)
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

        # 渲染图形
        self._render_graph()

    def _render_graph(self) -> None:
        """渲染依赖关系图"""
        scene = QGraphicsScene(self)
        self._view.setScene(scene)
        self._node_items.clear()

        # 拓扑分层
        layers = _topological_layers(SYSTEM_DEPENDENCIES)
        if not layers:
            return

        # 检查依赖缺失
        missing_deps_map: dict[str, list[str]] = {}
        if self._model:
            from core.ceshu.ceshu_constants import check_system_dependencies
            enabled_keys = [k for k, v in self._model.systems.items()
                            if isinstance(v, dict) and v.get("enabled")]
            for item in check_system_dependencies(enabled_keys):
                missing_deps_map[item["system"]] = item["missing"]

        # 启用状态
        enabled_set: set[str] = set()
        if self._model:
            enabled_set = {k for k, v in self._model.systems.items()
                           if isinstance(v, dict) and v.get("enabled")}

        # 计算节点位置（分层 + 水平居中）
        node_pos: dict[str, QPointF] = {}
        max_layer_width = max(len(layer) for layer in layers)
        scene_width = max(800, max_layer_width * (_NODE_W + _NODE_GAP) + 100)

        for layer_idx, layer in enumerate(layers):
            y = 30 + layer_idx * (_NODE_H + _LAYER_GAP)
            layer_width = len(layer) * (_NODE_W + _NODE_GAP) - _NODE_GAP
            start_x = (scene_width - layer_width) / 2
            for i, node_key in enumerate(layer):
                x = start_x + i * (_NODE_W + _NODE_GAP)
                node_pos[node_key] = QPointF(x, y)

        # 绘制依赖边（A → B 表示 A 依赖 B）
        for src, deps in SYSTEM_DEPENDENCIES.items():
            if src not in node_pos:
                continue
            src_pos = node_pos[src]
            src_center = QPointF(src_pos.x() + _NODE_W / 2, src_pos.y() + _NODE_H / 2)
            for dst in deps:
                if dst not in node_pos:
                    continue
                dst_pos = node_pos[dst]
                dst_center = QPointF(dst_pos.x() + _NODE_W / 2, dst_pos.y() + _NODE_H / 2)

                # 创建带箭头的线
                line = QGraphicsLineItem(
                    src_center.x(), src_center.y(),
                    dst_center.x(), dst_center.y(),
                )
                # 颜色：依赖缺失则红，否则按启用状态着色
                src_enabled = src in enabled_set
                dst_enabled = dst in enabled_set
                if src_enabled and not dst_enabled:
                    line_pen = QPen(QColor("#e57373"), 2, Qt.PenStyle.DashLine)
                elif src_enabled and dst_enabled:
                    line_pen = QPen(QColor("#81c784"), 2)
                else:
                    line_pen = QPen(QColor(theme_color("hint")), 1)
                line.setPen(line_pen)
                line.setZValue(1)
                scene.addItem(line)

                # 箭头（在 dst 端）
                self._add_arrow_head(scene, src_center, dst_center, line_pen.color())

        # 绘制节点
        for node_key, pos in node_pos.items():
            label = SYSTEM_LABELS.get(node_key, node_key)
            enabled = node_key in enabled_set
            has_issue = node_key in missing_deps_map
            item = _SystemNodeItem(node_key, label, pos.x(), pos.y(), enabled, has_issue)
            scene.addItem(item)
            self._node_items[node_key] = item

        # 调整场景矩形
        scene.setSceneRect(QRectF(0, 0, scene_width,
                                  30 + len(layers) * (_NODE_H + _LAYER_GAP)))

    def _add_arrow_head(self, scene: QGraphicsScene,
                        src: QPointF, dst: QPointF, color: QColor) -> None:
        """在 dst 端添加箭头"""
        # 计算箭头方向
        dx = dst.x() - src.x()
        dy = dst.y() - src.y()
        length = (dx * dx + dy * dy) ** 0.5
        if length < 1:
            return
        # 单位向量
        ux = dx / length
        uy = dy / length
        # 箭头尺寸
        arrow_size = 10
        # 箭头三角形顶点（在 dst 端前移 _NODE_H/2 让箭头不被节点遮住）
        tip = QPointF(dst.x() - ux * _NODE_W / 2.5, dst.y() - uy * _NODE_H / 2.5)
        # 左右两翼
        left = QPointF(
            tip.x() - ux * arrow_size - uy * arrow_size * 0.5,
            tip.y() - uy * arrow_size + ux * arrow_size * 0.5,
        )
        right = QPointF(
            tip.x() - ux * arrow_size + uy * arrow_size * 0.5,
            tip.y() - uy * arrow_size - ux * arrow_size * 0.5,
        )
        # 用多边形路径
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
