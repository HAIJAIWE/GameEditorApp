"""API配置对话框"""
import json
from pathlib import Path

from PyQt6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QDialog,
    QDoubleSpinBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.settings import get_config
from ui.dialogs.auto_input_dialog import show_text_input_dialog
from ui.themes import theme_color

logger = get_logger()
from PyQt6.QtGui import QFont

# 预设模型配置
MODEL_PRESETS = {
    "Ollama": {
        "models": [
            "qwen2.5:7b",
            "qwen2.5:14b",
            "qwen3:8b",
            "llama3.1:8b",
            "mistral:7b",
            "deepseek-r1:8b",
        ],
        "base_url": "http://localhost:11434/v1",
        "vision_models": [
            "minicpm-v:8b",
            "llava:7b",
            "llava:13b",
            "moondream:1.8b",
            "llama3.2-vision:11b",
            "bakllava",
        ],
    },
    "OpenAI": {
        "models": [
            "gpt-3.5-turbo",
            "gpt-4",
            "gpt-4-turbo",
            "gpt-4o"
        ],
        "base_url": "https://api.openai.com/v1"
    },
    "豆包": {
        "models": [
            "ep-20250421182357-69kjm",
            "doubao-pro-32k",
            "doubao-pro-128k",
            "doubao-lite-32k"
        ],
        "base_url": "https://ark.cn-beijing.volces.com/api/v3"
    },
    "Qwen": {
        "models": [
            "qwen-turbo",
            "qwen-plus",
            "qwen-max",
            "qwen-long",
            "qvq-max-2025-03-25"
        ],
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"
    },
    "Claude": {
        "models": [
            "claude-3-haiku-20240307",
            "claude-3-sonnet-20240229",
            "claude-3-opus-20240229",
            "claude-3-5-sonnet-20240620"
        ],
        "base_url": "https://api.anthropic.com/v1"
    },
    "DeepSeek": {
        "models": [
            "deepseek-chat",
            "deepseek-coder"
        ],
        "base_url": "https://api.deepseek.com/v1"
    }
}


