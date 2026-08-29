from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPushButton, QWidget

from ui.themes import theme_color

MODEL_OPTIONS = {
    "OpenAI": ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "gpt-4o"],
    "Qwen": ["qwen-turbo", "qwen-plus", "qwen-max"],
    "豆包": ["ep-20240415173540-k8j54"],
}

PROVIDER_ICONS = {"OpenAI": "⚡", "Qwen": "☁️", "豆包": "🔥"}
PROVIDER_COLORS = {"OpenAI": "#10a37f", "Qwen": "#615ced", "豆包": "#ff6b35"}


class ModelSelectorWidget(QWidget):
    provider_changed = pyqtSignal(str)
    model_changed = pyqtSignal(str)

    def __init__(self, config, parent=None):
        super().__init__(parent)
        self._config = config
        self._current_provider = config.provider
        self._current_model = config.model
        self._expanded = None
        self._dropdown_frame = None
        self.setup_ui()

    def setup_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 2, 0, 2)
        layout.setSpacing(6)

        label = QLabel("模型")
        label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px;")
        layout.addWidget(label)

        self._provider_btn = QPushButton()
        self._provider_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._provider_btn.clicked.connect(lambda: self._show_provider_dropdown())
        layout.addWidget(self._provider_btn)

        sep = QLabel("·")
        sep.setStyleSheet(f"color: {theme_color('border')}; font-size: 11px; margin: 0 2px;")
        layout.addWidget(sep)

        self._model_btn = QPushButton()
        self._model_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._model_btn.clicked.connect(lambda: self._show_model_dropdown())
        layout.addWidget(self._model_btn)

        layout.addStretch()
        self._refresh_buttons()

    def _refresh_buttons(self):
        p = self._current_provider
        m = self._current_model
        icon = PROVIDER_ICONS.get(p, "")
        color = PROVIDER_COLORS.get(p, "#8b949e")

        self._provider_btn.setText(f"{icon} {p}")
        self._provider_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {color};
                border: none;
                padding: 2px 6px;
                font-size: 11px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {color}22;
                border-radius: 4px;
            }}
        """)
        self._model_btn.setText(f"{m} ▾")
        self._model_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme_color('hint')};
                border: none;
                padding: 2px 6px;
                font-size: 11px;
            }}
            QPushButton:hover {{
                color: {theme_color('fg')};
                background: {theme_color('input_bg')};
                border-radius: 4px;
            }}
        """)

    def _show_provider_dropdown(self):
        self._hide_dropdown()
        self._expanded = "provider"
        self._dropdown_frame = QFrame()
        self._dropdown_frame.setWindowFlags(Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        layout = QHBoxLayout(self._dropdown_frame)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)
        self._dropdown_frame.setStyleSheet(f"""
            QFrame {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
            }}
        """)

        for provider in MODEL_OPTIONS:
            btn = QPushButton(f"{PROVIDER_ICONS.get(provider, '')} {provider}")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            color = PROVIDER_COLORS.get(provider, "#8b949e")
            is_current = (provider == self._current_provider)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('accent_bg') if is_current else 'transparent'};
                    color: {color};
                    border: {"1px solid " + color if is_current else "1px solid transparent"};
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 12px;
                    font-weight: {"bold" if is_current else "normal"};
                }}
                QPushButton:hover {{
                    background: {color}22;
                    border: 1px solid {color};
                }}
            """)

            def make_handler(p):
                return lambda: self._on_provider_selected(p)
            btn.clicked.connect(make_handler(provider))
            layout.addWidget(btn)

        self._dropdown_frame.adjustSize()
        pos = self._provider_btn.mapToGlobal(self._provider_btn.rect().bottomLeft())
        self._dropdown_frame.move(pos)
        self._dropdown_frame.show()

    def _show_model_dropdown(self):
        self._hide_dropdown()
        models = MODEL_OPTIONS.get(self._current_provider, [])
        if not models:
            return
        self._expanded = "model"
        self._dropdown_frame = QFrame()
        self._dropdown_frame.setWindowFlags(Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        layout = QHBoxLayout(self._dropdown_frame)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)
        self._dropdown_frame.setStyleSheet(f"""
            QFrame {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
            }}
        """)

        for model in models:
            btn = QPushButton(model)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            is_current = (model == self._current_model)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {theme_color('accent_bg') if is_current else 'transparent'};
                    color: {theme_color('fg') if is_current else theme_color('hint')};
                    border: {"1px solid " + theme_color('accent') if is_current else "1px solid transparent"};
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 12px;
                }}
                QPushButton:hover {{
                    background: {theme_color('input_bg')};
                    border: 1px solid {theme_color('accent')};
                    color: {theme_color('fg')};
                }}
            """)

            def make_handler(m):
                return lambda: self._on_model_selected(m)
            btn.clicked.connect(make_handler(model))
            layout.addWidget(btn)

        self._dropdown_frame.adjustSize()
        pos = self._model_btn.mapToGlobal(self._model_btn.rect().bottomLeft())
        self._dropdown_frame.move(pos)
        self._dropdown_frame.show()

    def _on_provider_selected(self, provider: str):
        self._hide_dropdown()
        if provider != self._current_provider:
            self._current_provider = provider
            models = MODEL_OPTIONS.get(provider, [])
            self._current_model = models[0] if models else ""
            self.provider_changed.emit(provider)
            self.model_changed.emit(self._current_model)
        self._refresh_buttons()

    def _on_model_selected(self, model: str):
        self._hide_dropdown()
        if model != self._current_model:
            self._current_model = model
            self.model_changed.emit(model)
        self._refresh_buttons()

    def _hide_dropdown(self):
        self._expanded = None
        if self._dropdown_frame:
            self._dropdown_frame.hide()
            self._dropdown_frame.deleteLater()
            self._dropdown_frame = None

    def get_current(self):
        return self._current_provider, self._current_model
