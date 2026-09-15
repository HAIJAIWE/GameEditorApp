from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, cast

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog,
    QInputDialog,
    QMainWindow,
    QMessageBox,
    QWidget,
)

from common.logger import get_logger
from config.settings import get_config

logger = get_logger()


class _AIImageWorkerThread(QThread):
    """AI 图片生成 + 下载线程 — 避免 UI 阻塞

    发射两种信号：
    - progress(str)：阶段性进度提示
    - finished(bool, str, str)：(success, message, image_path)
    """
    progress = pyqtSignal(str)
    finished = pyqtSignal(bool, str, str)

    def __init__(self, description: str):
        super().__init__()
        self.description = description

    def run(self):
        try:
            config = get_config()
            if not config.enabled:
                self.finished.emit(False, "API 未启用", "")
                return

            self.progress.emit("正在生成图片...")

            from common.ai_client import generate_image as ai_generate_image
            success, result = ai_generate_image(config, self.description)
            if not success:
                self.finished.emit(False, f"图片生成失败：{result}", "")
                return

            image_url = result
            self.progress.emit("图片生成成功，正在下载...")

            image_path = _download_and_save_image_sync(image_url, self.description)
            if image_path:
                logger.info(f"AI图片生成成功: {image_path}")
                self.finished.emit(True, "图片生成成功", str(image_path))
            else:
                self.finished.emit(False, "图片下载失败", "")
        except Exception as e:
            logger.error(f"AI图片生成异常: {e}", exc_info=True)
            self.finished.emit(False, "图片生成过程中发生错误", "")


