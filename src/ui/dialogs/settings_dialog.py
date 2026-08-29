"""统一设置对话框 - 集中管理所有应用设置"""

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QDoubleSpinBox,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from common.i18n import SUPPORTED_LOCALES, get_i18n
from ui.themes import THEMES, get_current_theme, theme_color


def _btn_style() -> str:
    a = theme_color('accent')
    ah = theme_color('accent_hover')
    c = theme_color('btn_text') or 'white'
    return (
        f"QPushButton {{ background:{a}; color:{c}; border:none; "
        f"border-radius:6px; padding:9px 22px; font-weight:700; }}"
        f"QPushButton:hover {{ background:{ah}; }}"
    )


def _input_style() -> str:
    bg = theme_color('input_bg')
    fg = theme_color('fg')
    bd = theme_color('border')
    ac = theme_color('accent')
    return (
        f"QLineEdit,QComboBox,QSpinBox,QDoubleSpinBox {{ "
        f"background:{bg}; color:{fg}; border:1.5px solid {bd}; "
        f"border-radius:6px; padding:8px 12px; }}"
        f"QLineEdit:focus,QComboBox:focus,QSpinBox:focus,QDoubleSpinBox:focus {{ "
        f"border-color:{ac}; }}"
    )


class SettingsDialog(QDialog):

    def __init__(self, parent=None, config=None):
        super().__init__(parent)
        self._config = config
        self._mw = parent
        self._modified = False
        self._collapsible_headers = []
        self._tool_buttons = []

        self.setWindowTitle("⚙ 设置")
        self.resize(680, 520)
        self.setMinimumSize(580, 440)
        self.setWindowModality(Qt.WindowModality.ApplicationModal)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)

        self._pages = QStackedWidget()
        self._setup_ui()
        self._load_current_values()
        self._apply_theme_styles()

    def _apply_theme_styles(self):
        bg = theme_color('bg')
        fg = theme_color('fg')
        bd = theme_color('border')
        dv = theme_color('divider')
        ac = theme_color('accent')
        al = theme_color('accent_light')
        ib = theme_color('input_bg')
        sc = theme_color('scroll')

        self.setStyleSheet(f"""
            QDialog {{ background:{bg}; }}
            QLabel {{ color:{fg}; }}
            QGroupBox {{
                color:{fg}; border:1.5px solid {bd}; border-radius:8px;
                margin-top:12px; padding-top:16px; font-weight:600;
            }}
            QGroupBox::title {{ color:{ac}; padding:0 10px; subcontrol-origin:margin; left:12px; }}
            {_input_style()}
            {_btn_style()}
            QPushButton:pressed {{ padding:10px 21px; }}
            QCheckBox {{ color:{fg}; spacing:8px; }}
            QCheckBox::indicator {{
                width:18px; height:18px; border-radius:4px;
            }}
            QCheckBox::indicator:unchecked {{
                background:{ib}; border:1.5px solid {sc};
            }}
            QCheckBox::indicator:checked {{
                background:{ac}; border:1.5px solid {ac};
            }}
            QScrollArea {{ background:transparent; border:none; }}
            QDialogButtonBox QPushButton {{
                min-width:80px;
            }}
        """)

        self._nav_list.setStyleSheet(f"""
            QListWidget {{
                background:{ib}; color:{fg};
                border:none; border-right:1px solid {bd}; font-size:13px;
            }}
            QListWidget::item {{
                padding:12px 16px; border-bottom:1px solid {dv};
            }}
            QListWidget::item:selected {{
                background:{al}; color:{ac}; font-weight:600;
            }}
            QListWidget::item:hover {{
                background:{al};
            }}
        """)

        self._update_tool_buttons_style()
        self._update_collapsible_styles()

    def _update_tool_buttons_style(self):
        bd = theme_color('border')
        ac = theme_color('accent')
        for btn in self._tool_buttons:
            btn.setStyleSheet(f"""
                QPushButton {{
                    text-align:left; padding:10px 14px;
                    border:1.5px solid {bd};
                    border-radius:6px; font-size:13px;
                    background:{theme_color('input_bg')}; color:{theme_color('fg')};
                }}
                QPushButton:hover {{
                    border-color:{ac}; background:{theme_color('accent_light')};
                }}
            """)

    def _update_collapsible_styles(self):
        bg = theme_color('bg')
        bd = theme_color('border')
        fg = theme_color('fg')
        ac = theme_color('accent')
        for hdr in self._collapsible_headers:
            hdr.setStyleSheet(f"""
                QPushButton {{
                    text-align:left; padding:8px 12px;
                    border:1.5px solid {bd}; border-radius:6px;
                    font-weight:bold; font-size:13px;
                    background:{bg}; color:{fg};
                }}
                QPushButton:hover {{ border-color:{ac}; }}
            """)

    def _setup_ui(self):
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)

        self._nav_list = QListWidget()
        self._nav_list.setFixedWidth(120)
        self._nav_list.setSpacing(0)
        self._nav_list.currentRowChanged.connect(self._pages.setCurrentIndex)

        self._nav_list.addItem("📋 通用")
        self._nav_list.addItem("🤖 AI 配置")
        self._nav_list.addItem("✏️ 编辑器")
        self._nav_list.addItem("🔧 工具")

        self._pages.addWidget(self._create_general_page())
        self._pages.addWidget(self._create_ai_page())
        self._pages.addWidget(self._create_editor_page())
        self._pages.addWidget(self._create_tools_page())

        self._nav_list.setCurrentRow(0)

        main_layout.addWidget(self._nav_list)

        right_panel = QVBoxLayout()
        right_panel.setContentsMargins(16, 12, 16, 12)

        page_scroll = QScrollArea()
        page_scroll.setWidgetResizable(True)
        page_scroll.setFrameShape(QFrame.Shape.NoFrame)
        page_scroll.setWidget(self._pages)

        right_panel.addWidget(page_scroll)

        btn_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btn_box.accepted.connect(self._on_accept)
        btn_box.rejected.connect(self.reject)
        right_panel.addWidget(btn_box)

        main_layout.addLayout(right_panel)

    def _create_general_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        group = QGroupBox("通用设置")
        form = QFormLayout(group)
        form.setSpacing(12)

        self._lang_combo = QComboBox()
        for locale_id, locale_name in SUPPORTED_LOCALES.items():
            self._lang_combo.addItem(locale_name, locale_id)
        self._lang_combo.currentIndexChanged.connect(lambda: self._mark_modified())
        form.addRow("语言:", self._lang_combo)

        self._theme_combo = QComboBox()
        self._theme_combo.addItems(list(THEMES.keys()))
        self._theme_combo.currentTextChanged.connect(self._preview_theme)
        form.addRow("主题:", self._theme_combo)

        auto_save_widget = QWidget()
        auto_save_layout = QHBoxLayout(auto_save_widget)
        auto_save_layout.setContentsMargins(0, 0, 0, 0)
        self._auto_save_check = QCheckBox("启用自动保存")
        self._auto_save_check.toggled.connect(self._on_auto_save_toggled)
        self._auto_save_check.toggled.connect(lambda _: self._mark_modified())
        auto_save_layout.addWidget(self._auto_save_check)
        auto_save_layout.addStretch()
        auto_save_layout.addWidget(QLabel("间隔:"))
        self._auto_save_spin = QSpinBox()
        self._auto_save_spin.setRange(1, 60)
        self._auto_save_spin.setSuffix(" 分钟")
        self._auto_save_spin.valueChanged.connect(lambda _: self._mark_modified())
        auto_save_layout.addWidget(self._auto_save_spin)
        form.addRow("自动保存:", auto_save_widget)

        self._confirm_delete_check = QCheckBox("删除时确认")
        self._confirm_delete_check.toggled.connect(lambda _: self._mark_modified())
        form.addRow("确认删除:", self._confirm_delete_check)

        layout.addWidget(group)
        layout.addStretch()
        return page

    def _create_ai_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        text_group = QGroupBox("文本模型")
        text_form = QFormLayout(text_group)
        text_form.setSpacing(8)

        self._txt_provider = self._make_provider_combo()
        text_form.addRow("服务商:", self._txt_provider)
        self._txt_api_key = self._make_password_input()
        text_form.addRow("API Key:", self._txt_api_key)
        self._txt_base_url = QLineEdit()
        self._txt_base_url.textChanged.connect(lambda: self._mark_modified())
        text_form.addRow("Base URL:", self._txt_base_url)
        self._txt_model = QLineEdit()
        self._txt_model.textChanged.connect(lambda: self._mark_modified())
        text_form.addRow("Model:", self._txt_model)
        self._txt_temperature = QDoubleSpinBox()
        self._txt_temperature.setRange(0, 2)
        self._txt_temperature.setSingleStep(0.1)
        self._txt_temperature.setDecimals(2)
        self._txt_temperature.valueChanged.connect(lambda _: self._mark_modified())
        text_form.addRow("Temperature:", self._txt_temperature)
        self._txt_max_tokens = QSpinBox()
        self._txt_max_tokens.setRange(1, 128000)
        self._txt_max_tokens.setSingleStep(100)
        self._txt_max_tokens.valueChanged.connect(lambda _: self._mark_modified())
        text_form.addRow("Max Tokens:", self._txt_max_tokens)

        self._txt_test_result = QLabel("")
        self._txt_test_result.setVisible(False)
        test_btn = QPushButton("测试连接")
        test_btn.clicked.connect(self._test_text_connection)
        test_hbox = QHBoxLayout()
        test_hbox.addWidget(test_btn)
        test_hbox.addWidget(self._txt_test_result)
        test_hbox.addStretch()
        text_form.addRow(test_hbox)

        layout.addWidget(text_group)

        vision_group = self._make_collapsible_group("视觉模型", self._create_vision_form)
        layout.addWidget(vision_group)

        image_group = self._make_collapsible_group("文生图", self._create_image_form)
        layout.addWidget(image_group)

        layout.addStretch()
        return page

    def _create_vision_form(self):
        self._vis_provider = self._make_provider_combo()
        self._vis_api_key = self._make_password_input()
        self._vis_base_url = QLineEdit()
        self._vis_base_url.textChanged.connect(lambda: self._mark_modified())
        self._vis_model = QLineEdit()
        self._vis_model.textChanged.connect(lambda: self._mark_modified())
        self._vis_temperature = QDoubleSpinBox()
        self._vis_temperature.setRange(0, 2)
        self._vis_temperature.setSingleStep(0.1)
        self._vis_temperature.setDecimals(2)
        self._vis_temperature.valueChanged.connect(lambda _: self._mark_modified())
        self._vis_max_tokens = QSpinBox()
        self._vis_max_tokens.setRange(1, 128000)
        self._vis_max_tokens.setSingleStep(100)
        self._vis_max_tokens.valueChanged.connect(lambda _: self._mark_modified())

        form = QFormLayout()
        form.setSpacing(8)
        form.addRow("服务商:", self._vis_provider)
        form.addRow("API Key:", self._vis_api_key)
        form.addRow("Base URL:", self._vis_base_url)
        form.addRow("Model:", self._vis_model)
        form.addRow("Temperature:", self._vis_temperature)
        form.addRow("Max Tokens:", self._vis_max_tokens)
        return form

    def _create_image_form(self):
        self._img_provider = self._make_provider_combo()
        self._img_api_key = self._make_password_input()
        self._img_base_url = QLineEdit()
        self._img_base_url.textChanged.connect(lambda: self._mark_modified())
        self._img_model = QLineEdit()
        self._img_model.textChanged.connect(lambda: self._mark_modified())

        form = QFormLayout()
        form.setSpacing(8)
        form.addRow("服务商:", self._img_provider)
        form.addRow("API Key:", self._img_api_key)
        form.addRow("Base URL:", self._img_base_url)
        form.addRow("Model:", self._img_model)
        return form

    def _make_collapsible_group(self, title, form_creator):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        header = QPushButton(f"▶ {title}")
        header.setCursor(Qt.CursorShape.PointingHandCursor)
        self._collapsible_headers.append(header)

        content = QWidget()
        content.setVisible(False)
        inner_layout = QVBoxLayout(content)
        inner_layout.setContentsMargins(8, 8, 8, 8)

        form_widget = QWidget()
        form_widget.setLayout(form_creator())
        inner_layout.addWidget(form_widget)

        def toggle():
            visible = content.isVisible()
            content.setVisible(not visible)
            header.setText(f"{'▼' if not visible else '▶'} {title}")

        header.clicked.connect(toggle)
        layout.addWidget(header)
        layout.addWidget(content)

        return container

    def _make_provider_combo(self):
        combo = QComboBox()
        combo.addItems(["OpenAI", "DeepSeek", "豆包", "Qwen", "Moonshot", "智谱", "百川", "自定义"])
        combo.currentTextChanged.connect(lambda: self._mark_modified())
        return combo

    def _make_password_input(self):
        line = QLineEdit()
        line.setEchoMode(QLineEdit.EchoMode.Password)
        line.textChanged.connect(lambda: self._mark_modified())
        return line

    def _create_editor_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        group = QGroupBox("编辑器设置")
        form = QFormLayout(group)
        form.setSpacing(12)

        self._layout_combo = QComboBox()
        self._layout_combo.addItem("三栏界面 (左列表/中预览/右对话)", "three_column")
        self._layout_combo.currentIndexChanged.connect(lambda: self._mark_modified())
        form.addRow("界面布局:", self._layout_combo)

        self._font_size_spin = QSpinBox()
        self._font_size_spin.setRange(8, 48)
        self._font_size_spin.setSuffix(" px")
        self._font_size_spin.setValue(13)
        self._font_size_spin.valueChanged.connect(lambda _: self._mark_modified())
        form.addRow("字体大小:", self._font_size_spin)
        self._original_font_size = 13

        hint = QLabel("字体大小需要重启应用后生效")
        hint.setStyleSheet(f"color:{theme_color('hint')}; font-size:11px; padding-left:4px;")
        form.addRow(hint)

        layout.addWidget(group)
        layout.addStretch()
        return page

    def _create_tools_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        group = QGroupBox("工具与高级配置")
        group_layout = QVBoxLayout(group)
        group_layout.setSpacing(8)

        self._tool_buttons = []

        tools = [
            ("工作流配置", self._open_workflow_config),
            ("关键词模板配置", self._open_keyword_template_config),
            ("规则引擎配置", self._open_rule_config),
            ("游戏规则验证", self._open_rule_validation),
            ("备份管理", self._open_backup_manager),
            ("清理未使用图片", self._cleanup_images),
        ]

        for label, callback in tools:
            btn = QPushButton(label)
            btn.clicked.connect(callback)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self._tool_buttons.append(btn)
            group_layout.addWidget(btn)

        layout.addWidget(group)
        layout.addStretch()
        return page

    # ── load / save ──────────────────────────────────────

    def _load_current_values(self):
        if not self._mw:
            return

        config = getattr(self._mw, 'config', None)

        current_lang = get_i18n().locale
        idx = self._lang_combo.findData(current_lang)
        if idx >= 0:
            self._lang_combo.setCurrentIndex(idx)
        self._original_lang = current_lang

        current_theme = get_current_theme()
        idx = self._theme_combo.findText(current_theme)
        if idx >= 0:
            self._theme_combo.setCurrentIndex(idx)
        self._original_theme = current_theme

        self._auto_save_check.setChecked(
            getattr(self._mw, 'auto_save_enabled', True)
        )
        raw_interval = getattr(self._mw, 'auto_save_interval', 300000)
        self._auto_save_spin.setValue(max(1, raw_interval // 60000))

        if config:
            self._confirm_delete_check.setChecked(getattr(config, 'confirm_delete', True))

        layout_mode = "three_column"
        idx = self._layout_combo.findData(layout_mode)
        if idx >= 0:
            self._layout_combo.setCurrentIndex(idx)
        self._original_layout = layout_mode

        # 字体大小：从 config 加载（首次无 config 时为默认 13）
        if config:
            cfg_font_size = getattr(config, 'font_size', 13)
            try:
                cfg_font_size = int(cfg_font_size)
            except (ValueError, TypeError):
                cfg_font_size = 13
            self._font_size_spin.setValue(max(8, min(48, cfg_font_size)))
            self._original_font_size = self._font_size_spin.value()

        if config:
            self._txt_provider.setCurrentText(getattr(config, 'provider', 'OpenAI'))
            self._txt_api_key.setText(getattr(config, 'api_key', ''))
            self._txt_base_url.setText(getattr(config, 'base_url', ''))
            self._txt_model.setText(getattr(config, 'model', ''))
            self._txt_temperature.setValue(getattr(config, 'temperature', 0.7))
            self._txt_max_tokens.setValue(getattr(config, 'max_tokens', 1000))

            self._vis_provider.setCurrentText(getattr(config, 'vision_provider', ''))
            self._vis_api_key.setText(getattr(config, 'vision_api_key', ''))
            self._vis_base_url.setText(getattr(config, 'vision_base_url', ''))
            self._vis_model.setText(getattr(config, 'vision_model', ''))
            self._vis_temperature.setValue(getattr(config, 'vision_temperature', 0.7))
            self._vis_max_tokens.setValue(getattr(config, 'vision_max_tokens', 2048))

            self._img_provider.setCurrentText(getattr(config, 'image_provider', ''))
            self._img_api_key.setText(getattr(config, 'image_api_key', ''))
            self._img_base_url.setText(getattr(config, 'image_base_url', ''))
            self._img_model.setText(getattr(config, 'image_model', ''))

        self._modified = False
        self._on_auto_save_toggled(self._auto_save_check.isChecked())

    def _mark_modified(self):
        self._modified = True

    # ── previews ─────────────────────────────────────────

    def _preview_theme(self, theme_name):
        if self._mw and hasattr(self._mw, 'change_theme'):
            self._mw.change_theme(theme_name)
            self._apply_theme_styles()
        self._mark_modified()

    def _on_auto_save_toggled(self, checked):
        self._auto_save_spin.setEnabled(checked)
        self._mark_modified()

    # ── accept / reject ──────────────────────────────────

    def _on_accept(self):
        self._apply_settings()
        self.accept()

    def reject(self):
        self._restore_original_state()
        super().reject()

    def _restore_original_state(self):
        if not self._mw:
            return
        if hasattr(self, '_original_theme'):
            current = get_current_theme()
            if current != self._original_theme:
                self._mw.change_theme(self._original_theme)

    # ── apply ────────────────────────────────────────────

    def _apply_settings(self):
        if not self._mw:
            return

        config = getattr(self._mw, 'config', None)

        new_lang = self._lang_combo.currentData()
        if new_lang and new_lang != getattr(self, '_original_lang', new_lang):
            get_i18n().set_locale(new_lang)

        self._mw.auto_save_enabled = self._auto_save_check.isChecked()
        self._mw.auto_save_interval = self._auto_save_spin.value() * 60000
        if hasattr(self._mw, 'start_auto_save'):
            if hasattr(self._mw, 'auto_save_timer'):
                self._mw.auto_save_timer.stop()
            self._mw.start_auto_save()

        if config:
            config.confirm_delete = self._confirm_delete_check.isChecked()

        layout_mode = self._layout_combo.currentData()
        if layout_mode != getattr(self, '_original_layout', layout_mode):
            if hasattr(self._mw, 'set_layout'):
                self._mw.set_layout(layout_mode)

        if config:
            config.provider = self._txt_provider.currentText()
            config.api_key = self._txt_api_key.text()
            config.base_url = self._txt_base_url.text()
            config.model = self._txt_model.text()
            config.temperature = self._txt_temperature.value()
            config.max_tokens = self._txt_max_tokens.value()

            config.vision_provider = self._vis_provider.currentText()
            config.vision_api_key = self._vis_api_key.text()
            config.vision_base_url = self._vis_base_url.text()
            config.vision_model = self._vis_model.text()
            config.vision_temperature = self._vis_temperature.value()
            config.vision_max_tokens = self._vis_max_tokens.value()

            config.image_provider = self._img_provider.currentText()
            config.image_api_key = self._img_api_key.text()
            config.image_base_url = self._img_base_url.text()
            config.image_model = self._img_model.text()

            # 字体大小（需要重启生效）
            new_font_size = self._font_size_spin.value()
            if new_font_size != getattr(config, 'font_size', 13):
                config.font_size = new_font_size

            if hasattr(config, 'save_api_config'):
                config.save_api_config()

    # ── tool launchers ───────────────────────────────────

    def _test_text_connection(self):
        self._txt_test_result.setText("⏳ 测试中...")
        self._txt_test_result.setVisible(True)

        import json
        import urllib.request

        base_url = self._txt_base_url.text().rstrip('/')
        api_key = self._txt_api_key.text()
        model = self._txt_model.text().strip()

        if not base_url or not api_key:
            self._txt_test_result.setText("❌ 请填写 Base URL 和 API Key")
            return

        endpoint = f"{base_url}/chat/completions"

        payload = json.dumps({
            "model": model or "gpt-3.5-turbo",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 5,
        }).encode('utf-8')

        req = urllib.request.Request(endpoint, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {api_key}')

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:  # nosec B310
                result = json.loads(resp.read())
                if 'choices' in result:
                    self._txt_test_result.setText("✅ 连接成功")
                elif 'error' in result:
                    self._txt_test_result.setText(f"❌ {result['error'].get('message', '未知错误')}")
                else:
                    self._txt_test_result.setText("⚠ 响应格式异常")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read())
                msg = body.get('error', {}).get('message', str(e))
            except Exception:
                msg = str(e)
            self._txt_test_result.setText(f"❌ HTTP {e.code}: {msg}")
        except Exception as e:
            self._txt_test_result.setText(f"❌ 连接失败: {e}")

    def _open_workflow_config(self):
        from features.advanced import show_workflow_config
        show_workflow_config(self._mw)

    def _open_keyword_template_config(self):
        from features.advanced import show_keyword_template_config
        show_keyword_template_config(self._mw)

    def _open_rule_config(self):
        from features.advanced import show_rule_config
        show_rule_config(self._mw)

    def _open_rule_validation(self):
        from features.advanced import show_rule_validation
        show_rule_validation(self._mw)

    def _open_backup_manager(self):
        from features.backup import show_backup_manager
        show_backup_manager(self._mw)

    def _cleanup_images(self):
        from features.advanced import cleanup_unused_images
        cleanup_unused_images(self._mw)