class APIConfigDialog(QDialog):
    """API配置对话框"""

    def __init__(self, parent=None):
        """初始化对话框
        
        Args:
            parent: 父窗口
        """
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.config = get_config()
        self.custom_models = self._load_custom_models()
        self.setup_ui()
        self.load_config()
        self.setWindowTitle("API配置")
        self.setMinimumSize(700, 600)

    def _load_custom_models(self):
        """加载自定义模型
        
        Returns:
            自定义模型列表
        """
        try:
            custom_path = Path("data") / "custom_models.json"
            if custom_path.exists():
                with open(custom_path, encoding='utf-8') as f:
                    return json.load(f)
        except Exception:
            logger.exception("自定义模型列表加载失败")
        return []

    def _save_custom_models(self):
        """保存自定义模型"""
        try:
            data_path = Path("data")
            data_path.mkdir(exist_ok=True)
            custom_path = data_path / "custom_models.json"
            with open(custom_path, 'w', encoding='utf-8') as f:
                json.dump(self.custom_models, f, ensure_ascii=False, indent=2)
        except Exception as e:
            QMessageBox.critical(self, "错误", f"保存自定义模型失败: {str(e)}")

    def setup_ui(self):
        """设置UI"""
        main_layout = QVBoxLayout(self)

        # 标签页
        tabs = QTabWidget()

        # 基础设置
        basic_tab = QWidget()
        self.setup_basic_tab(basic_tab)
        tabs.addTab(basic_tab, "基础设置")

        # 模型管理
        model_tab = QWidget()
        self.setup_model_tab(model_tab)
        tabs.addTab(model_tab, "模型管理")

        # 视觉模型
        vision_tab = QWidget()
        self.setup_vision_tab(vision_tab)
        tabs.addTab(vision_tab, "视觉模型")

        # 模板设置
        template_tab = QWidget()
        self.setup_template_tab(template_tab)
        tabs.addTab(template_tab, "模板设置")

        main_layout.addWidget(tabs)

        # 按钮
        button_layout = QHBoxLayout()
        self.test_button = QPushButton("测试连接")
        self.test_button.clicked.connect(self.test_connection)
        button_layout.addWidget(self.test_button)

        button_layout.addStretch()

        self.save_button = QPushButton("保存")
        self.save_button.clicked.connect(self.save_config)
        self.save_button.setDefault(True)
        button_layout.addWidget(self.save_button)

        self.cancel_button = QPushButton("取消")
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_button)

        main_layout.addLayout(button_layout)

    def setup_basic_tab(self, parent):
        """设置基础设置标签页"""
        layout = QVBoxLayout(parent)

        # 服务商选择
        provider_group = QGroupBox("服务商选择")
        provider_layout = QFormLayout(provider_group)

        self.provider_combo = QComboBox()
        self.provider_combo.addItems(MODEL_PRESETS.keys())
        self.provider_combo.currentTextChanged.connect(self.on_provider_changed)
        provider_layout.addRow("API服务:", self.provider_combo)

        self.enabled_checkbox = QCheckBox("启用API")
        provider_layout.addRow("", self.enabled_checkbox)

        layout.addWidget(provider_group)

        # API设置
        api_group = QGroupBox("API设置")
        api_layout = QFormLayout(api_group)

        self.api_key_edit = QLineEdit()
        self.api_key_edit.setPlaceholderText("请输入API Key")
        self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        api_layout.addRow("API Key:", self.api_key_edit)

        self.base_url_edit = QLineEdit()
        api_layout.addRow("接口地址:", self.base_url_edit)

        layout.addWidget(api_group)

        # 模型设置
        model_group = QGroupBox("模型设置")
        model_layout = QFormLayout(model_group)

        self.model_combo = QComboBox()
        self.model_combo.setEditable(True)
        model_layout.addRow("模型:", self.model_combo)

        self.temp_spin = QDoubleSpinBox()
        self.temp_spin.setRange(0.0, 2.0)
        self.temp_spin.setSingleStep(0.1)
        self.temp_spin.setValue(0.7)
        model_layout.addRow("温度:", self.temp_spin)

        self.max_tokens_spin = QSpinBox()
        self.max_tokens_spin.setRange(1, 32000)
        self.max_tokens_spin.setValue(1000)
        model_layout.addRow("最大令牌:", self.max_tokens_spin)

        layout.addWidget(model_group)

        layout.addStretch()

    def setup_model_tab(self, parent):
        """设置模型管理标签页"""
        layout = QVBoxLayout(parent)

        # 自定义模型列表
        list_group = QGroupBox("自定义模型")
        list_layout = QVBoxLayout(list_group)

        button_layout = QHBoxLayout()
        add_btn = QPushButton("添加模型")
        add_btn.clicked.connect(self.add_custom_model)
        button_layout.addWidget(add_btn)

        edit_btn = QPushButton("编辑模型")
        edit_btn.clicked.connect(self.edit_custom_model)
        button_layout.addWidget(edit_btn)

        delete_btn = QPushButton("删除模型")
        delete_btn.clicked.connect(self.delete_custom_model)
        button_layout.addWidget(delete_btn)

        list_layout.addLayout(button_layout)

        self.custom_model_list = QListWidget()
        self.custom_model_list.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        list_layout.addWidget(self.custom_model_list)

        layout.addWidget(list_group)

        # 说明
        help_label = QLabel("提示：自定义模型会显示在模型下拉菜单中")
        help_label.setStyleSheet(f"color: {theme_color('hint')};")
        layout.addWidget(help_label)

        layout.addStretch()

        self.refresh_custom_model_list()

    def setup_vision_tab(self, parent):
        """设置视觉模型标签页"""
        layout = QVBoxLayout(parent)

        enable_group = QGroupBox("启用视觉模型")
        enable_layout = QHBoxLayout(enable_group)
        self.vision_enabled_checkbox = QCheckBox("启用视觉分析（截图识别、UI分析等）")
        self.vision_enabled_checkbox.toggled.connect(self._on_vision_enabled_changed)
        enable_layout.addWidget(self.vision_enabled_checkbox)
        layout.addWidget(enable_group)

        vision_provider_group = QGroupBox("视觉服务商")
        vision_provider_layout = QFormLayout(vision_provider_group)

        self.vision_provider_combo = QComboBox()
        self.vision_provider_combo.addItem("跟随主模型（使用上方配置）", "inherit")
        self.vision_provider_combo.addItem("Ollama（本地）", "Ollama")
        self.vision_provider_combo.addItem("OpenAI", "OpenAI")
        self.vision_provider_combo.addItem("豆包", "豆包")
        self.vision_provider_combo.addItem("Qwen", "Qwen")
        self.vision_provider_combo.currentIndexChanged.connect(self._on_vision_provider_changed)
        vision_provider_layout.addRow("服务商:", self.vision_provider_combo)

        layout.addWidget(vision_provider_group)

        vision_config_group = QGroupBox("视觉模型配置")
        self._vision_config_layout = QFormLayout(vision_config_group)

        self.vision_model_combo = QComboBox()
        self.vision_model_combo.setEditable(True)
        self._vision_config_layout.addRow("视觉模型:", self.vision_model_combo)

        self.vision_base_url_edit = QLineEdit()
        self.vision_base_url_edit.setPlaceholderText("http://localhost:11434/v1")
        self._vision_config_layout.addRow("接口地址:", self.vision_base_url_edit)

        self.vision_api_key_edit = QLineEdit()
        self.vision_api_key_edit.setPlaceholderText("Ollama本地无需填写")
        self.vision_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self._vision_config_layout.addRow("API Key:", self.vision_api_key_edit)

        self.vision_temp_spin = QDoubleSpinBox()
        self.vision_temp_spin.setRange(0.0, 2.0)
        self.vision_temp_spin.setSingleStep(0.1)
        self.vision_temp_spin.setValue(0.7)
        self._vision_config_layout.addRow("温度:", self.vision_temp_spin)

        self.vision_max_tokens_spin = QSpinBox()
        self.vision_max_tokens_spin.setRange(1, 32000)
        self.vision_max_tokens_spin.setValue(2048)
        self._vision_config_layout.addRow("最大令牌:", self.vision_max_tokens_spin)

        layout.addWidget(vision_config_group)

        help_label = QLabel(
            "💡 视觉模型用于截图分析、UI识别等。\n"
            "• 选择「跟随主模型」时，使用上方基础设置中的模型\n"
            "• 推荐本地 Ollama: minicpm-v:8b（中文好）或 moondream:1.8b（超轻量）\n"
            "• 云端可选: gpt-4o、qwen-vl-max 等"
        )
        help_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; padding: 8px;")
        layout.addWidget(help_label)

        layout.addStretch()

        self._on_vision_provider_changed(0)

    def _on_vision_enabled_changed(self, enabled):
        self.vision_provider_combo.setEnabled(enabled)
        self.vision_model_combo.setEnabled(enabled)
        self.vision_base_url_edit.setEnabled(enabled)
        self.vision_api_key_edit.setEnabled(enabled)
        self.vision_temp_spin.setEnabled(enabled)
        self.vision_max_tokens_spin.setEnabled(enabled)

    def _on_vision_provider_changed(self, index):
        provider_key = self.vision_provider_combo.currentData()
        if provider_key == "inherit":
            self.vision_model_combo.clear()
            self.vision_model_combo.addItem("（使用主模型）")
            self.vision_base_url_edit.setText("")
            self.vision_base_url_edit.setEnabled(False)
            self.vision_api_key_edit.setEnabled(False)
            return

        self.vision_base_url_edit.setEnabled(True)
        self.vision_api_key_edit.setEnabled(True)

        preset = MODEL_PRESETS.get(provider_key, {})
        base_url = preset.get("base_url", "")
        if base_url:
            self.vision_base_url_edit.setText(base_url)

        self.vision_model_combo.clear()
        vision_models = preset.get("vision_models", preset.get("models", []))
        for model in vision_models:
            self.vision_model_combo.addItem(model)
        if not vision_models:
            self.vision_model_combo.addItem("gpt-4o")

    def setup_template_tab(self, parent):
        """设置模板配置标签页"""
        layout = QVBoxLayout(parent)

        # 技能默认模板模式
        mode_group = QGroupBox("技能生成 — 默认模板模式")
        mode_layout = QFormLayout(mode_group)

        self.skill_default_mode = QComboBox()
        self.skill_default_mode.addItem("⚔️ 角色模板 — 基于角色职业生成专属技能", "角色模板")
        self.skill_default_mode.addItem("👹 怪物模板 — 基于怪物行为生成专属技能", "怪物模板")
        self.skill_default_mode.addItem("🛡️ 装备模板 — 基于装备机制设计技能", "装备模板")
        self.skill_default_mode.addItem("📦 通用模板 — 基于策划方案设计通用技能", "通用模板")
        mode_layout.addRow("默认模式:", self.skill_default_mode)

        layout.addWidget(mode_group)

        # 模板行为选项
        behavior_group = QGroupBox("模板行为")
        behavior_layout = QFormLayout(behavior_group)

        self.auto_open_template_checkbox = QCheckBox("打开AI生成时自动弹出模板选择")
        self.auto_open_template_checkbox.setChecked(True)
        behavior_layout.addRow("", self.auto_open_template_checkbox)

        self.remember_last_checkbox = QCheckBox("记住上次选择的模板")
        self.remember_last_checkbox.setChecked(True)
        behavior_layout.addRow("", self.remember_last_checkbox)

        self.show_hint_checkbox = QCheckBox("显示模板详情提示框")
        self.show_hint_checkbox.setChecked(True)
        behavior_layout.addRow("", self.show_hint_checkbox)

        layout.addWidget(behavior_group)

        # 自定义系统提示词前缀
        prefix_group = QGroupBox("自定义系统提示词（追加到所有AI请求）")
        prefix_layout = QVBoxLayout(prefix_group)

        prefix_label = QLabel(
            "以下内容会自动追加到每次 AI 生成的 System Prompt 中。\n"
            "可用于注入全局约束，如世界观、数值规则、命名风格等。\n"
            "留空则不添加。"
        )
        prefix_label.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px;")
        prefix_layout.addWidget(prefix_label)

        self.system_prefix_edit = QTextEdit()
        self.system_prefix_edit.setMaximumHeight(100)
        self.system_prefix_edit.setPlaceholderText(
            "示例：\n"
            "- 世界观：奇幻RPG，元素体系为火/冰/雷/暗/光\n"
            "- 数值规则：伤害范围在ATK的0.5-3倍\n"
            "- 命名风格：中文四字成语或古风名称"
        )
        prefix_layout.addWidget(self.system_prefix_edit)

        layout.addWidget(prefix_group)

        # 说明
        help_text = QLabel(
            "💡 提示：\n"
            "• 「参考模板」按钮仅在「技能」标签页显示，其他类型使用「参考策划」\n"
            "• 模板选择后点击「AI生成」会自动将选中项的属性注入 Prompt\n"
            "• 系统提示词前缀对所有数据类型的 AI 生成生效"
        )
        help_text.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; padding: 8px;")
        layout.addWidget(help_text)

        layout.addStretch()

    def on_provider_changed(self, provider):
        """服务商变化时更新选项"""
        preset = MODEL_PRESETS.get(provider, {})

        # 更新Base URL
        base_url = preset.get("base_url", "")
        if base_url:
            self.base_url_edit.setText(base_url)

        # 更新模型列表
        self.model_combo.clear()

        # 添加预设模型
        for model in preset.get("models", []):
            self.model_combo.addItem(model)

        # 添加自定义模型
        for model in self.custom_models:
            self.model_combo.addItem(model)

    def add_custom_model(self):
        """添加自定义模型"""
        name, ok = show_text_input_dialog(
            self, "添加自定义模型",
            "请输入模型名称:"
        )

        if ok and name:
            name = name.strip()
            if name and name not in self.custom_models:
                self.custom_models.append(name)
                self.refresh_custom_model_list()
                self._save_custom_models()
                # 重新加载模型列表
                self.on_provider_changed(self.provider_combo.currentText())
                QMessageBox.information(self, "成功", f"模型 '{name}' 已添加")

    def edit_custom_model(self):
        """编辑自定义模型"""
        current_item = self.custom_model_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "警告", "请先选择一个模型")
            return

        old_name = current_item.text()
        new_name, ok = show_text_input_dialog(
            self, "编辑模型",
            "请输入新的模型名称:",
            default_text=old_name
        )

        if ok and new_name and new_name != old_name:
            new_name = new_name.strip()
            if new_name and new_name not in self.custom_models:
                index = self.custom_models.index(old_name)
                self.custom_models[index] = new_name
                self.refresh_custom_model_list()
                self._save_custom_models()
                # 重新加载模型列表
                self.on_provider_changed(self.provider_combo.currentText())
                QMessageBox.information(self, "成功", f"模型已更新为 '{new_name}'")

    def delete_custom_model(self):
        """删除自定义模型"""
        current_item = self.custom_model_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "警告", "请先选择一个模型")
            return

        name = current_item.text()
        reply = QMessageBox.question(
            self, "确认删除",
            f"确定要删除模型 '{name}' 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            self.custom_models.remove(name)
            self.refresh_custom_model_list()
            self._save_custom_models()
            # 重新加载模型列表
            self.on_provider_changed(self.provider_combo.currentText())
            QMessageBox.information(self, "成功", f"模型 '{name}' 已删除")

    def refresh_custom_model_list(self):
        """刷新自定义模型列表"""
        self.custom_model_list.clear()
        for model in self.custom_models:
            self.custom_model_list.addItem(model)

    def load_config(self):
        """加载配置"""
        self.enabled_checkbox.setChecked(self.config.enabled)
        self.api_key_edit.setText(self.config.api_key)
        self.base_url_edit.setText(self.config.base_url)

        # 设置服务商
        provider = self.config.provider
        index = self.provider_combo.findText(provider)
        if index >= 0:
            self.provider_combo.setCurrentIndex(index)

        # 这会自动填充模型列表
        self.on_provider_changed(provider)

        # 设置当前模型
        current_model = self.config.model
        if current_model:
            # 尝试找到并设置模型
            index = self.model_combo.findText(current_model)
            if index >= 0:
                self.model_combo.setCurrentIndex(index)
            else:
                self.model_combo.setEditText(current_model)

        self.temp_spin.setValue(self.config.temperature)
        self.max_tokens_spin.setValue(self.config.max_tokens)

        self.vision_enabled_checkbox.setChecked(self.config.vision_enabled)
        vp = self.config.vision_provider
        for i in range(self.vision_provider_combo.count()):
            if self.vision_provider_combo.itemData(i) == vp:
                self.vision_provider_combo.setCurrentIndex(i)
                break
        if self.config.vision_model:
            idx = self.vision_model_combo.findText(self.config.vision_model)
            if idx >= 0:
                self.vision_model_combo.setCurrentIndex(idx)
            else:
                self.vision_model_combo.setEditText(self.config.vision_model)
        self.vision_base_url_edit.setText(self.config.vision_base_url)
        self.vision_api_key_edit.setText(self.config.vision_api_key)
        self.vision_temp_spin.setValue(self.config.vision_temperature)
        self.vision_max_tokens_spin.setValue(self.config.vision_max_tokens)

        # 加载模板设置
        template_settings = getattr(self.config, 'template_settings', {})
        default_mode = template_settings.get('skill_default_mode', '通用模板')
        idx = self.skill_default_mode.findData(default_mode)
        if idx >= 0:
            self.skill_default_mode.setCurrentIndex(idx)
        self.auto_open_template_checkbox.setChecked(template_settings.get('auto_open_template', True))
        self.remember_last_checkbox.setChecked(template_settings.get('remember_last', True))
        self.show_hint_checkbox.setChecked(template_settings.get('show_hint', True))
        prefix = template_settings.get('system_prefix', '')
        self.system_prefix_edit.setPlainText(prefix)

    def save_config(self):
        """保存配置"""
        try:
            self.config.enabled = self.enabled_checkbox.isChecked()
            self.config.api_key = self.api_key_edit.text()
            self.config.base_url = self.base_url_edit.text()
            self.config.provider = self.provider_combo.currentText()
            self.config.model = self.model_combo.currentText()
            self.config.temperature = self.temp_spin.value()
            self.config.max_tokens = self.max_tokens_spin.value()

            self.config.vision_enabled = self.vision_enabled_checkbox.isChecked()
            vp_data = self.vision_provider_combo.currentData()
            self.config.vision_provider = vp_data if vp_data != "inherit" else ""
            self.config.vision_model = self.vision_model_combo.currentText()
            self.config.vision_base_url = self.vision_base_url_edit.text()
            self.config.vision_api_key = self.vision_api_key_edit.text()
            self.config.vision_temperature = self.vision_temp_spin.value()
            self.config.vision_max_tokens = self.vision_max_tokens_spin.value()

            # 保存模板设置
            self.config.template_settings = {
                'skill_default_mode': self.skill_default_mode.currentData() or '通用模板',
                'auto_open_template': self.auto_open_template_checkbox.isChecked(),
                'remember_last': self.remember_last_checkbox.isChecked(),
                'show_hint': self.show_hint_checkbox.isChecked(),
                'system_prefix': self.system_prefix_edit.toPlainText(),
            }

            # 保存本地模型设置
            self.config.save_api_config()
            QMessageBox.information(self, "成功", "API配置已保存")
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, "错误", f"保存失败: {str(e)}")

    def test_connection(self):
        """测试API连接"""
        api_key = self.api_key_edit.text()
        provider = self.provider_combo.currentText()

        if provider != "Ollama" and not api_key:
            QMessageBox.warning(self, "警告", "请先填写API Key")
            return

        try:
            # 先保存当前配置（临时保存）
            temp_enabled = self.config.enabled
            temp_api_key = self.config.api_key
            temp_base_url = self.config.base_url
            temp_provider = self.config.provider
            temp_model = self.config.model

            self.config.api_key = api_key
            self.config.base_url = self.base_url_edit.text()
            self.config.provider = self.provider_combo.currentText()
            self.config.model = self.model_combo.currentText()

            # 调用测试
            from common.ai_client import test_api_connection
            success, message = test_api_connection(self.config)

            # 恢复配置
            self.config.enabled = temp_enabled
            self.config.api_key = temp_api_key
            self.config.base_url = temp_base_url
            self.config.provider = temp_provider
            self.config.model = temp_model

            if success:
                QMessageBox.information(self, "成功", f"连接测试成功！\n{message}")
            else:
                QMessageBox.warning(self, "失败", f"连接测试失败！\n{message}")

        except ImportError:
            QMessageBox.information(
                self, "提示",
                "测试功能需要API调用实现\n请确保网络连接正常\nAPI配置已可以使用!"
            )
        except Exception as e:
            QMessageBox.warning(self, "错误", f"测试连接时出错: {str(e)}")

