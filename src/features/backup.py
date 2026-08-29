"""备份管理功能模块"""
import json
from pathlib import Path
from typing import Any

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QMainWindow

from common.logger import get_logger


def show_backup_manager(main_window: QMainWindow) -> None:
    """显示备份管理器

    Args:
        main_window: 主窗口实例
    """
    from ui.dialogs import BackupManagerDialog
    dialog = BackupManagerDialog(main_window, main_window)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def export_for_game(data_manager: Any, file_path: Path) -> bool:
    """导出适合游戏工程读取的数据

    Args:
        data_manager: 数据管理器
        file_path: 导出文件路径

    Returns:
        是否成功导出
    """
    logger = get_logger()
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data_manager.data, f, ensure_ascii=False, indent=2)
        logger.info(f"导出游戏数据: {file_path}")
        return True
    except Exception as e:
        logger.error(f"导出游戏数据失败: {e}", exc_info=True)
        return False
