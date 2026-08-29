"""N7: 版本时间线可视化对话框

特性:
- 读取当前策划书同版本链下的所有版本（CeshuManager.list_versions）
- 用 QGraphicsView/QGraphicsScene 绘制横向时间线
- 每个版本一个节点：版本号 + 创建时间 + 激活状态（绿色高亮）
- 节点之间用箭头连接（parent → child）
- 点击节点显示该版本的 version_note 和章节进度
- 支持切换到选中版本（version_selected 信号）
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QPointF, QSize, Qt, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QPainter,
    QPen,
    QPolygonF,
)
from PyQt6.QtWidgets import (
    QDialog,
    QGraphicsLineItem,
    QGraphicsPolygonItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsTextItem,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_manager import CeshuManager


# === 节点尺寸常量 ===

_NODE_W = 180
_NODE_H = 80
_NODE_GAP = 60   # 节点间水平间距
_NODE_Y = 120    # 节点中心 Y 坐标

# 颜色
_COLOR_ACTIVE = "#22C55E"   # 激活版本 — 绿色
_COLOR_MAIN = "#3B82F6"     # 主策划（非激活） — 蓝色
_COLOR_SUB = "#90A4AE"      # 子版本（非激活） — 灰蓝
_COLOR_ARROW = "#888888"
_COLOR_SELECTED = "#F59E0B"  # 选中边框 — 橙色


class _VersionNodeItem(QGraphicsRectItem):
    """版本节点 — 圆角矩形 + 版本号/时间/激活状态文字。

    通过 data(DATA_KEY_VERSION) 携带版本信息字典供外部读取。
    """

    DATA_KEY = 0x1001  # QGraphicsItem.USER 计数起点

    def __init__(self, version: dict, x: float, y: float,
                 is_main: bool = False, parent_item=None):
        """初始化节点。

        Args:
            version: 版本信息字典（含 ceshu_id/version_label/updated_at/is_active/version_note）。
            x: 节点左上角 X 坐标。
            y: 节点左上角 Y 坐标。
            is_main: 是否为主策划节点。
            parent_item: 父 QGraphicsItem。
        """
        super().__init__(0, 0, _NODE_W, _NODE_H, parent_item)
        self.setPos(x, y)
        self._version = version
        self._is_main = is_main

        # 颜色策略
        if version.get("is_active"):
            fill = QColor(_COLOR_ACTIVE)
            border = QColor("#16A34A")
        elif is_main:
            fill = QColor(_COLOR_MAIN)
            border = QColor("#1D4ED8")
        else:
            fill = QColor(_COLOR_SUB)
            border = QColor("#455A64")
        self.setBrush(QBrush(fill))
        self.setPen(QPen(border, 2))
        self.setFlag(QGraphicsRectItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setZValue(2)
        self.setData(self.DATA_KEY, version)

        # 版本号
        vlabel = version.get("version_label", "v?")
        if version.get("is_active"):
            vlabel += " ★"
        if is_main:
            vlabel = "★ " + vlabel
        title_item = QGraphicsTextItem(vlabel, self)
        title_item.setDefaultTextColor(QColor("white"))
        title_item.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        title_item.setPos(8, 6)

        # 创建/更新时间
        updated = version.get("updated_at", "") or version.get("created_at", "")
        if updated:
            updated_short = updated[:16] if len(updated) >= 16 else updated
        else:
            updated_short = "(无时间)"
        time_item = QGraphicsTextItem(updated_short, self)
        time_item.setDefaultTextColor(QColor("white"))
        time_item.setFont(QFont("Microsoft YaHei", 9))
        time_item.setPos(8, 32)

        # 名称
        name = version.get("name", "") or "未命名"
        if len(name) > 18:
            name = name[:17] + "…"
        name_item = QGraphicsTextItem(name, self)
        name_item.setDefaultTextColor(QColor("white"))
        name_item.setFont(QFont("Microsoft YaHei", 9))
        name_item.setPos(8, 52)


def _make_arrow(from_x: float, from_y: float,
                to_x: float, to_y: float) -> QGraphicsPolygonItem:
    """构造一条从 (from_x, from_y) 到 (to_x, to_y) 的箭头多边形。"""
    # 主线
    line = QGraphicsLineItem(from_x, from_y, to_x, to_y)
    line.setPen(QPen(QColor(_COLOR_ARROW), 2))
    line.setZValue(1)
    # 箭头头部（三角形）
    head_size = 8
    head = QPolygonF([
        QPointF(to_x, to_y),
        QPointF(to_x - head_size, to_y - head_size / 2),
        QPointF(to_x - head_size, to_y + head_size / 2),
    ])
    head_item = QGraphicsPolygonItem(head)
    head_item.setBrush(QBrush(QColor(_COLOR_ARROW)))
    head_item.setPen(QPen(QColor(_COLOR_ARROW), 1))
    head_item.setZValue(1)
    # 将箭头头部作为子项挂在线条上，便于统一管理
    head_item.setParentItem(line)
    return line


class VersionTimelineDialog(QDialog):
    """N7: 版本时间线可视化对话框。"""

    version_selected = pyqtSignal(str)

    def __init__(self, ceshu_manager: CeshuManager | None,
                 library: str, current_ceshu_id: str = "",
                 parent: QWidget | None = None) -> None:
        """初始化版本时间线对话框。

        Args:
            ceshu_manager: CeshuManager 实例。
            library: 库名。
            current_ceshu_id: 当前策划书 ID（用于定位版本链根）。
            parent: 父控件。
        """
        super().__init__(parent)
        self._manager = ceshu_manager
        self._library = library
        self._current_ceshu_id = current_ceshu_id
        self._versions: list[dict] = []
        self._node_items: dict[str, _VersionNodeItem] = {}
        self._selected_ceshu_id: str = ""
        self._setup_ui()
        self._apply_theme()
        self._load_versions()

    def _setup_ui(self) -> None:
        """搭建对话框界面。"""
        self.setWindowTitle("N7 版本时间线")
        self.setMinimumSize(QSize(900, 540))
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        layout.addWidget(self._build_header())
        layout.addWidget(self._build_legend())
        layout.addWidget(self._build_graph_view(), 1)
        layout.addWidget(self._build_detail_panel())
        layout.addLayout(self._build_bottom_buttons())

    def _build_header(self) -> QWidget:
        """构建标题与提示。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        title = QLabel("🕒 版本时间线")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; background: transparent;")
        v.addWidget(title)

        hint = QLabel("横向时间线展示同版本链下的所有版本。绿色=激活，蓝色=主策划，灰蓝=子版本。")
        hint.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        v.addWidget(hint)
        return container

    def _build_legend(self) -> QWidget:
        """构建颜色图例行。"""
        row = QWidget()
        h = QHBoxLayout(row)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(16)
        for color, label in [
            (_COLOR_ACTIVE, "● 激活版本"),
            (_COLOR_MAIN, "● 主策划"),
            (_COLOR_SUB, "● 子版本"),
            (_COLOR_ARROW, "→ 父→子派生"),
        ]:
            lbl = QLabel(
                f"<span style='color:{color};font-size:14px;'>●</span> "
                f"<span style='font-size:11px;'>{label}</span>"
            )
            lbl.setTextFormat(Qt.TextFormat.RichText)
            lbl.setStyleSheet("border: none; background: transparent;")
            h.addWidget(lbl)
        h.addStretch()
        return row

    def _build_graph_view(self) -> QGraphicsView:
        """构建 QGraphicsView 与空场景。"""
        self._scene = QGraphicsScene(self)
        self._scene.selectionChanged.connect(self._on_scene_selection_changed)
        self._view = QGraphicsView(self._scene)
        self._view.setRenderHint(QPainter.RenderHint.Antialiasing)
        self._view.setBackgroundBrush(QBrush(QColor(theme_color("input_bg") or "#1e1e1e")))
        self._view.setStyleSheet(f"""
            QGraphicsView {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        self._view.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        return self._view

    def _build_detail_panel(self) -> QWidget:
        """构建底部版本详情面板（点击节点后展示 version_note + 进度）。"""
        panel = QWidget()
        v = QVBoxLayout(panel)
        v.setContentsMargins(8, 8, 8, 8)
        v.setSpacing(4)
        panel.setStyleSheet(f"""
            QWidget {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)

        self._detail_title = QLabel("版本详情")
        self._detail_title.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        self._detail_title.setStyleSheet("border: none; background: transparent;")
        v.addWidget(self._detail_title)

        self._detail_label = QLabel("（点击时间线上的节点查看版本详情）")
        self._detail_label.setWordWrap(True)
        self._detail_label.setStyleSheet("border: none; background: transparent;")
        v.addWidget(self._detail_label)
        return panel

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行：切换到此版本 + 关闭。"""
        row = QHBoxLayout()
        row.addStretch()

        self._btn_switch = QPushButton("切换到此版本")
        self._btn_switch.setEnabled(False)
        self._btn_switch.clicked.connect(self._on_switch_version)
        row.addWidget(self._btn_switch)

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.reject)
        row.addWidget(self._btn_close)
        return row

    def _apply_theme(self) -> None:
        """应用主题样式。"""
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
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

    # ── 数据加载与渲染 ──

    def _load_versions(self) -> None:
        """加载同版本链下的所有版本并绘制时间线。"""
        if not self._manager or not self._current_ceshu_id:
            return
        try:
            cur = self._manager.get_ceshu(self._current_ceshu_id, self._library)
            root_id = cur.parent_id or cur.ceshu_id
            self._versions = self._manager.list_versions(self._library, root_id)
        except Exception as e:
            QMessageBox.warning(self, "加载版本", f"加载版本列表失败: {e}")
            return
        self._draw_timeline()

    def _draw_timeline(self) -> None:
        """在场景中绘制时间线节点与箭头。"""
        self._scene.clear()
        self._node_items.clear()
        if not self._versions:
            hint = self._scene.addText(
                "（无版本数据）",
                QFont("Microsoft YaHei", 11),
            )
            hint.setDefaultTextColor(QColor(theme_color("hint") or "#888"))
            return

        # 计算时间线宽度
        n = len(self._versions)
        total_w = n * _NODE_W + (n - 1) * _NODE_GAP
        self._scene.setSceneRect(0, 0, max(total_w + 40, 880), 240)

        # 时间线主轴
        axis_y = _NODE_Y + _NODE_H / 2
        axis = QGraphicsLineItem(20, axis_y, total_w + 20, axis_y)
        axis.setPen(QPen(QColor(_COLOR_ARROW), 2, Qt.PenStyle.DashLine))
        axis.setZValue(0)
        self._scene.addItem(axis)

        # 节点 + 箭头
        prev_x: float | None = None
        for i, v in enumerate(self._versions):
            x = 20 + i * (_NODE_W + _NODE_GAP)
            y = _NODE_Y
            is_main = (i == 0)  # list_versions 第一个即根策划
            node = _VersionNodeItem(v, x, y, is_main=is_main)
            self._scene.addItem(node)
            cid = v.get("ceshu_id", "")
            if cid:
                self._node_items[cid] = node
            # 父→子箭头
            if prev_x is not None:
                arrow = _make_arrow(
                    prev_x + _NODE_W, axis_y,
                    x, axis_y,
                )
                self._scene.addItem(arrow)
            prev_x = x

        # 选中场景首个节点（默认激活版本若有则优先）
        default_id = self._current_ceshu_id
        for v in self._versions:
            if v.get("is_active"):
                default_id = v.get("ceshu_id", default_id)
                break
        if default_id and default_id in self._node_items:
            self._select_node(default_id)

    def _select_node(self, ceshu_id: str) -> None:
        """选中指定节点并刷新详情面板。"""
        # 取消之前的高亮
        for node in self._node_items.values():
            cur_pen = node.pen()
            node.setPen(QPen(cur_pen.color(), 2))
        # 高亮当前
        node = self._node_items.get(ceshu_id)
        if node is None:
            return
        node.setPen(QPen(QColor(_COLOR_SELECTED), 3))
        node.setSelected(True)
        self._selected_ceshu_id = ceshu_id

        # 查找版本数据
        vinfo = next((v for v in self._versions if v.get("ceshu_id") == ceshu_id), None)
        if vinfo is None:
            return
        self._detail_title.setText(
            f"版本详情：{vinfo.get('version_label', 'v?')}"
            + ("（激活版本）" if vinfo.get("is_active") else "")
        )
        note = vinfo.get("version_note", "") or "(无版本说明)"
        updated = vinfo.get("updated_at", "") or vinfo.get("created_at", "") or "(无)"
        progress = vinfo.get("progress", 0)
        try:
            progress_pct = int(float(progress) * 100)
        except Exception:
            progress_pct = 0
        self._detail_label.setText(
            f"版本号: {vinfo.get('version_label', 'v?')}\n"
            f"名称: {vinfo.get('name', '未命名')}\n"
            f"更新时间: {updated}\n"
            f"完成进度: {progress_pct}%\n"
            f"版本说明: {note}"
        )
        self._btn_switch.setEnabled(bool(ceshu_id))

    def mousePressEvent(self, event) -> None:  # noqa: N802 (Qt 命名)
        """重写鼠标按下事件，不直接处理场景点击；点击交给 sceneSelectionChanged。"""
        super().mousePressEvent(event)

    # ── 事件回调 ──

    def _on_scene_selection_changed(self) -> None:
        """场景选中变化时刷新选中节点高亮与详情面板。"""
        selected = self._scene.selectedItems()
        if not selected:
            return
        item = selected[0]
        if isinstance(item, _VersionNodeItem):
            cid = item._version.get("ceshu_id", "")
            if cid:
                self._select_node(cid)

    def keyPressEvent(self, event) -> None:  # noqa: N802 (Qt 命名)
        """Esc 关闭对话框，其它按键交由默认处理。"""
        if event.key() == Qt.Key.Key_Escape:
            self.reject()
            return
        super().keyPressEvent(event)

    def _on_switch_version(self) -> None:
        """切换到当前选中的版本（发射 version_selected 信号）。"""
        if not self._selected_ceshu_id:
            return
        self.version_selected.emit(self._selected_ceshu_id)
        self.accept()

    # 供外部测试 / 自动化访问
    def selected_ceshu_id(self) -> str:
        """返回当前选中的策划书 ID。"""
        return self._selected_ceshu_id

    def versions(self) -> list[dict]:
        """返回当前已加载的版本列表（浅拷贝）。"""
        return [dict(v) for v in self._versions]
