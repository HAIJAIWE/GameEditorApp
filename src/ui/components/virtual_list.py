"""虚拟列表组件 - 基于 QAbstractListModel 的真正虚拟化列表"""

from PyQt6.QtCore import QAbstractListModel, QModelIndex, QRect, QSize, Qt, pyqtSignal
from PyQt6.QtGui import QColor, QFont, QPainter
from PyQt6.QtWidgets import QAbstractItemView, QListView, QMenu, QStyle, QStyledItemDelegate

from ui.themes import theme_color


class ListModel(QAbstractListModel):
    """模型驱动列表 - 只按需提供数据"""

    def __init__(self, data=None, display_func=None, search_fields=None):
        super().__init__()
        self._data = data or []
        self._display_func = display_func
        self._search_fields = search_fields or ['name', 'desc', 'id']
        self._filtered = []

    def set_data(self, data):
        self.beginResetModel()
        self._data = data
        self._filtered = list(data)
        self.endResetModel()

    def set_display_func(self, func):
        self._display_func = func

    def rowCount(self, parent=QModelIndex()):
        return len(self._filtered)

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        if not index.isValid() or index.row() >= len(self._filtered):
            return None
        item = self._filtered[index.row()]
        if role == Qt.ItemDataRole.DisplayRole:
            return self._display_func(item) if self._display_func else str(item)
        if role == Qt.ItemDataRole.UserRole:
            return item
        return None

    def get_raw(self, row):
        return self._filtered[row] if 0 <= row < len(self._filtered) else None

    def set_filter(self, query: str):
        self.beginResetModel()
        q = query.strip().lower()
        if not q:
            self._filtered = list(self._data)
        else:
            terms = q.split()
            self._filtered = []
            for item in self._data:
                text_parts = []
                for field in self._search_fields:
                    if field in item:
                        val = item[field]
                        if isinstance(val, str):
                            text_parts.append(val)
                search_text = ' '.join(text_parts).lower()
                if all(t in search_text for t in terms):
                    self._filtered.append(item)
        self.endResetModel()

    def apply_order(self, ordered):
        """应用拖拽后的新顺序到原始数据"""
        self.beginResetModel()
        id_map = {str(i): i for i in self._data}
        self._data = [id_map[str(o)] for o in ordered if str(o) in id_map]
        self._filtered = list(self._data)
        self.endResetModel()


class VirtualListItemDelegate(QStyledItemDelegate):
    """自定义列表项代理"""

    def __init__(self, parent=None, item_height=40):
        super().__init__(parent)
        self.item_height = item_height

    def sizeHint(self, option, index):
        return QSize(option.rect.width(), self.item_height)

    def paint(self, painter, option, index):
        painter.save()
        self.parent().style().drawControl(
            QStyle.ControlElement.CE_ItemViewItem, option, painter, self.parent()
        )
        if option.state & QStyle.StateFlag.State_Selected:
            text_color = option.palette.highlightedText().color()
        else:
            text_color = option.palette.text().color()
        painter.setPen(text_color)
        font = QFont("Microsoft YaHei", 9)
        painter.setFont(font)
        text = index.data(Qt.ItemDataRole.DisplayRole)
        if text:
            r = option.rect
            text_rect = QRect(r.left() + 8, r.top(), r.width() - 16, r.height())
            painter.drawText(text_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter, text)
        painter.restore()


class VirtualListWidget(QListView):
    """真正虚拟化列表 - 只渲染可见行，适合大数据量"""

    item_selected = pyqtSignal(object)
    item_double_clicked = pyqtSignal(object)
    context_menu_requested = pyqtSignal(object, str)
    items_reordered = pyqtSignal(list)
    rename_requested = pyqtSignal(object)

    def __init__(self, parent=None, item_height=40):
        super().__init__(parent)
        self.item_height = item_height
        self._model = ListModel(display_func=self._default_display)
        self.setModel(self._model)
        self._display_func = None
        # P4-13: 空状态提示文本
        self._empty_text = "暂无数据"

        delegate = VirtualListItemDelegate(self, item_height)
        self.setItemDelegate(delegate)

        self.setUniformItemSizes(True)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)

        self.clicked.connect(self._on_clicked)
        self.doubleClicked.connect(self._on_double_clicked)

    def set_empty_text(self, text: str):
        """P4-13: 设置空状态提示文本"""
        self._empty_text = text
        self.update()

    def paintEvent(self, event):
        """P4-13: 数据为空时绘制空状态提示"""
        super().paintEvent(event)
        if self._model.rowCount() == 0 and self._empty_text:
            painter = QPainter(self.viewport())
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            hint_color = QColor(theme_color('hint') or "#888888")
            painter.setPen(hint_color)
            font = QFont()
            font.setPointSize(11)
            painter.setFont(font)
            rect = self.viewport().rect()
            painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, self._empty_text)
            painter.end()

    def _default_display(self, item):
        return str(item)

    def set_display_function(self, func):
        self._display_func = func
        self._model.set_display_func(func)

    def set_data(self, data):
        self._model.set_data(data)

    def set_search_query(self, query):
        self._model.set_filter(query)

    def select_item_by_index(self, index):
        if 0 <= index < self._model.rowCount():
            self.setCurrentIndex(self._model.index(index, 0))
            # 程序化选择也要发射 item_selected 信号
            item = self._model.get_raw(index)
            if item is not None:
                self.item_selected.emit(item)

    def clear_selection(self):
        self.clearSelection()

    def get_selected_item(self):
        idx = self.currentIndex()
        return self._model.get_raw(idx.row()) if idx.isValid() else None

    def enable_drag_drop(self, enabled=True):
        self.setDragDropMode(
            QAbstractItemView.DragDropMode.InternalMove if enabled
            else QAbstractItemView.DragDropMode.NoDragDrop
        )
        self.setDragEnabled(enabled)
        self.setAcceptDrops(enabled)
        self.setDropIndicatorShown(enabled)

    def enable_multi_select(self, enabled=True):
        self.setSelectionMode(
            QAbstractItemView.SelectionMode.ExtendedSelection if enabled
            else QAbstractItemView.SelectionMode.SingleSelection
        )

    def get_item_count(self):
        return self._model.rowCount()

    def _on_clicked(self, index):
        item = self._model.get_raw(index.row())
        if item is not None:
            self.item_selected.emit(item)

    def _on_double_clicked(self, index):
        item = self._model.get_raw(index.row())
        if item is not None:
            self.item_double_clicked.emit(item)

    def _show_context_menu(self, pos):
        index = self.indexAt(pos)
        if not index.isValid():
            return
        item = self._model.get_raw(index.row())
        if item is None:
            return

        menu = QMenu(self)
        rename_action = menu.addAction("重命名")
        edit_action = menu.addAction("编辑")
        copy_action = menu.addAction("复制")
        delete_action = menu.addAction("删除")

        action = menu.exec(self.mapToGlobal(pos))
        if action == rename_action:
            self.rename_requested.emit(item)
        elif action == edit_action:
            self.context_menu_requested.emit(item, "edit")
        elif action == copy_action:
            self.context_menu_requested.emit(item, "copy")
        elif action == delete_action:
            self.context_menu_requested.emit(item, "delete")

    def dropEvent(self, event):
        super().dropEvent(event)
        if self.dragDropMode() != QAbstractItemView.DragDropMode.NoDragDrop:
            ordered = []
            for row in range(self._model.rowCount()):
                item = self._model.get_raw(row)
                if item is not None:
                    ordered.append(item)
            if ordered:
                self._model.apply_order(ordered)
                self.items_reordered.emit(ordered)
