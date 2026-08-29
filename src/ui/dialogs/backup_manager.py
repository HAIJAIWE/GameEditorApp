"""备份管理对话框"""
from datetime import datetime
import json
from pathlib import Path

from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QAbstractItemView, QDialog, QHBoxLayout, QListWidget, QMessageBox, QPushButton, QVBoxLayout

from common.logger import get_logger
from config.settings import get_config


class BackupManagerDialog(QDialog):
    """备份管理对话框"""

    def __init__(self, main_window, parent=None):
        """初始化备份对话框

        Args:
            main_window: 主窗口实例
            parent: 父窗口
        """
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.main_window = main_window
        self.config = get_config()
        self.logger = get_logger()
        self.setup_ui()
        self.load_backups()

    def setup_ui(self):
        """设置UI"""
        self.setWindowTitle("备份管理")
        self.setMinimumSize(600, 400)

        layout = QVBoxLayout(self)

        self.backup_list = QListWidget()
        self.backup_list.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        layout.addWidget(self.backup_list)

        button_layout = QHBoxLayout()

        create_btn = QPushButton("创建备份")
        create_btn.clicked.connect(self.create_backup)
        button_layout.addWidget(create_btn)

        restore_btn = QPushButton("恢复备份")
        restore_btn.clicked.connect(self.restore_backup)
        button_layout.addWidget(restore_btn)

        delete_btn = QPushButton("删除备份")
        delete_btn.clicked.connect(self.delete_backup)
        button_layout.addWidget(delete_btn)

        button_layout.addStretch()

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)

        layout.addLayout(button_layout)

    def load_backups(self):
        """加载备份列表"""
        self.backup_list.clear()

        backup_files: list[tuple[float, Path]] = []
        if self.config.backup_dir.exists():
            for file_path in self.config.backup_dir.glob("*.json"):
                mtime = file_path.stat().st_mtime
                backup_files.append((mtime, file_path))

        backup_files.sort(reverse=True, key=lambda x: x[0])

        for mtime, file_path in backup_files:
            timestamp = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
            self.backup_list.addItem(f"{timestamp} - {file_path.name}")

    def create_backup(self):
        """创建备份"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = self.config.backup_dir / f"backup_{timestamp}.json"

            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(self.main_window.data_manager.data, f, ensure_ascii=False, indent=2)

            self.load_backups()
            QMessageBox.information(self, "成功", "备份创建成功")
            self.logger.info(f"创建备份: {backup_file}")
        except Exception as e:
            self.logger.error(f"创建备份失败: {e}", exc_info=True)
            QMessageBox.warning(self, "错误", f"创建备份失败: {e}")

    def restore_backup(self):
        """恢复备份"""
        current_item = self.backup_list.currentItem()
        if not current_item:
            QMessageBox.information(self, "提示", "请选择要恢复的备份")
            return

        backup_info = current_item.text()
        backup_name = backup_info.split(' - ')[1]
        backup_path = self.config.backup_dir / backup_name

        reply = QMessageBox.question(
            self, "确认", f"确定要恢复备份 {backup_name} 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            try:
                with open(backup_path, encoding='utf-8') as f:
                    backup_data = json.load(f)

                self.main_window.data_manager.data = backup_data
                # 重建 ID 索引 + ID 计数器（修复仅 update_id_counters 导致的索引脱节）
                self.main_window.data_manager._rebuild_index_and_counters()
                for key in self.main_window.data_manager.data:
                    self.main_window.data_manager._invalidate_cache(key)
                self.main_window._refresh_all_tabs()

                QMessageBox.information(self, "成功", "备份恢复成功")
                self.logger.info(f"恢复备份: {backup_path}")
                self.accept()
            except Exception as e:
                self.logger.error(f"恢复备份失败: {e}", exc_info=True)
                QMessageBox.warning(self, "错误", "恢复备份失败，请检查备份文件格式")

    def delete_backup(self):
        """删除备份"""
        current_item = self.backup_list.currentItem()
        if not current_item:
            QMessageBox.information(self, "提示", "请选择要删除的备份")
            return

        backup_info = current_item.text()
        backup_name = backup_info.split(' - ')[1]
        backup_path = self.config.backup_dir / backup_name

        reply = QMessageBox.question(
            self, "确认", f"确定要删除备份 {backup_name} 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            try:
                backup_path.unlink()
                self.load_backups()
                QMessageBox.information(self, "成功", "备份删除成功")
                self.logger.info(f"删除备份: {backup_path}")
            except Exception as e:
                self.logger.error(f"删除备份失败: {e}", exc_info=True)
                QMessageBox.warning(self, "错误", f"删除备份失败: {e}")
