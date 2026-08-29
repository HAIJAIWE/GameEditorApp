"""竞品象限图 — 第二章竞品分析可视化，接入8主题

基于 QGraphicsView 实现散点图，横轴=创新度，纵轴=完成度（0-100）
"""
from __future__ import annotations

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush, QColor, QFont, QPainter, QPen
from PyQt6.QtWidgets import QGraphicsScene, QGraphicsView, QVBoxLayout, QWidget

from ui.themes import is_dark_theme

from .ceshu_theme import theme_color


class CompetitiveChart(QWidget):
    """竞品象限图"""

    def __init__(self, competitors: list | None = None, parent=None):
        super().__init__(parent)
        self._competitors = competitors or []
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self._view = QGraphicsView()
        self._view.setRenderHint(QPainter.RenderHint.Antialiasing)
        self._view.setMinimumHeight(250)
        layout.addWidget(self._view)

    def set_data(self, competitors: list) -> None:
        """设置竞品数据并重绘"""
        self._competitors = competitors or []
        self._draw()

    def _draw(self) -> None:
        scene = QGraphicsScene()
        w, h = 340, 260
        margin = 50
        scene.setSceneRect(0, 0, w, h)

        dark = is_dark_theme()
        axis_color = theme_color('border') or ('#555' if dark else '#ccc')
        grid_color = theme_color('divider') or ('#333' if dark else '#eee')
        hint = theme_color('hint') or ('#94A3B8' if dark else '#888')

        pen_axis = QPen(QColor(axis_color), 1)
        pen_grid = QPen(QColor(grid_color), 0.5)
        font_small = QFont("Microsoft YaHei", 9)

        # 网格
        for i in range(0, 101, 25):
            x = margin + (w - margin - 20) * i / 100
            y = h - margin - (h - margin - 20) * i / 100
            scene.addLine(x, margin, x, h - 20, pen_grid)
            scene.addLine(margin, y, w - 20, y, pen_grid)

        # 坐标轴
        scene.addLine(margin, margin, margin, h - 20, pen_axis)  # Y
        scene.addLine(margin, h - margin, w - 20, h - margin, pen_axis)  # X

        # 标签
        x_label = scene.addText("创新度 →", font_small)
        x_label.setDefaultTextColor(QColor(hint))
        x_label.setPos(w - 80, h - 40)
        y_label = scene.addText("完成度 →", font_small)
        y_label.setDefaultTextColor(QColor(hint))
        y_label.setPos(10, 10)

        # 数据点
        accent = theme_color('accent') or '#0EA5E9'
        colors = [
            QColor(theme_color('agent_steward') or '#534AB7'),
            QColor(theme_color('agent_planner') or '#1D9E75'),
            QColor(theme_color('agent_ops') or '#D85A30'),
            QColor(accent),
            QColor(theme_color('agent_analyst') or '#BA7517'),
        ]
        for i, comp in enumerate(self._competitors[:5]):
            if not isinstance(comp, dict):
                continue
            ix = comp.get("innovation_score", 50)
            cy = comp.get("completion_score", 50)
            name = comp.get("name", f"竞品{i+1}")

            px = margin + (w - margin - 20) * max(0, min(100, ix)) / 100
            py = h - margin - (h - margin - 20) * max(0, min(100, cy)) / 100

            color = colors[i % len(colors)]
            scene.addEllipse(px - 5, py - 5, 10, 10,
                                       QPen(color.darker(130), 2), QBrush(color.lighter(150)))
            text = scene.addText(name, font_small)
            text.setDefaultTextColor(color)
            text.setPos(px + 8, py - 10)

        self._view.setScene(scene)
        self._view.fitInView(scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)
