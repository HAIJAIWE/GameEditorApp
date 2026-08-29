from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFontMetrics
from PyQt6.QtWidgets import QDialog, QHBoxLayout, QLabel, QLineEdit, QPushButton, QVBoxLayout

AT_LEAST_CHARS = 20
MAX_CHARS = 80


def _char_width(line_edit):
    fm = QFontMetrics(line_edit.font())
    return fm.horizontalAdvance('X') + 1


def _calc_min_chars(text, default_chars=AT_LEAST_CHARS):
    visible = len(text) if text else 0
    return max(default_chars, min(visible + 4, MAX_CHARS))


def show_text_input_dialog(parent, title, prompt, default_text="", placeholder=""):
    dialog = QDialog(parent)
    dialog.setWindowTitle(title)
    dialog.setWindowFlags(dialog.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

    layout = QVBoxLayout(dialog)
    layout.setSpacing(8)
    layout.setContentsMargins(16, 12, 16, 12)

    label = QLabel(prompt)
    label.setWordWrap(True)
    layout.addWidget(label)

    line_edit = QLineEdit()
    if default_text:
        line_edit.setText(default_text)
    if placeholder:
        line_edit.setPlaceholderText(placeholder)
    line_edit.selectAll()

    target_chars = _calc_min_chars(default_text)
    min_width = target_chars * _char_width(line_edit)
    line_edit.setMinimumWidth(min_width)
    layout.addWidget(line_edit)

    btn_layout = QHBoxLayout()
    btn_layout.addStretch()
    cancel_btn = QPushButton("取消")
    cancel_btn.clicked.connect(dialog.reject)
    btn_layout.addWidget(cancel_btn)
    ok_btn = QPushButton("确定")
    ok_btn.clicked.connect(dialog.accept)
    ok_btn.setDefault(True)
    btn_layout.addWidget(ok_btn)
    layout.addLayout(btn_layout)

    dialog.adjustSize()
    dialog.setMinimumWidth(220)

    if dialog.exec() != QDialog.DialogCode.Accepted:
        return "", False
    return line_edit.text().strip(), True