def _download_and_save_image_sync(image_url: str, description: str) -> Optional[Path]:
    """同步下载图片并保存（在工作线程中调用）"""
    from datetime import datetime

    import requests

    config = get_config()

    try:
        safe_name = "".join(c for c in description[:50] if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_name = safe_name.replace(' ', '_')
        if not safe_name:
            safe_name = "ai_generated"

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{safe_name}_{timestamp}.png"
        save_path = config.assets_dir / filename

        config.assets_dir.mkdir(parents=True, exist_ok=True)

        response = requests.get(image_url, timeout=60)
        response.raise_for_status()

        with open(save_path, 'wb') as f:
            f.write(response.content)

        return save_path
    except Exception as e:
        get_logger().error(f"下载图片失败: {e}", exc_info=True)
        return None


def show_dialog_select(main_window: QMainWindow) -> Optional[str]:
    """显示对话选择 — 从当前数据源选择一条 dialog 数据

    Returns:
        选中的对话ID
    """
    data_manager = getattr(main_window, 'data_manager', None)
    all_data = getattr(data_manager, 'data', None) or {}
    dialogs = all_data.get('dialogs', [])

    if not dialogs:
        QMessageBox.information(main_window, "提示", "没有可用的对话数据")
        return None

    from PyQt6.QtWidgets import QDialog, QHBoxLayout, QListWidget, QPushButton, QVBoxLayout
    dlg = QDialog(main_window)
    dlg.setWindowTitle("选择对话")
    dlg.setMinimumSize(400, 300)

    layout = QVBoxLayout(dlg)
    list_widget = QListWidget()
    for d in dialogs:
        name = d.get('name', d.get('id', '未命名'))
        list_widget.addItem(f"{d.get('id', '?')} — {name}")
    layout.addWidget(list_widget)

    btn_row = QHBoxLayout()
    ok_btn = QPushButton("确定")
    cancel_btn = QPushButton("取消")
    result_id = [None]

    def on_ok():
        row = list_widget.currentRow()
        if row >= 0:
            result_id[0] = dialogs[row].get('id', '')
        dlg.accept()

    ok_btn.clicked.connect(on_ok)
    cancel_btn.clicked.connect(dlg.reject)
    btn_row.addStretch()
    btn_row.addWidget(ok_btn)
    btn_row.addWidget(cancel_btn)
    layout.addLayout(btn_row)

    if dlg.exec() and result_id[0]:
        return result_id[0]
    return None


def generate_ai_image(main_window: QMainWindow, description: str = "") -> Optional[str]:
    """
    AI图片生成（异步线程版，不阻塞 UI）

    Args:
        main_window: 主窗口实例
        description: 图片描述（可选）

    Returns:
        生成的图片路径或None（异步执行，返回值仅表示是否成功启动）
    """
    config = get_config()
    logger = get_logger()

    if not config.enabled:
        QMessageBox.information(main_window, "提示", "请先在设置中启用API并配置API Key")
        return None

    if not description:
        QMessageBox.warning(main_window, "提示", "请提供图片描述")
        return None

    # 显示非模态进度对话框（不阻塞 UI）
    from PyQt6.QtWidgets import QProgressDialog
    progress = QProgressDialog("正在生成图片...", None, 0, 0, main_window)
    progress.setWindowTitle("AI图片生成")
    progress.setWindowModality(Qt.WindowModality.ApplicationModal)
    progress.setMinimumDuration(0)
    progress.setCancelButton(None)
    progress.show()

    # 持有引用避免被 GC
    state: dict[str, Any] = {"thread": None, "path": None}

    def on_progress(msg: str):
        progress.setLabelText(msg)

    def on_finished(success: bool, message: str, image_path: str):
        progress.close()
        if success and image_path:
            QMessageBox.information(main_window, "成功", f"图片生成成功！\n\n保存路径：{image_path}")
            state["path"] = image_path
        else:
            QMessageBox.warning(main_window, "失败", message)
            logger.error(f"AI图片生成失败: {message}")
        # 退出对话循环（如果还在 exec）
        # 注意：generate_ai_image 不调用 exec，直接返回

    thread = _AIImageWorkerThread(description)
    thread.progress.connect(on_progress)
    thread.finished.connect(on_finished)
    thread.start()
    state["thread"] = thread

    # 由于是异步，外部调用者拿到 None 时应理解为已启动
    return None


def download_and_save_image(image_url: str, description: str) -> Optional[Path]:
    """
    下载图片并保存到本地（向后兼容包装）

    Args:
        image_url: 图片URL
        description: 图片描述（用于生成文件名）

    Returns:
        保存的图片路径或None
    """
    return _download_and_save_image_sync(image_url, description)


def show_ai_image_dialog(main_window: QMainWindow, data_type: str = "", item_name: str = "") -> Optional[str]:
    """
    显示AI图片生成对话框

    Args:
        main_window: 主窗口实例
        data_type: 数据类型（用于生成更合适的描述）
        item_name: 物品名称（用于生成更合适的描述）

    Returns:
        生成的图片路径
    """
    # 构建默认描述
    default_description = f"{item_name or '未命名物品'}的图片"
    if data_type:
        type_names = {
            "skill": "技能",
            "role": "角色",
            "monster": "怪物",
            "equip": "装备",
            "item": "道具"
        }
        type_name = type_names.get(data_type, "")
        if type_name and item_name:
            default_description = f"游戏{type_name}「{item_name}」的图片"

    # 让用户输入或编辑描述
    description, ok = QInputDialog.getMultiLineText(
        main_window,
        "AI图片生成",
        "请描述要生成的图片：",
        default_description
    )

    if ok and description:
        return generate_ai_image(main_window, description)

    return None


def apply_desc_template(form_widget: QWidget, data_type: str, template_text: str) -> Optional[str]:
    """应用描述模板

    Args:
        form_widget: 表单组件
        data_type: 数据类型
        template_text: 模板文本

    Returns:
        生成的描述
    """
    return template_text


def generate_desc_only(form_widget: QWidget, data_type: str) -> Optional[str]:
    """只生成描述

    Args:
        form_widget: 表单组件
        data_type: 数据类型

    Returns:
        生成的描述
    """
    config = get_config()
    if not config.enabled:
        QMessageBox.information(form_widget, "提示", "AI描述生成功能需要配置API密钥并启用API")
        return None
    if config.provider != "Ollama" and not config.api_key:
        QMessageBox.information(form_widget, "提示", "AI描述生成功能需要配置API密钥")
        return None

    context_parts = [f"数据类型：{data_type}"]

    if hasattr(form_widget, 'get_form_data'):
        try:
            form_data = form_widget.get_form_data()
            if form_data:
                for key, value in form_data.items():
                    if value and key not in ('desc', 'description', 'image', 'id'):
                        context_parts.append(f"{key}：{value}")
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    context = "\n".join(context_parts)

    prompt = f"""【角色】
你是一位游戏文案创作专家，擅长用精炼、有感染力的中文写出令人印象深刻的游戏描述。

【上下文】
用户正在为奇幻RPG游戏制作{data_type}数据，需要一段专业描述。

【指令】
根据以下信息生成一段描述：

{context}

【风格要求】
- 50-100字，精炼有力
- 有画面感和代入感，让读者能在脑海中"看到"这个{data_type}
- 突出核心特点和定位，避免套话（不要用"非常强大""独一无二"等空洞形容词）
- 如果是角色/怪物，暗示其性格或行为模式
- 如果是技能/装备/道具，强调其独特效果和使用场景
- 只输出描述文本，不要加任何前缀说明

【输出】
直接输出中文描述文本，不要用引号包裹。"""

    from features._ai_dialog import AIGenerateDialog

    dialog = AIGenerateDialog(form_widget, initial_prompt=prompt, data_type=data_type)
    if dialog.exec() == QDialog.DialogCode.Accepted:
        return dialog.get_result()
    return None


def generate_image(form_widget: QWidget, data_type: str) -> Optional[str]:
    """生成图片

    Args:
        form_widget: 表单组件
        data_type: 数据类型

    Returns:
        图片文件名
    """
    # 获取当前编辑的数据
    try:
        if hasattr(form_widget, 'current_data'):
            item_name = form_widget.current_data.get('name', '')
        else:
            item_name = ""
    except Exception:
        item_name = ""

    return show_ai_image_dialog(cast(QMainWindow, form_widget.window()), data_type, item_name)


def auto_generate_image_info(name: str, data_type: str) -> dict[str, str]:
    """自动生成图片信息（预留）

    Args:
        name: 名称
        data_type: 数据类型

    Returns:
        包含描述和标签的字典
    """
    return {}
