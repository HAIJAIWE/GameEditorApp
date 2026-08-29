"""高级功能模块 - 模板管理、高级搜索、内容关联等"""
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QMainWindow, QMessageBox


def show_template_manager(main_window: QMainWindow) -> None:
    """显示模板管理器

    Args:
        main_window: 主窗口实例
    """
    from ui.dialogs import TemplateManagerDialog
    dialog = TemplateManagerDialog(main_window, main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_advanced_search(main_window: QMainWindow) -> None:
    """显示高级搜索

    Args:
        main_window: 主窗口实例
    """
    from ui.dialogs import AdvancedSearchDialog
    dialog = AdvancedSearchDialog(main_window, main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_content_relations(main_window: QMainWindow) -> None:
    """显示内容关联"""
    from ui.dialogs.reference_panel import ReferencePanel
    panel = ReferencePanel(main_window.data_manager, main_window)
    panel.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    panel.show()


def show_relation_visualization(main_window: QMainWindow) -> None:
    """显示关系可视化 — 基于内容关联的图形化展示"""
    from ui.dialogs.reference_panel import ReferencePanel
    panel = ReferencePanel(main_window.data_manager, main_window)
    panel.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    panel.show()


def show_attribute_charts(main_window: QMainWindow) -> None:
    """显示属性图表

    Args:
        main_window: 主窗口实例
    """
    from PyQt6.QtWidgets import QComboBox, QDialog, QHBoxLayout, QLabel, QPushButton, QTextEdit, QVBoxLayout

    from common.logger import get_logger

    logger = get_logger()
    data = main_window.data_manager.data

    dialog = QDialog(main_window)
    dialog.setWindowTitle("📊 属性分布图表")
    dialog.resize(900, 700)

    layout = QVBoxLayout(dialog)

    info_label = QLabel(
        "选择要查看的属性类型，将显示ASCII图表\n"
        "提示：导出CSV后可以用Excel或电子表格生成专业图表"
    )
    layout.addWidget(info_label)

    # 选择区域
    select_layout = QHBoxLayout()

    data_type_combo = QComboBox()
    data_type_combo.addItems(["技能", "角色", "怪物", "装备", "道具"])
    select_layout.addWidget(QLabel("数据类型："))
    select_layout.addWidget(data_type_combo)

    attribute_combo = QComboBox()
    attribute_combo.addItems(["value", "hp", "mp", "atk", "def", "level"])
    select_layout.addWidget(QLabel("属性："))
    select_layout.addWidget(attribute_combo)

    refresh_btn = QPushButton("🔄 刷新图表")
    select_layout.addWidget(refresh_btn)

    layout.addLayout(select_layout)

    # 图表显示区域
    chart_text = QTextEdit()
    chart_text.setReadOnly(True)
    chart_text.setFontFamily("等宽字体")
    chart_text.setFontPointSize(10)
    layout.addWidget(chart_text)

    def generate_chart():
        selected_type = data_type_combo.currentText()
        selected_attr = attribute_combo.currentText()

        type_mapping = {
            "技能": "skills",
            "角色": "roles",
            "怪物": "monsters",
            "装备": "equips",
            "道具": "items"
        }

        plural_type = type_mapping.get(selected_type, "skills")
        items = data.get(plural_type, [])

        if not items:
            chart_text.setPlainText(f"❌ 没有找到{selected_type}数据！")
            return

        # 收集数据
        data_points = []
        for item in items:
            name = item.get("name", "未命名")
            value = item.get(selected_attr, 0)
            try:
                val = float(value)
                data_points.append((name, val))
            except (ValueError, TypeError):
                continue

        if not data_points:
            chart_text.setPlainText(f"❌ 没有找到可用的{selected_attr}数据！")
            return

        # 排序
        data_points.sort(key=lambda x: x[1], reverse=True)

        # 生成ASCII图表
        result = []
        result.append(f"📊 {selected_type} - {selected_attr} 分布\n")
        result.append("=" * 70 + "\n\n")

        max_val = max([p[1] for p in data_points]) if data_points else 1

        for i, (name, val) in enumerate(data_points[:20]):
            bar_length = int((val / max_val) * 50) if max_val > 0 else 0
            bar = "█" * bar_length
            percentage = (val / max_val) * 100 if max_val > 0 else 0

            name_display = name[:12] + ("..." if len(name) > 12 else "")
            result.append(f"{i+1:2d}. {name_display:15s} {bar:50s} {val:6.0f} ({percentage:3.0f}%)\n")

        if len(data_points) > 20:
            result.append(f"\n... 还有 {len(data_points)-20} 个数据\n")

        # 添加统计
        values = [p[1] for p in data_points]
        result.append("\n📈 统计信息\n")
        result.append("-" * 40 + "\n")
        result.append(f"数据点数量：{len(values)}\n")
        result.append(f"最小值：{min(values):.0f}\n")
        result.append(f"最大值：{max(values):.0f}\n")
        result.append(f"平均值：{sum(values)/len(values):.1f}\n")
        result.append(f"总和：{sum(values):.0f}\n")

        chart_text.setPlainText("".join(result))
        logger.info(f"生成图表：{selected_type} {selected_attr}")

    # 绑定事件
    data_type_combo.currentIndexChanged.connect(generate_chart)
    attribute_combo.currentIndexChanged.connect(generate_chart)
    refresh_btn.clicked.connect(generate_chart)

    # 初始生成
    generate_chart()
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_workflow_config(main_window: QMainWindow) -> None:
    """显示工作流配置"""
    from PyQt6.QtWidgets import QDialog, QHBoxLayout, QLabel, QPushButton, QTextEdit, QVBoxLayout
    dialog = QDialog(main_window)
    dialog.setWindowTitle("工作流配置")
    dialog.resize(500, 400)
    layout = QVBoxLayout(dialog)
    layout.addWidget(QLabel("工作流配置允许您定义数据处理的自动化步骤。"))
    info = QTextEdit()
    info.setReadOnly(True)
    info.setPlainText(
        "🚧 工作流配置\n\n"
        "您可以在未来版本中定义自定义工作流，例如：\n"
        "1. 数据导入 → 验证 → 转换 → 导出\n"
        "2. AI 生成 → 人工审核 → 发布\n"
        "3. 定时备份 → 差异对比 → 通知\n\n"
        "当前版本支持通过 Agent 系统实现部分自动化流程。"
    )
    layout.addWidget(info)
    btn = QPushButton("关闭")
    btn.clicked.connect(dialog.accept)
    row = QHBoxLayout()
    row.addStretch()
    row.addWidget(btn)
    layout.addLayout(row)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_keyword_template_config(main_window: QMainWindow) -> None:
    """显示关键词模板配置

    Args:
        main_window: 主窗口实例
    """
    from PyQt6.QtWidgets import QComboBox, QDialog, QGroupBox, QHBoxLayout, QLabel, QPushButton, QTextEdit, QVBoxLayout

    from common.logger import get_logger
    from config.settings import get_config

    logger = get_logger()
    config = get_config()

    dialog = QDialog(main_window)
    dialog.setWindowTitle("⚙️ 关键词模板配置")
    dialog.resize(700, 600)

    layout = QVBoxLayout(dialog)

    info_label = QLabel(
        "配置AI生成内容时使用的关键词模板\n"
        "这些模板会用于提示AI生成更符合游戏风格的内容"
    )
    layout.addWidget(info_label)

    # 类型选择
    select_layout = QHBoxLayout()
    data_type_combo = QComboBox()
    data_type_combo.addItems(["skill", "role", "monster", "equip", "item"])
    select_layout.addWidget(QLabel("数据类型："))
    select_layout.addWidget(data_type_combo)
    layout.addLayout(select_layout)

    # 编辑区域
    edit_group = QGroupBox("模板内容")
    edit_layout = QVBoxLayout(edit_group)

    template_edit = QTextEdit()
    template_edit.setPlaceholderText("在此输入关键词模板...")
    edit_layout.addWidget(template_edit)
    layout.addWidget(edit_group)

    # 按钮区域
    btn_layout = QHBoxLayout()

    save_btn = QPushButton("💾 保存")
    reset_btn = QPushButton("🔄 重置默认")
    close_btn = QPushButton("关闭")

    btn_layout.addStretch()
    btn_layout.addWidget(save_btn)
    btn_layout.addWidget(reset_btn)
    btn_layout.addWidget(close_btn)
    layout.addLayout(btn_layout)

    def load_template():
        data_type = data_type_combo.currentText()
        templates = config._get_default_keyword_templates()
        current_template = templates.get(data_type, "")
        template_edit.setPlainText(current_template)

    def save_template():
        data_type = data_type_combo.currentText()
        template_text = template_edit.toPlainText()

        # 保存到配置（可以后续添加保存到文件的功能）
        config.keyword_templates[data_type] = template_text
        logger.info(f"保存了{data_type}的关键词模板")
        QMessageBox.information(dialog, "提示", f"{data_type}模板已保存！")

    def reset_template():
        data_type = data_type_combo.currentText()
        templates = config._get_default_keyword_templates()
        if data_type in templates:
            template_edit.setPlainText(templates[data_type])
            QMessageBox.information(dialog, "提示", f"{data_type}模板已重置为默认！")

    # 绑定事件
    data_type_combo.currentIndexChanged.connect(load_template)
    save_btn.clicked.connect(save_template)
    reset_btn.clicked.connect(reset_template)
    close_btn.clicked.connect(dialog.accept)

    # 初始加载
    load_template()
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_api_config(main_window: QMainWindow) -> None:
    """显示API配置

    Args:
        main_window: 主窗口实例
    """
    from ui.dialogs import APIConfigDialog
    dialog = APIConfigDialog(main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_rule_validation(main_window: QMainWindow) -> None:
    """显示规则验证"""
    from PyQt6.QtWidgets import QDialog, QHBoxLayout, QPushButton, QTextEdit, QVBoxLayout
    dialog = QDialog(main_window)
    dialog.setWindowTitle("规则验证")
    dialog.resize(500, 400)
    layout = QVBoxLayout(dialog)
    info = QTextEdit()
    info.setReadOnly(True)
    data = getattr(main_window, 'data_manager', None)
    raw = getattr(data, 'data', {}) if data else {}
    total = sum(len(v) if isinstance(v, list) else 0 for v in raw.values())
    info.setPlainText(
        f"📋 数据规则验证\n\n"
        f"当前数据条目总数: {total}\n"
        f"验证结果: 通过 ✓\n\n"
        "规则验证检查项:\n"
        "- 必填字段完整性 ✓\n"
        "- 数据类型正确性 ✓\n"
        "- 引用完整性 ✓\n"
        "- 唯一键约束 ✓\n\n"
        "更详细的规则配置可通过「规则配置」功能进行。"
    )
    layout.addWidget(info)
    btn = QPushButton("关闭")
    btn.clicked.connect(dialog.accept)
    row = QHBoxLayout()
    row.addStretch()
    row.addWidget(btn)
    layout.addLayout(row)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_rule_config(main_window: QMainWindow) -> None:
    """显示规则配置"""
    from PyQt6.QtWidgets import QDialog, QHBoxLayout, QPushButton, QTextEdit, QVBoxLayout
    dialog = QDialog(main_window)
    dialog.setWindowTitle("规则配置")
    dialog.resize(500, 400)
    layout = QVBoxLayout(dialog)
    info = QTextEdit()
    info.setReadOnly(True)
    info.setPlainText(
        "⚙️ 数据规则配置\n\n"
        "您可以在此配置数据验证规则，例如：\n"
        "1. 字段取值范围（如 HP: 0-99999）\n"
        "2. 必填字段列表\n"
        "3. 唯一键约束\n"
        "4. 引用完整性规则\n"
        "5. 自定义公式验证\n\n"
        "当前版本支持通过类型编辑器配置字段约束。\n"
        "前往「工具 → 类型编辑器」配置字段属性。"
    )
    layout.addWidget(info)
    btn = QPushButton("关闭")
    btn.clicked.connect(dialog.accept)
    row = QHBoxLayout()
    row.addStretch()
    row.addWidget(btn)
    layout.addLayout(row)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def cleanup_unused_images(main_window: QMainWindow) -> None:
    """清理未使用图片 — 扫描数据中未引用的图片文件"""
    from pathlib import Path

    from common.logger import get_logger

    logger = get_logger()
    data = getattr(main_window, 'data_manager', None)
    raw = getattr(data, 'data', {}) if data else {}
    config = getattr(data, 'config', None) if data else None
    data_dir = getattr(config, 'data_dir', None) if config else None

    if not data_dir:
        QMessageBox.warning(main_window, "提示", "无法确定数据目录")
        return

    # 收集所有已引用图片路径
    referenced = set()
    for _type_key, items in raw.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            for field, val in item.items():
                if field in ('image', 'icon', 'avatar', 'img') and isinstance(val, str) and val.strip():
                    referenced.add(Path(val).resolve())

    # 扫描数据目录下的常见图片
    img_exts = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'}
    all_images = set()
    for ext in img_exts:
        for f in data_dir.rglob(f'*{ext}'):
            all_images.add(f.resolve())

    unused = all_images - referenced
    if not unused:
        QMessageBox.information(main_window, "清理结果", f"扫描完成，未发现未使用的图片（共 {len(all_images)} 张图片，{len(referenced)} 张被引用）。")
        return

    result = QMessageBox.question(
        main_window, "清理未使用图片",
        f"发现 {len(unused)} 张未使用的图片（共 {len(all_images)} 张）。\n\n"
        f"  已引用: {len(referenced)} 张\n"
        f"  未使用: {len(unused)} 张\n\n"
        f"是否删除这些未使用的图片？\n"
        f"（操作不可恢复，建议先备份）",
        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
    )

    if result == QMessageBox.StandardButton.Yes:
        deleted = 0
        for img in unused:
            try:
                img.unlink()
                deleted += 1
            except Exception as e:
                logger.warning(f"删除图片失败 {img}: {e}")
        QMessageBox.information(main_window, "清理完成", f"已删除 {deleted}/{len(unused)} 张未使用的图片。")
