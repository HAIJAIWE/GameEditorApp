"""启动模式选择对话框"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QRadioButton,
    QVBoxLayout,
)

from ui.themes import theme_color


class StartupModeDialog(QDialog):
    """启动模式选择对话框"""

    EDITOR_ONLY_MODE = "纯编辑器"
    CESHU_EDITOR_MODE = "策划案编辑器"

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 11))
        self.setWindowTitle("选择工作模式")
        self.setMinimumSize(480, 360)
        self.selected_mode = self.CESHU_EDITOR_MODE

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(24, 24, 24, 24)

        title = QLabel("🎮 欢迎使用游戏数据工坊")
        title_font = QFont()
        title_font.setPointSize(14)
        title_font.setBold(True)
        title.setFont(title_font)
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        hint = QLabel("请选择您的工作模式：")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(hint)

        self.button_group = QButtonGroup(self)

        # 纯编辑器模式选项
        mode1_frame = QFrame()
        mode1_frame.setFrameStyle(QFrame.Shape.StyledPanel | QFrame.Shadow.Raised)
        mode1_layout = QVBoxLayout(mode1_frame)
        mode1_layout.setContentsMargins(12, 12, 12, 12)

        self.editor_only_option = QRadioButton(" 纯编辑器模式")
        bold_font = QFont()
        bold_font.setPointSize(11)
        bold_font.setBold(True)
        self.editor_only_option.setFont(bold_font)
        mode1_layout.addWidget(self.editor_only_option)

        mode1_desc = QLabel(
            "直接使用编辑器管理游戏数据（技能、角色、怪物等）。\n"
            "适合已有策划案或需要快速录入数据的场景。"
        )
        mode1_desc.setWordWrap(True)
        mode1_desc.setStyleSheet(f"color: {theme_color('hint')}; margin-left: 20px;")
        mode1_layout.addWidget(mode1_desc)

        layout.addWidget(mode1_frame)
        self.button_group.addButton(self.editor_only_option, 0)

        # 策划案+编辑器模式选项
        mode2_frame = QFrame()
        mode2_frame.setFrameStyle(QFrame.Shape.StyledPanel | QFrame.Shadow.Raised)
        mode2_layout = QVBoxLayout(mode2_frame)
        mode2_layout.setContentsMargins(12, 12, 12, 12)

        self.ceshu_editor_option = QRadioButton(" 策划案 + 编辑器模式")
        self.ceshu_editor_option.setFont(bold_font)
        self.ceshu_editor_option.setChecked(True)
        mode2_layout.addWidget(self.ceshu_editor_option)

        mode2_desc = QLabel(
            "先编写/导入游戏策划方案，再基于策划信息生成数据。\n"
            "AI 会参考策划案内容，生成更贴合世界观的数据。"
        )
        mode2_desc.setWordWrap(True)
        mode2_desc.setStyleSheet(f"color: {theme_color('hint')}; margin-left: 20px;")
        mode2_layout.addWidget(mode2_desc)

        layout.addWidget(mode2_frame)
        self.button_group.addButton(self.ceshu_editor_option, 1)

        # 记住选择复选框
        self.remember_choice = QCheckBox("记住我的选择（下次不再提示）")
        layout.addWidget(self.remember_choice)

        # 底部按钮
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        confirm_btn = QPushButton("开始使用")
        confirm_btn.setMinimumWidth(120)
        confirm_btn.clicked.connect(self._on_confirm)
        btn_layout.addWidget(confirm_btn)

        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self._on_cancel)
        btn_layout.addWidget(cancel_btn)

        layout.addLayout(btn_layout)

    def show_dialog(self, callback):
        """以非模态方式显示，点击按钮后执行回调"""
        self._callback = callback
        self.show()
        self.activateWindow()
        self.raise_()

    def _on_confirm(self):
        if self.editor_only_option.isChecked():
            self.selected_mode = self.EDITOR_ONLY_MODE
        else:
            self.selected_mode = self.CESHU_EDITOR_MODE
        self.close()
        if hasattr(self, '_callback'):
            self._callback(self.selected_mode, self.is_remember())

    def _on_cancel(self):
        self.selected_mode = self.CESHU_EDITOR_MODE
        self.close()
        if hasattr(self, '_callback'):
            self._callback(self.selected_mode, False)

    def get_selected_mode(self):
        return self.selected_mode

    def is_remember(self):
        return self.remember_choice.isChecked()
