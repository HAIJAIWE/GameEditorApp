"""策划书各章表单组件 — 每章一个 QWidget 子类，用 QFormLayout 组织字段

接入8主题 + 补全所有表单的 set_data() 方法
"""
from __future__ import annotations

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtGui import QTextCursor
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QSpinBox,
    QTextEdit,
    QWidget,
)

from ..ai_field_button import AIFieldButton
from ..ceshu_theme import ceshu_form_input_qss, ceshu_form_label_qss, theme_color


class RefTextEdit(QTextEdit):
    """支持 @data[...] 引用高亮的多行文本输入框"""

    ref_clicked = pyqtSignal(str)  # full_path

    def __init__(self, placeholder="", height=60, data_manager=None, parent=None):
        super().__init__(parent)
        self.setPlaceholderText(placeholder)
        self.setMaximumHeight(height)
        self.setStyleSheet(ceshu_form_input_qss())
        self._data_manager = data_manager
        self.textChanged.connect(self._highlight_refs)
        self._highlighting = False

    def set_data_manager(self, dm):
        self._data_manager = dm

    def _highlight_refs(self):
        """实时高亮 @data[...] 引用"""
        if self._highlighting:
            return
        self._highlighting = True
        try:
            cursor = self.textCursor()
            scroll_pos = self.verticalScrollBar().value() if self.verticalScrollBar() else 0

            # 保存选区
            sel_start = cursor.selectionStart()
            sel_end = cursor.selectionEnd()

            text = self.toPlainText()
            import re
            # 清除所有额外格式
            self.setPlainText(text)

            # 重新高亮所有 @data[...]
            for match in re.finditer(r'@data\[([^\]]+)\]', text):
                c = self.textCursor()
                c.setPosition(match.start())
                c.setPosition(match.end(), QTextCursor.MoveMode.KeepAnchor)
                fmt = c.charFormat()
                # P7: 使用主题色（替代硬编码 darkBlue），与主题切换同步
                from PyQt6.QtGui import QColor
                accent = theme_color('accent')
                fmt.setForeground(QColor(accent if accent else "#4f8cf7"))
                fmt.setFontWeight(700)  # Bold
                c.mergeCharFormat(fmt)

            # 恢复选区
            if sel_start >= 0 and sel_end >= 0 and sel_end <= len(text):
                c = self.textCursor()
                c.setPosition(sel_start)
                c.setPosition(sel_end, QTextCursor.MoveMode.KeepAnchor)
                self.setTextCursor(c)

            if self.verticalScrollBar():
                self.verticalScrollBar().setValue(scroll_pos)
        finally:
            self._highlighting = False

    def mouseReleaseEvent(self, event):
        """检测 @data[...] 点击"""
        super().mouseReleaseEvent(event)
        cursor = self.cursorForPosition(event.position().toPoint())
        cursor.select(QTextCursor.SelectionType.WordUnderCursor)
        text = cursor.selectedText()

        import re
        match = re.search(r'@data\[([^\]]+)\]', text)
        if match:
            self.ref_clicked.emit(match.group(1))
        elif text:
            # 检查是否在 @data[...] 内部被点击
            full_text = self.toPlainText()
            pos = cursor.position()
            for m in re.finditer(r'@data\[([^\]]+)\]', full_text):
                if m.start() <= pos <= m.end():
                    self.ref_clicked.emit(m.group(1))
                    break


# === 通用工具 ===

def _add_row(form: QFormLayout, label: str, widget: QWidget, ai_path: str = "") -> None:
    """添加表单行，可选AI填充按钮

    F1 增强：若传入 ai_path，给 widget 设置动态属性 `ai_field_path`，
    供 apply_ai_content_to_form() 定位字段回填 AI 生成内容。
    """
    label_w = QLabel(label)
    label_w.setStyleSheet(ceshu_form_label_qss())
    if ai_path:
        # F1: 给 widget 打标记，便于后续 AI 回填定位
        widget.setProperty("ai_field_path", ai_path)
        row = QWidget()
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(0, 0, 0, 0)
        row_layout.addWidget(widget, 1)
        btn = AIFieldButton(ai_path)
        btn.ai_fill_requested.connect(lambda fp=ai_path: _on_ai_fill(form, fp))
        row_layout.addWidget(btn)
        form.addRow(label_w, row)
    else:
        form.addRow(label_w, widget)


def _on_ai_fill(form: QFormLayout, field_path: str) -> None:
    """AI填充回调 — 信号转发到父级"""
    parent = form.parentWidget()
    while parent:
        if hasattr(parent, 'ai_fill_requested'):
            parent.ai_fill_requested.emit(field_path)
            break
        parent = parent.parentWidget()


def apply_ai_content_to_form(form: QWidget, field_path: str, content: str) -> bool:
    """F1: 把 AI 生成的内容回填到表单中指定字段对应的 widget

    通过 widget 的 `ai_field_path` 动态属性定位目标控件，
    根据控件类型（QLineEdit/QTextEdit/QComboBox/QSpinBox/QCheckBox）填入内容。

    Args:
        form: 章节表单实例（ChapterMetaForm 等）
        field_path: 字段路径（如 "meta.game_name"）
        content: AI 生成的内容字符串

    Returns:
        True 如果成功回填；False 如果未找到字段或类型不匹配
    """
    if not form or not field_path or content is None:
        return False
    target = None
    # 优先通过动态属性精确匹配
    for child in form.findChildren(QWidget):
        if child.property("ai_field_path") == field_path:
            target = child
            break
    if target is None:
        return False
    try:
        if isinstance(target, QLineEdit):
            target.setText(str(content).strip())
            return True
        elif isinstance(target, QTextEdit):
            target.setPlainText(str(content).strip())
            return True
        elif isinstance(target, QComboBox):
            text = str(content).strip()
            idx = target.findText(text)
            if idx >= 0:
                target.setCurrentIndex(idx)
            else:
                target.setCurrentText(text)
            return True
        elif isinstance(target, QSpinBox):
            try:
                target.setValue(int(str(content).strip()))
                return True
            except (ValueError, TypeError):
                return False
        elif isinstance(target, QCheckBox):
            text = str(content).strip().lower()
            target.setChecked(text in ("true", "1", "yes", "enabled", "是", "开"))
            return True
    except Exception:
        return False
    return False


def _text_field(placeholder: str = "", height: int = 60, data_manager=None) -> RefTextEdit:
    """创建支持数据引用的多行文本输入"""
    w = RefTextEdit(placeholder, height, data_manager)
    return w


def _line_field(placeholder: str = "") -> QLineEdit:
    w = QLineEdit()
    w.setPlaceholderText(placeholder)
    w.setStyleSheet(ceshu_form_input_qss())
    return w


def _combo(items: list, current: str = "") -> QComboBox:
    w = QComboBox()
    w.addItems(items)
    if current:
        w.setCurrentText(current)
    w.setStyleSheet(ceshu_form_input_qss())
    return w
